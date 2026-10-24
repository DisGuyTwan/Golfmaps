/**
 * Terrain from Natural Resources Canada's HRDEM (LiDAR, 1 m): slope from the
 * bare-earth model (DTM), and what stands on it (DSM minus DTM): low plants,
 * trees and buildings. /api/terrain reads the Cloud Optimized GeoTIFFs (in
 * EPSG:3979, Canada Atlas Lambert) and answers with a small latitude/longitude
 * grid, like /api/landcover. This module holds the pure parts: the projection,
 * slope, cover classes, resampling, and what a shape (a lawn, a course's turf)
 * has under it. Tested without a browser.
 *
 * Coordinates from the browser are WGS84 and the mosaic is NAD83(CSRS); they
 * sit about 1 m apart in Quebec, so they are treated as the same.
 */
import type { MultiPolygon, Polygon, Position } from "geojson";
import { labelRegions, polygonMask, regionGeometry, type GridShape } from "./landcover";
import type { BBox } from "./types";

const RAD = Math.PI / 180;

/* EPSG:3979: Lambert Conformal Conic with two standard parallels (49° and
 * 77° N), origin 49° N 95° W, GRS80 ellipsoid (Snyder, Map Projections, §15). */
const A = 6378137;
const FLAT = 1 / 298.257222101;
const E = Math.sqrt(2 * FLAT - FLAT * FLAT);
const LON0 = -95 * RAD;
const msfn = (phi: number) => Math.cos(phi) / Math.sqrt(1 - (E * Math.sin(phi)) ** 2);
const tsfn = (phi: number) =>
  Math.tan(Math.PI / 4 - phi / 2) / ((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi))) ** (E / 2);
const N = (Math.log(msfn(49 * RAD)) - Math.log(msfn(77 * RAD))) / (Math.log(tsfn(49 * RAD)) - Math.log(tsfn(77 * RAD)));
const AF = (A * msfn(49 * RAD)) / (N * tsfn(49 * RAD) ** N);
const RHO0 = AF * tsfn(49 * RAD) ** N;

/** Longitude/latitude (degrees) to EPSG:3979 metres [x, y]. */
export function toLambert(lon: number, lat: number): [number, number] {
  const rho = AF * tsfn(lat * RAD) ** N;
  const theta = N * (lon * RAD - LON0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

/** EPSG:3979 metres to [longitude, latitude] (degrees). */
export function fromLambert(x: number, y: number): [number, number] {
  const dy = RHO0 - y;
  const t = (Math.hypot(x, dy) / AF) ** (1 / N);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) {
    const es = E * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(t * ((1 - es) / (1 + es)) ** (E / 2));
  }
  return [(Math.atan2(x, dy) / N + LON0) / RAD, phi / RAD];
}

/** A window of the mosaic in EPSG:3979: top-left corner, square cells, heights (NaN = no data), rows from the north. */
export interface NativeRaster {
  x0: number;
  y0: number;
  cellM: number;
  width: number;
  height: number;
  data: Float32Array;
}

/** What stands on the ground in a cell. */
export const COVER = { ground: 0, low: 1, tree: 2, building: 3, none: 255 } as const;
/** Slope value for "no LiDAR here". */
export const NO_SLOPE = 255;

/** Heights above the ground (m): under LOW_M is ground, under HIGH_M low plants (beds, hedges, cars), above it trees or roofs. */
const LOW_M = 0.5;
const HIGH_M = 2;
/** A roof is smooth: the surface model's Laplacian stays under this (m); tree crowns are rough. */
const ROOF_SMOOTH_M = 0.5;
/** Smooth high patches smaller than this (m²) are flat-topped hedges or crowns, not buildings. */
const MIN_BUILDING_M2 = 25;
/**
 * Smooth high patches standing taller than this (m, median) are a forest's
 * canopy, not roofs: a mature stand reads smooth at 1 m, 20-28 m up on Mont
 * Saint-Bruno, while houses stand 3-12 m and a five-storey building about 17.
 */
const MAX_BUILDING_M = 18;

/** 3 × 3 mean of the finite heights around each cell; cells with no data stay NaN. */
function smooth3(r: NativeRaster): Float32Array {
  const { width: w, height: h, data } = r;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!Number.isFinite(data[i])) {
        out[i] = NaN;
        continue;
      }
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          const v = yy >= 0 && yy < h && xx >= 0 && xx < w ? data[yy * w + xx] : NaN;
          if (Number.isFinite(v)) {
            sum += v;
            n++;
          }
        }
      }
      out[i] = sum / n;
    }
  }
  return out;
}

/** Under trees and low plants, slope is a plane fitted over about this many metres (see slopePct). */
const CANOPY_SLOPE_M = 9;

