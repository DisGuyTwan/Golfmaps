"use client";

import { useMemo } from "react";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { SQ_M_TO_SQ_FT, formatSqft, lawnTotals, photoAreas, type LawnMeasurement } from "@/lib/lawn";
import {
  MOWERS_AS_OF,
  capacityM2,
  fitMower,
  mainFleet,
  mowerName,
  recommend,
  recommendBoth,
  type Approaches,
  type Fit,
  type FitOptions,
  type Recommendation,
} from "@/lib/mowers";
import { measuredRange, type AcreRange } from "@/lib/trust";
import { MOW_EVERY, acresForQuote, lawnQuoteSqft, type AcreageMode, type MowEvery, type QuoteSettings } from "@/lib/quote";
import { setQuoteSettings, useCharger, useLawn, useMeasurement, useMode, useQuoteSettings, useSod, useTerrain } from "@/lib/quote-store";
import { complexity, golfSite, lawnSite, sodSite, type Complexity, type Level, type Reason, type Site } from "@/lib/site";
import { slopeDeg, type TerrainGrid } from "@/lib/terrain";
import type { Approach } from "@/lib/roi";
import type { CourseMeasurement, SodMeasurement } from "@/lib/types";
import { Icon } from "./icons";
import { Notice, Segmented, toneClass } from "./ui";
import WindowPicker, { windowLine } from "./WindowPicker";
import Battlecard from "./Battlecard";
import { robotWindowShare, voyagerWindowShare } from "@/lib/window";
import { useRecords, type Records } from "@/lib/records-store";
import { ROI_DEFAULTS } from "@/lib/roi";

export interface MowerFitResult {
  site: Site;
  complexity: Complexity;
  /** For the approach shown, on a golf course. */
  recommendation: Recommendation;
  /** A golf course both ways (cut and stay, cut and go), else null. */
  approaches: Approaches | null;
  /** How the robots work: picked by the rep, else suggested (golf); always cut and go on a sod farm; null on a lawn. */
  approach: Approach | null;
  /** The acres we measured and their likely range (null on a lawn, or while the client's number is used). */
  range: AcreRange | null;
  /** What sized the fleet besides the site: the window and the field checks. */
  opts: FitOptions;
}

type FitInputs = [
  AcreageMode,
  LawnMeasurement | null,
  CourseMeasurement | null,
  SodMeasurement | null,
  QuoteSettings,
  TerrainGrid | null,
  [number, number] | null,
  Records["calibration"],
  Records["spread"],
];

/** The last fit, so the panel, the PDF and the quote share one computation per change. */
let last: { inputs: FitInputs; result: MowerFitResult | null } | null = null;

function computeFit(...inputs: FitInputs): MowerFitResult | null {
  if (last && inputs.every((v, i) => v === last!.inputs[i])) return last.result;
  const [mode, lawn, measurement, sod, q, terrain, placed, measured, spread] = inputs;
  const opts = { window: q.window, calibration: Object.fromEntries(Object.entries(measured).map(([id, c]) => [id, c.factor])) };
  // The store keeps [lat, lon] like the map; sites work in GeoJSON's [lon, lat].
  const charger: [number, number] | null = placed && [placed[1], placed[0]];
  let site: Site | null = null;
  if (mode === "lawn") {
    if (lawn) {
      const totals = lawnTotals(lawn);
      const sqft = lawnQuoteSqft(lawn, q) ?? totals.lawnSqft;
      // The robot drives around buildings and pools, from OSM, the LiDAR or the photos.
      const blocked = [...(lawn.mapped ?? []), ...(lawn.lidar ?? []), ...photoAreas(lawn).removed]
        .filter((a) => a.kind !== "paving")
        .map((a) => a.geometry);
      if (sqft > 0) site = lawnSite(totals.lawn, lawn.lot, blocked, charger, sqft / SQ_M_TO_SQ_FT, terrain);
      // A commercial or municipal site is measured like a lawn, and every robot competes for it.
      if (site && q.commercial) site = { ...site, kind: "site" };
    }
  } else {
    const acres = acresForQuote(mode, measurement, sod, q);
    if (acres && mode === "golf" && measurement) site = golfSite(measurement, q, acres, terrain, charger);
    if (acres && mode === "sod" && sod) site = sodSite(sod, acres, terrain, charger);
  }
  let result: MowerFitResult | null = null;
  if (site) {
    const approaches = site.kind === "golf" || site.kind === "site" ? recommendBoth(site, q.mowEvery, opts) : null;
    const approach = approaches ? (q.approach ?? approaches.suggested) : site.kind === "sod" ? "go" : null;
    const recommendation = approaches && approach ? approaches[approach] : recommend(site, q.mowEvery, null, opts);
    // Each unit drives within its own zone: the fleet covering the whole site sets the zones (on a course with fairways, the rough's).
    const fleet = mainFleet(recommendation);
    const range = mode !== "lawn" && q.override === null ? measuredRange(mode, measurement, sod, q, spread) : null;
    result = { site, complexity: complexity(site, fleet?.units ?? 1), recommendation, approaches, approach, range, opts };
  }
  last = { inputs, result };
  return result;
}

