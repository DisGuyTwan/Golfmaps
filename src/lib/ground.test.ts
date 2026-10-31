import { describe, it, expect } from "vitest";
import type { MultiPolygon, Polygon, Position } from "geojson";
import { MIN_ZONE_M2, fieldGroundShares, groundOf, lawnGroundShares, robotRatio, surfaceFactor, trimM2 } from "./ground";
import { COVER, type TerrainGrid } from "./terrain";

// Lawns drawn in metres around a Boucherville lot.
const LAT = 45.58, LON = -73.45;
const KX = 111_320 * Math.cos((LAT * Math.PI) / 180);
const at = (x: number, y: number): Position => [LON + x / KX, LAT + y / 111_320];
const ring = (x: number, y: number, w: number, h: number): Position[] => [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h), at(x, y)];
const rect = (x: number, y: number, w: number, h: number): Polygon => ({ type: "Polygon", coordinates: [ring(x, y, w, h)] });
/** A 20 × 20 m yard with a strip `stripW` wide and 10 m long off its east side (a side yard along the house). */
const withStrip = (stripW: number): Polygon => ({
  type: "Polygon",
  coordinates: [[at(0, 0), at(20, 0), at(20, 5), at(30, 5), at(30, 5 + stripW), at(20, 5 + stripW), at(20, 20), at(0, 20), at(0, 0)]],
});
const PASSAGE = 0.9;

/** 1 m terrain cells over (−5, −5)-(35, 35) m, at `slope` % (and `steep` % inside the box given). */
function terrain(slope: number, steep?: { x: number; y: number; w: number; h: number; pct: number }): TerrainGrid {
  const w = 40, h = 40;
  const s = new Uint8Array(w * h).fill(slope);
  if (steep) for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const x = c - 5 + 0.5, y = 35 - r - 0.5;
    if (x >= steep.x && x < steep.x + steep.w && y >= steep.y && y < steep.y + steep.h) s[r * w + c] = steep.pct;
  }
  const [west, south] = at(-5, -5);
  const [east, north] = at(35, 35);
  return { bbox: { south, west, north, east }, width: w, height: h, cellM: 1, slope: s, cover: new Uint8Array(w * h).fill(COVER.ground) };
}

describe("what no robot reaches", () => {
  it("leaves an open yard to the robot, all but its corners", () => {
    const g = lawnGroundShares(rect(0, 0, 20, 20), PASSAGE, null);
    expect(g.trim.narrow).toBeLessThan(0.002);
    expect(g.trim.pocket).toBe(0);
    expect(g.trim.steep).toBe(0);
    expect(g.surface).toBe(1);
    expect(g.trimAreas).toHaveLength(0);
  });

  it("trims a side yard narrower than any robot gets through, not one it can drive", () => {
    const tight = groundOf(lawnGroundShares(withStrip(0.6), PASSAGE, null), 406);
    // The 0.6 × 10 m strip (6 m²), less the bit the robot sweeps from the yard's edge.
    expect(tight.trim.narrow).toBeGreaterThan(4.5);
    expect(tight.trim.narrow).toBeLessThan(6.5);
    expect(tight.trimAreas.length).toBeGreaterThanOrEqual(1);
    const wide = groundOf(lawnGroundShares(withStrip(1.2), PASSAGE, null), 412);
    expect(wide.trim.narrow).toBeLessThan(1);
  });

  it("leaves pockets too small for a zone to the trimmer", () => {
    const yards: MultiPolygon = { type: "MultiPolygon", coordinates: [[ring(0, 0, 20, 20)], [ring(25, 0, 2, 3)]] };
    const g = groundOf(lawnGroundShares(yards, PASSAGE, null), 406);
    expect(6).toBeLessThan(MIN_ZONE_M2);
    expect(g.trim.pocket).toBeCloseTo(6, 0);
  });

  it("takes off what's steeper than 40° and counts the slopes' real surface", () => {
    // A 4 × 10 m bank at 100 % (45°) in a yard on a 36 % (20°) slope.
    const g = groundOf(lawnGroundShares(rect(0, 0, 20, 20), PASSAGE, terrain(36, { x: 8, y: 5, w: 4, h: 10, pct: 100 })), 400);
    expect(g.trim.steep).toBeGreaterThan(35);
    expect(g.trim.steep).toBeLessThan(45);
    // 20° holds 1 / cos(20°) = 6.3 % more ground than its map area.
    expect(g.surface).toBeCloseTo(Math.sqrt(1 + 0.36 ** 2), 3);
    expect(g.robotM2).toBeCloseTo((400 - trimM2(g)) * g.surface, 3);
    expect(robotRatio(g)).toBeCloseTo(g.robotM2 / 400, 6);
  });
});

describe("slopes' surface", () => {
  it("is the map area on flat ground, more on a slope, and leaves out what's trimmed", () => {
    const yard = rect(0, 0, 20, 20);
    expect(surfaceFactor(terrain(0), [yard])).toBe(1);
    expect(surfaceFactor(terrain(58), [yard])).toBeCloseTo(Math.sqrt(1 + 0.58 ** 2), 3); // 30°: +15 %
    expect(surfaceFactor(terrain(0, { x: 0, y: 0, w: 20, h: 20, pct: 120 }), [yard])).toBe(1); // all too steep: nothing mowed
  });

  it("on a course: the steep share as trim, the surface over the turf", () => {
    const g = groundOf(fieldGroundShares([rect(0, 0, 20, 20)], terrain(36), 0.05), 4000);
    expect(g.trim.steep).toBeCloseTo(200, 6);
    expect(g.surface).toBeCloseTo(Math.sqrt(1 + 0.36 ** 2), 3);
    expect(g.robotM2).toBeCloseTo(3800 * g.surface, 3);
  });
});
