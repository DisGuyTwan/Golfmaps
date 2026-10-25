/**
 * A grass run: a crew's day of cut-and-go stops. At each stop the crew parks
 * and unloads the Voyager, it mows while they trim and blow, and they load it
 * back: a stop takes that set-up plus whichever is longer, the mowing or the
 * crew's work shared among them. Between stops the truck drives. Time on site
 * doesn't depend on the order, so the order is the one with the least
 * driving, from the shop and back when there is one.
 *
 * Crew rates are SingleOps' landscape production rates: string trimming
 * 1,500 ft of edge an hour and about 60 obstacles (trees) an hour, a backpack
 * blower 25,000 sq ft an hour over a 3 ft strip along the hard edges. Mowing
 * is the mower fit's full-mow time for the Voyager (coverage.ts: stripes,
 * turns, edges, trees, driving on the lot). Driving is the fastest route on
 * OpenStreetMap's roads (roads.ts) once they've loaded, given as a DriveFn;
 * until then, or where a stop has no road, the straight line × ROAD_FACTOR
 * at an average speed.
 * Pure, so the timing and the routing are tested without a browser.
 */
import { lawnEdges, lawnTotals, photoAreas, SQ_M_TO_SQ_FT, type LawnMeasurement } from "./lawn";
import { MOWERS, fitMower, paceOf, type Fit, type FitNote } from "./mowers";
import { overhead } from "./coverage";
import { HOURS_PER_WORKDAY, VOYAGER_PRESETS } from "./roi";
import { decodePolyline, encodePolyline } from "./share";
import { lawnSite, type Site } from "./site";
import type { TerrainGrid } from "./terrain";

export type RunVoyager = "KR800" | "KR804";
export const RUN_VOYAGERS: RunVoyager[] = ["KR800", "KR804"];

/** String trimming along edges (ft an hour) and around obstacles (an hour), per person. */
export const TRIM_FT_PER_H = 1500;
export const OBSTACLES_PER_H = 60;
/** A backpack blower (sq ft an hour), over a strip this wide along the hard edges (ft). */
export const BLOW_SQFT_PER_H = 25000;
export const BLOW_STRIP_FT = 3;
/** Roads run about this much longer than the straight line between two stops in town. */
export const ROAD_FACTOR = 1.3;
/** Most stops the run plans (and the exact order search's limit). */
export const MAX_STOPS = 25;
const EXACT_MAX = 12;

const FT_PER_M = 3.28084;
const ACRE_M2 = 4046.86;

export interface RunSettings {
  voyager: RunVoyager;
  /** People trimming and blowing while the Voyager mows. */
  crew: number;
  /** Average driving speed between stops (km/h). */
  speedKmh: number;
  /** Minutes per stop to park, unload the Voyager, start it and load it back. */
  setupMin: number;
  /** Start of the day, in minutes after midnight. */
  startMin: number;
}

export const DEFAULT_RUN: RunSettings = { voyager: "KR800", crew: 2, speedKmh: 35, setupMin: 10, startMin: 7 * 60 + 30 };
export const CREW_SIZES = [1, 2, 3];

/** What a stop's lawn is for a run: its layout for the Voyager, and what the crew trims and blows. */
export interface StopSite {
  site: Site;
  lawnM2: number;
  /** Lawn edges trimmed, and those along paving blown clear (m). */
  edgeM: number;
  hardEdgeM: number;
  /** Trees on the lawn (LiDAR crowns): trimmed around. */
  trees: number;
}

/** The lawn at a stop, measured like a residential lot (lawn.ts), with the terrain under it when there's LiDAR. */
export function stopSite(lawn: LawnMeasurement, terrain: TerrainGrid | null, totals = lawnTotals(lawn)): StopSite | null {
  const lawnM2 = totals.lawnSqft / SQ_M_TO_SQ_FT;
  if (!(lawnM2 > 0)) return null;
  const blocked = [...(lawn.mapped ?? []), ...(lawn.lidar ?? []), ...photoAreas(lawn).removed]
    .filter((a) => a.kind !== "paving")
    .map((a) => a.geometry);
  const site = lawnSite(totals.lawn, lawn.lot, blocked, null, lawnM2, terrain);
  const { edgeM, hardEdgeM } = lawnEdges(totals);
  const trees = site.terrain && site.terrain.coverage >= 0.5 ? site.terrain.trees : 0;
  return { site, lawnM2, edgeM, hardEdgeM, trees };
}

export interface StopWork {
  /** Minutes for the Voyager to mow it all, and for one person to trim and to blow. */
  mowMin: number;
  trimMin: number;
  blowMin: number;
  /** False when the Voyager can't mow it (too steep); `notes` say what to check on site. */
  fits: boolean;
  notes: FitNote[];
}

