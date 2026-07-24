import area from "@turf/area";
import intersect from "@turf/intersect";
import { featureCollection, polygon as turfPolygon } from "@turf/helpers";
import osmtogeojson from "osmtogeojson";
import type { Feature, FeatureCollection, Polygon, MultiPolygon, Position } from "geojson";
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
  | "wood"
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

  const golf = props.golf;
  if (golf === "fairway") return "fairway";
  if (golf === "green") return "green";
  if (golf === "tee") return "tee";
  if (golf === "rough") return "rough";
  if (golf === "driving_range") return "driving_range";
  if (golf === "bunker") return "bunker";
  if (golf === "water_hazard" || golf === "lateral_water_hazard") return "water";

  if (
    props.natural === "wood" ||
    props.natural === "scrub" ||
    props.landuse === "forest"
  ) {
    return "wood";
  }
  if (props.natural === "water") return "water";

  return "skip";
}

/** Sum of wooded areas clipped to the course boundary, in acres. */
function woodedAcresInsideCourse(
  courseFeatures: Feature[],
  woodFeatures: Feature[],
): number {
  if (courseFeatures.length === 0 || woodFeatures.length === 0) return 0;

  let acres = 0;
  for (const wood of woodFeatures) {
    for (const course of courseFeatures) {
      try {
        const clipped = intersect(
          featureCollection([
            course as Feature<Polygon | MultiPolygon>,
            wood as Feature<Polygon | MultiPolygon>,
          ]),
        );
        if (clipped) acres += area(clipped) * SQ_METERS_TO_ACRES;
      } catch {
        // Skip invalid/self-intersecting geometry rather than failing.
      }
    }
  }
  return acres;
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
    wood: 0,
  };
  const counts: Record<string, number> = {
    course: 0,
    fairway: 0,
    green: 0,
    tee: 0,
    rough: 0,
  };

  const renderFeatures: Feature[] = [];
  const courseFeatures: Feature[] = [];
  const woodFeatures: Feature[] = [];

  for (const feature of geojson.features) {
    const areaFeature = toAreaFeature(feature);
    if (!areaFeature) continue;

    const category = categorize(feature);
    if (category === "skip") continue;

    acres[category] += area(areaFeature) * SQ_METERS_TO_ACRES;
    if (category in counts) counts[category] += 1;

    if (category === "course") courseFeatures.push(areaFeature);
    if (category === "wood") woodFeatures.push(areaFeature);

    if (category in RENDER_ORDER) {
      renderFeatures.push({
        ...feature,
        properties: { ...(feature.properties ?? {}), _category: category },
      });
    }
  }

  // Trees are subtracted only where they fall inside the course boundary.
  const treesAcres = Math.min(
    woodedAcresInsideCourse(courseFeatures, woodFeatures),
    acres.course,
  );

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
      acres.bunker -
      treesAcres,
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
    treesAcres,
    totalTurfAcres,
    found,
  };
}
