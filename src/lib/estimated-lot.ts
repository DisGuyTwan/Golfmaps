/**
 * A house lot estimated where there's no open cadastre. Ontario's parcels
 * are Teranet's (licensed, not open), so outside Quebec the lot is drawn
 * from what stands around the house instead: the ground nearer this house
 * than any other (side lot lines fall midway between houses, the back one
 * midway to the house behind), short of the street's road allowance (the
 * front lot line), and at most `REACH_M` from the house where nothing else
 * bounds it (a corner lot, a park behind). Garages and sheds aren't
 * neighbours: they stand on someone's lot. The buildings are OpenStreetMap's
 * (Ontario's towns mostly have them), else the LiDAR's.
 * An estimate, and the panel says so: the rep traces the lot where it's off.
 * Pure, so it's tested without a browser.
 */
import area from "@turf/area";
import osmtogeojson from "osmtogeojson";
import type { MultiPolygon, Polygon, Position } from "geojson";
import { labelRegions, pointInGeometry, polygonMask, regionGeometry, type GridShape } from "./landcover";
import { STRAIGHTEN_CELLS, straighten } from "./terrain";

export interface LotBuilding {
  geometry: Polygon | MultiPolygon;
  /** A garage, shed or carport: it doesn't bound a lot. */
  outbuilding: boolean;
}

export interface LotStreet {
  /** The centre line, [lon, lat]. */
  line: Position[];
  /** Half its road allowance: centre line to the lot line (m). */
  halfM: number;
}

export interface LotInputs {
  buildings: LotBuilding[];
  streets: LotStreet[];
}

export interface EstimatedLot {
  lot: Polygon;
  /** The house it was drawn around. */
  house: Polygon | MultiPolygon;
}

/** Farthest the lot reaches from the house where no neighbour or street bounds it (m). */
export const REACH_M = 25;
/** A house within this of the point is the one meant, when the point isn't on a building (m). */
export const PICK_M = 20;
/** Buildings smaller than this are outbuildings (a double garage is about 45 m²). */
export const OUTBUILDING_M2 = 50;
/** Bigger than this isn't a house: a school, a store, a plaza. Traced instead. */
export const HOUSE_MAX_M2 = 800;
/**
 * Half the road allowance by road class (m): Ontario's local streets are
 * 18-20 m between lot lines (66 ft in older towns), collectors and arterials
 * 26-36 m.
 */
export const ALLOWANCE_HALF_M: Record<string, number> = {
  motorway: 30,
  trunk: 18,
  primary: 18,
  secondary: 15,
  tertiary: 13,
  unclassified: 10,
  residential: 10,
  road: 10,
  living_street: 8,
};

const OUTBUILDINGS = new Set(["garage", "garages", "shed", "carport", "roof", "greenhouse", "hut", "kiosk"]);
/** Half the grid's side (m) and its cell (m). */
const BOX_M = 60;
const CELL_M = 1;
const M_PER_DEG = 111_320;

/** The buildings and streets in an Overpass lawn lookup (overpass.ts), for `estimateLot`. */
export function lotInputs(overpassJson: unknown): LotInputs {
  const buildings: LotBuilding[] = [];
  const streets: LotStreet[] = [];
  for (const f of osmtogeojson(overpassJson).features) {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const g = f.geometry;
    if (!g) continue;
    if (props.building && (g.type === "Polygon" || g.type === "MultiPolygon")) {
      buildings.push({ geometry: g, outbuilding: OUTBUILDINGS.has(String(props.building)) });
    } else if (typeof props.highway === "string" && props.area !== "yes" && g.type === "LineString") {
      const halfM = ALLOWANCE_HALF_M[props.highway.replace(/_link$/, "")];
      if (halfM) streets.push({ line: g.coordinates, halfM });
    }
  }
  return { buildings, streets };
}

type XY = [number, number];

interface Shape {
  geometry: Polygon | MultiPolygon;
  /** Each ring, in metres from the point. */
  rings: XY[][];
  box: [number, number, number, number];
  m2: number;
}

function segmentDistance(px: number, py: number, [ax, ay]: XY, [bx, by]: XY): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance from a point to a shape's outline (m). */
function edgeDistance(s: Shape, x: number, y: number): number {
  let best = Infinity;
  for (const ring of s.rings) for (let i = 1; i < ring.length; i++) best = Math.min(best, segmentDistance(x, y, ring[i - 1], ring[i]));
  return best;
}