const voyagerOf = (id: RunVoyager) => MOWERS.find((m) => m.id === id)!;

/** What one stop takes: the Voyager's full mow (one unit, however big), and the crew's trimming and blowing. */
export function stopWork(s: StopSite, voyager: RunVoyager): StopWork {
  const mower = voyagerOf(voyager);
  const pace = paceOf(mower);
  const c = s.site.coverage;
  const mowH = c ? (overhead(c, pace).hours * s.lawnM2) / c.areaM2 : s.lawnM2 / (pace.stripeM * pace.speedMS) / 3600;
  const fit: Fit = fitMower(s.site, mower);
  const trimMin = ((s.edgeM * FT_PER_M) / TRIM_FT_PER_H + s.trees / OBSTACLES_PER_H) * 60;
  const blowMin = ((s.hardEdgeM * FT_PER_M * BLOW_STRIP_FT) / BLOW_SQFT_PER_H) * 60;
  // A fleet's notes (near its limit) don't apply: one Voyager mows each stop in turn.
  const notes = fit.notes.filter((n) => n !== "atLimit");
  return { mowMin: mowH * 60, trimMin, blowMin, fits: fit.fits, notes };
}

/** Straight-line distance between two [lat, lon] points (km). */
export function distanceKm([lat0, lon0]: [number, number], [lat1, lon1]: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (lat1 - lat0) * rad;
  const dLon = (lon1 - lon0) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat0 * rad) * Math.cos(lat1 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Minutes of driving between two points, by road, at an average speed. */
export function driveMin(a: [number, number], b: [number, number], speedKmh: number): number {
  return speedKmh > 0 ? ((distanceKm(a, b) * ROAD_FACTOR) / speedKmh) * 60 : 0;
}

/** The shop, among the run's places (stops are their indexes). */
export const SHOP = -1;
/** Minutes of driving from one of the run's places to another (a stop's index, or SHOP). */
export type DriveFn = (from: number, to: number) => number;

/** Driving estimated from the straight line (driveMin): before the roads load, or where a stop has none. */
export function straightDrive(points: [number, number][], shop: [number, number] | null, speedKmh: number): DriveFn {
  const at = (i: number) => (i === SHOP ? shop! : points[i]);
  return (a, b) => driveMin(at(a), at(b), speedKmh);
}

/** Length of a route through `order` (cost between stops, from and to the shop: 0 without one). */
function routeCost(order: number[], cost: (i: number, j: number) => number, from: (j: number) => number, to: (i: number) => number) {
  if (!order.length) return 0;
  let total = from(order[0]) + to(order[order.length - 1]);
  for (let k = 1; k < order.length; k++) total += cost(order[k - 1], order[k]);
  return total;
}

/**
 * The order of `n` stops with the least driving: from the shop and back
 * (`from`, `to`), or with no shop (both 0) the shortest path through them
 * all, from whichever end. Exact (Held-Karp) up to 12 stops; past that,
 * nearest neighbour improved by 2-opt.
 */
export function bestOrder(
  n: number,
  cost: (i: number, j: number) => number,
  from: (j: number) => number = () => 0,
  to: (i: number) => number = () => 0,
): number[] {
  if (n <= 1) return n ? [0] : [];
  if (n <= EXACT_MAX) {
    const full = (1 << n) - 1;
    const dp = new Float64Array((full + 1) * n).fill(Infinity);
    const parent = new Int8Array((full + 1) * n).fill(-1);
    for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = from(j);
    for (let mask = 1; mask <= full; mask++) {
      for (let j = 0; j < n; j++) {
        const here = dp[mask * n + j];
        if (!(mask & (1 << j)) || here === Infinity) continue;
        for (let k = 0; k < n; k++) {
          if (mask & (1 << k)) continue;
          const next = mask | (1 << k);
          const c = here + cost(j, k);
          if (c < dp[next * n + k]) {
            dp[next * n + k] = c;
            parent[next * n + k] = j;
          }
        }
      }
    }
    let last = 0;
    for (let j = 1; j < n; j++) if (dp[full * n + j] + to(j) < dp[full * n + last] + to(last)) last = j;
    const order: number[] = [];
    for (let mask = full, j = last; j >= 0; ) {
      order.push(j);
      const p = parent[mask * n + j];
      mask &= ~(1 << j);
      j = p;
    }
    return order.reverse();
  }
  // Nearest neighbour from the shop (or the stop nearest any other, with none)…
  const left = new Set(Array.from({ length: n }, (_, i) => i));
  const order: number[] = [];
  let at = -1;
  while (left.size) {
    let best = -1;
    let bestC = Infinity;
    for (const k of left) {
      const c = at < 0 ? from(k) : cost(at, k);
      if (c < bestC) {
        bestC = c;
        best = k;
      }
    }
    order.push(best);
    left.delete(best);
    at = best;
  }
  // …then 2-opt: reverse any stretch that shortens the route, until none does.
  let improved = true;
  let current = routeCost(order, cost, from, to);
  while (improved) {
    improved = false;
    for (let a = 0; a < n - 1; a++) {
      for (let b = a + 1; b < n; b++) {
        const trial = [...order.slice(0, a), ...order.slice(a, b + 1).reverse(), ...order.slice(b + 1)];
        const c = routeCost(trial, cost, from, to);
        if (c < current - 1e-9) {
          order.splice(0, n, ...trial);
          current = c;
          improved = true;
        }
      }
    }
  }
  return order;
}

export interface PlannedStop {
  /** Index of the stop in the list as entered. */
  index: number;
  /** Driving to it, from the shop or the stop before (min). */
  driveMin: number;
  arriveMin: number;
  leaveMin: number;
  mowMin: number;
  /** The crew's trimming and blowing, shared among them (min). */
  crewMin: number;
  /** Who waits for whom: the crew for the Voyager, or the Voyager (loaded) for the crew (min). */
  crewWaitMin: number;
  mowerWaitMin: number;
}

export interface RunPlan {
  stops: PlannedStop[];
  /** Driving back to the shop at the end (0 without one). */
  returnMin: number;
  driveMin: number;
  /** Driving in the order the stops were entered, to show what the order saves. */
  enteredDriveMin: number;
  onSiteMin: number;
  totalMin: number;
  endMin: number;
  crewWaitMin: number;
  mowerWaitMin: number;
  /** Lawn mowed in the day (acres), against what the Voyager mows on one charge. */
  acres: number;
  chargeAcres: number;
}

/**
 * The best order through the stops at `ready` (stop indexes), from the shop
 * and back when there is one, for the driving `drive` gives. It doesn't
 * depend on the Voyager or the crew: worked out once, it serves every choice
 * the panel compares.
 */
export function runOrder(ready: number[], hasShop: boolean, drive: DriveFn): number[] {
  const cost = (a: number, b: number) => drive(ready[a], ready[b]);
  const from = (j: number) => (hasShop ? drive(SHOP, ready[j]) : 0);
  const to = (i: number) => (hasShop ? drive(ready[i], SHOP) : 0);
  return bestOrder(ready.length, cost, from, to).map((k) => ready[k]);
}

/** Stops whose work is measured (null while measuring, or with no lawn: left out). */
export const readyStops = (works: (StopWork | null)[]) => works.map((_, i) => i).filter((i) => works[i] !== null);

/**
 * The day for stops at `points` ([lat, lon]) that have their work measured
 * (`works`), from `shop` and back when there is one, driving as `drive` says
 * (the roads, else the straight line at the set speed), in the best order
 * (`order`, from runOrder, or worked out here).
 */
export function planRun(
  points: [number, number][],
  works: (StopWork | null)[],
  lawnM2: number[],
  shop: [number, number] | null,
  s: RunSettings,
  { order, drive = straightDrive(points, shop, s.speedKmh) }: { order?: number[]; drive?: DriveFn } = {},
): RunPlan {
  const ready = readyStops(works);
  const cost = (a: number, b: number) => drive(ready[a], ready[b]);
  const from = (j: number) => (shop ? drive(SHOP, ready[j]) : 0);
  const to = (i: number) => (shop ? drive(ready[i], SHOP) : 0);
  const best = order ?? runOrder(ready, shop !== null, drive);
  const crew = Math.max(1, s.crew);
  let clock = s.startMin;
  let prev: number | null = shop ? SHOP : null;
  const stops: PlannedStop[] = best.map((index) => {
    const w = works[index]!;
    const driven = prev === null ? 0 : drive(prev, index);
    const crewMin = (w.trimMin + w.blowMin) / crew;
    const arriveMin = clock + driven;
    const leaveMin = arriveMin + s.setupMin + Math.max(w.mowMin, crewMin);
    clock = leaveMin;
    prev = index;
    return {
      index,
      driveMin: driven,
      arriveMin,
      leaveMin,
      mowMin: w.mowMin,
      crewMin,
      crewWaitMin: Math.max(0, w.mowMin - crewMin),
      mowerWaitMin: Math.max(0, crewMin - w.mowMin),
    };
  });
  const returnMin = shop && prev !== null && prev !== SHOP ? drive(prev, SHOP) : 0;
  const sum = (f: (p: PlannedStop) => number) => stops.reduce((t, p) => t + f(p), 0);
  const driveTotal = sum((p) => p.driveMin) + returnMin;
  const entered = routeCost(
    ready.map((_, k) => k),
    cost,
    from,
    to,
  );
  const onSite = sum((p) => p.leaveMin - p.arriveMin);
  return {
    stops,
    returnMin,
    driveMin: driveTotal,
    enteredDriveMin: entered,
    onSiteMin: onSite,
    totalMin: driveTotal + onSite,
    endMin: clock + returnMin,
    crewWaitMin: sum((p) => p.crewWaitMin),
    mowerWaitMin: sum((p) => p.mowerWaitMin),
    acres: ready.reduce((t, i) => t + lawnM2[i], 0) / ACRE_M2,
    chargeAcres: VOYAGER_PRESETS[s.voyager === "KR800" ? "7" : "19"].voyAcresPerDay,
  };
}

/** True when the day is longer than a workday (8 h, like the ROI tab's). */
export const overWorkday = (plan: RunPlan) => plan.totalMin > HOURS_PER_WORKDAY * 60;

export interface RunLink {
  stops: { point: [number, number]; label: string | null }[];
  shop: { point: [number, number]; label: string | null } | null;
  settings: RunSettings;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/**
 * Share-link parameters: a=run, rs the stops (polyline), rn their names
 * ("|"-separated), rh the shop ("lat,lon") and rhn its name, rv the Voyager,
 * rc the crew, rk the speed, ru the set-up minutes, rt the start ("07:30").
 */
export function encodeRun(run: RunLink): Record<string, string | undefined> {
  const s = run.settings;
  const d = DEFAULT_RUN;
  return {
    a: "run",
    rs: run.stops.length ? encodePolyline(run.stops.map((p) => p.point)) : undefined,
    rn: run.stops.some((p) => p.label) ? run.stops.map((p) => (p.label ?? "").replaceAll("|", "/")).join("|") : undefined,
    rh: run.shop ? `${run.shop.point[0].toFixed(5)},${run.shop.point[1].toFixed(5)}` : undefined,
    rhn: run.shop?.label ?? undefined,
    rv: s.voyager !== d.voyager ? s.voyager.slice(2) : undefined,
    rc: s.crew !== d.crew ? String(s.crew) : undefined,
    rk: s.speedKmh !== d.speedKmh ? String(s.speedKmh) : undefined,
    ru: s.setupMin !== d.setupMin ? String(s.setupMin) : undefined,
    rt: s.startMin !== d.startMin ? hhmm(s.startMin) : undefined,
  };
}

export function decodeRun(params: URLSearchParams): RunLink | null {
  if (params.get("a") !== "run") return null;
  const points = (decodePolyline(params.get("rs") ?? "") ?? []).slice(0, MAX_STOPS);
  const names = (params.get("rn") ?? "").split("|");
  const [lat, lon] = (params.get("rh") ?? "").split(",").map(Number);
  const num = (key: string, min: number, max: number, fallback: number) => {
    const n = Number(params.get(key));
    return params.has(key) && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const [h, m] = (params.get("rt") ?? "").split(":").map(Number);
  const d = DEFAULT_RUN;
  return {
    stops: points.map((point, i) => ({ point, label: names[i] || null })),
    shop: params.get("rh") && Number.isFinite(lat) && Number.isFinite(lon) ? { point: [lat, lon], label: params.get("rhn") || null } : null,
    settings: {
      voyager: params.get("rv") === "804" ? "KR804" : "KR800",
      crew: Math.round(num("rc", 1, 3, d.crew)),
      speedKmh: num("rk", 5, 100, d.speedKmh),
      setupMin: num("ru", 0, 60, d.setupMin),
      startMin: Number.isFinite(h) && Number.isFinite(m) && params.has("rt") ? Math.min(23 * 60 + 59, Math.max(0, h * 60 + m)) : d.startMin,
    },
  };
}

/** Google Maps takes an origin, a destination and up to this many stops between in one link. */
const DIRECTIONS_WAYPOINTS = 9;

/**
 * Turn-by-turn directions for the crew: Google Maps links through the places
 * in the run's order ([lat, lon], the shop first and last when there is
 * one), several when there are more stops than one link takes (each part
 * starts where the last ended). A link out, not an API: nothing is fetched.
 */
export function directionsLinks(route: [number, number][]): string[] {
  const at = ([lat, lon]: [number, number]) => `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const links: string[] = [];
  for (let first = 0; first < route.length - 1; first += DIRECTIONS_WAYPOINTS + 1) {
    const part = route.slice(first, first + DIRECTIONS_WAYPOINTS + 2);
    const params = new URLSearchParams({ api: "1", origin: at(part[0]), destination: at(part[part.length - 1]), travelmode: "driving" });
    if (part.length > 2) params.set("waypoints", part.slice(1, -1).map(at).join("|"));
    links.push(`https://www.google.com/maps/dir/?${params}`);
  }
  return links;
}
