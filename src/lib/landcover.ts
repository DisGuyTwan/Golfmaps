/**
 * Satellite land cover: grass inside a golf course outline (ESA WorldCover,
 * 10 m) and sod fields on a farm (Agriculture and Agri-Food Canada's Annual
 * Crop Inventory, 30 m, which has its own "Sod" class).
 *
 * Both arrive from /api/landcover as the same small grid: one class value per
 * cell, row-major from the north-west corner, in plain latitude/longitude
 * cells. Everything here is pure (no DOM, no network except fetchLandGrid), so
 * the counting is tested without a browser.
 */
import area from "@turf/area";
import { contours } from "d3-contour";
import type { MultiPolygon, Polygon, Position } from "geojson";
import { SQ_METERS_TO_ACRES } from "./area";
import type { BBox, SatelliteTurf, SodField } from "./types";

export type LandSource = "worldcover" | "aci";

/** A classified raster window. `bbox` is the outer edge of the cells. */
/** What every lat/lon grid here shares: its box and size, row-major from the north-west corner. */
export interface GridShape {
  bbox: BBox;
  width: number;
  height: number;
}

export interface LandGrid {
  source: LandSource;
  /** Year the land cover describes (WorldCover 2021, crop inventory 2025, …). */
  year: number;
  bbox: BBox;
  width: number;
  height: number;
  data: Uint8Array;
}

/** Largest window per source (degrees per side): a course, or a farm with margin. */
export const MAX_SPAN_DEG: Record<LandSource, number> = { worldcover: 0.08, aci: 0.15 };

/** ESA WorldCover 2021 class values. */
export const WC = {
  trees: 10,
  shrubs: 20,
  grass: 30,
  crops: 40,
  built: 50,
  bare: 60,
  water: 80,
  wetland: 90,
  mangroves: 95,
} as const;

/** Annual Crop Inventory class value for sod. */
export const ACI_SOD = 192;

/** Mean Earth radius (m), the one @turf/area uses, so both agree. */
const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

/** Area of one cell in row `row`, in acres (cells shrink toward the pole). */
export function cellAcres(grid: LandGrid, row: number): number {
  const { bbox, width, height } = grid;
  const cellH = (bbox.north - bbox.south) / height;
  const top = bbox.north - row * cellH;
  const dLon = ((bbox.east - bbox.west) / width) * RAD;
  const m2 = EARTH_RADIUS * EARTH_RADIUS * dLon * (Math.sin(top * RAD) - Math.sin((top - cellH) * RAD));
  return m2 * SQ_METERS_TO_ACRES;
}

/** Each polygon of the geometries as its rings ([lon, lat] positions). */
function polygonsOf(geoms: (Polygon | MultiPolygon)[]): Position[][][] {
  return geoms.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
}

/**
 * 1 for each cell whose center falls inside any of the polygons (holes
 * respected), else 0. Scanline fill, one pass per polygon and row.
 */
export function polygonMask(grid: GridShape, geoms: (Polygon | MultiPolygon)[]): Uint8Array {
  const { bbox, width, height } = grid;
  const cellW = (bbox.east - bbox.west) / width;
  const cellH = (bbox.north - bbox.south) / height;
  const mask = new Uint8Array(width * height);
  for (const rings of polygonsOf(geoms)) {
    for (let r = 0; r < height; r++) {
      const lat = bbox.north - (r + 0.5) * cellH;
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [x1, y1] = ring[j];
          const [x2, y2] = ring[i];
          if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      // Even-odd: cells centered between each pair of crossings are inside.
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - bbox.west) / cellW - 0.5));
        const c1 = Math.min(width - 1, Math.ceil((xs[k + 1] - bbox.west) / cellW - 0.5) - 1);
        for (let c = c0; c <= c1; c++) mask[r * width + c] = 1;
      }
    }
  }
  return mask;
}

/** Acres per class value, counting only the cells where `mask` is 1. */
export function classAcres(grid: LandGrid, mask: Uint8Array): Map<number, number> {
  const out = new Map<number, number>();
  for (let r = 0; r < grid.height; r++) {
    const cell = cellAcres(grid, r);
    for (let c = 0; c < grid.width; c++) {
      const i = r * grid.width + c;
      if (!mask[i]) continue;
      out.set(grid.data[i], (out.get(grid.data[i]) ?? 0) + cell);
    }
  }
  return out;
}

