/**
 * Turning a measurement into the acreage a quote is built on. Pure, so it is
 * tested without a browser and shared by the Acreage panel, its PDF report,
 * share links and the ROI tab.
 *
 * Measured turf isn't all mowed by a robot: greens and tees are usually cut
 * with reel mowers, and estimated rough still includes cart paths, unmapped
 * trees and native areas that are never mowed. So the quote counts only the
 * chosen categories, takes a share of the rough, and can be overridden by hand.
 *
 * Two more bases, each with its own share: a course with no mapped turf
 * (outline only, or traced) counts the satellite grass inside its outline,
 * and a sod farm counts the fields left in, less those being harvested.
 */
import { estimatedTurf } from "./landcover";
import { lawnTotals, type LawnMeasurement } from "./lawn";
import { isApproach, type Approach } from "./roi";
import type { CourseMeasurement, SatelliteTurf, SodMeasurement } from "./types";

/** What the Acreage tab measures: a golf course, a sod farm or a residential lawn. */
export type AcreageMode = "golf" | "sod" | "lawn";

export type QuoteCategory = "fairway" | "rough" | "green" | "tee" | "range";
export const QUOTE_CATEGORIES: QuoteCategory[] = ["fairway", "rough", "green", "tee", "range"];

export interface QuoteSettings {
  include: Record<QuoteCategory, boolean>;
  /** Share of the rough actually mowed (0 to 100). */
  roughPct: number;
  /** Acres typed in by hand; replaces the computed total when set. */
  override: number | null;
  /**
   * Share of the turf estimated from satellite (outline-only courses) that
   * robots mow (0 to 100). It still holds greens, tees and some rough; on
   * fully mapped courses the category defaults come to 81% of the turf.
   */
  grassPct: number;
  /** Share of the sod fields being mowed at a time (0 to 100): fields just harvested or reseeded aren't. */
  sodPct: number;
  /** Lawn area typed in by hand for a residential lot, in square feet. */
  lawnOverride: number | null;
  /** How often the robots mow it all (days): sizes the robot fleet in the mower fit. */
  mowEvery: MowEvery;
  /** On a golf course: cut and stay (KR238s) or cut and go (Voyagers); null = whichever fits it better. */
  approach: Approach | null;
}

/** Mowing every day, every 2 days (Kress's rating) or every 3. */
export type MowEvery = 1 | 2 | 3;
export const MOW_EVERY: MowEvery[] = [1, 2, 3];

export const DEFAULT_QUOTE: QuoteSettings = {
  include: { fairway: true, rough: true, green: false, tee: false, range: true },
  roughPct: 80,
  override: null,
  grassPct: 80,
  sodPct: 90,
  lawnOverride: null,
  mowEvery: 2,
  approach: null,
};

const share = (pct: number) => Math.min(100, Math.max(0, pct)) / 100;

export function categoryAcres(m: CourseMeasurement, c: QuoteCategory): number {
  return c === "range" ? m.drivingRangeAcres : m[c].acres;
}

/** Acres counted for each included category, with the rough share applied. */
export function quoteBreakdown(m: CourseMeasurement, q: QuoteSettings): Record<QuoteCategory, number> {
  const pct = share(q.roughPct);
  const out = {} as Record<QuoteCategory, number>;
  for (const c of QUOTE_CATEGORIES) {
    const acres = q.include[c] ? categoryAcres(m, c) : 0;
    out[c] = c === "rough" ? acres * pct : acres;
  }
  return out;
}

/** Turf estimated from satellite, counted for the quote with the mowed share applied. */
export function satelliteAcres(s: SatelliteTurf, q: QuoteSettings): number {
  return estimatedTurf(s).acres * share(q.grassPct);
}

/**
 * Acres for the quote: the manual override when set, else the included
 * categories. null when there is nothing to quote yet. A course with only an
 * outline has no breakdown: it counts the turf estimated from the satellite
 * grass inside the outline when that ran, and otherwise needs an override (the
 * outline would inflate it).
 */
