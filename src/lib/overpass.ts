import type { BBox } from "./types";

/**
 * Public Overpass API mirrors (all free, no API key). We try them in order:
 * the main instance is frequently overloaded, and when it is it often times
 * out or errors without CORS headers, which the browser reports as a failed
 * request. Failing over to a mirror makes the tool far more reliable.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/**
 * Builds an Overpass QL query that selects a golf course boundary and all of
 * its golf features (fairways, greens, tees, rough, etc.) within the bounding
 * box, then recurses down to their nodes so the geometry can be reconstructed.
 *
 * We deliberately fetch more than just fairways: many courses in OpenStreetMap
 * only have the `leisure=golf_course` outline mapped, so querying for fairways
 * alone returns nothing even when a course is clearly present.
 */
/** What a lookup is for: a golf course, or the hard surfaces on a residential lot. */
export type OverpassQuery = "golf" | "lawn";

function buildFairwayQuery({ south, west, north, east }: BBox): string {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:25];
(
  way["leisure"="golf_course"](${bbox});
  relation["leisure"="golf_course"](${bbox});
  way["golf"](${bbox});
  relation["golf"](${bbox});
  way["natural"="wood"](${bbox});
  relation["natural"="wood"](${bbox});
  way["landuse"="forest"](${bbox});
  relation["landuse"="forest"](${bbox});
  way["natural"="scrub"](${bbox});
  way["natural"="water"](${bbox});
  relation["natural"="water"](${bbox});
  way["building"](${bbox});
  relation["building"](${bbox});
  way["amenity"="parking"](${bbox});
  relation["amenity"="parking"](${bbox});
);
out body;
>;
out skel qt;`;
}

/**
 * Everything on a residential lot that isn't lawn and that OpenStreetMap may
 * have: buildings (house, garage, shed), swimming pools, parking (areas,
 * multipolygons, spaces), paved areas, and service roads mapped as lines
 * (driveways, parking aisles), which lawn.ts widens into strips.
 */
function buildLawnQuery({ south, west, north, east }: BBox): string {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:25];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["leisure"="swimming_pool"](${bbox});
  way["amenity"="parking"](${bbox});
  relation["amenity"="parking"](${bbox});
  way["amenity"="parking_space"](${bbox});
  way["area:highway"](${bbox});
  way["highway"]["area"="yes"](${bbox});
  way["highway"="service"](${bbox});
);
out body;
>;
out skel qt;`;
}

function buildQuery(kind: OverpassQuery, bbox: BBox): string {
  return kind === "lawn" ? buildLawnQuery(bbox) : buildFairwayQuery(bbox);
}

/** Thrown when a mirror answers with an HTTP error (status kept for messages). */
export class OverpassHttpError extends Error {
  constructor(public status: number) {
    super(`Overpass request failed (HTTP ${status})`);
    this.name = "OverpassHttpError";
  }
}

/** Largest scan box the cache route accepts (degrees per side), a whole course with margin. */
const MAX_BBOX_SPAN_DEG = 0.3;

/**
 * "s,w,n,e" rounded to 5 decimals (≈ 1 m). Rounding makes the same course
 * produce the same URL, so the cache route's CDN entry is shared.
 */
export function bboxParam({ south, west, north, east }: BBox): string {
  return [south, west, north, east].map((v) => v.toFixed(5)).join(",");
}

/** Parses and validates a bbox parameter; null when malformed or too large. */
export function parseBBoxParam(value: string | null): BBox | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [south, west, north, east] = parts;
  if (south >= north || west >= east) return null;
  if (south < -90 || north > 90 || west < -180 || east > 180) return null;
  if (north - south > MAX_BBOX_SPAN_DEG || east - west > MAX_BBOX_SPAN_DEG) return null;
  return { south, west, north, east };
}

/** One mirror's part in a hedged lookup, for the route's Server-Timing header and logs. */
export interface MirrorAttempt {
  host: string;
  /** When this mirror was asked, in ms after the lookup began. */
  at: number;
  /** How long it took to answer, fail or be cancelled (ms). */
  ms: number;
  /** "ok", an HTTP status, "timeout", "error", or "cancelled" when another mirror answered first. */
  result: string;
}

/**
 * Hedged requests. Starts the first mirror, then the next one if no answer
 * came within `hedgeMs` (or straight away if a mirror fails), resolves with
 * the first good answer and cancels the rest. A slow mirror then costs
 * seconds, not the whole budget. A 400 (bad or too-large query) fails the
 * same way everywhere, so it rejects at once. Runs on the server (the cache
 * route) and in the browser (when the route is slow or down), so it sticks to
 * one AbortController per request (no AbortSignal.any, missing on older
 * iPads). `signal` cancels the whole lookup; `attempts`, when given, receives
 * one entry per mirror asked.
 */
