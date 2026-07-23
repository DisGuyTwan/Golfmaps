import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import osmtogeojson from "osmtogeojson";
import type { Feature, FeatureCollection, Position } from "geojson";
import type { FairwayResult } from "./types";

/** Conversion factor: 1 square meter = 0.000247105 acres. */
export const SQ_METERS_TO_ACRES = 0.000247105;

/** True when a ring's first and last coordinates are identical (closed). */
function isClosedRing(coords: Position[]): boolean {
  if (coords.length < 4) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/**
 * Returns a polygon Feature for area calculation, or null if the feature does
 * not represent a fillable fairway area.
 *
 * osmtogeojson usually returns golf areas as Polygon/MultiPolygon features, but
 * as a safety net we also promote closed LineStrings (a fairway drawn as a
 * closed way that wasn't classified as an area) into polygons.
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

/**
 * Converts a raw Overpass JSON response into fairway acreage totals.
 *
 * - Runs the OSM data through osmtogeojson to get standard GeoJSON.
 * - Keeps only polygon-like fairway features.
 * - Sums each feature's area with @turf/area and converts to acres.
 */
export function processOverpassData(overpassJson: unknown): FairwayResult {
  const geojson = osmtogeojson(overpassJson);

  const fairwayFeatures: Feature[] = [];
  let totalSquareMeters = 0;

  for (const feature of geojson.features) {
    const areaFeature = toAreaFeature(feature);
    if (!areaFeature) continue;

    totalSquareMeters += area(areaFeature);
    // Keep the original feature so its OSM properties are preserved on the map.
    fairwayFeatures.push(feature);
  }

  const filtered: FeatureCollection = {
    type: "FeatureCollection",
    features: fairwayFeatures,
  };

  return {
    geojson: filtered,
    totalSquareMeters,
    totalAcres: totalSquareMeters * SQ_METERS_TO_ACRES,
    fairwayCount: fairwayFeatures.length,
  };
}
