"use client";

import { useSyncExternalStore } from "react";
import type { IncentiveInputs } from "./incentives";
import { DEFAULT_QUOTE, decodeQuote, type AcreageMode, type MowEvery, type QuoteSettings } from "./quote";
import type { LawnMeasurement } from "./lawn";
import type { Approach, VoyagerModel } from "./roi";
import type { MowWindow } from "./window";
import type { TerrainGrid } from "./terrain";
import type { CourseMeasurement, SodMeasurement } from "./types";

/**
 * What the tabs share, outside React so every tab sees the same values:
 * - the Acreage tab's mode (golf course, sod farm or residential lawn), its
 *   last measurement, sod fields or lawn, the property name and quote
 *   settings (read by its PDF report and the ROI tab);
 * - the LiDAR terrain under the measured property (slope, trees, buildings)
 *   and where the rep put the charger, for the mower fit on screen and in
 *   the PDF;
 * - acres sent to the ROI tab ("Send to ROI"), with how the robots work, how
 *   often, the recommended Voyager size and the layout's extra time, and a
 *   version number so the ROI tab applies each send exactly once;
 * - the Incentives tab's profile, so the ROI tab can price grants and credits
 *   for the Voyager purchase with the same province, profile and tax rate.
 */

/** What "Send to ROI" carries; null fields keep the ROI tab's own values. */
export interface RoiImport {
  acres: number;
  approach: Approach | null;
  every: MowEvery | null;
  model: VoyagerModel | null;
  /** Extra robot time for the property's layout (%), from the mower fit. */
  layoutPct: number | null;
  /** When the robots may mow (null: any time); always applied, like the frequency. */
  window: MowWindow | null;
  /** The acres' likely range, as shares of `acres` ([0.82, 1.39]); null without one. */
  range: [number, number] | null;
  version: number;
}

interface QuoteStoreState {
  settings: QuoteSettings;
  mode: AcreageMode;
  measurement: CourseMeasurement | null;
  sod: SodMeasurement | null;
  lawn: LawnMeasurement | null;
  courseName: string | null;
  terrain: TerrainGrid | null;
  /** Where the rep put the robot's charger, [lat, lon]; null = estimated by the mower fit. */
  charger: [number, number] | null;
  roiImport: RoiImport | null;
  incentiveProfile: IncentiveInputs | null;
}

const SERVER_STATE: QuoteStoreState = {
  settings: DEFAULT_QUOTE,
  mode: "golf",
  measurement: null,
  sod: null,
  lawn: null,
  courseName: null,
  terrain: null,
  charger: null,
  roiImport: null,
  incentiveProfile: null,
};

let state: QuoteStoreState | null = null;
const listeners = new Set<() => void>();

/** Created on first client read, so quote settings from a share link apply. */
function current(): QuoteStoreState {
  if (!state) {
    const params = new URLSearchParams(window.location.search);
    state = {
      ...SERVER_STATE,
      settings: decodeQuote(params),
      mode: params.get("a") === "sod" ? "sod" : params.get("a") === "lawn" ? "lawn" : "golf",
      courseName: params.get("n"),
    };
  }
  return state;
}

function update(patch: Partial<QuoteStoreState>) {
  state = { ...current(), ...patch };
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function useStore<T>(select: (s: QuoteStoreState) => T): T {
  return useSyncExternalStore(subscribe, () => select(current()), () => select(SERVER_STATE));
}

export const useQuoteSettings = () => useStore((s) => s.settings);
export const useMode = () => useStore((s) => s.mode);
export const useMeasurement = () => useStore((s) => s.measurement);
export const useSod = () => useStore((s) => s.sod);
export const useLawn = () => useStore((s) => s.lawn);
export const useCourseName = () => useStore((s) => s.courseName);
export const useRoiImport = () => useStore((s) => s.roiImport);
export const useTerrain = () => useStore((s) => s.terrain);
/** The terrain on screen, for event handlers. */
export const getTerrain = () => current().terrain;
export const useCharger = () => useStore((s) => s.charger);
export const useIncentiveProfile = () => useStore((s) => s.incentiveProfile);

export function setQuoteSettings(patch: Partial<QuoteSettings>) {
  update({ settings: { ...current().settings, ...patch } });
}

export function setMeasurement(measurement: CourseMeasurement | null) {
  update({ measurement });
}

/** The current sod fields, for event handlers that must not use a stale render's value. */
export function getSod(): SodMeasurement | null {
  return current().sod;
}

export function setSod(sod: SodMeasurement | null) {
  update({ sod });
}

/** The current lawn, for event handlers and async lookups that must not use a stale render's value. */
export function getLawn(): LawnMeasurement | null {
  return current().lawn;
}

export function setLawn(lawn: LawnMeasurement | null) {
  update({ lawn });
}

/** Switching between golf course, sod farm and lawn starts a new job: results, name and overrides are cleared. */
export function setMode(mode: AcreageMode) {
  update({
    mode,
    measurement: null,
    sod: null,
    lawn: null,
    terrain: null,
    charger: null,
    courseName: null,
    settings: { ...current().settings, override: null, lawnOverride: null },
  });
}

export function setCourseName(courseName: string | null) {
  update({ courseName });
}

export function setTerrain(terrain: TerrainGrid | null) {
  update({ terrain });
}

export function setCharger(charger: [number, number] | null) {
  update({ charger });
}

/** Acres for the ROI tab, with what the mower fit recommends. */
export function sendAcresToRoi(send: Omit<RoiImport, "version">) {
  update({ roiImport: { ...send, version: (current().roiImport?.version ?? 0) + 1 } });
}

export function setIncentiveProfile(incentiveProfile: IncentiveInputs) {
  update({ incentiveProfile });
}
