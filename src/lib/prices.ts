/**
 * Prices for a proposal. Unit prices come from the dealer's price list
 * (`UNIT_PRICES`, CAD before taxes, dated `PRICES_AS_OF`); a model without one
 * is priced by the rep on the proposal. The rep always types the
 * installation price; the app gives its own estimate beside it
 * (`installEstimate`), and the monthly payment a financed purchase takes.
 * Pure, so it's tested without a browser.
 */
import type { Mower } from "./mowers";
import type { Site } from "./site";

/** Date of the price list below; null until it's in. */
export const PRICES_AS_OF: string | null = null;

/** Unit prices from the dealer price list (CAD, before taxes); null until it's in. */
export const UNIT_PRICES: Record<string, number | null> = {
  KR161: null,
  KR172: null,
  KR173: null,
  KR174: null,
  KR272: null,
  KR276: null,
  KR282: null,
  KR284: null,
  KR286: null,
  KR238: null,
  KR800: null,
  KR804: null,
};

/**
 * Installation, an estimate: the rep's own price replaces it. Per unit,
 * setting up the charger and positioning (RTK antenna or reference station,
 * the app), then mapping the zone's edges by driving the robot along them,
 * plus a trip; materials per unit (mounts, cable, stakes; power to a KR238's
 * station). A Voyager has no fixed installation: the crew maps each site on
 * its first visit.
 */
export const INSTALL = {
  /** Labour rate ($/h). */
  rateHour: 95,
  /** One trip to the site (h). */
  tripH: 1,
  home: { setupH: 1.5, mapMS: 0.35, materials: 150 },
  kr238: { setupH: 4, mapMS: 1, materials: 600 },
  voyager: { setupH: 1, mapMS: 1.5, materials: 0 },
};

export interface InstallEstimate {
  hours: number;
  labour: number;
  materials: number;
  total: number;
}

/** Edges to map (m): the layout's edges at the quoted area, else about a square's with ragged sides. */
export function edgesToMap(site: Site): number {
  const c = site.coverage;
  if (c && c.areaM2 > 0) return c.stripes.edgeM * Math.sqrt(site.areaM2 / c.areaM2);
  return 4 * Math.sqrt(site.areaM2) * 1.3;
}

/** The app's installation estimate for `units` of a robot on a site (`edgeM` of edges to map). */
export function installEstimate(mower: Mower, units: number, edgeM: number, rateHour = INSTALL.rateHour): InstallEstimate {
  const kind = mower.line === "voyager" ? INSTALL.voyager : mower.line === "masterseries" ? INSTALL.kr238 : INSTALL.home;
  // A Voyager is set up once for the site, however many come; robots that stay each get theirs.
  const setups = mower.line === "voyager" ? 1 : units;
  const hours = INSTALL.tripH + setups * kind.setupH + edgeM / kind.mapMS / 3600;
  const labour = hours * rateHour;
  const materials = units * kind.materials;
  return { hours, labour, materials, total: labour + materials };
}

/**
 * Monthly payment on a loan or lease: `principal` over `months` at
 * `ratePct` a year, less what's left at the end (`residual`, a lease's
 * buyout). 0 % is the principal split evenly.
 */
export function monthlyPayment(principal: number, ratePct: number, months: number, residual = 0): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = ratePct / 100 / 12;
  if (r === 0) return (principal - residual) / months;
  const f = Math.pow(1 + r, months);
  return ((principal - residual / f) * r * f) / (f - 1);
}

/** Financing offered by default: the rep puts in the partner's rate (this one is an example). */
export const DEFAULT_FINANCING = { ratePct: 7.99, months: 48, downPct: 0 };
