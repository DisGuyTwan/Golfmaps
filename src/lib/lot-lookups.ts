/**
 * Looking up a lot and what's on it, shared by the lawn mode and a grass
 * run's stops: the cadastre lot at a point, what OpenStreetMap has around it
 * (buildings, paving, and the golf course holding it), the LiDAR (slope,
 * trees, the buildings OSM misses) and the aerial photos (pools, paving).
 * Lookups only: the arithmetic is in lawn.ts, terrain.ts and surface.ts.
 */
import { aroundPoint, bboxContains, lotBBox, mappedOnLot, type LawnArea, type LawnMeasurement } from "./lawn";
import type { LiveFinding, LiveSource } from "./live";
import { fetchFairways } from "./overpass";
import { fetchParcel, inQuebec } from "./parcel";
import { fetchSurface, fitsSurface, surfaceAreas } from "./surface";
import { NO_SLOPE, TERRAIN_MAX_SPAN_DEG, fetchTerrain, lidarBuildings, terrainStats, type TerrainGrid } from "./terrain";
import type { BBox } from "./types";

/**
 * The lookups at a point that every kind of property needs, started at once:
 * what OpenStreetMap has around it (buildings, paving, and the golf course
 * holding it), the LiDAR, and the cadastre lot (Quebec).
 */
export function lookAround(lat: number, lon: number) {
  const around = aroundPoint(lat, lon);
  const nearby = fetchFairways(around, "lawn");
  nearby.catch(() => {}); // Handled by whoever uses it, or unused.
  const terrain = inQuebec(lat, lon) ? fetchTerrain(around) : null;
  terrain?.catch(() => {}); // Likewise, by whoever loads the terrain.
  const parcel = inQuebec(lat, lon) ? fetchParcel(lat, lon) : Promise.resolve(null);
  parcel.catch(() => {}); // Likewise, by whoever reads the lot.
  return { around, nearby, terrain, parcel };
}
export type Lookups = ReturnType<typeof lookAround>;

/** Marks a source as being read (over `area`, swept on the map) and returns how to mark it answered (live.ts). */
export type Track = (source: LiveSource, area?: BBox | null) => (state: "done" | "failed", found?: LiveFinding | null) => void;

const tooBigForTerrain = (box: BBox) => box.north - box.south > TERRAIN_MAX_SPAN_DEG || box.east - box.west > TERRAIN_MAX_SPAN_DEG;

/**
 * The lawn on the cadastre lot at a point, filled in source by source as the
 * lawn mode does (the lot first, then OpenStreetMap's buildings and paving,
 * the LiDAR's buildings and the photos' pools and paving), for a grass run's
 * stop. `onLawn` gets the lawn each time a source answers. Null when there's
 * no lot there (outside Quebec, or on a street); throws when the cadastre
 * can't be reached.
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
  let parcel: Awaited<Lookups["parcel"]>;
  try {
    parcel = await looks.parcel;
  } catch (err) {
    doneLot("failed");
    doneOsm("failed");
    throw err;
  }
  doneLot("done", parcel ? { kind: "lot", lot: parcel.lot } : { kind: "none" });
  if (!parcel) {
    doneOsm("done", { kind: "none" });
    return null;
  }
  const lot = parcel.geometry;
  let lawn: LawnMeasurement = {
    lot,
    lotSource: "cadastre",
    lotNumber: parcel.lot,
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
    if (tooBigForTerrain(box) || !inQuebec(lat, lon)) return update({ lidar: null });
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
