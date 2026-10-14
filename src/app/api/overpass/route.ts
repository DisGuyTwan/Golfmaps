import { OverpassHttpError, fetchFromMirrors, parseBBoxParam } from "@/lib/overpass";

/**
 * Cached Overpass lookup. The browser asks this route first; a 200 is cached
 * on Vercel's CDN for a day (and served stale for a week while it refreshes),
 * so a course measured once loads instantly for everyone and keeps working
 * when the free mirrors are busy. Errors are never cached; the browser then
 * falls back to calling the mirrors itself.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const bbox = parseBBoxParam(new URL(request.url).searchParams.get("bbox"));
  if (!bbox) {
    return Response.json({ error: "bbox must be south,west,north,east and at most 0.3° per side" }, { status: 400 });
  }

  try {
    const data = await fetchFromMirrors(bbox, {
      timeoutMs: 25000,
      deadline: Date.now() + 50000,
      headers: { "User-Agent": "Kress acreage tool (https://kress.prodig-e.com)" },
    });
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (err) {
    const status = err instanceof OverpassHttpError ? err.status : 502;
    console.error("[overpass]", JSON.stringify({ bbox, status, error: String(err) }));
    return Response.json(
      { error: "Overpass unavailable", status },
      { status: status === 400 ? 400 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
