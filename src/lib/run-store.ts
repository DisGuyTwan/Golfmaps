"use client";

import { useSyncExternalStore } from "react";
import { pointInGeometry } from "./landcover";
import { lawnTotals, type LawnMeasurement, type LawnTotals } from "./lawn";
import { beginStep, endStep, type LiveStep } from "./live";
import { measureLot } from "./lot-lookups";
import { bboxParam, fetchFairways } from "./overpass";
import { reportError } from "./report-error";
import { buildRoadGraph, roadBoxes, routeFrom, snapPlaces, type RoadGraph, type RoadLeg } from "./roads";
import { DEFAULT_RUN, MAX_STOPS, stopSite, type RunLink, type RunSettings, type StopSite } from "./run";
import type { TerrainGrid } from "./terrain";

/**
 * A grass run being planned on the Acreage tab, outside React so the panel,
 * the map and the PDF share it: the stops (each measured like a lawn, a few
 * at a time, with its own live list of what's loading), the shop the day
 * starts and ends at, the run's settings, and the roads between them
 * (OpenStreetMap's, routed in roads.ts once the stops are measured).
 */

export interface RunStop {
  id: number;
  /** Where it was tapped or found, [lat, lon]. */
  point: [number, number];
  /** The address searched (else the stop goes by its lot number, once found). */
  label: string | null;
  /** waiting: queued behind other stops; noLot: no cadastre lot there; failed: the cadastre didn't answer. */
  state: "waiting" | "measuring" | "done" | "noLot" | "failed";
  lawn: LawnMeasurement | null;
  terrain: TerrainGrid | null;
  live: LiveStep[];
}

export interface RunPlace {
  point: [number, number];
  label: string | null;
}

/** The roads between a run's places. */
export interface RunRoads {
  /**
   * idle: fewer than two places; loading: reading or routing; ready: `legs`
   * hold the routes; failed: the roads didn't load; tooFar: the run is spread
   * wider than one road lookup. Without routes, driving is the straight line.
   */
  state: "idle" | "loading" | "ready" | "failed" | "tooFar";
  /** Each leg on the roads by its two places (legKey), null where the roads don't join them. */
  legs: Map<string, RoadLeg | null>;
  live: LiveStep[];
}

interface RunState {
  open: boolean;
  stops: RunStop[];
  shop: RunPlace | null;
  settings: RunSettings;
  /** The next tap or search sets the shop rather than adding a stop. */
  pickingShop: boolean;
  roads: RunRoads;
}

const NO_ROADS: RunRoads = { state: "idle", legs: new Map(), live: [] };
const EMPTY: RunState = { open: false, stops: [], shop: null, settings: DEFAULT_RUN, pickingShop: false, roads: NO_ROADS };
/** Stops measured at once: each asks OpenStreetMap, the LiDAR and the photos, and the Overpass mirrors limit each address. */
const AT_ONCE = 2;

let state: RunState = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function update(patch: Partial<RunState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function updateStop(id: number, patch: Partial<RunStop> | ((stop: RunStop) => Partial<RunStop>)) {
  if (!state.stops.some((s) => s.id === id)) return; // Removed meanwhile.
  update({ stops: state.stops.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)) });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export const useRun = () => useSyncExternalStore(subscribe, () => state, () => EMPTY);
export const getRun = () => state;

/** Measures the next stops in line, AT_ONCE at a time. */
function pump() {
  let busy = state.stops.filter((s) => s.state === "measuring").length;
  for (const stop of state.stops) {
    if (busy >= AT_ONCE) return;
    if (stop.state !== "waiting") continue;
    busy++;
    void measure(stop);
  }
}

async function measure(stop: RunStop) {
  const { id } = stop;
  updateStop(id, { state: "measuring", live: [] });
  const track = (source: LiveStep["source"], area: Parameters<typeof beginStep>[2] = null) => {
    updateStop(id, (s) => ({ live: beginStep(s.live, source, area, Date.now()) }));
    return (result: "done" | "failed", found: LiveStep["found"] = null) =>
      updateStop(id, (s) => ({ live: endStep(s.live, source, result, found, Date.now()) }));
  };
  try {
    const measured = await measureLot(stop.point[0], stop.point[1], track, (lawn, terrain) => updateStop(id, { lawn, terrain }));
    updateStop(id, measured ? { state: "done", lawn: measured.lawn, terrain: measured.terrain } : { state: "noLot" });
  } catch (err) {
    reportError("run:lot", err);
    updateStop(id, { state: "failed" });
  }
  pump();
  scheduleRoads();
}

