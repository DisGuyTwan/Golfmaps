/**
 * Voyager ROI calculator (Quebec): one employee on a 60" zero-turn versus one
 * Kress Voyager autonomous mower, over a chosen horizon.
 *
 * Ported unchanged from the finished calculator handoff
 * (Calculateur_ROI_Voyager_Quebec.html). Formulas, defaults and the
 * Hydro-Québec rate were researched and checked: do not change them here
 * without updating the acceptance tests in roi.test.ts.
 */

/** Hydro-Québec Tarif G, first block, in effect April 1, 2026 ($/kWh). Update each April 1. */
export const HQ_RATE = 0.12388;
export const HOURS_PER_WORKDAY = 8;

export type VoyagerModel = "7" | "19" | "custom";

/** Presets applied when the model changes; "custom" keeps the current values. */
export const VOYAGER_PRESETS: Record<"7" | "19", { voyPrice: number; voyMaint: number; batteryKwh: number }> = {
  "7": { voyPrice: 85000, voyMaint: 1000, batteryKwh: 10 },
  // KR804 (60 in.): 38 kWh per Kress's spec sheet (Sept. 2026 launch).
  "19": { voyPrice: 115000, voyMaint: 1600, batteryKwh: 38 },
};

export interface RoiInputs {
  voyPrice: number;
  batteryKwh: number;
  /** Voyager maintenance per year ($). */
  voyMaint: number;
  /** Hourly wage ($/h). */
  wage: number;
  /** Payroll burden in percent (25 = 25%). */
  burden: number;
  weeks: number;
  /** Paid hours per week. */
  hoursPerWeek: number;
  /** Mowing hours per 8 h workday, zero-turn and Voyager. */
  ztMowHrs: number;
  voyMowHrs: number;
  ztPrice: number;
  /** Zero-turn fuel use (L/h) and gas price ($/L). */
  ztLph: number;
  gasPrice: number;
  /** Zero-turn maintenance per season ($). */
  ztMaint: number;
  /** Horizon in years. */
  years: number;
}

export const ROI_DEFAULTS: RoiInputs = {
  ...VOYAGER_PRESETS["7"],
  wage: 23,
  burden: 25,
  weeks: 30,
  hoursPerWeek: 40,
  ztMowHrs: 5.5,
  voyMowHrs: 6.5,
  ztPrice: 25000,
  ztLph: 5.3,
  /** Régie de l'énergie, regular gas, early October 2026 (≈ 199 to 202 ¢/L). */
  gasPrice: 2.0,
  ztMaint: 3000,
  years: 5,
};

export interface CostColumn {
  equip: number;
  energy: number;
  maint: number;
  labor: number;
  total: number;
}

export interface RoiResult {
  totalHours: number;
  workDays: number;
  ztMowTotal: number;
  voyMowTotal: number;
  ztLitres: number;
  /** Zero-turn fuel per season ($). */
  ztFuel: number;
  kwhPerSeason: number;
  /** Voyager electricity per season ($): one full charge per 8 h workday. */
  voyEnergy: number;
  /** Labour per year, charged on ALL paid hours, not just mowing hours. */
  annualLabor: number;
  /** Totals over the horizon. */
  zt: CostColumn;
  voy: CostColumn;
  savings: number;
  /** Profit recovered per year (savings ÷ years). */
  annualProfit: number;
  ztDep: number;
  ztAnnual: number;
  voyDep: number;
  voyAnnual: number;
  /** Cost per mowing hour (0 when there are no mowing hours). */
  ztCph: number;
  voyCph: number;
  /** Equipment cost counted once: Voyager price minus the zero-turn avoided. */
  netInvestment: number;
  annualOpSavings: number;
  /** Infinity when operating savings are ≤ 0; 0 when net investment is ≤ 0. */
  paybackMonths: number;
  /** null ("n/d") when net investment is ≤ 0. */
  roiPct: number | null;
}

