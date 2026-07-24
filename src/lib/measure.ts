import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import type { Feature, FeatureCollection, Position } from "geojson";

/** 1 square meter = 0.000247105 acres. */
export const SQ_METERS_TO_ACRES = 0.000247105;

export type TurfType = "fairway" | "rough" | "green" | "tee";

export interface TurfTypeMeta {
  type: TurfType;
  label: string;
  /** Stroke color. */
  color: string;
  /** Fill color. */
  fill: string;
}

/** Turf categories the user can trace, in display order. */
export const TURF_TYPES: TurfTypeMeta[] = [
  { type: "fairway", label: "Fairway", color: "#166534", fill: "#4ade80" },
  { type: "rough", label: "Rough", color: "#3f6212", fill: "#a3e635" },
  { type: "green", label: "Green", color: "#0f766e", fill: "#2dd4bf" },
  { type: "tee", label: "Tee", color: "#b45309", fill: "#fbbf24" },
];

export const TURF_META: Record<TurfType, TurfTypeMeta> = TURF_TYPES.reduce(
  (acc, meta) => {
    acc[meta.type] = meta;
    return acc;
  },
  {} as Record<TurfType, TurfTypeMeta>,
);

/** A traced turf polygon. Coordinates are [lat, lng] pairs (Leaflet order). */
export interface TurfShape {
  id: string;
  type: TurfType;
  latlngs: [number, number][];
  acres: number;
}

let idCounter = 0;
export function newShapeId(): string {
  idCounter += 1;
  return `shape-${Date.now().toString(36)}-${idCounter}`;
}

/** Area in acres of a ring given as [lat, lng] points. */
export function ringAcres(latlngs: [number, number][]): number {
  if (latlngs.length < 3) return 0;
  const coords: Position[] = latlngs.map(([lat, lng]) => [lng, lat]);
  coords.push(coords[0]); // close the ring
  return area(turfPolygon([coords])) * SQ_METERS_TO_ACRES;
}

export interface TurfTotals {
  perType: Record<TurfType, { acres: number; count: number }>;
  totalAcres: number;
  totalCount: number;
}

export function computeTotals(shapes: TurfShape[]): TurfTotals {
  const perType: TurfTotals["perType"] = {
    fairway: { acres: 0, count: 0 },
    rough: { acres: 0, count: 0 },
    green: { acres: 0, count: 0 },
    tee: { acres: 0, count: 0 },
  };
  let totalAcres = 0;
  for (const shape of shapes) {
    perType[shape.type].acres += shape.acres;
    perType[shape.type].count += 1;
    totalAcres += shape.acres;
  }
  return { perType, totalAcres, totalCount: shapes.length };
}

/** OSM `_category` values that map onto a traceable turf type. */
const OSM_CATEGORY_TO_TYPE: Record<string, TurfType> = {
  fairway: "fairway",
  rough: "rough",
  green: "green",
  tee: "tee",
};

function outerRings(feature: Feature): Position[][] {
  const geometry = feature.geometry;
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates.length ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((poly) => poly[0])
      .filter((ring): ring is Position[] => Array.isArray(ring));
  }
  return [];
}

/**
 * Converts categorized OSM GeoJSON (from processOverpassData) into editable
 * turf shapes, so the OSM auto-detect can seed the manual tracer. Only the four
 * traceable turf types are kept; holes in polygons are ignored (a small
 * over-estimate that the user can correct by re-tracing).
 */
export function osmFeaturesToShapes(geojson: FeatureCollection): TurfShape[] {
  const shapes: TurfShape[] = [];
  for (const feature of geojson.features) {
    const category = feature.properties?._category as string | undefined;
    const type = category ? OSM_CATEGORY_TO_TYPE[category] : undefined;
    if (!type) continue;

    for (const ring of outerRings(feature)) {
      const latlngs = ring.map(
        (pos) => [pos[1], pos[0]] as [number, number],
      );
      if (latlngs.length < 3) continue;
      shapes.push({
        id: newShapeId(),
        type,
        latlngs,
        acres: ringAcres(latlngs),
      });
    }
  }
  return shapes;
}
