"use client";

interface SummaryCardProps {
  totalAcres: number;
  fairwayCount: number;
  error: string | null;
  onClear: () => void;
}

export default function SummaryCard({
  totalAcres,
  fairwayCount,
  error,
  onClear,
}: SummaryCardProps) {
  return (
    <div className="absolute bottom-6 right-6 z-[1500] w-[min(90vw,320px)]">
      <div className="rounded-xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Fairway Summary
        </h2>

        <div className="mt-3">
          <div className="text-4xl font-bold tabular-nums text-slate-900">
            {totalAcres.toFixed(2)}
            <span className="ml-1.5 text-lg font-medium text-slate-400">
              acres
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Total fairway acreage
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm text-slate-500">Fairways detected</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900">
            {fairwayCount}
          </span>
        </div>

        {error && fairwayCount === 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {error}
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
