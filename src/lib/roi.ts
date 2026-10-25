/**
 * ROI calculator (Quebec): a zero-turn crew versus Kress robots, sized for
 * the same mowing job (the same acres, mowed every 1, 2 or 3 days), over a
 * chosen horizon. The robots work one of two ways:
 * - cut and stay: KR238s live on the property, each with its own zone and
 *   charger, mowing it all every 48 h at their rating;
 * - cut and go: a crew brings Voyagers (KR800, KR804), which mow so many
 *   acres per charge and move on.
 *
 * Started as a port of the dealer handoff (Calculateur_ROI_Voyager_Quebec.html),
 * which compared one employee with one Voyager. It now sizes both sides from
 * the acreage to mow, so a client can't object that the machines don't do the
 * same work:
 * - Zero-turn: acres per hour → mowing hours needed → crew (full-time
 *   equivalents, paid for the share of their shifts the mowing takes) and
 *   machines (whole units).
 * - KR238: acres it keeps mowed (its 48 h rating × the days between mowings
 *   ÷ 2) → units (whole; a fleet of several fills each to 90 %, like the
 *   Acreage tab's mower fit), electricity per acre, installation, plus a
 *   weekly check per robot.
 * - Voyager: acres per charge × mowing days → units (whole), electricity per
 *   charge, plus supervision time (moving it, mapping, clearing jams).
 * - Robots size for a plain square; a property's turns, edges, trees and
 *   driving take extra time (`layoutPct`, from the mower fit's layout).
 * - When the robots may mow only at some hours or on some days (`window`),
 *   each one keeps less mowed (window.ts), like the mower fit.
 * - Payback: the zero-turns are either due for replacement (purchase avoided)
 *   or already owned (they can be sold: resale value), and grants/tax credits
 *   from the Incentives tab can reduce the Voyager investment.
 * With one crew member's worth of acreage, no supervision, no incentives and
 * the handoff's inputs, it reproduces the handoff's figures (see roi.test.ts).
 * The robot side keeps the `voy` names from when it priced Voyagers only.
 */

import { robotWindowShare, voyagerWindowShare, type MowWindow } from "./window";

/** Hydro-Québec Tarif G, first block, in effect April 1, 2026 ($/kWh). Update each April 1. */
export const HQ_RATE = 0.12388;
export const HOURS_PER_WORKDAY = 8;

export type VoyagerModel = "7" | "19" | "custom";
/** Cut and stay (KR238s live on the property) or cut and go (Voyagers come with the crew). */
export type Approach = "stay" | "go";
export const isApproach = (v: unknown): v is Approach => v === "stay" || v === "go";
/** Existing zero-turns: due for replacement (purchase avoided) or already paid for (resale). */
export type ZeroTurnStatus = "replace" | "own";

/** Presets applied when the model changes; "custom" keeps the current values. */
export const VOYAGER_PRESETS: Record<
  "7" | "19",
  { voyPrice: number; voyMaint: number; batteryKwh: number; voyAcresPerDay: number }
> = {
  // KR800 (40 in.): 10 kWh, up to 7 acres per charge (9 h charge), per Kress.
  "7": { voyPrice: 85000, voyMaint: 1000, batteryKwh: 10, voyAcresPerDay: 7 },
  // KR804 (60 in.): 38 kWh, up to 19 acres per charge, per Kress (Sept. 2026 launch).
  "19": { voyPrice: 115000, voyMaint: 1600, batteryKwh: 38, voyAcresPerDay: 19 },
};

/** A KR238 fleet of several fills each robot to this share of its rating (mowers.ts LIMIT_LOAD); one alone can run full. */
export const STAY_LOAD = 0.9;
/**
 * KR238 electricity per acre mowed (kWh), an estimate: Kress publishes no
 * battery size. About 2 h per charge on a battery of about 1 kWh, mowing
 * about 1.4 acres an hour, plus charging losses.
 */
export const KR238_KWH_PER_ACRE = 0.3;
/** Run times per charge (min), as in mowers.ts: the KR238's 2 h, a Voyager's about 8 h. */
const KR238_RUNTIME_MIN = 120;
const VOYAGER_RUNTIME_MIN = 480;

