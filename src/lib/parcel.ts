/**
 * Lot boundaries for residential lawns: the Quebec cadastre (cadastre allégé,
 * lots of the renovated cadastre) at a point, served by the Quebec
 * environment ministry's public ArcGIS layer. Indicative only: the official
 * boundary is the surveyor's. Ontario has no open parcel layer, so there the
 * rep traces the lot. Parsing is pure and tested; /api/parcel does the fetch.
 */
import type { MultiPolygon, Polygon } from "geojson";
import { pointInGeometry } from "./landcover";

export const CADASTRE_QUERY =
  "https://geo.environnement.gouv.qc.ca/donnees/rest/services/Reference/Cadastre_allege/MapServer/0/query";

/** Rough box around Quebec: points outside it never reach the cadastre. */
const QUEBEC = { south: 44.9, west: -79.8, north: 63, east: -57 };

export interface Parcel {
  geometry: Polygon | MultiPolygon;
  /** Lot number as the cadastre gives it, e.g. "2 115 418"; null if absent. */
  lot: string | null;
}

export function inQuebec(lat: number, lon: number): boolean {
  return lat >= QUEBEC.south && lat <= QUEBEC.north && lon >= QUEBEC.west && lon <= QUEBEC.east;
}

export function cadastreQueryUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  return `${CADASTRE_QUERY}?${params}`;
}

/** The lot number among a feature's attributes (field names vary between releases). */
function lotNumber(props: Record<string, unknown> | null | undefined): string | null {
  if (!props) return null;
  const key = Object.keys(props).find((k) => /^(no_?lot|num(ero)?_?lot|lot)$/i.test(k)) ?? Object.keys(props).find((k) => /lot/i.test(k));
  const value = key ? props[key] : null;
  return value === null || value === undefined || value === "" ? null : String(value).trim();
}

/**
 * The lot containing the point, from the cadastre's GeoJSON answer. When
 * several come back (a point on a shared line), the one that contains it.
 */
export function parseCadastre(json: unknown, lat: number, lon: number): Parcel | null {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return null;
  const lots = features
    .map((f) => f as { geometry?: Polygon | MultiPolygon | null; properties?: Record<string, unknown> | null })
    .filter((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"));
  const hit = lots.find((f) => pointInGeometry(lon, lat, f.geometry!)) ?? lots[0];
  return hit ? { geometry: hit.geometry!, lot: lotNumber(hit.properties) } : null;
}

/** Server side: asks the cadastre for the lot at a point; null when there is none. */
export async function fetchCadastreLot(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<Parcel | null> {
  if (!inQuebec(lat, lon)) return null;
  const response = await fetchImpl(cadastreQueryUrl(lat, lon), {
    headers: { "User-Agent": "Prodig-e Calculator (https://calculator.prodig-e.com)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Cadastre HTTP ${response.status}`);
  const json = (await response.json()) as { error?: { message?: string } };
  if (json && "error" in json && json.error) throw new Error(`Cadastre error: ${json.error.message ?? "unknown"}`);
  return parseCadastre(json, lat, lon);
}

/** Thrown when /api/parcel fails (not when there is simply no lot). */
export class ParcelHttpError extends Error {
  constructor(public status: number) {
    super(`Lot lookup failed (HTTP ${status})`);
    this.name = "ParcelHttpError";
  }
}

/** Browser side: the lot at a point through the cached route; null when there is none. */
export async function fetchParcel(lat: number, lon: number): Promise<Parcel | null> {
  const response = await fetch(`/api/parcel?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, {
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ParcelHttpError(response.status);
  return (await response.json()) as Parcel;
}
