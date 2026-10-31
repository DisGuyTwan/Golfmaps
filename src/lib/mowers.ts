/**
 * The Kress robots quoted and which one fits a property (site.ts). Specs are
 * Kress's North American listings (kress.com/en-us and en-ca) and dealer spec
 * sheets as of Oct 24, 2026; where they disagree the lower figure is used.
 * Kress publishes no minimum passage width, mowing speed or (for most models)
 * run time per charge, so `passageM`, `speedMS`, `turnS` and `runtimeMin` are
 * estimates (body size, typical RTK robots, battery size): they shape the
 * extra time a property costs (coverage.ts), not the rated areas.
 * Slope limits are what Kress dealers see in practice rather than the
 * listings (40 % for most models): only the EyePilot 4x4 robots hold slopes
 * over 20° (36 %), so every other model's limit is 36 % (the Voyager KR804's
 * 47 %, 25°, as Kress gives it).
 * The fit is on capability. List prices conflict between sources (and sales
 * run all season), so `listUsd` is only a rough order used to break ties
 * between robots that fit equally well, never shown.
 */
import { overhead, share, type Overhead, type Pace } from "./coverage";
import { robotRatio } from "./ground";
import type { MowEvery } from "./quote";
import { ROI_DEFAULTS, type Approach } from "./roi";
import type { Site } from "./site";
import type { TerrainStats } from "./terrain";
import { robotWindowShare, voyagerWindowShare, type MowWindow } from "./window";

export const MOWERS_AS_OF = "2026-10-24";

const ACRE_M2 = 4046.86;

export type MowerLine = "rtkn" | "eyepilot" | "eyepilot4x4" | "masterseries" | "voyager";

export interface Mower {
  id: string;
  line: MowerLine;
  /**
   * Kress's rated area (m²): mowed all over every 48 h for the robots (the
   * RTKn listings' larger "max" areas are for mowing less often, which the
   * mowing frequency covers); one charge (a day) for the Voyager.
   */
  areaM2: number;
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
  { ...RESIDENTIAL, id: "KR161", line: "rtkn", areaM2: ac(0.25), maxSlopePct: 36, cutWidthCm: 20, minCutMm: 40, runtimeMin: 50, avoidance: false, listUsd: 1500 },
  { ...RESIDENTIAL, id: "KR172", line: "rtkn", areaM2: ac(0.5), maxSlopePct: 36, cutWidthCm: 20, minCutMm: 40, runtimeMin: 60, avoidance: false, listUsd: 1700 },
  { ...RESIDENTIAL, id: "KR173", line: "rtkn", areaM2: ac(0.75), maxSlopePct: 36, cutWidthCm: 20, minCutMm: 40, runtimeMin: 70, listUsd: 2000 },
  { ...RESIDENTIAL, id: "KR174", line: "rtkn", areaM2: ac(1.2), maxSlopePct: 36, cutWidthCm: 22, minCutMm: 40, runtimeMin: 90, listUsd: 2700 },
  // EyePilot: camera plus RTK, ZeroTrim; the KR276 lists 130 min per charge (10 Ah).
  { ...EYEPILOT, id: "KR272", line: "eyepilot", areaM2: ac(0.5), maxSlopePct: 36, cutWidthCm: 22, minCutMm: 40, runtimeMin: 75, listUsd: 2500 },
  { ...EYEPILOT, id: "KR276", line: "eyepilot", areaM2: ac(1.5), maxSlopePct: 36, cutWidthCm: 24, minCutMm: 40, runtimeMin: 130, listUsd: 3600 },
  // EyePilot 4x4: four motors, slopes to 84 % (40°): the only ones for slopes over 20°.
  { ...EYEPILOT, id: "KR282", line: "eyepilot4x4", areaM2: ac(0.5), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, runtimeMin: 75, fourWheel: true, listUsd: 3000 },
  { ...EYEPILOT, id: "KR284", line: "eyepilot4x4", areaM2: ac(1), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, runtimeMin: 100, fourWheel: true, listUsd: 3600 },
  { ...EYEPILOT, id: "KR286", line: "eyepilot4x4", areaM2: ac(2.5), maxSlopePct: 84, cutWidthCm: 24, minCutMm: 40, runtimeMin: 130, fourWheel: true, listUsd: 4300 },
  // MasterSeries: 62 cm, cuts down to 10 mm (fairways), 2 h per charge, 1.5 m/s; 18 % slope at the boundary.
  { ...RESIDENTIAL, id: "KR238", line: "masterseries", areaM2: ac(20), maxSlopePct: 36, cutWidthCm: 62, minCutMm: 10, passageM: 1.5, speedMS: 1.5, turnS: 10, runtimeMin: 120, commercial: true, listUsd: 40000 },
  // Voyager: up to 7 or 19 acres (about 8 h) per charge at 5.6 mph. Slope: Kress gives 20° (about 36 %) for the KR800 and 25° (about 47 %) for the KR804.
  { ...RESIDENTIAL, id: "KR800", line: "voyager", areaM2: ac(7), maxSlopePct: 36, cutWidthCm: 102, minCutMm: 38, passageM: 2, speedMS: 2.5, turnS: 12, runtimeMin: 480, commercial: true, listUsd: 62000 },
  { ...RESIDENTIAL, id: "KR804", line: "voyager", areaM2: ac(19), maxSlopePct: 47, cutWidthCm: 152, minCutMm: 38, passageM: 2.5, speedMS: 2.5, turnS: 12, runtimeMin: 480, commercial: true, listUsd: 84000 },
];

