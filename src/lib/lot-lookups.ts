/**
 * Looking up a lot and what's on it, shared by the lawn mode and a grass
 * run's stops: the cadastre lot at a point, what OpenStreetMap has around it
 * (buildings, paving, and the golf course holding it), the LiDAR (slope,
 * trees, the buildings OSM misses) and the aerial photos (pools, paving).
 * Lookups only: the arithmetic is in lawn.ts, terrain.ts and surface.ts.
 */
import type { MultiPolygon, Polygon } from "geojson";
import { estimateLot, lotInputs } from "./estimated-lot";
import { aroundPoint, bboxContains, lotBBox, mappedOnLot, type LawnArea, type LawnMeasurement } from "./lawn";
import type { LiveFinding, LiveSource } from "./live";
import { fetchFairways } from "./overpass";
import { fetchParcel, inQuebec } from "./parcel";
import { fetchSurface, fitsSurface, surfaceAreas } from "./surface";
import { NO_SLOPE, TERRAIN_MAX_SPAN_DEG, fetchTerrain, lidarBuildings, terrainStats, type TerrainGrid } from "./terrain";
import type { BBox } from "./types";

/**
 * The lookups at a point that every kind of property needs, started at once:
 * what OpenStreetMap has around it (buildings, paving, streets, and the golf
 * course holding it), the LiDAR (HRDEM covers Ontario too), and the
 * cadastre lot (Quebec).
 */
export function lookAround(lat: number, lon: number) {
  const around = aroundPoint(lat, lon);
  const nearby = fetchFairways(around, "lawn");
  nearby.catch(() => {}); // Handled by whoever uses it, or unused.
  const terrain = fetchTerrain(around);
  terrain.catch(() => {}); // Likewise, by whoever loads the terrain.
  const parcel = inQuebec(lat, lon) ? fetchParcel(lat, lon) : Promise.resolve(null);
  parcel.catch(() => {}); // Likewise, by whoever reads the lot.
  return { around, nearby, terrain, parcel };
}
export type Lookups = ReturnType<typeof lookAround>;

/** How long an estimate with no house in OSM waits on the LiDAR's (ms). */
const LIDAR_WAIT_MS = 4000;

export interface FoundLot {
  lot: Polygon | MultiPolygon;
  lotSource: "cadastre" | "estimated";
  lotNumber: string | null;
}

/**
 * The lot at a point: the cadastre's in Quebec; elsewhere (Ontario's parcels
 * aren't open) one estimated around the house from OpenStreetMap's buildings
 * and streets, or the LiDAR's buildings where OSM has no house at the point
 * (estimated-lot.ts). Null when there's none (a street, no house near the
 * point); throws when the cadastre, or OSM for an estimate, can't be reached.
 */