/**
 * Satellite grass is not all turf: WorldCover's "grassland" also takes in hay,
 * meadows, native and buffer areas inside the property. Calibrated on the 45
 * courses in Ontario, Quebec and the neighbouring states whose turf is fully
 * mapped in OpenStreetMap (fairways, greens, tees, rough, range; Overture
 * release 2026-10-21): maintained turf was a median 59% of the grass inside
 * the outline (left-one-out median error 16%), and for the middle 60% of
 * courses the mapped turf fell between 0.79 and 1.26 times that estimate.
 * Same order as GCSAA's 2021 median of 95 acres of maintained turf per 18
 * holes. scripts/calibrate-satellite-turf.py recomputes both.
 */
export const TURF_PER_GRASS = 0.59;
export const TURF_RANGE: readonly [number, number] = [0.79, 1.26];

/** Maintained turf estimated from the satellite grass, with its likely range. */
export function estimatedTurf(s: SatelliteTurf): { acres: number; low: number; high: number } {
  const acres = s.grassAcres * TURF_PER_GRASS;
  return { acres, low: acres * TURF_RANGE[0], high: acres * TURF_RANGE[1] };
}

/**
 * What covers the inside of a course outline, from WorldCover. Only
 * "grassland" can be turf: managed lawns land there, while trees, shrubs,
 * buildings, water and the odd cropland pixel stay out. `estimatedTurf` then
 * takes the share of that grass that is maintained turf.
 */
export function satelliteTurf(grid: LandGrid, outline: (Polygon | MultiPolygon)[]): SatelliteTurf {
  const byClass = classAcres(grid, polygonMask(grid, outline));
  const get = (...values: number[]) => values.reduce((sum, v) => sum + (byClass.get(v) ?? 0), 0);
  const outlineAcres = [...byClass.values()].reduce((a, b) => a + b, 0);
  const grassAcres = get(WC.grass);
  const treesAcres = get(WC.trees, WC.shrubs);
  const builtAcres = get(WC.built);
  const waterAcres = get(WC.water, WC.wetland, WC.mangroves);
  return {
    grassAcres,
    treesAcres,
    builtAcres,
    waterAcres,
    otherAcres: Math.max(0, outlineAcres - grassAcres - treesAcres - builtAcres - waterAcres),
    outlineAcres,
    year: grid.year,
  };
}

/**
 * Labels 4-connected regions where `on[i]` is 1. Returns the label per cell
 * (0 = off) and, per label, its cells' indices.
 */
export function labelRegions(on: Uint8Array, width: number, height: number): { labels: Int32Array; regions: number[][] } {
  const labels = new Int32Array(width * height);
  const regions: number[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < on.length; start++) {
    if (!on[start] || labels[start]) continue;
    const id = regions.length + 1;
    const cells: number[] = [];
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const r = Math.floor(i / width);
      const c = i - r * width;
      const next = [c > 0 ? i - 1 : -1, c < width - 1 ? i + 1 : -1, r > 0 ? i - width : -1, r < height - 1 ? i + width : -1];
      for (const n of next) {
        if (n >= 0 && on[n] && !labels[n]) {
          labels[n] = id;
          stack.push(n);
        }
      }
    }
    regions.push(cells);
  }
  return { labels, regions };
}

/** The cell farthest from the region's edge (chamfer distance), so a label or tap point sits well inside. */
function deepestCell(cells: number[], labels: Int32Array, id: number, width: number): number {
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (const i of cells) {
    const r = Math.floor(i / width);
    const c = i - r * width;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  const w = maxC - minC + 3;
  const h = maxR - minR + 3;
  const dist = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const gr = minR + r - 1;
      const gc = minC + c - 1;
      const inside = gr >= minR && gr <= maxR && gc >= minC && gc <= maxC && labels[gr * width + gc] === id;
      dist[r * w + c] = inside ? Infinity : 0;
    }
  }
  for (let r = 1; r < h - 1; r++) {
    for (let c = 1; c < w - 1; c++) {
      const i = r * w + c;
      dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - w] + 1, dist[i - w - 1] + 1.4, dist[i - w + 1] + 1.4);
    }
  }
  let best = cells[0];
  let bestDist = -1;
  for (let r = h - 2; r >= 1; r--) {
    for (let c = w - 2; c >= 1; c--) {
      const i = r * w + c;
      dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + w] + 1, dist[i + w + 1] + 1.4, dist[i + w - 1] + 1.4);
      if (dist[i] !== Infinity && dist[i] > bestDist) {
        bestDist = dist[i];
        best = (minR + r - 1) * width + (minC + c - 1);
      }
    }
  }
  return best;
}

