"use client";

import { useSyncExternalStore } from "react";
import { pointInGeometry } from "./landcover";
import { lawnTotals, type LawnMeasurement, type LawnTotals } from "./lawn";
import { beginStep, endStep, type LiveStep } from "./live";
import { measureLot } from "./lot-lookups";
import { reportError } from "./report-error";
import { DEFAULT_RUN, MAX_STOPS, stopSite, type RunLink, type RunSettings, type StopSite } from "./run";
import type { TerrainGrid } from "./terrain";

/**
 * A grass run being planned on the Acreage tab, outside React so the panel,
 * the map and the PDF share it: the stops (each measured like a lawn, a few
 * at a time, with its own live list of what's loading), the shop the day
 * starts and ends at, and the run's settings.
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

interface RunState {
  open: boolean;
  stops: RunStop[];
  shop: RunPlace | null;
  settings: RunSettings;
  /** The next tap or search sets the shop rather than adding a stop. */
  pickingShop: boolean;
}

const EMPTY: RunState = { open: false, stops: [], shop: null, settings: DEFAULT_RUN, pickingShop: false };
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
    });
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
  }
}

/** Back to measuring one property; the run stays for when it's opened again. */
export function closeRun() {
  update({ open: false, pickingShop: false });
}

export function clearRun() {
  update({ stops: [], shop: null, pickingShop: false });
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
}

/** Tries a stop that failed again. */
export function retryStop(id: number) {
  updateStop(id, { state: "waiting", lawn: null, terrain: null, live: [] });
  pump();
}

export function setShop(shop: RunPlace | null) {
  update({ shop, pickingShop: false });
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
