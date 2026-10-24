import { describe, expect, it } from "vitest";
import type { MultiPolygon, Polygon, Position } from "geojson";
import { complexity, lawnShape, type Site } from "./site";
import type { TerrainStats } from "./terrain";

// Shapes built in metres around a Boucherville lot.
const LAT = 45.58, LON = -73.45;
const at = (x: number, y: number): Position => [LON + x / (111320 * Math.cos((LAT * Math.PI) / 180)), LAT + y / 111320];
const ring = (x: number, y: number, w: number, h: number): Position[] => [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h), at(x, y)];
const rect = (x: number, y: number, w: number, h: number): Polygon => ({ type: "Polygon", coordinates: [ring(x, y, w, h)] });

describe("lawn shape", () => {
  it("reads a plain rectangle as one area with no bottleneck", () => {
    const s = lawnShape(rect(0, 0, 20, 30));
    expect(s.areaM2).toBeCloseTo(600, -1);
    expect(s.parts).toBe(1);
    expect(s.narrowestM).toBeNull();
    expect(s.obstacles).toBe(0);
    expect(s.edgePer100).toBeCloseTo(16.7, 0);
    expect(s.zonesAt(1)).toBe(1);
  });

  it("counts front and back yards cut apart by the house", () => {
    const yards: MultiPolygon = { type: "MultiPolygon", coordinates: [[ring(0, 0, 20, 8)], [ring(0, 20, 20, 12)]] };
    expect(lawnShape(yards).parts).toBe(2);
  });

  it("finds a side yard narrower than a robot needs", () => {
    // Two 10 × 10 m yards joined by a 0.8 m wide, 4 m long side passage.
    const dumbbell: Polygon = {
      type: "Polygon",
      coordinates: [[at(0, 0), at(10, 0), at(10, 4.6), at(14, 4.6), at(14, 0), at(24, 0), at(24, 10), at(14, 10), at(14, 5.4), at(10, 5.4), at(10, 10), at(0, 10), at(0, 0)]],
    };
    const s = lawnShape(dumbbell);
    expect(s.parts).toBe(1);
    expect(s.narrowestM).toBeGreaterThanOrEqual(0.6);
    expect(s.narrowestM).toBeLessThanOrEqual(0.9);
    expect(s.zonesAt(0.5)).toBe(1);
    expect(s.zonesAt(1)).toBe(2);
  });

  it("counts a flower bed as an obstacle", () => {
    const withBed: Polygon = { type: "Polygon", coordinates: [ring(0, 0, 20, 20), ring(8, 8, 3, 3).reverse()] };
    expect(lawnShape(withBed).obstacles).toBe(1);
  });
});

const flat: TerrainStats = { coverage: 1, slopeP50: 3, slopeP90: 6, over25: 0, over40: 0, over84: 0, canopy: 0.05 };

describe("complexity", () => {
  const lawn = (shape: Polygon | MultiPolygon, terrain: TerrainStats | null): Site => {
    const s = lawnShape(shape);
    return { kind: "lawn", areaM2: s.areaM2, parts: s.parts, shape: s, terrain, fairwayM2: 0 };
  };

  it("calls an open, flat, sunny backyard simple", () => {
    const c = complexity(lawn(rect(0, 0, 25, 30), flat));
    expect(c.level).toBe("simple");
    expect(c.points).toBe(0);
  });

  it("calls a shaded, steep yard in two parts complex, worst reason first", () => {
    const yards: MultiPolygon = { type: "MultiPolygon", coordinates: [[ring(0, 0, 20, 8)], [ring(0, 20, 20, 12)]] };
    const c = complexity(lawn(yards, { ...flat, over25: 0.2, over40: 0.05, canopy: 0.5 }));
    expect(c.level).toBe("complex");
    expect(c.reasons[0].points).toBe(3);
    expect(c.reasons.map((r) => r.key)).toEqual(expect.arrayContaining(["steep", "canopy", "parts"]));
  });

  it("notes when there's no LiDAR instead of guessing", () => {
    const c = complexity(lawn(rect(0, 0, 25, 30), null));
    expect(c.reasons.map((r) => r.key)).toContain("noTerrain");
    expect(c.level).toBe("simple");
  });
});
