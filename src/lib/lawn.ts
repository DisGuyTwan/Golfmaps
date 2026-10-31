/**
 * Residential lawn: the lot (Quebec cadastre, traced, or estimated where
 * there's no open cadastre) minus what isn't lawn. OpenStreetMap supplies
 * buildings, pools, parking and paving where it has them, including
 * driveways and parking aisles mapped as lines (widened into strips); the
 * LiDAR adds the houses OSM misses (terrain.ts) and the aerial photos the
 * pools, driveways and patios (surface.ts); the rep traces out the rest: a
 * driveway with two taps and a width, or any other area, and taps a misread
 * photo area to keep it as lawn. Trees aren't removed: lawn under them is
 * mowed.
 * Pure, so the arithmetic is tested without a browser. Areas in square feet.
 */
import area from "@turf/area";
import difference from "@turf/difference";
import intersect from "@turf/intersect";
import union from "@turf/union";
import { featureCollection } from "@turf/helpers";
import osmtogeojson from "osmtogeojson";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { toAreaFeature } from "./area";
import { pointInGeometry } from "./landcover";
import type { BBox } from "./types";

/** 1 m² in square feet. */
export const SQ_M_TO_SQ_FT = 10.7639104;

export type LawnAreaKind = "building" | "pool" | "paving" | "traced" | "driveway";

/** Something that isn't lawn: mapped in OSM (clipped to the lot) or traced by hand. */
export interface LawnArea {
  id: string;
  kind: LawnAreaKind;
  geometry: Polygon | MultiPolygon;
  /** A traced driveway's centre line ([lat, lon]) and width, so a link rebuilds it exactly. */
  path?: [number, number][];
  widthM?: number;
}

/** Driveway widths offered for 1, 2 and 3 cars, in feet. */
export const DRIVEWAY_WIDTHS_FT = [11, 20, 29] as const;
export const FT_TO_M = 0.3048;

export interface LawnMeasurement {
  lot: Polygon | MultiPolygon;
  /** The Quebec cadastre, traced by hand, or estimated from the houses around (estimated-lot.ts: no open cadastre outside Quebec). */
  lotSource: "cadastre" | "traced" | "estimated";
  /** Cadastre lot number, when the lot came from the cadastre. */
  lotNumber: string | null;
  /** Where the lot was picked ([lat, lon]), so a share link can look it up again. */
  pickPoint: [number, number] | null;
  /** Buildings, pools and paving from OSM; null while loading or if the lookup failed. */
  mapped: LawnArea[] | null;
  mappedFailed: boolean;
  /**
   * Buildings the LiDAR sees on the lot (terrain.ts), for houses OSM doesn't
   * have; null while loading or where there's no LiDAR. One that mostly
   * overlaps an OSM building is left to OSM's outline.
   */
  lidar?: LawnArea[] | null;
  /**
   * Pools and paving seen in the aerial photos (surface.ts), for what OSM
   * doesn't have; undefined while loading, null where there are no photos.
   */
  imagery?: LawnArea[] | null;
  /** Points ([lat, lon]) tapped on photo areas to keep them as lawn: a misread, or since changed. */
  kept?: [number, number][];
  traced: LawnArea[];
}

export interface LawnTotals {
  lotSqft: number;
  /** Buildings and pools mapped in OSM, buildings only the LiDAR sees and pools only the photos show, on the lot. */
  builtSqft: number;
  /** Buildings counted from the LiDAR alone (not in OSM). */
  lidarCount: number;
  /** Paving mapped in OSM (parking, driveways, aisles) or seen in the photos, not under a building. */
  pavedSqft: number;
  /** Pools and paved areas counted from the photos alone (not in OSM). */
  photoPools: number;
  photoPaved: number;
  /** Traced out by hand (driveways and areas), not counting what OSM already removed. */
  tracedSqft: number;
  lawnSqft: number;
  /** The lawn itself, for the map; null if nothing is left. */
  lawn: Polygon | MultiPolygon | null;
  /** The paving on the lot (driveways, walks, parking), for the edges a crew blows clear. */
  paved?: Polygon | MultiPolygon | null;
  /** What came off the lot by source (sq ft, on the lot): how sure the lawn is depends on it (trust.ts lotRange). */
  sources?: { osm: number; lidar: number; photos: number };
}

type Poly = Feature<Polygon | MultiPolygon>;
const sqft = (f: Feature | null | undefined) => (f ? area(f) * SQ_M_TO_SQ_FT : 0);
const asFeature = (geometry: Polygon | MultiPolygon): Poly => ({ type: "Feature", geometry, properties: {} });