/**
 * Slope (%) of the least-squares plane through the k × k heights around each
 * `only` cell, written into `out`; cells with a missing height in reach (or
 * too near the edge) keep what `out` has.
 */
function planeSlope(r: NativeRaster, k: number, out: Float32Array, only: Uint8Array): void {
  const { width: w, height: h, data, cellM } = r;
  const half = (k - 1) / 2;
  let sumX2 = 0;
  for (let d = -half; d <= half; d++) sumX2 += d * d;
  sumX2 *= k;
  for (let y = half; y < h - half; y++) {
    for (let x = half; x < w - half; x++) {
      const i = y * w + x;
      if (!only[i]) continue;
      let sx = 0, sy = 0, ok = true;
      for (let dy = -half; dy <= half && ok; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const v = data[(y + dy) * w + x + dx];
          if (!Number.isFinite(v)) {
            ok = false;
            break;
          }
          sx += dx * v;
          sy += dy * v;
        }
      }
      if (ok) out[i] = (Math.hypot(sx, sy) / (sumX2 * cellM)) * 100;
    }
  }
}

/**
 * Slope in percent (rise over run × 100), Horn's 3 × 3 method as most GIS
 * do, on heights first averaged over 3 × 3 cells: the 1 m LiDAR is a few cm
 * noisy, enough to read a flat lawn as 10-20 % from one cell to the next.
 * Edge cells reuse their own height for the missing neighbours; a cell next
 * to missing data has no slope (NaN).
 * Under trees and low plants (`cover`), the bare-earth model is interpolated
 * from the few pulses that reach the ground, so there the slope is a plane
 * fitted over about 9 m instead: a wooded hillside still reads steep, a
 * wooded flat lot no longer reads 15 % (1-2 m cells only; coarser cells
 * already average that much).
 */
export function slopePct(dtm: NativeRaster, cover?: Uint8Array): Float32Array {
  const { width: w, height: h, cellM } = dtm;
  const data = smooth3(dtm);
  const out = new Float32Array(w * h);
  const at = (r: number, c: number) => data[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const a = at(r - 1, c - 1), b = at(r - 1, c), d = at(r - 1, c + 1);
      const f = at(r, c - 1), g = at(r, c + 1);
      const k = at(r + 1, c - 1), m = at(r + 1, c), n = at(r + 1, c + 1);
      const dx = (d + 2 * g + n - (a + 2 * f + k)) / (8 * cellM);
      const dy = (k + 2 * m + n - (a + 2 * b + d)) / (8 * cellM);
      out[r * w + c] = Math.hypot(dx, dy) * 100;
    }
  }
  const k = 2 * Math.round(CANOPY_SLOPE_M / cellM / 2) + 1;
  if (cover && k > 3) {
    const covered = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) covered[i] = cover[i] === COVER.tree || cover[i] === COVER.low ? 1 : 0;
    planeSlope(dtm, k, out, covered);
  }
  return out;
}

/** A slope in percent as degrees: 36 % is 20°, 84 % is 40°. */
export const slopeDeg = (pct: number) => (Math.atan(pct / 100) * 180) / Math.PI;

/** 3 × 3 binary filter: a cell is on when at least `min` of its 9 cells (itself included) are. */
function neighbourhood(on: Uint8Array, w: number, h: number, min: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < h && cc >= 0 && cc < w && on[rr * w + cc]) n++;
        }
      }
      out[r * w + c] = n >= min ? 1 : 0;
    }
  }
  return out;
}
const erode = (on: Uint8Array, w: number, h: number) => neighbourhood(on, w, h, 9);
const dilate = (on: Uint8Array, w: number, h: number) => neighbourhood(on, w, h, 1);

/**
 * What stands on each cell: ground, low plants, trees or buildings. Roofs and
 * crowns are both high; roofs are smooth planes (a small Laplacian in the
 * surface model) in patches the size of a building and a building's height,
 * crowns are rough (or, in a dense forest, too tall to be a roof). Only
 * told apart at 1-2 m cells; coarser grids (golf courses) call everything high
 * a tree, which is what matters on turf.
 */
