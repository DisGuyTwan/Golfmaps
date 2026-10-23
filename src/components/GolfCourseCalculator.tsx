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
import { encodeQuote, type AcreageMode } from "@/lib/quote";
import {
  getSod,
  setCourseName,
  setMeasurement,
  setMode,
  setSod,
  useCourseName,
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

/** What a trace is for: a golf course outline or a sod field. */
export type TraceKind = "outline" | "field";

/** Maps a failed Overpass request to a message type (translated at render). */
function toMeasureError(err: unknown): MeasureError {
  if (err instanceof OverpassHttpError) {
    if (err.status === 429 || err.status === 504) return { kind: "busy" };
    if (err.status === 400) return { kind: "tooLarge" };
    return { kind: "http", status: err.status };
  }
  return { kind: "unreachable" };
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

  const measure = mode === "sod" ? runSod : runMeasure;

  // A share link reopens what was measured: a traced course outline (o=), the
  // traced sod fields (sf=) and the detected ones left out (sx=), and with m=1
  // measures again in the scan box (b=) if one was drawn, else the linked view
  // (v=, applied by GolfMap). Runs once, so its callbacks must stay stable.
  const handleMapReady = useCallback(
    (map: L.Map) => {
      mapRef.current = map;
      const params = new URLSearchParams(window.location.search);
      const box = parseBBoxParam(params.get("b"));
      const linkedMode: AcreageMode = params.get("a") === "sod" ? "sod" : "golf";
      map.whenReady(() => {
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
    [runMeasure, runSod, showOutline],
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
  }, [mode, scanBox, result, sod, courseName, quoteSettings]);

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
    [mode, measure],
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
    setFirstCorner(null);
    setTracing(kind);
    setTracePoints([]);
  }, []);

  const handleCancelTrace = useCallback(() => {
    setTracing(null);
    setTracePoints([]);
  }, []);

  const finishTrace = useCallback(
    (tapped: [number, number][]) => {
      if (tapped.length < 3) return;
      // Rounded like a share link stores them (≈ 1 m), so a reopened link measures the same shape.
      const points = tapped.map(([lat, lon]): [number, number] => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
      if (tracing === "outline") {
        setScanBox(null);
        showOutline(tracedOutlineMeasurement(tracedPolygon(points)));
      } else {
        const fields = getSod()?.fields ?? [];
        const n = Math.max(0, ...fields.filter((f) => f.traced).map((f) => Number(f.id.slice(1)) || 0)) + 1;
        setSod({ fields: [...fields, tracedField(points, `t${n}`)], year: getSod()?.year ?? null });
      }
      setTracing(null);
      setTracePoints([]);
    },
    [tracing, showOutline],
  );

  const handleMapClick = useCallback(
    (latlng: [number, number]) => {
      if (tracing) {
        // Tapping near the first point closes the shape.
        const map = mapRef.current;
        if (map && tracePoints.length >= 3) {
          const first = map.latLngToContainerPoint(tracePoints[0]);
          if (first.distanceTo(map.latLngToContainerPoint(latlng)) < 16) {
            finishTrace(tracePoints);
            return;
          }
        }
        setTracePoints((points) => [...points, latlng]);
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
    [tracing, tracePoints, finishTrace, selecting, firstCorner, measure, mode],
  );

  const resetView = useCallback(() => {
    startRun();
    setResult(null);
    setLoading(false);
    setError(null);
    setScanBox(null);
    setFirstCorner(null);
    setSelecting(false);
    setTracing(null);
    setTracePoints([]);
  }, [startRun]);

  const handleClear = useCallback(() => {
    resetView();
    setMeasurement(null);
    setSod(null);
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

  const mapGeojson = useMemo<FeatureCollection | null>(() => {
    if (mode === "golf") return result?.geojson ?? null;
    if (!sod) return null;
    return {
      type: "FeatureCollection",
      features: sod.fields.map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: { _category: !f.included ? "sod_off" : f.traced ? "sod_traced" : "sod" },
      })),
    };
  }, [mode, result, sod]);

  return (
    <div className="relative h-full w-full">
      <GolfMap
        lang={lang}
        geojson={mapGeojson}
        capturing={selecting || tracing !== null}
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
        placeholder={mode === "sod" ? UI[lang].sodSearchPlaceholder : undefined}
      />

      <MeasurePanel
        lang={lang}
        mode={mode}
        result={mode === "golf" ? result : null}
        sod={mode === "sod" ? sod : null}
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
