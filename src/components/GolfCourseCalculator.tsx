"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type * as L from "leaflet";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { UI, type MeasureErrorKind } from "@/lib/i18n";
import { OverpassHttpError, bboxParam, fetchFairways, parseBBoxParam } from "@/lib/overpass";
import { TURF_COLORS, courseOutline, processOverpassData, tracedOutlineMeasurement } from "@/lib/area";
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
  drivewayArea,
  lawnTotals,
  lotBBox,
  mappedOnLot,
  stripAlong,
  type LawnArea,
  type LawnMeasurement,
} from "@/lib/lawn";
import { fetchParcel } from "@/lib/parcel";
import { encodeQuote, type AcreageMode } from "@/lib/quote";
import {
  getLawn,
  getSod,
  setCourseName,
  setLawn,
  setMeasurement,
  setMode,
  setSod,
  useCourseName,
  useLawn,
  useMode,
  useQuoteSettings,
  useSod,
} from "@/lib/quote-store";
import { reportError } from "@/lib/report-error";
import { buildShareUrl, decodePolyline, encodePolyline, encodeView } from "@/lib/share";
import { useLang } from "@/lib/preferences";
import type { BBox, CourseMeasurement } from "@/lib/types";
import type { MapOverlay } from "./GolfMap";
import MeasurePanel from "./MeasurePanel";
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
 * What a trace is for: a golf course outline, a sod field, a residential lot,
 * an area that isn't lawn, or a driveway (a line, widened to the chosen width).
 */
export type TraceKind = "outline" | "field" | "lot" | "remove" | "driveway";

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
 * Frames a lot in the part of the map the results panel doesn't cover, once
 * the panel has grown to show the results (two frames later).
 */
function fitAbovePanel(map: L.Map, lot: Polygon | MultiPolygon) {
  const { south, west, north, east } = lotBBox(lot, 0);
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
        { paddingTopLeft: [24, 72], paddingBottomRight: [24, Math.min(covered + 16, mapBox.height - 140)], maxZoom: 19 },
      );
    }),
  );
}

function viewBBox(map: L.Map): BBox {
  const bounds = map.getBounds();
  return { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() };
}

/** The grass counted inside the outline, painted green over the satellite image. */
function grassOverlay(grid: LandGrid, outline: (Polygon | MultiPolygon)[]): MapOverlay {
  const hex = TURF_COLORS.grass;
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const pixels = overlayPixels(grid, polygonMask(grid, outline), [WC.grass], [rgb[0], rgb[1], rgb[2], 120]);
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  canvas.getContext("2d")!.putImageData(new ImageData(pixels, grid.width, grid.height), 0, 0);
  const { south, west, north, east } = grid.bbox;
  return { url: canvas.toDataURL(), bounds: [[south, west], [north, east]] };
}

