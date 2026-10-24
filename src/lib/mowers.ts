/**
 * Kress robot mowers and which one fits a property (site.ts). Specs are
 * Kress's North American listings (kress.com/en-us and en-ca) and dealer spec
 * sheets as of Oct 24, 2026; where they disagree the lower figure is used.
 * Kress publishes no minimum passage width, so `passageM` is an estimate from
 * each robot's size (body width plus room to turn): treat it as a site check.
 * The fit is on capability. List prices conflict between sources (and sales
 * run all season), so `listUsd` is only a rough order used to break ties
 * between robots that fit equally well, never shown.
 */
import { ROI_DEFAULTS } from "./roi";
import type { Site } from "./site";

export const MOWERS_AS_OF = "2026-10-24";

const ACRE_M2 = 4046.86;

export type MowerLine = "rtkn" | "eyepilot" | "eyepilot4x4" | "masterseries" | "voyager";

export interface Mower {
  id: string;
  line: MowerLine;
  /** Kress's rated area (m²): mowing every 48 h for the robots; one charge (a day) for the Voyager. */
  areaM2: number;
  /** Largest area (m²) it can keep up with, mowing less often (every 72 h). */
  maxAreaM2: number;
  maxSlopePct: number;
  cutWidthCm: number;
  /** Lowest cutting height (mm): a fairway wants 10-15 mm, rough and lawns 40 mm and up. */
  minCutMm: number;
  /** Estimated narrowest passage it drives through reliably (m). */
  passageM: number;
  /** EyePilot camera (V-SLAM): keeps its position under trees and near walls, where RTK signal drops. */
  vision: boolean;
  /** Four driven wheels. */
  fourWheel: boolean;
  /** Obstacle avoidance (sensors or camera) rather than bump-and-turn. */
  avoidance: boolean;
  /** ZeroTrim: cuts right to the edge, so less trimming by hand. */
  zeroTrim: boolean;
  commercial: boolean;
  /** Rough US list price (USD): SmartYard's 2026 review and kress.com/en-us; Voyagers from the ROI presets (CAD × 0.73); the MasterSeries is a guess. */
  listUsd: number;
}

const ac = (acres: number) => Math.round(acres * ACRE_M2);
const robot = (m: Omit<Mower, "commercial"> & { commercial?: boolean }): Mower => ({ commercial: false, ...m });

/** Smallest first within each line. */
export const MOWERS: Mower[] = [
  robot({ id: "KR161", line: "rtkn", areaM2: ac(0.25), maxAreaM2: ac(0.25), maxSlopePct: 40, cutWidthCm: 20, minCutMm: 40, passageM: 0.9, vision: false, fourWheel: false, avoidance: false, zeroTrim: false, listUsd: 1500 }),
  robot({ id: "KR172", line: "rtkn", areaM2: ac(0.5), maxAreaM2: ac(0.7), maxSlopePct: 40, cutWidthCm: 20, minCutMm: 40, passageM: 0.9, vision: false, fourWheel: false, avoidance: false, zeroTrim: false, listUsd: 1700 }),
  robot({ id: "KR173", line: "rtkn", areaM2: ac(0.75), maxAreaM2: ac(1.2), maxSlopePct: 40, cutWidthCm: 20, minCutMm: 40, passageM: 0.9, vision: false, fourWheel: false, avoidance: true, zeroTrim: false, listUsd: 2000 }),
  robot({ id: "KR174", line: "rtkn", areaM2: ac(1.2), maxAreaM2: ac(1.7), maxSlopePct: 40, cutWidthCm: 22, minCutMm: 40, passageM: 0.9, vision: false, fourWheel: false, avoidance: true, zeroTrim: false, listUsd: 2700 }),
  robot({ id: "KR233", line: "rtkn", areaM2: ac(3), maxAreaM2: ac(4.5), maxSlopePct: 40, cutWidthCm: 35, minCutMm: 30, passageM: 1.1, vision: false, fourWheel: false, avoidance: true, zeroTrim: false, listUsd: 6000 }),
  robot({ id: "KR236", line: "rtkn", areaM2: ac(6), maxAreaM2: ac(9), maxSlopePct: 40, cutWidthCm: 35, minCutMm: 30, passageM: 1.1, vision: false, fourWheel: false, avoidance: true, zeroTrim: false, listUsd: 13800 }),
  robot({ id: "KR237", line: "rtkn", areaM2: ac(7), maxAreaM2: ac(10.5), maxSlopePct: 40, cutWidthCm: 35, minCutMm: 10, passageM: 1.1, vision: false, fourWheel: false, avoidance: true, zeroTrim: false, listUsd: 15000 }),
  robot({ id: "KR272", line: "eyepilot", areaM2: ac(0.5), maxAreaM2: ac(0.5), maxSlopePct: 40, cutWidthCm: 22, minCutMm: 20, passageM: 0.9, vision: true, fourWheel: false, avoidance: true, zeroTrim: true, listUsd: 2500 }),
  robot({ id: "KR282", line: "eyepilot4x4", areaM2: ac(0.5), maxAreaM2: ac(0.5), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, passageM: 0.9, vision: true, fourWheel: true, avoidance: true, zeroTrim: true, listUsd: 3000 }),
  robot({ id: "KR284", line: "eyepilot4x4", areaM2: ac(1), maxAreaM2: ac(1), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, passageM: 0.9, vision: true, fourWheel: true, avoidance: true, zeroTrim: true, listUsd: 3600 }),
  robot({ id: "KR286", line: "eyepilot4x4", areaM2: ac(2.5), maxAreaM2: ac(2.5), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, passageM: 0.9, vision: true, fourWheel: true, avoidance: true, zeroTrim: true, listUsd: 4300 }),
  robot({ id: "KR238G", line: "masterseries", areaM2: ac(20), maxAreaM2: ac(20), maxSlopePct: 40, cutWidthCm: 62, minCutMm: 10, passageM: 1.5, vision: false, fourWheel: false, avoidance: true, zeroTrim: false, commercial: true, listUsd: 40000 }),
  // Voyager slope: Kress gives 20° (about 36 %) for the KR800 and 25° (about 47 %) for the KR804; retailers say 40 %.
  robot({ id: "KR800", line: "voyager", areaM2: ac(7), maxAreaM2: ac(7), maxSlopePct: 36, cutWidthCm: 102, minCutMm: 38, passageM: 2, vision: false, fourWheel: false, avoidance: true, zeroTrim: false, commercial: true, listUsd: 62000 }),
  robot({ id: "KR804", line: "voyager", areaM2: ac(19), maxAreaM2: ac(19), maxSlopePct: 47, cutWidthCm: 152, minCutMm: 38, passageM: 2.5, vision: false, fourWheel: false, avoidance: true, zeroTrim: false, commercial: true, listUsd: 84000 }),
];

