/**
 * Server-side readers behind /api/landcover. Neither source can be read from
 * the browser (the WorldCover bucket sends no CORS headers, and the crop map
 * is a government ArcGIS service), so the route reads them and the CDN keeps
 * each window: the land cover only changes once a year.
 */
import { fromArrayBuffer, fromUrl } from "geotiff";
import { ACI_SOD, type LandGrid } from "./landcover";
import type { BBox } from "./types";

const RAD = Math.PI / 180;

/* ESA WorldCover 2021 (v200): 3° × 3° Cloud Optimized GeoTIFFs on AWS, 10 m
 * cells (1/12000°) aligned on whole degrees, named by their south-west corner. */
const WC_YEAR = 2021;
const WC_PER_DEG = 12000;
const WC_BASE = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map";

/** "N45W075" for the tile whose south-west corner is (45, -75). */
export function worldCoverTileName(lat: number, lon: number): string {
  const ns = `${lat >= 0 ? "N" : "S"}${String(Math.abs(lat)).padStart(2, "0")}`;
  const ew = `${lon >= 0 ? "E" : "W"}${String(Math.abs(lon)).padStart(3, "0")}`;
  return `${ns}${ew}`;
}

/** One tile's window, or null when the tile doesn't exist (open ocean). */
async function readWorldCoverWindow(name: string, window: [number, number, number, number]) {
  const url = `${WC_BASE}/ESA_WorldCover_10m_2021_v200_${name}_Map.tif`;
  try {
    const image = await (await fromUrl(url)).getImage();
    const [band] = await image.readRasters({ window, interleave: false });
    return band as Uint8Array;
  } catch (err) {
    const head = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (head?.status === 404) return null;
    throw err;
  }
}

/** WorldCover classes for the box, stitched across tiles when it straddles one. */
export async function readWorldCover(bbox: BBox): Promise<LandGrid> {
  // Global cell indices: columns from 180° W, rows from 90° N.
  const col0 = Math.floor((bbox.west + 180) * WC_PER_DEG);
  const col1 = Math.ceil((bbox.east + 180) * WC_PER_DEG);
  const row0 = Math.floor((90 - bbox.north) * WC_PER_DEG);
  const row1 = Math.ceil((90 - bbox.south) * WC_PER_DEG);
  const width = col1 - col0;
  const height = row1 - row0;
  const data = new Uint8Array(width * height);

  const reads: Promise<void>[] = [];
  for (let lat = Math.floor(bbox.south / 3) * 3; lat <= Math.floor(bbox.north / 3) * 3; lat += 3) {
    for (let lon = Math.floor(bbox.west / 3) * 3; lon <= Math.floor(bbox.east / 3) * 3; lon += 3) {
      const tileCol0 = (lon + 180) * WC_PER_DEG;
      const tileRow0 = (90 - (lat + 3)) * WC_PER_DEG;
      const c0 = Math.max(col0, tileCol0);
      const c1 = Math.min(col1, tileCol0 + 3 * WC_PER_DEG);
      const r0 = Math.max(row0, tileRow0);
      const r1 = Math.min(row1, tileRow0 + 3 * WC_PER_DEG);
      if (c0 >= c1 || r0 >= r1) continue;
      reads.push(
        readWorldCoverWindow(worldCoverTileName(lat, lon), [c0 - tileCol0, r0 - tileRow0, c1 - tileCol0, r1 - tileRow0]).then(
          (band) => {
            if (!band) return;
            const w = c1 - c0;
            for (let r = r0; r < r1; r++) {
              data.set(band.subarray((r - r0) * w, (r - r0 + 1) * w), (r - row0) * width + (c0 - col0));
            }
          },
        ),
      );
    }
  }
  await Promise.all(reads);

  return {
    source: "worldcover",
    year: WC_YEAR,
    bbox: {
      west: col0 / WC_PER_DEG - 180,
      east: col1 / WC_PER_DEG - 180,
      north: 90 - row0 / WC_PER_DEG,
      south: 90 - row1 / WC_PER_DEG,
    },
    width,
    height,
    data,
  };
}

/* Agriculture and Agri-Food Canada, Annual Crop Inventory: one ArcGIS
 * ImageServer per year, 30 m cells in a Lambert projection. exportImage
 * resamples it (nearest neighbour, so classes stay classes) onto a 15 m
 * latitude/longitude grid, fine enough that field edges follow the pixels. */

/** Newest first: a year is published the spring after it's flown. Add the next one when AAFC releases it. */
export const ACI_YEARS = [2025, 2024];
const ACI_HOSTS = ["https://agriculture.canada.ca", "https://www.agr.gc.ca"];
const ACI_CELL_M = 15;
/** The service's colour for sod, in case it answers with a rendered image instead of class values. */
const ACI_SOD_RGB = [181, 251, 5];

export function cropInventoryUrl(host: string, year: number, bbox: BBox, width: number, height: number): string {
  const params = new URLSearchParams({
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north].join(","),
    bboxSR: "4326",
    imageSR: "4326",
    size: `${width},${height}`,
    format: "tiff",
    pixelType: "U8",
    interpolation: "RSP_NearestNeighbor",
    renderingRule: JSON.stringify({ rasterFunction: "None" }),
    f: "image",
  });
  return `${host}/imagery-images/rest/services/annual_crop_inventory/${year}/ImageServer/exportImage?${params}`;
}

/** Class values from the returned TIFF (or sod / not sod from a rendered RGB one). */
export async function decodeCropTiff(buffer: ArrayBuffer): Promise<{ width: number; height: number; data: Uint8Array }> {
  const image = await (await fromArrayBuffer(buffer)).getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const bands = (await image.readRasters({ interleave: false })) as unknown as ArrayLike<number>[];
  if (bands.length >= 3) {
    const [r, g, b] = bands;
    const data = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) {
      const sod = r[i] === ACI_SOD_RGB[0] && g[i] === ACI_SOD_RGB[1] && b[i] === ACI_SOD_RGB[2];
      data[i] = sod ? ACI_SOD : 0;
    }
    return { width, height, data };
  }
  return { width, height, data: Uint8Array.from(bands[0]) };
}

/** Crop inventory classes for the box, from the newest year the service answers for. */
export async function readCropInventory(bbox: BBox, fetchImpl: typeof fetch = fetch): Promise<LandGrid> {
  const cellLat = ACI_CELL_M / 111_320;
  const cellLon = cellLat / Math.cos(((bbox.north + bbox.south) / 2) * RAD);
  const height = Math.max(1, Math.round((bbox.north - bbox.south) / cellLat));
  const width = Math.max(1, Math.round((bbox.east - bbox.west) / cellLon));

  let lastError: unknown = new Error("No crop inventory year answered");
  for (const year of ACI_YEARS) {
    for (const host of ACI_HOSTS) {
      try {
        const response = await fetchImpl(cropInventoryUrl(host, year, bbox, width, height), {
          headers: { "User-Agent": "Prodig-e Calculator (https://calculator.prodig-e.com)" },
          signal: AbortSignal.timeout(12000),
        });
        const type = response.headers.get("content-type") ?? "";
        // ArcGIS reports errors (missing year, bad parameter) as JSON or HTML with a 200.
        if (!response.ok || type.includes("json") || type.includes("html")) {
          lastError = new Error(`Crop inventory ${year} at ${host}: HTTP ${response.status} ${type}`);
          continue;
        }
        const grid = await decodeCropTiff(await response.arrayBuffer());
        return { source: "aci", year, bbox, ...grid };
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError;
}
