/**
 * The area to mow as the robots meet it, from the map's. Two things the map
 * gets wrong on a complex property:
 * - what no robot can mow goes to a trimmer: strips narrower than the
 *   narrowest robot gets through (a side yard between the house and the
 *   fence), ground steeper than 40° (no robot climbs it), and pockets too
 *   small to set up as a zone;
 * - a slope is more grass than its outline on the map: a 20° bank holds 6 %
 *   more ground, a 30° one 15 % (1 / cos of the slope), and the robot mows
 *   the ground, not the map.
 * So the robots' area is (map − trim) × the ground's surface over the map,
 * and the trim is shown apart. Pure, so it's tested without a browser.
 */
import area from "@turf/area";
import type { MultiPolygon, Polygon } from "geojson";
import { labelRegions, polygonMask, regionGeometry, type GridShape } from "./landcover";
import { NO_SLOPE, steepAreas, type TerrainGrid } from "./terrain";

type Shape = Polygon | MultiPolygon;

/** Ground no robot climbs (40° as a grade): left to a trimmer. */
export const TRIM_STEEP_PCT = 84;
/** A patch smaller than this (m²) isn't worth setting up as a robot zone: it's trimmed with the edges. */
export const MIN_ZONE_M2 = 10;
/** Finest raster for a lawn's reach (m), and the most cells one may take. */
const MIN_CELL_M = 0.1;
const MAX_CELLS = 2_000_000;
/** Trim areas smaller than this (m²) aren't drawn: a robot's rounded corners, mowed with the edges anyway. */
const MIN_DRAWN_M2 = 1;
const M_PER_DEG = 111_320;

/** What no robot mows, by reason, as shares of the area on the map. */
export interface TrimShares {
  /** Strips narrower than the narrowest robot gets through. */
  narrow: number;
  /** Steeper than 40°. */
  steep: number;
  /** Pockets under MIN_ZONE_M2. */
  pocket: number;
}

/** How a property's map area turns into the robots' ground (the shares and factor apply to whatever area is quoted). */
export interface GroundShares {
  trim: TrimShares;
  /** The ground's surface over its map area where the robots mow (≥ 1). */
  surface: number;
  /** Where the trim is, for the map. */
  trimAreas: Shape[];
}

export interface Ground {
  /** The area quoted, on the map (m²). */
  mapM2: number;
  /** What no robot mows, on the map (m²). */
  trim: { narrow: number; steep: number; pocket: number };
  /** The ground's surface over its map area where the robots mow (≥ 1). */
  surface: number;
  /** What the robots mow, on the ground (m²): (map − trim) × surface. */
  robotM2: number;
  trimAreas: Shape[];
}

export const trimM2 = (g: Ground) => g.trim.narrow + g.trim.steep + g.trim.pocket;

/** The ground for `mapM2` of quoted area, from its shares. */
export function groundOf(shares: GroundShares, mapM2: number): Ground {
  const trim = { narrow: shares.trim.narrow * mapM2, steep: shares.trim.steep * mapM2, pocket: shares.trim.pocket * mapM2 };
  const left = Math.max(0, mapM2 - trim.narrow - trim.steep - trim.pocket);
  return { mapM2, trim, surface: shares.surface, robotM2: left * shares.surface, trimAreas: shares.trimAreas };
}

/** The robots' share of the quoted area, on the ground: what the fleet is sized on (mowers.ts). */
export const robotRatio = (g: Ground) => (g.mapM2 > 0 ? g.robotM2 / g.mapM2 : 1);

/**
 * The ground's surface over its map area under the shapes, from the LiDAR's
 * slope: the mean of √(1 + grade²), over cells up to `maxPct` (steeper ones
 * are trimmed, not mowed). 1 where there's no LiDAR.
 */
export function surfaceFactor(grid: TerrainGrid, geoms: Shape[], maxPct = TRIM_STEEP_PCT): number {
  const mask = polygonMask(grid, geoms);
  let n = 0;
  let sum = 0;
  for (let i = 0; i < mask.length; i++) {
    const s = grid.slope[i];
    if (!mask[i] || s === NO_SLOPE || s > maxPct) continue;
    n++;
    sum += Math.sqrt(1 + (s / 100) ** 2);
  }
  return n ? sum / n : 1;
}

