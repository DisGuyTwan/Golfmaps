/**
 * What covers a property, from aerial photos and the LiDAR: the one engine
 * behind every measurement (a house lot, a golf course, a sod farm). The
 * photos are the Quebec government's forest-inventory orthophoto mosaic
 * (MRNF, CC-BY 4.0): summer photos at about 20 cm a pixel, served as WMTS
 * tiles over southern Quebec, towns included; a lot is read at 20 cm, a
 * course at about 85 cm, a farm coarser (`surfaceZoom`). /api/surface reads
 * the tiles over the property and the LiDAR under them (terrain.ts) and
 * classifies every pixel:
 * - water: clearly blue (a pool), or ground the LiDAR reads as dead flat over
 *   200 m² or more (a pond or a lake: the ground model is flattened over
 *   water, and dark water looks like shade in the photos);
 * - tree, building: what the LiDAR sees standing there (crowns, roofs);
 * - hard: open ground that isn't green and is grey or bright: driveways,
 *   pavers, decks, paths, sand. Green is split from grey by each scene's own
 *   colours (Otsu on the green share G / (R + G + B) of open ground), since
 *   the photos' tint changes from one flight to the next; grass dried yellow
 *   in summer isn't green either, but it stays yellow (G well above B);
 * - other: grass, and shade too dark to tell (left as grass).
 * Pure, so it's tested without a browser; the route does the fetching.
 */
import type { MultiPolygon, Polygon } from "geojson";
import { labelRegions, polygonMask, regionGeometry, type GridShape } from "./landcover";
import type { LawnArea } from "./lawn";
import { COVER, straighten } from "./terrain";
import { SQ_METERS_TO_ACRES } from "./area";
import type { BBox, SatelliteTurf } from "./types";

export const SURFACE = { other: 0, hard: 1, water: 2, tree: 3, building: 4, none: 255 } as const;

/** Web Mercator zooms read: 19 is about 21 cm a pixel in southern Quebec, each step down doubles it. */
const MAX_ZOOM = 19;
const MIN_ZOOM = 15;
/** Most pixels classified in one request (2,000 × 2,000): a course up to about 1.6 km reads at zoom 17 (85 cm), a farm at 15-16. */
const MAX_PIXELS = 4_000_000;
/** Largest box /api/surface reads (degrees per side): about 3 km, a 36-hole course or a farm. */
export const SURFACE_MAX_SPAN_DEG = 0.04;

/** Pools smaller than this (m²) are glints or a blue tarp; paved patches smaller than this are a step or a bin. */
const MIN_WATER_M2 = 4;
const MIN_HARD_M2 = 4;
/** Colour is averaged over about 1 m (5 pixels at 20 cm) before telling grass from pavement: single pixels are JPEG noise. */
const SMOOTH_M = 1;
/** Hard patches narrower than about 1 m (an edge, a fence line, a misread seam) are dropped. */
const OPEN_M = 0.5;
/** Darker than this (0-255) is shade: too dark to tell grass from asphalt, left as lawn. */
const MAX_SHADE = 50;
/** The scene's split between grass and pavement stays within these green shares. */
const SPLIT_RANGE: readonly [number, number] = [0.335, 0.37];
/** With grass and pavement closer than this in green share, there's no pavement to tell apart: only clear greys count. */
const MIN_SEPARATION = 0.015;
/**
 * Paving is grey (G − B under this) or bright like sand and concrete (at least SAND_BRIGHT): dried grass on a
 * course's rough or range isn't green but stays yellow (G − B 9-25 on fully mapped Quebec courses), paving
 * on lots stayed under 6.
 */
const GREY_GB = 8;
const SAND_BRIGHT = 150;
/** Ground the LiDAR reads as dead flat (slope under 0.5 %) over this much (m²) is water: the ground model is flattened over ponds. */
const MIN_POND_M2 = 200;

/** Classes over a lat/lon box (cells about `cellM` square, from Web Mercator pixels). */
export interface SurfaceGrid extends GridShape {
  cellM: number;
  /** SURFACE classes, row-major from the top-left. */
  classes: Uint8Array;
}

export interface SurfaceGridJson extends GridShape {
  cellM: number;
  classes: string;
}

/** Global Web Mercator pixel coordinates at `z` (256-pixel tiles). */
export const mercX = (lon: number, z: number) => ((lon + 180) / 360) * 256 * 2 ** z;
export function mercY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z;
}
export const lonOfX = (x: number, z: number) => (x / (256 * 2 ** z)) * 360 - 180;
export const latOfY = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (256 * 2 ** z)))) * 180) / Math.PI;

