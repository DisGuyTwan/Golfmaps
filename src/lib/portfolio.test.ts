import { describe, expect, it } from "vitest";
import { capacityM2, MOWERS } from "./mowers";
import { fleetLine, planPortfolio } from "./portfolio";
import type { Site } from "./site";
import type { TerrainStats } from "./terrain";

const ACRE = 4046.86;
const flat: TerrainStats = { coverage: 1, slopeP50: 3, slopeP90: 6, over25: 0, over36: 0, over47: 0, over84: 0, canopy: 0.05, trees: 0 };
const steep: TerrainStats = { ...flat, over25: 0.6, over36: 0.5, over47: 0.4, over84: 0 };
const park = (acres: number, terrain: TerrainStats = flat): Site => ({
  kind: "lawn",
  areaM2: acres * ACRE,
  parts: 1,
  shape: null,
  terrain,
  steep: [], fairwayM2: 0,
  coverage: null,
  charger: null,
  chargerEstimated: true,
});

describe("a portfolio of sites", () => {
  it("adds up each site's own robots when they stay", () => {
    const p = planPortfolio([park(2), park(2), null, park(10)], 2, "stay");
    expect(p.lines.map((l) => l.index)).toEqual([0, 1, 3]);
    expect(p.acres).toBeCloseTo(14, 6);
    const total = p.fleet.reduce((n, [, units]) => n + units, 0);
    expect(total).toBe(p.lines.reduce((n, l) => n + (l.fit?.units ?? 0), 0));
    expect(fleetLine([["KR286", 2], ["KR238", 1]])).toBe("2 × KR286 + 1 × KR238");
  });

  it("sizes Voyagers on all the grass at once when they come and go", () => {
    const p = planPortfolio([park(5), park(6), park(8)], 2, "go");
    expect(p.fleet).toHaveLength(1);
    const [id, units] = p.fleet[0];
    const m = MOWERS.find((x) => x.id === id)!;
    expect(units).toBe(Math.ceil((19 * ACRE) / capacityM2(m, 2) - 1e-9));
  });

  it("leaves out a site no robot working that way can mow, and says which", () => {
    const p = planPortfolio([park(5), park(5, steep)], 2, "go");
    expect(p.unfit).toEqual([1]);
  });
});