/** Outline of one labelled region as a lon/lat (Multi)Polygon, via marching squares. */
export function regionGeometry(grid: GridShape, cells: number[]): Polygon | MultiPolygon {
  const { bbox, width, height } = grid;
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (const i of cells) {
    const r = Math.floor(i / width);
    const c = i - r * width;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  // One empty cell of padding on every side, so rings always close.
  const w = maxC - minC + 3;
  const h = maxR - minR + 3;
  const values = new Array<number>(w * h).fill(0);
  for (const i of cells) {
    const r = Math.floor(i / width);
    const c = i - r * width;
    values[(r - minR + 1) * w + (c - minC + 1)] = 1;
  }
  const [shape] = contours().size([w, h]).thresholds([0.5])(values);
  const cellW = (bbox.east - bbox.west) / width;
  const cellH = (bbox.north - bbox.south) / height;
  const toLonLat = ([x, y]: Position): Position => [
    bbox.west + (minC - 1 + x) * cellW,
    bbox.north - (minR - 1 + y) * cellH,
  ];
  // d3 winds rings the other way round from GeoJSON once y points south; flip them back.
  const polygons = shape.coordinates.map((rings) => rings.map((ring) => ring.map(toLonLat).reverse()));
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}

/** Center of cell `i` as [lat, lon]. */
function cellCenter(grid: LandGrid, i: number): [number, number] {
  const { bbox, width, height } = grid;
  const r = Math.floor(i / width);
  const c = i - r * width;
  return [
    bbox.north - ((r + 0.5) * (bbox.north - bbox.south)) / height,
    bbox.west + ((c + 0.5) * (bbox.east - bbox.west)) / width,
  ];
}

/**
 * Sod fields in a crop-inventory grid, biggest first. Small enclosed gaps
 * (a few misread pixels inside a field) are filled; specks smaller than
 * `minAcres` are dropped as noise. Acres come from the cells themselves, not
 * the drawn outline, so they match the data exactly.
 */
export function findSodFields(
  grid: LandGrid,
  { minAcres = 1, fillGapAcres = 1 }: { minAcres?: number; fillGapAcres?: number } = {},
): SodField[] {
  const { width, height, data } = grid;
  const on = new Uint8Array(width * height);
  for (let i = 0; i < on.length; i++) on[i] = data[i] === ACI_SOD ? 1 : 0;

  const rowAcres = Array.from({ length: height }, (_, r) => cellAcres(grid, r));
  const regionAcres = (cells: number[]) => cells.reduce((sum, i) => sum + rowAcres[Math.floor(i / width)], 0);

  // Fill small gaps fully enclosed by sod (they don't touch the window's edge).
  const off = new Uint8Array(on.length);
  for (let i = 0; i < on.length; i++) off[i] = on[i] ? 0 : 1;
  for (const cells of labelRegions(off, width, height).regions) {
    const touchesEdge = cells.some((i) => {
      const r = Math.floor(i / width);
      const c = i - r * width;
      return r === 0 || c === 0 || r === height - 1 || c === width - 1;
    });
    if (!touchesEdge && regionAcres(cells) < fillGapAcres) for (const i of cells) on[i] = 1;
  }

  const { labels, regions } = labelRegions(on, width, height);
  return regions
    .map((cells, k) => ({ cells, id: k + 1, acres: regionAcres(cells) }))
    .filter((r) => r.acres >= minAcres)
    .sort((a, b) => b.acres - a.acres)
    .map((r, n) => ({
      id: `d${n + 1}`,
      acres: r.acres,
      geometry: regionGeometry(grid, r.cells),
      anchor: cellCenter(grid, deepestCell(r.cells, labels, r.id, width)),
      traced: false,
      included: true,
    }));
}

/** Is [lon, lat] inside the (Multi)Polygon? Even-odd over each polygon's rings. */
export function pointInGeometry(lon: number, lat: number, geom: Polygon | MultiPolygon): boolean {
  return polygonsOf([geom]).some((rings) => {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if (y1 > lat !== y2 > lat && lon < x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1)) inside = !inside;
      }
    }
    return inside;
  });
}

