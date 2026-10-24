/**
 * Server-side reader behind /api/surface: the Quebec government's
 * forest-inventory orthophoto mosaic (MRNF, CC-BY 4.0) as Web Mercator JPEG
 * tiles at zoom 19, decoded with jpeg-js, and the HRDEM LiDAR under the same
 * box (terrain-server.ts) for what stands on the ground. Classification is
 * in surface.ts.
 */
import jpeg from "jpeg-js";
import { classifySurface, latOfY, lonOfX, mercX, mercY, SURFACE_ZOOM, type SurfaceGrid } from "./surface";
import { COVER } from "./terrain";
import { readTerrain } from "./terrain-server";
import type { BBox } from "./types";

const TILES =
  "https://servicesmatriciels.mern.gouv.qc.ca/erdas-iws/ogc/wmts/Inventaire_Ecoforestier/Inventaire_Ecoforestier/default/GoogleMapsCompatibleExt2:epsg:3857";

/** One tile's pixels (RGBA), or null where the mosaic has nothing (a failed fetch, a blank tile). */
async function readTile(z: number, x: number, y: number): Promise<Uint8Array | null> {
  try {
    const response = await fetch(`${TILES}/${z}/${y}/${x}.jpg`, {
      headers: { "User-Agent": "Prodig-e Calculator (https://calculator.prodig-e.com)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const { data, width, height } = jpeg.decode(new Uint8Array(await response.arrayBuffer()), { useTArray: true, formatAsRGBA: true });
    if (width !== 256 || height !== 256) return null;
    // Outside the mosaic tiles come back one flat colour.
    let lo = 255, hi = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      lo = Math.min(lo, data[i], data[i + 1], data[i + 2]);
      hi = Math.max(hi, data[i], data[i + 1], data[i + 2]);
    }
    return hi - lo < 4 ? null : data;
  } catch {
    return null;
  }
}

/** Classes over the box, or null where the photos don't reach. */
export async function readSurface(bbox: BBox): Promise<SurfaceGrid | null> {
  const z = SURFACE_ZOOM;
  const px0 = Math.floor(mercX(bbox.west, z)), px1 = Math.ceil(mercX(bbox.east, z));
  const py0 = Math.floor(mercY(bbox.north, z)), py1 = Math.ceil(mercY(bbox.south, z));
  const width = px1 - px0, height = py1 - py0;
  const tx0 = Math.floor(px0 / 256), tx1 = Math.floor((px1 - 1) / 256);
  const ty0 = Math.floor(py0 / 256), ty1 = Math.floor((py1 - 1) / 256);

  const jobs: Promise<{ tx: number; ty: number; data: Uint8Array | null }>[] = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push(readTile(z, tx, ty).then((data) => ({ tx, ty, data })));
  // The LiDAR for what stands on the ground; without it every pixel counts as open ground.
  const [tiles, terrain] = await Promise.all([Promise.all(jobs), readTerrain(bbox).catch(() => null)]);

  const rgb = new Uint8Array(width * height * 3);
  const valid = new Uint8Array(width * height);
  let any = false;
  for (const { tx, ty, data } of tiles) {
    if (!data) continue;
    for (let y = Math.max(py0, ty * 256); y < Math.min(py1, ty * 256 + 256); y++) {
      for (let x = Math.max(px0, tx * 256); x < Math.min(px1, tx * 256 + 256); x++) {
        const s = ((y - ty * 256) * 256 + (x - tx * 256)) * 4;
        const d = (y - py0) * width + (x - px0);
        rgb[3 * d] = data[s];
        rgb[3 * d + 1] = data[s + 1];
        rgb[3 * d + 2] = data[s + 2];
        valid[d] = 1;
        any = true;
      }
    }
  }
  if (!any) return null;

  const box = { west: lonOfX(px0, z), east: lonOfX(px1, z), north: latOfY(py0, z), south: latOfY(py1, z) };
  let ground: Uint8Array | null = null;
  if (terrain) {
    ground = new Uint8Array(width * height);
    const t = terrain;
    for (let y = 0; y < height; y++) {
      const lat = latOfY(py0 + y + 0.5, z);
      const r = Math.floor(((t.bbox.north - lat) / (t.bbox.north - t.bbox.south)) * t.height);
      for (let x = 0; x < width; x++) {
        const lon = lonOfX(px0 + x + 0.5, z);
        const c = Math.floor(((lon - t.bbox.west) / (t.bbox.east - t.bbox.west)) * t.width);
        const cover = r >= 0 && r < t.height && c >= 0 && c < t.width ? t.cover[r * t.width + c] : COVER.none;
        // Only crowns and roofs are ruled out: a car or a hedge the LiDAR caught may be gone from the photo (or be
        // parked on the driveway), and the two weren't flown the same year.
        ground[y * width + x] = cover === COVER.tree || cover === COVER.building ? 0 : 1;
      }
    }
  }
  const cellM = (156543.03392 / 2 ** z) * Math.cos((((box.north + box.south) / 2) * Math.PI) / 180);
  return { bbox: box, width, height, cellM, classes: classifySurface({ rgb, width, height, cellM, valid, open: ground }) };
}