export default function GolfCourseCalculator() {
  const lang = useLang();
  const mode = useMode();
  const sod = useSod();
  const lawn = useLawn();
  const [result, setResult] = useState<CourseMeasurement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MeasureError | null>(null);
  const [satLoading, setSatLoading] = useState(false);
  const [satError, setSatError] = useState<SatelliteError | null>(null);
  const [overlay, setOverlay] = useState<MapOverlay | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [firstCorner, setFirstCorner] = useState<[number, number] | null>(null);
  const [scanBox, setScanBox] = useState<
    [number, number, number, number] | null
  >(null);
  const [tracing, setTracing] = useState<TraceKind | null>(null);
  const [tracePoints, setTracePoints] = useState<[number, number][]>([]);
  /** Lawn: the next tap picks the lot under it. */
  const [picking, setPicking] = useState(false);
  /** Width of the driveway being traced, in feet (one car by default). */
  const [driveWidthFt, setDriveWidthFt] = useState<number>(DRIVEWAY_WIDTHS_FT[0]);

  const mapRef = useRef<L.Map | null>(null);
  /** Bumped by every new measurement or clear, so a late answer never lands on a newer one. */
  const runId = useRef(0);
  /** Detected sod fields a share link left out, applied once the fields are found. */
  const pendingExcluded = useRef<[number, number][]>([]);
  const courseName = useCourseName();
  const quoteSettings = useQuoteSettings();

  const startRun = useCallback(() => {
    runId.current += 1;
    setOverlay(null);
    setSatError(null);
    setSatLoading(false);
    return runId.current;
  }, []);

  /** Counts the satellite grass inside a course's outline (no turf mapped, or traced). */
  const countSatellite = useCallback(async (m: CourseMeasurement, id: number) => {
    const outline = courseOutline(m);
    const box = geometryBBox(outline);
    if (!box || !fitsSource(box, "worldcover")) {
      setSatError("tooLarge");
      return;
    }
    setSatLoading(true);
    try {
      const grid = await fetchLandGrid("worldcover", box);
      if (id !== runId.current) return;
      const next = { ...m, satellite: satelliteTurf(grid, outline) };
      setResult(next);
      setMeasurement(next);
      setOverlay(grassOverlay(grid, outline));
    } catch (err) {
      if (id !== runId.current) return;
      setSatError("failed");
      reportError("landcover:worldcover", err);
    } finally {
      if (id === runId.current) setSatLoading(false);
    }
  }, []);

  const showOutline = useCallback(
    (m: CourseMeasurement) => {
      const id = startRun();
      setError(null);
      setResult(m);
      setMeasurement(m);
      void countSatellite(m, id);
    },
    [startRun, countSatellite],
  );

  const runMeasure = useCallback(
    async (bboxOverride?: BBox) => {
      const map = mapRef.current;
      if (!map && !bboxOverride) return;
      const id = startRun();
      setLoading(true);
      setError(null);

      try {
        const overpassJson = await fetchFairways(bboxOverride ?? viewBBox(map!));
        if (id !== runId.current) return;
        const measurement = processOverpassData(overpassJson);
        setResult(measurement);
        setMeasurement(measurement);
        if (measurement.boundaryOnly) void countSatellite(measurement, id);
      } catch (err) {
        if (id !== runId.current) return;
        const measureError = toMeasureError(err);
        setError(measureError);
        reportError(`measure:${measureError.kind}${measureError.status ? `:${measureError.status}` : ""}`, err);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [startRun, countSatellite],
  );

  /** Finds the sod fields in view (or in the scan box) on the crop map; traced fields are kept. */
  const runSod = useCallback(
    async (bboxOverride?: BBox) => {
      const map = mapRef.current;
      if (!map && !bboxOverride) return;
      const bbox = bboxOverride ?? viewBBox(map!);
      const id = startRun();
      setError(null);
      if (!fitsSource(bbox, "aci")) {
        setError({ kind: "sodTooLarge" });
        return;
      }
      setLoading(true);

      try {
        const grid = await fetchLandGrid("aci", bbox);
        if (id !== runId.current) return;
        const excluded = pendingExcluded.current;
        pendingExcluded.current = [];
        const detected = findSodFields(grid).map((f) =>
          excluded.some(([lat, lon]) => pointInGeometry(lon, lat, f.geometry)) ? { ...f, included: false } : f,
        );
        const traced = (getSod()?.fields ?? []).filter((f) => f.traced);
        setSod({ fields: [...detected, ...traced], year: grid.year });
      } catch (err) {
        if (id !== runId.current) return;
        const kind = err instanceof LandcoverHttpError && err.status === 400 ? "sodTooLarge" : "sodUnreachable";
        setError({ kind });
        reportError(`sod:${kind}`, err);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [startRun],
  );

  /** Shows a lawn on its lot and fills in what OSM has on it (buildings, pools, paving). */
  const showLawn = useCallback(async (next: LawnMeasurement, id: number) => {
    setLawn(next);
    try {
      const json = await fetchFairways(lotBBox(next.lot), "lawn");
      if (id !== runId.current) return;
      setLawn({ ...(getLawn() ?? next), mapped: mappedOnLot(json, next.lot), mappedFailed: false });
    } catch (err) {
      if (id !== runId.current) return;
      setLawn({ ...(getLawn() ?? next), mapped: [], mappedFailed: true });
      reportError("lawn:buildings", err);
    }
  }, []);

  /** The lawn on the cadastre lot at a point: a searched address, a tap or a share link. */
  const runLawn = useCallback(
    async (lat: number, lon: number, traced: LawnArea[] = []) => {
      const id = startRun();
      setLoading(true);
      setError(null);
      setLawn(null);
      try {
        const parcel = await fetchParcel(lat, lon);
        if (id !== runId.current) return;
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
          traced,
        };
        if (mapRef.current) fitAbovePanel(mapRef.current, parcel.geometry);
        await showLawn(next, id);
      } catch (err) {
        if (id !== runId.current) return;
        setError({ kind: "lotUnreachable" });
        reportError("lawn:lot", err);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [startRun, showLawn],
  );

  /** The lawn on a lot traced by hand (no cadastre here, e.g. Ontario). */
  const showTracedLot = useCallback(
    async (lot: Polygon, traced: LawnArea[] = []) => {
      const id = startRun();
      setLoading(true);
      setError(null);
      try {
        const next: LawnMeasurement = { lot, lotSource: "traced", lotNumber: null, pickPoint: null, mapped: null, mappedFailed: false, traced };
        await showLawn(next, id);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [startRun, showLawn],
  );

  const measure = mode === "sod" ? runSod : runMeasure;

  // A share link reopens what was measured: a traced course outline (o=), the
  // traced sod fields (sf=) and the detected ones left out (sx=), a lawn's lot
  // (lp= the point picked, or lo= a traced lot) and its traced-out areas (lx=),
  // and with m=1 measures again in the scan box (b=) if one was drawn, else the
  // linked view (v=, applied by GolfMap). Runs once, so its callbacks must stay
  // stable.
  const handleMapReady = useCallback(
    (map: L.Map) => {
      mapRef.current = map;
      const params = new URLSearchParams(window.location.search);
      const box = parseBBoxParam(params.get("b"));
      const a = params.get("a");
      const linkedMode: AcreageMode = a === "sod" || a === "lawn" ? a : "golf";
      map.whenReady(() => {
        if (linkedMode === "lawn") {
          const removals = linkedRemovals(params.get("lx"), params.get("ld"));
          const lot = decodePolyline(params.get("lo") ?? "");
          const [lat, lon] = (params.get("lp") ?? "").split(",").map(Number);
          if (lot && lot.length >= 3) void showTracedLot(tracedPolygon(lot), removals);
          else if (Number.isFinite(lat) && Number.isFinite(lon)) void runLawn(lat, lon, removals);
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
      });
    },
    [runMeasure, runSod, showOutline, runLawn, showTracedLot],
  );

  const getShareUrl = useCallback(() => {
    const map = mapRef.current;
    const center = map?.getCenter();
    const box = scanBox ? { south: scanBox[0], west: scanBox[1], north: scanBox[2], east: scanBox[3] } : null;
    const common = {
      v: map && center ? encodeView(center.lat, center.lng, map.getZoom()) : undefined,
      b: box ? bboxParam(box) : undefined,
      n: courseName ?? undefined,
    };
    if (mode === "lawn") {
      const pick = lawn?.pickPoint;
      return buildShareUrl(window.location, {
        a: "lawn",
        v: common.v,
        n: common.n,
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
  }, [mode, scanBox, result, sod, lawn, courseName, quoteSettings]);

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
      setCourseName(place.primary);
      // A lawn: zoom onto the house and look up the lot under the address.
      if (mode === "lawn") {
        map.setView([place.lat, place.lon], 19);
        void runLawn(place.lat, place.lon);
        return;
      }
      // A farm spreads wider than a course: frame it a step further out.
      const maxZoom = mode === "sod" ? 15 : 17;

      if (place.bbox) {
        const [south, west, north, east] = place.bbox;
        map.fitBounds(
          [
            [south, west],
            [north, east],
          ],
          { maxZoom, padding: [40, 40] },
        );
      } else {
        map.setView([place.lat, place.lon], maxZoom - 1);
      }

      // Auto-measure once the map settles: on a golf course, or anywhere for a sod farm.
      if (mode === "sod" || place.isGolf) {
        map.once("moveend", () => {
          void measure();
        });
      }
    },
    [mode, measure, runLawn],
  );

  const handleStartSelect = useCallback(() => {
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
    setPicking(false);
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
      if (tracing === "outline") {
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
    [tracing, showOutline, showTracedLot, driveWidthFt],
  );

  const handleMapClick = useCallback(
    (latlng: [number, number]) => {
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
        setPicking(false);
        void runLawn(latlng[0], latlng[1]);
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

      // Lawn: a tap on an area traced out puts it back.
      if (mode === "lawn") {
        const current = getLawn();
        const hit = current && [...current.traced].reverse().find((t) => pointInGeometry(latlng[1], latlng[0], t.geometry));
        if (current && hit) setLawn({ ...current, traced: current.traced.filter((t) => t.id !== hit.id) });
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
    [tracing, tracePoints, finishTrace, picking, runLawn, selecting, firstCorner, measure, mode],
  );

  const resetView = useCallback(() => {
    startRun();
    setResult(null);
    setLoading(false);
    setError(null);
    setScanBox(null);
    setFirstCorner(null);
    setSelecting(false);
    setPicking(false);
    setTracing(null);
    setTracePoints([]);
  }, [startRun]);

  const handleClear = useCallback(() => {
    resetView();
    setMeasurement(null);
    setSod(null);
    setLawn(null);
    setCourseName(null);
  }, [resetView]);

  const handleModeChange = useCallback(
    (next: AcreageMode) => {
      if (next === mode) return;
      resetView();
      setMode(next);
    },
    [mode, resetView],
  );

  const totals = useMemo(() => (lawn ? lawnTotals(lawn) : null), [lawn]);

  const mapGeojson = useMemo<FeatureCollection | null>(() => {
    if (mode === "golf") return result?.geojson ?? null;
    if (mode === "lawn") {
      if (!lawn) return null;
      const feature = (geometry: Polygon | MultiPolygon, category: string) => ({
        type: "Feature" as const,
        geometry,
        properties: { _category: category },
      });
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
  }, [mode, result, sod, lawn, totals, tracing, tracePoints, driveWidthFt]);

  return (
    <div className="relative h-full w-full">
      <GolfMap
        lang={lang}
        geojson={mapGeojson}
        capturing={selecting || picking || tracing !== null}
        firstCorner={firstCorner}
        tracePoints={tracing ? tracePoints : null}
        overlay={mode === "golf" ? overlay : null}
        scanBox={scanBox}
        onMapClick={handleMapClick}
        onMapReady={handleMapReady}
      />

      <SearchBox
        onSelect={handleSearchSelect}
        getBias={getSearchBias}
        lang={lang}
        placeholder={
          mode === "sod" ? UI[lang].sodSearchPlaceholder : mode === "lawn" ? UI[lang].lawnSearchPlaceholder : undefined
        }
      />

      <MeasurePanel
        lang={lang}
        mode={mode}
        result={mode === "golf" ? result : null}
        sod={mode === "sod" ? sod : null}
        lawn={mode === "lawn" ? lawn : null}
        lawnTotals={mode === "lawn" ? totals : null}
        picking={picking}
        driveWidthFt={driveWidthFt}
        onDriveWidth={setDriveWidthFt}
        onStartPick={() => {
          setSelecting(false);
          setTracing(null);
          setPicking(true);
        }}
        onCancelPick={() => setPicking(false)}
        loading={loading}
        error={error}
        satLoading={satLoading}
        satError={satError}
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
      />
    </div>
  );
}