export function coverClasses(dtm: NativeRaster, dsm: NativeRaster): Uint8Array {
  const { width: w, height: h, cellM } = dtm;
  const cover = new Uint8Array(w * h);
  const high = new Uint8Array(w * h);
  const smooth = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const above = dsm.data[i] - dtm.data[i];
    if (!Number.isFinite(above)) {
      cover[i] = COVER.none;
      continue;
    }
    cover[i] = above < LOW_M ? COVER.ground : above < HIGH_M ? COVER.low : COVER.tree;
    if (above >= HIGH_M) high[i] = 1;
  }
  if (cellM > 2) return cover;

  for (let r = 1; r < h - 1; r++) {
    for (let c = 1; c < w - 1; c++) {
      const i = r * w + c;
      const lap = 4 * dsm.data[i] - dsm.data[i - 1] - dsm.data[i + 1] - dsm.data[i - w] - dsm.data[i + w];
      if (Math.abs(lap) < ROOF_SMOOTH_M) smooth[i] = 1;
    }
  }
  const roofish = neighbourhood(smooth, w, h, 5);
  for (let i = 0; i < w * h; i++) roofish[i] &= high[i];
  const opened = dilate(erode(roofish, w, h), w, h);
  const minCells = MIN_BUILDING_M2 / (cellM * cellM);
  const kept = new Uint8Array(w * h);
  for (const cells of labelRegions(opened, w, h).regions) {
    if (cells.length < minCells) continue;
    const heights = cells.map((i) => dsm.data[i] - dtm.data[i]).sort((a, b) => a - b);
    if (heights[heights.length >> 1] > MAX_BUILDING_M) continue;
    for (const i of cells) kept[i] = 1;
  }
  // Grow back over the roof edges (rough where the roof meets the wall), then close small gaps.
  const grown = dilate(kept, w, h);
  for (let i = 0; i < w * h; i++) grown[i] &= high[i];
  const building = erode(dilate(grown, w, h), w, h);
  for (let i = 0; i < w * h; i++) if (building[i] && high[i]) cover[i] = COVER.building;
  return cover;
}

/** Slope and cover on a latitude/longitude grid (cells about `cellM` square), from /api/terrain. */
export interface TerrainGrid extends GridShape {
  cellM: number;
  /** Percent, rounded, at most 250; NO_SLOPE where there's no LiDAR. */
  slope: Uint8Array;
  /** COVER classes. */
  cover: Uint8Array;
}

/**
 * Resamples native slope and cover onto a lat/lon grid over `bbox` with cells
 * of about the native size (nearest cell), so the client can mask shapes in
 * plain degrees like the land cover grids.
 */
export function toLatLonGrid(native: NativeRaster, slope: Float32Array, cover: Uint8Array, bbox: BBox): TerrainGrid {
  const { cellM } = native;
  const dLat = cellM / 111320;
  const dLon = cellM / (111320 * Math.cos(((bbox.south + bbox.north) / 2) * RAD));
  const width = Math.max(1, Math.ceil((bbox.east - bbox.west) / dLon));
  const height = Math.max(1, Math.ceil((bbox.north - bbox.south) / dLat));
  const outSlope = new Uint8Array(width * height).fill(NO_SLOPE);
  const outCover = new Uint8Array(width * height).fill(COVER.none);
  for (let r = 0; r < height; r++) {
    const lat = bbox.north - (r + 0.5) * dLat;
    for (let c = 0; c < width; c++) {
      const [x, y] = toLambert(bbox.west + (c + 0.5) * dLon, lat);
      const col = Math.floor((x - native.x0) / cellM);
      const row = Math.floor((native.y0 - y) / cellM);
      if (col < 0 || row < 0 || col >= native.width || row >= native.height) continue;
      const k = row * native.width + col;
      const s = slope[k];
      if (Number.isFinite(s)) outSlope[r * width + c] = Math.min(250, Math.round(s));
      outCover[r * width + c] = cover[k];
    }
  }
  return {
    bbox: { west: bbox.west, north: bbox.north, east: bbox.west + width * dLon, south: bbox.north - height * dLat },
    width,
    height,
    cellM,
    slope: outSlope,
    cover: outCover,
  };
}

/** What a shape has under it, from the LiDAR. Shares are 0-1 of the shape's area with data. */
export interface TerrainStats {
  /** Share of the shape the LiDAR covers. Under ~0.5 the rest isn't worth trusting. */
  coverage: number;
  /** Median and 90th percentile slope (%). */
  slopeP50: number;
  slopeP90: number;
  /**
   * Steeper than 25 % (14°, hard going), 36 % (20°: the limit of every Kress
   * robot without four-wheel drive), 47 % (25°, the Voyager KR804's) and 84 %
   * (40°, the EyePilot 4x4's).
   */
  over25: number;
  over36: number;
  over47: number;
  over84: number;
  /** Under tree crowns: weaker satellite signal for RTK robots. */
  canopy: number;
}

/** Steep cells only count in patches at least this big (m²): a bank, not a curb, a wall's foot or a bed's edge. */
const MIN_STEEP_M2 = 8;

/**
 * Slope and canopy under a shape, or null when the LiDAR doesn't cover it.
 * Every cell counts, wooded or open: on a wooded hillside the trees stand on
 * the slope the robot has to climb (the route already reads slope under trees
 * over a wider window, see slopePct).
 */