/** Distance from a point to a shape's box: never more than to the shape itself. */
function boxDistance(s: Shape, x: number, y: number): number {
  const [x0, y0, x1, y1] = s.box;
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
}

/**
 * The lot around the house at (or nearest, within `PICK_M`) a point, from
 * the buildings and streets around it; null when there's no house there
 * (nothing near the point, or a building too big to be one).
 */
export function estimateLot(lat: number, lon: number, inputs: LotInputs): EstimatedLot | null {
  const kx = M_PER_DEG * Math.cos((lat * Math.PI) / 180);
  const ky = M_PER_DEG;
  const toXY = ([x, y]: Position): XY => [(x - lon) * kx, (y - lat) * ky];
  const shapeOf = (geometry: Polygon | MultiPolygon): Shape => {
    const rings = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).flatMap((poly) => poly.map((ring) => ring.map(toXY)));
    const xs = rings.flat().map((p) => p[0]);
    const ys = rings.flat().map((p) => p[1]);
    return { geometry, rings, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], m2: area({ type: "Feature", geometry, properties: {} }) };
  };
  const houses = inputs.buildings
    .filter((b) => !b.outbuilding)
    .map((b) => shapeOf(b.geometry))
    .filter((s) => s.m2 >= OUTBUILDING_M2 && boxDistance(s, 0, 0) < BOX_M);
  const home =
    houses.find((s) => pointInGeometry(lon, lat, s.geometry)) ??
    houses
      .map((s) => ({ s, d: edgeDistance(s, 0, 0) }))
      .filter((h) => h.d <= PICK_M)
      .sort((a, b) => a.d - b.d)[0]?.s;
  if (!home || home.m2 > HOUSE_MAX_M2) return null;
  const others = houses.filter((s) => s !== home);

  const n = Math.round((2 * BOX_M) / CELL_M);
  const grid: GridShape = {
    bbox: { south: lat - BOX_M / ky, north: lat + BOX_M / ky, west: lon - BOX_M / kx, east: lon + BOX_M / kx },
    width: n,
    height: n,
  };
  const x = (c: number) => -BOX_M + (c + 0.5) * CELL_M;
  const y = (r: number) => BOX_M - (r + 0.5) * CELL_M;
  const inHome = polygonMask(grid, [home.geometry]);
  const inOther = polygonMask(grid, others.map((s) => s.geometry));

  // The road allowance along each street, cell by cell near each segment.
  const road = new Uint8Array(n * n);
  for (const street of inputs.streets) {
    const line = street.line.map(toXY);
    for (let k = 1; k < line.length; k++) {
      const [a, b] = [line[k - 1], line[k]];
      const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - street.halfM + BOX_M) / CELL_M));
      const c1 = Math.min(n - 1, Math.ceil((Math.max(a[0], b[0]) + street.halfM + BOX_M) / CELL_M));
      const r0 = Math.max(0, Math.floor((BOX_M - Math.max(a[1], b[1]) - street.halfM) / CELL_M));
      const r1 = Math.min(n - 1, Math.ceil((BOX_M - Math.min(a[1], b[1]) + street.halfM) / CELL_M));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) if (segmentDistance(x(c), y(r), a, b) < street.halfM) road[r * n + c] = 1;
      }
    }
  }

  const on = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (inHome[i]) {
        on[i] = 1;
        continue;
      }
      if (road[i] || inOther[i]) continue;
      const dh = edgeDistance(home, x(c), y(r));
      if (dh > REACH_M) continue;
      if (!others.some((s) => boxDistance(s, x(c), y(r)) < dh && edgeDistance(s, x(c), y(r)) < dh)) on[i] = 1;
    }
  }

  // The piece holding the house; anything it encloses is on the lot too.
  const { regions } = labelRegions(on, n, n);
  const piece = regions
    .map((cells) => ({ cells, home: cells.reduce((k, i) => k + inHome[i], 0) }))
    .sort((a, b) => b.home - a.home)[0];
  if (!piece?.home) return null;
  const outline = regionGeometry(grid, piece.cells);
  const polys = outline.type === "Polygon" ? [outline.coordinates] : outline.coordinates;
  const outer = polys
    .map((poly) => poly[0])
    .sort((a, b) => area({ type: "Polygon", coordinates: [b] }) - area({ type: "Polygon", coordinates: [a] }))[0];
  const lot = straighten({ type: "Polygon", coordinates: [outer] }, CELL_M * STRAIGHTEN_CELLS) as Polygon;
  return { lot, house: home.geometry };
}
