/**
 * What the Acreage tab is reading right now, source by source: the cadastre
 * lot, the crop map, OpenStreetMap, the LiDAR, the aerial photos and the
 * satellite land cover (and, for a grass run, the roads between the stops). The panel lists them as they load (what's being read,
 * for how long, what it found) and the map sweeps the area each one covers,
 * so a measurement loads live instead of behind a spinner. Pure, so the
 * bookkeeping is tested without a browser.
 */
import type { BBox } from "./types";

export type LiveSource = "lot" | "crop" | "osm" | "lidar" | "photos" | "satellite" | "roads";

/** The order sources are listed in: roughly the order they answer. */
export const LIVE_ORDER: readonly LiveSource[] = ["lot", "crop", "osm", "lidar", "photos", "satellite", "roads"];

/** What a source found, worded by the panel in the rep's language. */
export type LiveFinding =
  | { kind: "lot"; lot: string | null }
  | { kind: "sod"; share: number }
  | { kind: "course"; name: string | null }
  | { kind: "golf"; fairways: number; outlineOnly: boolean }
  | { kind: "mapped"; n: number }
  | { kind: "fields"; n: number }
  | { kind: "surfaces"; pools: number; paved: number }
  | { kind: "grass"; acres: number }
  | { kind: "roads"; places: number }
  | { kind: "read" }
  | { kind: "none" };

export interface LiveStep {
  source: LiveSource;
  state: "active" | "done" | "failed";
  /** When it started and ended (ms, Date.now()). */
  started: number;
  ended: number | null;
  /** The box being read, swept on the map while it loads. */
  area: BBox | null;
  found: LiveFinding | null;
}

/** A source starts loading. One already loading keeps its start (the same request, picked up by the next step). */
export function beginStep(steps: LiveStep[], source: LiveSource, area: BBox | null, now: number): LiveStep[] {
  const current = steps.find((s) => s.source === source);
  if (current?.state === "active") return area && !current.area ? steps.map((s) => (s === current ? { ...s, area } : s)) : steps;
  const next: LiveStep = { source, state: "active", started: now, ended: null, area, found: null };
  return sortSteps([...steps.filter((s) => s.source !== source), next]);
}

/** A source answered (done, with what it found) or gave up (failed). */
export function endStep(steps: LiveStep[], source: LiveSource, state: "done" | "failed", found: LiveFinding | null, now: number): LiveStep[] {
  return steps.map((s) => (s.source === source && s.state === "active" ? { ...s, state, ended: now, found } : s));
}

export function sortSteps(steps: LiveStep[]): LiveStep[] {
  return [...steps].sort((a, b) => LIVE_ORDER.indexOf(a.source) - LIVE_ORDER.indexOf(b.source));
}

/** How long the panel keeps the list after the last source answered (ms), so the last check is seen. */
export const LIVE_LINGER_MS = 1600;

/** True while something loads, and for a moment after the last answer. */
export function liveVisible(steps: LiveStep[], now: number): boolean {
  if (steps.some((s) => s.state === "active")) return true;
  const last = Math.max(0, ...steps.map((s) => s.ended ?? 0));
  return steps.length > 0 && now - last < LIVE_LINGER_MS;
}

/** Seconds a step has run (or ran), one decimal under 10 s. */
export function liveSeconds(step: LiveStep, now: number): string | null {
  const ms = (step.ended ?? now) - step.started;
  if (!(ms >= 0)) return null;
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) : String(Math.round(s));
}
