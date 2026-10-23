import { describe, it, expect } from "vitest";
import area from "@turf/area";
import { SQ_METERS_TO_ACRES } from "./area";
import {
  ACI_SOD,
  WC,
  cellAcres,
  classAcres,
  decodeGrid,
  estimatedTurf,
  findSodFields,
  fitsSource,
  geometryBBox,
  overlayPixels,
  pointInGeometry,
  polygonMask,
  satelliteTurf,
  tracedField,
  tracedPoints,
  tracedPolygon,
  type LandGrid,
} from "./landcover";
import type { Polygon } from "geojson";

/*
 * Land cover turns pixels into acres that go straight into a quote, so these
 * tests pin the arithmetic (cell areas at Quebec latitudes), what counts as
 * turf inside an outline, and how sod fields are cut out of the crop map.
 */

/** A grid of `rows` × `cols` cells of `cellDeg` degrees, north-west corner at (46.5, -72.5). */
function grid(rows: number, cols: number, cellDeg: number, fill = 0, source: LandGrid["source"] = "aci"): LandGrid {
  return {
    source,
    year: 2025,
    bbox: { north: 46.5, west: -72.5, south: 46.5 - rows * cellDeg, east: -72.5 + cols * cellDeg },
    width: cols,
    height: rows,
    data: new Uint8Array(rows * cols).fill(fill),
  };
}

function paint(g: LandGrid, r0: number, c0: number, rows: number, cols: number, value: number) {
  for (let r = r0; r < r0 + rows; r++) for (let c = c0; c < c0 + cols; c++) g.data[r * g.width + c] = value;
}

