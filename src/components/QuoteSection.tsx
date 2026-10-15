"use client";

import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { QUOTE_CATEGORIES, categoryAcres, quoteAcres } from "@/lib/quote";
import { sendAcresToRoi, setQuoteSettings, useQuoteSettings } from "@/lib/quote-store";
import { goToTab } from "@/lib/tabs";
import type { CourseMeasurement } from "@/lib/types";
import { Icon } from "./icons";
import { CopyLinkButton, Notice, Pop, printAs, ui } from "./ui";

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
    <div className="animate-fade-up space-y-2.5 border-t border-line pt-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Icon name="calculator" className="h-4 w-4 text-accent" />
        {t.quoteTitle}
      </h3>

      {!result.boundaryOnly && (
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
        <Notice tone="warn">{t.needsOverride}</Notice>
      )}

      <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2">
        <span className="text-sm font-medium text-accent-ink">{t.quoteTotal}</span>
        <Pop value={acres !== null ? `${ac(acres)} ac` : "–"} className="text-lg font-bold tabular-nums text-accent-ink" />
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
