/**
 * Turning a measurement into the acreage a quote is built on. Pure, so it is
 * tested without a browser and shared by the Acreage panel, its PDF report,
 * share links and the ROI tab.
 *
 * Measured turf isn't all mowed by a robot: greens and tees are usually cut
 * with reel mowers, and estimated rough still includes cart paths, unmapped
 * trees and native areas that are never mowed. So the quote counts only the
 * chosen categories, takes a share of the rough, and can be overridden by hand.
 */
import type { CourseMeasurement } from "./types";

export type QuoteCategory = "fairway" | "rough" | "green" | "tee" | "range";
export const QUOTE_CATEGORIES: QuoteCategory[] = ["fairway", "rough", "green", "tee", "range"];

export interface QuoteSettings {
  include: Record<QuoteCategory, boolean>;
  /** Share of the rough actually mowed (0 to 100). */
  roughPct: number;
  /** Acres typed in by hand; replaces the computed total when set. */
  override: number | null;
}

export const DEFAULT_QUOTE: QuoteSettings = {
  include: { fairway: true, rough: true, green: false, tee: false, range: true },
  roughPct: 80,
  override: null,
};

export function categoryAcres(m: CourseMeasurement, c: QuoteCategory): number {
  return c === "range" ? m.drivingRangeAcres : m[c].acres;
}

/** Acres counted for each included category, with the rough share applied. */
export function quoteBreakdown(m: CourseMeasurement, q: QuoteSettings): Record<QuoteCategory, number> {
  const pct = Math.min(100, Math.max(0, q.roughPct)) / 100;
  const out = {} as Record<QuoteCategory, number>;
  for (const c of QUOTE_CATEGORIES) {
    const acres = q.include[c] ? categoryAcres(m, c) : 0;
    out[c] = c === "rough" ? acres * pct : acres;
  }
  return out;
}

/**
 * Acres for the quote: the manual override when set, else the included
 * categories. null when there is nothing to quote yet. A boundary-only course
 * has no breakdown, so it needs an override (its outline would inflate it).
 */
export function quoteAcres(m: CourseMeasurement | null, q: QuoteSettings): number | null {
  if (q.override !== null && q.override > 0) return q.override;
  if (!m || !m.found || m.boundaryOnly) return null;
  const total = Object.values(quoteBreakdown(m, q)).reduce((a, b) => a + b, 0);
  return total > 0 ? total : null;
}

/** Share-link parameters (q_inc, q_pct, q_ovr) for the settings. */
export function encodeQuote(q: QuoteSettings): Record<string, string> {
  const params: Record<string, string> = {
    q_inc: QUOTE_CATEGORIES.filter((c) => q.include[c]).join(","),
    q_pct: String(q.roughPct),
  };
  if (q.override !== null) params.q_ovr = String(q.override);
  return params;
}

export function decodeQuote(params: URLSearchParams): QuoteSettings {
  const q: QuoteSettings = { ...DEFAULT_QUOTE, include: { ...DEFAULT_QUOTE.include } };
  const inc = params.get("q_inc");
  if (inc !== null) {
    const chosen = new Set(inc.split(","));
    for (const c of QUOTE_CATEGORIES) q.include[c] = chosen.has(c);
  }
  const pct = Number(params.get("q_pct"));
  if (params.has("q_pct") && Number.isFinite(pct)) q.roughPct = Math.min(100, Math.max(0, pct));
  const ovr = Number(params.get("q_ovr"));
  if (params.has("q_ovr") && Number.isFinite(ovr) && ovr > 0) q.override = ovr;
  return q;
}