function merge(geoms: (Polygon | MultiPolygon)[]): Poly | null {
  if (geoms.length === 0) return null;
  if (geoms.length === 1) return asFeature(geoms[0]);
  return union(featureCollection(geoms.map(asFeature)));
}

function clip(a: Poly | null, b: Poly): Poly | null {
  return a ? intersect(featureCollection([a, b])) : null;
}

function minus(a: Poly | null, ...others: (Poly | null)[]): Poly | null {
  const cut = others.filter((o): o is Poly => o !== null);
  if (!a) return null;
  return cut.length ? difference(featureCollection([a, ...cut])) : a;
}

/**
 * A strip `widthM` wide along a line of [lon, lat] points (a driveway, a
 * parking aisle), with rounded bends so turns leave no notch. Built on a
 * local flat projection: plenty for lot-sized shapes.
 */
export function stripAlong(line: Position[], widthM: number): Polygon | MultiPolygon | null {
  if (line.length < 2 || !(widthM > 0)) return null;
  const [lon0, lat0] = line[0];
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 111_320;
  const xy = line.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky]);
  const ll = ([x, y]: number[]): Position => [lon0 + x / kx, lat0 + y / ky];
  const h = widthM / 2;
  const pieces: Polygon[] = [];
  for (let i = 1; i < xy.length; i++) {
    const [x1, y1] = xy[i - 1];
    const [x2, y2] = xy[i];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.01) continue;
    const nx = (-(y2 - y1) / len) * h;
    const ny = ((x2 - x1) / len) * h;
    const ring = [[x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x2 - nx, y2 - ny], [x2 + nx, y2 + ny], [x1 + nx, y1 + ny]];
    pieces.push({ type: "Polygon", coordinates: [ring.map(ll)] });
  }
  for (let i = 1; i < xy.length - 1; i++) {
    const [cx, cy] = xy[i];
    const ring = Array.from({ length: 13 }, (_, k) => ll([cx + h * Math.cos((k * Math.PI) / 6), cy + h * Math.sin((k * Math.PI) / 6)]));
    pieces.push({ type: "Polygon", coordinates: [ring] });
  }
  return pieces.length ? (merge(pieces)?.geometry ?? null) : null;
}

/** A driveway traced along its centre line ([lat, lon] taps), `widthM` wide. */
export function drivewayArea(path: [number, number][], widthM: number, id: string): LawnArea | null {
  const geometry = stripAlong(path.map(([lat, lon]) => [lon, lat]), widthM);
  return geometry ? { id, kind: "driveway", geometry, path, widthM } : null;
}

/** Width of a service road mapped as a line: its width tag, else typical for its kind. */
const SERVICE_WIDTH_M: Record<string, number> = { driveway: 3.5, parking_aisle: 6, alley: 4, "drive-through": 3.5 };
function lineWidth(props: Record<string, unknown>): number {
  const tagged = parseFloat(String(props.width ?? ""));
  if (tagged > 0 && tagged < 30) return tagged;
  return SERVICE_WIDTH_M[String(props.service)] ?? 5;
}

function kindOf(props: Record<string, unknown>): "building" | "pool" | "paving" | null {
  if (props.building) return "building";
  if (props.leisure === "swimming_pool") return "pool";
  if (props.amenity === "parking" || props.amenity === "parking_space" || props["area:highway"]) return "paving";
  if (props.highway && props.area === "yes") return "paving";
  return null;
}

/**
 * Buildings, pools and paving from the Overpass lawn query, clipped to the
 * lot. Service roads mapped as lines (driveways, parking aisles) are widened
 * into strips; a closed loop of road is still a road, not the area inside it.
 */
export function mappedOnLot(overpassJson: unknown, lot: Polygon | MultiPolygon): LawnArea[] {
  const lotF = asFeature(lot);
  const out: LawnArea[] = [];
  for (const feature of osmtogeojson(overpassJson).features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const isRoadLine = props.highway === "service" && props.area !== "yes" && feature.geometry?.type === "LineString";
    const kind = isRoadLine ? "paving" : kindOf(props);
    const strip = isRoadLine ? stripAlong((feature.geometry as { coordinates: Position[] }).coordinates, lineWidth(props)) : null;
    const shape = isRoadLine ? (strip ? asFeature(strip) : null) : kind ? toAreaFeature(feature) : null;
    if (!kind || !shape) continue;
    try {
      const onLot = clip(shape as Poly, lotF);
      // Ignore slivers from a neighbour's building that grazes the line.
      if (onLot && sqft(onLot) > 5) out.push({ id: `m${out.length + 1}`, kind, geometry: onLot.geometry });
    } catch {
      // Skip invalid geometry rather than failing the whole lot.
    }
  }
  return out;
}

