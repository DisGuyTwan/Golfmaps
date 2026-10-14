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
 * Acceptance tests copied from section 6 of the Voyager ROI handoff: with the
 * defaults, the page must show exactly these values. fr-CA groups thousands
 * with a (narrow) no-break space depending on the ICU version, so spaces are
 * normalized before comparing.
 */
const plain = (s: string) => s.replace(/[  ]/g, " ");
const run = (overrides: Partial<RoiInputs> = {}) => computeRoi({ ...ROI_DEFAULTS, ...overrides });

describe("acceptance: 7-acre model with defaults", () => {
  const r = run();

  it("mowing hours: 825 h zero-turn / 975 h Voyager", () => {
    expect(r.ztMowTotal).toBe(825);
    expect(r.voyMowTotal).toBe(975);
  });
  it("fuel per season: 7 871 $", () => {
    expect(plain(fmtMoney(r.ztFuel))).toBe("7 871 $");
  });
  it("profit recovered: 32 185 $ / an, 160 923 $ over the horizon", () => {
    expect(plain(fmtMoney(r.annualProfit))).toBe("32 185 $");
    expect(plain(fmtMoney(r.savings))).toBe("160 923 $");
  });
  it("cost per mowing hour: 61,06 $ zero-turn, 18,65 $ Voyager (69 % de moins)", () => {
    expect(plain(fmtMoney2(r.ztCph))).toBe("61,06 $");
    expect(plain(fmtMoney2(r.voyCph))).toBe("18,65 $");
    expect(Math.round((1 - r.voyCph / r.ztCph) * 100)).toBe(69);
  });
  it("payback 1 an 4 mois, ROI 268 %", () => {
    expect(formatPayback(r.paybackMonths)).toBe("1 an 4 mois");
    expect(formatRoi(r.roiPct)).toBe("268 %");
  });
});

describe("acceptance: 19-acre (60 po) model", () => {
  const r = run(VOYAGER_PRESETS["19"]);

  it("profit recovered: 25 213 $ / an, 126 065 $", () => {
    expect(plain(fmtMoney(r.annualProfit))).toBe("25 213 $");
    expect(plain(fmtMoney(r.savings))).toBe("126 065 $");
  });
  it("Voyager cost per hour 25,80 $, payback 2 ans 1 mois, ROI 140 %", () => {
    expect(plain(fmtMoney2(r.voyCph))).toBe("25,80 $");
    expect(formatPayback(r.paybackMonths)).toBe("2 ans 1 mois");
    expect(formatRoi(r.roiPct)).toBe("140 %");
  });
});

describe("acceptance: edge cases", () => {
  it("horizon of 1 or 10 years never produces NaN", () => {
    for (const years of [1, 10]) {
      const r = run({ years });
      for (const value of [r.savings, r.annualProfit, r.ztCph, r.voyCph, r.paybackMonths, r.roiPct ?? 0]) {
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
});

describe("equipment is counted once in payback and ROI", () => {
  it("net investment is Voyager minus the zero-turn avoided", () => {
    expect(run().netInvestment).toBe(60000);
  });
});
