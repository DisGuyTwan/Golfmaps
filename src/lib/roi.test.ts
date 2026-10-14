import { describe, it, expect } from "vitest";
import {
  ROI_DEFAULTS,
  VOYAGER_PRESETS,
  computeRoi,
  fmtMoney,
  fmtMoney2,
  formatPayback,
  formatRoi,
  type RoiInputs,
} from "./roi";

/*
 * fr-CA groups thousands with a (narrow) no-break space depending on the ICU
 * version, so spaces are normalized before comparing.
 */
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
const run = (overrides: Partial<RoiInputs> = {}) => computeRoi({ ...ROI_DEFAULTS, ...overrides });

/*
 * The dealer handoff compared one employee with one Voyager. Sized so the job
 * is exactly one crew member and one Voyager (82,5 acres a week, Voyager rated
 * 16,5 acres a day), with no supervision and the handoff's 1,80 $/L gas, the
 * model must reproduce the handoff's acceptance values.
 */
describe("handoff regression: one employee vs one Voyager", () => {
  const handoff = { area: 82.5, voyAcresPerDay: 16.5, supHrs: 0, gasPrice: 1.8 };
  const r = run(handoff);

  it("sizes to exactly one crew member and one Voyager, 825 h of mowing", () => {
    expect(r.crewFte).toBeCloseTo(1, 9);
    expect([r.ztMachines, r.units]).toEqual([1, 1]);
    expect(r.ztMowTotal).toBeCloseTo(825, 9);
    expect(r.charges).toBeCloseTo(150, 9);
  });
  it("7 871 $ fuel, 32 185 $ / an, 160 923 $, 61,06 $ per mowing hour", () => {
    expect(plain(fmtMoney(r.ztFuel))).toBe("7 871 $");
    expect(plain(fmtMoney(r.annualProfit))).toBe("32 185 $");
    expect(plain(fmtMoney(r.savings))).toBe("160 923 $");
    expect(plain(fmtMoney2(r.ztAnnual / r.ztMowTotal))).toBe("61,06 $");
  });
  it("payback 1 an 4 mois, ROI 268 %", () => {
    expect(formatPayback(r.paybackMonths)).toBe("1 an 4 mois");
    expect(formatRoi(r.roiPct)).toBe("268 %");
  });
  it("19-acre model with a 30 kWh battery: 25 213 $ / an, 2 ans 1 mois, 140 %", () => {
    const r19 = run({ ...VOYAGER_PRESETS["19"], ...handoff, batteryKwh: 30 });
    expect(plain(fmtMoney(r19.annualProfit))).toBe("25 213 $");
    expect(plain(fmtMoney(r19.savings))).toBe("126 065 $");
    expect(formatPayback(r19.paybackMonths)).toBe("2 ans 1 mois");
    expect(formatRoi(r19.roiPct)).toBe("140 %");
  });
});

describe("defaults: 35 acres once a week, the same job on both sides", () => {
  const r = run();

  it("needs 0,42 of a zero-turn operator but one whole machine, and one Voyager", () => {
    expect(r.weeklyAcres).toBe(35);
    expect(r.crewFte).toBeCloseTo(35 / 3 / 27.5, 9);
    expect([r.ztMachines, r.units]).toEqual([1, 1]);
  });
  it("labour is only the share of the shift the mowing takes", () => {
    expect(plain(fmtMoney(r.annualLabor))).toBe("14 636 $");
    expect(plain(fmtMoney(r.ztFuel))).toBe("3 710 $");
  });
  it("Voyager pays for 0,5 h/day of supervision: 75 h, 2 156 $", () => {
    expect(r.supHoursPerSeason).toBe(75);
    expect(plain(fmtMoney(r.supLabor))).toBe("2 156 $");
  });
  it("6 004 $ / an, 25,09 $ vs 19,37 $ per acre, payback 3 ans 4 mois, ROI 50 %", () => {
    expect(plain(fmtMoney(r.annualProfit))).toBe("6 004 $");
    expect(plain(fmtMoney2(r.ztCpa))).toBe("25,09 $");
    expect(plain(fmtMoney2(r.voyCpa))).toBe("19,37 $");
    expect(formatPayback(r.paybackMonths)).toBe("3 ans 4 mois");
    expect(formatRoi(r.roiPct)).toBe("50 %");
  });
});

