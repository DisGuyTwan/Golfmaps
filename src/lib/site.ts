/**
 * How hard a property is for a robot mower: the shape of what's mowed
 * (separate areas, narrow passages, obstacles, edges) and the terrain under it
 * (slope and tree cover, from terrain.ts). The score feeds the model
 * recommendation in mowers.ts. Pure, so it's tested without a browser.
 */
import area from "@turf/area";
import type { MultiPolygon, Polygon, Position } from "geojson";
import { labelRegions, polygonMask } from "./landcover";
import { QUOTE_CATEGORIES, type QuoteSettings } from "./quote";
import { baseline, overhead, polygonArea, reachOnFields, reachOnLot, stripes, type Coverage, type LocalPolygon, type Pace } from "./coverage";
import { COVER, NO_SLOPE, terrainStats, type TerrainGrid, type TerrainStats } from "./terrain";
import type { CourseMeasurement, SodMeasurement } from "./types";

/** Areas smaller than this (m²) aren't counted as a separate lawn: a strip by the steps, a corner. */
const MIN_PART_M2 = 5;
/** Narrowest passage widths (m) tried when looking for bottlenecks. */
const WIDTHS_M = Array.from({ length: 22 }, (_, i) => Math.round((0.4 + i * 0.1) * 10) / 10);
/** A pocket of robot positions smaller than this (m²) is a dead end, not a zone. */
const MIN_ZONE_M2 = 2;

/** The shape of a lawn, as a robot sees it. */
export interface ShapeStats {
  areaM2: number;
  /** Separate lawn areas, e.g. front and back yards cut apart by the house and driveway. */
  parts: number;
  /**
   * Narrowest passage (m) a robot must drive through to cover an area in one
   * go, e.g. a side yard between the house and the fence. Null when every
   * area stays in one piece at 2.5 m.
   */
  narrowestM: number | null;
  /** Islands inside the lawn a robot has to go around: beds, sheds, pools, traced areas. */
  obstacles: number;
  /** Metres of lawn edge per 100 m² (a 20 × 20 m square has 20); scored through `shapes`, used for ZeroTrim. */
  edgePer100: number;
  /** Zones a robot that needs `widthM` of passage would have to be set up with (separate areas, each split at its bottlenecks). */
  zonesAt: (widthM: number) => number;
}

function polygons(geom: Polygon | MultiPolygon): Position[][][] {
  return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
}

/**
 * Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher):
 * for each cell, the squared distance in cells to the nearest cell where
 * `inside` is 0.
 */
function distanceTransform(inside: Uint8Array, w: number, h: number): Float64Array {
  const INF = 1e20;
  const d = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = inside[i] ? INF : 0;
  const n = Math.max(w, h);
  const f = new Float64Array(n), out = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const pass = (len: number, get: (i: number) => number, set: (i: number, x: number) => void) => {
    for (let i = 0; i < len; i++) f[i] = get(i);
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
    for (let i = 0; i < len; i++) set(i, out[i]);
  };
  for (let c = 0; c < w; c++) pass(h, (r) => d[r * w + c], (r, x) => (d[r * w + c] = x));
  for (let r = 0; r < h; r++) pass(w, (c) => d[r * w + c], (c, x) => (d[r * w + c] = x));
  return d;
}

/** 8-connected regions where `on` is 1: the label per cell (0 = off) and each region's size. */
function regions8(on: Uint8Array, w: number, h: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let start = 0; start < on.length; start++) {
    if (!on[start] || labels[start]) continue;
    const id = sizes.length;
    let size = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const r = Math.floor(i / w), c = i - r * w;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
          const j = rr * w + cc;
          if (on[j] && !labels[j]) {
            labels[j] = id;
            stack.push(j);
          }
        }
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/**
 * Analyses a lawn's shape on a fine raster (about 0.2 m cells, coarser for a
 * big lawn so it stays fast): its separate areas, the passages between their
 * parts (from the distance to the nearest edge: a robot of width w can only
 * drive where that is at least w / 2), islands and edge length.
 */
