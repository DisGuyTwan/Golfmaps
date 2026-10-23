import { OverpassHttpError, fetchFromMirrorsHedged, parseBBoxParam, type OverpassQuery } from "@/lib/overpass";

/**
 * Cached Overpass lookup. The browser asks this route first; a 200 is cached
 * on Vercel's CDN for a day (and served stale for a week while it refreshes),
 * so a course measured once loads instantly for everyone and keeps working
 * when the free mirrors are busy. Errors are never cached; the browser then
 * falls back to calling the mirrors itself.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const bbox = parseBBoxParam(params.get("bbox"));
  const kind: OverpassQuery = params.get("q") === "lawn" ? "lawn" : "golf";
  if (!bbox) {
    return Response.json({ error: "bbox must be south,west,north,east and at most 0.3° per side" }, { status: 400 });
  }

  try {
    const data = await fetchFromMirrorsHedged(bbox, {
      hedgeMs: 8000,
      timeoutMs: 50000,
      headers: { "User-Agent": "Prodig-e Calculator (https://calculator.prodig-e.com)" },
      kind,
    });
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (err) {
    const status = err instanceof OverpassHttpError ? err.status : 502;
    console.error("[overpass]", JSON.stringify({ bbox, kind, status, error: String(err) }));
    return Response.json(
      { error: "Overpass unavailable", status },
      { status: status === 400 ? 400 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
