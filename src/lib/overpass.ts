import type { BBox } from "./types";

/**
 * Public Overpass API mirrors (all free, no API key). We try them in order:
 * the main instance is frequently overloaded, and when it is it often times
 * out or errors without CORS headers, which the browser reports as a failed
 * request. Failing over to a mirror makes the tool far more reliable.
 */
export const OVERPASS_ENDPOINTS = [
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
export function buildFairwayQuery({ south, west, north, east }: BBox): string {
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

/** Thrown when a mirror answers with an HTTP error (status kept for messages). */
export class OverpassHttpError extends Error {
  constructor(public status: number) {
    super(`Overpass request failed (HTTP ${status})`);
    this.name = "OverpassHttpError";
  }
}

const REQUEST_TIMEOUT_MS = 30000;
/** Largest scan box the cache route accepts (degrees per side), a whole course with margin. */
export const MAX_BBOX_SPAN_DEG = 0.3;

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

/**
 * POSTs the golf query to each Overpass mirror in turn and returns the raw OSM
 * JSON from the first that answers. The query is sent form-encoded as
 * `data=...` (the endpoint's documented POST format). Used by the browser
 * fallback and by the server cache route.
 */
export async function fetchFromMirrors(
  bbox: BBox,
  { timeoutMs = REQUEST_TIMEOUT_MS, deadline = Infinity, headers = {} as Record<string, string> } = {},
): Promise<unknown> {
  const body = `data=${encodeURIComponent(buildFairwayQuery(bbox))}`;
  let lastError: unknown = new Error("No Overpass mirror was tried");

  for (const url of OVERPASS_ENDPOINTS) {
    if (Date.now() + 1000 > deadline) break;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
        body,
        signal: AbortSignal.timeout(Math.min(timeoutMs, deadline - Date.now())),
      });
      if (!response.ok) throw new OverpassHttpError(response.status);
      return await response.json();
    } catch (err) {
      lastError = err;
      // A bad query fails the same way everywhere; otherwise try the next mirror.
      if (err instanceof OverpassHttpError && err.status === 400) break;
    }
  }

  throw lastError;
}

/**
 * Fetches the golf features for a scan box. Goes through this app's cache
 * route first (/api/overpass: shared CDN cache, so a course measured once is
 * instant and survives busy mirrors), then falls back to calling the mirrors
 * straight from the browser if the route is down or every mirror refused it.
 */
export async function fetchFairways(bbox: BBox): Promise<unknown> {
  try {
    const response = await fetch(`/api/overpass?bbox=${bboxParam(bbox)}`, {
      signal: AbortSignal.timeout(65000),
    });
    if (response.ok) return await response.json();
    // Too large or malformed fails the same way directly; don't retry it.
    if (response.status === 400) throw new OverpassHttpError(400);
  } catch (err) {
    if (err instanceof OverpassHttpError) throw err;
    // Route unreachable or timed out: fall through to the mirrors.
  }
  return fetchFromMirrors(bbox);
}