export const mowerById = (id: string) => MOWERS.find((m) => m.id === id) ?? null;

const LINE_NAME: Record<MowerLine, string> = {
  rtkn: "RTKn",
  eyepilot: "EyePilot",
  eyepilot4x4: "EyePilot 4x4",
  masterseries: "MasterSeries",
  voyager: "Voyager",
};

/** "Kress EyePilot 4x4 KR284", "Kress Voyager KR804 (60 in.)". */
export function mowerName(m: Mower): string {
  const deck = m.line === "voyager" ? ` (${Math.round(m.cutWidthCm / 2.54)} in.)` : "";
  return `Kress ${LINE_NAME[m.line]} ${m.id}${deck}`;
}

/** The ROI tab's Voyager preset for a recommended Voyager, if it is one. */
export function roiModel(m: Mower | undefined | null): "7" | "19" | null {
  return m?.id === "KR800" ? "7" : m?.id === "KR804" ? "19" : null;
}

/** Why a robot fits less well, or why it doesn't fit at all. */
export type FitNote =
  | "atLimit"
  | "tooSmall"
  | "tooSteep"
  | "slopeGrip"
  | "treesNoVision"
  | "noAvoidance"
  | "edgesNoZeroTrim"
  | "narrowPassage";

export interface Fit {
  mower: Mower;
  /** Units needed for the area (always 1 for a lawn). */
  units: number;
  /** False when it can't do the job (too steep, too small, can't cut fairways). */
  fits: boolean;
  /** Lower is better. */
  penalty: number;
  notes: FitNote[];
}

/**
 * Area one unit keeps mowed (m²). Robots are rated for mowing it all every
 * 48 h. A Voyager mows its rating per charge, so it covers that many days'
 * worth at the ROI tab's defaults (5 mowing days, once a week), so both tabs
 * size the same fleet.
 */
export function capacityM2(mower: Mower): number {
  return mower.line === "voyager" ? (mower.areaM2 * ROI_DEFAULTS.voyDaysPerWeek) / ROI_DEFAULTS.mowsPerWeek : mower.areaM2;
}

/** Share of the area above a robot's slope limit that rules it out: a few patches can be left to a trimmer. */
const STEEP_SHARE = 0.02;

