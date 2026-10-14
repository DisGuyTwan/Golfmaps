/**
 * Voyager ROI calculator (Quebec): a zero-turn crew versus Kress Voyager
 * autonomous mowers, sized for the same mowing job, over a chosen horizon.
 *
 * Started as a port of the dealer handoff (Calculateur_ROI_Voyager_Quebec.html),
 * which compared one employee with one Voyager. It now sizes both sides from
 * the acreage to mow, so a client can't object that the machines don't do the
 * same work:
 * - Zero-turn: acres per hour → mowing hours needed → crew (full-time
 *   equivalents, paid for the share of their shifts the mowing takes) and
 *   machines (whole units).
 * - Voyager: acres per charge × mowing days → units (whole), electricity per
 *   charge, plus supervision time (moving it, mapping, clearing jams).
 * - Payback: the zero-turns are either due for replacement (purchase avoided)
 *   or already owned (they can be sold: resale value), and grants/tax credits
 *   from the Incentives tab can reduce the Voyager investment.
 * With one crew member's worth of acreage, no supervision, no incentives and
 * the handoff's inputs, it reproduces the handoff's figures (see roi.test.ts).
 */

/** Hydro-Québec Tarif G, first block, in effect April 1, 2026 ($/kWh). Update each April 1. */
export const HQ_RATE = 0.12388;
export const HOURS_PER_WORKDAY = 8;

export type VoyagerModel = "7" | "19" | "custom";
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

export interface RoiInputs {
  /** Turf to mow (acres), e.g. from the Acreage tab, and how often. */
  area: number;
  mowsPerWeek: number;

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
  // 35 acres once a week = one 7-acre Voyager mowing 5 days a week.
  area: 35,
  mowsPerWeek: 1,
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
  /** Acres mowed per week and per season (same job on both sides). */
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

  /** Voyager units needed. */
  units: number;
  /** Charges per season (one per acres-per-day of mowing). */
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

  const weeklyAcres = Math.max(0, input.area) * Math.max(0, input.mowsPerWeek);
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

  // Voyager fleet
  const weeklyCapacity = input.voyAcresPerDay * input.voyDaysPerWeek;
  const units = weeklyCapacity > 0 ? wholeUnits(weeklyAcres / weeklyCapacity) : 0;
  const charges = input.voyAcresPerDay > 0 ? (weeklyAcres / input.voyAcresPerDay) * input.weeks : 0;
  const kwhPerSeason = charges * input.batteryKwh;
  const voyEnergy = kwhPerSeason * HQ_RATE;
  const voyMaintTotal = units * input.voyMaint;
  const supHoursPerSeason = units * input.supHrs * input.voyDaysPerWeek * input.weeks;
  const supLabor = supHoursPerSeason * loadedWage;

  // Equipment: the zero-turns are a purchase avoided, or (already owned) their resale value.
  const ztUnitValue = input.ztStatus === "replace" ? input.ztPrice : input.ztResale;
  const ztEquip = ztMachines * ztUnitValue;
  const voyEquip = Math.max(0, units * input.voyPrice - Math.max(0, input.incentives));

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
  return lang === "en" ? `${roiPct.toFixed(0)}%` : `${roiPct.toFixed(0)} %`;
}
