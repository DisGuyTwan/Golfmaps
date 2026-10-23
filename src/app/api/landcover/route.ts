import { MAX_SPAN_DEG, fitsSource, type LandGridJson, type LandSource } from "@/lib/landcover";
import { readCropInventory, readWorldCover } from "@/lib/landcover-server";
import { parseBBoxParam } from "@/lib/overpass";

/**
 * Satellite land cover for a box: ESA WorldCover (src=worldcover, grass inside
 * a golf course) or AAFC's Annual Crop Inventory (src=aci, sod fields). The
 * answer is a small class grid (see LandGridJson). The data is yearly, so a
 * 200 stays on Vercel's CDN for 30 days; errors are never cached.
 */
export const maxDuration = 60;

const SOURCES: LandSource[] = ["worldcover", "aci"];

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("src") as LandSource;
  const bbox = parseBBoxParam(params.get("bbox"));
  if (!SOURCES.includes(source) || !bbox || !fitsSource(bbox, source)) {
    return Response.json(
      { error: `src must be worldcover or aci, bbox south,west,north,east within ${JSON.stringify(MAX_SPAN_DEG)}°` },
      { status: 400 },
    );
  }

  try {
    const grid = source === "worldcover" ? await readWorldCover(bbox) : await readCropInventory(bbox);
    const body: LandGridJson = { ...grid, data: Buffer.from(grid.data).toString("base64") };
    return Response.json(body, {
      headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=31536000" },
    });
  } catch (err) {
    console.error("[landcover]", JSON.stringify({ source, bbox, error: String(err) }));
    return Response.json({ error: "Land cover unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
