import {
  OverpassHttpError,
  fetchFromMirrorsHedged,
  isOverpassQuery,
  parseBBoxParam,
  serverTiming,
  type MirrorAttempt,
  type OverpassQuery,
} from "@/lib/overpass";

/**
 * Cached Overpass lookup. The browser asks this route first; a 200 is cached
 * on Vercel's CDN for a day (and served stale for a week while it refreshes),
 * so a course measured once loads instantly for everyone and keeps working
 * when the free mirrors are busy. Errors are never cached; the browser then
 * falls back to calling the mirrors itself. Each lookup logs which mirrors it
 * asked and how long each took (also sent as Server-Timing).
 */
export const maxDuration = 60;

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
        "Server-Timing": serverTiming(attempts),
      },
    });
  } catch (err) {
    const status = err instanceof OverpassHttpError ? err.status : 502;
    console.error("[overpass]", JSON.stringify({ bbox, kind, status, error: String(err), attempts }));
    return Response.json(
      { error: "Overpass unavailable", status },
      { status: status === 400 ? 400 : 502, headers: { "Cache-Control": "no-store", "Server-Timing": serverTiming(attempts) } },
    );
  }
}