/** Areas OSM doesn't already have: less than 30 % of each under what OSM maps. */
function notInOsm(areas: LawnArea[], osm: Poly | null): LawnArea[] {
  if (!osm) return areas;
  return areas.filter((a) => {
    const f = asFeature(a.geometry);
    const shared = intersect(featureCollection([f, osm]));
    return !shared || area(shared) < 0.3 * area(f);
  });
}

/** The photo areas that count, and those tapped to keep as lawn. */
export function photoAreas(m: LawnMeasurement): { removed: LawnArea[]; kept: LawnArea[] } {
  const removed: LawnArea[] = [];
  const kept: LawnArea[] = [];
  for (const a of m.imagery ?? []) {
    const isKept = (m.kept ?? []).some(([lat, lon]) => pointInGeometry(lon, lat, a.geometry));
    (isKept ? kept : removed).push(a);
  }
  return { removed, kept };
}

/**
 * Where a tap that keeps a photo area is stored: on the 5-decimal grid a
 * share link rounds to (about 1 m), at the grid point nearest the tap that's
 * still inside the area, so a narrow strip stays kept when the link reopens
 * (else the tap itself: it holds for the session).
 */
export function keepPoint(geometry: Polygon | MultiPolygon, lat: number, lon: number): [number, number] {
  const r = (v: number) => Math.round(v * 1e5);
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const p: [number, number] = [(r(lat) + dy) / 1e5, (r(lon) + dx) / 1e5];
      const d = (p[0] - lat) ** 2 + ((p[1] - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (d < bestD && pointInGeometry(p[1], p[0], geometry)) [best, bestD] = [p, d];
    }
  }
  return best ?? [lat, lon];
}

/** Lot, what's removed and the lawn left, in square feet. Each part counts once. */
export function lawnTotals(m: LawnMeasurement): LawnTotals {
  const lotF = asFeature(m.lot);
  const lotSqft = sqft(lotF);
  const mapped = m.mapped ?? [];
  const photos = photoAreas(m).removed;
  const isPaving = (a: LawnArea) => a.kind === "paving";
  const isBuilt = (a: LawnArea) => !isPaving(a);
  try {
    const osmBuilt = merge(mapped.filter(isBuilt).map((a) => a.geometry));
    const osmPaved = merge(mapped.filter(isPaving).map((a) => a.geometry));
    const lidar = notInOsm(m.lidar ?? [], osmBuilt);
    const pools = photos.filter(isBuilt);
    const photoPaving = photos.filter(isPaving);
    const built = clip(merge([...mapped.filter(isBuilt), ...lidar, ...pools].map((a) => a.geometry)), lotF);
    const paved = minus(clip(merge([...mapped.filter(isPaving), ...photoPaving].map((a) => a.geometry)), lotF), built);
    const traced = minus(clip(merge(m.traced.map((a) => a.geometry)), lotF), built, paved);
    const lawn = minus(lotF, built, paved, traced);
    const onLot = (areas: LawnArea[]) => sqft(clip(merge(areas.map((a) => a.geometry)), lotF));
    const sources = {
      osm: onLot(mapped),
      lidar: onLot(lidar),
      photos: onLot([...notInOsm(pools, osmBuilt), ...notInOsm(photoPaving, osmPaved)]),
    };
    return {
      lotSqft,
      builtSqft: sqft(built),
      lidarCount: lidar.length,
      pavedSqft: sqft(paved),
      photoPools: notInOsm(pools, osmBuilt).length,
      photoPaved: notInOsm(photoPaving, osmPaved).length,
      tracedSqft: sqft(traced),
      lawnSqft: sqft(lawn),
      lawn: lawn?.geometry ?? null,
      paved: paved?.geometry ?? null,
      sources,
    };
  } catch {
    // Invalid geometry: fall back to plain sums (may double count overlaps).
    const sum = (areas: LawnArea[]) => areas.reduce((s, a) => s + sqft(asFeature(a.geometry)), 0);
    const builtSqft = sum(mapped.filter(isBuilt));
    const pavedSqft = sum(mapped.filter(isPaving));
    const tracedSqft = sum(m.traced);
    return {
      lotSqft,
      builtSqft,
      lidarCount: 0,
      pavedSqft,
      photoPools: 0,
      photoPaved: 0,
      tracedSqft,
      lawnSqft: Math.max(0, lotSqft - builtSqft - pavedSqft - tracedSqft),
      lawn: null,
    };
  }
}