export function lawnShape(geom: Polygon | MultiPolygon): ShapeStats {
  const areaM2 = area({ type: "Feature", geometry: geom, properties: {} });
  const polys = polygons(geom);
  const all = polys.flat(2);
  const lat0 = all.reduce((s, p) => s + p[1], 0) / all.length;
  const lon0 = all.reduce((s, p) => s + p[0], 0) / all.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 111320;
  const local = polys.map((rings) => rings.map((ring) => ring.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky])));

  let edge = 0;
  let obstacles = 0;
  for (const rings of local) {
    rings.forEach((ring, i) => {
      for (let k = 1; k < ring.length; k++) edge += Math.hypot(ring[k][0] - ring[k - 1][0], ring[k][1] - ring[k - 1][1]);
      if (i > 0) obstacles++;
    });
  }

  const cell = Math.max(0.2, Math.sqrt(areaM2 / 250000));
  const xs = local.flat(2).map((p) => p[0]);
  const ys = local.flat(2).map((p) => p[1]);
  const minX = Math.min(...xs) - 2 * cell, maxY = Math.max(...ys) + 2 * cell;
  const w = Math.ceil((Math.max(...xs) + 2 * cell - minX) / cell);
  const h = Math.ceil((maxY - (Math.min(...ys) - 2 * cell)) / cell);
  const mask = new Uint8Array(w * h);
  for (const rings of local) {
    for (let r = 0; r < h; r++) {
      const y = maxY - (r + 0.5) * cell;
      const cross: number[] = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [x1, y1] = ring[j], [x2, y2] = ring[i];
          if (y1 > y !== y2 > y) cross.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      cross.sort((a, b) => a - b);
      for (let k = 0; k + 1 < cross.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((cross[k] - minX) / cell - 0.5));
        const c1 = Math.min(w - 1, Math.ceil((cross[k + 1] - minX) / cell - 0.5) - 1);
        for (let c = c0; c <= c1; c++) mask[r * w + c] = 1;
      }
    }
  }

  const cellM2 = cell * cell;
  const parts = regions8(mask, w, h);
  const partOf = parts.labels;
  const bigPart = parts.sizes.map((s) => s * cellM2 >= MIN_PART_M2);
  const partCount = bigPart.filter((b, i) => i > 0 && b).length;
  // Distance (m) from each lawn cell's centre to the nearest edge.
  const sq = distanceTransform(mask, w, h);
  const clearance = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) clearance[i] = mask[i] ? Math.sqrt(sq[i]) * cell - cell / 2 : 0;

  const cache = new Map<number, number[]>();
  /** Zones per lawn part for a robot needing `widthM`: pockets of positions it can reach, big enough to count. */
  const zonesPerPart = (widthM: number): number[] => {
    const hit = cache.get(widthM);
    if (hit) return hit;
    const reach = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) reach[i] = mask[i] && bigPart[partOf[i]] && clearance[i] >= widthM / 2 ? 1 : 0;
    const pockets = regions8(reach, w, h);
    const perPart = new Array<number>(parts.sizes.length).fill(0);
    const seen = new Set<number>();
    for (let i = 0; i < w * h; i++) {
      const p = pockets.labels[i];
      if (!p || seen.has(p)) continue;
      seen.add(p);
      if (pockets.sizes[p] * cellM2 >= MIN_ZONE_M2) perPart[partOf[i]]++;
    }
    cache.set(widthM, perPart);
    return perPart;
  };

  let narrowestM: number | null = null;
  for (const width of WIDTHS_M) {
    if (zonesPerPart(width).some((z) => z > 1)) {
      narrowestM = Math.round((width - 0.1) * 10) / 10;
      break;
    }
  }

  return {
    areaM2,
    parts: partCount,
    narrowestM,
    obstacles,
    edgePer100: areaM2 > 0 ? (edge / areaM2) * 100 : 0,
    // An area too narrow for the robot anywhere still has to be mowed: it counts as one zone (by hand or a trimmer).
    zonesAt: (widthM) => zonesPerPart(widthM).reduce((s, z, i) => s + (i > 0 && bigPart[i] ? Math.max(1, z) : 0), 0),
  };
}

export type SiteKind = "lawn" | "golf" | "sod";

