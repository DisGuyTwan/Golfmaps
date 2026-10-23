"use client";

import { useSyncExternalStore } from "react";
import type { IncentiveInputs } from "./incentives";
import { DEFAULT_QUOTE, decodeQuote, type AcreageMode, type QuoteSettings } from "./quote";
import type { LawnMeasurement } from "./lawn";
import type { CourseMeasurement, SodMeasurement } from "./types";

/**
 * What the tabs share, outside React so every tab sees the same values:
 * - the Acreage tab's mode (golf course, sod farm or residential lawn), its
 *   last measurement, sod fields or lawn, the property name and quote
 *   settings (read by its PDF report and the ROI tab);
 * - acres sent to the ROI tab ("Send to ROI"), with a version number so the
 *   ROI tab applies each send exactly once;
 * - the Incentives tab's profile, so the ROI tab can price grants and credits
 *   for the Voyager purchase with the same province, profile and tax rate.
 */

interface QuoteStoreState {
  settings: QuoteSettings;
  mode: AcreageMode;
  measurement: CourseMeasurement | null;
  sod: SodMeasurement | null;
  lawn: LawnMeasurement | null;
  courseName: string | null;
  roiImport: { acres: number; version: number } | null;
  incentiveProfile: IncentiveInputs | null;
}

const SERVER_STATE: QuoteStoreState = {
  settings: DEFAULT_QUOTE,
  mode: "golf",
  measurement: null,
  sod: null,
  lawn: null,
  courseName: null,
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
    courseName: null,
    settings: { ...current().settings, override: null, lawnOverride: null },
  });
}

export function setCourseName(courseName: string | null) {
  update({ courseName });
}

export function sendAcresToRoi(acres: number) {
  update({ roiImport: { acres, version: (current().roiImport?.version ?? 0) + 1 } });
}

export function setIncentiveProfile(incentiveProfile: IncentiveInputs) {
  update({ incentiveProfile });
}