/** Lots bigger than this (≈ 54,000 sq ft) are rarely a single house. */
const ODD_LOT_M2 = 5000;
/** Below this compactness (4πA/P², 1 for a circle) a lot is a strip, like a street. */
const ODD_LOT_COMPACTNESS = 0.2;

/** Length of every ring of a shape (m), on a local flat projection: plenty for lot-sized shapes. */
export function perimeterM(g: Polygon | MultiPolygon): number {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let total = 0;
  for (const rings of polys) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const [lon0, lat0] = ring[i - 1];
        const [lon1, lat1] = ring[i];
        const kx = 111_320 * Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
        total += Math.hypot((lon1 - lon0) * kx, (lat1 - lat0) * 111_320);
      }
    }
  }
  return total;
}

/**
 * The lawn's edges a crew trims (all of them: walls, beds, fences, paving,
 * lot lines a mower can't cut right up to) and those along paving on the lot,
 * where clippings land and are blown clear (m). The shared edge is what
 * merging the lawn with the paving dissolves.
 */
export function lawnEdges(totals: LawnTotals): { edgeM: number; hardEdgeM: number } {
  if (!totals.lawn) return { edgeM: 0, hardEdgeM: 0 };
  const edgeM = perimeterM(totals.lawn);
  if (!totals.paved) return { edgeM, hardEdgeM: 0 };
  try {
    const merged = merge([totals.lawn, totals.paved]);
    const shared = merged ? (edgeM + perimeterM(totals.paved) - perimeterM(merged.geometry)) / 2 : 0;
    return { edgeM, hardEdgeM: Math.min(edgeM, Math.max(0, shared)) };
  } catch {
    return { edgeM, hardEdgeM: 0 };
  }
}

/**
 * True when the lot doesn't look like a house lot: very large, or a long
 * strip. The cadastre gives streets lot numbers too, and a geocoded address
 * can land on the road; the rep is then told to tap the house itself.
 */
export function lotLooksOdd(lot: Polygon | MultiPolygon, big = false): boolean {
  const m2 = area({ type: "Feature", geometry: lot, properties: {} });
  // A commercial or municipal site is expected to be big: only a strip (a street) is odd there.
  if (m2 > ODD_LOT_M2 && !big) return true;
  // Perimeter on a local flat projection: plenty for a lot-sized shape.
  const rings = lot.type === "Polygon" ? [lot.coordinates[0]] : lot.coordinates.map((p) => p[0]);
  const k = 111_320;
  const cos = Math.cos((rings[0][0][1] * Math.PI) / 180);
  let perimeter = 0;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      perimeter += Math.hypot((ring[i][0] - ring[i - 1][0]) * k * cos, (ring[i][1] - ring[i - 1][1]) * k);
    }
  }
  return perimeter > 0 && (4 * Math.PI * m2) / (perimeter * perimeter) < ODD_LOT_COMPACTNESS;
}

/** The lot's bounding box grown by `marginDeg`, for the Overpass lookup. */
export function lotBBox(lot: Polygon | MultiPolygon, marginDeg = 0.0002): BBox {
  const rings = lot.type === "Polygon" ? [lot.coordinates[0]] : lot.coordinates.map((p) => p[0]);
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      south = Math.min(south, lat); north = Math.max(north, lat);
      west = Math.min(west, lon); east = Math.max(east, lon);
    }
  }
  return { south: south - marginDeg, west: west - marginDeg, north: north + marginDeg, east: east + marginDeg };
}

/**
 * How far around a tapped or searched point buildings and paving are looked
 * up while the cadastre lot is still loading, so both lookups run at once.
 * Wide enough for nearly every house lot; a bigger lot is looked up again on
 * its own box (see bboxContains).
 */
export const LOT_LOOKAROUND_M = 100;

/** A box `radiusM` metres around a point, each way. */
export function aroundPoint(lat: number, lon: number, radiusM = LOT_LOOKAROUND_M): BBox {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

/** True when `inner` lies entirely inside `outer`. */
export function bboxContains(outer: BBox, inner: BBox): boolean {
  return inner.south >= outer.south && inner.west >= outer.west && inner.north <= outer.north && inner.east <= outer.east;
}

/** Square feet, whole, formatted for the language: "12,345 sq ft" / "12 345 pi²" (or just the number). */
export function formatSqft(value: number, lang: "en" | "fr", withUnit = true): string {
  const n = Math.round(value).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA");
  if (!withUnit) return n;
  return lang === "fr" ? `${n} pi²` : `${n} sq ft`;
}