export function terrainStats(grid: TerrainGrid, geoms: (Polygon | MultiPolygon)[]): TerrainStats | null {
  const mask = polygonMask(grid, geoms);
  let inside = 0, canopy = 0;
  const counted = new Uint8Array(mask.length);
  const slopes: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    inside++;
    if (grid.slope[i] === NO_SLOPE) continue;
    counted[i] = 1;
    slopes.push(grid.slope[i]);
    if (grid.cover[i] === COVER.tree) canopy++;
  }
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const pct = (q: number) => slopes[Math.min(slopes.length - 1, Math.floor(q * slopes.length))];
  const minCells = Math.max(1, MIN_STEEP_M2 / (grid.cellM * grid.cellM));
  /** Share of the counted cells steeper than `limit` %, in patches big enough to matter. */
  const steeper = (limit: number) => {
    const on = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) on[i] = counted[i] && grid.slope[i] > limit ? 1 : 0;
    let n = 0;
    for (const cells of labelRegions(on, grid.width, grid.height).regions) if (cells.length >= minCells) n += cells.length;
    return n / slopes.length;
  };
  return {
    coverage: slopes.length / inside,
    slopeP50: pct(0.5),
    slopeP90: pct(0.9),
    over25: steeper(25),
    over36: steeper(36),
    over47: steeper(47),
    over84: steeper(84),
    canopy: canopy / slopes.length,
  };
}

/** Douglas-Peucker on a closed ring of [lon, lat], with the tolerance in metres. */
function simplifyRing(ring: Position[], tolM: number): Position[] {
  if (ring.length <= 5) return ring;
  const kx = 111320 * Math.cos((ring[0][1] * Math.PI) / 180);
  const xy = ring.map(([lon, lat]) => [lon * kx, lat * 111320]);
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  // Split the closed ring at its farthest point from the start, then simplify each half.
  let far = 0, farD = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = Math.hypot(xy[i][0] - xy[0][0], xy[i][1] - xy[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1, worstD = tolM;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

/**
 * Buildings the LiDAR sees on a lot, as outlines (lon/lat), so houses
 * OpenStreetMap doesn't have still come off the lawn. Patches under `minM2`
 * are dropped. Outlines traced cell by cell come out as staircases; they're
 * straightened to within half a cell, so walls are walls (and the lawn's edge
 * length, which the mower fit counts, isn't inflated).
 */
export function lidarBuildings(grid: TerrainGrid, lot: Polygon | MultiPolygon, minM2 = 15): (Polygon | MultiPolygon)[] {
  const mask = polygonMask(grid, [lot]);
  const on = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) on[i] = mask[i] && grid.cover[i] === COVER.building ? 1 : 0;
  const minCells = minM2 / (grid.cellM * grid.cellM);
  const straighten = (rings: Position[][]) => rings.map((ring) => simplifyRing(ring, grid.cellM * 0.75));
  return labelRegions(on, grid.width, grid.height)
    .regions.filter((cells) => cells.length >= minCells)
    .map((cells) => {
      const g = regionGeometry(grid, cells);
      return g.type === "Polygon"
        ? { type: "Polygon", coordinates: straighten(g.coordinates) }
        : { type: "MultiPolygon", coordinates: g.coordinates.map(straighten) };
    });
}

/** Largest box /api/terrain reads (degrees per side): a whole golf course. */
export const TERRAIN_MAX_SPAN_DEG = 0.08;

/** Cell size (m) for a box: 1 m for a lot, coarser for a course, so a grid stays under ~600 cells a side. */
export function terrainCellM(bbox: BBox): number {
  const ns = (bbox.north - bbox.south) * 111320;
  const ew = (bbox.east - bbox.west) * 111320 * Math.cos(((bbox.south + bbox.north) / 2) * RAD);
  const need = Math.max(ns, ew) / 600;
  return [1, 2, 4, 8, 16].find((c) => c >= need) ?? 16;
}

export interface TerrainGridJson extends GridShape {
  cellM: number;
  slope: string;
  cover: string;
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeTerrain(json: TerrainGridJson): TerrainGrid {
  const slope = fromBase64(json.slope);
  const cover = fromBase64(json.cover);
  if (slope.length !== json.width * json.height || cover.length !== slope.length) throw new Error("Terrain grid size mismatch");
  return { bbox: json.bbox, width: json.width, height: json.height, cellM: json.cellM, slope, cover };
}

/** Slope and cover for a box through /api/terrain (CDN-cached; the LiDAR doesn't change). */
export async function fetchTerrain(bbox: BBox): Promise<TerrainGrid> {
  const key = [bbox.south, bbox.west, bbox.north, bbox.east].map((v) => v.toFixed(5)).join(",");
  // v: the slope under trees changed (Oct 2026); a new key skips grids the CDN cached before.
  const response = await fetch(`/api/terrain?bbox=${key}&v=2`, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Terrain request failed (HTTP ${response.status})`);
  return decodeTerrain((await response.json()) as TerrainGridJson);
}
