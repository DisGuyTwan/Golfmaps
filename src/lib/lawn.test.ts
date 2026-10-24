import { describe, it, expect } from "vitest";
import area from "@turf/area";
import type { Polygon } from "geojson";
import {
  FT_TO_M,
  LOT_LOOKAROUND_M,
  SQ_M_TO_SQ_FT,
  aroundPoint,
  bboxContains,
  drivewayArea,
  formatSqft,
  keepPoint,
  lawnTotals,
  lotBBox,
  lotLooksOdd,
  mappedOnLot,
  stripAlong,
  type LawnMeasurement,
} from "./lawn";

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

/** Overpass JSON for closed ways (polygons) or open ways (lines, [lon, lat][]) with tags. */
function overpass(...ways: [Polygon | number[][], Record<string, string>][]) {
  const elements: object[] = [];
  let id = 1;
  for (const [shape, tags] of ways) {
    const closed = !Array.isArray(shape);
    const pts = closed ? (shape as Polygon).coordinates[0].slice(0, -1) : (shape as number[][]);
    const ids = pts.map(([lon, lat]) => {
      elements.push({ type: "node", id, lat, lon });
      return id++;
    });
    elements.push({ type: "way", id: id++, nodes: closed ? [...ids, ids[0]] : ids, tags });
  }
  return { version: 0.6, elements };
}
/** A point `x`, `y` metres from the lot's south-west corner, as [lon, lat]. */
const at = (x: number, y: number) => [LON + dLon(x), LAT + dLat(y)];

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
    expect(t.builtSqft).toBeCloseTo(sqft(house) + sqft(pool) + sqft(rect(29, 10, 1, 6)), 0);
    expect(t.lawnSqft).toBeCloseTo(t.lotSqft - t.builtSqft, 0);
    expect(t.tracedSqft).toBe(0);
  });
  it("counts a traced driveway once where it overlaps the house", () => {
    const t = lawnTotals(measurement([driveway]));
    expect(t.tracedSqft).toBeCloseTo(sqft(driveway) - sqft(rect(16, 25, 4, 7)), 0);
    expect(t.lawnSqft).toBeCloseTo(t.lotSqft - t.builtSqft - t.tracedSqft, 0);
    expect(t.lawn?.type).toBeDefined();
  });
  it("ignores the part of a trace outside the lot, and handles OSM still loading", () => {
    const t = lawnTotals({ ...measurement([rect(25, 0, 10, 10)]), mapped: null });
    expect(t.builtSqft).toBe(0);
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

describe("buildings from the LiDAR", () => {
  const shed = rect(22, 2, 6, 5); // a shed OSM doesn't have
  const houseFromLidar = rect(8.5, 22, 12, 10.5); // the mapped house as the LiDAR sees it, a little offset

  it("takes a building only the LiDAR sees off the lawn", () => {
    const base = lawnTotals(measurement());
    const t = lawnTotals({ ...measurement(), lidar: [{ id: "l1", kind: "building", geometry: shed }] });
    expect(t.lidarCount).toBe(1);
    expect(t.builtSqft - base.builtSqft).toBeCloseTo(sqft(shed), -1);
    expect(base.lawnSqft - t.lawnSqft).toBeCloseTo(sqft(shed), -1);
  });

  it("leaves a house OSM already has to OSM's outline", () => {
    const base = lawnTotals(measurement());
    const t = lawnTotals({ ...measurement(), lidar: [{ id: "l1", kind: "building", geometry: houseFromLidar }] });
    expect(t.lidarCount).toBe(0);
    expect(t.builtSqft).toBeCloseTo(base.builtSqft, 5);
  });
});

describe("pools and paving from the photos", () => {
  const patio = rect(10, 14, 6, 4); // pavers OSM doesn't have
  const poolFromPhotos = rect(5.2, 5, 5, 8.2); // the mapped pool as the photos show it
  const photoDriveway = rect(16, 32, 5, 8); // the driveway past the house
  const imagery = [
    { id: "i1", kind: "pool" as const, geometry: poolFromPhotos },
    { id: "i2", kind: "paving" as const, geometry: patio },
    { id: "i3", kind: "paving" as const, geometry: photoDriveway },
  ];

  it("takes paving off the lawn, and leaves a pool OSM has to OSM", () => {
    const base = lawnTotals(measurement());
    const t = lawnTotals({ ...measurement(), imagery });
    expect(t.photoPools).toBe(0);
    expect(t.photoPaved).toBe(2);
    expect(t.builtSqft - base.builtSqft).toBeLessThan(40); // only the edge the photos add to the pool
    expect(t.pavedSqft).toBeCloseTo(sqft(patio) + sqft(photoDriveway), -1);
    expect(base.lawnSqft - t.lawnSqft).toBeCloseTo(sqft(patio) + sqft(photoDriveway) + (t.builtSqft - base.builtSqft), -1);
  });

  it("keeps an area tapped as lawn, and counts a trace over photo paving once", () => {
    const tapped: [number, number] = [LAT + dLat(16), LON + dLon(12)]; // inside the patio
    const kept = lawnTotals({ ...measurement(), imagery, kept: [tapped] });
    expect(kept.photoPaved).toBe(1);
    expect(kept.pavedSqft).toBeCloseTo(sqft(photoDriveway), -1);
    const traced = lawnTotals({ ...measurement([rect(16, 30, 5, 10)]), imagery });
    expect(traced.tracedSqft).toBeCloseTo(sqft(rect(20, 30, 1, 2)), 0); // beside the house, below the photo driveway
  });

  it("stores a tap on a narrow strip where a link keeps it inside", () => {
    const edging = rect(3, 20.3, 12, 1.3); // a path of pavers 1.3 m wide, a little more than the link's 1.1 m grid
    const [lat, lon] = keepPoint(edging, LAT + dLat(20.4), LON + dLon(9));
    expect(Math.round(lat * 1e5)).toBeCloseTo(lat * 1e5, 6);
    expect(Math.round(lon * 1e5)).toBeCloseTo(lon * 1e5, 6);
    const t = lawnTotals({ ...measurement(), imagery: [{ id: "i1", kind: "paving", geometry: edging }], kept: [[lat, lon]] });
    expect(t.pavedSqft).toBe(0);
  });

  it("changes nothing while the photos load or where there are none", () => {
    const base = lawnTotals(measurement());
    expect(lawnTotals({ ...measurement(), imagery: null }).lawnSqft).toBeCloseTo(base.lawnSqft, 5);
    expect(lawnTotals({ ...measurement(), imagery: undefined }).photoPaved).toBe(0);
  });
});

describe("driveways and paving", () => {
  it("widens a line into a strip of the right area, bends included", () => {
    const straight = stripAlong([at(0, 0), at(20, 0)], 3.5)!;
    expect(sqft(straight as Polygon) / SQ_M_TO_SQ_FT).toBeCloseTo(70, 0);
    const bent = stripAlong([at(0, 0), at(10, 0), at(10, 10)], 4)!;
    // Two 10 × 4 m legs that overlap by 2 × 2 m inside the bend, plus the rounded outer corner.
    const m2 = sqft(bent as Polygon) / SQ_M_TO_SQ_FT;
    expect(m2).toBeGreaterThan(76);
    expect(m2).toBeLessThan(76 + Math.PI);
    expect(stripAlong([at(0, 0)], 3)).toBeNull();
  });
  it("takes a mapped driveway line out as paving, clipped to the lot, at its width tag", () => {
    // From the street (5 m below the lot) up to the house: 25 m long, 15 m on the lot.
    const m = mappedOnLot(overpass([[at(4, -5), at(4, 20)], { highway: "service", service: "driveway", width: "4" }]), lot);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("paving");
    // On the lot from y = 0 to 20, x = 2 to 6.
    expect(sqft(m[0].geometry as Polygon)).toBeCloseTo(sqft(rect(2, 0, 4, 20)), -1);
  });
  it("uses a typical width when untagged, and never fills a closed loop of road", () => {
    const aisle = mappedOnLot(overpass([[at(5, 10), at(25, 10)], { highway: "service", service: "parking_aisle" }]), lot);
    expect(sqft(aisle[0].geometry as Polygon)).toBeCloseTo(sqft(rect(5, 7, 20, 6)), -1);
    const loop = [at(5, 5), at(25, 5), at(25, 35), at(5, 35), at(5, 5)];
    const ring = mappedOnLot(overpass([loop, { highway: "service" }]), lot);
    // A 5 m strip around a 20 × 30 m loop, not the 600 m² inside it.
    expect(sqft(ring[0].geometry as Polygon) / SQ_M_TO_SQ_FT).toBeLessThan(560);
  });
  it("counts paving apart from buildings, and a traced driveway over mapped paving once", () => {
    const mapped = mappedOnLot(
      overpass([house, { building: "house" }], [[at(4, -5), at(4, 22)], { highway: "service", service: "driveway", width: "4" }]),
      lot,
    );
    const drive = drivewayArea([[LAT + dLat(0), LON + dLon(4)], [LAT + dLat(30), LON + dLon(4)]], 20 * FT_TO_M, "t1")!;
    const t = lawnTotals({ ...measurement(), mapped, traced: [drive] });
    expect(t.builtSqft).toBeCloseTo(sqft(house), 0);
    expect(t.pavedSqft).toBeCloseTo(sqft(rect(2, 0, 4, 22)), -1);
    expect(t.lotSqft - t.builtSqft - t.pavedSqft - t.tracedSqft).toBeCloseTo(t.lawnSqft, 0);
    expect(drive.path).toHaveLength(2);
    expect(drive.widthM).toBeCloseTo(6.096, 3);
  });
});

describe("lookaround box", () => {
  it("reaches LOT_LOOKAROUND_M each way and holds a house lot, not a farm", () => {
    // Tapped in the middle of the 30 × 40 m lot.
    const [lon, lat] = at(15, 20);
    const box = aroundPoint(lat, lon);
    expect((box.north - box.south) * 111_320).toBeCloseTo(2 * LOT_LOOKAROUND_M, 6);
    expect(box.east - box.west).toBeCloseTo(dLon(2 * LOT_LOOKAROUND_M), 6);
    expect(bboxContains(box, lotBBox(rect(0, 0, 30, 40)))).toBe(true);
    expect(bboxContains(box, lotBBox(rect(0, 0, 30, 300)))).toBe(false);
  });
});
