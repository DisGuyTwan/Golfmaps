/**
 * Live gas price for the ROI tab: Statistics Canada's monthly average retail
 * price of regular unleaded gasoline at self-service stations in Montréal
 * (table 18-10-0001-01), read through its public Web Data Service. The
 * Régie de l'énergie publishes weekly prices but no API, so StatCan is the
 * machine-readable source; it lags about a month.
 */

/** StatCan vector: Montréal, regular unleaded, self-service (¢/L). */
export const GAS_VECTOR_ID = 735096;
export const STATCAN_WDS_URL =
  "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods";

export interface GasPrice {
  /** $/L */
  price: number;
  /** "2026-09" */
  period: string;
  source: "statcan";
}

/** Extracts the latest price from a WDS response; null if missing or implausible. */
export function parseStatcanGas(json: unknown): GasPrice | null {
  const first = Array.isArray(json) ? json[0] : null;
  if (!first || first.status !== "SUCCESS") return null;
  const points: unknown = first.object?.vectorDataPoint;
  if (!Array.isArray(points) || points.length === 0) return null;
  const latest = points[points.length - 1] as { refPer?: unknown; value?: unknown };
  const cents = Number(latest.value);
  const period = typeof latest.refPer === "string" ? latest.refPer.slice(0, 7) : "";
  // ¢/L; anything outside 50 ¢ to 4 $ is a parsing problem, not a price.
  if (!Number.isFinite(cents) || cents < 50 || cents > 400 || !/^\d{4}-\d{2}$/.test(period)) return null;
  return { price: Math.round(cents) / 100, period, source: "statcan" };
}