/** What a recommendation is based on. Terrain is null while loading or where there's no LiDAR. */
export interface Site {
  kind: SiteKind;
  /** Area to mow (m²): the lawn, the quoted turf or the included sod fields. */
  areaM2: number;
  /** Separate areas to mow: lawn parts, turf patches or fields. */
  parts: number;
  /** Lawns only: the shape analysis. */
  shape: ShapeStats | null;
  terrain: TerrainStats | null;
  /** Golf: fairways (and their area) are in the quote, so the robot must cut fairway height. */
  fairwayM2: number;
  /** The layout: stripes, driving from the charger and between areas, against a plain square (coverage.ts). */
  coverage: Coverage | null;
  /** Where the charger is, [lon, lat]: placed by the rep, or estimated (`chargerEstimated`). */
  charger: [number, number] | null;
  chargerEstimated: boolean;
}

export type Level = "simple" | "moderate" | "complex";
export type ReasonKey = "parts" | "narrow" | "shapes" | "travel" | "steep" | "slope" | "canopy" | "obstacles" | "noTerrain";

/** One thing that makes the property harder, with its weight (1-3) and the value behind it (and the farthest distance, for travel). */
export interface Reason {
  key: ReasonKey;
  points: number;
  value: number;
  farM?: number;
}

/** A typical robot for each kind of site, to score the layout before choosing one: a 22 cm residential robot, a 40 in. Voyager. */
const REFERENCE_PACE: Record<SiteKind, Pace> = {
  lawn: { stripeM: 0.19, speedMS: 0.35, turnS: 8, runtimeMin: 90 },
  golf: { stripeM: 0.92, speedMS: 2.5, turnS: 12, runtimeMin: 480 },
  sod: { stripeM: 0.92, speedMS: 2.5, turnS: 12, runtimeMin: 480 },
};

export interface Complexity {
  level: Level;
  points: number;
  reasons: Reason[];
}

/**
 * Scores the property: each difficulty adds 1-3 points, 0-2 is simple, 3-5
 * moderate, 6 or more complex. Thresholds are the robots' practical limits:
 * 40 % slope for most Kress models, tree cover that blocks RTK satellite
 * signal, passages around a robot's width, and the extra time a typical robot
 * would spend in turns, broken stripes and edges, or driving (coverage.ts).
 */
export function complexity(site: Site): Complexity {
  const reasons: Reason[] = [];
  const add = (key: ReasonKey, points: number, value: number) => points > 0 && reasons.push({ key, points, value });
  const { parts, shape, terrain } = site;

  if (site.kind === "lawn") add("parts", parts >= 5 ? 3 : parts >= 3 ? 2 : parts === 2 ? 1 : 0, parts);
  else add("parts", parts >= 9 ? 3 : parts >= 4 ? 2 : parts >= 2 ? 1 : 0, parts);
  if (site.coverage) {
    const o = overhead(site.coverage, REFERENCE_PACE[site.kind]);
    add("shapes", o.shape > 0.25 ? 2 : o.shape > 0.1 ? 1 : 0, o.shape);
    if (o.travel > 0.08) reasons.push({ key: "travel", points: o.travel > 0.2 ? 2 : 1, value: o.travel, farM: site.coverage.reach.farM });
  }
  if (shape) {
    if (shape.narrowestM !== null) add("narrow", shape.narrowestM < 1 ? 2 : shape.narrowestM < 1.5 ? 1 : 0, shape.narrowestM);
    add("obstacles", shape.obstacles >= 6 ? 2 : shape.obstacles >= 3 ? 1 : 0, shape.obstacles);
  }
  if (terrain && terrain.coverage >= 0.5) {
    if (terrain.over40 > 0.02) add("steep", 3, terrain.over40);
    else add("slope", terrain.over25 > 0.05 ? 2 : terrain.slopeP90 > 15 ? 1 : 0, terrain.slopeP90);
    add("canopy", terrain.canopy > 0.4 ? 3 : terrain.canopy > 0.2 ? 2 : terrain.canopy > 0.1 ? 1 : 0, terrain.canopy);
  } else {
    reasons.push({ key: "noTerrain", points: 0, value: 0 });
  }

  const points = reasons.reduce((s, r) => s + r.points, 0);
  return { level: points >= 6 ? "complex" : points >= 3 ? "moderate" : "simple", points, reasons: reasons.sort((a, b) => b.points - a.points) };
}