/** Mowings per week when mowing every `days` days. */
export const mowsPerWeekOf = (days: number) => (days > 0 ? 7 / days : 0);
export interface RoiInputs {
  /** Turf to mow (acres), e.g. from the Acreage tab, and the days between mowings (2 = every 2 days). */
  area: number;
  mowEvery: number;
  approach: Approach;
  /** Extra robot time for this property's layout (%), from the mower fit: turns, edges, trees, driving. 0 = a plain square (never less). */
  layoutPct: number;
  /** When the robots may mow; null = any time. */
  window: MowWindow | null;
  /** Per model, the time field checks measured over the time we predicted (records.ts); a slower robot keeps less mowed. */
  calibration: Record<string, number>;

  /** KR238 price and installation per robot ($): charger, RTK antenna, mapping. */
  kr238Price: number;
  kr238Install: number;
  /** Acres one KR238 keeps mowed all over every 48 h (Kress's rating). */
  kr238Acres: number;
  /** KR238 maintenance per robot per year ($). */
  kr238Maint: number;
  /** Checks per KR238 per week (h): cleaning, blades, freeing it. */
  kr238Checks: number;

  voyPrice: number;
  batteryKwh: number;
  /** Voyager maintenance per unit per year ($). */
  voyMaint: number;
  /** Acres one Voyager mows per day (one charge per day). */
  voyAcresPerDay: number;
  voyDaysPerWeek: number;
  /** Supervision per Voyager per mowing day (h): moving it, mapping, jams. */
  supHrs: number;
  /** Grants and tax credits deducted from the Voyager investment ($). */
  incentives: number;

  /** Hourly wage ($/h). */
  wage: number;
  /** Payroll burden in percent (25 = 25%). */
  burden: number;
  weeks: number;
  /** Paid hours per week. */
  hoursPerWeek: number;
  /** Mowing hours per 8 h workday on a zero-turn (travel, lunch and breaks excluded). */
  ztMowHrs: number;
  /** Zero-turn productivity (acres per mowing hour). */
  ztAcresPerHour: number;
  ztPrice: number;
  ztStatus: ZeroTurnStatus;
  /** Resale value of one existing zero-turn ($), used when already owned. */
  ztResale: number;
  /** Zero-turn fuel use (L/h) and gas price ($/L). */
  ztLph: number;
  gasPrice: number;
  /** Zero-turn maintenance per machine per season ($). */
  ztMaint: number;
  /** Horizon in years. */
  years: number;
}

export const ROI_DEFAULTS: RoiInputs = {
  // 10 acres every 2 days = 35 acres a week: one 7-acre Voyager mowing 5 days a week, or one KR238.
  area: 10,
  mowEvery: 2,
  approach: "go",
  layoutPct: 0,
  window: null,
  calibration: {},
  // KR238: US$39,999 at a US dealer, converted like the Voyager's price (Oct. 2026); 20 acres every 48 h per Kress.
  // Installation, maintenance and checks are estimates.
  kr238Price: 55000,
  kr238Install: 1500,
  kr238Acres: 20,
  kr238Maint: 600,
  kr238Checks: 1,
  ...VOYAGER_PRESETS["7"],
  voyDaysPerWeek: 5,
  supHrs: 0.5,
  incentives: 0,
  wage: 23,
  burden: 25,
  weeks: 30,
  hoursPerWeek: 40,
  ztMowHrs: 5.5,
  // 60 in. deck at about 12 km/h with 65% field efficiency ≈ 3 acres/h.
  ztAcresPerHour: 3,
  ztPrice: 25000,
  ztStatus: "replace",
  // Used commercial 60 in. zero-turn, a few seasons old (estimate).
  ztResale: 8000,
  ztLph: 5.3,
  /** Régie de l'énergie, regular gas, early October 2026 (≈ 199 to 202 ¢/L). */
  gasPrice: 2.0,
  ztMaint: 3000,
  years: 5,
};

/**
 * Month of the default gas price above. The live StatCan price (monthly,
 * about a month late) only replaces it once it is at least this recent.
 */
