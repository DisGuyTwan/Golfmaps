/**
 * The Kress robots quoted and which one fits a property (site.ts). Specs are
 * Kress's North American listings (kress.com/en-us and en-ca) and dealer spec
 * sheets as of Oct 24, 2026; where they disagree the lower figure is used.
 * Kress publishes no minimum passage width, mowing speed or (for most models)
 * run time per charge, so `passageM`, `speedMS`, `turnS` and `runtimeMin` are
 * estimates (body size, typical RTK robots, battery size): they shape the
 * extra time a property costs (coverage.ts), not the rated areas.
 * The fit is on capability. List prices conflict between sources (and sales
 * run all season), so `listUsd` is only a rough order used to break ties
 * between robots that fit equally well, never shown.
 */
import { overhead, type Overhead, type Pace } from "./coverage";
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
  /** Estimated mowing speed (m/s), time per turn at a stripe's end (s) and run time per charge (min). */
  speedMS: number;
  turnS: number;
  runtimeMin: number;
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

/** What each line shares: residential robots at a typical RTK robot's 0.35 m/s, the big ones at their published speeds. */
const RESIDENTIAL = { passageM: 0.9, speedMS: 0.35, turnS: 8, commercial: false, avoidance: true, zeroTrim: false, vision: false, fourWheel: false };
const EYEPILOT = { ...RESIDENTIAL, vision: true, zeroTrim: true };

export const MOWERS: Mower[] = [
  // RTKn: RTK satellite positioning, no camera; the KR161 and KR172 bump into obstacles rather than avoid them.
  { ...RESIDENTIAL, id: "KR161", line: "rtkn", areaM2: ac(0.25), maxAreaM2: ac(0.25), maxSlopePct: 40, cutWidthCm: 20, minCutMm: 40, runtimeMin: 50, avoidance: false, listUsd: 1500 },
  { ...RESIDENTIAL, id: "KR172", line: "rtkn", areaM2: ac(0.5), maxAreaM2: ac(0.7), maxSlopePct: 40, cutWidthCm: 20, minCutMm: 40, runtimeMin: 60, avoidance: false, listUsd: 1700 },
  { ...RESIDENTIAL, id: "KR173", line: "rtkn", areaM2: ac(0.75), maxAreaM2: ac(1.2), maxSlopePct: 40, cutWidthCm: 20, minCutMm: 40, runtimeMin: 70, listUsd: 2000 },
  { ...RESIDENTIAL, id: "KR174", line: "rtkn", areaM2: ac(1.2), maxAreaM2: ac(1.7), maxSlopePct: 40, cutWidthCm: 22, minCutMm: 40, runtimeMin: 90, listUsd: 2700 },
  // EyePilot: camera plus RTK, ZeroTrim; the KR276 lists 130 min per charge (10 Ah).
  { ...EYEPILOT, id: "KR272", line: "eyepilot", areaM2: ac(0.5), maxAreaM2: ac(0.5), maxSlopePct: 40, cutWidthCm: 22, minCutMm: 40, runtimeMin: 75, listUsd: 2500 },
  { ...EYEPILOT, id: "KR276", line: "eyepilot", areaM2: ac(1.5), maxAreaM2: ac(1.5), maxSlopePct: 40, cutWidthCm: 24, minCutMm: 40, runtimeMin: 130, listUsd: 3600 },
  // EyePilot 4x4: four motors, slopes to 84 %.
  { ...EYEPILOT, id: "KR282", line: "eyepilot4x4", areaM2: ac(0.5), maxAreaM2: ac(0.5), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, runtimeMin: 75, fourWheel: true, listUsd: 3000 },
  { ...EYEPILOT, id: "KR284", line: "eyepilot4x4", areaM2: ac(1), maxAreaM2: ac(1), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, runtimeMin: 100, fourWheel: true, listUsd: 3600 },
  { ...EYEPILOT, id: "KR286", line: "eyepilot4x4", areaM2: ac(2.5), maxAreaM2: ac(2.5), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, runtimeMin: 130, fourWheel: true, listUsd: 4300 },
  // MasterSeries: 62 cm, cuts down to 10 mm (fairways), 2 h per charge, 1.5 m/s; 18 % slope at the boundary.
  { ...RESIDENTIAL, id: "KR238", line: "masterseries", areaM2: ac(20), maxAreaM2: ac(20), maxSlopePct: 40, cutWidthCm: 62, minCutMm: 10, passageM: 1.5, speedMS: 1.5, turnS: 10, runtimeMin: 120, commercial: true, listUsd: 40000 },
  // Voyager: up to 7 or 19 acres (about 8 h) per charge at 5.6 mph. Slope: Kress gives 20° (about 36 %) for the KR800 and 25° (about 47 %) for the KR804.
  { ...RESIDENTIAL, id: "KR800", line: "voyager", areaM2: ac(7), maxAreaM2: ac(7), maxSlopePct: 36, cutWidthCm: 102, minCutMm: 38, passageM: 2, speedMS: 2.5, turnS: 12, runtimeMin: 480, commercial: true, listUsd: 62000 },
  { ...RESIDENTIAL, id: "KR804", line: "voyager", areaM2: ac(19), maxAreaM2: ac(19), maxSlopePct: 47, cutWidthCm: 152, minCutMm: 38, passageM: 2.5, speedMS: 2.5, turnS: 12, runtimeMin: 480, commercial: true, listUsd: 84000 },
];

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

