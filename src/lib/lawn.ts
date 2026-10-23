/**
 * Residential lawn: the lot (Quebec cadastre, or traced) minus what isn't
 * lawn. OpenStreetMap supplies buildings, pools, parking and mapped paved
 * areas where it has them; the rep traces out the rest (driveway, patio, a
 * house OSM doesn't have). Trees aren't removed: lawn under them is mowed.
 * Pure, so the arithmetic is tested without a browser. Areas in square feet.
 */
import area from "@turf/area";
import difference from "@turf/difference";
import intersect from "@turf/intersect";
import union from "@turf/union";
import { featureCollection } from "@turf/helpers";
import osmtogeojson from "osmtogeojson";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { toAreaFeature } from "./area";
import type { BBox } from "./types";

/** 1 m² in square feet. */
export const SQ_M_TO_SQ_FT = 10.7639104;

export type LawnAreaKind = "building" | "pool" | "paving" | "traced";

/** Something that isn't lawn: mapped in OSM (clipped to the lot) or traced by hand. */
export interface LawnArea {
  id: string;
  kind: LawnAreaKind;
  geometry: Polygon | MultiPolygon;
}

export interface LawnMeasurement {
  lot: Polygon | MultiPolygon;
  lotSource: "cadastre" | "traced";
  /** Cadastre lot number, when the lot came from the cadastre. */
  lotNumber: string | null;
  /** Where the lot was picked ([lat, lon]), so a share link can look it up again. */
  pickPoint: [number, number] | null;
  /** Buildings, pools and paving from OSM; null while loading or if the lookup failed. */
  mapped: LawnArea[] | null;
  mappedFailed: boolean;
  traced: LawnArea[];
}

export interface LawnTotals {
  lotSqft: number;
  /** Buildings, pools and paving mapped in OSM, on the lot. */
  mappedSqft: number;
  /** Traced out by hand, not counting what OSM already removed. */
  tracedSqft: number;
  lawnSqft: number;
  /** The lawn itself, for the map; null if nothing is left. */
  lawn: Polygon | MultiPolygon | null;
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

function kindOf(props: Record<string, unknown>): Exclude<LawnAreaKind, "traced"> | null {
  if (props.building) return "building";
  if (props.leisure === "swimming_pool") return "pool";
  if (props.amenity === "parking" || props["area:highway"]) return "paving";
  return null;
}

/** Buildings, pools and paving from the Overpass lawn query, clipped to the lot. */
export function mappedOnLot(overpassJson: unknown, lot: Polygon | MultiPolygon): LawnArea[] {
  const lotF = asFeature(lot);
  const out: LawnArea[] = [];
  for (const feature of osmtogeojson(overpassJson).features) {
    const kind = kindOf((feature.properties ?? {}) as Record<string, unknown>);
    const shape = kind ? toAreaFeature(feature) : null;
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

/** Lot, what's removed and the lawn left, in square feet. Each part counts once. */
export function lawnTotals(m: LawnMeasurement): LawnTotals {
  const lotF = asFeature(m.lot);
  const lotSqft = sqft(lotF);
  try {
    const mapped = clip(merge((m.mapped ?? []).map((a) => a.geometry)), lotF);
    const traced = minus(clip(merge(m.traced.map((a) => a.geometry)), lotF), mapped);
    const lawn = minus(lotF, mapped, traced);
    return { lotSqft, mappedSqft: sqft(mapped), tracedSqft: sqft(traced), lawnSqft: sqft(lawn), lawn: lawn?.geometry ?? null };
  } catch {
    // Invalid geometry: fall back to plain sums (may double count overlaps).
    const mappedSqft = (m.mapped ?? []).reduce((s, a) => s + sqft(asFeature(a.geometry)), 0);
    const tracedSqft = m.traced.reduce((s, a) => s + sqft(asFeature(a.geometry)), 0);
    return { lotSqft, mappedSqft, tracedSqft, lawnSqft: Math.max(0, lotSqft - mappedSqft - tracedSqft), lawn: null };
  }
}

/** Lots bigger than this (≈ 54,000 sq ft) are rarely a single house. */
const ODD_LOT_M2 = 5000;
/** Below this compactness (4πA/P², 1 for a circle) a lot is a strip, like a street. */
const ODD_LOT_COMPACTNESS = 0.2;

/**
 * True when the lot doesn't look like a house lot: very large, or a long
 * strip. The cadastre gives streets lot numbers too, and a geocoded address
 * can land on the road; the rep is then told to tap the house itself.
 */
export function lotLooksOdd(lot: Polygon | MultiPolygon): boolean {
  const m2 = area({ type: "Feature", geometry: lot, properties: {} });
  if (m2 > ODD_LOT_M2) return true;
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

/** Square feet, whole, formatted for the language: "12,345 sq ft" / "12 345 pi²". */
export function formatSqft(value: number, lang: "en" | "fr"): string {
  const n = Math.round(value).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA");
  return lang === "fr" ? `${n} pi²` : `${n} sq ft`;
}
