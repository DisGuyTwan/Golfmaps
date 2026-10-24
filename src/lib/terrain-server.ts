/**
 * Server-side reader behind /api/terrain: NRCan's HRDEM 1 m mosaic (LiDAR
 * bare earth "dtm" and surface "dsm") on AWS, one Cloud Optimized BigTIFF per
 * 500 km tile in EPSG:3979, 512 px LZW tiles, overviews at 2, 4, 8 and 16 m.
 *
 * geotiff.js would read each file's whole tile index first (about 15 MB per
 * file), so this reads just the parts a box needs: the header once per
 * instance, then the few index entries and tiles under the box. A lot costs
 * a few hundred kB.
 */
import { getDecoder } from "geotiff";
import { coverClasses, slopePct, terrainCellM, toLambert, toLatLonGrid, type NativeRaster, type TerrainGrid } from "./terrain";
import type { BBox } from "./types";

const BASE = "https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-mosaic-1m";

/** The mosaic's tiles, from its mosaic_tile_index.geojson: id, west, south, east, north (km, EPSG:3979). */
const TILES: [string, number, number, number, number][] = [
  ["1_3", -2500, 0, -2000, 500], ["1_4", -2500, 500, -2000, 1000], ["1_5", -2500, 1000, -2000, 1500],
  ["1_6", -2500, 1500, -2000, 2000], ["1_7", -2500, 2000, -2000, 2500], ["2_3", -2000, 0, -1500, 500],
  ["2_4", -2000, 500, -1500, 1000], ["2_5", -2000, 1000, -1500, 1500], ["2_6", -2000, 1500, -1500, 2000],
  ["2_7", -2000, 2000, -1500, 2500], ["2_8", -2000, 2500, -1500, 3000], ["3_3", -1500, 0, -1000, 500],
  ["3_4", -1500, 500, -1000, 1000], ["3_5", -1500, 1000, -1000, 1500], ["3_6", -1500, 1500, -1000, 2000],
  ["3_7", -1500, 2000, -1000, 2500], ["3_8", -1500, 2500, -1000, 3000], ["4_3", -1000, 0, -500, 500],
  ["4_4", -1000, 500, -500, 1000], ["4_5", -1000, 1000, -500, 1500], ["4_6", -1000, 1500, -500, 2000],
  ["4_7", -1000, 2000, -500, 2500], ["4_8", -1000, 2500, -500, 3000], ["4_9", -1000, 3000, -500, 3500],
  ["5_3", -500, -50, 0, 500], ["5_4", -500, 500, 0, 1000], ["5_5", -500, 1000, 0, 1500],
  ["5_6", -500, 1500, 0, 2000], ["5_7", -500, 2000, 0, 2500], ["5_8", -500, 2500, 0, 3000],
  ["5_9", -500, 3000, 0, 3500], ["6_2", 0, -500, 500, 0], ["6_3", 0, 0, 500, 500],
  ["6_4", 0, 500, 500, 1000], ["6_5", 0, 1000, 500, 1500], ["6_6", 0, 1500, 500, 2000],
  ["6_7", 0, 2000, 500, 2500], ["6_8", 0, 2500, 500, 3000], ["6_9", 0, 3000, 500, 3500],
  ["6_10", -50, 3500, 550, 4000], ["7_2", 500, -500, 1000, 0], ["7_3", 500, 0, 1000, 500],
  ["7_4", 500, 500, 1000, 1000], ["7_5", 500, 1000, 1000, 1500], ["7_6", 500, 1500, 1000, 2000],
  ["7_7", 500, 2000, 1000, 2500], ["7_8", 500, 2500, 1050, 3000], ["8_1", 1000, -1000, 1500, -500],
  ["8_2", 1000, -500, 1500, 0], ["8_3", 1000, 0, 1500, 500], ["8_4", 1000, 500, 1500, 1000],
  ["8_5", 1000, 1000, 1500, 1500], ["8_6", 1000, 1500, 1500, 2000], ["8_7", 1000, 2000, 1500, 2500],
  ["9_2", 1500, -500, 2000, 0], ["9_3", 1500, 0, 2000, 500], ["9_4", 1500, 500, 2000, 1000],
  ["9_5", 1500, 1000, 2000, 1500], ["9_6", 1500, 1500, 2000, 2000], ["10_2", 2000, -500, 2500, 0],
  ["10_3", 2000, 0, 2500, 500], ["10_4", 2000, 500, 2500, 1000], ["10_5", 2000, 1000, 2500, 1500],
  ["11_3", 2500, 0, 3000, 500], ["11_4", 2500, 500, 3050, 1000], ["11_5", 2500, 1000, 3000, 1500],
];

