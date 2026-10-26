import { describe, expect, it } from "vitest";
import { baseline } from "./coverage";
import { MOWERS, approachOf, capacityM2, fitMower, mainFleet, recommend, recommendBoth } from "./mowers";
import type { ShapeStats, Site } from "./site";
import type { TerrainStats } from "./terrain";

const ACRE = 4046.86;
const flat: TerrainStats = { coverage: 1, slopeP50: 3, slopeP90: 6, over25: 0, over36: 0, over47: 0, over84: 0, canopy: 0.05, trees: 0 };
const shape = (areaM2: number, patch: Partial<ShapeStats> = {}): ShapeStats => ({
  areaM2,
  parts: 1,
  narrowestM: null,
  obstacles: 0,
  edgePer100: 18,
  zonesAt: () => 1,
  ...patch,
});
const noLayout = { steep: [], coverage: null, charger: null, chargerEstimated: true };
const lawn = (areaM2: number, terrain: TerrainStats | null = flat, patch: Partial<ShapeStats> = {}): Site => ({
  kind: "lawn",
  areaM2,
  parts: 1,
  shape: shape(areaM2, patch),
  terrain,
  fairwayM2: 0,
  ...noLayout,
});
const model = (id: string) => MOWERS.find((m) => m.id === id)!;

describe("Kress lineup data", () => {
  it("has the twelve models quoted, each with sane specs", () => {
    expect(MOWERS.map((m) => m.id).sort()).toEqual(
      ["KR161", "KR172", "KR173", "KR174", "KR238", "KR272", "KR276", "KR282", "KR284", "KR286", "KR800", "KR804"],
    );
    expect(new Set(MOWERS.map((m) => m.id)).size).toBe(MOWERS.length);
    for (const m of MOWERS) {
      expect(m.areaM2).toBeGreaterThan(0);
      expect(m.maxSlopePct).toBeGreaterThanOrEqual(36);
      expect(m.passageM).toBeGreaterThan(m.cutWidthCm / 100);
    }
  });
  it("leaves slopes over 20° (36 %) to the EyePilot 4x4 (and 25° to the Voyager KR804)", () => {
    expect(MOWERS.filter((m) => m.maxSlopePct > 36).map((m) => m.id).sort()).toEqual(["KR282", "KR284", "KR286", "KR804"]);
    expect(MOWERS.filter((m) => m.maxSlopePct > 47).every((m) => m.fourWheel)).toBe(true);
  });
  it("sizes a robot by how often it mows, a Voyager by its charges a week (5, like the ROI tab) shared among the mowings", () => {
    const kr286 = model("KR286");
    expect(capacityM2(kr286) / ACRE).toBeCloseTo(2.5, 3);
    expect(capacityM2(kr286, 1) / ACRE).toBeCloseTo(1.25, 3);
    expect(capacityM2(kr286, 3) / ACRE).toBeCloseTo(3.75, 3);
    // 7 acres a charge × 5 a week = 35 acres a week: 10 acres mowed every 2 days, 5 every day, 15 every 3 days.
    expect([2, 1, 3].map((days) => capacityM2(model("KR800"), days as 1 | 2 | 3) / ACRE)).toEqual([10, 5, 15].map((n) => expect.closeTo(n, 3)));
  });
  it("tells the robots that stay on a property from those that come and go with the crew", () => {
    expect(MOWERS.filter((m) => approachOf(m) === "stay").map((m) => m.id)).toEqual(["KR238"]);
    expect(MOWERS.filter((m) => approachOf(m) === "go").map((m) => m.id)).toEqual(["KR800", "KR804"]);
    expect(approachOf(model("KR286"))).toBeNull();
  });
});

