"use client";

import { TURF_COLORS } from "@/lib/area";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import type { CourseMeasurement } from "@/lib/types";
import type { MeasureError } from "./GolfCourseCalculator";
import { ui } from "./ui";

interface MeasurePanelProps {
  lang: Lang;
  result: CourseMeasurement | null;
  loading: boolean;
  error: MeasureError | null;
  selecting: boolean;
  awaitingSecondCorner: boolean;
  onMeasure: () => void;
  onStartSelect: () => void;
  onCancelSelect: () => void;
  onClear: () => void;
}

const CATEGORIES = ["fairway", "rough", "green", "tee"] as const;

export default function MeasurePanel({
  lang,
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
  const t = UI[lang];
  const ac = (acres: number) => formatAcres(acres, lang);
  const errorText = error
    ? error.kind === "http"
      ? t.measureError.http(error.status ?? 0)
      : t.measureError[error.kind]
    : null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1200] flex justify-center p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto max-h-[70dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-surface/95 p-4 shadow-2xl ring-1 ring-black/10 backdrop-blur dark:ring-white/10">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{t.panelTitle}</h2>
          {result && (
            <button onClick={onClear} className="text-xs font-medium text-faint transition hover:text-red-600">
              {t.clear}
            </button>
          )}
        </div>

        {selecting ? (
          <div className="space-y-2">
            <p className="rounded-md bg-blue-50 px-3 py-2 text-center text-xs font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
              {awaitingSecondCorner ? t.tapSecond : t.tapFirst}
            </p>
            <button
              onClick={onCancelSelect}
              className={`${ui.btnSecondary} w-full`}
            >
              {t.cancel}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onMeasure}
              disabled={loading}
              className={`${ui.btnPrimary} flex-[2]`}
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {loading ? t.measuring : t.measure}
            </button>
            <button
              onClick={onStartSelect}
              disabled={loading}
              className={`${ui.btnSecondary} flex-1`}
            >
              {t.selectArea}
            </button>
          </div>
        )}

        {errorText && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/60 dark:text-red-200">
            {errorText}
          </p>
        )}

        {result && !result.found && !error && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
            {t.notFound}
          </p>
        )}

        {result?.boundaryOnly && !error && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
            {t.boundaryOnly}
          </p>
        )}

        {/* Breakdown */}
        <div className="grid grid-cols-4 gap-1.5 border-t border-line pt-3">
          {CATEGORIES.map((key) => {
            const stat = result ? result[key] : { acres: 0, count: 0 };
            const estimated = key === "rough" && result?.roughEstimated;
            return (
              <div key={key} className="text-center">
                <div className="text-base font-bold tabular-nums text-ink">{ac(stat.acres)}</div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-muted">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: TURF_COLORS[key] }} />
                  {t.categories[key]}
                  {estimated ? "*" : stat.count > 0 ? ` (${stat.count})` : ""}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2">
          <span className="text-sm font-medium text-accent-ink">
            {result?.boundaryOnly ? t.courseArea : t.totalTurf}
          </span>
          <span className="text-lg font-bold tabular-nums text-accent-ink">
            {ac(result?.boundaryOnly ? result.courseAcres : (result?.totalTurfAcres ?? 0))} ac
          </span>
        </div>

        {result &&
          (result.courseAcres > 0 ||
            result.drivingRangeAcres > 0 ||
            result.treesAcres > 0 ||
            result.builtAcres > 0) && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-muted">
              {result.courseAcres > 0 && (
                <span>
                  {t.courseBoundary}: {ac(result.courseAcres)} ac
                </span>
              )}
              {result.drivingRangeAcres > 0 && (
                <span>
                  {t.drivingRange}: {ac(result.drivingRangeAcres)} ac
                </span>
              )}
              {result.roughEstimated && result.treesAcres > 0 && (
                <span>
                  {t.treesRemoved}: {ac(result.treesAcres)} ac
                </span>
              )}
              {result.roughEstimated && result.builtAcres > 0 && (
                <span>
                  {t.builtRemoved}: {ac(result.builtAcres)} ac
                </span>
              )}
            </div>
          )}

        {result?.roughEstimated && <p className="text-[11px] text-faint">{t.roughNote}</p>}

        <p className="text-center text-[10px] text-faint">{t.attribution}</p>
      </div>
    </div>
  );
}