/** The finest zoom whose pixels over the box stay within MAX_PIXELS: 19 for a lot, 17 for a course. */
export function surfaceZoom(bbox: BBox): number {
  for (let z = MAX_ZOOM; z > MIN_ZOOM; z--) {
    const w = mercX(bbox.east, z) - mercX(bbox.west, z);
    const h = mercY(bbox.south, z) - mercY(bbox.north, z);
    if (w * h <= MAX_PIXELS) return z;
  }
  return MIN_ZOOM;
}

/** Square (2r+1)² counts of `on` around each cell, from an integral image. */
function boxCount(on: Uint8Array, w: number, h: number, r: number): Uint16Array {
  const sum = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += on[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
    }
  }
  return out;
}

/** Binary erosion then dilation with a (2r+1)² square: drops anything narrower than the square. */
function open(on: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const full = boxCount(on, w, h, r);
  const eroded = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const span = (Math.min(h, y + r + 1) - Math.max(0, y - r)) * (Math.min(w, x + r + 1) - Math.max(0, x - r));
      eroded[y * w + x] = full[y * w + x] === span ? 1 : 0;
    }
  }
  const grown = boxCount(eroded, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = grown[i] > 0 && on[i] ? 1 : 0;
  return out;
}

/** Binary dilation then erosion: closes pinholes (a ladder, a float in a pool). */
function close(on: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const grown = boxCount(on, w, h, r);
  const dilated = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dilated[i] = grown[i] > 0 ? 1 : 0;
  const full = boxCount(dilated, w, h, r);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const span = (Math.min(h, y + r + 1) - Math.max(0, y - r)) * (Math.min(w, x + r + 1) - Math.max(0, x - r));
      out[y * w + x] = full[y * w + x] === span ? 1 : 0;
    }
  }
  return out;
}

/** Keeps the regions of `on` at least `minCells` big. */
function dropSmall(on: Uint8Array, w: number, h: number, minCells: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (const cells of labelRegions(on, w, h).regions) if (cells.length >= minCells) for (const i of cells) out[i] = 1;
  return out;
}

/** Otsu's split of `values` within [lo, hi]: the threshold and how far apart the two sides' means are. */
export function otsu(values: Float32Array | number[], lo: number, hi: number, bins = 120): { threshold: number; separation: number } {
  const hist = new Float64Array(bins);
  for (const v of values) if (v >= lo && v < hi) hist[Math.floor(((v - lo) / (hi - lo)) * bins)]++;
  const centre = (i: number) => lo + ((i + 0.5) * (hi - lo)) / bins;
  let total = 0, sumAll = 0;
  for (let i = 0; i < bins; i++) {
    total += hist[i];
    sumAll += hist[i] * centre(i);
  }
  let best = -1, threshold = (lo + hi) / 2, separation = 0;
  let w0 = 0, sum0 = 0;
  for (let i = 0; i < bins - 1; i++) {
    w0 += hist[i];
    sum0 += hist[i] * centre(i);
    const w1 = total - w0;
    if (!w0 || !w1) continue;
    const m0 = sum0 / w0, m1 = (sumAll - sum0) / w1;
    const between = w0 * w1 * (m1 - m0) ** 2;
    if (between > best) {
      best = between;
      threshold = lo + ((i + 1) * (hi - lo)) / bins;
      separation = m1 - m0;
    }
  }
  return { threshold, separation };
}

export interface SurfacePixels {
  /** RGB, 3 bytes a pixel, row-major. */
  rgb: Uint8Array;
  width: number;
  height: number;
  cellM: number;
  /** 0 where the photo has no data (outside the mosaic, a tile that failed). */
  valid: Uint8Array;
  /** What the LiDAR sees on each pixel (terrain.ts COVER); null without LiDAR (everything counts as open ground). */
  cover: Uint8Array | null;
  /** LiDAR slope on each pixel, in % (terrain.ts, NO_SLOPE where there's none); finds ponds. */
  slope?: Uint8Array | null;
}