export function fetchFromMirrorsHedged(
  bbox: BBox,
  {
    hedgeMs = 2500,
    timeoutMs = 50000,
    headers = {} as Record<string, string>,
    endpoints = OVERPASS_ENDPOINTS,
    kind = "golf" as OverpassQuery,
    signal = undefined as AbortSignal | undefined,
    attempts = [] as MirrorAttempt[],
  } = {},
): Promise<unknown> {
  const body = `data=${encodeURIComponent(buildQuery(kind, bbox))}`;
  const started = Date.now();
  const deadline = started + timeoutMs;

  return new Promise((resolve, reject) => {
    const controllers: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const pending = new Set<MirrorAttempt>();
    let next = 0;
    let running = 0;
    let done = false;
    let lastError: unknown = new Error("No Overpass mirror answered");
    let hedge: ReturnType<typeof setTimeout> | undefined;

    const end = (attempt: MirrorAttempt, result: string) => {
      if (!pending.delete(attempt)) return;
      attempt.ms = Date.now() - started - attempt.at;
      attempt.result = result;
    };
    const settle = (finish: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(hedge);
      for (const t of timers) clearTimeout(t);
      for (const a of [...pending]) end(a, "cancelled");
      for (const c of controllers) c.abort();
      signal?.removeEventListener("abort", onAbort);
      finish();
    };
    const onAbort = () => settle(() => reject(new DOMException("Lookup cancelled", "AbortError")));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort);

    const launch = () => {
      clearTimeout(hedge);
      if (done || next >= endpoints.length) return;
      const url = endpoints[next++];
      const attempt: MirrorAttempt = { host: new URL(url).host, at: Date.now() - started, ms: 0, result: "" };
      attempts.push(attempt);
      pending.add(attempt);
      const controller = new AbortController();
      controllers.push(controller);
      let timedOut = false;
      timers.push(
        setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, Math.max(1000, deadline - Date.now())),
      );
      running += 1;
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
        body,
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new OverpassHttpError(response.status);
          return response.json();
        })
        .then((json) => {
          end(attempt, "ok");
          settle(() => resolve(json));
        })
        .catch((err) => {
          if (done) return;
          end(attempt, err instanceof OverpassHttpError ? String(err.status) : timedOut ? "timeout" : "error");
          lastError = err;
          if (err instanceof OverpassHttpError && err.status === 400) return settle(() => reject(err));
          running -= 1;
          if (next < endpoints.length) launch();
          else if (running === 0) settle(() => reject(lastError));
        });
      if (next < endpoints.length) hedge = setTimeout(launch, hedgeMs);
    };

    launch();
  });
}

/** Attempts as a Server-Timing header, so a lookup's mirrors show in the browser's network panel. */
export function serverTiming(attempts: MirrorAttempt[]): string {
  return attempts.map((a, i) => `m${i};desc="${a.host} ${a.result} from ${a.at} ms";dur=${a.ms}`).join(", ");
}

/**
 * How long the browser waits for the cache route to start answering before
 * also asking the mirrors itself. A cached answer starts within a few hundred
 * ms; an uncached one waits on the mirrors, which queue the route's shared
 * server addresses for half a minute (27-33 s measured, even for one house
 * lot), while this browser's own address gets its own place in line.
 */
export const DIRECT_AFTER_MS = 1500;

/**
 * Fetches the golf features for a scan box (or, with kind "lawn", what isn't
 * lawn on a residential lot). Asks this app's cache route first (/api/overpass:
 * shared CDN cache, so a course measured once is instant). If it hasn't
 * started answering within DIRECT_AFTER_MS, or fails, the browser also asks
 * the mirrors directly, and the first answer wins. The route is left to
 * finish, so its answer is cached for next time.
 */
export function fetchFairways(bbox: BBox, kind: OverpassQuery = "golf"): Promise<unknown> {
  const query = kind === "golf" ? "" : `&q=${kind}`;
  return new Promise((resolve, reject) => {
    const direct = new AbortController();
    let done = false;
    let routeFailed = false;
    let directStarted = false;
    let directFailed = false;
    let directError: unknown;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      direct.abort();
      settle();
    };
    const startDirect = () => {
      if (done || directStarted) return;
      directStarted = true;
      fetchFromMirrorsHedged(bbox, { kind, signal: direct.signal }).then(
        (json) => finish(() => resolve(json)),
        (err) => {
          directFailed = true;
          directError = err;
          if (routeFailed) finish(() => reject(err));
        },
      );
    };
    const timer = setTimeout(startDirect, DIRECT_AFTER_MS);

    fetch(`/api/overpass?bbox=${bboxParam(bbox)}${query}`, { signal: AbortSignal.timeout(65000) })
      .then((response) => {
        if (!response.ok) throw new OverpassHttpError(response.status);
        // Answering: the data is ready (a cache hit or a mirror answered), so wait for it.
        clearTimeout(timer);
        return response.json() as Promise<unknown>;
      })
      .then(
        (json) => finish(() => resolve(json)),
        (err) => {
          // Too large or malformed fails the same way directly; don't retry it.
          if (err instanceof OverpassHttpError && err.status === 400) return finish(() => reject(err));
          routeFailed = true;
          if (directFailed) finish(() => reject(directError));
          else startDirect();
        },
      );
  });
}