export const DEFAULT_GAS_PERIOD = "2026-10";

export interface CostColumn {
  equip: number;
  energy: number;
  maint: number;
  labor: number;
  total: number;
}

export interface RoiResult {
  /** Mowings per week, and acres mowed per week and per season (same job on both sides). */
  mowsPerWeek: number;
  weeklyAcres: number;
  seasonAcres: number;
  totalHours: number;
  workDays: number;

  /** Zero-turn crew in full-time equivalents, and whole machines needed. */
  crewFte: number;
  ztMachines: number;
  /** Zero-turn mowing hours per season. */
  ztMowTotal: number;
  ztLitres: number;
  /** Zero-turn fuel per season ($). */
  ztFuel: number;
  /** Labour per year: the share of the crew's paid shifts the mowing takes. */
  annualLabor: number;
  ztMaintTotal: number;

  /** Robot units needed (KR238s or Voyagers). */
  units: number;
  /** Robot equipment before grants and credits ($): price and installation. */
  robotGross: number;
  /** Voyager charges per season (one per acres-per-day of mowing); 0 for KR238s. */
  charges: number;
  kwhPerSeason: number;
  /** Voyager electricity per season ($). */
  voyEnergy: number;
  voyMaintTotal: number;
  supHoursPerSeason: number;
  /** Supervision labour per year ($). */
  supLabor: number;

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
  /** Cost per acre mowed (0 when nothing is mowed). */
  ztCpa: number;
  voyCpa: number;
  /** Voyager cost after incentives, minus the zero-turn purchase avoided or resale. */
  netInvestment: number;
  annualOpSavings: number;
  /** Infinity when operating savings are ≤ 0; 0 when net investment is ≤ 0. */
  paybackMonths: number;
  /** null ("n/d") when net investment is ≤ 0. */
  roiPct: number | null;
}

const EPS = 1e-9;
/** Whole units needed for a fractional load (0 when there's no load). */
const wholeUnits = (load: number) => (load > EPS ? Math.ceil(load - EPS) : 0);