/** Opens the run planner; with a share link's run, or the lawn on screen as the first stop. */
export function openRun(link?: RunLink | null, first?: { lawn: LawnMeasurement; terrain: TerrainGrid | null; label: string | null }) {
  if (link) {
    update({
      open: true,
      pickingShop: false,
      settings: link.settings,
      shop: link.shop,
      stops: link.stops.map(({ point, label }) => ({ id: nextId++, point, label, state: "waiting", lawn: null, terrain: null, live: [] })),
      roads: NO_ROADS,
    });
    routedKey = "";
    pump();
    return;
  }
  update({ open: true, pickingShop: false });
  if (first && first.lawn.pickPoint && !stopAt(first.lawn.pickPoint)) {
    update({
      stops: [
        ...state.stops,
        { id: nextId++, point: first.lawn.pickPoint, label: first.label, state: "done", lawn: first.lawn, terrain: first.terrain, live: [] },
      ],
    });
    scheduleRoads();
  }
}

/** Back to measuring one property; the run stays for when it's opened again. */
export function closeRun() {
  update({ open: false, pickingShop: false });
}

export function clearRun() {
  roadsRun++;
  routedKey = "";
  update({ stops: [], shop: null, pickingShop: false, roads: NO_ROADS });
}

/** The stop whose lot (or point, while it loads) is at a point. */
function stopAt([lat, lon]: [number, number]): RunStop | undefined {
  return state.stops.find(
    (s) => (s.lawn && pointInGeometry(lon, lat, s.lawn.lot)) || (Math.abs(s.point[0] - lat) < 1e-5 && Math.abs(s.point[1] - lon) < 1e-5),
  );
}

/** Adds a stop at a point (tapped or searched) and measures it; says why not when it's already in or the run is full. */
export function addStop(point: [number, number], label: string | null = null): "added" | "already" | "full" {
  if (stopAt(point)) return "already";
  if (state.stops.length >= MAX_STOPS) return "full";
  update({ stops: [...state.stops, { id: nextId++, point, label, state: "waiting", lawn: null, terrain: null, live: [] }] });
  pump();
  return "added";
}

export function removeStop(id: number) {
  update({ stops: state.stops.filter((s) => s.id !== id) });
  pump();
  scheduleRoads();
}

/** Tries a stop that failed again. */
export function retryStop(id: number) {
  updateStop(id, { state: "waiting", lawn: null, terrain: null, live: [] });
  pump();
}

export function setShop(shop: RunPlace | null) {
  update({ shop, pickingShop: false });
  scheduleRoads();
}

export function setPickingShop(pickingShop: boolean) {
  update({ pickingShop });
}

export function setRunSettings(patch: Partial<RunSettings>) {
  update({ settings: { ...state.settings, ...patch } });
}

// A stop's totals and layout are worth computing once per lawn (turf unions, stripes), not on every render.
const totalsCache = new WeakMap<LawnMeasurement, LawnTotals>();
const siteCache = new WeakMap<LawnMeasurement, { terrain: TerrainGrid | null; site: StopSite | null }>();

export function stopTotals(lawn: LawnMeasurement): LawnTotals {
  let totals = totalsCache.get(lawn);
  if (!totals) totalsCache.set(lawn, (totals = lawnTotals(lawn)));
  return totals;
}

/** What a measured stop is for the run (null until it's measured, or with no lawn). */
export function stopSiteOf(stop: RunStop): StopSite | null {
  if (stop.state !== "done" || !stop.lawn) return null;
  const cached = siteCache.get(stop.lawn);
  if (cached && cached.terrain === stop.terrain) return cached.site;
  const site = stopSite(stop.lawn, stop.terrain, stopTotals(stop.lawn));
  siteCache.set(stop.lawn, { terrain: stop.terrain, site });
  return site;
}

// ---- The roads between the places ----

/** A leg's key: its two places, rounded like a share link (5 decimals). */
export const legKey = (a: [number, number], b: [number, number]) =>
  `${a[0].toFixed(5)},${a[1].toFixed(5)}>${b[0].toFixed(5)},${b[1].toFixed(5)}`;

/** The places routed between: the shop and every stop measured. */
const routedPlaces = (): [number, number][] => [
  ...(state.shop ? [state.shop.point] : []),
  ...state.stops.filter((s) => s.state === "done").map((s) => s.point),
];

