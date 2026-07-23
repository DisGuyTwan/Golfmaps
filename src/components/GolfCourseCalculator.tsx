"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import { fetchFairways } from "@/lib/overpass";
import { processOverpassData } from "@/lib/area";
import type { BBox, FairwayResult } from "@/lib/types";
import SummaryCard from "./SummaryCard";

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
  const [result, setResult] = useState<FairwayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumping this counter signals the map to clear any drawn rectangle.
  const [clearSignal, setClearSignal] = useState(0);

  const handleBoundsSelected = useCallback(async (bbox: BBox) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const overpassJson = await fetchFairways(bbox);
      const processed = processOverpassData(overpassJson);

      if (processed.fairwayCount === 0) {
        setError(
          "No golf fairways found in that area. Try drawing a tighter box directly over the course, or the fairways may not be mapped in OpenStreetMap.",
        );
      }

      setResult(processed);
    } catch (err) {
      let message = "Something went wrong while fetching fairway data.";
      if (axios.isAxiosError(err)) {
        message =
          err.response?.status === 429 || err.response?.status === 504
            ? "The Overpass API is busy right now. Please wait a moment and try again."
            : `Overpass request failed: ${err.message}`;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    setResult(null);
    setError(null);
    setClearSignal((n) => n + 1);
  }, []);

  const handleDeleted = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className="relative h-full w-full">
      <GolfMap
        onBoundsSelected={handleBoundsSelected}
        onDeleted={handleDeleted}
        geojson={result?.geojson ?? null}
        clearSignal={clearSignal}
      />

      {/* Instruction banner */}
      <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] w-[min(92vw,640px)] -translate-x-1/2">
        <div className="pointer-events-auto rounded-lg bg-white/95 px-4 py-3 text-center text-sm text-slate-700 shadow-lg ring-1 ring-black/5">
          <span className="font-semibold text-slate-900">
            Golf Course Acreage Calculator
          </span>
          <span className="mx-2 text-slate-300">•</span>
          Use the rectangle tool (top-left) to draw a box over a course and
          calculate total fairway acreage.
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1500] flex items-center justify-center bg-slate-900/30">
          <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-xl">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span className="text-sm font-medium text-slate-700">
              Fetching fairways from OpenStreetMap…
            </span>
          </div>
        </div>
      )}

      {/* Summary card */}
      {result && !loading && (
        <SummaryCard
          totalAcres={result.totalAcres}
          fairwayCount={result.fairwayCount}
          error={error}
          onClear={handleClear}
        />
      )}

      {/* Error toast when there is no result to attach the message to */}
      {error && !result && !loading && (
        <div className="absolute bottom-6 left-1/2 z-[1500] w-[min(92vw,420px)] -translate-x-1/2">
          <div className="flex items-start gap-3 rounded-lg bg-white px-4 py-3 shadow-xl ring-1 ring-red-200">
            <span className="mt-0.5 text-red-500">⚠</span>
            <div className="flex-1 text-sm text-slate-700">{error}</div>
            <button
              onClick={handleClear}
              className="text-slate-400 transition hover:text-slate-600"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