/** The narrowest gap any of them gets through (m): a strip narrower than this is left to a trimmer (ground.ts). */
export const MIN_PASSAGE_M = Math.min(...MOWERS.map((m) => m.passageM));

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

/** How a commercial robot works: the KR238 cuts and stays on the property, a Voyager cuts and goes with the crew. */
export function approachOf(m: Mower): Approach | null {
  return m.line === "masterseries" ? "stay" : m.line === "voyager" ? "go" : null;
}

/** The ROI tab's Voyager preset for a recommended Voyager, if it is one. */
export function roiModel(m: Mower | undefined | null): "7" | "19" | null {
  return m?.id === "KR800" ? "7" : m?.id === "KR804" ? "19" : null;
}

/** How a robot works, for coverage.ts: its stripe is the cut width less about 15 % overlap (10 % for the Voyager deck). */
export function paceOf(m: Mower): Pace {
  return { stripeM: (m.cutWidthCm / 100) * (m.line === "voyager" ? 0.9 : 0.85), speedMS: m.speedMS, turnS: m.turnS, runtimeMin: m.runtimeMin };
}

/** Why a robot fits less well, or why it doesn't fit at all. */
export type FitNote =
  | "atLimit"
  | "tooSteep"
  | "slopeGrip"
  | "treesNoVision"
  | "noAvoidance"
  | "edgesNoZeroTrim"
  | "narrowPassage";

export interface Fit {
  mower: Mower;
  /** Units needed for the area at the chosen mowing frequency, each with its own zone and charger. */
  units: number;
  /** False when it can't do the job: parts of the site are past its slope limit. */
  fits: boolean;
  /** Lower is better. */
  penalty: number;
  notes: FitNote[];
  /** Extra time one unit's zone costs it (shapes, trees, driving) and its hours per mow, or null without a layout. */
  work: Overhead | null;
}

/**
 * Area one unit keeps mowed (m²). Robots are rated for mowing it all every
 * 48 h, so mowing every day halves it and every 3 days adds half. A Voyager
 * mows its rating per charge, one charge per mowing day (5 a week, the ROI
 * tab's default), shared among the week's mowings, so both tabs size the
 * same fleet. Only part of it when the robots may mow only at some hours or
 * on some days (window.ts).
 */
export function capacityM2(mower: Mower, everyDays: MowEvery = 2, opts: FitOptions = {}): number {
  const { window = null, calibration = {} } = opts;
  // Field checks: a robot that really takes longer than we predict keeps less mowed.
  const measured = 1 / (calibration[mower.id] ?? 1);
  return (
    measured *
    (mower.line === "voyager"
      ? ((mower.areaM2 * ROI_DEFAULTS.voyDaysPerWeek * everyDays) / 7) * voyagerWindowShare(window, mower.runtimeMin, ROI_DEFAULTS.voyDaysPerWeek)
      : ((mower.areaM2 * everyDays) / 2) * robotWindowShare(window, mower.runtimeMin))
  );
}

/**
 * What else sizes a fleet: when the robots may mow (window.ts) and, per
 * model, the time field checks measured over the time we predicted
 * (calibration.ts; 1 or missing until there are enough).
 */
export interface FitOptions {
  window?: MowWindow | null;
  calibration?: Record<string, number>;
}

/**
 * Steep ground past a robot's limit rules it out once it's more than a few
 * patches a trimmer can take: 2 % of the area, and at most TRIMMER_M2 (on a
 * big property 2 % is acres).
 */
