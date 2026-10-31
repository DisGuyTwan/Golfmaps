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
import { MIN_ZONE_M2 } from "./ground";
import { MIN_PASSAGE_M, MOWERS_AS_OF } from "./mowers";
import { acresForQuote, type AcreageMode, type QuoteSettings } from "./quote";
import type { CourseMeasurement, SodMeasurement } from "./types";

/** What the acres for a quote are counted from. */
export type AcreBasis = "client" | "mapped" | "photos" | "worldcover" | "sod" | "lawn";

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
  /**
   * Where the range comes from: the calibration of the count, the installs
   * recorded, or (a lot) how sure each source behind it is (lotRange).
   */
  rangeFrom: "calibration" | "record" | "sources" | null;
  /** Installs behind a recorded range. */
  n: number;
  /** A lot's range: what widens it most, biggest first. */
  doubts?: LotDoubt[];
}

/**
 * How sure each part of a lot's lawn is, as one standard deviation of what
 * it measures (estimates, from what each source is known to be off by):
 * - the lot: the cadastre allégé is simplified from the official one (3 %);
 *   traced by the rep on the photos (5 %); estimated around the house
 *   (27 %: the 12 Aylmer lots checked against the cadastre, half within
 *   25 %, see estimated-lot.ts);
 * - what came off it: OSM's footprints (5 %), buildings only the LiDAR sees
 *   (15 %: 1 m cells, eaves and trees beside them), pools and paving only
 *   the photos show (25 %: a pixel rule, see surface.ts);
 * - the edges: where every edge of the lawn is drawn, 10 cm either way on
 *   average (cadastre lines, footprints, photo pixels): a ragged lawn with
 *   long edges is less sure than a square one of the same area;
 * - the ground: what no robot reaches (30 %) and the slopes' extra surface
 *   (15 % of it).
 */
export const LOT_SIGMA = { cadastre: 0.03, traced: 0.05, estimated: 0.27 } as const;
const SOURCE_SIGMA = { osm: 0.05, lidar: 0.15, photos: 0.25, trim: 0.3, slope: 0.15 } as const;
const EDGE_SIGMA_M = 0.1;
/**
 * A driveway nobody found (m²): OSM maps 1-30 % of residential driveways,
 * so a house lot with no paving taken off may still have one. Only lowers
 * the low end.
 */
export const MISSED_DRIVEWAY_M2 = 45;
/** The 10th and 90th percentiles of a normal spread, in standard deviations. */
const Z90 = 1.2816;

/** What makes a lot's lawn less sure. */
export type LotDoubt = "estimatedLot" | "tracedLot" | "lidar" | "photos" | "edges" | "driveway" | "trim" | "slope";

export interface LotRangeInputs {
  lotSource: "cadastre" | "traced" | "estimated";
  /** The lot, and the lawn measured on it (m², on the map). */
  lotM2: number;
  lawnM2: number;
  /** What came off it, by source (m²). */
  osmM2: number;
  lidarM2: number;
  photoM2: number;
  /** The lawn's edges (m). */
  edgeM: number;
  /** A house lot (not a commercial site) with no paving taken off: a driveway may be missing. */
  noDriveway: boolean;
  /** The robots' ground (m²): what no robot reaches, and the slopes' extra surface. */
  trimM2: number;
  slopeM2: number;
}

/**
 * A lot's likely lawn, from how sure each source behind it is: the parts'
 * uncertainties added up (as independent errors), the 10th to 90th
 * percentile around what was measured, the low end lowered for a driveway
 * that may be missing. Ratios of the lawn, and what widens it most. Once
 * installs are recorded for lawns, their spread is used instead (in
 * MowerFit).
 */