/** One image (full resolution or an overview) of a BigTIFF, as much as reading tiles needs. */
interface Ifd {
  width: number;
  height: number;
  tileW: number;
  tileH: number;
  compression: number;
  predictor: number;
  bits: number;
  /** Where the tile offsets (8 bytes each) and byte counts (4 or 8 bytes each) start. */
  offsetsAt: number;
  countsAt: number;
  countSize: number;
}

interface Cog {
  url: string;
  /** Top-left corner of the full-resolution image and its cell size (m). */
  x0: number;
  y0: number;
  cellM: number;
  nodata: number;
  ifds: Ifd[];
}

class MissingFile extends Error {}

async function range(url: string, start: number, length: number): Promise<DataView> {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${start + length - 1}` },
    signal: AbortSignal.timeout(15000),
  });
  // S3 answers 403 for a key that doesn't exist (no LiDAR tile there).
  if (response.status === 403 || response.status === 404) throw new MissingFile(url);
  if (!response.ok) throw new Error(`HRDEM read failed (HTTP ${response.status})`);
  return new DataView(await response.arrayBuffer());
}

const HEADER_BYTES = 16384;

/** Parses the BigTIFF header and every IFD (they sit at the start of a COG). */
async function readHeader(url: string): Promise<Cog> {
  const view = await range(url, 0, HEADER_BYTES);
  if (view.getUint16(0) !== 0x4949 || view.getUint16(2, true) !== 43) throw new Error("Not a little-endian BigTIFF");
  const u64 = (at: number) => Number(view.getBigUint64(at, true));
  const ifds: Ifd[] = [];
  let x0 = 0, y0 = 0, cellM = 1, nodata = -32767;
  for (let at = u64(8); at && at + 8 <= view.byteLength; ) {
    const count = u64(at);
    const tags = new Map<number, { type: number; count: number; at: number }>();
    for (let k = 0; k < count; k++) {
      const p = at + 8 + 20 * k;
      tags.set(view.getUint16(p, true), { type: view.getUint16(p + 2, true), count: u64(p + 4), at: p + 12 });
    }
    // A value that fits in 8 bytes is stored in the entry, otherwise at the offset it holds.
    const value = (tag: number) => {
      const t = tags.get(tag);
      if (!t) return undefined;
      return t.type === 3 ? view.getUint16(t.at, true) : t.type === 4 ? view.getUint32(t.at, true) : u64(t.at);
    };
    const doubles = (tag: number) => {
      const t = tags.get(tag);
      if (!t) return null;
      const from = u64(t.at);
      return Array.from({ length: t.count }, (_, i) => view.getFloat64(from + 8 * i, true));
    };
    const offsets = tags.get(324);
    const counts = tags.get(325);
    if (!offsets || !counts) throw new Error("HRDEM file isn't tiled");
    ifds.push({
      width: value(256)!,
      height: value(257)!,
      tileW: value(322)!,
      tileH: value(323)!,
      compression: value(259) ?? 1,
      predictor: value(317) ?? 1,
      bits: value(258) ?? 32,
      offsetsAt: u64(offsets.at),
      countsAt: u64(counts.at),
      countSize: counts.type === 16 ? 8 : 4,
    });
    if (ifds.length === 1) {
      const scale = doubles(33550);
      const tie = doubles(33922);
      if (!scale || !tie) throw new Error("HRDEM file has no georeferencing");
      cellM = scale[0];
      x0 = tie[3] - tie[0] * scale[0];
      y0 = tie[4] + tie[1] * scale[1];
      const nd = tags.get(42113);
      if (nd) {
        const bytes = new Uint8Array(view.buffer, nd.count <= 8 ? nd.at : u64(nd.at), nd.count);
        nodata = Number(new TextDecoder().decode(bytes).replace(/\0/g, ""));
      }
    }
    at = u64(at + 8 + 20 * count);
  }
  return { url, x0, y0, cellM, nodata, ifds };
}

/** Headers stay cached for the life of the function instance. */
const headers = new Map<string, Promise<Cog>>();
function cog(url: string): Promise<Cog> {
  let header = headers.get(url);
  if (!header) {
    header = readHeader(url);
    headers.set(url, header);
    header.catch(() => headers.delete(url));
  }
  return header;
}

/**
 * Heights for a window of one file at one overview level, written into `out`
 * (a raster on the same aligned grid). Cells with no data stay NaN.
 */
async function readInto(url: string, level: number, out: NativeRaster): Promise<void> {
  const file = await cog(url);
  const ifd = file.ifds[level];
  if (!ifd) throw new Error(`HRDEM file has no overview ${level}`);
  if (ifd.bits !== 32) throw new Error("HRDEM heights aren't float32");
  const cell = file.cellM * (file.ifds[0].width / ifd.width);
  // The box in this image's pixels, clipped to the image.
  const col0 = Math.round((out.x0 - file.x0) / cell);
  const row0 = Math.round((file.y0 - out.y0) / cell);
  const c0 = Math.max(0, col0), r0 = Math.max(0, row0);
  const c1 = Math.min(ifd.width, col0 + out.width), r1 = Math.min(ifd.height, row0 + out.height);
  if (c0 >= c1 || r0 >= r1) return;

  const across = Math.ceil(ifd.width / ifd.tileW);
  const tc0 = Math.floor(c0 / ifd.tileW), tc1 = Math.floor((c1 - 1) / ifd.tileW);
  const tr0 = Math.floor(r0 / ifd.tileH), tr1 = Math.floor((r1 - 1) / ifd.tileH);
  const n = tc1 - tc0 + 1;
  const decoder = await getDecoder({ Compression: ifd.compression });
  const fileDirectory = {
    Compression: ifd.compression,
    Predictor: ifd.predictor,
    TileWidth: ifd.tileW,
    TileLength: ifd.tileH,
    BitsPerSample: [ifd.bits],
    PlanarConfiguration: 1,
  };

  const rows: Promise<void>[] = [];
  for (let tr = tr0; tr <= tr1; tr++) {
    const k0 = tr * across + tc0;
    rows.push(
      (async () => {
        const [offs, counts] = await Promise.all([
          range(url, ifd.offsetsAt + 8 * k0, 8 * n),
          range(url, ifd.countsAt + ifd.countSize * k0, ifd.countSize * n),
        ]);
        await Promise.all(
          Array.from({ length: n }, async (_, j) => {
            const offset = Number(offs.getBigUint64(8 * j, true));
            const size = ifd.countSize === 8 ? Number(counts.getBigUint64(8 * j, true)) : counts.getUint32(4 * j, true);
            if (!offset || !size) return; // An empty tile: no LiDAR there.
            const raw = await range(url, offset, size);
            const decoded = await decoder.decode(fileDirectory, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
            const tile = new Float32Array(decoded);
            const tc = tc0 + j;
            for (let y = 0; y < ifd.tileH; y++) {
              const row = tr * ifd.tileH + y;
              if (row < r0 || row >= r1) continue;
              for (let x = 0; x < ifd.tileW; x++) {
                const col = tc * ifd.tileW + x;
                if (col < c0 || col >= c1) continue;
                const v = tile[y * ifd.tileW + x];
                if (v !== file.nodata && v > -1000) out.data[(row - row0) * out.width + (col - col0)] = v;
              }
            }
          }),
        );
      })(),
    );
  }
  await Promise.all(rows);
}

/** Slope and cover for a box (at most TERRAIN_MAX_SPAN_DEG a side), from the HRDEM mosaic. */
export async function readTerrain(bbox: BBox): Promise<TerrainGrid> {
  const cellM = terrainCellM(bbox);
  const level = Math.log2(cellM);
  // The box's extent in EPSG:3979 (corners and edge midpoints: Lambert bends the edges), plus 2 cells for the slope kernel.
  const lats = [bbox.south, (bbox.south + bbox.north) / 2, bbox.north];
  const lons = [bbox.west, (bbox.west + bbox.east) / 2, bbox.east];
  const pts = lats.flatMap((lat) => lons.map((lon) => toLambert(lon, lat)));
  const minX = Math.min(...pts.map((p) => p[0])) - 2 * cellM;
  const maxX = Math.max(...pts.map((p) => p[0])) + 2 * cellM;
  const minY = Math.min(...pts.map((p) => p[1])) - 2 * cellM;
  const maxY = Math.max(...pts.map((p) => p[1])) + 2 * cellM;
  const x0 = Math.floor(minX / cellM) * cellM;
  const y0 = Math.ceil(maxY / cellM) * cellM;
  const width = Math.ceil((maxX - x0) / cellM);
  const height = Math.ceil((y0 - minY) / cellM);
  const blank = () => ({ x0, y0, cellM, width, height, data: new Float32Array(width * height).fill(NaN) });
  const dtm: NativeRaster = blank();
  const dsm: NativeRaster = blank();

  const reads: Promise<void>[] = [];
  for (const [id, w, s, e, n] of TILES) {
    if (w * 1000 >= x0 + width * cellM || e * 1000 <= x0 || s * 1000 >= y0 || n * 1000 <= y0 - height * cellM) continue;
    for (const [kind, raster] of [["dtm", dtm], ["dsm", dsm]] as const) {
      reads.push(
        readInto(`${BASE}/${id}-mosaic-1m-${kind}.tif`, level, raster).catch((err) => {
          if (!(err instanceof MissingFile)) throw err;
        }),
      );
    }
  }
  await Promise.all(reads);
  return toLatLonGrid(dtm, slopePct(dtm), coverClasses(dtm, dsm), bbox);
}

