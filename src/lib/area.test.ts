import { describe, it, expect } from "vitest";
import { processOverpassData, SQ_METERS_TO_ACRES } from "./area";

/*
 * `processOverpassData` turns raw Overpass JSON into the acreage a quote is
 * built from. It is the one place in this app where a bug produces a
 * confidently wrong number rather than a visible failure, so the cases below
 * lean on the decisions that are easy to regress: what counts as turf, what
 * gets subtracted, and when rough is refused rather than estimated.
 *
 * Overpass returns nodes plus ways referencing them; osmtogeojson stitches
 * them into polygons. These helpers build that shape by hand so the tests can
 * state areas in metres and reason about the arithmetic directly.
 */

/** A closed square `size` metres on a side, anchored near the equator. */
function square(
  id: number,
  startNodeId: number,
  originLon: number,
  originLat: number,
  sizeMeters: number,
  tags: Record<string, string>,
) {
  // At the equator one degree of latitude is ~111_320 m, and longitude
  // likewise since cos(0) = 1. Small squares here keep the distortion
  // negligible for assertions made with a tolerance.
  const d = sizeMeters / 111_320;
  const corners = [
    [originLon, originLat],
    [originLon + d, originLat],
    [originLon + d, originLat + d],
    [originLon, originLat + d],
  ];
  const nodes = corners.map(([lon, lat], i) => ({
    type: "node" as const,
    id: startNodeId + i,
    lat,
    lon,
  }));
  return {
    nodes,
    way: {
      type: "way" as const,
      id,
      // closed ring: first node repeated last
      nodes: [...nodes.map((n) => n.id), nodes[0].id],
      tags,
    },
  };
}

function overpass(...parts: ReturnType<typeof square>[]) {
  return {
    version: 0.6,
    elements: [...parts.flatMap((p) => p.nodes), ...parts.map((p) => p.way)],
  };
}

/** Area of an n-metre square in acres, for readable expectations. */
const acresOf = (m: number) => m * m * SQ_METERS_TO_ACRES;
const CLOSE = 1; // percent tolerance, absorbing the lat/lon approximation

function expectAcres(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan((expected * CLOSE) / 100 + 1e-6);
}

