/**
 * What the field measured against what the app predicted, and what follows:
 * - a field check: a robot timed on a known area (the area, the time the app
 *   predicted for it, the time it really took). Per model, once
 *   `MIN_CHECKS` are in, the median of actual ÷ predicted corrects that
 *   robot's capacity everywhere (mowers.ts `FitOptions.calibration`);
 * - an install: the acres the app quoted against the acres the robot's own
 *   map measured after installation, by what the acres were counted from
 *   (trust.ts `AcreBasis`). Per basis, once `MIN_RECORD` are in, the 10th to
 *   90th percentile of actual ÷ predicted is the likely range; and the share
 *   within 10 % is the track record printed in proposals.
 * Pure, so it's tested without a browser; the records live in the database
 * (/api/records).
 */
import { baseline, overhead } from "./coverage";
import { paceOf, type Mower } from "./mowers";
import { MIN_RECORD, type AcreBasis, type RecordSpread } from "./trust";

export interface FieldCheck {
  kind: "check";
  id: string;
  /** When it was recorded (ISO). */
  at: string;
  model: string;
  areaM2: number;
  predictedH: number;
  actualH: number;
  note: string;
}

export interface InstallRecord {
  kind: "install";
  id: string;
  at: string;
  basis: AcreBasis;
  predictedAcres: number;
  actualAcres: number;
  property: string;
  note: string;
}

export type FieldRecord = FieldCheck | InstallRecord;

/**
 * Hours we predict a robot takes to mow `areaM2` once (charging left out):
 * the coverage model on a plain square with the charger at its edge, the
 * same basis the fit compares every layout with. A field check's time is
 * set against it.
 */
export function predictedHours(mower: Mower, areaM2: number): number {
  const pace = paceOf(mower);
  const base = baseline(areaM2, mower.line !== "voyager" && mower.line !== "masterseries", pace.stripeM);
  return overhead({ areaM2, stripes: base.stripes, reach: base.reach, trees: 0, base }, pace).hours;
}

/** Field checks a model needs before its measured pace replaces our estimate. */
export const MIN_CHECKS = 3;
/** A ratio outside this is a typo (a time in minutes, acres for m²), not a measurement. */
const SANE: [number, number] = [0.2, 5];

const BASES: AcreBasis[] = ["client", "mapped", "photos", "worldcover", "sod", "lawn"];

/** The record checked and cleaned up from what a form sent; null when it isn't one. */
export function parseRecord(raw: unknown, id: string, at: string): FieldRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const text = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  if (r.kind === "check") {
    const areaM2 = num(r.areaM2);
    const predictedH = num(r.predictedH);
    const actualH = num(r.actualH);
    if (typeof r.model !== "string" || !/^KR\d{3}$/.test(r.model) || !areaM2 || !predictedH || !actualH) return null;
    return { kind: "check", id, at, model: r.model, areaM2, predictedH, actualH, note: text(r.note) };
  }
  if (r.kind === "install") {
    const predictedAcres = num(r.predictedAcres);
    const actualAcres = num(r.actualAcres);
    if (!BASES.includes(r.basis as AcreBasis) || !predictedAcres || !actualAcres) return null;
    return { kind: "install", id, at, basis: r.basis as AcreBasis, predictedAcres, actualAcres, property: text(r.property), note: text(r.note) };
  }
  return null;
}

const ratioOf = (r: FieldRecord) => (r.kind === "check" ? r.actualH / r.predictedH : r.actualAcres / r.predictedAcres);
const sane = (x: number) => x >= SANE[0] && x <= SANE[1];

/** The q-quantile of sorted values (linear between the nearest two). */
function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.min(sorted.length - 1, lo + 1)] - sorted[lo]) * (at - lo);
}

/** Per model with enough field checks: the median time it took over the time we predicted. */
export function calibrationOf(records: FieldRecord[]): Record<string, { n: number; factor: number }> {
  const byModel = new Map<string, number[]>();
  for (const r of records) {
    if (r.kind !== "check" || !sane(ratioOf(r))) continue;
    byModel.set(r.model, [...(byModel.get(r.model) ?? []), ratioOf(r)]);
  }
  const out: Record<string, { n: number; factor: number }> = {};
  for (const [model, ratios] of byModel) {
    if (ratios.length < MIN_CHECKS) continue;
    out[model] = { n: ratios.length, factor: quantile([...ratios].sort((a, b) => a - b), 0.5) };
  }
  return out;
}

/** Per acreage basis with enough installs: the 10th to 90th percentile of actual over quoted acres. */
export function spreadOf(records: FieldRecord[]): RecordSpread {
  const byBasis = new Map<AcreBasis, number[]>();
  for (const r of records) {
    if (r.kind !== "install" || !sane(ratioOf(r))) continue;
    byBasis.set(r.basis, [...(byBasis.get(r.basis) ?? []), ratioOf(r)]);
  }
  const out: RecordSpread = {};
  for (const [basis, ratios] of byBasis) {
    if (ratios.length < MIN_RECORD) continue;
    const sorted = [...ratios].sort((a, b) => a - b);
    out[basis] = { n: ratios.length, low: quantile(sorted, 0.1), high: quantile(sorted, 0.9) };
  }
  return out;
}

/** Installs recorded, and the share whose acreage was within 10 % of ours (null under MIN_RECORD). */
export function trackRecord(records: FieldRecord[]): { installs: number; within10: number | null } {
  const installs = records.filter((r): r is InstallRecord => r.kind === "install" && sane(ratioOf(r)));
  const within = installs.filter((r) => Math.abs(ratioOf(r) - 1) <= 0.1).length;
  return { installs: installs.length, within10: installs.length >= MIN_RECORD ? within / installs.length : null };
}

/** Everything the app needs from the records, as /api/records serves it. */
export function summarize(records: FieldRecord[]) {
  const calibration = calibrationOf(records);
  const record = trackRecord(records);
  return {
    calibration,
    spread: spreadOf(records),
    checks: records.filter((r) => r.kind === "check").length,
    installs: record.installs,
    within10: record.within10,
  };
}