describe("residential lawns", () => {
  it("picks the smallest robot that covers an easy lawn", () => {
    const r = recommend(lawn(0.37 * ACRE));
    expect(r.best?.mower.id).toBe("KR172");
    expect(r.best?.units).toBe(1);
    expect(r.runnerUp).not.toBeNull();
  });

  it("moves up a size rather than run one at its limit or double up", () => {
    const r = recommend(lawn(0.9 * ACRE, flat, { obstacles: 4 }));
    expect(r.best?.mower.id).toBe("KR174");
    expect(r.fits.find((f) => f.mower.id === "KR173")?.units).toBe(2);
    const near = recommend(lawn(0.47 * ACRE));
    expect(near.fits.find((f) => f.mower.id === "KR172")?.notes).toContain("atLimit");
    expect(near.best?.mower.id).toBe("KR173");
  });

  it("picks an EyePilot camera robot under heavy tree cover", () => {
    const r = recommend(lawn(0.37 * ACRE, { ...flat, canopy: 0.45 }));
    expect(r.best?.mower.vision).toBe(true);
    expect(r.fits.find((f) => f.mower.id === "KR172")?.notes).toContain("treesNoVision");
  });

  it("counts trees as obstacles: a bump-and-turn robot loses out", () => {
    const r = recommend(lawn(0.2 * ACRE, { ...flat, trees: 5 }));
    expect(r.fits.find((f) => f.mower.id === "KR161")?.notes).toContain("noAvoidance");
    expect(r.best?.mower.avoidance).toBe(true);
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
    const area = 0.42 * ACRE;
    const base = baseline(area, true, 0.5);
    // Same stripes as a square, but the charger far from the lawn and two areas apart.
    const far: Site = {
      ...lawn(area),
      coverage: { areaM2: area, stripes: base.stripes, reach: { avgM: base.reach.avgM * 6, farM: 150, tourM: 120 }, trees: 0, base },
    };
    const kr172 = fitMower(far, model("KR172"));
    expect(kr172.units > 1 || kr172.notes.includes("atLimit")).toBe(true);
    expect(recommend(far).best?.mower.id).toBe("KR173");
    expect(recommend(lawn(area)).best?.mower.id).toBe("KR172");
  });

  it("gives a steep, wooded 3-acre lot on a mountain two KR286s, never a commercial robot", () => {
    // Lot 2 420 141 (Saint-Bruno): 131,702 sq ft of lawn, 80 % under trees, 4 areas, 12 obstacles.
    const mountain: TerrainStats = { coverage: 1, slopeP50: 19, slopeP90: 42, over25: 0.35, over36: 0.16, over47: 0.06, over84: 0, canopy: 0.8, trees: 80 };
    const site: Site = { ...lawn(131702 / 10.7639, mountain, { parts: 4, obstacles: 12 }), parts: 4 };
    const r = recommend(site);
    expect(r.best?.mower.id).toBe("KR286");
    expect(r.best?.units).toBe(2);
    expect(r.fits.some((f) => f.mower.commercial)).toBe(false);
    expect(r.fits.filter((f) => f.fits).every((f) => f.mower.fourWheel)).toBe(true);
    // Mowing every 3 days, one keeps up; every day takes three.
    expect(recommend(site, 3).best?.units).toBe(1);
    expect(recommend(site, 1).best?.units).toBe(3);
  });

  it("keeps a big lawn on home robots up to three of the biggest, then compares the commercial ones", () => {
    const estate = recommend(lawn(6 * ACRE));
    expect(estate.best?.mower.commercial).toBe(false);
    expect(estate.best!.units).toBeGreaterThan(1);
    expect(estate.fits.some((f) => f.mower.commercial)).toBe(false);
    expect(recommend(lawn(9 * ACRE)).fits.some((f) => f.mower.commercial)).toBe(true);
  });

  it("sizes a fleet of 4x4s for a big property where 1 % of steep ground is acres", () => {
    // Like lot 3 042 992 at the foot of Mont Saint-Bruno: 100 acres, 1.25 % over 20°, 0.1 % over 40°.
    const hill: TerrainStats = { ...flat, slopeP90: 13, over25: 0.025, over36: 0.0125, over47: 0.0055, over84: 0.001, canopy: 0.8, trees: 27000 };
    const r = recommend(lawn(100 * ACRE, hill));
    expect(r.best?.mower.id).toBe("KR286");
    // 100 acres at 2.5 each, every unit under 90 % of its rating.
    expect(r.best?.units).toBe(45);
    expect(r.trimmed).toBeCloseTo(0.001, 6);
    expect(r.fits.find((f) => f.mower.id === "KR804")?.notes).toContain("tooSteep");
  });

  it("leaves a cliff no robot climbs to a trimmer and still sizes the 4x4", () => {
    const r = recommend(lawn(0.3 * ACRE, { ...flat, over25: 0.6, over36: 0.4, over47: 0.3, over84: 0.1 }));
    expect(r.best?.mower.fourWheel).toBe(true);
    expect(r.trimmed).toBeCloseTo(0.1, 6);
    // A few patches are just a trimmer's job, not worth a note.
    expect(recommend(lawn(0.3 * ACRE, { ...flat, over25: 0.2, over36: 0.1, over84: 0.01 })).trimmed).toBe(0);
  });
});

