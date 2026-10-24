import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

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
  /** True when the outline was traced by hand (the course isn't in OSM). */
  outlineTraced: boolean;
  /**
   * Grass counted inside the outline, for courses with no mapped turf
   * (boundary-only or traced): from the aerial photos in Quebec, else from
   * satellite land cover. null when not run or failed.
   */
  satellite: SatelliteTurf | null;
}

/**
 * What covers the inside of a course outline, in acres: from Quebec's aerial
 * photos and the LiDAR (surface.ts), or from ESA WorldCover elsewhere.
 */
export interface SatelliteTurf {
  source: "photos" | "worldcover";
  /** Grass: fairways, rough, greens, tees, range (and single trees over it, from the photos). */
  grassAcres: number;
  /** Trees and shrubs (woods, from the photos). */
  treesAcres: number;
  /** Buildings, roads, paths, parking (and sand, from the photos). */
  builtAcres: number;
  /** Water and wetland. */
  waterAcres: number;
  /** Everything else (bare ground, cropland, no data). */
  otherAcres: number;
  /** All cells inside the outline. */
  outlineAcres: number;
  /** Year of the land cover (the photos' mosaic has no single year). */
  year: number | null;
}

/** One sod field: detected from the crop inventory or traced by hand. */
export interface SodField {
  /** "d1", "d2", … (detected, biggest first) or "t1", … (traced). */
  id: string;
  acres: number;
  geometry: Polygon | MultiPolygon;
  /** A point well inside the field, [lat, lon]: share links and labels. */
  anchor: [number, number];
  traced: boolean;
  /** False when the rep tapped it out of the quote. */
  included: boolean;
}

/** Sod fields on a farm, and where the detected ones came from. */
export interface SodMeasurement {
  fields: SodField[];
  /** Crop inventory year the detected fields come from; null if none were detected. */
  year: number | null;
  /** True once the detected fields were measured on the aerial photos (roads, trees, buildings and water inside left out). */
  photos?: boolean;
}
