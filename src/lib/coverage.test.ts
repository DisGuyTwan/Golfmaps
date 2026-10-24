import { describe, expect, it } from "vitest";
import { baseline, overhead, reachOnFields, reachOnLot, share, stripes, type LocalPolygon, type Pace } from "./coverage";

const rect = (x: number, y: number, w: number, h: number): LocalPolygon => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
const lawnPace: Pace = { stripeM: 0.19, speedMS: 0.35, turnS: 8, runtimeMin: 90 };

/** An S: three 30 × 6 m bars joined at alternate ends by 6 × 6 m corners. */
const S: LocalPolygon = [[
  [0, 0], [30, 0], [30, 18], [6, 18], [6, 24], [30, 24], [30, 30], [0, 30], [0, 12], [24, 12], [24, 6], [0, 6], [0, 0],
]];

describe("stripes", () => {
  it("runs along the long side of a rectangle", () => {
    const s = stripes([rect(0, 0, 40, 10)], 0.5);
    expect([0, 180]).toContain(s.angleDeg % 180 === 0 ? 0 : s.angleDeg);
    expect(s.runs1).toBeCloseTo(10, 0);
    expect(s.hops1).toBe(0);
  });

  it("finds an S shape broken into more, shorter runs than a square of its size", () => {
    const area = 30 * 30 - 24 * 6 * 2;
    const s = stripes([S], 0.5);
    const square = stripes([rect(0, 0, Math.sqrt(area), Math.sqrt(area))], 0.5);
    expect(s.runs1).toBeGreaterThan(square.runs1);
  });
});

describe("reach", () => {
  it("drives around the house, not through it", () => {
    // Front and back yards on a 20 × 40 m lot, the house across the middle but a 2 m side passage.
    const lot = [rect(0, 0, 20, 40)];
    const front = rect(0, 0, 20, 15);
    const back = rect(0, 25, 20, 15);
    const house = rect(2, 15, 18, 10);
    const r = reachOnLot([front, back], lot, [house], [10, 14.5]);
    // Farthest back-yard corner: around the house through the 2 m passage on the left.
    expect(r.farM).toBeGreaterThan(Math.hypot(10, 25.5));
    expect(r.tourM).toBeGreaterThan(10);
    expect(r.tourM).toBeLessThan(20);
  });

  it("puts a charger at the far end of a long lawn further from the work", () => {
    const lawn = [rect(0, 0, 60, 10)];
    const near = reachOnLot(lawn, lawn, [], [30, 0]);
    const far = reachOnLot(lawn, lawn, [], [0, 0]);
    expect(far.avgM).toBeGreaterThan(near.avgM);
  });

  it("tours separate fields nearest first", () => {
    const r = reachOnFields([rect(0, 0, 100, 100), rect(300, 0, 100, 100)], [50, 50]);
    expect(r.tourM).toBeGreaterThan(0);
    expect(r.farM).toBeGreaterThan(300);
  });
});

describe("overhead", () => {
  const coverage = (parts: LocalPolygon[], charger: [number, number], trees = 0) => {
    const areaM2 = parts.reduce((s, p) => s + Math.abs(p[0].reduce((a, q, i, r) => a + (i ? (r[i - 1][0] + q[0]) * (r[i - 1][1] - q[1]) : 0), 0)) / 2, 0);
    return { areaM2, stripes: stripes(parts, 0.5), reach: reachOnLot(parts, parts, [], charger), trees, base: baseline(areaM2, true, 0.5) };
  };

  it("rates a square with the charger at its edge as 1", () => {
    const o = overhead(coverage([rect(0, 0, 40, 40)], [20, 0]), lawnPace);
    expect(o.factor).toBeCloseTo(1, 2);
    expect(o.hours).toBeGreaterThan(5);
  });

  it("costs more for an S shape and a far charger", () => {
    const s = overhead(coverage([S], [0, 3]), lawnPace);
    expect(s.shape).toBeGreaterThan(0.05);
    expect(s.factor).toBeGreaterThan(1);
    const strip = overhead(coverage([rect(0, 0, 100, 6)], [0, 0]), lawnPace);
    expect(strip.travel).toBeGreaterThan(0.02);
  });

  it("adds time for every tree to mow around", () => {
    const open = overhead(coverage([rect(0, 0, 40, 40)], [20, 0]), lawnPace);
    const treed = overhead(coverage([rect(0, 0, 40, 40)], [20, 0], 20), lawnPace);
    expect(open.trees).toBe(0);
    // About a minute per tree for a 22 cm robot: 20 trees on 1,600 m² is a few per cent.
    expect(treed.trees).toBeGreaterThan(0.03);
    expect(treed.trees).toBeLessThan(0.1);
    expect(treed.hours - open.hours).toBeCloseTo((treed.trees * open.hours) / open.factor, 1);
  });

  it("splits a big property into zones: shorter drives per unit, same mowing", () => {
    const big = coverage([rect(0, 0, 200, 200)], [100, 0], 400);
    const one = overhead(big, lawnPace);
    const four = share(big, 4);
    expect(four.areaM2).toBeCloseTo(big.areaM2 / 4, 6);
    expect(four.trees).toBe(100);
    expect(four.reach.avgM).toBeCloseTo(big.reach.avgM / 2, 6);
    const each = overhead(four, lawnPace);
    expect(each.hours).toBeLessThan(one.hours / 4 + 0.5);
    expect(share(big, 1)).toBe(big);
  });
});
