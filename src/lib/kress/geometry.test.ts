import { describe, it, expect } from "vitest";
import { contoursToPolygons, kressMapToGeoJSON } from "./geometry";
import type { KressContour, KressMapDetail } from "./types";

const square = (lat: number, lng: number, d: number): KressContour["points"] => [
  { latitude: lat, longitude: lng },
  { latitude: lat, longitude: lng + d },
  { latitude: lat + d, longitude: lng + d },
  { latitude: lat + d, longitude: lng },
];

describe("contoursToPolygons", () => {
  it("closes rings and converts to [lng, lat]", () => {
    const [polygon] = contoursToPolygons([{ points: square(46, -72, 1) }]);
    expect(polygon).toHaveLength(1);
    expect(polygon[0][0]).toEqual([-72, 46]);
    expect(polygon[0].at(-1)).toEqual(polygon[0][0]);
  });

  it("treats children as holes and grandchildren as separate islands", () => {
    const polygons = contoursToPolygons([
      {
        points: square(0, 0, 10),
        children: [{ points: square(2, 2, 6), children: [{ points: square(4, 4, 1) }] }],
      },
    ]);
    expect(polygons).toHaveLength(2);
    expect(polygons[0]).toHaveLength(2); // outer + hole
    expect(polygons[1]).toHaveLength(1); // island inside the hole
  });

  it("skips degenerate rings", () => {
    expect(contoursToPolygons([{ points: square(0, 0, 1).slice(0, 2) }])).toEqual([]);
  });
});

describe("kressMapToGeoJSON", () => {
  it("emits boundaries, zones, exclusions and markers with their kind", () => {
    const detail: KressMapDetail = {
      map: { uuid: "m", owner_id: 1, location_id: 2, group: "g", name: "Course" },
      layers: {
        boundaries: [
          {
            id: 1, enabled: true, name: "B", contours: [{ points: square(0, 0, 1) }],
            zones: [{ id: 5, type: "mowing", enabled: false, name: "Z", contours: [{ points: square(0, 0, 0.5) }] }],
          },
        ],
        exclusions: [{ id: 2, enabled: true, name: "Pond", contours: [{ points: square(0.1, 0.1, 0.1) }] }],
        markers: [{ type: "base_station", id: 4, enabled: true, name: "Dock", record: { latitude: 0.2, longitude: 0.3 }, product_item_uuid: null }],
      },
    };
    const kinds = kressMapToGeoJSON(detail).features.map((f) => [f.properties?.kind, f.geometry.type]);
    expect(kinds).toEqual([
      ["boundary", "Polygon"],
      ["zone_mowing", "Polygon"],
      ["exclusion", "Polygon"],
      ["marker_base_station", "Point"],
    ]);
  });
});
