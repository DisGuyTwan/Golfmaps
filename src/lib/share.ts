/**
 * Share links: each tab's inputs go in the query string so a quote can be
 * reopened or sent to a client, e.g. /?r_area=60&r_mowsPerWeek=2#roi.
 * Keys are prefixed per tab (r_ ROI, i_ Incentives, q_ and v Acreage) so one
 * link never collides with another tab's inputs. Pure, so it is tested.
 *
 * Acreage keys: v view, m measure on open, b scan box, n name, a=sod / a=lawn
 * for a sod farm or a residential lawn, o a traced course outline, sf traced
 * sod fields, sx detected sod fields left out (a point inside each), lp the
 * point a lawn's lot was picked at, lo a traced lot, lx areas traced out of a
 * lawn, ld traced driveways ("centre line polyline:width in mm"), ch the
 * robot's charger ("lat,lon", when the rep placed it). Shapes travel as
 * encoded polylines.
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

/**
 * [lat, lon] points as an encoded polyline (Google's format, 5 decimals ≈ 1 m),
 * the compact way to put a traced shape in a link. Its characters (? to ~)
 * never include a comma, so several polylines can be joined with ",".
 */
export function encodePolyline(points: [number, number][]): string {
  let out = "";
  let prevLat = 0;
  let prevLon = 0;
  const push = (delta: number) => {
    let v = delta < 0 ? ~(delta << 1) : delta << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lon * 1e5);
    push(la - prevLat);
    push(lo - prevLon);
    prevLat = la;
    prevLon = lo;
  }
  return out;
}

/** Points from an encoded polyline; null when it is malformed or out of range. */
export function decodePolyline(value: string): [number, number][] | null {
  const points: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (i >= value.length || shift > 30) return null;
      const b = value.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) return null;
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < value.length) {
    const dLat = next();
    const dLon = next();
    if (dLat === null || dLon === null) return null;
    lat += dLat;
    lon += dLon;
    if (Math.abs(lat) > 9e6 || Math.abs(lon) > 18e6) return null;
    points.push([lat / 1e5, lon / 1e5]);
  }
  return points;
}
