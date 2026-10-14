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
 * Acceptance values. The handoff's originals (gas 1,80 $/L, 30 kWh battery on
 * the 19-acre model) are kept below as a regression check on the formulas; the
 * defaults were refreshed on Oct. 14, 2026 (gas ≈ 2,00 $/L per the Régie de
 * l'énergie, KR804 battery 38 kWh per Kress), giving the "defaults" values. fr-CA groups thousands
 * with a (narrow) no-break space depending on the ICU version, so spaces are
 * normalized before comparing.
 */
const plain = (s: string) => s.replace(/[  ]/g, " ");
const run = (overrides: Partial<RoiInputs> = {}) => computeRoi({ ...ROI_DEFAULTS, ...overrides });

describe("handoff formulas: original inputs give the original values", () => {
  const r = run({ gasPrice: 1.8 });

  it("7-acre: 7 871 $ fuel, 32 185 $ / an, 61,06 $ vs 18,65 $, 1 an 4 mois, 268 %", () => {
    expect(plain(fmtMoney(r.ztFuel))).toBe("7 871 $");
    expect(plain(fmtMoney(r.annualProfit))).toBe("32 185 $");
    expect(plain(fmtMoney(r.savings))).toBe("160 923 $");
    expect(plain(fmtMoney2(r.ztCph))).toBe("61,06 $");
    expect(plain(fmtMoney2(r.voyCph))).toBe("18,65 $");
    expect(formatPayback(r.paybackMonths)).toBe("1 an 4 mois");
    expect(formatRoi(r.roiPct)).toBe("268 %");
  });
  it("19-acre with a 30 kWh battery: 25 213 $ / an, 25,80 $, 2 ans 1 mois, 140 %", () => {
    const r19 = run({ ...VOYAGER_PRESETS["19"], batteryKwh: 30, gasPrice: 1.8 });
    expect(plain(fmtMoney(r19.annualProfit))).toBe("25 213 $");
    expect(plain(fmtMoney(r19.savings))).toBe("126 065 $");
    expect(plain(fmtMoney2(r19.voyCph))).toBe("25,80 $");
    expect(formatPayback(r19.paybackMonths)).toBe("2 ans 1 mois");
    expect(formatRoi(r19.roiPct)).toBe("140 %");
  });
});

describe("acceptance: 7-acre model with defaults", () => {
  const r = run();

  it("mowing hours: 825 h zero-turn / 975 h Voyager", () => {
    expect(r.ztMowTotal).toBe(825);
    expect(r.voyMowTotal).toBe(975);
  });
  it("fuel per season: 8 745 $", () => {
    expect(plain(fmtMoney(r.ztFuel))).toBe("8 745 $");
  });
  it("profit recovered: 33 059 $ / an, 165 296 $ over the horizon", () => {
    expect(plain(fmtMoney(r.annualProfit))).toBe("33 059 $");
    expect(plain(fmtMoney(r.savings))).toBe("165 296 $");
  });
  it("cost per mowing hour: 62,12 $ zero-turn, 18,65 $ Voyager (70 % de moins)", () => {
    expect(plain(fmtMoney2(r.ztCph))).toBe("62,12 $");
    expect(plain(fmtMoney2(r.voyCph))).toBe("18,65 $");
    expect(Math.round((1 - r.voyCph / r.ztCph) * 100)).toBe(70);
  });
  it("payback 1 an 4 mois, ROI 275 %", () => {
    expect(formatPayback(r.paybackMonths)).toBe("1 an 4 mois");
    expect(formatRoi(r.roiPct)).toBe("275 %");
  });
});

describe("acceptance: 19-acre (60 po) model", () => {
  const r = run(VOYAGER_PRESETS["19"]);

  it("38 kWh battery: 706 $ of electricity per season", () => {
    expect(plain(fmtMoney(r.voyEnergy))).toBe("706 $");
  });
  it("profit recovered: 25 939 $ / an, 129 694 $", () => {
    expect(plain(fmtMoney(r.annualProfit))).toBe("25 939 $");
    expect(plain(fmtMoney(r.savings))).toBe("129 694 $");
  });
  it("Voyager cost per hour 25,95 $, payback 2 ans 1 mois, ROI 144 %", () => {
    expect(plain(fmtMoney2(r.voyCph))).toBe("25,95 $");
    expect(formatPayback(r.paybackMonths)).toBe("2 ans 1 mois");
    expect(formatRoi(r.roiPct)).toBe("144 %");
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

describe("English formatting", () => {
  const r = run();

  it("money uses a leading $ and comma grouping", () => {
    expect(fmtMoney(r.annualProfit, "en")).toBe("$33,059");
    expect(fmtMoney2(r.ztCph, "en")).toBe("$62.12");
    expect(fmtMoney(-1234, "en")).toBe("-$1,234");
  });
  it("payback and ROI read naturally", () => {
    expect(formatPayback(r.paybackMonths, "en")).toBe("1 year 4 months");
    expect(formatPayback(25, "en")).toBe("2 years 1 month");
    expect(formatPayback(24, "en")).toBe("2 years");
    expect(formatPayback(Infinity, "en")).toBe("n/a");
    expect(formatRoi(r.roiPct, "en")).toBe("275%");
    expect(formatRoi(null, "en")).toBe("n/a");
  });
});