export async function lotAt(lat: number, lon: number, looks: Lookups): Promise<FoundLot | null> {
  if (inQuebec(lat, lon)) {
    const parcel = await looks.parcel;
    return parcel && { lot: parcel.geometry, lotSource: "cadastre", lotNumber: parcel.lot };
  }
  const inputs = lotInputs(await looks.nearby);
  let estimate = estimateLot(lat, lon, inputs);
  if (!estimate) {
    // No house in OSM at the point: the LiDAR's (it started with OSM, so it's usually in by now).
    const grid = await Promise.race([looks.terrain.catch(() => null), new Promise<null>((done) => setTimeout(() => done(null), LIDAR_WAIT_MS))]);
    const { west, south, east, north } = looks.around;
    const box: Polygon = { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
    if (grid) estimate = estimateLot(lat, lon, { ...inputs, lidar: lidarBuildings(grid, box) });
  }
  return estimate && { lot: estimate.lot, lotSource: "estimated", lotNumber: null };
}

/** Marks a source as being read (over `area`, swept on the map) and returns how to mark it answered (live.ts). */
export type Track = (source: LiveSource, area?: BBox | null) => (state: "done" | "failed", found?: LiveFinding | null) => void;

/** What the live list says the lot step found. */
export const lotFinding = (found: FoundLot | null): LiveFinding =>
  !found ? { kind: "none" } : found.lotNumber ? { kind: "lot", lot: found.lotNumber } : { kind: "estimated" };

const tooBigForTerrain = (box: BBox) => box.north - box.south > TERRAIN_MAX_SPAN_DEG || box.east - box.west > TERRAIN_MAX_SPAN_DEG;

/**
 * The lawn on the lot at a point (lotAt), filled in source by source as the
 * lawn mode does (the lot first, then OpenStreetMap's buildings and paving,
 * the LiDAR's buildings and the photos' pools and paving), for a grass run's
 * stop. `onLawn` gets the lawn each time a source answers. Null when there's
 * no lot there (a street, no house); throws when the cadastre (or OSM, for
 * an estimated lot) can't be reached.
 */
export async function measureLot(
  lat: number,
  lon: number,
  track: Track,
  onLawn: (lawn: LawnMeasurement, terrain: TerrainGrid | null) => void,
): Promise<{ lawn: LawnMeasurement; terrain: TerrainGrid | null } | null> {
  const looks = lookAround(lat, lon);
  const doneLot = track("lot");
  const doneOsm = track("osm", looks.around);
  let found: FoundLot | null;
  try {
    found = await lotAt(lat, lon, looks);
  } catch (err) {
    doneLot("failed");
    doneOsm("failed");
    throw err;
  }
  doneLot("done", lotFinding(found));
  if (!found) {
    doneOsm("done", { kind: "none" });
    return null;
  }
  const lot = found.lot;
  let lawn: LawnMeasurement = {
    lot,
    lotSource: found.lotSource,
    lotNumber: found.lotNumber,
    pickPoint: [lat, lon],
    mapped: null,
    mappedFailed: false,
    kept: [],
    traced: [],
  };
  let terrain: TerrainGrid | null = null;
  const update = (patch: Partial<LawnMeasurement>) => {
    lawn = { ...lawn, ...patch };
    onLawn(lawn, terrain);
  };
  onLawn(lawn, null);
  const box = lotBBox(lot);
  const inBox = bboxContains(looks.around, box);

  const osm = (async () => {
    try {
      const json = await (inBox ? looks.nearby : fetchFairways(box, "lawn"));
      const mapped = mappedOnLot(json, lot);
      doneOsm("done", { kind: "mapped", n: mapped.length });
      update({ mapped, mappedFailed: false });
    } catch {
      doneOsm("failed");
      update({ mapped: [], mappedFailed: true });
    }
  })();

  const lidar = (async () => {
    if (tooBigForTerrain(box)) return update({ lidar: null });
    const done = track("lidar", box);
    try {
      const grid = await ((inBox && looks.terrain) || fetchTerrain(box));
      terrain = grid;
      done("done", grid.slope.some((v) => v !== NO_SLOPE) ? { kind: "read" } : { kind: "none" });
      const covered = (terrainStats(grid, [lot])?.coverage ?? 0) >= 0.5;
      const buildings: LawnArea[] | null = covered
        ? lidarBuildings(grid, lot).map((geometry, i) => ({ id: `l${i + 1}`, kind: "building", geometry }))
        : null;
      update({ lidar: buildings });
    } catch {
      done("failed");
      update({ lidar: null });
    }
  })();

  const photos = (async () => {
    const photoBox = lotBBox(lot, 0.00005);
    if (!fitsSurface(photoBox) || !inQuebec(lat, lon)) return update({ imagery: null });
    const done = track("photos", photoBox);
    try {
      const grid = await fetchSurface(photoBox);
      const areas = grid ? surfaceAreas(grid, lot) : null;
      const count = (kind: LawnArea["kind"]) => areas?.filter((a) => a.kind === kind).length ?? 0;
      done("done", areas ? { kind: "surfaces", pools: count("pool"), paved: count("paving") } : { kind: "none" });
      update({ imagery: areas });
    } catch {
      done("failed");
      update({ imagery: null });
    }
  })();

  await Promise.all([osm, lidar, photos]);
  return { lawn, terrain };
}
