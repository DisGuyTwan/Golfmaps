import { parseBBoxParam } from "@/lib/overpass";
import { TERRAIN_MAX_SPAN_DEG, type TerrainGridJson } from "@/lib/terrain";
import { readTerrain } from "@/lib/terrain-server";

/**
 * Slope and what stands on the ground (low plants, trees, buildings) for a
 * box, from NRCan's HRDEM LiDAR mosaic: a small lat/lon grid (see
 * TerrainGridJson). The LiDAR doesn't change, so a 200 stays on Vercel's CDN
 * for 30 days; errors are never cached.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const bbox = parseBBoxParam(new URL(request.url).searchParams.get("bbox"));
  if (!bbox || bbox.north - bbox.south > TERRAIN_MAX_SPAN_DEG || bbox.east - bbox.west > TERRAIN_MAX_SPAN_DEG) {
    return Response.json({ error: `bbox must be south,west,north,east and at most ${TERRAIN_MAX_SPAN_DEG}° per side` }, { status: 400 });
  }
  const started = Date.now();
  try {
    const grid = await readTerrain(bbox);
    const body: TerrainGridJson = {
      bbox: grid.bbox,
      width: grid.width,
      height: grid.height,
      cellM: grid.cellM,
      slope: Buffer.from(grid.slope).toString("base64"),
      cover: Buffer.from(grid.cover).toString("base64"),
    };
    return Response.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=31536000",
        "Server-Timing": `hrdem;dur=${Date.now() - started}`,
      },
    });
  } catch (err) {
    console.error("[terrain]", JSON.stringify({ bbox, error: String(err) }));
    return Response.json({ error: "Terrain unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
