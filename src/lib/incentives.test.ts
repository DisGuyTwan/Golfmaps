import { describe, it, expect } from "vitest";
import {
  STRINGS,
  computeIncentives,
  summaryText,
  type IncentiveInputs,
} from "./incentives";

/*
 * The handoff workbook's "Stacking calc" tab is the reference: 3 robots at
 * $8,000 (= $24,000) and a 12.2% tax rate recover 38.5% ($9,250) for an
 * incorporated buyer with Class 56 + the Clean Tech ITC, 12.2% ($2,928)
 * unincorporated, and 3.7% ($878) on the Class 8 fallback.
 */

const base: IncentiveInputs = {
  prov: "QC",
  who: "golf",
  farm: "orchard",
  mapaq: "yes",
  bonus: false,
  struct: "corp",
  city: "stbruno",
  tax: 0.122,
  buyRobot: true,
  buyTools: false,
  robotAmt: 24000,
  toolAmt: 0,
  under500: true,
};
const run = (overrides: Partial<IncentiveInputs> = {}, lang: "fr" | "en" = "en") =>
  computeIncentives({ ...base, ...overrides }, lang);

describe("computeIncentives: workbook stacking scenarios", () => {
  it("incorporated: ITC + Class 56 recovers 38.5% high, Class 8 fallback 3.7% low", () => {
    const r = run();
    expect(r.high).toBeCloseTo(9249.6, 1);
    expect(r.high / r.P).toBeCloseTo(0.385, 3);
    expect(r.low).toBeCloseTo(878.4, 1);
    expect(r.low / r.P).toBeCloseTo(0.0366, 3);
  });

  it("unincorporated: no ITC, Class 56 only recovers 12.2%", () => {
    const r = run({ struct: "soleprop" });
    expect(r.high).toBeCloseTo(2928, 1);
    expect(r.items.some((i) => i.t === STRINGS.en.i_itc)).toBe(false);
    expect(r.cards.some((c) => c.t === STRINGS.en.c_noItc)).toBe(true);
  });
});

describe("computeIncentives: grants reduce the tax base", () => {
  it("Prime-Vert (65% with bonus) comes off before the ITC and CCA", () => {
    const r = run({ who: "farm", farm: "orchard", bonus: true });
    const pv = 0.65 * 24000; // 15,600 (under the $40,000 cap)
    const itc = 0.3 * (24000 - pv);
    const cca = (24000 - pv - itc) * 0.122;
    expect(r.high).toBeCloseTo(pv + itc + cca, 2);
    expect(r.low).toBeCloseTo(0.3 * 24000 * 0.122, 2); // grants and ITC need approval
  });

  it("caps Prime-Vert at $40,000 per farm", () => {
    const r = run({ who: "farm", robotAmt: 200000, struct: "exempt" });
    expect(r.items.find((i) => i.t === STRINGS.en.i_pv)?.high).toBe(40000);
  });

  it("skips Prime-Vert for unregistered farms and weak-fit farm types", () => {
    const unregistered = run({ who: "farm", mapaq: "no" });
    expect(unregistered.items.some((i) => i.t === STRINGS.en.i_pv)).toBe(false);
    expect(unregistered.cards.some((c) => c.t === STRINGS.en.c_mapaqReg)).toBe(true);

    const vegetables = run({ who: "farm", farm: "vegetables" });
    expect(vegetables.items.some((i) => i.t === STRINGS.en.i_pv)).toBe(false);
    expect(vegetables.cards.some((c) => c.t === STRINGS.en.c_farmFit)).toBe(true);
  });
});

describe("computeIncentives: profiles", () => {
  it("municipalities get the GMF pilot and no tax lines", () => {
    const r = run({ who: "municipality" });
    expect(r.items).toHaveLength(1);
    expect(r.high).toBe(12000);
    expect(r.low).toBe(0);
  });

  it("battery tools under $500 are a 100% Class 12 write-off, in force", () => {
    const r = run({ buyRobot: false, buyTools: true, toolAmt: 3000 });
    expect(r.low).toBeCloseTo(3000 * 0.122, 2);
    expect(r.high).toBeCloseTo(r.low, 2);
    const over = run({ buyRobot: false, buyTools: true, toolAmt: 3000, under500: false });
    expect(over.high).toBeCloseTo(0.3 * 3000 * 0.122, 2);
  });

  it("Saint-Bruno homeowners: $100 counts as in force only on tools", () => {
    const tools = run({ who: "homeowner", buyRobot: false, buyTools: true, toolAmt: 300 });
    expect([tools.low, tools.high]).toEqual([100, 100]);
    const robot = run({ who: "homeowner" });
    expect([robot.low, robot.high]).toEqual([0, 100]);
  });

  it("Ontario homeowners get no rebate and an explanation", () => {
    const r = run({ who: "homeowner", prov: "ON" });
    expect(r.high).toBe(0);
    expect(r.cards.some((c) => c.t === STRINGS.en.c_onHome)).toBe(true);
  });

  it("returns nothing to sum when nothing is being bought", () => {
    const r = run({ buyRobot: false });
    expect([r.P, r.low, r.high, r.items.length]).toEqual([0, 0, 0, 0]);
  });
});

describe("summaryText", () => {
  it("lists profile, purchase, range and links in the chosen language", () => {
    const s = { ...base };
    const fr = summaryText(s, computeIncentives(s, "fr"), "fr");
    expect(fr).toContain("Terrain de golf, Québec, Société par actions (inc.)");
    expect(fr).toContain("[À confirmer]");
    expect(fr.endsWith("Recherche au 9 octobre 2026.")).toBe(true);
    expect(fr).not.toContain("—");
  });
});
