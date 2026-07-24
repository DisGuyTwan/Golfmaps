"use client";

import {
  TURF_TYPES,
  TURF_META,
  type TurfType,
  type TurfTotals,
} from "@/lib/measure";

interface MeasurePanelProps {
  activeType: TurfType;
  onSelectType: (type: TurfType) => void;
  drawing: boolean;
  pointCount: number;
  onStartDraw: () => void;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
  totals: TurfTotals;
  onClearAll: () => void;
  onAutoDetect: () => void;
  osmLoading: boolean;
  osmError: string | null;
  selected: { type: TurfType; acres: number } | null;
  onDeleteSelected: () => void;
  onDeselect: () => void;
}

export default function MeasurePanel({
  activeType,
  onSelectType,
  drawing,
  pointCount,
  onStartDraw,
  onUndo,
  onFinish,
  onCancel,
  totals,
  onClearAll,
  onAutoDetect,
  osmLoading,
  osmError,
  selected,
  onDeleteSelected,
  onDeselect,
}: MeasurePanelProps) {
  const activeMeta = TURF_META[activeType];
  const canFinish = pointCount >= 3;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1200] flex justify-center p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto max-h-[78dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-2xl ring-1 ring-black/10 backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Measure golf turf
          </h2>
          {totals.totalCount > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs font-medium text-slate-400 transition hover:text-red-600"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Selected-shape actions */}
        {selected && !drawing && (
          <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              <span
                className="inline-block h-3 w-3 rounded-sm ring-1 ring-black/10"
                style={{ backgroundColor: TURF_META[selected.type].fill }}
              />
              {TURF_META[selected.type].label} · {selected.acres.toFixed(2)} ac
            </span>
            <span className="flex gap-2">
              <button
                onClick={onDeleteSelected}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={onDeselect}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:text-slate-700"
              >
                Deselect
              </button>
            </span>
          </div>
        )}

        {/* Turf-type chips */}
        <div className="grid grid-cols-4 gap-1.5">
          {TURF_TYPES.map((meta) => {
            const active = meta.type === activeType;
            return (
              <button
                key={meta.type}
                onClick={() => onSelectType(meta.type)}
                disabled={drawing}
                className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium transition disabled:opacity-50 ${
                  active
                    ? "border-transparent text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                style={active ? { backgroundColor: meta.color } : undefined}
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm ring-1 ring-black/10"
                  style={{ backgroundColor: meta.fill }}
                />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Draw controls */}
        {drawing ? (
          <div className="space-y-2">
            <p className="text-center text-xs text-slate-500">
              Tap the map to trace the {activeMeta.label.toLowerCase()} —{" "}
              <span className="font-semibold text-slate-700">
                {pointCount} point{pointCount === 1 ? "" : "s"}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={onUndo}
                disabled={pointCount === 0}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Undo
              </button>
              <button
                onClick={onFinish}
                disabled={!canFinish}
                className="flex-[2] rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
              >
                Finish polygon
              </button>
              <button
                onClick={onCancel}
                className="flex-1 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onStartDraw}
              className="flex-[2] rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
              style={{ backgroundColor: activeMeta.color }}
            >
              + Draw {activeMeta.label.toLowerCase()}
            </button>
            <button
              onClick={onAutoDetect}
              disabled={osmLoading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {osmLoading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              )}
              Auto (OSM)
            </button>
          </div>
        )}

        {osmError && !drawing && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {osmError}
          </p>
        )}

        {/* Totals — every category always shown, including Rough */}
        <div className="grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-3">
          {TURF_TYPES.map((meta) => {
            const stat = totals.perType[meta.type];
            return (
              <div key={meta.type} className="text-center">
                <div className="text-base font-bold tabular-nums text-slate-900">
                  {stat.acres.toFixed(2)}
                </div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: meta.fill }}
                  />
                  {meta.label}
                  {stat.count > 0 ? ` (${stat.count})` : ""}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
          <span className="text-sm font-medium text-emerald-800">
            Total turf
          </span>
          <span className="text-lg font-bold tabular-nums text-emerald-900">
            {totals.totalAcres.toFixed(2)} ac
          </span>
        </div>

        <p className="text-center text-[10px] text-slate-400">
          Imagery © Esri · Map data © OpenStreetMap contributors
        </p>
      </div>
    </div>
  );
}
