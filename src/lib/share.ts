/**
 * Share links: each tab's inputs go in the query string so a quote can be
 * reopened or sent to a client, e.g. /?r_area=60&r_mowsPerWeek=2#roi.
 * Keys are prefixed per tab (r_ ROI, i_ Incentives, q_ and v Acreage) so one
 * link never collides with another tab's inputs. Pure, so it is tested.
 */

export type ParamValue = string | number | boolean | null | undefined;

/** The values of one tab's keys, prefix stripped: { area: "60", … }. */
export function readParams(search: string, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(search).forEach((value, key) => {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  });
  return out;
}

/** origin + path + query (empty values dropped) + hash. */
export function buildShareUrl(
  location: { origin: string; pathname: string },
  params: Record<string, ParamValue>,
  hash = "",
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    query.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const qs = query.toString();
  return `${location.origin}${location.pathname}${qs ? `?${qs}` : ""}${hash}`;
}

/** Prefixes every key: prefixed("r_", { area: 60 }) → { r_area: 60 }. */
export function prefixed(prefix: string, values: Record<string, ParamValue>): Record<string, ParamValue> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [`${prefix}${k}`, v]));
}

/** Map view as "lat,lon,zoom" (5 decimals ≈ 1 m) and back. */
export function encodeView(lat: number, lon: number, zoom: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)},${Math.round(zoom)}`;
}

export function decodeView(value: string | null): { lat: number; lon: number; zoom: number } | null {
  if (!value) return null;
  const [lat, lon, zoom] = value.split(",").map(Number);
  if (![lat, lon, zoom].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || zoom < 1 || zoom > 20) return null;
  return { lat, lon, zoom };
}