function boxPolygon(south: number, west: number, north: number, east: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

const sumAcres = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("cellAcres", () => {
  it("adds up to the same area turf gives for the whole window", () => {
    const g = grid(100, 100, 0.0002);
    let total = 0;
    for (let r = 0; r < g.height; r++) total += cellAcres(g, r) * g.width;
    const { south, west, north, east } = g.bbox;
    const turfAcres = area(boxPolygon(south, west, north, east)) * SQ_METERS_TO_ACRES;
    expect(total / turfAcres).toBeCloseTo(1, 3);
  });
  it("a 15 m cell at 46° N is about 0.056 acres", () => {
    const g = grid(1, 1, 15 / 111_320);
    // 15 m tall × (15 m × cos 46°) wide.
    expect(cellAcres(g, 0)).toBeCloseTo(15 * 15 * Math.cos((46.5 * Math.PI) / 180) * SQ_METERS_TO_ACRES, 3);
  });
});

describe("polygonMask", () => {
  it("selects the cells whose centers fall inside, holes excluded", () => {
    const g = grid(10, 10, 0.001);
    const { north, west } = g.bbox;
    // Outer: cells 2..7 in both directions; hole: cells 4..5.
    const outer = boxPolygon(north - 0.008, west + 0.002, north - 0.002, west + 0.008).coordinates[0];
    const hole = boxPolygon(north - 0.006, west + 0.004, north - 0.004, west + 0.006).coordinates[0];
    const mask = polygonMask(g, [{ type: "Polygon", coordinates: [outer, hole] }]);
    expect(mask.reduce((a, b) => a + b, 0)).toBe(36 - 4);
    expect(mask[2 * 10 + 2]).toBe(1);
    expect(mask[4 * 10 + 4]).toBe(0);
    expect(mask[1 * 10 + 1]).toBe(0);
  });
  it("unions several polygons instead of cancelling their overlap", () => {
    const g = grid(10, 10, 0.001);
    const { north, west } = g.bbox;
    const a = boxPolygon(north - 0.006, west, north, west + 0.006);
    const b = boxPolygon(north - 0.006, west + 0.003, north, west + 0.009);
    const mask = polygonMask(g, [a, b]);
    expect(mask.reduce((x, y) => x + y, 0)).toBe(6 * 9);
  });
});

describe("satelliteTurf", () => {
  it("counts only grassland as turf and splits out trees, buildings and water", () => {
    const g = grid(20, 20, 0.0005, WC.grass, "worldcover");
    paint(g, 0, 0, 20, 5, WC.trees);
    paint(g, 0, 5, 2, 15, WC.built);
    paint(g, 18, 5, 2, 15, WC.water);
    paint(g, 10, 10, 1, 1, WC.crops);
    const { south, west, north, east } = g.bbox;
    const s = satelliteTurf(g, [boxPolygon(south, west, north, east)]);
    const cell = s.outlineAcres / 400;
    expect(s.grassAcres / cell).toBeCloseTo(16 * 15 - 1, 0);
    expect(s.treesAcres / cell).toBeCloseTo(100, 0);
    expect(s.builtAcres / cell).toBeCloseTo(30, 0);
    expect(s.waterAcres / cell).toBeCloseTo(30, 0);
    expect(s.otherAcres / cell).toBeCloseTo(1, 0);
    expect(s.year).toBe(2025);
  });
  it("estimates maintained turf as the calibrated share of the grass, with its range", () => {
    const t = estimatedTurf({ grassAcres: 200 } as Parameters<typeof estimatedTurf>[0]);
    expect(t.acres).toBeCloseTo(118, 6);
    expect(t.low).toBeCloseTo(93.22, 6);
    expect(t.high).toBeCloseTo(148.68, 6);
  });
  it("ignores everything outside the outline", () => {
    const g = grid(20, 20, 0.0005, WC.grass, "worldcover");
    const { north, west } = g.bbox;
    const half = satelliteTurf(g, [boxPolygon(north - 0.01, west, north, west + 0.005)]);
    const whole = sumAcres(classAcres(g, new Uint8Array(400).fill(1)));
    expect(half.grassAcres / whole).toBeCloseTo(0.5, 2);
  });
});

describe("findSodFields", () => {
  it("finds separate fields, biggest first, with acres from the cells", () => {
    const g = grid(60, 60, 0.0003);
    paint(g, 5, 5, 20, 30, ACI_SOD); // 600 cells
    paint(g, 35, 5, 10, 10, ACI_SOD); // 100 cells
    const fields = findSodFields(g);
    expect(fields.map((f) => f.id)).toEqual(["d1", "d2"]);
    const rowCell = cellAcres(g, 15);
    expect(fields[0].acres / rowCell).toBeCloseTo(600, -1);
    expect(fields[1].acres / rowCell).toBeCloseTo(100, -1);
    expect(fields.every((f) => f.included && !f.traced)).toBe(true);
  });
  it("draws an outline close to the counted area, with the anchor inside it", () => {
    const g = grid(60, 60, 0.0003);
    paint(g, 5, 5, 40, 30, ACI_SOD);
    const [field] = findSodFields(g);
    const drawn = area(field.geometry) * SQ_METERS_TO_ACRES;
    // Marching squares trims half a cell at each corner only.
    expect(drawn / field.acres).toBeGreaterThan(0.99);
    expect(drawn / field.acres).toBeLessThanOrEqual(1);
    expect(pointInGeometry(field.anchor[1], field.anchor[0], field.geometry)).toBe(true);
  });
  it("drops specks below the minimum and fills small gaps inside a field", () => {
    const g = grid(60, 60, 0.0003);
    paint(g, 5, 5, 30, 30, ACI_SOD);
    paint(g, 15, 15, 2, 2, 0); // a misread gap inside the field
    paint(g, 50, 50, 1, 1, ACI_SOD); // a lone pixel
    const fields = findSodFields(g);
    expect(fields).toHaveLength(1);
    expect(fields[0].acres / cellAcres(g, 15)).toBeCloseTo(900, -1);
    expect(fields[0].geometry.type).toBe("Polygon");
    expect((fields[0].geometry as Polygon).coordinates).toHaveLength(1);
  });
  it("keeps large holes (a pond or a house lot) out of the field", () => {
    const g = grid(80, 80, 0.0003);
    paint(g, 0, 0, 80, 80, ACI_SOD);
    paint(g, 30, 30, 20, 20, 0);
    const [field] = findSodFields(g);
    expect(field.acres / cellAcres(g, 40)).toBeCloseTo(6400 - 400, -1);
    expect((field.geometry as Polygon).coordinates).toHaveLength(2);
  });
  it("returns nothing when the map has no sod", () => {
    expect(findSodFields(grid(10, 10, 0.0003, 122))).toEqual([]);
  });
});

describe("traced fields and geometry helpers", () => {
  it("measures a traced field like turf would", () => {
    const pts: [number, number][] = [[46.4, -72.4], [46.4, -72.39], [46.41, -72.39], [46.41, -72.4]];
    const field = tracedField(pts, "t1");
    expect(field.traced).toBe(true);
    expect(field.acres).toBeCloseTo(area(tracedPolygon(pts)) * SQ_METERS_TO_ACRES, 6);
    expect(pointInGeometry(field.anchor[1], field.anchor[0], field.geometry)).toBe(true);
    expect(pointInGeometry(-72.38, 46.405, field.geometry)).toBe(false);
    expect(tracedPoints(field.geometry)).toEqual(pts);
  });
  it("bounds geometries with a margin and checks the size limit", () => {
    const box = geometryBBox([boxPolygon(46, -72, 46.01, -71.99)], 0.001)!;
    expect(box.south).toBeCloseTo(45.999, 6);
    expect(box.east).toBeCloseTo(-71.989, 6);
    expect(fitsSource(box, "worldcover")).toBe(true);
    expect(fitsSource({ south: 46, west: -72, north: 46.2, east: -71.9 }, "aci")).toBe(false);
    expect(geometryBBox([])).toBeNull();
  });
});

describe("transport and overlay", () => {
  it("decodes the route's base64 grid", () => {
    const g = grid(3, 4, 0.001, 30);
    g.data[5] = 192;
    const json = { ...g, data: Buffer.from(g.data).toString("base64") };
    expect(decodeGrid(json).data).toEqual(g.data);
    expect(() => decodeGrid({ ...json, width: 5 })).toThrow();
  });
  it("paints only the wanted classes inside the mask", () => {
    const g = grid(2, 2, 0.001, WC.grass);
    g.data[1] = WC.trees;
    const px = overlayPixels(g, Uint8Array.from([1, 1, 1, 0]), [WC.grass], [1, 2, 3, 4]);
    expect([...px]).toEqual([1, 2, 3, 4, 0, 0, 0, 0, 1, 2, 3, 4, 0, 0, 0, 0]);
  });
});