const STEEP_SHARE = 0.02;
const TRIMMER_M2 = 250;
/** Home robots one lawn can get before the commercial ones are worth a look too. */
const MAX_LAWN_UNITS = 3;
/** A layout can't make a robot faster than about this much of its rating. */
const MIN_FACTOR = 0.9;
/** A unit working more than this share of its capacity is near its limit; a fleet of several is sized to stay under it. */
const LIMIT_LOAD = 0.9;

const tooMuch = (site: Site, steepShare: number) => steepShare > Math.min(STEEP_SHARE, TRIMMER_M2 / Math.max(1, site.areaM2));

/** Share of the site steeper than any robot can climb (40°), when it's more than a trimmer's few patches; 0 otherwise. */
function trimmerShare(site: Site): number {
  const t = site.terrain;
  return t && t.coverage >= 0.5 && tooMuch(site, t.over84) ? t.over84 : 0;
}

/**
 * The area a fleet must keep up with: the robots' part of the site on the
 * ground (ground.ts: slopes as real surface, less what no robot reaches),
 * else the quoted area less what's too steep for any robot. A share of the
 * site (its fairways, its rough) gets the same share of that.
 */
export function workM2(site: Site): number {
  return site.ground ? site.areaM2 * robotRatio(site.ground) : site.areaM2 * (1 - trimmerShare(site));
}

/** Share of the site steeper than a robot's slope limit (the LiDAR shares are at 36, 47 and 84 %). */
function overLimit(terrain: TerrainStats, limitPct: number): number {
  return limitPct >= 84 ? terrain.over84 : limitPct >= 47 ? terrain.over47 : limitPct >= 36 ? terrain.over36 : terrain.over25;
}

/**
 * How well one robot fits a site, mowing it all every `everyDays`. Each unit
 * has to keep up with its zone's area times the extra time that zone costs
 * it (turns, broken stripes, edges, trees, driving from its charger and
 * between areas), so a ragged lawn far from the charger can need the next
 * size up, and a big property gets as many units as it takes (each driving
 * only within its own zone). Ground steeper than any robot can climb is left
 * to a trimmer (trimmerShare).
 */