/** SURFACE class of every pixel (see the module comment). */
export function classifySurface({ rgb, width: w, height: h, cellM, valid, cover, slope }: SurfacePixels): Uint8Array {
  const n = w * h;
  // Only crowns and roofs are ruled out: a car or a hedge the LiDAR caught may be gone from the photo (or be
  // parked on the driveway), and the two weren't flown the same year.
  const standing = new Uint8Array(n);
  if (cover) for (let i = 0; i < n; i++) standing[i] = cover[i] === COVER.tree ? SURFACE.tree : cover[i] === COVER.building ? SURFACE.building : 0;
  const classes = new Uint8Array(n);
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!valid[i]) {
      classes[i] = SURFACE.none;
      continue;
    }
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
    water[i] = b > r + 40 && b > 100 && b >= g - 25 ? 1 : 0;
  }
  const minWater = Math.max(1, Math.round(MIN_WATER_M2 / (cellM * cellM)));
  const pools = dropSmall(close(open(water, w, h, 1), w, h, 1), w, h, minWater);
  if (slope && cover) {
    const flat = new Uint8Array(n);
    for (let i = 0; i < n; i++) flat[i] = valid[i] && slope[i] === 0 && cover[i] === COVER.ground ? 1 : 0;
    const ponds = dropSmall(flat, w, h, MIN_POND_M2 / (cellM * cellM));
    for (let i = 0; i < n; i++) pools[i] |= ponds[i];
  }

  // Colour averaged over about a metre (JPEG noise and 4:2:0 chroma at single pixels).
  const half = Math.floor((Math.max(1, Math.round(SMOOTH_M / cellM)) | 1) / 2);
  const channel = (k: number) => {
    const sum = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += rgb[3 * (y * w + x) + k];
        sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
      }
    }
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
        const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
        out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
      }
    }
    return out;
  };
  const R = channel(0), G = channel(1), B = channel(2);

  const candidate = (i: number) => valid[i] && !pools[i] && !standing[i];
  const brightness: number[] = [];
  for (let i = 0; i < n; i++) if (candidate(i)) brightness.push((R[i] + G[i] + B[i]) / 3);
  brightness.sort((a, b) => a - b);
  // Shade: the darkest 15 % of open ground, and never brighter than MAX_SHADE.
  const shade = Math.min(MAX_SHADE, brightness.length ? brightness[Math.floor(0.15 * brightness.length)] : MAX_SHADE);
  const share = new Float32Array(n);
  const lit: number[] = [];
  for (let i = 0; i < n; i++) {
    share[i] = G[i] / (R[i] + G[i] + B[i] + 1);
    if (candidate(i) && (R[i] + G[i] + B[i]) / 3 > shade) lit.push(share[i]);
  }
  const split = otsu(lit, 0.3, 0.42);
  const threshold = split.separation >= MIN_SEPARATION ? Math.min(SPLIT_RANGE[1], Math.max(SPLIT_RANGE[0], split.threshold)) : SPLIT_RANGE[0];

  const hard = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const bright = (R[i] + G[i] + B[i]) / 3;
    hard[i] = candidate(i) && bright > shade && share[i] < threshold && (G[i] - B[i] < GREY_GB || bright >= SAND_BRIGHT) ? 1 : 0;
  }
  const radius = Math.max(1, Math.round(OPEN_M / cellM));
  const paved = dropSmall(open(hard, w, h, radius), w, h, Math.max(1, Math.round(MIN_HARD_M2 / (cellM * cellM))));
  for (let i = 0; i < n; i++) {
    if (classes[i] === SURFACE.none) continue;
    classes[i] = pools[i] ? SURFACE.water : standing[i] || (paved[i] ? SURFACE.hard : SURFACE.other);
  }
  return classes;
}

/** Smallest piece of a pool or paving left on the lot worth removing (m²). */
const MIN_ON_LOT_M2 = 2;

/**
 * Pools and paving on a lot, as lawn areas (`i1`, `i2`, …): the regions of
 * water and hard ground inside the lot, outlines straightened.
 */
export function surfaceAreas(grid: SurfaceGrid, lot: Polygon | MultiPolygon): LawnArea[] {
  const inLot = polygonMask(grid, [lot]);
  const out: LawnArea[] = [];
  const minCells = Math.max(1, MIN_ON_LOT_M2 / (grid.cellM * grid.cellM));
  for (const [cls, kind] of [[SURFACE.water, "pool"], [SURFACE.hard, "paving"]] as const) {
    const on = new Uint8Array(inLot.length);
    for (let i = 0; i < on.length; i++) on[i] = inLot[i] && grid.classes[i] === cls ? 1 : 0;
    for (const cells of labelRegions(on, grid.width, grid.height).regions) {
      if (cells.length < minCells) continue;
      out.push({ id: `i${out.length + 1}`, kind, geometry: straighten(regionGeometry(grid, cells), grid.cellM * 0.75) });
    }
  }
  return out;
}

/** Canopy patches this big or bigger (m²) are woods, not mowed; smaller ones are single trees over grass, mowed under. */
export const WOODS_M2 = 1000;