/** How a robot works, for coverage.ts: its stripe is the cut width less about 15 % overlap (10 % for the Voyager deck). */
function paceOf(m: Mower): Pace {
  return { stripeM: (m.cutWidthCm / 100) * (m.line === "voyager" ? 0.9 : 0.85), speedMS: m.speedMS, turnS: m.turnS, runtimeMin: m.runtimeMin };
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
  /** Extra time the property costs this robot (shapes, driving), or null without a layout. */
  work: Overhead | null;
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
/** A layout can't make a robot faster than about this much of its rating. */
const MIN_FACTOR = 0.9;

/**
 * How well one robot fits a site. The area it has to keep up with is the
 * site's area times the extra time the layout costs this robot (turns, broken
 * stripes, edges, driving from the charger and between areas), so a ragged
 * lawn far from the charger can need the next size up.
 */
export function fitMower(site: Site, mower: Mower): Fit {
  const notes: FitNote[] = [];
  let fits = true;
  let penalty = 0;
  const { terrain, shape } = site;
  // The layout's extra time is a ratio; its hours are for the layout's own area (all the turf on a course).
  const layout = site.coverage ? overhead(site.coverage, paceOf(mower)) : null;
  const work = layout && { ...layout, hours: (layout.hours * site.areaM2) / site.coverage!.areaM2 };
  const effective = site.areaM2 * Math.max(MIN_FACTOR, work?.factor ?? 1);
  const units = site.kind === "lawn" ? 1 : Math.max(1, Math.ceil(effective / capacityM2(mower)));

  if (site.kind === "lawn") {
    if (effective > mower.maxAreaM2) {
      fits = false;
      notes.push("tooSmall");
    } else if (effective > mower.areaM2) {
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
  return { mower, units, fits, penalty, notes, work };
}

/** The robots a recommendation chooses from for each kind of site. */
function candidates(site: Site): Mower[] {
  if (site.kind === "lawn") {
    const residential = MOWERS.filter((m) => !m.commercial);
    const biggest = Math.max(...residential.map((m) => m.maxAreaM2));
    return site.areaM2 <= biggest ? residential : MOWERS.filter((m) => m.commercial);
  }
  if (site.kind === "sod") return MOWERS.filter((m) => m.line === "voyager");
  return MOWERS.filter((m) => m.commercial);
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
 * MasterSeries), sized on the fairways alone; the rest goes to whichever
 * robot suits it best, usually a Voyager. Both take the whole turf's layout
 * (its extra time is a ratio).
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
