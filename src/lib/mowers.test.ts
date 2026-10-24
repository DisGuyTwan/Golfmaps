import { describe, expect, it } from "vitest";
import { baseline } from "./coverage";
import { MOWERS, capacityM2, fitMower, recommend } from "./mowers";
import type { ShapeStats, Site } from "./site";
import type { TerrainStats } from "./terrain";

const ACRE = 4046.86;
const flat: TerrainStats = { coverage: 1, slopeP50: 3, slopeP90: 6, over25: 0, over36: 0, over47: 0, over84: 0, canopy: 0.05 };
const shape = (areaM2: number, patch: Partial<ShapeStats> = {}): ShapeStats => ({
  areaM2,
  parts: 1,
  narrowestM: null,
  obstacles: 0,
  edgePer100: 18,
  zonesAt: () => 1,
  ...patch,
});
const noLayout = { coverage: null, charger: null, chargerEstimated: true };
const lawn = (areaM2: number, terrain: TerrainStats | null = flat, patch: Partial<ShapeStats> = {}): Site => ({
  kind: "lawn",
  areaM2,
  parts: 1,
  shape: shape(areaM2, patch),
  terrain,
  fairwayM2: 0,
  ...noLayout,
});

describe("Kress lineup data", () => {
  it("has the twelve models quoted, each with sane specs", () => {
    expect(MOWERS.map((m) => m.id).sort()).toEqual(
      ["KR161", "KR172", "KR173", "KR174", "KR238", "KR272", "KR276", "KR282", "KR284", "KR286", "KR800", "KR804"],
    );
    expect(new Set(MOWERS.map((m) => m.id)).size).toBe(MOWERS.length);
    for (const m of MOWERS) {
      expect(m.maxAreaM2).toBeGreaterThanOrEqual(m.areaM2);
      expect(m.maxSlopePct).toBeGreaterThanOrEqual(36);
      expect(m.passageM).toBeGreaterThan(m.cutWidthCm / 100);
    }
  });
  it("leaves slopes over 20° (36 %) to the EyePilot 4x4 (and 25° to the Voyager KR804)", () => {
    expect(MOWERS.filter((m) => m.maxSlopePct > 36).map((m) => m.id).sort()).toEqual(["KR282", "KR284", "KR286", "KR804"]);
    expect(MOWERS.filter((m) => m.maxSlopePct > 47).every((m) => m.fourWheel)).toBe(true);
  });
  it("sizes a Voyager by the week, like the ROI tab (5 days, once a week)", () => {
    expect(capacityM2(MOWERS.find((m) => m.id === "KR800")!) / ACRE).toBeCloseTo(35, 3);
  });
});