/**
 * The mower fit for whatever the Acreage tab has measured: the lawn (with the
 * rep's override as its area), or the quoted golf or sod acres, plus the LiDAR
 * terrain under it once loaded. Null until there's something to fit.
 */
export function useMowerFit(): MowerFitResult | null {
  const mode = useMode();
  const lawn = useLawn();
  const measurement = useMeasurement();
  const sod = useSod();
  const q = useQuoteSettings();
  const terrain = useTerrain();
  const charger = useCharger();
  const { calibration, spread } = useRecords();
  return useMemo(
    () => computeFit(mode, lawn, measurement, sod, q, terrain, charger, calibration, spread),
    [mode, lawn, measurement, sod, q, terrain, charger, calibration, spread],
  );
}

const LEVEL_TONE: Record<Level, string> = {
  simple: "bg-accent-soft text-accent-ink",
  moderate: toneClass("warn"),
  complex: toneClass("error"),
};

function useCopy(lang: Lang) {
  const t = UI[lang];
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const num = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (share: number) => num(Math.round(share * 100));

  const reason = (r: Reason, kind: Site["kind"]): string => {
    switch (r.key) {
      case "parts":
        return t.fitReason.parts(r.value, kind);
      case "narrow":
        return t.fitReason.narrow(num(r.value / 0.3048, 1), num(r.value, 1));
      case "shapes":
        return t.fitReason.shapes(pct(r.value));
      case "travel": {
        const far = r.farM ?? 0;
        return t.fitReason.travel(pct(r.value), kind === "lawn" ? `${num(far / 0.3048)} ft (${num(far)} m)` : `${num(far)} m`);
      }
      case "steep":
        return t.fitReason.steep(pct(r.value));
      case "slope":
        return t.fitReason.slope(num(r.value), num(slopeDeg(r.value)));
      case "canopy":
        return t.fitReason.canopy(pct(r.value));
      case "trees":
        return t.fitReason.trees(num(r.value), (r.share ?? 0) >= 0.005 ? pct(r.share ?? 0) : null);
      case "obstacles":
        return t.fitReason.obstacles(r.value);
      case "noTerrain":
        return t.fitReason.noTerrain;
    }
  };

  /** Why the recommended robot suits this site, mowing it all every `days`. */
  const why = (fit: Fit, site: Site, days: MowEvery): string[] => {
    const m = fit.mower;
    const out: string[] = [];
    const terrain = site.terrain;
    if (site.kind === "lawn" && m.line !== "voyager") out.push(t.fitRated(formatSqft(capacityM2(m, days) * SQ_M_TO_SQ_FT, lang), days));
    if (m.vision && terrain && terrain.canopy > 0.1) out.push(t.fitWhy.vision);
    if (m.fourWheel && terrain && terrain.coverage >= 0.5 && terrain.over25 > 0.02) out.push(t.fitWhy.fourWheel);
    if (m.zeroTrim && site.shape && site.shape.edgePer100 > 25) out.push(t.fitWhy.zeroTrim);
    if (m.avoidance && site.shape && site.shape.obstacles >= 3) out.push(t.fitWhy.avoidance);
    if (site.kind === "golf" && site.fairwayM2 > 0 && m.minCutMm <= 15) out.push(t.fitWhy.fairway);
    if (m.line === "voyager") out.push(t.fitWhy.fleet);
    else if (fit.units > 1) out.push(t.fitWhy.zones);
    if (fit.work) out.push(t.fitHours(num(fit.work.hours, fit.work.hours < 10 ? 1 : 0), fit.units > 1));
    return out;
  };

  // A lawn usually takes one robot: say so only when it takes more.
  const units = (fit: Fit, site: Site) => (site.kind === "lawn" && fit.units === 1 ? "" : ` · ${t.fitUnits(fit.units)}`);
  const date = new Date(`${MOWERS_AS_OF}T12:00:00`).toLocaleDateString(locale, { dateStyle: "long" });
  // Quebec French puts a space before a colon.
  const colon = lang === "fr" ? " : " : ": ";
  return { t, reason, why, units, date, colon };
}

