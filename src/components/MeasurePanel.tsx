"use client";

import { TURF_COLORS } from "@/lib/area";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { estimatedTurf } from "@/lib/landcover";
import { formatSqft, type LawnMeasurement, type LawnTotals } from "@/lib/lawn";
import type { AcreageMode } from "@/lib/quote";
import type { CourseMeasurement, SodMeasurement } from "@/lib/types";
import type { MeasureError, SatelliteError, TraceKind } from "./GolfCourseCalculator";
import QuoteSection from "./QuoteSection";
import { Icon } from "./icons";
import { Notice, Pop, ui } from "./ui";

interface MeasurePanelProps {
  lang: Lang;
  mode: AcreageMode;
  result: CourseMeasurement | null;
  sod: SodMeasurement | null;
  lawn: LawnMeasurement | null;
  lawnTotals: LawnTotals | null;
  loading: boolean;
  error: MeasureError | null;
  satLoading: boolean;
  satError: SatelliteError | null;
  selecting: boolean;
  awaitingSecondCorner: boolean;
  tracing: TraceKind | null;
  tracePointCount: number;
  /** Lawn: waiting for the tap that picks a lot. */
  picking: boolean;
  onModeChange: (mode: AcreageMode) => void;
  onMeasure: () => void;
  onStartSelect: () => void;
  onCancelSelect: () => void;
  onStartTrace: (kind: TraceKind) => void;
  onUndoPoint: () => void;
  onFinishTrace: () => void;
  onCancelTrace: () => void;
  onStartPick: () => void;
  onCancelPick: () => void;
  onClear: () => void;
  getShareUrl: () => string;
}

const CATEGORIES = ["fairway", "rough", "green", "tee"] as const;
const MODES: { id: AcreageMode; icon: "flag" | "sprout" | "home" }[] = [
  { id: "golf", icon: "flag" },
  { id: "sod", icon: "sprout" },
  { id: "lawn", icon: "home" },
];

/** One figure in a four-up row: value on top, label (with an optional swatch) below. */
function Stat({ value, label, swatch }: { value: string; label: string; swatch?: string }) {
  return (
    <div className="text-center">
      <div className="text-base font-bold tabular-nums text-ink">
        <Pop value={value} />
      </div>
      <div className="flex items-center justify-center gap-1 text-[11px] text-muted">
        {swatch && <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: swatch }} />}
        {label}
      </div>
    </div>
  );
}

/** The highlighted total under the figures. */
function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2">
      <span className="text-sm font-medium text-accent-ink">{label}</span>
      <Pop value={value} className="text-lg font-bold tabular-nums text-accent-ink" />
    </div>
  );
}