/** How well one robot fits a site. */
export function fitMower(site: Site, mower: Mower): Fit {
  const notes: FitNote[] = [];
  let fits = true;
  let penalty = 0;
  const { terrain, shape } = site;
  const units = site.kind === "lawn" ? 1 : Math.max(1, Math.ceil(site.areaM2 / capacityM2(mower)));

  if (site.kind === "lawn") {
    if (site.areaM2 > mower.maxAreaM2) {
      fits = false;
      notes.push("tooSmall");
    } else if (site.areaM2 > mower.areaM2) {
      penalty += 1;
      notes.push("atLimit");
    }
  }
  if (terrain && terrain.coverage >= 0.5) {
    const over = mower.maxSlopePct >= 84 ? terrain.over84 : terrain.over40;
    if (over > STEEP_SHARE || (mower.maxSlopePct < 40 && terrain.over25 > 0.1)) {
      fits = false;
      notes.push("tooSteep");
    } else if (terrain.over25 > 0.05 && !mower.fourWheel) {
      penalty += 1;
      notes.push("slopeGrip");
    }
    if (!mower.vision && terrain.canopy > 0.2) {
      penalty += terrain.canopy > 0.4 ? 3 : 2;
      notes.push("treesNoVision");
    }
  }
  if (shape) {
    if (shape.obstacles >= 3 && !mower.avoidance) {
      penalty += 1;
      notes.push("noAvoidance");
    }
    if (shape.edgePer100 > 35 && !mower.zeroTrim) {
      penalty += 1;
      notes.push("edgesNoZeroTrim");
    }
    if (shape.narrowestM !== null && shape.narrowestM < mower.passageM) {
      penalty += 1;
      notes.push("narrowPassage");
    }
  }
  // Several robots on one property is more to set up and look after.
  penalty += (units - 1) * 0.5;
  return { mower, units, fits, penalty, notes };
}

/** The robots a recommendation chooses from for each kind of site. */
function candidates(site: Site): Mower[] {
  if (site.kind === "lawn") {
    const residential = MOWERS.filter((m) => !m.commercial);
    const biggest = Math.max(...residential.map((m) => m.maxAreaM2));
    return site.areaM2 <= biggest ? residential : MOWERS.filter((m) => m.line === "voyager");
  }
  if (site.kind === "sod") return MOWERS.filter((m) => m.line === "voyager");
  // Golf: the big robots, plus the largest RTKⁿ for a short course.
  return MOWERS.filter((m) => m.commercial || m.id === "KR237");
}

export interface Recommendation {
  /** The robot for the job; on a golf quote with fairways, the one for the fairways. */
  best: Fit | null;
  runnerUp: Fit | null;
  /** Golf with fairways: the robot for the rest of the turf (rough, range). */
  rough: Fit | null;
  /** Every candidate for `best`, best first. */
  fits: Fit[];
}

/** Fits first, then the fewest drawbacks, then the lowest outlay. */
const rank = (a: Fit, b: Fit) => Number(b.fits) - Number(a.fits) || a.penalty - b.penalty || a.mower.listUsd * a.units - b.mower.listUsd * b.units;

/** A lowest cut fine enough for fairways (10-15 mm). */
const FAIRWAY_CUT_MM = 15;

/**
 * The best robot for a site and the next best, with why. A golf quote with
 * fairways is two jobs: the fairways need a robot that cuts 10-15 mm (the
 * MasterSeries, or a KR237 on a small course), sized on the fairways alone;
 * the rest goes to whichever robot suits it best, usually a Voyager.
 */
export function recommend(site: Site): Recommendation {
  if (site.areaM2 <= 0) return { best: null, runnerUp: null, rough: null, fits: [] };
  if (site.kind === "golf" && site.fairwayM2 > 0) {
    const fairways: Site = { ...site, areaM2: site.fairwayM2 };
    const fits = candidates(site)
      .filter((m) => m.minCutMm <= FAIRWAY_CUT_MM)
      .map((m) => fitMower(fairways, m))
      .sort(rank);
    const ok = fits.filter((f) => f.fits);
    const restM2 = site.areaM2 - site.fairwayM2;
    const rest: Site = { ...site, areaM2: restM2, fairwayM2: 0 };
    const rough = restM2 > 0 ? (candidates(rest).map((m) => fitMower(rest, m)).filter((f) => f.fits).sort(rank)[0] ?? null) : null;
    return { best: ok[0] ?? null, runnerUp: ok[1] ?? null, rough, fits };
  }
  const fits = candidates(site).map((m) => fitMower(site, m)).sort(rank);
  const ok = fits.filter((f) => f.fits);
  return { best: ok[0] ?? null, runnerUp: ok[1] ?? null, rough: null, fits };
}