/** What covers the inside of an outline, in m². */
export interface SurfaceCover {
  /** Grass, shade on it and the single trees over it: what gets mowed. */
  grassM2: number;
  /** Woods: canopy patches of WOODS_M2 or more. */
  woodsM2: number;
  /** Roofs the LiDAR sees. */
  builtM2: number;
  /** Driveways, paths, patios, parking, sand. */
  pavedM2: number;
  waterM2: number;
  /** No photo there (outside the mosaic). */
  unknownM2: number;
  totalM2: number;
}

/**
 * The cover inside an outline, plus the masks the map paints: which cells
 * are inside and which are woods. Canopy patches are sized over the whole
 * grid, so a wood that straddles the outline is still a wood.
 */
export function surfaceCover(grid: SurfaceGrid, outline: (Polygon | MultiPolygon)[]): { cover: SurfaceCover; inside: Uint8Array; woods: Uint8Array } {
  const { width: w, height: h, classes } = grid;
  const inside = polygonMask(grid, outline);
  const tree = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) tree[i] = classes[i] === SURFACE.tree ? 1 : 0;
  const woods = new Uint8Array(w * h);
  const minCells = WOODS_M2 / (grid.cellM * grid.cellM);
  for (const cells of labelRegions(tree, w, h).regions) if (cells.length >= minCells) for (const i of cells) woods[i] = 1;
  const cell = grid.cellM * grid.cellM;
  const cover: SurfaceCover = { grassM2: 0, woodsM2: 0, builtM2: 0, pavedM2: 0, waterM2: 0, unknownM2: 0, totalM2: 0 };
  for (let i = 0; i < w * h; i++) {
    if (!inside[i]) continue;
    cover.totalM2 += cell;
    const c = classes[i];
    if (c === SURFACE.none) cover.unknownM2 += cell;
    else if (c === SURFACE.water) cover.waterM2 += cell;
    else if (c === SURFACE.building) cover.builtM2 += cell;
    else if (c === SURFACE.hard) cover.pavedM2 += cell;
    else if (woods[i]) cover.woodsM2 += cell;
    else cover.grassM2 += cell;
  }
  return { cover, inside, woods };
}

/** A course's cover as acres, for the outline-only estimate (landcover.ts estimatedTurf). */
export function photoTurf(cover: SurfaceCover): SatelliteTurf {
  const ac = (m2: number) => m2 * SQ_METERS_TO_ACRES;
  return {
    source: "photos",
    grassAcres: ac(cover.grassM2),
    treesAcres: ac(cover.woodsM2),
    builtAcres: ac(cover.builtM2 + cover.pavedM2),
    waterAcres: ac(cover.waterM2),
    otherAcres: ac(cover.unknownM2),
    outlineAcres: ac(cover.totalM2),
    year: null,
  };
}

/** RGBA for the map: grass painted `grass`, paving, water and roofs in their own tints, woods and the outside clear. */
export function surfaceOverlay(grid: SurfaceGrid, inside: Uint8Array, woods: Uint8Array, grass: [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(grid.width * grid.height * 4);
  const tint: Partial<Record<number, [number, number, number, number]>> = {
    [SURFACE.other]: [...grass, 120],
    [SURFACE.tree]: [...grass, 120],
    [SURFACE.hard]: [100, 116, 139, 150],
    [SURFACE.water]: [56, 189, 248, 150],
    [SURFACE.building]: [51, 65, 85, 170],
  };
  for (let i = 0; i < grid.width * grid.height; i++) {
    const rgba = inside[i] && !woods[i] ? tint[grid.classes[i]] : undefined;
    if (rgba) out.set(rgba, 4 * i);
  }
  return out;
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeSurface(json: SurfaceGridJson): SurfaceGrid {
  return { bbox: json.bbox, width: json.width, height: json.height, cellM: json.cellM, classes: fromBase64(json.classes) };
}

/** What covers a box, through /api/surface (CDN-cached); null where the photos don't reach (outside Quebec). */
export async function fetchSurface(bbox: BBox): Promise<SurfaceGrid | null> {
  const key = [bbox.south, bbox.west, bbox.north, bbox.east].map((v) => v.toFixed(5)).join(",");
  // v=2: trees and buildings are classes of their own (grids cached before had them as "other").
  const response = await fetch(`/api/surface?bbox=${key}&v=2`, { signal: AbortSignal.timeout(55000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Surface request failed (HTTP ${response.status})`);
  return decodeSurface((await response.json()) as SurfaceGridJson);
}

/** True when the box is small enough for /api/surface (about 3 km a side). */
export function fitsSurface(bbox: BBox): boolean {
  return bbox.north - bbox.south <= SURFACE_MAX_SPAN_DEG && bbox.east - bbox.west <= SURFACE_MAX_SPAN_DEG;
}