describe("golf and sod", () => {
  it("cut and go sends fairways to the MasterSeries and the rough to a Voyager", () => {
    const site: Site = { kind: "golf", areaM2: 60 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 25 * ACRE, ...noLayout };
    const r = recommend(site, 2, "go");
    expect(r.best?.mower.id).toBe("KR238");
    expect(r.best?.units).toBe(2);
    expect(r.rough?.mower.line).toBe("voyager");
    // Mowed every day, the fairways take twice the MasterSeries, and the rough more Voyagers.
    const daily = recommend(site, 1, "go");
    expect(daily.best?.units).toBe(3);
    expect(daily.rough!.units).toBeGreaterThan(r.rough!.units);
  });

  it("sizes the fairway robot on the fairways alone, however big the rough", () => {
    const site: Site = { kind: "golf", areaM2: 190 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 13 * ACRE, ...noLayout };
    const r = recommend(site, 2, "go");
    expect(r.best?.mower.minCutMm).toBeLessThanOrEqual(15);
    expect(r.best?.units).toBe(1);
    expect(r.rough?.mower.line).toBe("voyager");
  });

  it("gives even a short course's fairways to the MasterSeries", () => {
    const site: Site = { kind: "golf", areaM2: 12 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 5 * ACRE, ...noLayout };
    expect(recommend(site).best?.mower.id).toBe("KR238");
  });

  it("cut and go uses Voyagers alone for rough-only quotes, cut and stay KR238s", () => {
    const site: Site = { kind: "golf", areaM2: 40 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 0, ...noLayout };
    expect(recommend(site, 2, "go").best?.mower.line).toBe("voyager");
    expect(recommend(site, 2, "stay").best?.mower.id).toBe("KR238");
  });

  it("sizes a sod farm's Voyager to the acreage", () => {
    const sod = (acres: number): Site => ({ kind: "sod", areaM2: acres * ACRE, parts: 4, shape: null, terrain: flat, fairwayM2: 0, ...noLayout });
    expect(recommend(sod(8)).best?.mower.id).toBe("KR800");
    expect(recommend(sod(60)).best?.mower.id).toBe("KR804");
    expect(recommend(sod(60)).best?.units).toBe(3);
  });

  it("prices a course both ways, cut and stay suggested: KR238s for 166.7 acres, or Voyagers", () => {
    const site: Site = { kind: "golf", areaM2: 166.7 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 0, ...noLayout };
    const both = recommendBoth(site);
    expect(both.suggested).toBe("stay");
    // Like the ROI tab: 20 acres every 2 days each, filled to 90 %; KR804s at 19 acres × 5 charges a week.
    expect([both.stay.best?.mower.id, both.stay.best?.units]).toEqual(["KR238", 10]);
    expect([both.go.best?.mower.id, both.go.best?.units]).toEqual(["KR804", 7]);
    expect(both.go.runnerUp?.mower.id).toBe("KR800");
    expect(recommendBoth(site, 3).stay.best?.units).toBe(7);
  });

  it("with fairways, the KR238 keeps them either way and the approach decides the rest", () => {
    const site: Site = { kind: "golf", areaM2: 60 * ACRE, parts: 1, shape: null, terrain: flat, fairwayM2: 25 * ACRE, ...noLayout };
    const both = recommendBoth(site);
    expect([both.stay.best?.mower.id, both.go.best?.mower.id]).toEqual(["KR238", "KR238"]);
    expect(mainFleet(both.stay)?.mower.id).toBe("KR238");
    expect(mainFleet(both.go)?.mower.line).toBe("voyager");
  });

  it("suggests cut and go where the KR238 can't climb it", () => {
    // Over 36 % is past the KR238, not the KR804 (47 %).
    const site: Site = { kind: "golf", areaM2: 40 * ACRE, parts: 1, shape: null, terrain: { ...flat, over25: 0.2, over36: 0.1 }, fairwayM2: 0, ...noLayout };
    const both = recommendBoth(site);
    expect(both.stay.best).toBeNull();
    expect(both.suggested).toBe("go");
    expect(both.go.best?.mower.id).toBe("KR804");
  });

  it("finds nothing for a steep course: its robots stop at 25°", () => {
    const site: Site = { kind: "golf", areaM2: 40 * ACRE, parts: 1, shape: null, terrain: { ...flat, over36: 0.3, over47: 0.2 }, fairwayM2: 0, ...noLayout };
    expect(recommend(site).best).toBeNull();
  });
});

describe("a commercial or municipal site", () => {
  const grounds = (acres: number): Site => ({ ...lawn(acres * ACRE), kind: "site" });

  it("compares every robot, or those that work the chosen way", () => {
    const both = recommendBoth(grounds(8), 2);
    // Cut and stay: robots that live on the site (a home fleet or KR238s); cut and go: the Voyagers.
    expect(mainFleet(both.stay)?.mower.line).not.toBe("voyager");
    expect(mainFleet(both.go)?.mower.line).toBe("voyager");
    expect(recommend(grounds(8), 2).fits.map((f) => f.mower.id)).toHaveLength(MOWERS.length);
  });
});
