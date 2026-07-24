import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import osmtogeojson from "osmtogeojson";
import type { Feature, FeatureCollection, Position } from "geojson";
import type { CategoryStat, GolfAreaResult } from "./types";

/** Conversion factor: 1 square meter = 0.000247105 acres. */
export const SQ_METERS_TO_ACRES = 0.000247105;

/** Categories we measure. "skip" = detected but not counted (bunker, water…). */
type Category =
  | "course"
  | "fairway"
  | "green"
  | "tee"
  | "rough"
  | "driving_range"
  | "skip";

/** Draw order (lower = drawn first / underneath) so small features stay visible. */
const DRAW_ORDER: Record<string, number> = {
  course: 0,
  rough: 1,
  driving_range: 2,
  fairway: 3,
  tee: 4,
  green: 5,
};

/** True when a ring's first and last coordinates are identical (closed). */
function isClosedRing(coords: Position[]): boolean {
  if (coords.length < 4) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/**
 * Returns a polygon Feature for area calculation, or null if the feature does
 * not represent a fillable area. osmtogeojson usually returns golf areas as
 * Polygon/MultiPolygon, but as a safety net we also promote closed LineStrings.
 */
function toAreaFeature(feature: Feature): Feature | null {
  const geometry = feature.geometry;
  if (!geometry) return null;

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return feature;
  }

  if (geometry.type === "LineString" && isClosedRing(geometry.coordinates)) {
    return turfPolygon([geometry.coordinates]);
  }

  return null;
}

/** Buckets a feature by its OSM tags. */
function categorize(feature: Feature): Category {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  if (props.leisure === "golf_course") return "course";

  switch (props.golf) {
    case "fairway":
      return "fairway";
    case "green":
      return "green";
    case "tee":
      return "tee";
    case "rough":
      return "rough";
    case "driving_range":
      return "driving_range";
    default:
      // bunker, water_hazard, path, cartpath, hole markers, etc.
      return "skip";
  }
}

function emptyStat(): CategoryStat {
  return { acres: 0, count: 0 };
}

/**
 * Converts a raw Overpass JSON response into golf-course acreage totals.
 *
 * - Runs the OSM data through osmtogeojson to get standard GeoJSON.
 * - Buckets each polygon by tag (fairway/green/tee/rough/driving_range/course).
 * - Sums each bucket's area with @turf/area and converts to acres.
 * - Returns render-ready features tagged with `_category` for styling.
 */
export function processOverpassData(overpassJson: unknown): GolfAreaResult {
  const geojson = osmtogeojson(overpassJson);

  const stats: Record<Exclude<Category, "skip">, CategoryStat> = {
    course: emptyStat(),
    fairway: emptyStat(),
    green: emptyStat(),
    tee: emptyStat(),
    rough: emptyStat(),
    driving_range: emptyStat(),
  };

  const renderFeatures: Feature[] = [];
  let totalPolygons = 0;

  for (const feature of geojson.features) {
    const areaFeature = toAreaFeature(feature);
    if (!areaFeature) continue;

    const category = categorize(feature);
    if (category === "skip") continue;

    const acres = area(areaFeature) * SQ_METERS_TO_ACRES;
    stats[category].acres += acres;
    stats[category].count += 1;
    totalPolygons += 1;

    renderFeatures.push({
      ...feature,
      properties: { ...(feature.properties ?? {}), _category: category },
    });
  }

  // Draw large/background polygons first so fairways and greens stay visible.
  renderFeatures.sort((a, b) => {
    const orderA = DRAW_ORDER[(a.properties?._category as string) ?? ""] ?? 9;
    const orderB = DRAW_ORDER[(b.properties?._category as string) ?? ""] ?? 9;
    return orderA - orderB;
  });

  const mowableAcres =
    stats.fairway.acres +
    stats.green.acres +
    stats.tee.acres +
    stats.rough.acres +
    stats.driving_range.acres;

  return {
    geojson: { type: "FeatureCollection", features: renderFeatures },
    fairway: stats.fairway,
    green: stats.green,
    tee: stats.tee,
    rough: stats.rough,
    drivingRange: stats.driving_range,
    course: stats.course,
    mowableAcres,
    totalPolygons,
  };
}
