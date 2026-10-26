import area from "@turf/area";
import difference from "@turf/difference";
import intersect from "@turf/intersect";
import union from "@turf/union";
import { featureCollection, polygon as turfPolygon } from "@turf/helpers";
import osmtogeojson from "osmtogeojson";
import type { Feature, Polygon, MultiPolygon, Position } from "geojson";
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
  /** Satellite grass inside an outline, and sod fields. */
  grass: "#4ade80",
} as const;

/** Ground steeper than 20° on the map, and its swatch in the mower fit card. */
export const STEEP_COLOR = "#dc2626";

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
  | "built"
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
export function toAreaFeature(feature: Feature): Feature | null {
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
  if (props.building || props.amenity === "parking") return "built";
  if (props.natural === "water") return "water";

  return "skip";
}

/**
 * Sum of `features` clipped to the course boundary, in acres. Used to subtract
 * only the part of trees/buildings that actually falls inside the course.
 */
function clippedAcresInsideCourse(
  courseFeatures: Feature[],
  features: Feature[],
): number {
  if (courseFeatures.length === 0 || features.length === 0) return 0;

  let acres = 0;
  for (const feature of features) {
    for (const course of courseFeatures) {
      try {
        const clipped = intersect(
          featureCollection([
            course as Feature<Polygon | MultiPolygon>,
            feature as Feature<Polygon | MultiPolygon>,
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

/** [west, south, east, north] of a polygon feature. */
function featureBBox(feature: Feature): [number, number, number, number] {
  const g = feature.geometry as Polygon | MultiPolygon;
  const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      w = Math.min(w, x); e = Math.max(e, x);
      s = Math.min(s, y); n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}

/**
 * Area of the `base` polygons merged (overlaps count once) minus whatever of
 * `minus` lies on them, in acres. Mappers often draw rough as large polygons
 * under the fairways, greens, bunkers and ponds; summed as-is, that counts
 * those areas twice (by 50% over 280 Ontario/Quebec courses). Falls back to
 * the plain sum if the geometry can't be processed.
 */
export function netAcres(base: Feature[], minus: Feature[]): number {
  if (base.length === 0) return 0;
  const plain = base.reduce((sum, f) => sum + area(f) * SQ_METERS_TO_ACRES, 0);
  try {
    const merged =
      base.length > 1 ? union(featureCollection(base as Feature<Polygon | MultiPolygon>[])) : base[0];
    if (!merged) return plain;
    // Only what can overlap: a city's worth of buildings shouldn't slow this down.
    const [w, s, e, n] = featureBBox(merged);
    const near = minus.filter((f) => {
      const [fw, fs, fe, fn] = featureBBox(f);
      return fw <= e && fe >= w && fs <= n && fn >= s;
    });
    const net = near.length
      ? difference(featureCollection([merged, ...near] as Feature<Polygon | MultiPolygon>[]))
      : merged;
    return net ? area(net) * SQ_METERS_TO_ACRES : 0;
  } catch {
    return plain;
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
    wood: 0,
    built: 0,
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
  const builtFeatures: Feature[] = [];
  const roughFeatures: Feature[] = [];
  /** Everything that can sit on top of mapped rough. */
  const overRough: Feature[] = [];

  for (const feature of geojson.features) {
    const areaFeature = toAreaFeature(feature);
    if (!areaFeature) continue;

    const category = categorize(feature);
    if (category === "skip") continue;

    acres[category] += area(areaFeature) * SQ_METERS_TO_ACRES;
    if (category in counts) counts[category] += 1;

    if (category === "course") courseFeatures.push(areaFeature);
    if (category === "wood") woodFeatures.push(areaFeature);
    if (category === "built") builtFeatures.push(areaFeature);
    if (category === "rough") roughFeatures.push(areaFeature);
    else if (category !== "course") overRough.push(areaFeature);

    if (category in RENDER_ORDER) {
      renderFeatures.push({
        ...feature,
        properties: { ...(feature.properties ?? {}), _category: category },
      });
    }
  }

  // Trees and buildings are subtracted only where they fall inside the course.
  const treesAcres = Math.min(
    clippedAcresInsideCourse(courseFeatures, woodFeatures),
    acres.course,
  );
  const builtAcres = Math.min(
    clippedAcresInsideCourse(courseFeatures, builtFeatures),
    acres.course,
  );

  renderFeatures.sort(
    (a, b) =>
      (RENDER_ORDER[(a.properties?._category as string) ?? ""] ?? 9) -
      (RENDER_ORDER[(b.properties?._category as string) ?? ""] ?? 9),
  );

  // Rough: use mapped polygons if present (net of fairways, greens, tees,
  // bunkers, water, woods and buildings drawn over them), otherwise estimate
  // from the course boundary minus everything that isn't rough.
  // Only estimate rough when there is detailed turf mapped to subtract from the
  // boundary. Otherwise "course minus nothing" would report the whole property
  // as rough, which is misleading.
  const hasDetail = counts.fairway > 0 || counts.green > 0 || counts.tee > 0;
  const roughMapped = netAcres(roughFeatures, overRough);
  const roughEstimate = Math.max(
    0,
    acres.course -
      acres.fairway -
      acres.green -
      acres.tee -
      acres.driving_range -
      acres.water -
      acres.bunker -
      treesAcres -
      builtAcres,
  );
  const roughEstimated = roughMapped <= 0 && acres.course > 0 && hasDetail;
  const roughAcres =
    roughMapped > 0 ? roughMapped : roughEstimated ? roughEstimate : 0;

  const boundaryOnly = acres.course > 0 && !hasDetail && roughMapped <= 0;

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
    builtAcres,
    totalTurfAcres,
    found,
    boundaryOnly,
    outlineTraced: false,
    satellite: null,
  };
}

/** The course outline polygons in a measurement (what the satellite count runs inside). */
export function courseOutline(m: CourseMeasurement): (Polygon | MultiPolygon)[] {
  return m.geojson.features
    .filter((f) => f.properties?._category === "course")
    .map(toAreaFeature)
    .filter((f): f is Feature => f !== null)
    .map((f) => f.geometry as Polygon | MultiPolygon);
}

/**
 * A measurement for a course outline traced by hand (the course isn't in
 * OpenStreetMap): the outline only, like a boundary-only course, until the
 * satellite count fills in the grass.
 */
export function tracedOutlineMeasurement(outline: Polygon): CourseMeasurement {
  const courseAcres = area(outline) * SQ_METERS_TO_ACRES;
  const zero = { acres: 0, count: 0 };
  return {
    geojson: {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: outline, properties: { _category: "course" } }],
    },
    fairway: zero,
    green: zero,
    tee: zero,
    rough: zero,
    roughEstimated: false,
    courseAcres,
    drivingRangeAcres: 0,
    treesAcres: 0,
    builtAcres: 0,
    totalTurfAcres: 0,
    found: true,
    boundaryOnly: true,
    outlineTraced: true,
    satellite: null,
  };
}
