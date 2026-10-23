import { describe, it, expect } from "vitest";
import area from "@turf/area";
import type { Polygon } from "geojson";
import { SQ_M_TO_SQ_FT, formatSqft, lawnTotals, lotBBox, lotLooksOdd, mappedOnLot, type LawnMeasurement } from "./lawn";

/*
 * A residential lot near Boucherville, built in metres: a 30 × 40 m lot with a
 * house, a pool and a driveway, plus a neighbour's garage that grazes the line.
 * The lawn must be the lot minus each of them counted once.
 */
const LAT = 45.58, LON = -73.45;
const dLat = (m: number) => m / 111_320;
const dLon = (m: number) => m / (111_320 * Math.cos((LAT * Math.PI) / 180));
/** Rectangle `w` × `h` metres whose south-west corner is `x`, `y` metres from the lot's. */
function rect(x: number, y: number, w: number, h: number): Polygon {
  const [w0, s0] = [LON + dLon(x), LAT + dLat(y)];
  const [e0, n0] = [w0 + dLon(w), s0 + dLat(h)];
  return { type: "Polygon", coordinates: [[[w0, s0], [e0, s0], [e0, n0], [w0, n0], [w0, s0]]] };
}
const sqft = (p: Polygon) => area({ type: "Feature", geometry: p, properties: {} }) * SQ_M_TO_SQ_FT;

/** Overpass JSON for closed ways with tags, the shape the lawn query returns. */
function overpass(...ways: [Polygon, Record<string, string>][]) {
  const elements: object[] = [];
  let id = 1;
  for (const [poly, tags] of ways) {
    const ring = poly.coordinates[0].slice(0, -1);
    const ids = ring.map(([lon, lat]) => {
      elements.push({ type: "node", id, lat, lon });
      return id++;
    });
    elements.push({ type: "way", id: id++, nodes: [...ids, ids[0]], tags });
  }
  return { version: 0.6, elements };
}

const lot = rect(0, 0, 30, 40);
const house = rect(8, 22, 12, 10);
const pool = rect(5, 5, 5, 8);
const neighbourGarage = rect(29, 10, 8, 6); // 1 m of it on this lot
const driveway = rect(16, 25, 5, 15); // overlaps the house by 4 × 7 m

function measurement(traced: Polygon[] = []): LawnMeasurement {
  return {
    lot,
    lotSource: "cadastre",
    lotNumber: "2 115 418",
    pickPoint: [LAT, LON],
    mapped: mappedOnLot(
      overpass([house, { building: "house" }], [pool, { leisure: "swimming_pool" }], [neighbourGarage, { building: "garage" }], [rect(2, 2, 3, 3), { natural: "tree_row" }]),
      lot,
    ),
    mappedFailed: false,
    traced: traced.map((geometry, i) => ({ id: `t${i + 1}`, kind: "traced", geometry })),
  };
}

describe("mappedOnLot", () => {
  it("keeps buildings, pools and paving on the lot, clipped to it", () => {
    const m = mappedOnLot(overpass([house, { building: "house" }], [pool, { leisure: "swimming_pool" }], [neighbourGarage, { building: "garage" }]), lot);
    expect(m.map((a) => a.kind)).toEqual(["building", "pool", "building"]);
    // Only the 1 × 6 m strip of the neighbour's garage that is on this lot.
    expect(sqft(m[2].geometry as Polygon)).toBeCloseTo(sqft(rect(29, 10, 1, 6)), 0);
  });
  it("drops slivers under 5 sq ft and anything that isn't a hard surface", () => {
    const sliver = rect(29.98, 10, 8, 6); // 2 cm on the lot
    const m = mappedOnLot(overpass([sliver, { building: "yes" }], [rect(3, 3, 4, 4), { natural: "wood" }]), lot);
    expect(m).toEqual([]);
  });
});

describe("lawnTotals", () => {
  it("is the lot minus the house, the pool and the part of the neighbour's garage on it", () => {
    const t = lawnTotals(measurement());
    expect(t.lotSqft).toBeCloseTo(sqft(lot), 0);
    expect(t.mappedSqft).toBeCloseTo(sqft(house) + sqft(pool) + sqft(rect(29, 10, 1, 6)), 0);
    expect(t.lawnSqft).toBeCloseTo(t.lotSqft - t.mappedSqft, 0);
    expect(t.tracedSqft).toBe(0);
  });
  it("counts a traced driveway once where it overlaps the house", () => {
    const t = lawnTotals(measurement([driveway]));
    expect(t.tracedSqft).toBeCloseTo(sqft(driveway) - sqft(rect(16, 25, 4, 7)), 0);
    expect(t.lawnSqft).toBeCloseTo(t.lotSqft - t.mappedSqft - t.tracedSqft, 0);
    expect(t.lawn?.type).toBeDefined();
  });
  it("ignores the part of a trace outside the lot, and handles OSM still loading", () => {
    const t = lawnTotals({ ...measurement([rect(25, 0, 10, 10)]), mapped: null });
    expect(t.mappedSqft).toBe(0);
    expect(t.tracedSqft).toBeCloseTo(sqft(rect(25, 0, 5, 10)), 0);
  });
  it("leaves no lawn when the whole lot is traced out", () => {
    const t = lawnTotals({ ...measurement([rect(-1, -1, 32, 42)]), mapped: [] });
    expect(t.lawnSqft).toBe(0);
    expect(t.lawn).toBeNull();
  });
});

describe("helpers", () => {
  it("formats square feet in each language", () => {
    expect(formatSqft(12345.4, "en")).toBe("12,345 sq ft");
    expect(formatSqft(12345.4, "fr")).toMatch(/^12\s345 pi²$/u);
  });
  it("bounds the lot with a margin for the lookup", () => {
    const b = lotBBox(lot, 0.001);
    expect(b.south).toBeCloseTo(LAT - 0.001, 9);
    expect(b.east).toBeCloseTo(LON + dLon(30) + 0.001, 9);
  });
});

describe("lotLooksOdd", () => {
  it("accepts ordinary house lots, including an L-shaped one", () => {
    expect(lotLooksOdd(lot)).toBe(false);
    const ell: Polygon = {
      type: "Polygon",
      coordinates: [rect(0, 0, 30, 10).coordinates[0].slice(0, 2).concat([
        [LON + dLon(30), LAT + dLat(10)], [LON + dLon(10), LAT + dLat(10)], [LON + dLon(10), LAT + dLat(30)], [LON, LAT + dLat(30)], [LON, LAT],
      ])],
    };
    expect(lotLooksOdd(ell)).toBe(false);
  });
  it("accepts a real Boucherville house lot from the cadastre (lot 2 278 398)", () => {
    const real: Polygon = {
      type: "Polygon",
      coordinates: [[
        [-73.444191981464, 45.58562409531114], [-73.44450320998071, 45.585795039865346], [-73.4446591081067, 45.58567859549235],
        [-73.44469378128005, 45.5856526958108], [-73.44436067429459, 45.58546972667128], [-73.44435496729758, 45.58547490385923],
        [-73.444191981464, 45.58562409531114],
      ]],
    };
    expect(lotLooksOdd(real)).toBe(false);
    expect(sqft(real)).toBeCloseTo(7413, -1);
  });
  it("flags a street-like strip and a lot too big for one house", () => {
    expect(lotLooksOdd(rect(0, 0, 400, 15))).toBe(true);
    expect(lotLooksOdd(rect(0, 0, 80, 80))).toBe(true);
  });
});
