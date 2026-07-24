"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import { fetchFairways } from "@/lib/overpass";
import { processOverpassData } from "@/lib/area";
import type { BBox, GolfAreaResult } from "@/lib/types";
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
  const [result, setResult] = useState<GolfAreaResult | null>(null);
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
      // The SummaryCard explains empty / fairways-not-mapped cases itself.
      setResult(processOverpassData(overpassJson));
    } catch (err) {
      let message = "Something went wrong while fetching golf course data.";
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429 || status === 504) {
          message =
            "The OpenStreetMap data servers are busy right now. Please wait a moment and try again.";
        } else if (status === 400) {
          message =
            "That area was too large or complex for the free data API. Try drawing a smaller box over just the course.";
        } else if (status) {
          message = `The data request failed (HTTP ${status}). Please try again in a moment.`;
        } else {
          // No HTTP response = network/CORS/timeout, or a blocked request.
          message =
            "Couldn't reach the OpenStreetMap data servers. They may be overloaded, the area may be too large, or a browser extension may be blocking the request. Try again or draw a smaller box.";
        }
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

  return (
    <div className="relative h-full w-full">
      <GolfMap
        onBoundsSelected={handleBoundsSelected}
        geojson={result?.geojson ?? null}
        clearSignal={clearSignal}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1500] flex items-center justify-center bg-slate-900/30">
          <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-xl">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span className="text-sm font-medium text-slate-700">
              Fetching golf course data from OpenStreetMap…
            </span>
          </div>
        </div>
      )}

      {/* Summary card */}
      {result && !loading && (
        <SummaryCard result={result} onClear={handleClear} />
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
