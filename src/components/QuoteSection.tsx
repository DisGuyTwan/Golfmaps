"use client";

import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { QUOTE_CATEGORIES, categoryAcres, quoteAcres } from "@/lib/quote";
import { sendAcresToRoi, setQuoteSettings, useQuoteSettings } from "@/lib/quote-store";
import { goToTab } from "@/lib/tabs";
import type { CourseMeasurement } from "@/lib/types";
import { CopyLinkButton, printAs, ui } from "./ui";

/**
 * Turns a measurement into the acres a quote is built on: which categories
 * count, how much of the rough is really mowed, or a number typed by hand.
 * Then sends it to the ROI tab, prints the PDF report or copies a share link.
 */
export default function QuoteSection({
  lang,
  result,
  getShareUrl,
}: {
  lang: Lang;
  result: CourseMeasurement;
  getShareUrl: () => string;
}) {
  const t = UI[lang];
  const q = useQuoteSettings();
  const acres = quoteAcres(result, q);
  const ac = (n: number) => formatAcres(n, lang);

  return (
    <div className="space-y-2.5 border-t border-line pt-3">
      <h3 className="text-sm font-bold text-ink">{t.quoteTitle}</h3>

      {!result.boundaryOnly && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {QUOTE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={q.include[c]}
                onClick={() => setQuoteSettings({ include: { ...q.include, [c]: !q.include[c] } })}
                className={`min-h-8 rounded-full border px-2.5 text-xs font-semibold transition ${
                  q.include[c] ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {t.quoteCats[c]} · {ac(categoryAcres(result, c))}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-faint">{t.reelHint}</p>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        {!result.boundaryOnly && (
          <label className="space-y-1">
            <span className="block text-xs font-semibold text-ink-2">{t.roughPct}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={5}
              value={q.roughPct}
              onChange={(e) => setQuoteSettings({ roughPct: Number(e.target.value) || 0 })}
              className={`${ui.input} py-1.5 text-sm`}
            />
          </label>
        )}
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
      {!result.boundaryOnly && q.include.rough && <p className="text-[11px] text-faint">{t.roughPctHint}</p>}
      {result.boundaryOnly && acres === null && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
          {t.needsOverride}
        </p>
      )}

      <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2">
        <span className="text-sm font-medium text-accent-ink">{t.quoteTotal}</span>
        <span className="text-lg font-bold tabular-nums text-accent-ink">{acres !== null ? `${ac(acres)} ac` : "–"}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={acres === null}
          onClick={() => {
            if (acres === null) return;
            sendAcresToRoi(acres);
            goToTab("#roi");
          }}
          className={`${ui.btnPrimary} flex-1`}
        >
          {t.sendToRoi}
        </button>
        <button type="button" onClick={() => printAs(`Kress - ${t.tabs.acreage}`)} className={ui.btnSecondary}>
          {t.reportPdf}
        </button>
        <CopyLinkButton lang={lang} getUrl={getShareUrl} className={ui.btnSecondary} />
      </div>
    </div>
  );
}
