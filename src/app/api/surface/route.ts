import { parseBBoxParam } from "@/lib/overpass";
import { SURFACE_MAX_SPAN_DEG, type SurfaceGridJson } from "@/lib/surface";
import { readSurface } from "@/lib/surface-server";

/**
 * Pools and paving (driveways, patios, decks) on a lot, read from the Quebec
 * government's aerial photos and the LiDAR: a small class grid (see
 * SurfaceGridJson). The photos change only when the mosaic is updated, so a
 * 200 stays on Vercel's CDN for 30 days; "no photos here" (outside Quebec)
 * for a day; errors are never cached.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const bbox = parseBBoxParam(new URL(request.url).searchParams.get("bbox"));
  if (!bbox || bbox.north - bbox.south > SURFACE_MAX_SPAN_DEG || bbox.east - bbox.west > SURFACE_MAX_SPAN_DEG) {
    return Response.json({ error: `bbox must be south,west,north,east and at most ${SURFACE_MAX_SPAN_DEG}° per side` }, { status: 400 });
  }
  const started = Date.now();
  try {
    const debug = new URL(request.url).searchParams.get("debug") === "rgb"; // TEMPORARY: tuning on real courses
    const grid = await readSurface(bbox, debug);
    const timing = { "Server-Timing": `surface;dur=${Date.now() - started}` };
    if (!grid) {
      return Response.json({ error: "No aerial photos here" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=86400", ...timing } });
    }
    const body: SurfaceGridJson = {
      bbox: grid.bbox,
      width: grid.width,
      height: grid.height,
      cellM: grid.cellM,
      classes: Buffer.from(grid.classes).toString("base64"),
      ...(grid.rgb ? { rgb: Buffer.from(grid.rgb).toString("base64") } : {}),
    };
    return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=31536000", ...timing } });
  } catch (err) {
    console.error("[surface]", JSON.stringify({ bbox, error: String(err) }));
    return Response.json({ error: "Aerial photos unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