/** Squared distance from every cell to the nearest `on` cell (exact, Felzenszwalb and Huttenlocher), in cells². */
function distance2(on: Uint8Array, w: number, h: number): Float64Array {
  const INF = 1e20;
  const d = new Float64Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = on[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = d[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) d[y * w + x] = out[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = d[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) d[y * w + x] = out[x];
  }
  return d;
}

/**
 * Where on a lawn (or a site) the robots can't mow, as shares of it: the
 * lawn is rastered (10 cm on a lot) and the ground a robot `passageM` wide
 * can sweep is what's left after taking off what's within half its width of
 * an edge, then putting back what's within half its width of where its
 * middle can go (an opening, in image terms): strips narrower than the robot
 * drop out, corners only lose a sliver. Then what the LiDAR reads steeper
 * than 40° comes off, and pieces under MIN_ZONE_M2 are pockets. The slopes'
 * surface is read over the lawn where it's mowed.
 */
export function lawnGroundShares(lawn: Shape, passageM: number, grid: TerrainGrid | null): GroundShares {
  const ring = lawn.type === "Polygon" ? lawn.coordinates.flat() : lawn.coordinates.flat(2);
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const [west, east, south, north] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const kx = M_PER_DEG * Math.cos((((south + north) / 2) * Math.PI) / 180);
  const wM = (east - west) * kx;
  const hM = (north - south) * M_PER_DEG;
  const cell = Math.max(MIN_CELL_M, Math.sqrt((wM * hM) / MAX_CELLS));
  // One empty cell all round, so the lawn's edge is always next to an outside cell.
  const w = Math.ceil(wM / cell) + 2;
  const h = Math.ceil(hM / cell) + 2;
  const raster: GridShape = {
    bbox: { west: west - cell / kx, north: north + cell / M_PER_DEG, east: west - cell / kx + (w * cell) / kx, south: north + cell / M_PER_DEG - (h * cell) / M_PER_DEG },
    width: w,
    height: h,
  };
  const inside = polygonMask(raster, [lawn]);
  const r = passageM / 2 / cell;
  // Where the robot's middle can be: at least half its width from every edge (the edge is half a cell past the last inside cell).
  const outside = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) outside[i] = inside[i] ? 0 : 1;
  const toEdge = distance2(outside, w, h);
  const middle = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) middle[i] = inside[i] && Math.sqrt(toEdge[i]) - 0.5 >= r ? 1 : 0;
  // What it sweeps: within half its width of where its middle goes.
  const toMiddle = distance2(middle, w, h);
  const steep = grid ? polygonMask(raster, steepAreas(grid, [lawn], TRIM_STEEP_PCT)) : new Uint8Array(inside.length);
  const reach = new Uint8Array(inside.length);
  let lawnCells = 0;
  let narrow = 0;
  let steepCells = 0;
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue;
    lawnCells++;
    if (steep[i]) steepCells++;
    else if (Math.sqrt(toMiddle[i]) > r + 0.5) narrow++;
    else reach[i] = 1;
  }
  if (!lawnCells) return { trim: { narrow: 0, steep: 0, pocket: 0 }, surface: 1, trimAreas: [] };
  const minCells = MIN_ZONE_M2 / (cell * cell);
  let pocket = 0;
  for (const cells of labelRegions(reach, w, h).regions) {
    if (cells.length >= minCells) continue;
    pocket += cells.length;
    for (const i of cells) reach[i] = 0;
  }
  // The trim, drawn: what's on the lawn and not the robots', in pieces big enough to see.
  const trimOn = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) trimOn[i] = inside[i] && !reach[i] ? 1 : 0;
  const minDrawn = MIN_DRAWN_M2 / (cell * cell);
  const trimAreas = labelRegions(trimOn, w, h)
    .regions.filter((cells) => cells.length >= minDrawn)
    .map((cells) => regionGeometry(raster, cells));
  return {
    trim: { narrow: narrow / lawnCells, steep: steepCells / lawnCells, pocket: pocket / lawnCells },
    surface: grid ? surfaceFactor(grid, [lawn]) : 1,
    trimAreas,
  };
}

/**
 * A course's turf or a farm's fields: no strips to speak of at that scale,
 * so only the ground steeper than 40° is trimmed (the same patches the
 * slope shares count) and the slopes' surface counted.
 */
export function fieldGroundShares(shapes: Shape[], grid: TerrainGrid, steepShare: number): GroundShares {
  return {
    trim: { narrow: 0, steep: steepShare, pocket: 0 },
    surface: surfaceFactor(grid, shapes),
    trimAreas: steepAreas(grid, shapes, TRIM_STEEP_PCT).filter((g) => area({ type: "Feature", geometry: g, properties: {} }) >= MIN_DRAWN_M2),
  };
}
