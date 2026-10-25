import { describe, it, expect } from "vitest";
import area from "@turf/area";
import type { Polygon, Position } from "geojson";
import { ALLOWANCE_HALF_M, HOUSE_MAX_M2, REACH_M, estimateLot, lotInputs, type LotBuilding, type LotInputs } from "./estimated-lot";

/*
 * A Toronto subdivision built in metres from the point tapped: two streets
 * 90 m apart, three houses facing each (10 m wide, 15 m apart, 16 m from
 * the street's centre line) and a row across the first street. The lot of
 * the middle house is 15 × 35 m: 7.5 m to either side, from the road
 * allowance (10 m from the centre line) to midway to the house behind.
 */
const LAT = 43.7, LON = -79.4;
const dLat = (m: number) => m / 111_320;
const dLon = (m: number) => m / (111_320 * Math.cos((LAT * Math.PI) / 180));
const at = (x: number, y: number): Position => [LON + dLon(x), LAT + dLat(y)];
/** Rectangle from (x0, y0) to (x1, y1) metres. */
function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
  return { type: "Polygon", coordinates: [[at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]] };
}
const m2 = (p: Polygon) => area({ type: "Feature", geometry: p, properties: {} });
/** The lot's extent in metres from the point. */
function extent(p: Polygon) {
  const xs = p.coordinates[0].map(([lon]) => (lon - LON) / dLon(1));
  const ys = p.coordinates[0].map(([, lat]) => (lat - LAT) / dLat(1));
  return { west: Math.min(...xs), east: Math.max(...xs), south: Math.min(...ys), north: Math.max(...ys) };
}

const house = (cx: number, y0: number, y1: number): LotBuilding => ({ geometry: rect(cx - 5, y0, cx + 5, y1), outbuilding: false });
const street = (y: number) => ({ line: [at(-100, y), at(100, y)], halfM: ALLOWANCE_HALF_M.residential });
function subdivision(skip: number[] = []): LotInputs {
  const buildings: LotBuilding[] = [];
  for (const cx of [-15, 0, 15]) {
    if (!skip.includes(cx)) buildings.push(house(cx, 16, 30)); // facing the first street
    buildings.push(house(cx, 60, 74)); // backing onto them, facing the second
    buildings.push(house(cx, -30, -16)); // across the first street
  }
  return { buildings, streets: [street(0), street(90)] };
}

describe("estimateLot", () => {
  it("draws the lot midway to the neighbours and the house behind, from the road allowance", () => {
    const est = estimateLot(LAT + dLat(23), LON, subdivision());
    expect(est).not.toBeNull();
    const e = extent(est!.lot);
    expect(m2(est!.lot)).toBeGreaterThan(525 * 0.92);
    expect(m2(est!.lot)).toBeLessThan(525 * 1.08);
    expect(e.west).toBeCloseTo(-7.5, 0);
    expect(e.east).toBeCloseTo(7.5, 0);
    expect(e.north).toBeCloseTo(45, 0);
    // Never into the street, nor across it.
    expect(e.south).toBeGreaterThan(9);
    expect(e.south).toBeLessThan(11);
  });

  it("leaves sheds and garages out of the neighbours", () => {
    const base = estimateLot(LAT + dLat(23), LON, subdivision())!;
    const inputs = subdivision();
    inputs.buildings.push({ geometry: rect(0, 38, 3, 41), outbuilding: true }); // a shed out back
    inputs.buildings.push({ geometry: rect(-6.5, 34, -2.5, 38), outbuilding: false }); // an untagged 16 m² one
    const withSheds = estimateLot(LAT + dLat(23), LON, inputs)!;
    expect(Math.abs(m2(withSheds.lot) - m2(base.lot))).toBeLessThan(m2(base.lot) * 0.02);
  });

  it("stops at REACH_M from the house where no neighbour bounds it", () => {
    const est = estimateLot(LAT + dLat(23), LON, subdivision([15]))!;
    const e = extent(est.lot);
    expect(m2(est.lot)).toBeGreaterThan(600);
    expect(e.east).toBeLessThanOrEqual(5 + REACH_M + 1);
    expect(e.west).toBeCloseTo(-7.5, 0);
  });

  it("takes the nearest house for a point that landed on the street", () => {
    const est = estimateLot(LAT + dLat(3), LON, subdivision())!;
    expect(extent(est.lot).south).toBeGreaterThan(9); // the house 13 m north, not the one 19 m south
  });

  it("finds no lot without a house near the point, or on a building too big to be one", () => {
    expect(estimateLot(LAT, LON, { buildings: [], streets: [street(0)] })).toBeNull();
    const side = Math.sqrt(HOUSE_MAX_M2 * 1.5);
    expect(estimateLot(LAT + dLat(23), LON, { buildings: [{ geometry: rect(-side / 2, 16, side / 2, 16 + side), outbuilding: false }], streets: [street(0)] })).toBeNull();
  });
});

describe("lotInputs", () => {
  it("reads buildings (outbuildings flagged) and streets with their road allowance", () => {
    const elements: object[] = [];
    let id = 1;
    const way = (pts: Position[], tags: Record<string, string>, closed: boolean) => {
      const ids = pts.map(([lon, lat]) => {
        elements.push({ type: "node", id, lat, lon });
        return id++;
      });
      elements.push({ type: "way", id: id++, nodes: closed ? [...ids, ids[0]] : ids, tags });
    };
    way(rect(-5, 16, 5, 30).coordinates[0].slice(0, -1), { building: "house" }, true);
    way(rect(0, 38, 3, 41).coordinates[0].slice(0, -1), { building: "shed" }, true);
    way([at(-50, 0), at(50, 0)], { highway: "residential", name: "Elm Street" }, false);
    way([at(-50, 50), at(50, 50)], { highway: "secondary_link" }, false);
    way([at(0, 10), at(0, 16)], { highway: "service", service: "driveway" }, false);
    way([at(-50, 5), at(50, 5)], { highway: "footway" }, false);
    const inputs = lotInputs({ version: 0.6, elements });
    expect(inputs.buildings.map((b) => b.outbuilding)).toEqual([false, true]);
    expect(inputs.streets.map((s) => s.halfM)).toEqual([ALLOWANCE_HALF_M.residential, ALLOWANCE_HALF_M.secondary]);
  });
});