describe("processOverpassData", () => {
  it("reports nothing found for an empty response", () => {
    const r = processOverpassData(overpass());
    expect(r.found).toBe(false);
    expect(r.totalTurfAcres).toBe(0);
    expect(r.boundaryOnly).toBe(false);
  });

  it("sums mapped fairways, greens and tees with their counts", () => {
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 100, { golf: "fairway" }),
        square(2, 200, 0.01, 0, 100, { golf: "fairway" }),
        square(3, 300, 0.02, 0, 50, { golf: "green" }),
        square(4, 400, 0.03, 0, 20, { golf: "tee" }),
      ),
    );

    expect(r.found).toBe(true);
    expect(r.fairway.count).toBe(2);
    expectAcres(r.fairway.acres, acresOf(100) * 2);
    expect(r.green.count).toBe(1);
    expectAcres(r.green.acres, acresOf(50));
    expect(r.tee.count).toBe(1);
    expectAcres(r.tee.acres, acresOf(20));
  });

  it("prefers mapped rough over an estimate", () => {
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 300, { leisure: "golf_course" }),
        square(2, 200, 0, 0, 100, { golf: "fairway" }),
        square(3, 300, 0, 0, 60, { golf: "rough" }),
      ),
    );

    expect(r.roughEstimated).toBe(false);
    expect(r.rough.count).toBe(1);
    expectAcres(r.rough.acres, acresOf(60));
  });

  it("estimates rough as the boundary minus everything else when it isn't mapped", () => {
    // 300m course containing a 100m fairway and a 50m green.
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 300, { leisure: "golf_course" }),
        square(2, 200, 0, 0, 100, { golf: "fairway" }),
        square(3, 300, 0.005, 0, 50, { golf: "green" }),
      ),
    );

    expect(r.roughEstimated).toBe(true);
    expect(r.rough.count).toBe(0);
    expectAcres(r.rough.acres, acresOf(300) - acresOf(100) - acresOf(50));
  });

  it("refuses to estimate rough when only the boundary is mapped", () => {
    // This is the case that would otherwise bill the whole property as mowable.
    const r = processOverpassData(
      overpass(square(1, 100, 0, 0, 300, { leisure: "golf_course" })),
    );

    expect(r.found).toBe(true);
    expect(r.boundaryOnly).toBe(true);
    expect(r.roughEstimated).toBe(false);
    expect(r.rough.acres).toBe(0);
    expect(r.totalTurfAcres).toBe(0);
    expectAcres(r.courseAcres, acresOf(300));
  });

  it("subtracts woods and buildings from estimated rough", () => {
    const withoutObstacles = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 300, { leisure: "golf_course" }),
        square(2, 200, 0, 0, 100, { golf: "fairway" }),
      ),
    );
    const withObstacles = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 300, { leisure: "golf_course" }),
        square(2, 200, 0, 0, 100, { golf: "fairway" }),
        square(3, 300, 0.0015, 0.0015, 80, { natural: "wood" }),
        square(4, 400, 0.0018, 0, 40, { building: "yes" }),
        square(5, 500, 0.0022, 0, 30, { amenity: "parking" }),
      ),
    );

    expectAcres(withObstacles.treesAcres, acresOf(80));
    expectAcres(withObstacles.builtAcres, acresOf(40) + acresOf(30));
    expect(withObstacles.rough.acres).toBeLessThan(withoutObstacles.rough.acres);
    expectAcres(
      withObstacles.rough.acres,
      withoutObstacles.rough.acres -
        withObstacles.treesAcres -
        withObstacles.builtAcres,
    );
  });

  it("only subtracts the part of a wood that falls inside the course", () => {
    // A 200m wood whose origin sits at the course's far corner, so roughly a
    // quarter of it overlaps. Subtracting it whole would understate the turf.
    const courseSide = 300;
    const d = courseSide / 111_320;
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, courseSide, { leisure: "golf_course" }),
        square(2, 200, 0, 0, 100, { golf: "fairway" }),
        square(3, 300, d - 100 / 111_320, d - 100 / 111_320, 200, {
          natural: "wood",
        }),
      ),
    );

    // The wood is 200m square (≈9.9 acres) but only its 100m corner overlaps.
    expectAcres(r.treesAcres, acresOf(100));
    expect(r.treesAcres).toBeLessThan(acresOf(200));
  });

  it("never lets an estimate go negative when obstacles exceed the boundary", () => {
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 120, { leisure: "golf_course" }),
        square(2, 200, 0, 0, 100, { golf: "fairway" }),
        square(3, 300, 0, 0, 120, { natural: "wood" }),
      ),
    );

    expect(r.rough.acres).toBeGreaterThanOrEqual(0);
    expect(r.totalTurfAcres).toBeGreaterThanOrEqual(0);
  });

  it("totals turf as fairway + green + tee + rough", () => {
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 300, { leisure: "golf_course" }),
        square(2, 200, 0, 0, 100, { golf: "fairway" }),
        square(3, 300, 0.005, 0, 50, { golf: "green" }),
        square(4, 400, 0.008, 0, 20, { golf: "tee" }),
      ),
    );

    expectAcres(
      r.totalTurfAcres,
      r.fairway.acres + r.green.acres + r.tee.acres + r.rough.acres,
    );
  });

  it("keeps water and bunkers out of the turf total but off the map layers", () => {
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 300, { leisure: "golf_course" }),
        square(2, 200, 0, 0, 100, { golf: "fairway" }),
        square(3, 300, 0.005, 0, 40, { golf: "water_hazard" }),
        square(4, 400, 0.008, 0, 30, { golf: "bunker" }),
      ),
    );

    // Neither is turf, so neither inflates the total...
    expectAcres(r.totalTurfAcres, r.fairway.acres + r.rough.acres);
    // ...and neither is drawn: only course/rough/fairway/tee/green render.
    const rendered = new Set(
      r.geojson.features.map((f) => f.properties?._category as string),
    );
    expect(rendered.has("water")).toBe(false);
    expect(rendered.has("bunker")).toBe(false);
  });

  it("orders rendered features so detail draws over the boundary", () => {
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 300, { leisure: "golf_course" }),
        square(2, 200, 0.005, 0, 50, { golf: "green" }),
        square(3, 300, 0, 0, 100, { golf: "fairway" }),
      ),
    );

    const order = r.geojson.features.map((f) => f.properties?._category);
    expect(order.indexOf("course")).toBeLessThan(order.indexOf("fairway"));
    expect(order.indexOf("fairway")).toBeLessThan(order.indexOf("green"));
  });

  it("ignores unmapped tags rather than counting them as turf", () => {
    const r = processOverpassData(
      overpass(
        square(1, 100, 0, 0, 100, { golf: "fairway" }),
        square(2, 200, 0.01, 0, 100, { highway: "service" }),
        square(3, 300, 0.02, 0, 100, { landuse: "residential" }),
      ),
    );

    expectAcres(r.totalTurfAcres, acresOf(100));
    expect(r.fairway.count).toBe(1);
  });
});