/** A question in the card, answered with buttons. */
function Question<T extends string | number>(props: React.ComponentProps<typeof Segmented<T>>) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-ink-2">{props.label}</div>
      <Segmented {...props} />
    </div>
  );
}

/** "10 × KR238", "4 × KR238 + 7 × KR804" (fairways and rough): the robots a recommendation takes. */
function fleetText(r: Recommendation, none: string): string {
  const units = new Map<string, number>();
  for (const f of [r.best, r.rough]) if (f) units.set(f.mower.id, (units.get(f.mower.id) ?? 0) + f.units);
  return units.size ? [...units].map(([id, n]) => `${n} × ${id}`).join(" + ") : none;
}

/** Units at the ends of the likely acreage, when it has a range and they differ. */
function unitsAt(fit: Fit, site: Site, days: MowEvery, range: AcreRange | null, opts: FitOptions): [number, number] | null {
  if (!range || range.low === null || range.high === null || range.value <= 0) return null;
  const at = (acres: number) => {
    const f = acres / range.value;
    return fitMower({ ...site, areaM2: site.areaM2 * f, fairwayM2: site.fairwayM2 * f }, fit.mower, days, opts).units;
  };
  const span: [number, number] = [at(range.low), at(range.high)];
  return span[0] === span[1] && span[0] === fit.units ? null : span;
}

/** One recommended robot: name, units, why, and what to check on site. */
function Pick({
  label,
  fit,
  site,
  days,
  lang,
  span = null,
}: {
  label: string;
  fit: Fit;
  site: Site;
  days: MowEvery;
  lang: Lang;
  /** Units at the ends of the likely acreage. */
  span?: [number, number] | null;
}) {
  const { t, why, units, colon } = useCopy(lang);
  return (
    <div className="rounded-lg bg-accent-soft px-3 py-2 print:border print:border-line">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-ink/80">{label}</div>
      <div className="text-sm font-bold text-accent-ink">
        {mowerName(fit.mower)}
        {units(fit, site)}
      </div>
      {span && <div className="text-[11px] font-medium text-accent-ink/80">{t.sources.unitsRange(span[0], span[1])}</div>}
      <ul className="mt-0.5 space-y-0.5 text-[11px] text-accent-ink">
        {why(fit, site, days).map((line) => (
          <li key={line} className="flex items-start gap-1">
            <Icon name="check" className="mt-px h-3 w-3" />
            {line}
          </li>
        ))}
      </ul>
      {fit.notes.length > 0 && (
        <p className="mt-1 text-[11px] text-accent-ink/80">
          <span className="font-semibold">
            {t.fitCheck}
            {colon}
          </span>
          {fit.notes.map((n) => t.fitNote[n]).join(", ")}
        </p>
      )}
    </div>
  );
}

