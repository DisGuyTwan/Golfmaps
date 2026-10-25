import { describe, expect, it } from "vitest";
import { matchups } from "./competitors";
import type { Site } from "./site";
import type { TerrainStats } from "./terrain";

const ACRE = 4046.86;
const terrain: TerrainStats = { coverage: 1, slopeP50: 8, slopeP90: 30, over25: 0.1, over36: 0.04, over47: 0.01, over84: 0, canopy: 0.1, trees: 0 };
const site = (kind: Site["kind"], acres: number, fairwayAcres = 0): Site => ({
  kind,
  areaM2: acres * ACRE,
  parts: 1,
  shape: null,
  terrain,
  fairwayM2: fairwayAcres * ACRE,
  coverage: null,
  charger: null,
  chargerEstimated: true,
});

describe("against the competition", () => {
  it("puts a course against the commercial robots, with the slopes and fairways they can't do", () => {
    const rows = matchups(site("golf", 60, 25));
    expect(rows.map((m) => m.competitor.id)).toEqual(["ceora546", "echo2050", "terranox240"]);
    const ceora = rows[0];
    // 60 ac at about 11.9 ac each.
    expect(ceora.units).toBe(6);
    // A 20 % limit reads the 25 % band: at least 10 % of the course is steeper.
    expect(ceora.steepShare).toBe(0.1);
    expect(ceora.noFairway).toBe(true);
    expect(rows[2].steepShare).toBe(0);
  });

  it("puts a house lawn against the home robots, and a commercial site against both", () => {
    expect(matchups(site("lawn", 0.5)).every((m) => m.competitor.segment === "residential")).toBe(true);
    expect(new Set(matchups(site("site", 5)).map((m) => m.competitor.segment))).toEqual(new Set(["residential", "commercial"]));
    expect(matchups({ ...site("golf", 60), terrain: null })[0].steepShare).toBeNull();
  });
});
