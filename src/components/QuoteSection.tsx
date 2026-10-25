"use client";

import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { formatSqft, type LawnMeasurement } from "@/lib/lawn";
import { QUOTE_CATEGORIES, acresForQuote, categoryAcres, lawnQuoteSqft, type AcreageMode, type QuoteSettings } from "@/lib/quote";
import { sendAcresToRoi, setQuoteSettings, useQuoteSettings } from "@/lib/quote-store";
import { mainFleet, roiModel } from "@/lib/mowers";
import { goToTab } from "@/lib/tabs";
import type { CourseMeasurement, SodMeasurement } from "@/lib/types";
import { Icon } from "./icons";
import { useMowerFit } from "./MowerFit";
import { useRecords } from "@/lib/records-store";
import { compareClient, measuredRange, type AcreRange } from "@/lib/trust";
import { CopyLinkButton, Notice, Pop, printAs, ui } from "./ui";

/** A 0–100 % input bound to one quote setting. */
function PctInput({ label, field, q }: { label: string; field: "roughPct" | "grassPct" | "sodPct"; q: QuoteSettings }) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-semibold text-ink-2">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={5}
        value={q[field]}
        onChange={(e) => setQuoteSettings({ [field]: Number(e.target.value) || 0 })}
        className={`${ui.input} py-1.5 text-sm`}
      />
    </label>
  );
}

/**
 * How sure the acres are: our likely range (and where it comes from), or,
 * when the client gave their own number, ours beside it and whether theirs
 * falls in our range.
 */
function RangeLine({ lang, range, client }: { lang: Lang; range: AcreRange | null; client: number | null }) {
  const s = UI[lang].sources;
  if (!range) return null;
  const ac = (n: number) => `${formatAcres(n, lang)} ac`;
  const likely =
    range.low !== null && range.high !== null
      ? `${s.likely(formatAcres(range.low, lang), ac(range.high))} (${range.rangeFrom === "record" ? s.fromRecord(range.n) : s.fromCalibration})`
      : null;
  if (client !== null) {
    const { inRange, diffPct } = compareClient(client, range);
    const pct = `${diffPct > 0 ? "+" : ""}${Math.round(diffPct)}${lang === "fr" ? " %" : "%"}`;
    const verdict = inRange === null ? s.offBy(pct) : inRange ? s.inRange : `${s.offBy(pct)}, ${s.outRange}`;
    return (
      <p className={`text-[11px] ${inRange === false ? "text-amber-700 dark:text-amber-300" : "text-muted"}`}>
        {s.ours(ac(range.value))}
        {likely && ` · ${likely}`} · {verdict}
      </p>
    );
  }
  return <p className="text-[11px] text-muted">{likely ?? s.noRange}</p>;
}

/**
 * A residential lawn's quote: the lawn in square feet, or a number typed by
 * hand, then the PDF report and a share link. No ROI: that tab compares a
 * Voyager with a commercial crew.
 */
