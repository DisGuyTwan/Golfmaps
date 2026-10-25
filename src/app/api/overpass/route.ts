import {
  OverpassHttpError,
  fetchFromMirrorsHedged,
  isOverpassQuery,
  parseBBoxParam,
  serverTiming,
  type MirrorAttempt,
  type OverpassQuery,
} from "@/lib/overpass";
import { currentArchive, queryArchive } from "@/lib/osm-archive-server";
import type { BBox } from "@/lib/types";

/**
 * Cached Overpass lookup. In Quebec and Ontario it's answered from the
 * nightly OSM archive (osm-archive-server.ts: a few tiles range-read in about
 * a second); elsewhere, or when the archive can't, from the Overpass mirrors.
 * The browser asks this route first; a 200 is cached on Vercel's CDN for a
 * day (and served stale for a week while it refreshes), so a course measured
 * once loads instantly for everyone and keeps working when the free mirrors
 * are busy. Errors are never cached; the browser then falls back to calling
 * the mirrors itself. Each lookup logs where it was answered from and how
 * long each source took (also sent as Server-Timing).
 */
export const maxDuration = 60;

/** How long the archive gets before the mirrors are asked instead (ms). */
const ARCHIVE_MS = 6000;

async function fromArchive(kind: OverpassQuery, bbox: BBox) {
  const archive = await currentArchive();
  return archive ? queryArchive(archive, kind, bbox) : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q");
  const kind: OverpassQuery = isOverpassQuery(q) ? q : "golf";
  const bbox = parseBBoxParam(params.get("bbox"), kind);
  if (!bbox) {
    return Response.json(
      { error: `bbox must be south,west,north,east and at most ${kind === "streets" ? 0.05 : 0.3}° per side` },
      { status: 400 },
    );
  }

  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const archived = await Promise.race([
    fromArchive(kind, bbox),
    new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ARCHIVE_MS))),
  ]).catch((err) => {
    console.warn("[overpass] archive", JSON.stringify({ bbox, kind, error: String(err) }));
    return null;
  });
  clearTimeout(timer);
  const archiveMs = Date.now() - started;
  if (archived) {
    return Response.json(archived, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Server-Timing": `archive;desc="OSM archive";dur=${archiveMs}`,
      },
    });
  }

  const attempts: MirrorAttempt[] = [];
  try {
    const data = await fetchFromMirrorsHedged(bbox, {
      timeoutMs: 50000,
      headers: { "User-Agent": "Prodig-e Calculator (https://calculator.prodig-e.com)" },
      kind,
      attempts,
    });
    console.info("[overpass]", JSON.stringify({ kind, attempts }));
    return Response.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Server-Timing": `archive;desc="no answer";dur=${archiveMs}, ${serverTiming(attempts)}`,
      },
    });
  } catch (err) {
    const status = err instanceof OverpassHttpError ? err.status : 502;
    console.error("[overpass]", JSON.stringify({ bbox, kind, status, error: String(err), attempts }));
    return Response.json(
      { error: "Overpass unavailable", status },
      { status: status === 400 ? 400 : 502, headers: { "Cache-Control": "no-store", "Server-Timing": `archive;desc="no answer";dur=${archiveMs}, ${serverTiming(attempts)}` } },
    );
  }
}
