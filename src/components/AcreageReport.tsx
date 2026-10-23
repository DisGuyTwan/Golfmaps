"use client";

import { UI, formatAcres } from "@/lib/i18n";
import { useLang } from "@/lib/preferences";
import { QUOTE_CATEGORIES, acresForQuote, categoryAcres, quoteBreakdown, satelliteAcres } from "@/lib/quote";
import { useCourseName, useMeasurement, useMode, useQuoteSettings, useSod } from "@/lib/quote-store";
import type { SodField } from "@/lib/types";
import { TabHeader, ui } from "./ui";

/** Measured vs counted table: one row per line, "–" when it isn't counted. */
function ReportTable({ head, rows }: { head: [string, string, string]; rows: [string, string, string][] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-accent-soft text-accent-ink">
          <th className="px-3 py-2 text-left">{head[0]}</th>
          <th className="px-3 py-2 text-right">{head[1]}</th>
          <th className="px-3 py-2 text-right">{head[2]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, measured, counted]) => (
          <tr key={label} className="border-b border-line">
            <td className="px-3 py-1.5">{label}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{measured}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{counted}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The Acreage tab's PDF: hidden on screen, printed instead of the map. Same
 * header as the other tabs' PDFs, then the course or farm, a measured vs
 * quoted table and the assumptions behind the quoted acreage. Three shapes:
 * a mapped course (turf categories), a course counted from satellite land
 * cover (outline only, or traced), and a sod farm (its fields).
 */
export default function AcreageReport() {
  const lang = useLang();
  const t = UI[lang];
  const mode = useMode();
  const m = useMeasurement();
  const sod = useSod();
  const q = useQuoteSettings();
  const courseName = useCourseName();
  const ac = (n: number) => `${formatAcres(n, lang)} ac`;
  const date = new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long" });
  const total = acresForQuote(mode, m, sod, q);
  const isSod = mode === "sod";
  const empty = isSod ? !sod || (sod.fields.length === 0 && q.override === null) : !m;
  const sat = !isSod && m?.boundaryOnly ? m.satellite : null;

  const head: [string, string, string] = [t.reportCategory, t.reportMeasured, t.reportCounted];
  let rows: [string, string, string][] = [];
  if (isSod && sod) {
    const share = Math.min(100, Math.max(0, q.sodPct)) / 100;
    const sum = (fields: SodField[]) => fields.reduce((s, f) => s + f.acres, 0);
    // Disjoint rows, so each column adds up: counted detected, counted traced, left out.
    const detected = sod.fields.filter((f) => f.included && !f.traced);
    const traced = sod.fields.filter((f) => f.included && f.traced);
    const leftOut = sod.fields.filter((f) => !f.included);
    rows = [
      ...(detected.length ? [[`${t.reportFieldsDetected} (${detected.length})`, ac(sum(detected)), ac(sum(detected) * share)]] : []),
      ...(traced.length ? [[`${t.reportFieldsTraced} (${traced.length})`, ac(sum(traced)), ac(sum(traced) * share)]] : []),
      ...(leftOut.length ? [[`${t.reportFieldsLeftOut} (${leftOut.length})`, ac(sum(leftOut)), "–"]] : []),
    ] as [string, string, string][];
  } else if (sat) {
    rows = [
      [t.satGrass, ac(sat.grassAcres), ac(satelliteAcres(sat, q))],
      [t.satTrees, ac(sat.treesAcres), "–"],
      [t.satBuilt, ac(sat.builtAcres), "–"],
      [t.satWater, ac(sat.waterAcres), "–"],
    ];
  } else if (m && !m.boundaryOnly) {
    const counted = quoteBreakdown(m, q);
    rows = QUOTE_CATEGORIES.map((c) => [t.quoteCats[c], ac(categoryAcres(m, c)), q.include[c] ? ac(counted[c]) : "–"]);
  }

  return (
    <div className="hidden bg-white text-ink print:block">
      <TabHeader
        lang={lang}
        icon="map"
        eyebrow={`Calculator · ${date}`}
        title={isSod ? t.reportSodTitle : t.reportTitle}
        lede={isSod ? t.reportSodLede : t.reportLede}
        printTitle={`Calculator - ${t.tabs.acreage}`}
      />
      <div className="space-y-4 px-4 py-4">
        {empty ? (
          <p className="text-sm text-muted">{isSod ? t.reportSodEmpty : t.reportEmpty}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-ink-2">{isSod ? t.reportFarm : t.reportCourse}</dt>
              <dd>{courseName ?? (isSod ? t.unnamedFarm : t.unnamedCourse)}</dd>
              <dt className="font-semibold text-ink-2">{t.reportDate}</dt>
              <dd>{date}</dd>
              {!isSod && m && m.courseAcres > 0 && (
                <>
                  <dt className="font-semibold text-ink-2">{t.courseBoundary}</dt>
                  <dd>{ac(m.courseAcres)}</dd>
                </>
              )}
            </dl>

            {rows.length > 0 && <ReportTable head={head} rows={rows} />}

            <div className="flex items-center justify-between rounded-xl bg-brand px-5 py-3 text-white">
              <span className="text-sm font-semibold">{t.quoteTotal}</span>
              <span className={ui.kpi}>{total !== null ? ac(total) : "–"}</span>
            </div>

            <div className={`${ui.note} space-y-1`}>
              {isSod && sod ? (
                <>
                  <p>{t.reportSodAt(q.sodPct)}</p>
                  {sod.year != null && sod.fields.some((f) => !f.traced) && <p>{t.sodSource(sod.year)}</p>}
                </>
              ) : m && m.boundaryOnly ? (
                <>
                  <p>{m.outlineTraced ? t.outlineTraced : t.boundaryOnly}</p>
                  {sat ? (
                    <>
                      <p>{t.reportGrassAt(q.grassPct)}</p>
                      <p>{t.satNote(sat.year)}</p>
                    </>
                  ) : (
                    <p>{t.needsOverride}</p>
                  )}
                </>
              ) : m ? (
                <>
                  {q.include.rough && <p>{t.reportRoughAt(q.roughPct)}</p>}
                  <p>{t.reelHint}</p>
                  {m.roughEstimated && <p>{t.roughNote}</p>}
                </>
              ) : null}
              {q.override !== null && <p>{t.reportOverride(formatAcres(q.override, lang))}</p>}
              <p>
                {t.attribution}
                {sat && <> · {t.attributionWorldCover}</>}
                {isSod && sod?.year != null && <> · {t.attributionAci}</>}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