/** A closed polygon from tapped [lat, lon] points (at least 3). */
export function tracedPolygon(points: [number, number][]): Polygon {
  const ring = points.map(([lat, lon]) => [lon, lat]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

/** The tapped points back from a traced polygon (outer ring, closing point dropped), [lat, lon]. */
export function tracedPoints(geom: Polygon | MultiPolygon): [number, number][] {
  const ring = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
  return ring.slice(0, -1).map(([lon, lat]) => [lat, lon]);
}

/** A field traced by hand on the satellite image. */
export function tracedField(points: [number, number][], id: string): SodField {
  const geometry = tracedPolygon(points);
  const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const lon = points.reduce((s, p) => s + p[1], 0) / points.length;
  return {
    id,
    acres: area(geometry) * SQ_METERS_TO_ACRES,
    geometry,
    anchor: [lat, lon],
    traced: true,
    included: true,
  };
}

/** Bounding box of the geometries, grown by `marginDeg` on every side. */
export function geometryBBox(geoms: (Polygon | MultiPolygon)[], marginDeg = 0.0005): BBox | null {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const rings of polygonsOf(geoms)) {
    for (const [lon, lat] of rings[0] ?? []) {
      south = Math.min(south, lat); north = Math.max(north, lat);
      west = Math.min(west, lon); east = Math.max(east, lon);
    }
  }
  if (!Number.isFinite(south)) return null;
  return { south: south - marginDeg, west: west - marginDeg, north: north + marginDeg, east: east + marginDeg };
}

/** True when the box is small enough for the source (see MAX_SPAN_DEG). */
export function fitsSource(bbox: BBox, source: LandSource): boolean {
  return bbox.north - bbox.south <= MAX_SPAN_DEG[source] && bbox.east - bbox.west <= MAX_SPAN_DEG[source];
}

/**
 * RGBA pixels (row-major, like the grid) painting `color` on cells inside
 * `mask` whose class is in `classes`; everything else is transparent. Drawn
 * onto a canvas for the map overlay.
 */
export function overlayPixels(
  grid: LandGrid,
  mask: Uint8Array,
  classes: number[],
  color: [number, number, number, number],
): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(grid.width * grid.height * 4);
  const wanted = new Set(classes);
  for (let i = 0; i < grid.data.length; i++) {
    if (!mask[i] || !wanted.has(grid.data[i])) continue;
    px.set(color, i * 4);
  }
  return px;
}

/** The JSON /api/landcover answers with (data is base64). */
export interface LandGridJson {
  source: LandSource;
  year: number;
  bbox: BBox;
  width: number;
  height: number;
  data: string;
}

export function decodeGrid(json: LandGridJson): LandGrid {
  const bin = atob(json.data);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  if (data.length !== json.width * json.height) throw new Error("Land cover grid size mismatch");
  return { ...json, data };
}

/** Thrown when /api/landcover answers with an error (status kept for messages). */
export class LandcoverHttpError extends Error {
  constructor(public status: number) {
    super(`Land cover request failed (HTTP ${status})`);
    this.name = "LandcoverHttpError";
  }
}

/** "s,w,n,e" rounded to 5 decimals, so the same area shares the CDN entry. */
function bboxKey({ south, west, north, east }: BBox): string {
  return [south, west, north, east].map((v) => v.toFixed(5)).join(",");
}

/** Fetches a land cover window through this app's cached route. */
export async function fetchLandGrid(source: LandSource, bbox: BBox): Promise<LandGrid> {
  const response = await fetch(`/api/landcover?src=${source}&bbox=${bboxKey(bbox)}`, {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new LandcoverHttpError(response.status);
  return decodeGrid((await response.json()) as LandGridJson);
}
