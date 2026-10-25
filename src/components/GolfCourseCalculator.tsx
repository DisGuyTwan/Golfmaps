"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import area from "@turf/area";
import dynamic from "next/dynamic";
import type * as L from "leaflet";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { UI, type MeasureErrorKind } from "@/lib/i18n";
import { OverpassHttpError, bboxParam, fetchFairways, parseBBoxParam } from "@/lib/overpass";
import { SQ_METERS_TO_ACRES, TURF_COLORS, courseOutline, processOverpassData, tracedOutlineMeasurement } from "@/lib/area";
import {
  LandcoverHttpError,
  WC,
  fetchLandGrid,
  findSodFields,
  fitsSource,
  geometryBBox,
  overlayPixels,
  pointInGeometry,
  polygonMask,
  satelliteTurf,
  tracedField,
  tracedPoints,
  tracedPolygon,
  type LandGrid,
} from "@/lib/landcover";
import {
  DRIVEWAY_WIDTHS_FT,
  FT_TO_M,
  aroundPoint,
  bboxContains,
  drivewayArea,
  lawnTotals,
  lotBBox,
  mappedOnLot,
  keepPoint,
  photoAreas,
  stripAlong,
  type LawnArea,
  type LawnMeasurement,
} from "@/lib/lawn";
import { inQuebec } from "@/lib/parcel";
import { lookAround, type Lookups } from "@/lib/lot-lookups";
import { HOUSE_LOT_M2, SOD_FARM_M, SOD_LOOK_M, SOD_SHARE, golfCourseAt, propertyKind, settledByLot, sodShareAround, sodShareInside, type GolfCourse } from "@/lib/detect";
import { fetchSurface, fitsSurface, photoTurf, surfaceAreas, surfaceCover, surfaceOverlay, type SurfaceGrid } from "@/lib/surface";
import { NO_SLOPE, TERRAIN_MAX_SPAN_DEG, fetchTerrain, lidarBuildings, terrainStats, type TerrainGrid } from "@/lib/terrain";
import { beginStep, endStep, type LiveFinding, type LiveSource, type LiveStep } from "@/lib/live";
import { encodeQuote, type AcreageMode } from "@/lib/quote";
import { MAX_STOPS, SHOP, decodeRun, encodeRun } from "@/lib/run";
import { addStop, getRun, openRun, setShop, stopTotals, useRun } from "@/lib/run-store";
import {
  getLawn,
  getSod,
  getTerrain,
  setCourseName,
  setLawn,
  setMeasurement,
  registerAcreageLink,
  setMode,
  setQuoteSettings,
  setCharger,
  setSod,
  setTerrain,
  useCharger,
  useCourseName,
  useLawn,
  useMode,
  useQuoteSettings,
  useSod,
} from "@/lib/quote-store";
import { reportError } from "@/lib/report-error";
import { countUse } from "@/lib/usage";
import { buildShareUrl, decodePolyline, encodePolyline, encodeView } from "@/lib/share";
import { useLang } from "@/lib/preferences";
import type { BBox, CourseMeasurement } from "@/lib/types";
import type { LiveScan, MapOverlay, MapRun } from "./GolfMap";
import MeasurePanel, { type PanelKind } from "./MeasurePanel";
import RunPanel, { useRunPlan } from "./RunPanel";
import { useMowerFit } from "./MowerFit";
import SearchBox, { type PlaceResult } from "./SearchBox";
import { Loader } from "./ui";

// Leaflet touches `window` at import time, so the map component must never run
// on the server. Dynamically importing it with `ssr: false` keeps it client-only.
function MapLoading() {
  const lang = useLang();
  return (
    <div className="flex h-full w-full items-center justify-center bg-canvas">
      <Loader label={UI[lang].loadingMap} />
    </div>
  );
}

const GolfMap = dynamic(() => import("./GolfMap"), { ssr: false, loading: () => <MapLoading /> });

export interface MeasureError {
  kind: MeasureErrorKind;
  status?: number;
}

/** Why the satellite grass count didn't run. */
export type SatelliteError = "failed" | "tooLarge";

/**
 * What a trace is for: any property (its kind found from its size and the
 * crop map), a golf course outline, a sod field, a residential lot, an area
 * that isn't lawn, or a driveway (a line, widened to the chosen width).
 */
export type TraceKind = "property" | "outline" | "field" | "lot" | "remove" | "driveway";

/** What the next tap picks: the property under it (any kind), or a house lot. */
export type PickKind = "property" | "lot";

const boxPolygon = ({ south, west, north, east }: BBox): Polygon => ({
  type: "Polygon",
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

/** Traced areas (lx=) and driveways (ld=, "polyline:width in mm") from a share link, as lawn removals. */
function linkedRemovals(areas: string | null, driveways: string | null): LawnArea[] {
  const traced: LawnArea[] = (areas ?? "")
    .split(",")
    .map(decodePolyline)
    .filter((pts): pts is [number, number][] => pts !== null && pts.length >= 3)
    .map((pts) => ({ id: "", kind: "traced", geometry: tracedPolygon(pts) }));
  const drives = (driveways ?? "")
    .split(",")
    .map((entry) => {
      const [line, mm] = entry.split(":");
      const pts = decodePolyline(line ?? "");
      const width = Number(mm) / 1000;
      return pts && pts.length >= 2 && width > 0 && width < 30 ? drivewayArea(pts, width, "") : null;
    })
    .filter((d): d is LawnArea => d !== null);
  return [...traced, ...drives].map((a, i) => ({ ...a, id: `t${i + 1}` }));
}

/** Maps a failed Overpass request to a message type (translated at render). */
function toMeasureError(err: unknown): MeasureError {
  if (err instanceof OverpassHttpError) {
    if (err.status === 429 || err.status === 504) return { kind: "busy" };
    if (err.status === 400) return { kind: "tooLarge" };
    return { kind: "http", status: err.status };
  }
  return { kind: "unreachable" };
}

/**
 * Frames a lot (or a box: a grass run's stops) in the part of the map the
 * results panel doesn't cover, once the panel has grown to show the results
 * (two frames later).
 */
function fitAbovePanel(map: L.Map, shape: Polygon | MultiPolygon | BBox, maxZoom = 19) {
  const { south, west, north, east } = "type" in shape ? lotBBox(shape, 0) : shape;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>("[data-measure-panel]");
      const mapBox = map.getContainer().getBoundingClientRect();
      const covered = panel ? Math.max(0, mapBox.bottom - panel.getBoundingClientRect().top) : 0;
      map.fitBounds(
        [
          [south, west],
          [north, east],
        ],
        { paddingTopLeft: [24, 72], paddingBottomRight: [24, Math.min(covered + 16, mapBox.height - 140)], maxZoom },
      );
    }),
  );
}

