"use client";

import { useSyncExternalStore } from "react";
import type { RecordSpread } from "./trust";

/**
 * What field checks and installs have measured against our predictions
 * (/api/records, from the database), shared by every tab:
 * - `calibration`: per robot, the median of the time it really took over the
 *   time we predicted, once a model has enough field checks (calibration.ts);
 * - `spread`: per acreage basis, how far installs' acreage was from ours,
 *   which becomes the likely range (trust.ts);
 * - how many checks and installs that rests on.
 * Empty until it loads, and where there's no database: the app then runs on
 * its estimates, and says so.
 */
export interface Records {
  calibration: Record<string, { n: number; factor: number }>;
  spread: RecordSpread;
  checks: number;
  installs: number;
  /** Share of installs within 10 % of our acreage (null under 5 installs). */
  within10: number | null;
}

export const NO_RECORDS: Records = { calibration: {}, spread: {}, checks: 0, installs: 0, within10: null };

let state: Records = NO_RECORDS;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // The first reader loads them; a failure leaves the estimates.
  loading ??= fetch("/api/records")
    .then((res) => (res.ok ? (res.json() as Promise<Partial<Records>>) : null))
    .then((r) => {
      if (!r) return;
      state = { ...NO_RECORDS, ...r };
      for (const listener of listeners) listener();
    })
    .catch(() => {});
  return () => listeners.delete(onChange);
}

export const useRecords = () => useSyncExternalStore(subscribe, () => state, () => NO_RECORDS);
export const getRecords = () => state;