/** Overpass answers by box, kept for the session (a box that failed is dropped, to try again). */
const roadAnswers = new Map<string, Promise<unknown>>();
/** Main-road boxes loaded so far: a run that grows within one is routed on it, not read again. */
const roadBoxesRead: Parameters<typeof bboxParam>[0][] = [];
const holds = (outer: Parameters<typeof bboxParam>[0], inner: Parameters<typeof bboxParam>[0]) =>
  outer.south <= inner.south && outer.west <= inner.west && outer.north >= inner.north && outer.east >= inner.east;
function roadAnswer(kind: "roads" | "streets", box: Parameters<typeof bboxParam>[0]): Promise<unknown> {
  const key = `${kind}:${bboxParam(box)}`;
  let answer = roadAnswers.get(key);
  if (!answer) {
    answer = fetchFairways(box, kind);
    roadAnswers.set(key, answer);
    answer.catch(() => roadAnswers.delete(key));
  }
  return answer;
}

/** The last graph built, by the boxes it came from. */
let graph: { key: string; graph: RoadGraph } | null = null;
/** Bumped by every new routing, so a late one never lands on a newer one. */
let roadsRun = 0;
let roadsTimer: ReturnType<typeof setTimeout> | undefined;
/** Places routed last, so a change elsewhere (a name, a setting) doesn't route again. */
let routedKey = "";

/**
 * Routes the run again a moment after its places change (stops measured,
 * removed, the shop moved), once no stop is still being measured: the roads
 * are read for the whole run at once, not again after each stop.
 */
function scheduleRoads() {
  clearTimeout(roadsTimer);
  if (state.stops.some((s) => s.state === "waiting" || s.state === "measuring")) return;
  roadsTimer = setTimeout(() => void loadRoads(), 600);
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadRoads() {
  const places = routedPlaces();
  const key = places.map((p) => legKey(p, p)).join("|");
  if (key === routedKey && state.roads.state !== "failed") return;
  routedKey = key;
  const run = ++roadsRun;
  if (places.length < 2) return update({ roads: NO_ROADS });
  const boxes = roadBoxes(places);
  if (!boxes.roads) return update({ roads: { state: "tooFar", legs: new Map(), live: [] } });
  const needed = boxes.roads;
  boxes.roads = roadBoxesRead.find((box) => holds(box, needed)) ?? needed;

  const area = boxes.roads;
  const live = beginStep([], "roads", area, Date.now());
  update({ roads: { ...state.roads, state: "loading", live } });
  const finish = (patch: Partial<RunRoads>, result: "done" | "failed", found: LiveStep["found"] = null) => {
    if (run !== roadsRun) return;
    update({ roads: { ...state.roads, ...patch, live: endStep(state.roads.live, "roads", result, found, Date.now()) } });
  };
  try {
    // The main roads must load; a neighbourhood's streets that don't only leave its stops to the straight line.
    const parts = [{ kind: "roads" as const, box: boxes.roads }, ...boxes.streets.map((box) => ({ kind: "streets" as const, box }))];
    const graphKey = parts.map((p) => `${p.kind}:${bboxParam(p.box)}`).join("|");
    if (graph?.key !== graphKey) {
      const [main, ...streets] = await Promise.all(parts.map((p, i) => (i === 0 ? roadAnswer(p.kind, p.box) : roadAnswer(p.kind, p.box).catch(() => null))));
      if (!roadBoxesRead.includes(boxes.roads)) roadBoxesRead.push(boxes.roads);
      if (run !== roadsRun) return;
      await pause();
      graph = { key: graphKey, graph: buildRoadGraph(main, ...streets) };
    }
    const g = graph.graph;
    const snapped = snapPlaces(g, places);
    const legs = new Map<string, RoadLeg | null>();
    for (let i = 0; i < places.length; i++) {
      await pause(); // One place at a time, so the page stays responsive.
      if (run !== roadsRun) return;
      routeFrom(g, places, snapped, i).forEach((leg, j) => {
        if (j !== i) legs.set(legKey(places[i], places[j]), leg);
      });
    }
    finish({ state: "ready", legs }, "done", { kind: "roads", places: places.length });
  } catch (err) {
    reportError("run:roads", err);
    routedKey = "";
    finish({ state: "failed", legs: new Map() }, "failed");
  }
}

/** Tries the roads again after they failed to load. */
export function retryRoads() {
  routedKey = "";
  void loadRoads();
}