export function fitMower(site: Site, mower: Mower, everyDays: MowEvery = 2, opts: FitOptions = {}): Fit {
  const notes: FitNote[] = [];
  let fits = true;
  let penalty = 0;
  const { terrain, shape } = site;
  const pace = paceOf(mower);
  const capacity = capacityM2(mower, everyDays, opts);
  const left = site.ground ? site.ground.trim.steep / Math.max(1, site.ground.mapM2) : trimmerShare(site);
  const areaM2 = workM2(site);
  const zone = (units: number) => (site.coverage ? overhead(share(site.coverage, units), pace) : null);
  const load = (units: number) => (areaM2 * Math.max(MIN_FACTOR, zone(units)?.factor ?? 1)) / (units * capacity);
  // One unit if it keeps up; else the fewest that each stay under LIMIT_LOAD (more units, smaller zones, shorter
  // drives). Voyager fleets fill up like the ROI tab's, which sizes its own from the acres sent.
  const fleetLoad = mower.line === "voyager" ? 1 : LIMIT_LOAD;
  let units = 1;
  if (load(1) > 1) {
    let lo = 2, hi = Math.ceil((2 * load(1)) / fleetLoad) + 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (load(mid) <= fleetLoad) hi = mid;
      else lo = mid + 1;
    }
    units = lo;
  }
  const layout = zone(units);
  // The zone's extra time is a ratio; its hours are for the layout's own area (all the turf on a course), scaled to the quoted area.
  const work = layout && { ...layout, hours: (layout.hours * areaM2) / site.coverage!.areaM2 };

  if (load(units) > LIMIT_LOAD) {
    penalty += 1;
    notes.push("atLimit");
  }
  if (terrain && terrain.coverage >= 0.5) {
    // Ground past this robot's limit that a more capable one could mow.
    if (tooMuch(site, overLimit(terrain, mower.maxSlopePct) - left)) {
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
  const trees = terrain && terrain.coverage >= 0.5 ? terrain.trees : 0;
  if (shape) {
    if (shape.obstacles + trees >= 3 && !mower.avoidance) {
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

/**
 * The robots a recommendation chooses from for each kind of site. A lawn gets
 * home robots (several on a big one); past three of the biggest (at Kress's
 * every-2-days rating), the commercial ones are compared too. A sod farm gets
 * Voyagers; a golf course the commercial robots, or only those that work the
 * chosen way (cut and stay: the KR238; cut and go: the Voyagers). A
 * commercial or municipal site gets every robot: the ones that stay (home
 * robots in a fleet, or KR238s) or the Voyagers that come and go.
 */
function candidates(site: Site, approach: Approach | null = null): Mower[] {
  if (site.kind === "site") return MOWERS.filter((m) => !approach || (approach === "go") === (m.line === "voyager"));
  if (site.kind === "lawn") {
    const residential = MOWERS.filter((m) => !m.commercial);
    const biggest = Math.max(...residential.map((m) => m.areaM2));
    return site.areaM2 <= MAX_LAWN_UNITS * biggest ? residential : MOWERS;
  }
  if (site.kind === "sod") return MOWERS.filter((m) => m.line === "voyager");
  return MOWERS.filter((m) => m.commercial && (!approach || approachOf(m) === approach));
}

export interface Recommendation {
  /** The robot for the job; on a golf quote with fairways, the one for the fairways. */
  best: Fit | null;
  runnerUp: Fit | null;
  /** Golf with fairways: the robot for the rest of the turf (rough, range). */
  rough: Fit | null;
  /** Every candidate for `best`, best first. */
  fits: Fit[];
  /** Share of the site steeper than any robot climbs, left to a trimmer (0 when it's only a few patches). */
  trimmed: number;
}

/** Fits first, then the fewest drawbacks, then the lowest outlay. */
const rank = (a: Fit, b: Fit) => Number(b.fits) - Number(a.fits) || a.penalty - b.penalty || a.mower.listUsd * a.units - b.mower.listUsd * b.units;

/** A lowest cut fine enough for fairways (10-15 mm). */
const FAIRWAY_CUT_MM = 15;

/**
 * The best robot for a site and the next best, with why. A golf quote with
 * fairways is two jobs: the fairways need a robot that cuts 10-15 mm (the
 * MasterSeries), sized on the fairways alone; the rest goes to whichever
 * robot suits it best (of those working the `approach` way, if given). Both
 * take the whole turf's layout (its extra time is a ratio).
 */
export function recommend(site: Site, everyDays: MowEvery = 2, approach: Approach | null = null, opts: FitOptions = {}): Recommendation {
  const trimmed = trimmerShare(site);
  if (site.areaM2 <= 0) return { best: null, runnerUp: null, rough: null, fits: [], trimmed: 0 };
  if (site.kind === "golf" && site.fairwayM2 > 0) {
    const fairways: Site = { ...site, areaM2: site.fairwayM2 };
    const fits = candidates(site)
      .filter((m) => m.minCutMm <= FAIRWAY_CUT_MM)
      .map((m) => fitMower(fairways, m, everyDays, opts))
      .sort(rank);
    const ok = fits.filter((f) => f.fits);
    const restM2 = site.areaM2 - site.fairwayM2;
    const rest: Site = { ...site, areaM2: restM2, fairwayM2: 0 };
    const rough =
      restM2 > 0 ? (candidates(rest, approach).map((m) => fitMower(rest, m, everyDays, opts)).filter((f) => f.fits).sort(rank)[0] ?? null) : null;
    return { best: ok[0] ?? null, runnerUp: ok[1] ?? null, rough, fits, trimmed };
  }
  const fits = candidates(site, approach).map((m) => fitMower(site, m, everyDays, opts)).sort(rank);
  const ok = fits.filter((f) => f.fits);
  return { best: ok[0] ?? null, runnerUp: ok[1] ?? null, rough: null, fits, trimmed };
}

/** The robots that mow the whole site, or (golf with fairways) everything but the fairways. */
export const mainFleet = (r: Recommendation): Fit | null => r.rough ?? r.best;

export interface Approaches {
  stay: Recommendation;
  go: Recommendation;
  /** Shown until the rep picks: cut and stay when the KR238 can mow it all, else cut and go. */
  suggested: Approach;
}

/**
 * A golf course both ways, for the rep to pick: cut and stay (KR238s) and
 * cut and go (Voyagers; the fairways still go to KR238s, the only robot that
 * cuts that low). Cut and stay is suggested whenever it fits: the KR238 is
 * the robot made to stay on a course, while a Voyager's fleet is sized for
 * a crew moving it around.
 */
export function recommendBoth(site: Site, everyDays: MowEvery = 2, opts: FitOptions = {}): Approaches {
  const stay = recommend(site, everyDays, "stay", opts);
  const go = recommend(site, everyDays, "go", opts);
  return { stay, go, suggested: mainFleet(stay) || !mainFleet(go) ? "stay" : "go" };
}