describe("sizing a bigger job", () => {
  const r = run({ area: 100, mowsPerWeek: 2 });

  it("200 acres a week: 2,42 operators on 3 zero-turns vs 6 Voyagers", () => {
    expect(r.crewFte).toBeCloseTo(2.4242, 4);
    expect([r.ztMachines, r.units]).toEqual([3, 6]);
  });
  it("counts maintenance and supervision per machine", () => {
    expect(r.ztMaintTotal).toBe(9000);
    expect(r.voyMaintTotal).toBe(6000);
    expect(r.supHoursPerSeason).toBe(6 * 0.5 * 5 * 30);
  });
  it("one 19-acre Voyager mowing 7 days covers 133 acres a week", () => {
    expect(run({ ...VOYAGER_PRESETS["19"], area: 133, voyDaysPerWeek: 7 }).units).toBe(1);
    expect(run({ ...VOYAGER_PRESETS["19"], area: 134, voyDaysPerWeek: 7 }).units).toBe(2);
  });
});

describe("existing zero-turns and incentives", () => {
  it("already owned: only the resale value offsets the Voyager", () => {
    const replace = run();
    const own = run({ ztStatus: "own" });
    expect(replace.netInvestment).toBe(85000 - 25000);
    expect(own.netInvestment).toBe(85000 - 8000);
    expect(own.paybackMonths).toBeGreaterThan(replace.paybackMonths);
  });
  it("grants and credits reduce the Voyager investment, never below zero", () => {
    expect(run({ incentives: 25500 }).netInvestment).toBe(85000 - 25500 - 25000);
    expect(run({ incentives: 1e6 }).voy.equip).toBe(0);
  });
});

describe("acceptance: edge cases", () => {
  it("horizon of 1 or 10 years never produces NaN", () => {
    for (const years of [1, 10]) {
      const r = run({ years });
      for (const value of [r.savings, r.annualProfit, r.ztCpa, r.voyCpa, r.paybackMonths, r.roiPct ?? 0]) {
        expect(Number.isNaN(value)).toBe(false);
      }
    }
  });
  it("Voyager cheaper than the zero-turn: payback 0 mois, ROI n/d", () => {
    const r = run({ voyPrice: 20000 });
    expect(formatPayback(r.paybackMonths)).toBe("0 mois");
    expect(formatRoi(r.roiPct)).toBe("n/d");
  });
  it("no operating savings: payback n/d", () => {
    const r = run({ wage: 0, ztMaint: 0, gasPrice: 0 });
    expect(formatPayback(r.paybackMonths)).toBe("n/d");
  });
  it("an empty horizon field while typing doesn't divide by zero", () => {
    expect(Number.isFinite(run({ years: 0 }).annualProfit)).toBe(true);
  });
  it("no acreage: nothing to size, no NaN", () => {
    const r = run({ area: 0 });
    expect([r.units, r.ztMachines, r.ztCpa, r.voyCpa]).toEqual([0, 0, 0, 0]);
    for (const value of [r.savings, r.annualProfit, r.paybackMonths]) expect(Number.isNaN(value)).toBe(false);
  });
  it("empty productivity fields while typing don't divide by zero", () => {
    const r = run({ ztAcresPerHour: 0, voyAcresPerDay: 0, ztMowHrs: 0 });
    expect([r.crewFte, r.units, r.charges]).toEqual([0, 0, 0]);
  });
});

describe("equipment is counted once in payback and ROI", () => {
  it("net investment is Voyager minus the zero-turn avoided", () => {
    expect(run().netInvestment).toBe(60000);
  });
});

describe("English formatting", () => {
  const r = run();

  it("money uses a leading $ and comma grouping", () => {
    expect(fmtMoney(r.annualProfit, "en")).toBe("$6,004");
    expect(fmtMoney2(r.ztCpa, "en")).toBe("$25.09");
    expect(fmtMoney(-1234, "en")).toBe("-$1,234");
  });
  it("payback and ROI read naturally", () => {
    expect(formatPayback(r.paybackMonths, "en")).toBe("3 years 4 months");
    expect(formatPayback(25, "en")).toBe("2 years 1 month");
    expect(formatPayback(24, "en")).toBe("2 years");
    expect(formatPayback(Infinity, "en")).toBe("n/a");
    expect(formatRoi(r.roiPct, "en")).toBe("50%");
    expect(formatRoi(null, "en")).toBe("n/a");
  });
});