export function quoteAcres(m: CourseMeasurement | null, q: QuoteSettings): number | null {
  if (q.override !== null && q.override > 0) return q.override;
  if (!m || !m.found) return null;
  const total = m.boundaryOnly
    ? m.satellite
      ? satelliteAcres(m.satellite, q)
      : 0
    : Object.values(quoteBreakdown(m, q)).reduce((a, b) => a + b, 0);
  return total > 0 ? total : null;
}

/** Acres of the sod fields left in the quote (before the mowed share). */
export function sodFieldAcres(sod: SodMeasurement | null): number {
  return (sod?.fields ?? []).reduce((sum, f) => sum + (f.included ? f.acres : 0), 0);
}

/** Acres for a sod farm's quote: the override, else the fields left in at the mowed share. */
export function sodQuoteAcres(sod: SodMeasurement | null, q: QuoteSettings): number | null {
  if (q.override !== null && q.override > 0) return q.override;
  const total = sodFieldAcres(sod) * share(q.sodPct);
  return total > 0 ? total : null;
}

/**
 * The quoted acres for whichever kind of property the Acreage tab is on. A
 * residential lawn has none: it is quoted in square feet and doesn't go to
 * the ROI tab (which compares a Voyager with a commercial crew).
 */
export function acresForQuote(
  mode: AcreageMode,
  m: CourseMeasurement | null,
  sod: SodMeasurement | null,
  q: QuoteSettings,
): number | null {
  if (mode === "lawn") return null;
  return mode === "sod" ? sodQuoteAcres(sod, q) : quoteAcres(m, q);
}

/** Square feet of lawn for a residential quote: the override, else the lot's lawn. */
export function lawnQuoteSqft(lawn: LawnMeasurement | null, q: QuoteSettings): number | null {
  if (q.lawnOverride !== null && q.lawnOverride > 0) return q.lawnOverride;
  const sqft = lawn ? lawnTotals(lawn).lawnSqft : 0;
  return sqft > 0 ? sqft : null;
}

/** Share-link parameters: q_inc, q_pct, q_gpct for a course (q_how: cut and stay or go), q_spct for sod, q_ovr; q_lovr for a lawn. */
export function encodeQuote(q: QuoteSettings, mode: AcreageMode = "golf"): Record<string, string> {
  const every: Record<string, string> = q.mowEvery !== DEFAULT_QUOTE.mowEvery ? { q_every: String(q.mowEvery) } : {};
  if (mode === "lawn") return q.lawnOverride !== null ? { q_lovr: String(q.lawnOverride), ...every } : every;
  const params: Record<string, string> =
    mode === "sod"
      ? { q_spct: String(q.sodPct) }
      : {
          q_inc: QUOTE_CATEGORIES.filter((c) => q.include[c]).join(","),
          q_pct: String(q.roughPct),
          q_gpct: String(q.grassPct),
          ...(q.approach && { q_how: q.approach }),
        };
  if (q.override !== null) params.q_ovr = String(q.override);
  return { ...params, ...every };
}

export function decodeQuote(params: URLSearchParams): QuoteSettings {
  const q: QuoteSettings = { ...DEFAULT_QUOTE, include: { ...DEFAULT_QUOTE.include } };
  const inc = params.get("q_inc");
  if (inc !== null) {
    const chosen = new Set(inc.split(","));
    for (const c of QUOTE_CATEGORIES) q.include[c] = chosen.has(c);
  }
  const pct = (key: string): number | null => {
    const n = Number(params.get(key));
    return params.has(key) && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  };
  q.roughPct = pct("q_pct") ?? q.roughPct;
  q.grassPct = pct("q_gpct") ?? q.grassPct;
  q.sodPct = pct("q_spct") ?? q.sodPct;
  const ovr = Number(params.get("q_ovr"));
  if (params.has("q_ovr") && Number.isFinite(ovr) && ovr > 0) q.override = ovr;
  const lovr = Number(params.get("q_lovr"));
  if (params.has("q_lovr") && Number.isFinite(lovr) && lovr > 0) q.lawnOverride = lovr;
  const every = Number(params.get("q_every"));
  if (MOW_EVERY.includes(every as MowEvery)) q.mowEvery = every as MowEvery;
  const how = params.get("q_how");
  if (isApproach(how)) q.approach = how;
  return q;
}
