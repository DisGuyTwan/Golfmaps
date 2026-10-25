"use client";

import { TURF_COLORS } from "@/lib/area";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { estimatedTurf } from "@/lib/landcover";
import { DRIVEWAY_WIDTHS_FT, formatSqft, lotLooksOdd, photoAreas, type LawnMeasurement, type LawnTotals } from "@/lib/lawn";
import type { AcreageMode } from "@/lib/quote";
import type { CourseMeasurement, SodMeasurement } from "@/lib/types";
import { useState } from "react";
import type { MeasureError, PickKind, SatelliteError, TraceKind } from "./GolfCourseCalculator";
import { useTerrain } from "@/lib/quote-store";
import type { LiveStep } from "@/lib/live";
import LiveSteps from "./LiveSteps";
import MowerFit from "./MowerFit";
import QuoteSection from "./QuoteSection";
import Sources from "./Sources";
import { Icon } from "./icons";
import Sheet from "./Sheet";
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
  /** What's being read right now, source by source (live.ts). */
  live: LiveStep[];
  /** The LiDAR terrain for the mower fit is loading. */
  terrainLoading: boolean;
  /** The next tap places the robot's charger. */
  placingCharger: boolean;
  onMoveCharger: () => void;
  onCancelCharger: () => void;
  satError: SatelliteError | null;
  selecting: boolean;
  awaitingSecondCorner: boolean;
  tracing: TraceKind | null;
  tracePointCount: number;
  /** Waiting for the tap that picks a property (any kind) or, in lawn mode, a lot. */
  picking: PickKind | null;
  /** The rep picked the kind of property by hand (Change), rather than the calculator detecting it. */
  chosen: boolean;
  /** Width (ft) for the driveway being traced. */
  driveWidthFt: number;
  onDriveWidth: (ft: number) => void;
  onModeChange: (mode: AcreageMode) => void;
  onMeasure: () => void;
  onStartSelect: () => void;
  onCancelSelect: () => void;
  onStartTrace: (kind: TraceKind) => void;
  onUndoPoint: () => void;
  onFinishTrace: () => void;
  onCancelTrace: () => void;
  onStartPick: (kind: PickKind) => void;
  onCancelPick: () => void;
  onClear: () => void;
  getShareUrl: () => string;
  /** Stops in the grass run kept from before (0 when none), and opening it: with the lawn on screen as a stop, or not. */
  runStops: number;
  onStartRun: (withLawn: boolean) => void;
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
  live,
  terrainLoading,
  placingCharger,
  onMoveCharger,
  onCancelCharger,
  satError,
  selecting,
  awaitingSecondCorner,
  tracing,
  tracePointCount,
  picking,
  driveWidthFt,
  onDriveWidth,
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
  chosen,
  runStops,
  onStartRun,
}: MeasurePanelProps) {
  const t = UI[lang];
  const [changing, setChanging] = useState(false);
  // Nothing measured and no kind picked by hand: the calculator detects what the property is.
  const neutral = !result && !sod && !lawn && !chosen;
  const terrain = useTerrain();
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
  const num = (n: number) => formatSqft(n, lang, false);
  const modeIcon = neutral ? "map" : MODES.find((m) => m.id === mode)!.icon;
  const title = neutral ? t.anyPanelTitle : mode === "sod" ? t.sodPanelTitle : mode === "lawn" ? t.lawnPanelTitle : t.panelTitle;
  // Lawn: say so when OSM has no building on the lot, so the rep traces the house out.
  const lawnNoBuilding =
    !!lawn &&
    lawn.mapped !== null &&
    !lawn.mappedFailed &&
    !lawn.mapped.some((a) => a.kind === "building") &&
    lawn.lidar !== undefined &&
    !lawn.lidar?.length &&
    lawn.traced.length === 0;
  const photosKept = lawn ? photoAreas(lawn).kept.length : 0;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1200] flex justify-center p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <Sheet handleLabel={t.sheetHandle}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Icon name={modeIcon} className="h-[18px] w-[18px] text-accent" />
            {title}
          </h2>
          {(result || sod || lawn || chosen) && (
            <button
              onClick={() => {
                setChanging(false);
                onClear();
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-faint transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
              {t.clear}
            </button>
          )}
        </div>

        {!neutral && !tracing && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{chosen ? t.kindChosen(t.modes[mode]) : t.kindDetected(t.modes[mode])}</span>
            <button
              type="button"
              aria-expanded={changing}
              onClick={() => setChanging((open) => !open)}
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              {t.changeKind}
            </button>
          </p>
        )}

        {changing && !neutral && !tracing && (
        <div role="group" aria-label={t.modeGroup} className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {MODES.map(({ id, icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => {
                setChanging(false);
                onModeChange(id);
              }}
              className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
                mode === id ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              <Icon name={icon} className="h-3.5 w-3.5" />
              {t.modes[id]}
            </button>
          ))}
        </div>
        )}

        {tracing ? (
          <div className="space-y-2">
            <Notice tone="info">
              {tracing === "driveway" ? t.drivewayHint : t.traceHint} ({t.tracePoints(tracePointCount)})
            </Notice>
            {tracing === "driveway" && (
              <div role="group" aria-label={t.drivewayWidthGroup} className="flex flex-wrap gap-1.5">
                {DRIVEWAY_WIDTHS_FT.map((ft, i) => (
                  <button
                    key={ft}
                    type="button"
                    aria-pressed={driveWidthFt === ft}
                    onClick={() => onDriveWidth(ft)}
                    className={`inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                      driveWidthFt === ft ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    {t.drivewayWidth(i + 1, ft)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={onFinishTrace}
                disabled={tracePointCount < (tracing === "driveway" ? 2 : 3)}
                className={`${ui.btnPrimary} grow`}
              >
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
        ) : placingCharger ? (
          <div className="space-y-2">
            <Notice tone="info">{t.tapCharger}</Notice>
            <button onClick={onCancelCharger} className={`${ui.btnSecondary} w-full`}>
              <Icon name="close" />
              {t.cancel}
            </button>
          </div>
        ) : picking ? (
          <div className="space-y-2">
            <Notice tone="info">{picking === "property" ? t.tapProperty : t.tapLot}</Notice>
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
        ) : neutral ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onStartPick("property")} disabled={loading} className={`${ui.btnPrimary} grow basis-48`}>
                <Icon name="pin" />
                {t.selectProperty}
              </button>
              <button onClick={() => onStartTrace("property")} disabled={loading} className={`${ui.btnSecondary} grow whitespace-nowrap`}>
                <Icon name="pen" />
                {t.traceProperty}
              </button>
              <button onClick={() => onStartRun(false)} disabled={loading} className={`${ui.btnSecondary} w-full`}>
                <Icon name="route" />
                {runStops ? t.run.reopen(runStops) : t.run.start}
              </button>
            </div>
            <p className="text-[11px] text-muted">{t.anyHint}</p>
          </div>
        ) : mode === "lawn" ? (
          <div className="flex flex-wrap gap-2">
            {/* Detected as a lawn, the next tap still detects (a course, a farm); picked by hand, it stays a lot. */}
            <button onClick={() => onStartPick(chosen ? "lot" : "property")} disabled={loading} className={`${ui.btnPrimary} grow basis-48`}>
              <Icon name="home" />
              {chosen ? t.selectLot : t.selectProperty}
            </button>
            <button onClick={() => onStartTrace("lot")} disabled={loading} className={`${ui.btnSecondary} grow whitespace-nowrap`}>
              <Icon name="pen" />
              {t.traceLot}
            </button>
            {lawn && (
              <>
                <button onClick={() => onStartTrace("driveway")} disabled={loading} className={`${ui.btnSecondary} grow whitespace-nowrap`}>
                  <Icon name="road" />
                  {t.removeDriveway}
                </button>
                <button onClick={() => onStartTrace("remove")} disabled={loading} className={`${ui.btnSecondary} grow whitespace-nowrap`}>
                  <Icon name="close" />
                  {t.removeArea}
                </button>
                <button onClick={() => onStartRun(true)} disabled={loading || lawn.lotSource !== "cadastre"} className={`${ui.btnSecondary} grow whitespace-nowrap`}>
                  <Icon name="route" />
                  {t.run.addLawn}
                </button>
              </>
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
              <Icon name={mode === "sod" ? "sprout" : "ruler"} />
              {mode === "sod" ? t.findSod : t.measure}
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

        {/* What's loading, live: each source as it's read and what it found (the map sweeps the same areas). */}
        <LiveSteps lang={lang} steps={live} />

        {errorText && (
          <Notice tone="error">{errorText}</Notice>
        )}

        {/* While a tool takes taps, the results fold away so the map stays visible. */}
        {tracing || selecting || picking || placingCharger || neutral ? null : mode === "lawn" ? (
          <>
            {lawn?.lotSource === "cadastre" && lotLooksOdd(lawn.lot) && lawnTotals && (
              <Notice tone="warn">{t.lawnOddLot(sq(lawnTotals.lotSqft))}</Notice>
            )}
            {lawn?.mappedFailed && <Notice tone="warn">{t.lawnBuildingsFailed}</Notice>}
            {lawnNoBuilding && <Notice tone="warn">{lawn?.lidar === null ? t.lawnNoBuildingNoLidar : t.lawnNoBuilding}</Notice>}

            {/* Four across: the unit goes in the labels so the numbers fit on a phone. */}
            <div className="grid grid-cols-4 gap-1.5 border-t border-line pt-3">
              <Stat value={num(lawnTotals?.lotSqft ?? 0)} label={`${t.lawnLot} (${t.sqftUnit})`} swatch={TURF_COLORS.course} />
              <Stat value={num(lawnTotals?.builtSqft ?? 0)} label={t.lawnBuilt} swatch="#334155" />
              <Stat value={num(lawnTotals?.pavedSqft ?? 0)} label={t.lawnPaved} swatch="#64748b" />
              <Stat value={num(lawnTotals?.tracedSqft ?? 0)} label={t.lawnTracedOut} swatch="#f87171" />
            </div>
            <Total label={t.lawnTotal} value={sq(lawnTotals?.lawnSqft ?? 0)} />

            {lawn && (
              <div className="space-y-1 text-[11px]">
                <p className="text-muted">{lawn.lotNumber ? t.lawnLotNumber(lawn.lotNumber) : lawn.lotSource === "traced" ? t.lawnLotTraced : null}</p>
                {!!lawnTotals?.lidarCount && <p className="text-muted">{t.lawnLidar(lawnTotals.lidarCount)}</p>}
                {!!lawnTotals && lawnTotals.photoPools + lawnTotals.photoPaved > 0 && (
                  <p className="text-muted">
                    {t.lawnPhotos(lawnTotals.photoPools, lawnTotals.photoPaved)} {t.lawnPhotosHint}
                  </p>
                )}
                {photosKept > 0 && <p className="text-muted">{t.lawnPhotosKept(photosKept)}</p>}
                <p className="text-muted">{t.lawnRemoveHint}</p>
                <p className="text-faint">{t.lawnTreesNote}</p>
              </div>
            )}

            {lawn && !error && <MowerFit lang={lang} loading={terrainLoading} onMoveCharger={onMoveCharger} />}
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
                    <p className="text-faint">{t.satNote(sat)}</p>
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
              <>
                <MowerFit lang={lang} loading={terrainLoading} onMoveCharger={onMoveCharger} />
                <QuoteSection lang={lang} mode="golf" result={result} sod={null} lawn={null} getShareUrl={getShareUrl} />
              </>
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
                {sod.photos && <p className="text-faint">{t.sodPhotos}</p>}
              </div>
            )}

            {sod && !error && <MowerFit lang={lang} loading={terrainLoading} onMoveCharger={onMoveCharger} />}
            {sod && !error && <QuoteSection lang={lang} mode="sod" result={null} sod={sod} lawn={null} getShareUrl={getShareUrl} />}
          </>
        )}

        {!error && (lawn || sod || result?.found) && <Sources lang={lang} />}

        <p className="text-center text-[10px] text-faint">
          {t.attribution}
          {mode === "golf" && sat && <> · {sat.source === "photos" ? t.attributionPhotos : t.attributionWorldCover}</>}
          {mode === "sod" && sod?.year != null && <> · {t.attributionAci}</>}
          {mode === "sod" && sod?.photos && <> · {t.attributionPhotos}</>}
          {mode === "lawn" && lawn?.lotSource === "cadastre" && <> · {t.attributionCadastre}</>}
          {terrain && <> · {t.attributionLidar}</>}
          {mode === "lawn" && !!lawn?.imagery && <> · {t.attributionPhotos}</>}
        </p>
      </Sheet>
    </div>
  );
}
