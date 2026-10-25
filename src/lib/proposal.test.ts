import { describe, expect, it } from "vitest";
import { MOWERS, recommendBoth } from "./mowers";
import { priceOption, proposalOptions, stillValid, validUntil, type Financing } from "./proposal";
import type { Site } from "./site";
import type { TerrainStats } from "./terrain";

const ACRE = 4046.86;
const flat: TerrainStats = { coverage: 1, slopeP50: 3, slopeP90: 6, over25: 0, over36: 0, over47: 0, over84: 0, canopy: 0.05, trees: 0 };
const course = (acres: number, fairways = 0): Site => ({
  kind: "golf",
  areaM2: acres * ACRE,
  parts: 1,
  shape: null,
  terrain: flat,
  fairwayM2: fairways * ACRE,
  coverage: null,
  charger: null,
  chargerEstimated: true,
});
const noFinancing: Financing = { ratePct: 0, months: 12, downPct: 0 };

describe("a proposal's options", () => {
  const both = recommendBoth(course(60), 2);
  const prices = Object.fromEntries(MOWERS.map((m) => [m.id, 10_000]));

  it("offers the fleet recommended, then the other way of working, each different", () => {
    const options = proposalOptions(both.stay, "stay", both.go, 3000, prices);
    expect(options.map((o) => [o.id, o.kind, o.approach])).toEqual([
      ["a", "recommended", "stay"],
      ["b", "otherApproach", "go"],
    ]);
    expect(options[0].lines[0].model).toBe("KR238");
    expect(options[0].installEstimate.total).toBeGreaterThan(0);
    expect(options[0].installPrice).toBeNull();
  });

  it("puts a course with fairways' two robots in one option", () => {
    const r = recommendBoth(course(60, 20), 2);
    const [a] = proposalOptions(r.go, "go", null, 3000, prices);
    expect(a.lines.map((l) => l.model)).toEqual(["KR238", expect.stringMatching(/^KR80[04]$/)]);
  });

  it("prices an option: the rep's installation over the estimate, credits off, the monthly payment", () => {
    const [a] = proposalOptions(both.stay, "stay", null, 3000, { KR238: 50_000 });
    const units = a.lines[0].units;
    const p = priceOption({ ...a, installPrice: 4000 }, noFinancing, 10_000, null);
    expect(p.equipment).toBe(50_000 * units);
    expect(p.net).toBe(50_000 * units + 4000 - 10_000);
    expect(p.monthly).toBeCloseTo(p.net! / 12, 6);
    expect(priceOption(a, noFinancing, 0, null).install).toBeCloseTo(a.installEstimate.total, 6);
  });

  it("can't total an option while a unit price is missing, and says nothing it can't know", () => {
    const [a] = proposalOptions(both.stay, "stay", null, 3000, {});
    const p = priceOption(a, noFinancing, 0, { acres: 60, mowEvery: 2, window: null, layoutPct: 0 });
    expect(p).toMatchObject({ equipment: null, net: null, monthly: null, roi: null });
  });

  it("compares KR238s with the crew like the ROI tab", () => {
    const [a] = proposalOptions(both.stay, "stay", null, 3000, { KR238: 55_000 });
    const p = priceOption(a, noFinancing, 0, { acres: 60, mowEvery: 2, window: null, layoutPct: 0 });
    expect(p.roi).not.toBeNull();
    expect(p.roi!.crewMonthly).toBeGreaterThan(p.roi!.robotsMonthly);
  });

  it("holds its prices for 30 days", () => {
    const until = validUntil(new Date("2026-10-25T12:00:00Z"));
    expect(until).toBe("2026-11-24");
    expect(stillValid({ validUntil: until }, "2026-11-24")).toBe(true);
    expect(stillValid({ validUntil: until }, "2026-11-25")).toBe(false);
  });
});
