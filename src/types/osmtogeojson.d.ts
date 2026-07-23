declare module "osmtogeojson" {
  import type { FeatureCollection } from "geojson";

  interface OsmToGeoJSONOptions {
    flatProperties?: boolean;
    uninterestingTags?: Record<string, boolean> | ((tags: unknown) => boolean);
    polygonFeatures?: unknown;
    verbose?: boolean;
  }

  /**
   * Converts OSM data (Overpass JSON/XML) into a GeoJSON FeatureCollection.
   */
  function osmtogeojson(
    data: unknown,
    options?: OsmToGeoJSONOptions,
  ): FeatureCollection;

  export default osmtogeojson;
}
