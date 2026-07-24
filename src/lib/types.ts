import type { FeatureCollection } from "geojson";

/** Geographic bounding box captured from the drawn rectangle. */
export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Acreage + feature count for a single category of golf turf. */
export interface CategoryStat {
  acres: number;
  count: number;
}

/**
 * Result of processing an Overpass response into golf-course acreage.
 *
 * `fairway` is the headline metric, but many OSM courses only have their
 * outer boundary mapped (`course`) with few or no individual fairway polygons,
 * so we surface a full breakdown and a total course area as a fallback.
 */
export interface GolfAreaResult {
  /** Detected polygons (course outline + turf features), styled per category. */
  geojson: FeatureCollection;
  fairway: CategoryStat;
  green: CategoryStat;
  tee: CategoryStat;
  rough: CategoryStat;
  drivingRange: CategoryStat;
  /** Total area of the `leisure=golf_course` boundary polygon(s). */
  course: CategoryStat;
  /** fairway + green + tee + rough + drivingRange, in acres. */
  mowableAcres: number;
  /** Count of every golf/course polygon detected (0 = nothing found). */
  totalPolygons: number;
}
