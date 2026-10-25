/**
 * How sure each headline number is, and where it comes from. A client who
 * knows their course is 112 acres stops trusting the rest when we say 128
 * with no hint that it's an estimate, so:
 * - acres carry a likely range where one has been measured: the photo and
 *   satellite counts' calibrated ranges, or (once enough installs are
 *   recorded) the range of what installs actually measured against ours;
 * - the client's own number is shown beside ours, with whether it falls in
 *   our range, and is the one the quote uses;
 * - the fleet is sized at both ends of that range too;
 * - every assumption behind the numbers is listed with its source, its date
 *   and what kind it is (measured, Kress's rating, an estimate, the client's).
 * Pure, so it's tested without a browser.
 */
import { estimatedTurf, PHOTO_TURF_PER_GRASS, PHOTO_TURF_RANGE, TURF_PER_GRASS, TURF_RANGE } from "./landcover";
import { MOWERS_AS_OF } from "./mowers";
import { acresForQuote, type AcreageMode, type QuoteSettings } from "./quote";
import type { CourseMeasurement, SodMeasurement } from "./types";

/** What the acres for a quote are counted from. */
export type AcreBasis = "client" | "mapped" | "photos" | "worldcover" | "sod";

/**
 * What installs measured against our numbers, by basis: the 10th and 90th
 * percentile of actual ÷ predicted, over `n` installs (records.ts).
 */
export type RecordSpread = Partial<Record<AcreBasis, { n: number; low: number; high: number }>>;
/** Installs a basis needs before its recorded spread is the likely range. */
export const MIN_RECORD = 5;

export interface AcreRange {
  value: number;
  /** The likely range, or null where none has been measured yet. */
  low: number | null;
  high: number | null;
  basis: AcreBasis;
  /** Where the range comes from: the calibration of the count, or the installs recorded. */
  rangeFrom: "calibration" | "record" | null;
  /** Installs behind a recorded range. */
  n: number;
}

/**
 * The acres we measured for the quote (ignoring the client's number), with
 * how sure: null when there's nothing to quote (or a lawn, in square feet).
 */
export function measuredRange(
  mode: AcreageMode,
  m: CourseMeasurement | null,
  sod: SodMeasurement | null,
  q: QuoteSettings,
  record: RecordSpread = {},
): AcreRange | null {
  const value = acresForQuote(mode, m, sod, { ...q, override: null });
  if (value === null) return null;
  const basis: AcreBasis = mode === "sod" ? "sod" : m?.boundaryOnly && m.satellite ? m.satellite.source : "mapped";
  const rec = record[basis];
  if (rec && rec.n >= MIN_RECORD) return { value, low: value * rec.low, high: value * rec.high, basis, rangeFrom: "record", n: rec.n };
  if ((basis === "photos" || basis === "worldcover") && m?.satellite) {
    const est = estimatedTurf(m.satellite);
    const k = value / est.acres;
    return { value, low: est.low * k, high: est.high * k, basis, rangeFrom: "calibration", n: 0 };
  }
  return { value, low: null, high: null, basis, rangeFrom: null, n: 0 };
}

/** Where the client's number falls against ours: inside our likely range, outside it, or (no range) how far off. */
export function compareClient(client: number, measured: AcreRange): { inRange: boolean | null; diffPct: number } {
  const diffPct = measured.value > 0 ? ((client - measured.value) / measured.value) * 100 : 0;
  const inRange = measured.low !== null && measured.high !== null ? client >= measured.low * 0.995 && client <= measured.high * 1.005 : null;
  return { inRange, diffPct };
}

/** The kinds of assumption, so the client sees which numbers are measured and which are estimates. */
export type AssumptionKind = "measured" | "rating" | "estimate" | "client" | "rule";

/** One assumption behind the numbers: a key the copy describes (i18n `sources`), its values and kind. */
export interface Assumption {
  key:
    | "client"
    | "mapped"
    | "roughEstimated"
    | "photos"
    | "worldcover"
    | "sod"
    | "lawn"
    | "lidar"
    | "noLidar"
    | "ratings"
    | "pace"
    | "calibrated"
    | "every"
    | "window"
    | "anyTime"
    | "fleet"
    | "charger"
    | "record";
  kind: AssumptionKind;
  /** Values the copy fills in (percentages, dates, counts). */
  values: (string | number)[];
}

export interface AssumptionInputs {
  mode: AcreageMode;
  measurement: CourseMeasurement | null;
  sod: SodMeasurement | null;
  q: QuoteSettings;
  /** The lawn's lot came from the cadastre (else traced). */
  cadastre: boolean;
  /** LiDAR terrain read for the property: true, false (none there) or null (not read). */
  lidar: boolean | null;
  /** The charger was placed by the rep (else estimated). */
  chargerPlaced: boolean;
  /** Field checks behind the robots' pace, by model (calibration.ts); empty when none. */
  calibratedChecks: number;
  /** Installs recorded with our predictions (records.ts). */
  installs: number;
}

/** Everything the Acreage tab's numbers rest on, in the order a client reads them. */
export function assumptions(a: AssumptionInputs): Assumption[] {
  const out: Assumption[] = [];
  const { mode, measurement: m, sod, q } = a;
  if (q.override !== null && mode !== "lawn") out.push({ key: "client", kind: "client", values: [q.override] });
  if (mode === "lawn") {
    if (q.lawnOverride !== null) out.push({ key: "client", kind: "client", values: [q.lawnOverride] });
    out.push({ key: "lawn", kind: "measured", values: [a.cadastre ? 1 : 0] });
  } else if (mode === "sod") {
    if (sod) out.push({ key: "sod", kind: "measured", values: [sod.year ?? "", q.sodPct, sod.photos ? 1 : 0] });
  } else if (m?.boundaryOnly && m.satellite) {
    const photos = m.satellite.source === "photos";
    const [k, [lo, hi]] = photos ? [PHOTO_TURF_PER_GRASS, PHOTO_TURF_RANGE] : [TURF_PER_GRASS, TURF_RANGE];
    out.push({ key: photos ? "photos" : "worldcover", kind: "estimate", values: [k, lo, hi, q.grassPct, m.satellite.year ?? ""] });
  } else if (m?.found) {
    out.push({ key: "mapped", kind: "measured", values: [] });
    if (m.roughEstimated && q.include.rough) out.push({ key: "roughEstimated", kind: "estimate", values: [q.roughPct] });
  }
  if (a.lidar !== null) out.push({ key: a.lidar ? "lidar" : "noLidar", kind: a.lidar ? "measured" : "rule", values: [] });
  out.push({ key: "ratings", kind: "rating", values: [MOWERS_AS_OF] });
  out.push(a.calibratedChecks > 0 ? { key: "calibrated", kind: "measured", values: [a.calibratedChecks] } : { key: "pace", kind: "estimate", values: [] });
  out.push({ key: "every", kind: "client", values: [q.mowEvery] });
  out.push(q.window ? { key: "window", kind: "estimate", values: [] } : { key: "anyTime", kind: "rule", values: [] });
  out.push({ key: "fleet", kind: "rule", values: [90] });
  out.push({ key: "charger", kind: a.chargerPlaced ? "client" : "estimate", values: [a.chargerPlaced ? 1 : 0] });
  if (a.installs > 0) out.push({ key: "record", kind: "measured", values: [a.installs] });
  return out;
}
