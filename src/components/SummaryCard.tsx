"use client";

import type { GolfAreaResult } from "@/lib/types";

interface SummaryCardProps {
  result: GolfAreaResult;
  onClear: () => void;
}

interface Row {
  label: string;
  stat: { acres: number; count: number };
  swatch: string;
}

export default function SummaryCard({ result, onClear }: SummaryCardProps) {
  const hasFairways = result.fairway.count > 0;
  const hasCourse = result.course.count > 0;
  const nothingFound = result.totalPolygons === 0;

  // Headline: fairway acreage when available, otherwise fall back to the total
  // course-boundary area so the user still gets a usable number.
  const headlineAcres = hasFairways
    ? result.fairway.acres
    : hasCourse
      ? result.course.acres
      : 0;
  const headlineLabel = hasFairways
    ? "Total fairway acreage"
    : hasCourse
      ? "Total course area"
      : "No golf turf detected";

  const rows: Row[] = [
    { label: "Fairways", stat: result.fairway, swatch: "#86efac" },
    { label: "Rough", stat: result.rough, swatch: "#bbf7d0" },
    { label: "Greens", stat: result.green, swatch: "#34d399" },
    { label: "Tees", stat: result.tee, swatch: "#86efac" },
    { label: "Driving range", stat: result.drivingRange, swatch: "#a7f3d0" },
    { label: "Course outline", stat: result.course, swatch: "#15803d" },
  ].filter((row) => row.stat.count > 0);

  return (
    <div className="absolute bottom-6 right-6 z-[1500] max-h-[80vh] w-[min(90vw,340px)] overflow-y-auto">
      <div className="rounded-xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Course Summary
        </h2>

        <div className="mt-3">
          <div className="text-4xl font-bold tabular-nums text-slate-900">
            {headlineAcres.toFixed(2)}
            <span className="ml-1.5 text-lg font-medium text-slate-400">
              acres
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{headlineLabel}</p>
        </div>

        {rows.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2 text-slate-600">
                  <span
                    className="inline-block h-3 w-3 rounded-sm ring-1 ring-black/10"
                    style={{ backgroundColor: row.swatch }}
                  />
                  {row.label}
                  <span className="text-slate-400">({row.stat.count})</span>
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {row.stat.acres.toFixed(2)} ac
                </span>
              </div>
            ))}
          </div>
        )}

        {result.mowableAcres > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2">
            <span className="text-sm font-medium text-emerald-800">
              Mowable turf total
            </span>
            <span className="text-sm font-bold tabular-nums text-emerald-900">
              {result.mowableAcres.toFixed(2)} ac
            </span>
          </div>
        )}

        {nothingFound && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No golf course or turf was found in that box. Try drawing a tighter
            box directly over the course — or it may not be mapped in
            OpenStreetMap.
          </p>
        )}

        {!nothingFound && !hasFairways && hasCourse && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This course&apos;s individual fairways aren&apos;t mapped in
            OpenStreetMap, so the headline shows the whole course boundary
            (which includes water, sand and trees). Any turf features that
            <em> are</em> mapped are listed above.
          </p>
        )}

        <button
          onClick={onClear}
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Clear &amp; start over
        </button>
      </div>
    </div>
  );
}