const ACRE_M2 = 4046.86;
type Shape = Polygon | MultiPolygon;
const pieces = (geoms: Shape[]) => geoms.reduce((n, g) => n + (g.type === "Polygon" ? 1 : g.coordinates.length), 0);

/** Tree cover bigger than this (m²) is woods, which isn't mowed, rather than trees over the turf. */
const WOODS_M2 = 5000;

/**
 * Terrain under a course's turf. When the turf is the whole outline (rough
 * estimated, or only an outline), the woods inside it are left out: their
 * trees aren't over anything mowed and their slopes don't matter.
 */
function turfTerrain(grid: TerrainGrid, shapes: Shape[], dropWoods: boolean): TerrainStats | null {
  if (!dropWoods) return terrainStats(grid, shapes);
  const inside = polygonMask(grid, shapes);
  const trees = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) trees[i] = inside[i] && grid.cover[i] === COVER.tree ? 1 : 0;
  const slope = grid.slope.slice();
  const minCells = WOODS_M2 / (grid.cellM * grid.cellM);
  for (const cells of labelRegions(trees, grid.width, grid.height).regions) {
    if (cells.length >= minCells) for (const i of cells) slope[i] = NO_SLOPE;
  }
  return terrainStats({ ...grid, slope }, shapes);
}

/** Local metres around a point, and back: plenty accurate over a lot or a course. */
function frame(lon0: number, lat0: number) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toLocal = ([lon, lat]: Position): [number, number] => [(lon - lon0) * kx, (lat - lat0) * 111320];
  const toLonLat = ([x, y]: [number, number]): [number, number] => [lon0 + x / kx, lat0 + y / 111320];
  const polygons = (geoms: Shape[]): LocalPolygon[] =>
    geoms.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates)).map((rings) => rings.map((ring) => ring.map(toLocal)));
  return { toLocal, toLonLat, polygons };
}

const firstPoint = (g: Shape): Position => (g.type === "Polygon" ? g.coordinates[0][0] : g.coordinates[0][0][0]);
const largest = (parts: LocalPolygon[]) => parts.reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a));
const ringCentroid = (p: LocalPolygon): [number, number] => {
  const ring = p[0];
  const n = ring.length - 1 || 1;
  return [ring.slice(0, n).reduce((s, q) => s + q[0], 0) / n, ring.slice(0, n).reduce((s, q) => s + q[1], 0) / n];
};
/** Distance from a point to a ring's edges. */
function toRing(p: [number, number], ring: [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy));
  }
  return best;
}

/**
 * Where a lawn's charger most likely goes: on the edge of the biggest lawn
 * area, at the point closest to the house (power, and out of the way), or
 * nearest the middle of the lot when there's no building.
 */
