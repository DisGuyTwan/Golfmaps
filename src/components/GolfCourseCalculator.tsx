"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import type * as L from "leaflet";
import { fetchFairways } from "@/lib/overpass";
import { processOverpassData } from "@/lib/area";
import {
  computeTotals,
  newShapeId,
  osmFeaturesToShapes,
  ringAcres,
  type TurfShape,
  type TurfType,
} from "@/lib/measure";
import MeasurePanel from "./MeasurePanel";
import SearchBox, { type PlaceResult } from "./SearchBox";

// Leaflet touches `window` at import time, so the map component must never run
// on the server. Dynamically importing it with `ssr: false` keeps it client-only.
const GolfMap = dynamic(() => import("./GolfMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sky-100 text-slate-500">
      Loading map…
    </div>
  ),
});

export default function GolfCourseCalculator() {
  const [shapes, setShapes] = useState<TurfShape[]>([]);
  const [activeType, setActiveType] = useState<TurfType>("fairway");
  // null = not drawing; an array (possibly empty) = drawing in progress.
  const [draftPoints, setDraftPoints] = useState<[number, number][] | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [osmLoading, setOsmLoading] = useState(false);
  const [osmError, setOsmError] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const drawing = draftPoints !== null;

  const totals = useMemo(() => computeTotals(shapes), [shapes]);

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  // Bias search suggestions toward whatever the map is currently showing.
  const getSearchBias = useCallback(() => {
    const map = mapRef.current;
    if (!map) return null;
    const center = map.getCenter();
    return { lat: center.lat, lon: center.lng };
  }, []);

  const handleSearchSelect = useCallback((place: PlaceResult) => {
    const map = mapRef.current;
    if (!map) return;
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
  }, []);

  const handleSelectType = useCallback((type: TurfType) => {
    setActiveType(type);
  }, []);

  const handleStartDraw = useCallback(() => {
    setSelectedId(null);
    setOsmError(null);
    setDraftPoints([]);
  }, []);

  const handleMapClick = useCallback(
    (latlng: [number, number]) => {
      setDraftPoints((prev) => (prev === null ? prev : [...prev, latlng]));
    },
    [],
  );

  const handleUndo = useCallback(() => {
    setDraftPoints((prev) => (prev ? prev.slice(0, -1) : prev));
  }, []);

  const handleCancel = useCallback(() => {
    setDraftPoints(null);
  }, []);

  const handleFinish = useCallback(() => {
    setDraftPoints((prev) => {
      if (prev && prev.length >= 3) {
        const shape: TurfShape = {
          id: newShapeId(),
          type: activeType,
          latlngs: prev,
          acres: ringAcres(prev),
        };
        setShapes((current) => [...current, shape]);
      }
      return null;
    });
  }, [activeType]);

  const handleSelectShape = useCallback(
    (id: string) => {
      if (!drawing) setSelectedId(id);
    },
    [drawing],
  );

  const handleDeleteSelected = useCallback(() => {
    setShapes((current) => current.filter((shape) => shape.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const handleClearAll = useCallback(() => {
    setShapes([]);
    setSelectedId(null);
    setDraftPoints(null);
    setOsmError(null);
  }, []);

  const handleAutoDetect = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    setOsmLoading(true);
    setOsmError(null);

    try {
      const bounds = map.getBounds();
      const overpassJson = await fetchFairways({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
      const processed = processOverpassData(overpassJson);
      const detected = osmFeaturesToShapes(processed.geojson);

      if (detected.length === 0) {
        setOsmError(
          "No golf turf mapped here in OpenStreetMap. Zoom to the course and trace it manually.",
        );
        return;
      }

      setShapes((current) => [...current, ...detected]);
      setFitSignal((n) => n + 1);
    } catch (err) {
      let message =
        "Couldn't reach the OpenStreetMap data servers. Try again, or just trace the course manually.";
      if (axios.isAxiosError(err) && err.response?.status) {
        message = `OpenStreetMap request failed (HTTP ${err.response.status}). Try again, or trace manually.`;
      }
      setOsmError(message);
    } finally {
      setOsmLoading(false);
    }
  }, []);

  const selectedShape = shapes.find((shape) => shape.id === selectedId) ?? null;
  const selected = selectedShape
    ? { type: selectedShape.type, acres: selectedShape.acres }
    : null;

  return (
    <div className="relative h-full w-full">
      <GolfMap
        shapes={shapes}
        draftPoints={draftPoints}
        activeType={activeType}
        selectedId={selectedId}
        fitSignal={fitSignal}
        onMapClick={handleMapClick}
        onSelectShape={handleSelectShape}
        onMapReady={handleMapReady}
      />

      <SearchBox onSelect={handleSearchSelect} getBias={getSearchBias} />

      <MeasurePanel
        activeType={activeType}
        onSelectType={handleSelectType}
        drawing={drawing}
        pointCount={draftPoints?.length ?? 0}
        onStartDraw={handleStartDraw}
        onUndo={handleUndo}
        onFinish={handleFinish}
        onCancel={handleCancel}
        totals={totals}
        onClearAll={handleClearAll}
        onAutoDetect={handleAutoDetect}
        osmLoading={osmLoading}
        osmError={osmError}
        selected={selected}
        onDeleteSelected={handleDeleteSelected}
        onDeselect={() => setSelectedId(null)}
      />
    </div>
  );
}
