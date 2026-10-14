"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type * as L from "leaflet";
import { UI, type MeasureErrorKind } from "@/lib/i18n";
import { OverpassHttpError, bboxParam, fetchFairways, parseBBoxParam } from "@/lib/overpass";
import { encodeQuote } from "@/lib/quote";
import { setCourseName, setMeasurement, useCourseName, useQuoteSettings } from "@/lib/quote-store";
import { reportError } from "@/lib/report-error";
import { buildShareUrl, encodeView } from "@/lib/share";
import { useLang } from "@/lib/preferences";
import { processOverpassData } from "@/lib/area";
import type { BBox, CourseMeasurement } from "@/lib/types";
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

/** Maps a failed Overpass request to a message type (translated at render). */
function toMeasureError(err: unknown): MeasureError {
  if (err instanceof OverpassHttpError) {
    if (err.status === 429 || err.status === 504) return { kind: "busy" };
    if (err.status === 400) return { kind: "tooLarge" };
    return { kind: "http", status: err.status };
  }
  return { kind: "unreachable" };
}

export default function GolfCourseCalculator() {
  const lang = useLang();
  const [result, setResult] = useState<CourseMeasurement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MeasureError | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [firstCorner, setFirstCorner] = useState<[number, number] | null>(null);
  const [scanBox, setScanBox] = useState<
    [number, number, number, number] | null
  >(null);

  const mapRef = useRef<L.Map | null>(null);
  const courseName = useCourseName();
  const quoteSettings = useQuoteSettings();

  const runMeasure = useCallback(async (bboxOverride?: BBox) => {
    const map = mapRef.current;
    if (!map && !bboxOverride) return;

    setLoading(true);
    setError(null);

    try {
      let bbox = bboxOverride;
      if (!bbox) {
        const bounds = map!.getBounds();
        bbox = {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        };
      }
      const overpassJson = await fetchFairways(bbox);
      const measurement = processOverpassData(overpassJson);
      setResult(measurement);
      setMeasurement(measurement);
    } catch (err) {
      const measureError = toMeasureError(err);
      setError(measureError);
      reportError(`measure:${measureError.kind}${measureError.status ? `:${measureError.status}` : ""}`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  // A share link with m=1 measures again on open: the scan box (b=) if one was
  // drawn, else the linked view (v=, applied by GolfMap).
  const handleMapReady = useCallback(
    (map: L.Map) => {
      mapRef.current = map;
      const params = new URLSearchParams(window.location.search);
      if (params.get("m") !== "1") return;
      const box = parseBBoxParam(params.get("b"));
      map.whenReady(() => {
        if (box) setScanBox([box.south, box.west, box.north, box.east]);
        void runMeasure(box ?? undefined);
      });
    },
    [runMeasure],
  );

  const getShareUrl = useCallback(() => {
    const map = mapRef.current;
    const center = map?.getCenter();
    const box = scanBox ? { south: scanBox[0], west: scanBox[1], north: scanBox[2], east: scanBox[3] } : null;
    return buildShareUrl(window.location, {
      v: map && center ? encodeView(center.lat, center.lng, map.getZoom()) : undefined,
      m: result ? 1 : undefined,
      b: box ? bboxParam(box) : undefined,
      n: courseName ?? undefined,
      ...encodeQuote(quoteSettings),
    });
  }, [scanBox, result, courseName, quoteSettings]);

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

      // Auto-measure once the map settles on a golf course.
      if (place.isGolf) {
        map.once("moveend", () => {
          void runMeasure();
        });
      }
    },
    [runMeasure],
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

  const handleMapClick = useCallback(
    (latlng: [number, number]) => {
      if (!selecting) return;
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
      void runMeasure(bbox);
    },
    [selecting, firstCorner, runMeasure],
  );

  const handleClear = useCallback(() => {
    setResult(null);
    setMeasurement(null);
    setCourseName(null);
    setError(null);
    setScanBox(null);
    setFirstCorner(null);
    setSelecting(false);
  }, []);

  return (
    <div className="relative h-full w-full">
      <GolfMap
        lang={lang}
        geojson={result?.geojson ?? null}
        selecting={selecting}
        firstCorner={firstCorner}
        scanBox={scanBox}
        onMapClick={handleMapClick}
        onMapReady={handleMapReady}
      />

      <SearchBox onSelect={handleSearchSelect} getBias={getSearchBias} lang={lang} />

      <MeasurePanel
        lang={lang}
        result={result}
        loading={loading}
        error={error}
        selecting={selecting}
        awaitingSecondCorner={firstCorner !== null}
        onMeasure={() => runMeasure()}
        onStartSelect={handleStartSelect}
        onCancelSelect={handleCancelSelect}
        onClear={handleClear}
        getShareUrl={getShareUrl}
      />
    </div>
  );
}