function LawnQuote({ lang, lawn, getShareUrl }: { lang: Lang; lawn: LawnMeasurement | null; getShareUrl: () => string }) {
  const t = UI[lang];
  const q = useQuoteSettings();
  const sqft = lawnQuoteSqft(lawn, q);
  // A commercial or municipal site: in acres (the client's number too), and on to the ROI tab.
  const { commercial } = q;
  const fit = useMowerFit();
  const SQFT_PER_ACRE = 43_560;
  const acres = sqft !== null ? sqft / SQFT_PER_ACRE : null;
  const shown = commercial ? (q.lawnOverride !== null ? Math.round((q.lawnOverride / SQFT_PER_ACRE) * 100) / 100 : "") : (q.lawnOverride ?? "");
  return (
    <div className="animate-fade-up space-y-2.5 border-t border-line pt-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Icon name="calculator" className="h-4 w-4 text-accent" />
        {commercial ? t.siteQuoteTitle : t.lawnQuoteTitle}
      </h3>
      <label className="block space-y-1">
        <span className="block text-xs font-semibold text-ink-2">{commercial ? t.siteOverride : t.lawnOverride}</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={commercial ? 0.1 : 50}
          placeholder={t.overridePlaceholder}
          value={shown}
          onChange={(e) => {
            const n = Number(e.target.value) * (commercial ? SQFT_PER_ACRE : 1);
            setQuoteSettings({ lawnOverride: e.target.value === "" || !(n > 0) ? null : n });
          }}
          className={`${ui.input} py-1.5 text-sm`}
        />
      </label>
      <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2">
        <span className="text-sm font-medium text-accent-ink">{commercial ? t.siteQuoteTitle : t.lawnQuoteTotal}</span>
        <Pop
          value={sqft === null ? "–" : commercial ? `${formatAcres(acres!, lang)} ac` : formatSqft(sqft, lang)}
          className="text-lg font-bold tabular-nums text-accent-ink"
        />
      </div>
      {commercial && acres !== null && (
        <button
          type="button"
          onClick={() => {
            const fleet = fit ? mainFleet(fit.recommendation) : null;
            const voyager = fit?.approaches ? mainFleet(fit.approaches.go) : fleet;
            sendAcresToRoi({
              acres,
              approach: fit?.approach ?? null,
              every: q.mowEvery,
              model: roiModel(voyager?.mower),
              layoutPct: fleet?.work ? Math.max(0, Math.round((fleet.work.factor - 1) * 100)) : null,
              window: q.window,
              range: null,
            });
            goToTab("#roi");
          }}
          className={`${ui.btnPrimary} group w-full`}
        >
          {t.sendToRoi}
          <Icon name="arrowRight" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => printAs(`Calculator - ${t.tabs.acreage}`)} className={`${ui.btnPrimary} flex-1`}>
          <Icon name="file" />
          {t.reportPdf}
        </button>
        <CopyLinkButton lang={lang} getUrl={getShareUrl} className={ui.btnSecondary} />
      </div>
    </div>
  );
}

/**
 * Turns a measurement into the acres a quote is built on. For a mapped
 * course: which categories count and how much of the rough is really mowed.
 * For a course with only an outline: the share of the satellite grass robots
 * mow. For a sod farm: the share of the fields being mowed. A number typed by
 * hand wins over all of them. Then sends it to the ROI tab, prints the PDF
 * report or copies a share link. A residential lawn has its own, in square
 * feet (LawnQuote).
 */
export default function QuoteSection({
  lang,
  mode,
  result,
  sod,
  lawn,
  getShareUrl,
}: {
  lang: Lang;
  mode: AcreageMode;
  result: CourseMeasurement | null;
  sod: SodMeasurement | null;
  lawn: LawnMeasurement | null;
  getShareUrl: () => string;
}) {
  if (mode === "lawn") return <LawnQuote lang={lang} lawn={lawn} getShareUrl={getShareUrl} />;
  return <AcreQuote lang={lang} mode={mode} result={result} sod={sod} getShareUrl={getShareUrl} />;
}

function AcreQuote({
  lang,
  mode,
  result,
  sod,
  getShareUrl,
}: {
  lang: Lang;
  mode: AcreageMode;
  result: CourseMeasurement | null;
  sod: SodMeasurement | null;
  getShareUrl: () => string;
}) {
  const t = UI[lang];
  const q = useQuoteSettings();
  const acres = acresForQuote(mode, result, sod, q);
  const range = measuredRange(mode, result, sod, q, useRecords().spread);
  // What the mower fit recommends for the whole job (or the rough), so the ROI tab prices the same robots: how they
  // work, how often, the layout's extra time over a plain square (none when it's quicker), and the Voyager size
  // (on a course, the cut-and-go one, in case the ROI tab switches to it).
  const fit = useMowerFit();
  const fleet = fit ? mainFleet(fit.recommendation) : null;
  const voyager = fit?.approaches ? mainFleet(fit.approaches.go) : fleet;
  const layoutPct = fleet?.work ? Math.max(0, Math.round((fleet.work.factor - 1) * 100)) : null;
  const ac = (n: number) => formatAcres(n, lang);
  const mapped = mode === "golf" && result !== null && !result.boundaryOnly;
  const satellite = mode === "golf" && result?.boundaryOnly && result.satellite !== null;

  return (
    <div className="animate-fade-up space-y-2.5 border-t border-line pt-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Icon name="calculator" className="h-4 w-4 text-accent" />
        {t.quoteTitle}
      </h3>

      {mapped && result && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {QUOTE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={q.include[c]}
                onClick={() => setQuoteSettings({ include: { ...q.include, [c]: !q.include[c] } })}
                className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                  q.include[c] ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                <Icon
                  name="check"
                  className={`h-3 transition-all duration-200 ${q.include[c] ? "w-3 opacity-100" : "-mr-1 w-0 opacity-0"}`}
                />
                {t.quoteCats[c]} · {ac(categoryAcres(result, c))}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-faint">{t.reelHint}</p>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        {mapped && <PctInput label={t.roughPct} field="roughPct" q={q} />}
        {satellite && <PctInput label={t.grassPct} field="grassPct" q={q} />}
        {mode === "sod" && <PctInput label={t.sodPct} field="sodPct" q={q} />}
        <label className="space-y-1">
          <span className="block text-xs font-semibold text-ink-2">{t.override}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            placeholder={t.overridePlaceholder}
            value={q.override ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              setQuoteSettings({ override: e.target.value === "" || !(n > 0) ? null : n });
            }}
            className={`${ui.input} py-1.5 text-sm`}
          />
        </label>
      </div>
      {mapped && q.include.rough && <p className="text-[11px] text-faint">{t.roughPctHint}</p>}
      {satellite && <p className="text-[11px] text-faint">{t.grassPctHint}</p>}
      {mode === "sod" && <p className="text-[11px] text-faint">{t.sodPctHint}</p>}
      {mode === "golf" && result?.boundaryOnly && !result.satellite && acres === null && (
        <Notice tone="warn">{t.needsOverride}</Notice>
      )}

      <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2">
        <span className="text-sm font-medium text-accent-ink">{t.quoteTotal}</span>
        <Pop value={acres !== null ? `${ac(acres)} ac` : "–"} className="text-lg font-bold tabular-nums text-accent-ink" />
      </div>
      <RangeLine lang={lang} range={range} client={q.override} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={acres === null}
          onClick={() => {
            if (acres === null) return;
            sendAcresToRoi({
              acres,
              approach: fit?.approach ?? null,
              every: q.mowEvery,
              model: roiModel(voyager?.mower),
              layoutPct,
              window: q.window,
              // The likely range as shares of the acres sent (none for the client's own number).
              range: q.override === null && range?.low != null && range.high != null ? [range.low / range.value, range.high / range.value] : null,
            });
            goToTab("#roi");
          }}
          className={`${ui.btnPrimary} group flex-1`}
        >
          {t.sendToRoi}
          <Icon name="arrowRight" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
        <button type="button" onClick={() => printAs(`Calculator - ${t.tabs.acreage}`)} className={ui.btnSecondary}>
          <Icon name="file" />
          {t.reportPdf}
        </button>
        <CopyLinkButton lang={lang} getUrl={getShareUrl} className={ui.btnSecondary} />
      </div>
    </div>
  );
}