export function lotRange(i: LotRangeInputs): { low: number; high: number; doubts: LotDoubt[] } {
  if (i.lawnM2 <= 0) return { low: 1, high: 1, doubts: [] };
  const parts: [LotDoubt | null, number][] = [
    [i.lotSource === "estimated" ? "estimatedLot" : i.lotSource === "traced" ? "tracedLot" : null, LOT_SIGMA[i.lotSource] * i.lotM2],
    [null, SOURCE_SIGMA.osm * i.osmM2],
    ["lidar", SOURCE_SIGMA.lidar * i.lidarM2],
    ["photos", SOURCE_SIGMA.photos * i.photoM2],
    ["edges", EDGE_SIGMA_M * i.edgeM],
    ["trim", SOURCE_SIGMA.trim * i.trimM2],
    ["slope", SOURCE_SIGMA.slope * i.slopeM2],
  ];
  const sigma = Math.sqrt(parts.reduce((s, [, v]) => s + v * v, 0));
  const driveway = i.noDriveway ? MISSED_DRIVEWAY_M2 : 0;
  const low = Math.max(0, i.lawnM2 - Z90 * sigma - driveway) / i.lawnM2;
  const high = (i.lawnM2 + Z90 * sigma) / i.lawnM2;
  // What widens it: each part at least a quarter of the whole, biggest first (the driveway when it's the low end's biggest piece).
  const doubts = parts
    .filter((p): p is [LotDoubt, number] => p[0] !== null && p[1] >= 0.25 * sigma && p[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d);
  if (driveway > 0) doubts.splice(driveway >= Z90 * sigma ? 0 : doubts.length, 0, "driveway");
  return { low, high, doubts };
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
    | "record"
    | "ground"
    | "lotRange";
  kind: AssumptionKind;
  /** Values the copy fills in (percentages, dates, counts). */
  values: (string | number)[];
}

export interface AssumptionInputs {
  mode: AcreageMode;
  measurement: CourseMeasurement | null;
  sod: SodMeasurement | null;
  q: QuoteSettings;
  /** Where the lawn's lot came from: the Quebec cadastre, traced by hand, or estimated around the house. */
  lot: "cadastre" | "traced" | "estimated";
  /** LiDAR terrain read for the property: true, false (none there) or null (not read). */
  lidar: boolean | null;
  /** The charger was placed by the rep (else estimated). */
  chargerPlaced: boolean;
  /** Field checks behind the robots' pace, by model (calibration.ts); empty when none. */
  calibratedChecks: number;
  /** Installs recorded with our predictions (records.ts). */
  installs: number;
  /** The robots' ground was worked out (ground.ts): what no robot reaches, the slopes' surface. */
  ground?: boolean;
  /** A lot's likely range comes from how sure its sources are (lotRange). */
  lotRange?: boolean;
}

/** Everything the Acreage tab's numbers rest on, in the order a client reads them. */
export function assumptions(a: AssumptionInputs): Assumption[] {
  const out: Assumption[] = [];
  const { mode, measurement: m, sod, q } = a;
  if (q.override !== null && mode !== "lawn") out.push({ key: "client", kind: "client", values: [q.override] });
  if (mode === "lawn") {
    if (q.lawnOverride !== null) out.push({ key: "client", kind: "client", values: [q.lawnOverride] });
    out.push({ key: "lawn", kind: a.lot === "estimated" ? "estimate" : "measured", values: [a.lot] });
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
  if (a.lotRange) out.push({ key: "lotRange", kind: "estimate", values: [] });
  if (a.lidar !== null) out.push({ key: a.lidar ? "lidar" : "noLidar", kind: a.lidar ? "measured" : "rule", values: [] });
  if (a.ground) out.push({ key: "ground", kind: "rule", values: [MIN_PASSAGE_M, MIN_ZONE_M2] });
  out.push({ key: "ratings", kind: "rating", values: [MOWERS_AS_OF] });
  out.push(a.calibratedChecks > 0 ? { key: "calibrated", kind: "measured", values: [a.calibratedChecks] } : { key: "pace", kind: "estimate", values: [] });
  out.push({ key: "every", kind: "client", values: [q.mowEvery] });
  out.push(q.window ? { key: "window", kind: "estimate", values: [] } : { key: "anyTime", kind: "rule", values: [] });
  out.push({ key: "fleet", kind: "rule", values: [90] });
  out.push({ key: "charger", kind: a.chargerPlaced ? "client" : "estimate", values: [a.chargerPlaced ? 1 : 0] });
  if (a.installs > 0) out.push({ key: "record", kind: "measured", values: [a.installs] });
  return out;
}
