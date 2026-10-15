"use client";

import { UI, formatAcres } from "@/lib/i18n";
import { useLang } from "@/lib/preferences";
import { QUOTE_CATEGORIES, categoryAcres, quoteAcres, quoteBreakdown } from "@/lib/quote";
import { useCourseName, useMeasurement, useQuoteSettings } from "@/lib/quote-store";
import { TabHeader, ui } from "./ui";

/**
 * The Acreage tab's PDF: hidden on screen, printed instead of the map. Same
 * header as the other tabs' PDFs, then the course, a measured vs quoted table
 * and the assumptions behind the quoted acreage.
 */
export default function AcreageReport() {
  const lang = useLang();
  const t = UI[lang];
  const m = useMeasurement();
  const q = useQuoteSettings();
  const courseName = useCourseName();
  const ac = (n: number) => formatAcres(n, lang);
  const date = new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long" });
  const total = quoteAcres(m, q);
  const counted = m && !m.boundaryOnly ? quoteBreakdown(m, q) : null;

  return (
    <div className="hidden bg-white text-ink print:block">
      <TabHeader
        lang={lang}
        icon="map"
        eyebrow={`Calculator · ${date}`}
        title={t.reportTitle}
        lede={t.reportLede}
        printTitle={`Calculator - ${t.tabs.acreage}`}
      />
      <div className="space-y-4 px-4 py-4">
        {!m ? (
          <p className="text-sm text-muted">{t.reportEmpty}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-ink-2">{t.reportCourse}</dt>
              <dd>{courseName ?? t.unnamedCourse}</dd>
              <dt className="font-semibold text-ink-2">{t.reportDate}</dt>
              <dd>{date}</dd>
              {m.courseAcres > 0 && (
                <>
                  <dt className="font-semibold text-ink-2">{t.courseBoundary}</dt>
                  <dd>{ac(m.courseAcres)} ac</dd>
                </>
              )}
            </dl>

            {counted && (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-accent-soft text-accent-ink">
                    <th className="px-3 py-2 text-left">{t.reportCategory}</th>
                    <th className="px-3 py-2 text-right">{t.reportMeasured}</th>
                    <th className="px-3 py-2 text-right">{t.reportCounted}</th>
                  </tr>
                </thead>
                <tbody>
                  {QUOTE_CATEGORIES.map((c) => (
                    <tr key={c} className="border-b border-line">
                      <td className="px-3 py-1.5">{t.quoteCats[c]}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{ac(categoryAcres(m, c))} ac</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{q.include[c] ? `${ac(counted[c])} ac` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between rounded-xl bg-brand px-5 py-3 text-white">
              <span className="text-sm font-semibold">{t.quoteTotal}</span>
              <span className={ui.kpi}>{total !== null ? `${ac(total)} ac` : "–"}</span>
            </div>

            <div className={`${ui.note} space-y-1`}>
              {q.include.rough && !m.boundaryOnly && <p>{t.reportRoughAt(q.roughPct)}</p>}
              {q.override !== null && <p>{t.reportOverride(ac(q.override))}</p>}
              {!m.boundaryOnly && <p>{t.reelHint}</p>}
              {m.boundaryOnly && <p>{t.boundaryOnly}</p>}
              {m.roughEstimated && <p>{t.roughNote}</p>}
              <p>{t.attribution}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
