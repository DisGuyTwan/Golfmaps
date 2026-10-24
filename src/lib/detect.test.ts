import { describe, expect, it } from "vitest";
import { ACI_SOD, type LandGrid } from "./landcover";
import { HOUSE_LOT_M2, golfCourseAt, propertyKind, settledByLot, sodShareAround } from "./detect";

/** Overpass JSON for closed ways of [lon, lat] corners, with tags. */
function overpass(...ways: [number[][], Record<string, string>][]) {
  const elements: object[] = [];
  let id = 1;
  for (const [corners, tags] of ways) {
    const ids = corners.map(([lon, lat]) => {
      elements.push({ type: "node", id, lat, lon });
      return id++;
    });
    elements.push({ type: "way", id: id++, nodes: [...ids, ids[0]], tags });
  }
  return { version: 0.6, elements };
}
const box = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n]];

describe("golf course at a point", () => {
  const json = overpass(
    [box(-73.32, 45.49, -73.29, 45.52), { leisure: "golf_course", name: "Club de golf Rive-Sud" }],
    [box(-73.31, 45.50, -73.305, 45.505), { building: "yes" }],
  );

  it("finds the course whose outline holds the point, with its name", () => {
    const course = golfCourseAt(json, 45.505, -73.304);
    expect(course?.name).toBe("Club de golf Rive-Sud");
    expect(course?.geometry.type).toBe("Polygon");
  });

  it("finds nothing outside every course, or with no course at all", () => {
    expect(golfCourseAt(json, 45.53, -73.304)).toBeNull();
    expect(golfCourseAt(overpass([box(-73.31, 45.5, -73.3, 45.51), { building: "house" }]), 45.505, -73.305)).toBeNull();
  });
});

describe("sod around a point", () => {
  // 20 × 20 cells of about 15 m; the east half is sod, the west half hay.
  const grid: LandGrid = {
    source: "aci",
    year: 2025,
    bbox: { south: 45.0, west: -73.0, north: 45.0027, east: -72.9962 },
    width: 20,
    height: 20,
    data: new Uint8Array(400).map((_, i) => (i % 20 >= 10 ? ACI_SOD : 122)),
  };

  it("reads the share of sod within the radius", () => {
    expect(sodShareAround(grid, 45.00135, -72.9981, 100)).toBeCloseTo(0.5, 1);
    expect(sodShareAround(grid, 45.00135, -72.9965, 30)).toBe(1);
    expect(sodShareAround(grid, 45.00135, -72.9997, 30)).toBe(0);
  });

  it("ignores cells with no data", () => {
    expect(sodShareAround({ ...grid, data: new Uint8Array(400) }, 45.00135, -72.9981, 100)).toBe(0);
  });
});

describe("property kind", () => {
  it("calls a house lot a lawn, even by sod fields or inside a course outline", () => {
    expect(propertyKind({ lotM2: 900, sodShare: 0.8, inGolfCourse: true })).toBe("lawn");
    expect(settledByLot(900)).toBe(true);
  });

  it("calls a big lot with sod around it a sod farm, before a golf course", () => {
    expect(propertyKind({ lotM2: 300_000, sodShare: 0.6, inGolfCourse: true })).toBe("sod");
    expect(propertyKind({ lotM2: null, sodShare: 0.4, inGolfCourse: false })).toBe("sod");
    expect(settledByLot(HOUSE_LOT_M2 * 3)).toBe(false);
  });

  it("calls a big lot or no lot inside a course outline a golf course, and anything else a lawn", () => {
    expect(propertyKind({ lotM2: 500_000, sodShare: 0, inGolfCourse: true })).toBe("golf");
    expect(propertyKind({ lotM2: null, sodShare: 0.1, inGolfCourse: true })).toBe("golf");
    expect(propertyKind({ lotM2: 20_000, sodShare: 0.1, inGolfCourse: false })).toBe("lawn");
  });
});