function lawnCharger(parts: LocalPolygon[], house: LocalPolygon | null, lot: LocalPolygon[]): [number, number] {
  const edge = largest(parts)[0];
  const target = house ?? largest(lot);
  const centre = ringCentroid(target);
  let best = edge[0];
  let bestD = Infinity;
  for (const p of edge) {
    const d = house ? toRing(p, house[0]) : Math.hypot(p[0] - centre[0], p[1] - centre[1]);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * A residential lawn: its shape, the terrain under it, and its layout for a
 * robot: stripes, and driving from the charger (placed by the rep, else next
 * to the house) around buildings and pools (`blocked`) on the lot. `areaM2` is
 * the lawn (or the rep's override).
 */
export function lawnSite(
  lawn: Shape | null,
  lot: Shape,
  blocked: Shape[],
  charger: [number, number] | null,
  areaM2: number,
  terrain: TerrainGrid | null,
): Site {
  const shape = lawn ? lawnShape(lawn) : null;
  const [lon0, lat0] = firstPoint(lot);
  const f = frame(lon0, lat0);
  const parts = lawn ? f.polygons([lawn]).filter((p) => polygonArea(p) >= MIN_PART_M2) : [];
  let coverage: Coverage | null = null;
  let at: [number, number] | null = null;
  if (parts.length) {
    const lotParts = f.polygons([lot]);
    const blockedParts = f.polygons(blocked);
    const house = blockedParts.length ? largest(blockedParts) : null;
    at = charger ? f.toLocal(charger) : lawnCharger(parts, house, lotParts);
    const total = parts.reduce((s, p) => s + polygonArea(p), 0);
    coverage = {
      areaM2: total,
      stripes: stripes(parts, 0.5),
      reach: reachOnLot(parts, lotParts, blockedParts, at),
      base: baseline(total, true, 0.5),
    };
  }
  return {
    kind: "lawn",
    areaM2,
    parts: shape?.parts ?? 1,
    shape,
    terrain: lawn && terrain ? terrainStats(terrain, [lawn]) : null,
    fairwayM2: 0,
    coverage,
    charger: at ? f.toLonLat(at) : null,
    chargerEstimated: !charger,
  };
}

/** Layout of fields or turf patches, with the charger placed or in the middle of the biggest one. */
function fieldLayout(shapes: Shape[], charger: [number, number] | null, refM: number) {
  if (!shapes.length) return { coverage: null, charger: null };
  const [lon0, lat0] = firstPoint(shapes[0]);
  const f = frame(lon0, lat0);
  const parts = f.polygons(shapes).filter((p) => polygonArea(p) > 0);
  if (!parts.length) return { coverage: null, charger: null };
  const at = charger ? f.toLocal(charger) : ringCentroid(largest(parts));
  const total = parts.reduce((s, p) => s + polygonArea(p), 0);
  const coverage: Coverage = { areaM2: total, stripes: stripes(parts, refM), reach: reachOnFields(parts, at), base: baseline(total, false, refM) };
  return { coverage, charger: f.toLonLat(at) };
}

/**
 * A golf course: the quoted acres, separate turf patches among the included
 * categories (fairways on their own are many; with the rough it's one piece),
 * the terrain on the turf, not under the woods, and the layout.
 */
export function golfSite(
  m: CourseMeasurement,
  q: QuoteSettings,
  quotedAcres: number,
  terrain: TerrainGrid | null,
  charger: [number, number] | null = null,
): Site {
  const byCategory = (cats: string[]) =>
    m.geojson.features
      .filter((f) => cats.includes(String(f.properties?._category)) && (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"))
      .map((f) => f.geometry as Shape);
  const outline = byCategory(["course"]);
  const included = QUOTE_CATEGORIES.filter((c) => q.include[c] && c !== "range");
  const turf = byCategory(included);
  const roughEverywhere = q.include.rough && (m.roughEstimated || m.boundaryOnly);
  const shapes = roughEverywhere || !turf.length ? outline : turf;
  const layout = fieldLayout(shapes, charger, 5);
  return {
    kind: "golf",
    areaM2: quotedAcres * ACRE_M2,
    parts: Math.max(1, roughEverywhere ? pieces(outline) : pieces(turf)),
    shape: null,
    terrain: terrain && shapes.length ? turfTerrain(terrain, shapes, shapes === outline) : null,
    fairwayM2: q.include.fairway && !m.boundaryOnly ? m.fairway.acres * ACRE_M2 : 0,
    ...layout,
    chargerEstimated: !charger,
  };
}

/** A sod farm: the quoted acres, the included fields, the terrain on them, and the layout. */
export function sodSite(sod: SodMeasurement, quotedAcres: number, terrain: TerrainGrid | null, charger: [number, number] | null = null): Site {
  const fields = sod.fields.filter((f) => f.included).map((f) => f.geometry);
  return {
    kind: "sod",
    areaM2: quotedAcres * ACRE_M2,
    parts: Math.max(1, fields.length),
    shape: null,
    terrain: terrain && fields.length ? terrainStats(terrain, fields) : null,
    fairwayM2: 0,
    ...fieldLayout(fields, charger, 5),
    chargerEstimated: !charger,
  };
}