describe("residential lawns", () => {
  it("picks the smallest robot that covers an easy lawn", () => {
    const r = recommend(lawn(0.37 * ACRE));
    expect(r.best?.mower.id).toBe("KR172");
    expect(r.runnerUp).not.toBeNull();
  });

  it("moves up a size rather than run one at its limit", () => {
    const r = recommend(lawn(0.9 * ACRE, flat, { obstacles: 4 }));
    expect(r.best?.mower.id).toBe("KR174");
    expect(r.fits.find((f) => f.mower.id === "KR173")?.notes).toContain("atLimit");
  });

  it("picks an EyePilot camera robot under heavy tree cover", () => {
    const r = recommend(lawn(0.37 * ACRE, { ...flat, canopy: 0.45 }));
    expect(r.best?.mower.vision).toBe(true);
    expect(r.fits.find((f) => f.mower.id === "KR172")?.notes).toContain("treesNoVision");
  });

  it("only offers a 4×4 when part of the lawn is steeper than 20° (36 %)", () => {
    const r = recommend(lawn(0.4 * ACRE, { ...flat, over25: 0.2, over36: 0.06 }));
    expect(r.best?.mower.fourWheel).toBe(true);
    expect(r.fits.filter((f) => f.fits).every((f) => f.mower.maxSlopePct >= 84)).toBe(true);
  });

  it("prefers ZeroTrim when the lawn is mostly edges", () => {
    const r = recommend(lawn(0.3 * ACRE, flat, { edgePer100: 50, obstacles: 6 }));
    expect(r.best?.mower.zeroTrim).toBe(true);
  });

  it("moves up a size when the layout costs extra time", () => {
    const area = 0.45 * ACRE;
    const base = baseline(area, true, 0.5);
    // Same stripes as a square, but the charger far from the lawn and two areas apart.
    const far: Site = {
      ...lawn(area),
      coverage: { areaM2: area, stripes: base.stripes, reach: { avgM: base.reach.avgM * 6, farM: 150, tourM: 120 }, base },
    };
    const kr172 = fitMower(far, MOWERS.find((m) => m.id === "KR172")!);
    expect(kr172.work!.factor).toBeGreaterThan(1.12);
    expect(kr172.notes).toContain("atLimit");
    expect(recommend(far).best?.mower.id).toBe("KR173");
    expect(recommend(lawn(area)).best?.mower.id).toBe("KR172");
  });

  it("gives a steep, wooded 3-acre lot on a mountain two KR286s, never a commercial robot", () => {
    // Lot 2 420 141 (Saint-Bruno): 131,702 sq ft of lawn, 80 % under trees, 4 areas, 12 obstacles.
    const mountain: TerrainStats = { coverage: 1, slopeP50: 19, slopeP90: 42, over25: 0.35, over36: 0.16, over47: 0.06, over84: 0, canopy: 0.8 };
    const site: Site = { ...lawn(131702 / 10.7639, mountain, { parts: 4, obstacles: 12 }), parts: 4 };
    const r = recommend(site);
    expect(r.best?.mower.id).toBe("KR286");
    expect(r.best?.units).toBe(2);
    expect(r.fits.some((f) => f.mower.commercial)).toBe(false);
    expect(r.fits.filter((f) => f.fits).every((f) => f.mower.fourWheel)).toBe(true);
  });

  it("keeps a big lawn on home robots up to three of the biggest, then compares the commercial ones", () => {
    const estate = recommend(lawn(6 * ACRE));
    expect(estate.best?.mower.commercial).toBe(false);
    expect(estate.best!.units).toBeGreaterThan(1);
    expect(estate.fits.some((f) => f.mower.commercial)).toBe(false);
    expect(recommend(lawn(9 * ACRE)).fits.some((f) => f.mower.commercial)).toBe(true);
  });

  it("recommends nothing when even a 4×4 can't climb it", () => {
    const r = recommend(lawn(0.3 * ACRE, { ...flat, over25: 0.6, over36: 0.4, over47: 0.3, over84: 0.1 }));
    expect(r.best).toBeNull();
  });
});

describe("golf and sod", () => {
  it("sends fairways to the MasterSeries and the rough to a Voyager", () => {
    const site: Site = { kind: "golf", areaM2: 60 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 25 * ACRE, ...noLayout };
    const r = recommend(site);
    expect(r.best?.mower.id).toBe("KR238");
    expect(r.best?.units).toBe(2);
    expect(r.rough?.mower.line).toBe("voyager");
  });

  it("sizes the fairway robot on the fairways alone, however big the rough", () => {
    const site: Site = { kind: "golf", areaM2: 190 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 13 * ACRE, ...noLayout };
    const r = recommend(site);
    expect(r.best?.mower.minCutMm).toBeLessThanOrEqual(15);
    expect(r.best?.units).toBe(1);
    expect(r.rough?.mower.line).toBe("voyager");
  });

  it("gives even a short course's fairways to the MasterSeries", () => {
    const site: Site = { kind: "golf", areaM2: 12 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 5 * ACRE, ...noLayout };
    expect(recommend(site).best?.mower.id).toBe("KR238");
  });

  it("uses Voyagers alone for rough-only quotes", () => {
    const site: Site = { kind: "golf", areaM2: 40 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 0, ...noLayout };
    expect(recommend(site).best?.mower.line).toBe("voyager");
  });

  it("sizes a sod farm's Voyager to the acreage", () => {
    const sod = (acres: number): Site => ({ kind: "sod", areaM2: acres * ACRE, parts: 4, shape: null, terrain: flat, fairwayM2: 0, ...noLayout });
    expect(recommend(sod(20)).best?.mower.id).toBe("KR800");
    expect(recommend(sod(60)).best?.mower.id).toBe("KR804");
  });
});