export function computeRoi(input: RoiInputs): RoiResult {
  // Fields can be briefly empty while typing; never divide by 0.
  const years = Math.max(1, input.years || 0);
  const burden = input.burden / 100;
  const loadedWage = input.wage * (1 + burden);

  const area = Math.max(0, input.area);
  const mowsPerWeek = mowsPerWeekOf(input.mowEvery);
  const weeklyAcres = area * mowsPerWeek;
  const seasonAcres = weeklyAcres * input.weeks;
  const totalHours = input.weeks * input.hoursPerWeek;
  const workDays = totalHours / HOURS_PER_WORKDAY;

  // Zero-turn crew
  const workDaysPerWeek = input.hoursPerWeek / HOURS_PER_WORKDAY;
  const weeklyMowHours = input.ztAcresPerHour > 0 ? weeklyAcres / input.ztAcresPerHour : 0;
  const mowHoursPerWorkerWeek = input.ztMowHrs * workDaysPerWeek;
  const crewFte = mowHoursPerWorkerWeek > 0 ? weeklyMowHours / mowHoursPerWorkerWeek : 0;
  const ztMachines = wholeUnits(crewFte);
  const ztMowTotal = weeklyMowHours * input.weeks;
  const ztLitres = ztMowTotal * input.ztLph;
  const ztFuel = ztLitres * input.gasPrice;
  const annualLabor = crewFte * totalHours * loadedWage;
  const ztMaintTotal = ztMachines * input.ztMaint;

  // Robot fleet: the layout's extra time is mowing time, so it takes capacity and energy.
  const layout = 1 + Math.max(0, input.layoutPct) / 100;
  const stay = input.approach === "stay";
  let units: number;
  let charges = 0;
  let kwhPerSeason: number;
  let supHoursPerSeason: number;
  if (stay) {
    // KR238: rated for mowing it all every 48 h, so every day halves its area and every 3 days adds half.
    const perUnit =
      (((input.kr238Acres * input.mowEvery) / 2) * robotWindowShare(input.window, KR238_RUNTIME_MIN)) / (input.calibration.KR238 ?? 1);
    const load = perUnit > 0 ? (area * layout) / perUnit : 0;
    units = load > 1 ? wholeUnits(load / STAY_LOAD) : wholeUnits(load);
    kwhPerSeason = seasonAcres * layout * KR238_KWH_PER_ACRE;
    supHoursPerSeason = units * input.kr238Checks * input.weeks;
  } else {
    // The field checks of the Voyager this many acres a charge is (the KR804's 19, else the KR800).
    const voyager = input.voyAcresPerDay >= 19 ? "KR804" : "KR800";
    const weeklyCapacity =
      (input.voyAcresPerDay * input.voyDaysPerWeek * voyagerWindowShare(input.window, VOYAGER_RUNTIME_MIN, input.voyDaysPerWeek)) /
      (input.calibration[voyager] ?? 1);
    units = weeklyCapacity > 0 ? wholeUnits((weeklyAcres * layout) / weeklyCapacity) : 0;
    charges = input.voyAcresPerDay > 0 ? ((weeklyAcres * layout) / input.voyAcresPerDay) * input.weeks : 0;
    kwhPerSeason = charges * input.batteryKwh;
    supHoursPerSeason = units * input.supHrs * input.voyDaysPerWeek * input.weeks;
  }
  const voyEnergy = kwhPerSeason * HQ_RATE;
  const voyMaintTotal = units * (stay ? input.kr238Maint : input.voyMaint);
  const supLabor = supHoursPerSeason * loadedWage;
  const robotGross = units * (stay ? input.kr238Price + input.kr238Install : input.voyPrice);

  // Equipment: the zero-turns are a purchase avoided, or (already owned) their resale value.
  const ztUnitValue = input.ztStatus === "replace" ? input.ztPrice : input.ztResale;
  const ztEquip = ztMachines * ztUnitValue;
  const voyEquip = Math.max(0, robotGross - Math.max(0, input.incentives));

  const zt: CostColumn = {
    equip: ztEquip,
    energy: ztFuel * years,
    maint: ztMaintTotal * years,
    labor: annualLabor * years,
    total: 0,
  };
  zt.total = zt.equip + zt.energy + zt.maint + zt.labor;

  const voy: CostColumn = {
    equip: voyEquip,
    energy: voyEnergy * years,
    maint: voyMaintTotal * years,
    labor: supLabor * years,
    total: 0,
  };
  voy.total = voy.equip + voy.energy + voy.maint + voy.labor;

  const savings = zt.total - voy.total;

  const ztDep = ztEquip / years;
  const ztAnnual = ztDep + ztMaintTotal + ztFuel + annualLabor;
  const voyDep = voyEquip / years;
  const voyAnnual = voyDep + voyMaintTotal + voyEnergy + supLabor;

  const netInvestment = voyEquip - ztEquip;
  const annualOpSavings = annualLabor + ztFuel + ztMaintTotal - (voyEnergy + voyMaintTotal + supLabor);
  const paybackMonths =
    annualOpSavings <= 0 ? Infinity : netInvestment <= 0 ? 0 : netInvestment / (annualOpSavings / 12);

  return {
    mowsPerWeek,
    weeklyAcres,
    seasonAcres,
    totalHours,
    workDays,
    crewFte,
    ztMachines,
    ztMowTotal,
    ztLitres,
    ztFuel,
    annualLabor,
    ztMaintTotal,
    units,
    robotGross,
    charges,
    kwhPerSeason,
    voyEnergy,
    voyMaintTotal,
    supHoursPerSeason,
    supLabor,
    zt,
    voy,
    savings,
    annualProfit: savings / years,
    ztDep,
    ztAnnual,
    voyDep,
    voyAnnual,
    ztCpa: seasonAcres > 0 ? ztAnnual / seasonAcres : 0,
    voyCpa: seasonAcres > 0 ? voyAnnual / seasonAcres : 0,
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
  // Math.round, not toFixed: a slightly negative ROI reads "0 %", not "-0 %".
  const pct = String(Math.round(roiPct));
  return lang === "en" ? `${pct}%` : `${pct} %`;
}