export function computeRoi(input: RoiInputs): RoiResult {
  // The horizon field can be briefly empty while typing; never divide by 0.
  const years = Math.max(1, input.years || 0);
  const burden = input.burden / 100;

  const totalHours = input.weeks * input.hoursPerWeek;
  const workDays = totalHours / HOURS_PER_WORKDAY;
  const ztMowTotal = workDays * input.ztMowHrs;
  const voyMowTotal = workDays * input.voyMowHrs;
  const ztLitres = ztMowTotal * input.ztLph;
  const ztFuel = ztLitres * input.gasPrice;
  const kwhPerSeason = workDays * input.batteryKwh;
  const voyEnergy = kwhPerSeason * HQ_RATE;
  const annualLabor = input.wage * totalHours * (1 + burden);

  const zt: CostColumn = {
    equip: input.ztPrice,
    energy: ztFuel * years,
    maint: input.ztMaint * years,
    labor: annualLabor * years,
    total: 0,
  };
  zt.total = zt.equip + zt.energy + zt.maint + zt.labor;

  const voy: CostColumn = {
    equip: input.voyPrice,
    energy: voyEnergy * years,
    maint: input.voyMaint * years,
    labor: 0,
    total: 0,
  };
  voy.total = voy.equip + voy.energy + voy.maint;

  const savings = zt.total - voy.total;

  const ztDep = input.ztPrice / years;
  const ztAnnual = ztDep + input.ztMaint + ztFuel + annualLabor;
  const voyDep = input.voyPrice / years;
  const voyAnnual = voyDep + input.voyMaint + voyEnergy;

  const netInvestment = input.voyPrice - input.ztPrice;
  const annualOpSavings = annualLabor + ztFuel + input.ztMaint - (voyEnergy + input.voyMaint);
  const paybackMonths =
    annualOpSavings <= 0 ? Infinity : netInvestment <= 0 ? 0 : netInvestment / (annualOpSavings / 12);

  return {
    totalHours,
    workDays,
    ztMowTotal,
    voyMowTotal,
    ztLitres,
    ztFuel,
    kwhPerSeason,
    voyEnergy,
    annualLabor,
    zt,
    voy,
    savings,
    annualProfit: savings / years,
    ztDep,
    ztAnnual,
    voyDep,
    voyAnnual,
    ztCph: ztMowTotal > 0 ? ztAnnual / ztMowTotal : 0,
    voyCph: voyMowTotal > 0 ? voyAnnual / voyMowTotal : 0,
    netInvestment,
    annualOpSavings,
    paybackMonths,
    roiPct: netInvestment > 0 ? ((annualOpSavings * years - netInvestment) / netInvestment) * 100 : null,
  };
}

export type RoiLang = "fr" | "en";

const LOCALE: Record<RoiLang, string> = { fr: "fr-CA", en: "en-CA" };

/** "34 394 $" in French, "$34,394" in English. No decimals. French is the default. */
export function fmtMoney(n: number, lang: RoiLang = "fr"): string {
  return money(n, lang, 0);
}

/** "61,06 $" / "$61.06": two decimals, used for cost per mowing hour. */
export function fmtMoney2(n: number, lang: RoiLang = "fr"): string {
  return money(n, lang, 2);
}

function money(n: number, lang: RoiLang, digits: number): string {
  if (lang === "en") {
    return n.toLocaleString("en-CA", {
      style: "currency",
      currency: "CAD",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  return `${n.toLocaleString("fr-CA", { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`;
}

export function fmtNumber(n: number, lang: RoiLang = "fr"): string {
  return Math.round(n).toLocaleString(LOCALE[lang]);
}

/**
 * "1 an 4 mois", "2 ans", "7 mois", or "n/d" when it never pays back.
 * English: "1 year 4 months", "2 years", "7 months", "n/a".
 */
export function formatPayback(months: number, lang: RoiLang = "fr"): string {
  if (!Number.isFinite(months)) return lang === "en" ? "n/a" : "n/d";
  const totalMonths = Math.round(months);
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  const monthsText = lang === "en" ? `${m} month${m === 1 ? "" : "s"}` : `${m} mois`;
  if (y === 0) return monthsText;
  const yearsText = lang === "en" ? `${y} year${y > 1 ? "s" : ""}` : `${y} an${y > 1 ? "s" : ""}`;
  return m === 0 ? yearsText : `${yearsText} ${monthsText}`;
}

/** "268 %" in French, "268%" in English. */
export function formatRoi(roiPct: number | null, lang: RoiLang = "fr"): string {
  if (roiPct === null) return lang === "en" ? "n/a" : "n/d";
  return lang === "en" ? `${roiPct.toFixed(0)}%` : `${roiPct.toFixed(0)} %`;
}