/** Frames a grass run's stops and shop above the panel. */
function fitRun(map: L.Map) {
  const { stops, shop } = getRun();
  const points = [...stops.map((s) => s.point), ...(shop ? [shop.point] : [])];
  if (!points.length) return;
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const pad = 0.0005;
  fitAbovePanel(map, { south: Math.min(...lats) - pad, west: Math.min(...lons) - pad, north: Math.max(...lats) + pad, east: Math.max(...lons) + pad }, 17);
}

function viewBBox(map: L.Map): BBox {
  const bounds = map.getBounds();
  return { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() };
}

const GRASS_RGB = [1, 3, 5].map((i) => parseInt(TURF_COLORS.grass.slice(i, i + 2), 16)) as [number, number, number];

/** RGBA pixels over a box, as a picture laid on the map. */
function overlayOf(pixels: Uint8ClampedArray<ArrayBuffer>, width: number, height: number, bbox: BBox): MapOverlay {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0);
  const { south, west, north, east } = bbox;
  return { url: canvas.toDataURL(), bounds: [[south, west], [north, east]] };
}

/** The grass counted inside the outline, painted green over the satellite image. */
function grassOverlay(grid: LandGrid, outline: (Polygon | MultiPolygon)[]): MapOverlay {
  const pixels = overlayPixels(grid, polygonMask(grid, outline), [WC.grass], [...GRASS_RGB, 120]);
  return overlayOf(pixels, grid.width, grid.height, grid.bbox);
}

/** Inside the outline, from the photos: grass green, paving, water and roofs in their tints, woods left clear. */
function photoOverlay(grid: SurfaceGrid, inside: Uint8Array, woods: Uint8Array): MapOverlay {
  return overlayOf(surfaceOverlay(grid, inside, woods, GRASS_RGB) as Uint8ClampedArray<ArrayBuffer>, grid.width, grid.height, grid.bbox);
}

/** True when a box's middle is in Quebec, where the aerial photos are. */
const photosCover = (box: BBox) => fitsSurface(box) && inQuebec((box.south + box.north) / 2, (box.west + box.east) / 2);

/** Below this share of an outline seen in the photos (edge of the mosaic), the satellite count is used instead. */
const MIN_PHOTO_COVERAGE = 0.9;

