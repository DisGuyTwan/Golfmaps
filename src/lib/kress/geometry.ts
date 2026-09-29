import type { Feature, FeatureCollection, Position } from "geojson";
import type { KressContour, KressMapDetail } from "./types";

function ring(points: KressContour["points"]): Position[] | null {
  if (!points || points.length < 3) return null;
  const coords: Position[] = points.map((p) => [p.longitude, p.latitude]);
  const [first, last] = [coords[0], coords[coords.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
  return coords;
}

/**
 * Kress contours are recursive: an outer ring whose children are holes, whose
 * children are islands again, and so on. Converts them into polygons.
 */
export function contoursToPolygons(contours: KressContour[] = []): Position[][][] {
  const polygons: Position[][][] = [];
  for (const contour of contours) {
    const outer = ring(contour.points);
    if (!outer) continue;
    const holes = (contour.children ?? [])
      .map((child) => ring(child.points))
      .filter((r): r is Position[] => r !== null);
    polygons.push([outer, ...holes]);
    // Islands inside holes are grandchildren.
    for (const hole of contour.children ?? []) {
      polygons.push(...contoursToPolygons(hole.children ?? []));
    }
  }
  return polygons;
}

function polygonFeatures(
  contours: KressContour[],
  properties: Record<string, unknown>,
): Feature[] {
  return contoursToPolygons(contours).map((coordinates) => ({
    type: "Feature",
    properties,
    geometry: { type: "Polygon", coordinates },
  }));
}

/** Converts a Kress map (boundaries, zones, exclusions, markers) to GeoJSON. */
export function kressMapToGeoJSON(detail: KressMapDetail): FeatureCollection {
  const features: Feature[] = [];
  const mapName = detail.map?.name ?? "Kress map";
  const layers = detail.layers ?? {};

  for (const boundary of layers.boundaries ?? []) {
    features.push(
      ...polygonFeatures(boundary.contours, {
        kind: "boundary",
        name: boundary.name,
        enabled: boundary.enabled,
        map: mapName,
      }),
    );
    for (const zone of boundary.zones ?? []) {
      features.push(
        ...polygonFeatures(zone.contours, {
          kind: `zone_${zone.type}`,
          name: zone.name,
          enabled: zone.enabled,
          map: mapName,
        }),
      );
    }
  }

  for (const exclusion of layers.exclusions ?? []) {
    features.push(
      ...polygonFeatures(exclusion.contours, {
        kind: "exclusion",
        name: exclusion.name,
        enabled: exclusion.enabled,
        map: mapName,
      }),
    );
  }

  for (const marker of layers.markers ?? []) {
    if (!marker.record) continue;
    features.push({
      type: "Feature",
      properties: {
        kind: `marker_${marker.type}`,
        name: marker.name,
        enabled: marker.enabled,
        map: mapName,
      },
      geometry: {
        type: "Point",
        coordinates: [marker.record.longitude, marker.record.latitude],
      },
    });
  }

  return { type: "FeatureCollection", features };
}
