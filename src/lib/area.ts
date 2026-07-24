import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import osmtogeojson from "osmtogeojson";
import type { Feature, FeatureCollection, Position } from "geojson";
import type { CourseMeasurement } from "./types";

/** Conversion factor: 1 square meter = 0.000247105 acres. */
export const SQ_METERS_TO_ACRES = 0.000247105;

/** Fill colors per category, shared by the map and the panel legend. */
export const TURF_COLORS = {
  fairway: "#4ade80",
  rough: "#a3e635",
  green: "#2dd4bf",
  tee: "#fbbf24",
  course: "#facc15",
} as const;

type Category =
  | "course"
  | "fairway"
  | "green"
  | "tee"
  | "rough"
  | "driving_range"
  | "water"
  | "bunker"
  | "skip";

/** Categories we draw on the map (in draw order: first = underneath). */
const RENDER_ORDER: Record<string, number> = {
  course: 0,
  rough: 1,
  fairway: 2,
  tee: 3,
  green: 4,
};

function isClosedRing(coords: Position[]): boolean {
  if (coords.length < 4) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/** Returns a polygon Feature for area calculation, or null if not fillable. */
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
    case "bunker":
      return "bunker";
    case "water_hazard":
    case "lateral_water_hazard":
      return "water";
    default:
      return "skip";
  }
}

/**
 * Converts a raw Overpass JSON response into a course measurement, estimating
 * rough from the course boundary when it isn't explicitly mapped.
 */
export function processOverpassData(overpassJson: unknown): CourseMeasurement {
  const geojson = osmtogeojson(overpassJson);

  const acres: Record<string, number> = {
    course: 0,
    fairway: 0,
    green: 0,
    tee: 0,
    rough: 0,
    driving_range: 0,
    water: 0,
    bunker: 0,
  };
  const counts: Record<string, number> = {
    course: 0,
    fairway: 0,
    green: 0,
    tee: 0,
    rough: 0,
  };

  const renderFeatures: Feature[] = [];

  for (const feature of geojson.features) {
    const areaFeature = toAreaFeature(feature);
    if (!areaFeature) continue;

    const category = categorize(feature);
    if (category === "skip") continue;

    acres[category] += area(areaFeature) * SQ_METERS_TO_ACRES;
    if (category in counts) counts[category] += 1;

    if (category in RENDER_ORDER) {
      renderFeatures.push({
        ...feature,
        properties: { ...(feature.properties ?? {}), _category: category },
      });
    }
  }

  renderFeatures.sort(
    (a, b) =>
      (RENDER_ORDER[(a.properties?._category as string) ?? ""] ?? 9) -
      (RENDER_ORDER[(b.properties?._category as string) ?? ""] ?? 9),
  );

  // Rough: use mapped polygons if present, otherwise estimate from the course
  // boundary minus everything that isn't rough.
  const roughMapped = acres.rough;
  const roughEstimate = Math.max(
    0,
    acres.course -
      acres.fairway -
      acres.green -
      acres.tee -
      acres.driving_range -
      acres.water -
      acres.bunker,
  );
  const roughEstimated = roughMapped <= 0 && acres.course > 0;
  const roughAcres = roughMapped > 0 ? roughMapped : roughEstimated ? roughEstimate : 0;

  const totalTurfAcres =
    acres.fairway + acres.green + acres.tee + roughAcres;

  const found =
    counts.course > 0 ||
    counts.fairway > 0 ||
    counts.green > 0 ||
    counts.tee > 0 ||
    counts.rough > 0;

  return {
    geojson: { type: "FeatureCollection", features: renderFeatures },
    fairway: { acres: acres.fairway, count: counts.fairway },
    green: { acres: acres.green, count: counts.green },
    tee: { acres: acres.tee, count: counts.tee },
    rough: { acres: roughAcres, count: counts.rough },
    roughEstimated,
    courseAcres: acres.course,
    drivingRangeAcres: acres.driving_range,
    totalTurfAcres,
    found,
  };
}
