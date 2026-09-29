"use client";

import { TURF_COLORS } from "@/lib/area";
import type { CourseMeasurement } from "@/lib/types";

interface MeasurePanelProps {
  result: CourseMeasurement | null;
  loading: boolean;
  error: string | null;
  selecting: boolean;
  awaitingSecondCorner: boolean;
  onMeasure: () => void;
  onStartSelect: () => void;
  onCancelSelect: () => void;
  onClear: () => void;
}

const CATEGORIES = [
  { key: "fairway", label: "Fairway", color: TURF_COLORS.fairway },
  { key: "rough", label: "Rough", color: TURF_COLORS.rough },
  { key: "green", label: "Green", color: TURF_COLORS.green },
  { key: "tee", label: "Tee", color: TURF_COLORS.tee },
] as const;

export default function MeasurePanel({
  result,
  loading,
  error,
  selecting,
  awaitingSecondCorner,
  onMeasure,
  onStartSelect,
  onCancelSelect,
  onClear,
}: MeasurePanelProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1200] flex justify-center p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto max-h-[70dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-2xl ring-1 ring-black/10 backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Golf turf acreage
          </h2>
          {result && (
            <button
              onClick={onClear}
              className="text-xs font-medium text-slate-400 transition hover:text-red-600"
            >
              Clear
            </button>
          )}
        </div>

        {selecting ? (
          <div className="space-y-2">
            <p className="rounded-md bg-blue-50 px-3 py-2 text-center text-xs font-medium text-blue-700">
              {awaitingSecondCorner
                ? "Tap the opposite corner of the scan area"
                : "Tap one corner of the area to scan"}
            </p>
            <button
              onClick={onCancelSelect}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onMeasure}
              disabled={loading}
              className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {loading ? "Measuring…" : "⛳ Measure course in view"}
            </button>
            <button
              onClick={onStartSelect}
              disabled={loading}
              className="flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              ▭ Select area
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        {result && !result.found && !error && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No golf course found in view. Search a course above, or pan/zoom so
            the course fills the screen, then measure again.
          </p>
        )}

        {result?.boundaryOnly && !error && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Only this course&apos;s outline is mapped in OpenStreetMap — its
            fairways, greens and tees aren&apos;t, so the turf can&apos;t be
            broken down. Showing the total course boundary only.
          </p>
        )}

        {/* Breakdown */}
        <div className="grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-3">
          {CATEGORIES.map((category) => {
            const stat = result ? result[category.key] : { acres: 0, count: 0 };
            const estimated =
              category.key === "rough" && result?.roughEstimated;
            return (
              <div key={category.key} className="text-center">
                <div className="text-base font-bold tabular-nums text-slate-900">
                  {stat.acres.toFixed(2)}
                </div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.label}
                  {estimated ? "*" : stat.count > 0 ? ` (${stat.count})` : ""}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
          <span className="text-sm font-medium text-emerald-800">
            {result?.boundaryOnly ? "Course area" : "Total turf"}
          </span>
          <span className="text-lg font-bold tabular-nums text-emerald-900">
            {(result?.boundaryOnly
              ? result.courseAcres
              : result?.totalTurfAcres ?? 0
            ).toFixed(2)}{" "}
            ac
          </span>
        </div>

        {result &&
          (result.courseAcres > 0 ||
            result.drivingRangeAcres > 0 ||
            result.treesAcres > 0 ||
            result.builtAcres > 0) && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {result.courseAcres > 0 && (
                <span>Course boundary: {result.courseAcres.toFixed(2)} ac</span>
              )}
              {result.drivingRangeAcres > 0 && (
                <span>
                  Driving range: {result.drivingRangeAcres.toFixed(2)} ac
                </span>
              )}
              {result.roughEstimated && result.treesAcres > 0 && (
                <span>Trees removed: {result.treesAcres.toFixed(2)} ac</span>
              )}
              {result.roughEstimated && result.builtAcres > 0 && (
                <span>
                  Buildings/parking removed: {result.builtAcres.toFixed(2)} ac
                </span>
              )}
            </div>
          )}

        {result?.roughEstimated && (
          <p className="text-[11px] text-slate-400">
            *Rough is estimated: course boundary minus fairways, greens, tees,
            driving range, water, sand, mapped trees and buildings/parking (may
            still include unmapped trees or paths).
          </p>
        )}

        <p className="text-center text-[10px] text-slate-400">
          Imagery © Esri · Map data © OpenStreetMap contributors
        </p>
      </div>
    </div>
  );
}
