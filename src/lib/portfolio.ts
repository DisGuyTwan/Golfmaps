/**
 * A portfolio of commercial or municipal sites (a city's parks, a property
 * manager's buildings): each measured like a lawn, each given the robots
 * that fit it, and the whole fleet for the quote and the ROI tab.
 *
 * Cut and stay: robots live on each site, so the fleet is each site's own
 * (home robots in a fleet, or KR238s), added up. Cut and go: Voyagers move
 * from site to site with the crew, so they're sized on all the grass at
 * once (with the sites' average layout time), in whichever Voyager size
 * takes the least outlay and can mow every site. Pure, so it's tested
 * without a browser.
 */
import { MOWERS, capacityM2, fitMower, mainFleet, recommend, type Fit, type FitOptions } from "./mowers";
import type { MowEvery } from "./quote";
import type { Approach } from "./roi";
import type { Site } from "./site";

const ACRE_M2 = 4046.86;
/** A layout can't make a robot faster than about this much of its rating (as in mowers.ts). */
const MIN_FACTOR = 0.9;

export interface PortfolioLine {
  /** The site's index in the list. */
  index: number;
  acres: number;
  /** The robots for this site (cut and stay), or the Voyager's fit on it (cut and go: whether it can mow it). */
  fit: Fit | null;
}

export interface PortfolioPlan {
  lines: PortfolioLine[];
  acres: number;
  approach: Approach;
  /** The whole fleet, by model: [model id, units]. */
  fleet: [string, number][];
  /** Extra time the sites' layouts cost on average (area-weighted), over a plain square. */
  layoutFactor: number;
  /** Sites no robot working this way can mow (too steep): left out of the fleet. */
  unfit: number[];
}

/** The sites as commercial sites: every robot competes (mowers.ts candidates). */
const asSite = (s: Site): Site => ({ ...s, kind: "site" });

export function planPortfolio(sites: (Site | null)[], every: MowEvery, approach: Approach, opts: FitOptions = {}): PortfolioPlan {
  const lines: PortfolioLine[] = [];
  const unfit: number[] = [];
  const fleet = new Map<string, number>();
  let m2 = 0;
  let weighted = 0;
  sites.forEach((s, index) => {
    if (!s || s.areaM2 <= 0) return;
    const site = asSite(s);
    m2 += site.areaM2;
    if (approach === "stay") {
      const f = mainFleet(recommend(site, every, "stay", opts));
      lines.push({ index, acres: site.areaM2 / ACRE_M2, fit: f });
      if (!f) unfit.push(index);
      else fleet.set(f.mower.id, (fleet.get(f.mower.id) ?? 0) + f.units);
      weighted += site.areaM2 * Math.max(MIN_FACTOR, f?.work?.factor ?? 1);
      return;
    }
    // Cut and go: the best Voyager on this site, only to see whether one can mow it and what its layout costs.
    const f = recommend(site, every, "go", opts).best;
    lines.push({ index, acres: site.areaM2 / ACRE_M2, fit: f });
    if (!f) unfit.push(index);
    weighted += site.areaM2 * Math.max(MIN_FACTOR, f?.work?.factor ?? 1);
  });
  const layoutFactor = m2 > 0 ? weighted / m2 : 1;
  if (approach === "go") {
    const mowed = lines.filter((l) => !unfit.includes(l.index)).reduce((t, l) => t + l.acres * ACRE_M2, 0);
    // Every Voyager size that can mow every site it's needed on, sized on all their grass at once; the least outlay wins.
    const options = MOWERS.filter((m) => m.line === "voyager")
      .filter((m) => lines.every((l) => unfit.includes(l.index) || fitMower(asSite(sites[l.index]!), m, every, opts).fits))
      .map((m) => ({ m, units: Math.ceil((mowed * layoutFactor) / capacityM2(m, every, opts) - 1e-9) }))
      .sort((a, b) => a.m.listUsd * a.units - b.m.listUsd * b.units);
    if (options[0] && mowed > 0) fleet.set(options[0].m.id, options[0].units);
  }
  return { lines, acres: m2 / ACRE_M2, approach, fleet: [...fleet], layoutFactor, unfit };
}

/** "12 × KR286 + 2 × KR238". */
export const fleetLine = (fleet: [string, number][]) => fleet.map(([id, n]) => `${n} × ${id}`).join(" + ");