/**
 * How hard the measured property is for a robot (Simple / Moderate / Complex
 * and why) and which Kress model fits it best, with the next best. Shown in
 * the results panel and, with `print`, in the PDF report.
 */
export default function MowerFit({
  lang,
  loading,
  print = false,
  onMoveCharger,
}: {
  lang: Lang;
  loading?: boolean;
  print?: boolean;
  /** Starts placing the charger on the map (the panel only). */
  onMoveCharger?: () => void;
}) {
  const fit = useMowerFit();
  const { mowEvery, approach: picked, window: mowWindow } = useQuoteSettings();
  const { t, reason, units, date, colon } = useCopy(lang);
  if (!fit && !loading) return null;

  const scored = fit?.complexity.reasons.filter((r) => r.points > 0) ?? [];
  // While the LiDAR loads (the panel's live list shows it), "no LiDAR here" isn't known yet.
  const unscored = fit?.complexity.reasons.filter((r) => r.points === 0 && !(loading && r.key === "noTerrain")) ?? [];
  const rec = fit?.recommendation;
  const runnerUp = rec?.runnerUp;
  // What the next best does worse than the pick (shared caveats are on the pick).
  const worse = runnerUp ? runnerUp.notes.filter((n) => !rec?.best?.notes.includes(n)) : [];
  // The frequency sizes every fleet. A lawn's PDF says it in the pick ("Mows up to … every 2 days"), so the
  // line is left out there to keep one page.
  const frequency = fit && !(print && fit.site.kind === "lawn");
  const approaches = fit?.approaches;
  const approach = fit?.approach ?? null;
  const trimmedM2 = fit && rec ? rec.trimmed * fit.site.areaM2 : 0;
  // How much of its round-the-clock capacity the robot doing most of the work keeps in the window.
  const main = rec ? mainFleet(rec)?.mower : undefined;
  const windowShare = main
    ? main.line === "voyager"
      ? voyagerWindowShare(mowWindow, main.runtimeMin, ROI_DEFAULTS.voyDaysPerWeek)
      : robotWindowShare(mowWindow, main.runtimeMin)
    : undefined;
  const windowText = windowLine(mowWindow, lang);
  const trimmedArea =
    fit?.site.kind === "lawn" ? formatSqft(trimmedM2 * SQ_M_TO_SQ_FT, lang) : `${formatAcres(trimmedM2 / 4046.86, lang)} ac`;

  return (
    <section className={`space-y-2 ${print ? "" : "animate-fade-up border-t border-line pt-3"}`} aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Icon name="mower" className="h-4 w-4 text-accent" />
          {t.fitTitle}
        </h3>
        {fit && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_TONE[fit.complexity.level]}`}>
            {t.fitLevel[fit.complexity.level]}
          </span>
        )}
      </div>


      {fit && (
        <>
          <ul className="space-y-0.5 text-xs text-ink-2">
            {scored.length === 0 && !unscored.length && <li>{t.fitClear}</li>}
            {[...scored, ...unscored].map((r) => (
              <li key={r.key} className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.points >= 3 ? "bg-red-500" : r.points === 2 ? "bg-amber-500" : r.points === 1 ? "bg-accent" : "bg-line"}`}
                />
                {reason(r, fit.site.kind)}
              </li>
            ))}
          </ul>

          {frequency &&
            (print ? (
              <p className="text-xs text-ink-2">
                <span className="font-semibold">
                  {t.fitEvery.label}
                  {colon}
                </span>
                {t.fitEvery.options[mowEvery].toLowerCase()}
                {windowText && (
                  <>
                    {" · "}
                    <span className="font-semibold">
                      {t.fitWindow.label}
                      {colon}
                    </span>
                    {windowText}
                  </>
                )}
                {approaches && approach && (
                  <>
                    {" · "}
                    <span className="font-semibold">
                      {t.fitHow.label}
                      {colon}
                    </span>
                    {t.fitHow.options[approach].toLowerCase()}
                  </>
                )}
              </p>
            ) : (
              <>
                <Question
                  label={t.fitEvery.question}
                  value={mowEvery}
                  options={MOW_EVERY.map((days) => ({ value: days, label: t.fitEvery.options[days] }))}
                  onChange={(days) => setQuoteSettings({ mowEvery: days })}
                />
                <WindowPicker lang={lang} value={mowWindow} onChange={(w) => setQuoteSettings({ window: w })} share={windowShare} />
                {approaches && approach && (
                  <div className="space-y-1">
                    <Question
                      label={t.fitHow.question}
                      value={approach}
                      options={(["stay", "go"] as const).map((a) => ({
                        value: a,
                        label: t.fitHow.options[a],
                        sub: fleetText(approaches[a], t.fitHow.none),
                      }))}
                      onChange={(a) => setQuoteSettings({ approach: a })}
                    />
                    <p className="text-[11px] text-muted">
                      {(fit.site.kind === "site" ? t.fitHow.siteHints : t.fitHow.hints)[approach]}
                      {!picked && ` ${(fit.site.kind === "site" ? t.fitHow.siteSuggested : t.fitHow.suggested)[approach]}`}
                    </p>
                  </div>
                )}
              </>
            ))}

          {rec?.best ? (
            <Pick
              label={fit.site.kind === "golf" && fit.site.fairwayM2 > 0 ? t.fitFairways : t.fitBest}
              fit={rec.best}
              site={fit.site}
              days={mowEvery}
              lang={lang}
              span={rec.rough ? null : unitsAt(rec.best, fit.site, mowEvery, fit.range, fit.opts)}
            />
          ) : (
            <Notice tone="warn">{t.fitNone}</Notice>
          )}
          {rec?.rough && (
            <Pick
              label={t.fitRough}
              fit={rec.rough}
              site={{ ...fit.site, fairwayM2: 0, areaM2: fit.site.areaM2 - fit.site.fairwayM2 }}
              days={mowEvery}
              lang={lang}
              span={unitsAt(rec.rough, { ...fit.site, fairwayM2: 0, areaM2: fit.site.areaM2 - fit.site.fairwayM2 }, mowEvery, fit.range, fit.opts)}
            />
          )}
          {rec && rec.trimmed > 0 && <Notice tone="warn">{t.fitTrimmer(trimmedArea)}</Notice>}
          {runnerUp && (
            <p className="text-[11px] text-muted">
              <span className="font-semibold">
                {t.fitAlso}
                {colon}
              </span>
              {mowerName(runnerUp.mower)}
              {units(runnerUp, fit.site)}
              {worse.length > 0 && ` (${worse.map((n) => t.fitNote[n]).join(", ")})`}
            </p>
          )}
          {fit.site.charger && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
              <span className="flex items-center gap-1">
                <Icon name="zap" className="h-3 w-3 text-accent" />
                {fit.site.chargerEstimated
                  ? fit.site.kind === "lawn"
                    ? t.fitCharger.lawn
                    : fit.site.kind === "site"
                      ? t.fitCharger.site
                      : t.fitCharger.field
                  : t.fitCharger.placed}
              </span>
              {onMoveCharger && !print && (
                <button type="button" onClick={onMoveCharger} className="shrink-0 font-semibold text-accent hover:underline print:hidden">
                  {t.fitMoveCharger}
                </button>
              )}
            </div>
          )}
          {!print && rec && <Battlecard lang={lang} site={fit.site} rec={rec} approach={approach} />}
          <p className="text-[10px] leading-snug text-faint">{t.fitSource(date)}</p>
        </>
      )}
    </section>
  );
}