export default function MeasurePanel({
  lang,
  mode,
  result,
  sod,
  lawn,
  lawnTotals,
  loading,
  error,
  satLoading,
  satError,
  selecting,
  awaitingSecondCorner,
  tracing,
  tracePointCount,
  picking,
  onModeChange,
  onMeasure,
  onStartSelect,
  onCancelSelect,
  onStartTrace,
  onUndoPoint,
  onFinishTrace,
  onCancelTrace,
  onStartPick,
  onCancelPick,
  onClear,
  getShareUrl,
}: MeasurePanelProps) {
  const t = UI[lang];
  const ac = (acres: number) => formatAcres(acres, lang);
  const errorText = error
    ? error.kind === "http"
      ? t.measureError.http(error.status ?? 0)
      : t.measureError[error.kind]
    : null;
  const sat = result?.satellite ?? null;
  const turf = sat ? estimatedTurf(sat) : null;
  const outlineOnly = result?.boundaryOnly ?? false;
  const detected = sod?.fields.filter((f) => !f.traced) ?? [];
  const traced = sod?.fields.filter((f) => f.traced) ?? [];
  const leftOut = sod?.fields.filter((f) => !f.included) ?? [];
  const sumAcres = (fields: { acres: number }[]) => fields.reduce((s, f) => s + f.acres, 0);
  // Tracing an outline is offered when OSM has no course here, only its outline,
  // or couldn't be reached (the satellite count doesn't need it).
  const offerOutline = mode === "golf" && ((!!result && (!result.found || outlineOnly)) || error !== null);
  const sq = (n: number) => formatSqft(n, lang);
  const modeIcon = MODES.find((m) => m.id === mode)!.icon;
  const title = mode === "sod" ? t.sodPanelTitle : mode === "lawn" ? t.lawnPanelTitle : t.panelTitle;
  // Lawn: say so when OSM has no building on the lot, so the rep traces the house out.
  const lawnNoBuilding =
    !!lawn && lawn.mapped !== null && !lawn.mappedFailed && !lawn.mapped.some((a) => a.kind === "building") && lawn.traced.length === 0;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1200] flex justify-center p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div
        data-measure-panel
        className="pointer-events-auto max-h-[70dvh] w-full max-w-md animate-fade-up space-y-3 overflow-y-auto rounded-2xl bg-surface/95 p-4 shadow-2xl ring-1 ring-black/10 backdrop-blur dark:ring-white/10">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Icon name={modeIcon} className="h-[18px] w-[18px] text-accent" />
            {title}
          </h2>
          {(result || sod || lawn) && (
            <button
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-faint transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
              {t.clear}
            </button>
          )}
        </div>

        <div role="group" aria-label={t.modeGroup} className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {MODES.map(({ id, icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => onModeChange(id)}
              className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
                mode === id ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              <Icon name={icon} className="h-3.5 w-3.5" />
              {t.modes[id]}
            </button>
          ))}
        </div>

        {tracing ? (
          <div className="space-y-2">
            <Notice tone="info">
              {t.traceHint} ({t.tracePoints(tracePointCount)})
            </Notice>
            <div className="flex flex-wrap gap-2">
              <button onClick={onFinishTrace} disabled={tracePointCount < 3} className={`${ui.btnPrimary} grow`}>
                <Icon name="check" />
                {t.done}
              </button>
              <button onClick={onUndoPoint} disabled={tracePointCount === 0} className={ui.btnSecondary}>
                <Icon name="undo" />
                {t.undoPoint}
              </button>
              <button onClick={onCancelTrace} className={ui.btnSecondary}>
                <Icon name="close" />
                {t.cancel}
              </button>
            </div>
          </div>
        ) : picking ? (
          <div className="space-y-2">
            <Notice tone="info">{t.tapLot}</Notice>
            <button onClick={onCancelPick} className={`${ui.btnSecondary} w-full`}>
              <Icon name="close" />
              {t.cancel}
            </button>
          </div>
        ) : selecting ? (
          <div className="space-y-2">
            <Notice tone="info">{awaitingSecondCorner ? t.tapSecond : t.tapFirst}</Notice>
            <button
              onClick={onCancelSelect}
              className={`${ui.btnSecondary} w-full`}
            >
              <Icon name="close" />
              {t.cancel}
            </button>
          </div>
        ) : mode === "lawn" ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={onStartPick} disabled={loading} className={`${ui.btnPrimary} grow basis-48`}>
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Icon name="home" />
              )}
              {loading ? t.measuring : t.selectLot}
            </button>
            <button onClick={() => onStartTrace("lot")} disabled={loading} className={`${ui.btnSecondary} grow whitespace-nowrap`}>
              <Icon name="pen" />
              {t.traceLot}
            </button>
            {lawn && (
              <button onClick={() => onStartTrace("remove")} disabled={loading} className={`${ui.btnSecondary} grow whitespace-nowrap`}>
                <Icon name="close" />
                {t.removeArea}
              </button>
            )}
          </div>
        ) : (
          // Side by side when both fit; otherwise each takes a full row.
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onMeasure}
              disabled={loading}
              className={`${ui.btnPrimary} grow basis-48`}
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Icon name={mode === "sod" ? "sprout" : "ruler"} />
              )}
              {loading ? t.measuring : mode === "sod" ? t.findSod : t.measure}
            </button>
            <button
              onClick={onStartSelect}
              disabled={loading}
              className={`${ui.btnSecondary} grow whitespace-nowrap`}
            >
              <Icon name="select" />
              {t.selectArea}
            </button>
            {(mode === "sod" || offerOutline) && (
              <button
                onClick={() => onStartTrace(mode === "sod" ? "field" : "outline")}
                disabled={loading}
                className={`${ui.btnSecondary} grow whitespace-nowrap`}
              >
                <Icon name="pen" />
                {mode === "sod" ? t.traceField : t.traceOutline}
              </button>
            )}
          </div>
        )}

        {errorText && (
          <Notice tone="error">{errorText}</Notice>
        )}

        {/* While a tool takes taps, the results fold away so the map stays visible. */}
        {tracing || selecting || picking ? null : mode === "lawn" ? (
          <>
            {loading && <Notice tone="info">{t.lawnLoading}</Notice>}
            {lawn?.mappedFailed && <Notice tone="warn">{t.lawnBuildingsFailed}</Notice>}
            {lawnNoBuilding && <Notice tone="warn">{t.lawnNoBuilding}</Notice>}

            <div className="grid grid-cols-3 gap-1.5 border-t border-line pt-3">
              <Stat value={sq(lawnTotals?.lotSqft ?? 0)} label={t.lawnLot} swatch={TURF_COLORS.course} />
              <Stat value={sq(lawnTotals?.mappedSqft ?? 0)} label={t.lawnBuilt} swatch="#334155" />
              <Stat value={sq(lawnTotals?.tracedSqft ?? 0)} label={t.lawnTracedOut} swatch="#f87171" />
            </div>
            <Total label={t.lawnTotal} value={sq(lawnTotals?.lawnSqft ?? 0)} />

            {lawn && (
              <div className="space-y-1 text-[11px]">
                <p className="text-muted">{lawn.lotNumber ? t.lawnLotNumber(lawn.lotNumber) : lawn.lotSource === "traced" ? t.lawnLotTraced : null}</p>
                <p className="text-muted">{t.lawnRemoveHint}</p>
                <p className="text-faint">{t.lawnTreesNote}</p>
              </div>
            )}

            {lawn && !error && <QuoteSection lang={lang} mode="lawn" result={null} sod={null} lawn={lawn} getShareUrl={getShareUrl} />}
          </>
        ) : mode === "golf" ? (
          <>
            {result && !result.found && !error && (
              <Notice tone="warn">{t.notFound}</Notice>
            )}

            {outlineOnly && !error && (
              <Notice tone={result?.outlineTraced ? "info" : "warn"}>
                {result?.outlineTraced ? t.outlineTraced : t.boundaryOnly}
              </Notice>
            )}
            {satLoading && <Notice tone="info">{t.satLoading}</Notice>}
            {satError && <Notice tone="error">{satError === "tooLarge" ? t.satTooLarge : t.satError}</Notice>}

            {outlineOnly ? (
              <>
                <div className="grid grid-cols-4 gap-1.5 border-t border-line pt-3">
                  <Stat value={ac(sat?.grassAcres ?? 0)} label={t.satGrass} swatch={TURF_COLORS.grass} />
                  <Stat value={ac(sat?.treesAcres ?? 0)} label={t.satTrees} />
                  <Stat value={ac(sat?.builtAcres ?? 0)} label={t.satBuilt} />
                  <Stat value={ac(sat?.waterAcres ?? 0)} label={t.satWater} />
                </div>
                <Total
                  label={turf ? t.satTotal : t.courseArea}
                  value={`${ac(turf ? turf.acres : (result?.courseAcres ?? 0))} ac`}
                />
                {sat && turf && (
                  <div className="space-y-1 text-[11px]">
                    <p className="flex flex-wrap justify-between gap-x-3 text-muted">
                      <span>{t.satRange(ac(turf.low), ac(turf.high))}</span>
                      <span>
                        {t.courseBoundary}: {ac(result?.courseAcres ?? 0)} ac
                      </span>
                    </p>
                    <p className="text-faint">{t.satNote(sat.year)}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Breakdown */}
                <div className="grid grid-cols-4 gap-1.5 border-t border-line pt-3">
                  {CATEGORIES.map((key) => {
                    const stat = result ? result[key] : { acres: 0, count: 0 };
                    const estimated = key === "rough" && result?.roughEstimated;
                    return (
                      <Stat
                        key={key}
                        value={ac(stat.acres)}
                        swatch={TURF_COLORS[key]}
                        label={`${t.categories[key]}${estimated ? "*" : stat.count > 0 ? ` (${stat.count})` : ""}`}
                      />
                    );
                  })}
                </div>

                <Total label={t.totalTurf} value={`${ac(result?.totalTurfAcres ?? 0)} ac`} />

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
              </>
            )}

            {result && (result.found || result.boundaryOnly) && !error && (
              <QuoteSection lang={lang} mode="golf" result={result} sod={null} lawn={null} getShareUrl={getShareUrl} />
            )}
          </>
        ) : (
          <>
            {sod?.year != null && detected.length === 0 && !error && <Notice tone="warn">{t.sodNone(sod.year)}</Notice>}

            <div className="grid grid-cols-3 gap-1.5 border-t border-line pt-3">
              <Stat value={String(sod?.fields.length ?? 0)} label={t.sodFields} />
              <Stat value={ac(sumAcres(detected))} label={`${t.sodDetected} (ac)`} swatch={TURF_COLORS.grass} />
              <Stat value={ac(sumAcres(traced))} label={`${t.sodTraced} (ac)`} swatch={TURF_COLORS.course} />
            </div>

            <Total label={t.sodTotal} value={`${ac(sumAcres(sod?.fields.filter((f) => f.included) ?? []))} ac`} />

            {sod && sod.fields.length > 0 && (
              <div className="space-y-1 text-[11px]">
                {leftOut.length > 0 && <p className="text-muted">{t.sodLeftOut(leftOut.length, ac(sumAcres(leftOut)))}</p>}
                <p className="text-muted">{t.sodTapHint}</p>
                {sod.year != null && detected.length > 0 && <p className="text-faint">{t.sodSource(sod.year)}</p>}
              </div>
            )}

            {sod && !error && <QuoteSection lang={lang} mode="sod" result={null} sod={sod} lawn={null} getShareUrl={getShareUrl} />}
          </>
        )}

        <p className="text-center text-[10px] text-faint">
          {t.attribution}
          {mode === "golf" && sat && <> · {t.attributionWorldCover}</>}
          {mode === "sod" && sod?.year != null && <> · {t.attributionAci}</>}
          {mode === "lawn" && lawn?.lotSource === "cadastre" && <> · {t.attributionCadastre}</>}
        </p>
      </div>
    </div>
  );
}
