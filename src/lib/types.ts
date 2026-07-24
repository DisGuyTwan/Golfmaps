import type { FeatureCollection } from "geojson";

/** Geographic bounding box captured from the map view. */
export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Acreage + polygon count for a category of golf turf. */
export interface Stat {
  acres: number;
  count: number;
}

/**
 * Result of measuring a golf course from OpenStreetMap.
 *
 * Fairways/greens/tees come straight from mapped polygons. Rough is almost
 * never mapped, so when it isn't we estimate it as the course-boundary area
 * minus everything else (fairway/green/tee/driving range/water/sand).
 */
export interface CourseMeasurement {
  /** Detected polygons (course outline + fairway/green/tee/rough) for the map. */
  geojson: FeatureCollection;
  fairway: Stat;
  green: Stat;
  tee: Stat;
  /** Rough acreage; `count` is 0 when the value is estimated, not mapped. */
  rough: Stat;
  /** True when rough was estimated from the course boundary, not mapped. */
  roughEstimated: boolean;
  /** Total area of the `leisure=golf_course` boundary polygon(s). */
  courseAcres: number;
  drivingRangeAcres: number;
  /** Wooded area (clipped to the course boundary) subtracted from rough. */
  treesAcres: number;
  /** Building + parking area (clipped to the course) subtracted from rough. */
  builtAcres: number;
  /** fairway + rough + green + tee, in acres. */
  totalTurfAcres: number;
  /** True when any golf course or turf was detected. */
  found: boolean;
  /**
   * True when only the course outline is mapped (no fairways/greens/tees), so
   * the turf can't be broken down and rough would be the whole boundary.
   */
  boundaryOnly: boolean;
}
