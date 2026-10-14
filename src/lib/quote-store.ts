"use client";

import { useSyncExternalStore } from "react";
import type { IncentiveInputs } from "./incentives";
import { DEFAULT_QUOTE, decodeQuote, type QuoteSettings } from "./quote";
import type { CourseMeasurement } from "./types";

/**
 * What the tabs share, outside React so every tab sees the same values:
 * - the Acreage tab's last measurement, course name and quote settings
 *   (read by its PDF report);
 * - acres sent to the ROI tab ("Send to ROI"), with a version number so the
 *   ROI tab applies each send exactly once;
 * - the Incentives tab's profile, so the ROI tab can price grants and credits
 *   for the Voyager purchase with the same province, profile and tax rate.
 */

interface QuoteStoreState {
  settings: QuoteSettings;
  measurement: CourseMeasurement | null;
  courseName: string | null;
  roiImport: { acres: number; version: number } | null;
  incentiveProfile: IncentiveInputs | null;
}

const SERVER_STATE: QuoteStoreState = {
  settings: DEFAULT_QUOTE,
  measurement: null,
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
    state = { ...SERVER_STATE, settings: decodeQuote(params), courseName: params.get("n") };
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
export const useMeasurement = () => useStore((s) => s.measurement);
export const useCourseName = () => useStore((s) => s.courseName);
export const useRoiImport = () => useStore((s) => s.roiImport);
export const useIncentiveProfile = () => useStore((s) => s.incentiveProfile);

export function setQuoteSettings(patch: Partial<QuoteSettings>) {
  update({ settings: { ...current().settings, ...patch } });
}

export function setMeasurement(measurement: CourseMeasurement | null) {
  update({ measurement });
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