export default function GolfCourseCalculator() {
  const lang = useLang();
  const mode = useMode();
  const sod = useSod();
  const lawn = useLawn();
  const [result, setResult] = useState<CourseMeasurement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MeasureError | null>(null);
  const [satError, setSatError] = useState<SatelliteError | null>(null);
  const [overlay, setOverlay] = useState<MapOverlay | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [firstCorner, setFirstCorner] = useState<[number, number] | null>(null);
  const [scanBox, setScanBox] = useState<
    [number, number, number, number] | null
  >(null);
  const [tracing, setTracing] = useState<TraceKind | null>(null);
  const [tracePoints, setTracePoints] = useState<[number, number][]>([]);
  /** The next tap picks the property (or, in lawn mode, the lot) under it. */
  const [picking, setPicking] = useState<PickKind | null>(null);
  /** The rep picked the kind of property by hand (Change), so the panel shows that kind's tools before any result. */
  const [chosen, setChosen] = useState(false);
  /** What's being read right now, source by source (live.ts): listed in the panel, swept on the map. */
  const [live, setLive] = useState<LiveStep[]>([]);
  /** The point tapped or searched, pulsing on the map while the property there is found. */
  const [ping, setPing] = useState<[number, number] | null>(null);
  /** Width of the driveway being traced, in feet (one car by default). */
  const [driveWidthFt, setDriveWidthFt] = useState<number>(DRIVEWAY_WIDTHS_FT[0]);
  /** The LiDAR terrain (slope, trees, buildings) for the mower fit is loading. */
  const [terrainLoading, setTerrainLoading] = useState(false);
  /** The next tap places the robot's charger. */
  const [placingCharger, setPlacingCharger] = useState(false);
  const charger = useCharger();
  const fit = useMowerFit();
  /** A grass run being planned: taps and searches add its stops (or set its shop) instead. */
  const run = useRun();
  const runPlan = useRunPlan();
  /** Why the last tap or search didn't add a stop (already in the run, or the run is full). */
  const [runNotice, setRunNotice] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  /** Bumped by every new measurement or clear, so a late answer never lands on a newer one. */
  const runId = useRef(0);
  /** Detected sod fields a share link left out, applied once the fields are found. */
  const pendingExcluded = useRef<[number, number][]>([]);
  const courseName = useCourseName();
  const quoteSettings = useQuoteSettings();

  /** A new measurement; `keepLive` carries on the live list (detection handing over to the measurement). */
  const startRun = useCallback((keepLive = false) => {
    runId.current += 1;
    if (!keepLive) {
      setLive([]);
      setPing(null);
    }
    setOverlay(null);
    setSatError(null);
    setTerrain(null);
    setTerrainLoading(false);
    setCharger(null);
    return runId.current;
  }, []);

  /**
   * Marks a source as being read for run `id` (over `area`, swept on the map)
   * and returns how to mark it answered. A newer run ignores both.
   */
  const track = useCallback((source: LiveSource, id: number, area: BBox | null = null) => {
    if (id === runId.current) setLive((steps) => beginStep(steps, source, area, Date.now()));
    return (state: "done" | "failed", found: LiveFinding | null = null) => {
      if (id === runId.current) setLive((steps) => endStep(steps, source, state, found, Date.now()));
    };
  }, []);

  /**
   * Loads the LiDAR terrain under a box (or takes a lookup already under way)
   * for the mower fit. A failure only leaves slope and trees unchecked.
   */
  const loadTerrain = useCallback(async (box: BBox | null, id: number, pending?: Promise<TerrainGrid>) => {
    if (!box || box.north - box.south > TERRAIN_MAX_SPAN_DEG || box.east - box.west > TERRAIN_MAX_SPAN_DEG) return null;
    setTerrainLoading(true);
    const done = track("lidar", id, box);
    try {
      const grid = await (pending ?? fetchTerrain(box));
      if (id !== runId.current) return null;
      setTerrain(grid);
      done("done", grid.slope.some((v) => v !== NO_SLOPE) ? { kind: "read" } : { kind: "none" });
      return grid;
    } catch (err) {
      if (id === runId.current) reportError("terrain", err);
      done("failed");
      return null;
    } finally {
      if (id === runId.current) setTerrainLoading(false);
    }
  }, [track]);

  /**
   * The terrain under a lot, and the buildings on it the LiDAR sees (houses
   * OSM doesn't have). `lidar` ends up null when there's no LiDAR for the lot,
   * so the panel can tell "none found" from "couldn't look".
   */
  const loadLotTerrain = useCallback(
    async (lot: Polygon | MultiPolygon, id: number, pending?: Promise<TerrainGrid>) => {
      const grid = await loadTerrain(lotBBox(lot), id, pending);
      const current = getLawn();
      if (!current || id !== runId.current) return;
      const covered = grid && (terrainStats(grid, [lot])?.coverage ?? 0) >= 0.5;
      const lidar: LawnArea[] | null = covered
        ? lidarBuildings(grid, lot).map((geometry, i) => ({ id: `l${i + 1}`, kind: "building", geometry }))
        : null;
      setLawn({ ...current, lidar });
    },
    [loadTerrain],
  );

  /**
   * Pools and paving on a lot from the Quebec aerial photos (surface.ts).
   * `imagery` ends up null outside Quebec or where the photos don't load, so
   * the lawn is then measured without them.
   */
  const loadLotSurface = useCallback(async (lot: Polygon | MultiPolygon, id: number) => {
    const box = lotBBox(lot, 0.00005);
    const update = (imagery: LawnMeasurement["imagery"]) => {
      const current = getLawn();
      if (current && id === runId.current) setLawn({ ...current, imagery });
    };
    if (!fitsSurface(box) || !inQuebec((box.south + box.north) / 2, (box.west + box.east) / 2)) return update(null);
    const done = track("photos", id, box);
    try {
      const grid = await fetchSurface(box);
      const areas = grid ? surfaceAreas(grid, lot) : null;
      const count = (kind: LawnArea["kind"]) => areas?.filter((a) => a.kind === kind).length ?? 0;
      done("done", areas ? { kind: "surfaces", pools: count("pool"), paved: count("paving") } : { kind: "none" });
      update(areas);
    } catch (err) {
      if (id === runId.current) reportError("lawn:surface", err);
      done("failed");
      update(null);
    }
  }, [track]);

  /**
   * Counts the grass inside a course's outline (no turf mapped, or traced):
   * on the aerial photos with the LiDAR in Quebec, the engine every
   * measurement shares, else on satellite land cover.
   */
  const countSatellite = useCallback(async (m: CourseMeasurement, id: number) => {
    const outline = courseOutline(m);
    const box = geometryBBox(outline);
    if (!box || (!photosCover(box) && !fitsSource(box, "worldcover"))) {
      setSatError("tooLarge");
      return;
    }
    let doneSatellite: ReturnType<typeof track> | null = null;
    try {
      if (photosCover(box)) {
        const donePhotos = track("photos", id, box);
        try {
          const photos = await fetchSurface(box);
          if (id !== runId.current) return;
          const seen = photos && surfaceCover(photos, outline);
          if (photos && seen && seen.cover.totalM2 > 0 && 1 - seen.cover.unknownM2 / seen.cover.totalM2 >= MIN_PHOTO_COVERAGE) {
            const next = { ...m, satellite: photoTurf(seen.cover) };
            donePhotos("done", { kind: "grass", acres: next.satellite.grassAcres });
            setResult(next);
            setMeasurement(next);
            setOverlay(photoOverlay(photos, seen.inside, seen.woods));
            return;
          }
          donePhotos("done", { kind: "none" });
        } catch (err) {
          if (id !== runId.current) return;
          donePhotos("failed");
          reportError("surface:golf", err);
        }
        if (!fitsSource(box, "worldcover")) {
          setSatError("failed");
          return;
        }
      }
      doneSatellite = track("satellite", id, box);
      const grid = await fetchLandGrid("worldcover", box);
      if (id !== runId.current) return;
      const next = { ...m, satellite: satelliteTurf(grid, outline) };
      doneSatellite("done", { kind: "grass", acres: next.satellite.grassAcres });
      setResult(next);
      setMeasurement(next);
      setOverlay(grassOverlay(grid, outline));
    } catch (err) {
      if (id !== runId.current) return;
      doneSatellite?.("failed");
      setSatError("failed");
      reportError("landcover:worldcover", err);
    }
  }, [track]);

  const showOutline = useCallback(
    (m: CourseMeasurement) => {
      const id = startRun();
      setError(null);
      setResult(m);
      setMeasurement(m);
      void countSatellite(m, id);
      void loadTerrain(geometryBBox(courseOutline(m)), id);
    },
    [startRun, countSatellite, loadTerrain],
  );

  const runMeasure = useCallback(
    async (bboxOverride?: BBox, keepLive = false) => {
      const map = mapRef.current;
      if (!map && !bboxOverride) return;
      const id = startRun(keepLive);
      setLoading(true);
      setError(null);
      const box = bboxOverride ?? viewBBox(map!);
      const done = track("osm", id, box);

      try {
        const overpassJson = await fetchFairways(box);
        if (id !== runId.current) return;
        const measurement = processOverpassData(overpassJson);
        done(
          "done",
          measurement.found ? { kind: "golf", fairways: measurement.fairway.count, outlineOnly: measurement.boundaryOnly } : { kind: "course", name: null },
        );
        setResult(measurement);
        setMeasurement(measurement);
        if (measurement.boundaryOnly) void countSatellite(measurement, id);
        if (measurement.found) void loadTerrain(geometryBBox(courseOutline(measurement)), id);
      } catch (err) {
        if (id !== runId.current) return;
        const measureError = toMeasureError(err);
        done("failed");
        setError(measureError);
        reportError(`measure:${measureError.kind}${measureError.status ? `:${measureError.status}` : ""}`, err);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [startRun, track, countSatellite, loadTerrain],
  );

  /**
   * Measures the detected sod fields on the aerial photos (Quebec): the crop
   * map's 30 m fields take in farm roads, hedgerows, buildings and ditches,
   * which the photos and the LiDAR leave out. Bare ground (a field just
   * harvested) still counts. A failure keeps the crop map's acres.
   */
  const measureSodOnPhotos = useCallback(async (id: number) => {
    const fields = (getSod()?.fields ?? []).filter((f) => !f.traced);
    const box = geometryBBox(fields.map((f) => f.geometry), 0.0003);
    if (!box || !photosCover(box)) return;
    const done = track("photos", id, box);
    try {
      const photos = await fetchSurface(box);
      const current = getSod();
      if (!photos || !current || id !== runId.current) return done("done", { kind: "none" });
      const acres = new Map<string, number>();
      for (const f of current.fields) {
        if (f.traced) continue;
        const { cover } = surfaceCover(photos, [f.geometry]);
        if (cover.totalM2 > 0 && cover.unknownM2 / cover.totalM2 <= 1 - MIN_PHOTO_COVERAGE) acres.set(f.id, cover.grassM2 * SQ_METERS_TO_ACRES);
      }
      done("done", acres.size ? { kind: "fields", n: acres.size } : { kind: "none" });
      if (!acres.size) return;
      setSod({ ...current, photos: true, fields: current.fields.map((f) => (acres.has(f.id) ? { ...f, acres: acres.get(f.id)! } : f)) });
    } catch (err) {
      if (id === runId.current) reportError("surface:sod", err);
      done("failed");
    }
  }, [track]);

  /** Finds the sod fields in view (or in the scan box) on the crop map; traced fields are kept. */
  const runSod = useCallback(
    async (bboxOverride?: BBox, keepLive = false) => {
      const map = mapRef.current;
      if (!map && !bboxOverride) return;
      const bbox = bboxOverride ?? viewBBox(map!);
      const id = startRun(keepLive);
      setError(null);
      if (!fitsSource(bbox, "aci")) {
        setError({ kind: "sodTooLarge" });
        return;
      }
      setLoading(true);
      const done = track("crop", id, bbox);

      try {
        const grid = await fetchLandGrid("aci", bbox);
        if (id !== runId.current) return;
        const excluded = pendingExcluded.current;
        pendingExcluded.current = [];
        const detected = findSodFields(grid).map((f) =>
          excluded.some(([lat, lon]) => pointInGeometry(lon, lat, f.geometry)) ? { ...f, included: false } : f,
        );
        const traced = (getSod()?.fields ?? []).filter((f) => f.traced);
        done("done", { kind: "fields", n: detected.length });
        setSod({ fields: [...detected, ...traced], year: grid.year });
        void loadTerrain(geometryBBox([...detected, ...traced].map((f) => f.geometry)), id);
        void measureSodOnPhotos(id);
      } catch (err) {
        if (id !== runId.current) return;
        const kind = err instanceof LandcoverHttpError && err.status === 400 ? "sodTooLarge" : "sodUnreachable";
        done("failed");
        setError({ kind });
        reportError(`sod:${kind}`, err);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [startRun, track, loadTerrain, measureSodOnPhotos],
  );

  /**
   * Shows a lawn on its lot and fills in what OSM has on it (buildings, pools,
   * paving), from a lookup already under way around the lot when there is one.
   */
  const showLawn = useCallback(async (next: LawnMeasurement, id: number, nearby?: Promise<unknown>, terrain?: Promise<TerrainGrid>) => {
    setLawn(next);
    void loadLotTerrain(next.lot, id, terrain);
    void loadLotSurface(next.lot, id);
    const done = track("osm", id, lotBBox(next.lot));
    try {
      const json = await (nearby ?? fetchFairways(lotBBox(next.lot), "lawn"));
      if (id !== runId.current) return;
      const mapped = mappedOnLot(json, next.lot);
      done("done", { kind: "mapped", n: mapped.length });
      setLawn({ ...(getLawn() ?? next), mapped, mappedFailed: false });
    } catch (err) {
      if (id !== runId.current) return;
      done("failed");
      setLawn({ ...(getLawn() ?? next), mapped: [], mappedFailed: true });
      reportError("lawn:buildings", err);
    }
  }, [track, loadLotTerrain, loadLotSurface]);

  /** The lawn on the cadastre lot at a point: a searched address, a tap or a share link. */
  const runLawn = useCallback(
    async (lat: number, lon: number, traced: LawnArea[] = [], kept: [number, number][] = [], started?: { id: number; looks: Lookups }) => {
      const id = started?.id ?? startRun();
      setLoading(true);
      setError(null);
      setLawn(null);
      // Buildings and paving around the point, looked up while the lot loads.
      const { around, nearby, terrain, parcel: lookup } = started?.looks ?? lookAround(lat, lon);
      // Picked as a lot: the point pulses while the cadastre answers (a detection already did that).
      const doneLot = started ? null : track("lot", id);
      if (!started) {
        setPing([lat, lon]);
        track("osm", id, around); // Under way already; showLawn ends it.
      }
      try {
        const parcel = await lookup;
        if (id !== runId.current) return;
        doneLot?.("done", parcel ? { kind: "lot", lot: parcel.lot } : { kind: "none" });
        setPing(null);
        if (!parcel) {
          setError({ kind: "noLot" });
          return;
        }
        const next: LawnMeasurement = {
          lot: parcel.geometry,
          lotSource: "cadastre",
          lotNumber: parcel.lot,
          pickPoint: [lat, lon],
          mapped: null,
          mappedFailed: false,
          kept,
          traced,
        };
        if (mapRef.current) fitAbovePanel(mapRef.current, parcel.geometry);
        const inBox = bboxContains(around, lotBBox(parcel.geometry));
        await showLawn(next, id, (inBox && nearby) || undefined, (inBox && terrain) || undefined);
      } catch (err) {
        if (id !== runId.current) return;
        doneLot?.("failed");
        setPing(null);
        setError({ kind: "lotUnreachable" });
        reportError("lawn:lot", err);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [startRun, track, showLawn],
  );

  /** The lawn on a lot traced by hand (no cadastre here, e.g. Ontario). */
  const showTracedLot = useCallback(
    async (lot: Polygon, traced: LawnArea[] = [], kept: [number, number][] = []) => {
      const id = startRun();
      setLoading(true);
      setError(null);
      try {
        const next: LawnMeasurement = { lot, lotSource: "traced", lotNumber: null, pickPoint: null, mapped: null, mappedFailed: false, kept, traced };
        await showLawn(next, id);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [startRun, showLawn],
  );

  /**
   * The property at a point (a tap, or a place searched), whatever it is:
   * detect.ts tells a house lot, a sod farm and a golf course apart from the
   * cadastre lot, the crop map and OpenStreetMap's course outlines, and it's
   * measured as that. A house lot doesn't wait on the slower lookups.
   */
  const selectProperty = useCallback(
    async (lat: number, lon: number, name: string | null = null) => {
      const id = startRun();
      setChosen(false);
      setLoading(true);
      setError(null);
      setPing([lat, lon]);
      const looks = lookAround(lat, lon);
      const doneLot = track("lot", id);
      // The OpenStreetMap lookup starts now; the golf check or the lawn (showLawn) ends it.
      const doneOsm = track("osm", id, looks.around);
      const cropBox = aroundPoint(lat, lon, SOD_LOOK_M);
      const doneCrop = track("crop", id, cropBox);
      const sodShare = fetchLandGrid("aci", cropBox).then(
        (grid) => {
          const share = sodShareAround(grid, lat, lon, SOD_LOOK_M);
          doneCrop("done", { kind: "sod", share });
          return share;
        },
        () => {
          doneCrop("failed");
          return 0;
        },
      );
      const lot = await looks.parcel.catch(() => {
        doneLot("failed");
        return null;
      });
      if (id !== runId.current) return;
      doneLot("done", lot ? { kind: "lot", lot: lot.lot } : { kind: "none" });
      const lotM2 = lot ? area({ type: "Feature", geometry: lot.geometry, properties: {} }) : null;
      let kind: AcreageMode = "lawn";
      let course: GolfCourse | null = null;
      if (!settledByLot(lotM2)) {
        const sod = await sodShare;
        if (id !== runId.current) return;
        if (sod < SOD_SHARE) {
          course = await looks.nearby.then(
            (json) => golfCourseAt(json, lat, lon),
            () => null,
          );
          doneOsm("done", { kind: "course", name: course?.name ?? null });
        }
        if (id !== runId.current) return;
        kind = propertyKind({ lotM2, sodShare: sod, inGolfCourse: course !== null });
      }
      // A sod farm doesn't need it.
      if (kind === "sod") doneOsm("done", { kind: "read" });
      setPing(null);
      setMode(kind);
      // A lot bigger than a house's that isn't a course or a farm is a commercial or municipal site.
      const commercialSite = kind === "lawn" && lotM2 !== null && lotM2 >= HOUSE_LOT_M2;
      setQuoteSettings({ commercial: commercialSite });
      countUse(commercialSite ? "measure.site" : `measure.${kind}`);
      setCourseName(name ?? course?.name ?? null);
      const map = mapRef.current;
      if (kind === "golf" && course) {
        if (map) fitAbovePanel(map, course.geometry);
        void runMeasure(geometryBBox([course.geometry], 0.001) ?? aroundPoint(lat, lon), true);
      } else if (kind === "sod") {
        const farm = aroundPoint(lat, lon, SOD_FARM_M);
        if (map) fitAbovePanel(map, boxPolygon(farm));
        void runSod(farm, true);
      } else {
        await runLawn(lat, lon, [], [], { id, looks });
      }
    },
    [startRun, track, runMeasure, runSod, runLawn],
  );

  /**
   * A property traced by hand, its kind found like a tapped one: a lot under
   * a house lot's size is a lawn; bigger, a sod field when the crop map has
   * sod in most of it, else a course or grounds outline measured on the
   * photos (golf).
   */
  const traceProperty = useCallback(
    async (points: [number, number][]) => {
      const outline = tracedPolygon(points);
      setChosen(false);
      if (area({ type: "Feature", geometry: outline, properties: {} }) < HOUSE_LOT_M2) {
        setMode("lawn");
        setQuoteSettings({ commercial: false });
        void showTracedLot(outline);
        return;
      }
      const box = geometryBBox([outline], 0);
      const id = startRun();
      const done = track("crop", id, box);
      const sod = box && fitsSource(box, "aci") ? await fetchLandGrid("aci", box).then((g) => sodShareInside(g, outline), () => 0) : 0;
      if (id !== runId.current) return;
      done("done", { kind: "sod", share: sod });
      if (sod >= SOD_SHARE) {
        setMode("sod");
        startRun();
        setSod({ fields: [tracedField(points, "t1")], year: null });
        void loadTerrain(box, runId.current);
        return;
      }
      setMode("golf");
      showOutline(tracedOutlineMeasurement(outline));
    },
    [showTracedLot, startRun, track, loadTerrain, showOutline],
  );

  const measure = mode === "sod" ? runSod : runMeasure;

  // A share link reopens what was measured: a traced course outline (o=), the
  // traced sod fields (sf=) and the detected ones left out (sx=), a lawn's lot
  // (lp= the point picked, or lo= a traced lot), its traced-out areas (lx=, ld=)
  // and the photo areas kept as lawn (lk=), the robot's charger (ch=), and with
  // m=1 measures again in the scan box (b=) if one was drawn, else the
  // linked view (v=, applied by GolfMap). Runs once, so its callbacks must stay
  // stable.
  const handleMapReady = useCallback(
    (map: L.Map) => {
      mapRef.current = map;
      const params = new URLSearchParams(window.location.search);
      const linkedRun = decodeRun(params);
      if (linkedRun) {
        openRun(linkedRun);
        map.whenReady(() => fitRun(map));
        return;
      }
      const box = parseBBoxParam(params.get("b"));
      const a = params.get("a");
      const linkedMode: AcreageMode = a === "sod" || a === "lawn" ? a : "golf";
      // The charger (ch=) is set after the measurement starts, which clears it.
      const [chLat, chLon] = (params.get("ch") ?? "").split(",").map(Number);
      const reopen = () => {
        if (linkedMode === "lawn") {
          const removals = linkedRemovals(params.get("lx"), params.get("ld"));
          const kept = decodePolyline(params.get("lk") ?? "") ?? [];
          const lot = decodePolyline(params.get("lo") ?? "");
          const [lat, lon] = (params.get("lp") ?? "").split(",").map(Number);
          if (lot && lot.length >= 3) void showTracedLot(tracedPolygon(lot), removals, kept);
          else if (Number.isFinite(lat) && Number.isFinite(lon)) void runLawn(lat, lon, removals, kept);
          return;
        }
        if (linkedMode === "sod") {
          const traced = (params.get("sf") ?? "")
            .split(",")
            .map(decodePolyline)
            .filter((pts): pts is [number, number][] => pts !== null && pts.length >= 3)
            .map((pts, i) => tracedField(pts, `t${i + 1}`));
          if (traced.length) setSod({ fields: traced, year: null });
          pendingExcluded.current = decodePolyline(params.get("sx") ?? "") ?? [];
        } else {
          const outline = decodePolyline(params.get("o") ?? "");
          if (outline && outline.length >= 3) {
            showOutline(tracedOutlineMeasurement(tracedPolygon(outline)));
            return;
          }
        }
        if (params.get("m") !== "1") return;
        if (box) setScanBox([box.south, box.west, box.north, box.east]);
        void (linkedMode === "sod" ? runSod : runMeasure)(box ?? undefined);
      };
      map.whenReady(() => {
        reopen();
        if (Number.isFinite(chLat) && Number.isFinite(chLon) && params.get("ch")) setCharger([chLat, chLon]);
      });
    },
    [runMeasure, runSod, showOutline, runLawn, showTracedLot],
  );

  const getShareUrl = useCallback(() => {
    const map = mapRef.current;
    const center = map?.getCenter();
    if (run.open) {
      return buildShareUrl(window.location, {
        v: map && center ? encodeView(center.lat, center.lng, map.getZoom()) : undefined,
        ...encodeRun({ stops: run.stops.map(({ point, label }) => ({ point, label })), shop: run.shop, settings: run.settings }),
      });
    }
    const box = scanBox ? { south: scanBox[0], west: scanBox[1], north: scanBox[2], east: scanBox[3] } : null;
    const common = {
      v: map && center ? encodeView(center.lat, center.lng, map.getZoom()) : undefined,
      b: box ? bboxParam(box) : undefined,
      n: courseName ?? undefined,
      ch: charger ? `${charger[0].toFixed(5)},${charger[1].toFixed(5)}` : undefined,
    };
    if (mode === "lawn") {
      const pick = lawn?.pickPoint;
      return buildShareUrl(window.location, {
        a: "lawn",
        v: common.v,
        n: common.n,
        ch: common.ch,
        lp: pick ? `${pick[0].toFixed(6)},${pick[1].toFixed(6)}` : undefined,
        lo: lawn?.lotSource === "traced" ? encodePolyline(tracedPoints(lawn.lot)) : undefined,
        lx: (lawn?.traced ?? [])
          .filter((t) => t.kind !== "driveway")
          .map((t) => encodePolyline(tracedPoints(t.geometry)))
          .join(","),
        ld: (lawn?.traced ?? [])
          .filter((t) => t.kind === "driveway" && t.path && t.widthM)
          .map((t) => `${encodePolyline(t.path!)}:${Math.round(t.widthM! * 1000)}`)
          .join(","),
        lk: lawn?.kept?.length ? encodePolyline(lawn.kept) : undefined,
        ...encodeQuote(quoteSettings, "lawn"),
      });
    }
    if (mode === "sod") {
      const fields = sod?.fields ?? [];
      return buildShareUrl(window.location, {
        a: "sod",
        ...common,
        m: sod?.year != null ? 1 : undefined,
        sf: fields
          .filter((f) => f.traced && f.included)
          .map((f) => encodePolyline(tracedPoints(f.geometry)))
          .join(","),
        sx: encodePolyline(fields.filter((f) => !f.traced && !f.included).map((f) => f.anchor)),
        ...encodeQuote(quoteSettings, "sod"),
      });
    }
    const traced = result?.outlineTraced ? (result.geojson.features[0]?.geometry as Polygon | undefined) : undefined;
    return buildShareUrl(window.location, {
      ...common,
      m: result && !traced ? 1 : undefined,
      o: traced ? encodePolyline(tracedPoints(traced)) : undefined,
      ...encodeQuote(quoteSettings),
    });
  }, [mode, scanBox, result, sod, lawn, courseName, quoteSettings, charger, run]);
  // A proposal links back to the measurement.
  useEffect(() => {
    registerAcreageLink(getShareUrl);
    return () => registerAcreageLink(null);
  }, [getShareUrl]);

  const getSearchBias = useCallback(() => {
    const map = mapRef.current;
    if (!map) return null;
    const center = map.getCenter();
    return { lat: center.lat, lon: center.lng };
  }, []);

  const handleSearchSelect = useCallback(
    (place: PlaceResult) => {
      const map = mapRef.current;
      if (!map) return;
      // Planning a grass run: the place is the shop, or the next stop; the map frames the run with it.
      if (getRun().open) {
        if (getRun().pickingShop) {
          setShop({ point: [place.lat, place.lon], label: place.primary });
        } else {
          const added = addStop([place.lat, place.lon], place.primary);
          setRunNotice(added === "already" ? UI[lang].run.already : added === "full" ? UI[lang].run.full(MAX_STOPS) : null);
        }
        fitRun(map);
        return;
      }
      // A golf course found by name: frame it and measure the course in view.
      if (place.isGolf) {
        setChosen(false);
        setMode("golf");
        setCourseName(place.primary);
        if (place.bbox) {
          const [south, west, north, east] = place.bbox;
          map.fitBounds(
            [
              [south, west],
              [north, east],
            ],
            { maxZoom: 17, padding: [40, 40] },
          );
        } else {
          map.setView([place.lat, place.lon], 16);
        }
        map.once("moveend", () => {
          void runMeasure();
        });
        return;
      }
      // Anything else (an address, a farm, a business): the property under it, whatever it is.
      map.setView([place.lat, place.lon], 18);
      void selectProperty(place.lat, place.lon, place.primary);
    },
    [runMeasure, selectProperty, lang],
  );

  const handleStartSelect = useCallback(() => {
    setPicking(null);
    setSelecting(true);
    setFirstCorner(null);
    setScanBox(null);
  }, []);

  const handleCancelSelect = useCallback(() => {
    setSelecting(false);
    setFirstCorner(null);
  }, []);

  const handleStartTrace = useCallback((kind: TraceKind) => {
    setSelecting(false);
    setPicking(null);
    setFirstCorner(null);
    setTracing(kind);
    setTracePoints([]);
    // The panel folds away while tracing: zoom the lot into the room it leaves.
    const current = getLawn();
    if ((kind === "driveway" || kind === "remove") && current && mapRef.current) fitAbovePanel(mapRef.current, current.lot);
  }, []);

  const handleCancelTrace = useCallback(() => {
    setTracing(null);
    setTracePoints([]);
  }, []);

  const finishTrace = useCallback(
    (tapped: [number, number][]) => {
      if (tapped.length < (tracing === "driveway" ? 2 : 3)) return;
      // Rounded like a share link stores them (≈ 1 m), so a reopened link measures the same shape.
      const points = tapped.map(([lat, lon]): [number, number] => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
      if (tracing === "property") {
        void traceProperty(points);
      } else if (tracing === "outline") {
        setScanBox(null);
        showOutline(tracedOutlineMeasurement(tracedPolygon(points)));
      } else if (tracing === "lot") {
        void showTracedLot(tracedPolygon(points));
      } else if (tracing === "remove" || tracing === "driveway") {
        const current = getLawn();
        if (current) {
          const id = `t${Math.max(0, ...current.traced.map((t) => Number(t.id.slice(1)) || 0)) + 1}`;
          const area: LawnArea | null =
            tracing === "driveway"
              ? drivewayArea(points, driveWidthFt * FT_TO_M, id)
              : { id, kind: "traced", geometry: tracedPolygon(points) };
          if (area) setLawn({ ...current, traced: [...current.traced, area] });
        }
      } else {
        const fields = getSod()?.fields ?? [];
        const n = Math.max(0, ...fields.filter((f) => f.traced).map((f) => Number(f.id.slice(1)) || 0)) + 1;
        setSod({ fields: [...fields, tracedField(points, `t${n}`)], year: getSod()?.year ?? null });
      }
      setTracing(null);
      setTracePoints([]);
    },
    [tracing, showOutline, showTracedLot, traceProperty, driveWidthFt],
  );

  const handleMapClick = useCallback(
    (latlng: [number, number]) => {
      if (getRun().open) {
        if (getRun().pickingShop) {
          setShop({ point: latlng, label: null });
          return;
        }
        const added = addStop(latlng);
        setRunNotice(added === "already" ? UI[lang].run.already : added === "full" ? UI[lang].run.full(MAX_STOPS) : null);
        return;
      }
      if (placingCharger) {
        setCharger(latlng);
        setPlacingCharger(false);
        return;
      }

      if (tracing) {
        // Tapping near the first point closes the shape (not a driveway: that's a line).
        const map = mapRef.current;
        if (map && tracing !== "driveway" && tracePoints.length >= 3) {
          const first = map.latLngToContainerPoint(tracePoints[0]);
          if (first.distanceTo(map.latLngToContainerPoint(latlng)) < 16) {
            finishTrace(tracePoints);
            return;
          }
        }
        setTracePoints((points) => [...points, latlng]);
        return;
      }

      if (picking) {
        setPicking(null);
        if (picking === "lot") void runLawn(latlng[0], latlng[1]);
        else void selectProperty(latlng[0], latlng[1]);
        return;
      }

      if (selecting) {
        if (!firstCorner) {
          setFirstCorner(latlng);
          return;
        }
        const [aLat, aLon] = firstCorner;
        const [bLat, bLon] = latlng;
        const bbox: BBox = {
          south: Math.min(aLat, bLat),
          west: Math.min(aLon, bLon),
          north: Math.max(aLat, bLat),
          east: Math.max(aLon, bLon),
        };
        setScanBox([bbox.south, bbox.west, bbox.north, bbox.east]);
        setFirstCorner(null);
        setSelecting(false);
        void measure(bbox);
        return;
      }

      // Nothing measured yet (and no kind picked by hand): a tap picks the property under it.
      const shown = mode === "golf" ? result !== null : mode === "sod" ? getSod() !== null : getLawn() !== null;
      if (!shown && !chosen) {
        if (!loading) void selectProperty(latlng[0], latlng[1]);
        return;
      }

      // Lawn: a tap on an area traced out puts it back; on a pool or paving
      // from the photos it keeps it as lawn, or takes it out again.
      if (mode === "lawn") {
        const current = getLawn();
        if (!current) return;
        const inside = (g: Polygon | MultiPolygon) => pointInGeometry(latlng[1], latlng[0], g);
        const hit = [...current.traced].reverse().find((t) => inside(t.geometry));
        if (hit) {
          setLawn({ ...current, traced: current.traced.filter((t) => t.id !== hit.id) });
          return;
        }
        const photos = photoAreas(current);
        const kept = photos.kept.find((a) => inside(a.geometry));
        if (kept) {
          setLawn({ ...current, kept: (current.kept ?? []).filter(([lat, lon]) => !pointInGeometry(lon, lat, kept.geometry)) });
        } else {
          const tapped = photos.removed.find((a) => inside(a.geometry));
          if (tapped) setLawn({ ...current, kept: [...(current.kept ?? []), keepPoint(tapped.geometry, latlng[0], latlng[1])] });
        }
        return;
      }

      // Sod: a tap on a field takes it out of the quote, or puts it back.
      // Traced fields are drawn on top, so they're checked first.
      const current = getSod();
      if (mode !== "sod" || !current) return;
      const hit = [...current.fields].reverse().find((f) => pointInGeometry(latlng[1], latlng[0], f.geometry));
      if (!hit) return;
      setSod({
        ...current,
        fields: current.fields.map((f) => (f.id === hit.id ? { ...f, included: !f.included } : f)),
      });
    },
    [placingCharger, tracing, tracePoints, finishTrace, picking, runLawn, selectProperty, selecting, firstCorner, measure, mode, result, chosen, loading, lang],
  );

  const resetView = useCallback(() => {
    startRun();
    setResult(null);
    setLoading(false);
    setError(null);
    setScanBox(null);
    setFirstCorner(null);
    setSelecting(false);
    setPicking(null);
    setTracing(null);
    setTracePoints([]);
  }, [startRun]);

  const handleClear = useCallback(() => {
    resetView();
    setMeasurement(null);
    setSod(null);
    setLawn(null);
    setCourseName(null);
    setChosen(false);
  }, [resetView]);

  const handleModeChange = useCallback(
    (kind: PanelKind) => {
      setChosen(true);
      // A commercial site is a lawn quoted in acres: switching between the two keeps the measurement.
      const next: AcreageMode = kind === "site" ? "lawn" : kind;
      setQuoteSettings({ commercial: kind === "site" });
      if (next === mode) return;
      resetView();
      setMode(next);
    },
    [mode, resetView],
  );

  const totals = useMemo(() => (lawn ? lawnTotals(lawn) : null), [lawn]);

  // The areas being read right now, swept on the map (on a grass run, each stop's and the roads').
  const scans = useMemo<LiveScan[]>(() => {
    const steps = run.open
      ? [
          ...run.stops.flatMap((stop) => stop.live.map((step) => ({ step, key: `${stop.id}-${step.source}` }))),
          ...run.roads.live.map((step) => ({ step, key: "run-roads" })),
        ]
      : live.map((step) => ({ step, key: step.source }));
    return steps
      .filter(({ step }) => step.state === "active" && step.area)
      .map(({ step, key }) => ({ key, bounds: [[step.area!.south, step.area!.west], [step.area!.north, step.area!.east]] }));
  }, [live, run]);

  // A grass run on the map: each stop numbered in the run's order, the shop, and each leg along the roads
  // (a straight line until they've loaded, or where they don't join two places).
  const mapRun = useMemo<MapRun | null>(() => {
    if (!run.open) return null;
    // A portfolio's sites are numbered as listed, with no driving between them.
    if (run.settings.portfolio)
      return {
        stops: run.stops.map((s, i) => ({ key: s.id, point: s.point, n: i + 1, loading: s.state === "waiting" || s.state === "measuring" })),
        shop: null,
        legs: [],
      };
    const { plan, route, leg } = runPlan;
    const order = new Map(plan.stops.map((p, k) => [p.index, k + 1]));
    const shop = run.shop?.point ?? null;
    const places = [...(shop ? [SHOP] : []), ...plan.stops.map((p) => p.index), ...(shop && plan.stops.length ? [SHOP] : [])];
    return {
      stops: run.stops.map((s, i) => ({ key: s.id, point: s.point, n: order.get(i) ?? null, loading: s.state === "waiting" || s.state === "measuring" })),
      shop,
      legs: places.slice(1).map((to, k) => {
        const road = leg(places[k], to);
        return road ? { path: road.path, road: true } : { path: [route[k], route[k + 1]], road: false };
      }),
    };
  }, [run, runPlan]);

  const mapGeojson = useMemo<FeatureCollection | null>(() => {
    if (run.open) {
      // Each stop's lot, and its lawn once measured.
      return {
        type: "FeatureCollection",
        features: run.stops.flatMap((s) => {
          if (!s.lawn) return [];
          const lawnGeom = s.state === "done" ? stopTotals(s.lawn).lawn : null;
          return [
            ...(lawnGeom ? [{ type: "Feature" as const, geometry: lawnGeom, properties: { _category: "lawn" } }] : []),
            { type: "Feature" as const, geometry: s.lawn.lot, properties: { _category: "course" } },
          ];
        }),
      };
    }
    if (mode === "golf") return result?.geojson ?? null;
    if (mode === "lawn") {
      if (!lawn) return null;
      const feature = (geometry: Polygon | MultiPolygon, category: string) => ({
        type: "Feature" as const,
        geometry,
        properties: { _category: category },
      });
      const photos = photoAreas(lawn);
      // While a driveway is traced, show the strip at the chosen width.
      const preview =
        tracing === "driveway" && tracePoints.length >= 2
          ? stripAlong(tracePoints.map(([lat, lon]) => [lon, lat]), driveWidthFt * FT_TO_M)
          : null;
      return {
        type: "FeatureCollection",
        features: [
          ...(totals?.lawn ? [feature(totals.lawn, "lawn")] : []),
          ...(lawn.mapped ?? []).map((a) => feature(a.geometry, a.kind === "paving" ? "lawn_paved" : "lawn_built")),
          ...(lawn.lidar ?? []).map((a) => feature(a.geometry, "lawn_built")),
          ...photos.removed.map((a) => feature(a.geometry, a.kind === "paving" ? "lawn_paved" : "lawn_built")),
          ...photos.kept.map((a) => feature(a.geometry, "lawn_kept")),
          ...lawn.traced.map((a) => feature(a.geometry, "lawn_removed")),
          ...(preview ? [feature(preview, "lawn_removed")] : []),
          feature(lawn.lot, "course"),
        ],
      };
    }
    if (!sod) return null;
    return {
      type: "FeatureCollection",
      features: sod.fields.map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: { _category: !f.included ? "sod_off" : f.traced ? "sod_traced" : "sod" },
      })),
    };
  }, [mode, result, sod, lawn, totals, tracing, tracePoints, driveWidthFt, run]);

  return (
    <div className="relative h-full w-full">
      <GolfMap
        lang={lang}
        geojson={mapGeojson}
        capturing={run.open || selecting || picking !== null || placingCharger || tracing !== null}
        charger={!run.open && fit?.site.charger ? [fit.site.charger[1], fit.site.charger[0]] : null}
        firstCorner={firstCorner}
        tracePoints={tracing ? tracePoints : null}
        overlay={mode === "golf" && !run.open ? overlay : null}
        scanBox={run.open ? null : scanBox}
        scans={scans}
        ping={run.open ? null : ping}
        run={mapRun}
        onMapClick={handleMapClick}
        onMapReady={handleMapReady}
      />

      <SearchBox
        onSelect={handleSearchSelect}
        getBias={getSearchBias}
        lang={lang}
        placeholder={
          run.open
            ? run.pickingShop
              ? UI[lang].run.searchShop
              : run.settings.portfolio
                ? UI[lang].run.searchSite
                : UI[lang].run.searchStop
            : UI[lang].searchAnyPlaceholder
        }
        clearOnSelect={run.open}
      />

      {run.open ? (
        <RunPanel
          lang={lang}
          notice={runNotice}
          planned={runPlan}
          getShareUrl={getShareUrl}
          getBias={getSearchBias}
          onImported={() => mapRef.current && fitRun(mapRef.current)}
        />
      ) : (
        <MeasurePanel
          lang={lang}
          mode={mode}
          result={mode === "golf" ? result : null}
          sod={mode === "sod" ? sod : null}
          lawn={mode === "lawn" ? lawn : null}
          lawnTotals={mode === "lawn" ? totals : null}
          picking={picking}
          chosen={chosen}
          driveWidthFt={driveWidthFt}
          onDriveWidth={setDriveWidthFt}
          onStartPick={(kind) => {
            setSelecting(false);
            setTracing(null);
            setPicking(kind);
          }}
          onCancelPick={() => setPicking(null)}
          loading={loading}
          error={error}
          live={live}
          satError={satError}
          terrainLoading={terrainLoading}
          placingCharger={placingCharger}
          onMoveCharger={() => {
            setSelecting(false);
            setTracing(null);
            setPicking(null);
            setPlacingCharger(true);
          }}
          onCancelCharger={() => setPlacingCharger(false)}
          selecting={selecting}
          awaitingSecondCorner={firstCorner !== null}
          tracing={tracing}
          tracePointCount={tracePoints.length}
          onModeChange={handleModeChange}
          onMeasure={() => void measure()}
          onStartSelect={handleStartSelect}
          onCancelSelect={handleCancelSelect}
          onStartTrace={handleStartTrace}
          onUndoPoint={() => setTracePoints((points) => points.slice(0, -1))}
          onFinishTrace={() => finishTrace(tracePoints)}
          onCancelTrace={handleCancelTrace}
          onClear={handleClear}
          getShareUrl={getShareUrl}
          runStops={run.stops.length}
          onStartRun={(withLawn) => {
            setRunNotice(null);
            const current = getLawn();
            openRun(null, withLawn && current ? { lawn: current, terrain: getTerrain(), label: courseName } : undefined);
          }}
        />
      )}
    </div>
  );
}
