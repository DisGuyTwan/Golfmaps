import type { FeatureCollection } from "geojson";

/** Geographic bounding box captured from the drawn rectangle. */
export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Result of processing an Overpass response into fairway acreage. */
export interface FairwayResult {
  /** Filtered FeatureCollection containing only fairway polygons. */
  geojson: FeatureCollection;
  /** Total fairway area in square meters. */
  totalSquareMeters: number;
  /** Total fairway area in acres. */
  totalAcres: number;
  /** Number of distinct fairway polygons detected. */
  fairwayCount: number;
}
