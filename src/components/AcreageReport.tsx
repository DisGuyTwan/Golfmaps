"use client";

import { UI, formatAcres } from "@/lib/i18n";
import { estimatedTurf } from "@/lib/landcover";
import { useLang } from "@/lib/preferences";
import { QUOTE_CATEGORIES, acresForQuote, categoryAcres, lawnQuoteSqft, quoteBreakdown, satelliteAcres } from "@/lib/quote";
import { formatSqft, lawnTotals } from "@/lib/lawn";
import { useCourseName, useLawn, useMeasurement, useMode, useQuoteSettings, useSod, useTerrain } from "@/lib/quote-store";
import { SHOP, overWorkday } from "@/lib/run";
import { useRun } from "@/lib/run-store";
import type { SodField } from "@/lib/types";
import MowerFit from "./MowerFit";
import { formatClock, formatDuration, formatKm, formatLawn, legLine, stopName, useRunPlan } from "./RunPanel";
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
 * cover (outline only, or traced), and a sod farm (its fields). A residential
 * lawn has its own, in square feet (LawnReport).
 */
export default function AcreageReport() {
  const lang = useLang();
  const t = UI[lang];
  const mode = useMode();
  const m = useMeasurement();
  const sod = useSod();
  const q = useQuoteSettings();
  const courseName = useCourseName();
  const terrain = useTerrain();
  const run = useRun();
  if (run.open) return <RunReport />;
  if (mode === "lawn") return <LawnReport />;
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
    const est = estimatedTurf(sat);
    rows = [
      [t.satSeen, ac(sat.grassAcres), "–"],
      [`${t.satTotal} (${t.satRange(formatAcres(est.low, lang), formatAcres(est.high, lang)).toLowerCase()})`, ac(est.acres), ac(satelliteAcres(sat, q))],
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

            <MowerFit lang={lang} print />

            <div className={`${ui.note} space-y-1`}>
              {isSod && sod ? (
                <>
                  <p>{t.reportSodAt(q.sodPct)}</p>
                  {sod.year != null && sod.fields.some((f) => !f.traced) && <p>{t.sodSource(sod.year)}</p>}
                  {sod.photos && <p>{t.sodPhotos}</p>}
                </>
              ) : m && m.boundaryOnly ? (
                <>
                  <p>{m.outlineTraced ? t.outlineTraced : t.boundaryOnly}</p>
                  {sat ? (
                    <>
                      <p>{t.reportGrassAt(q.grassPct)}</p>
                      <p>{t.satNote(sat)}</p>
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
                {sat && <> · {sat.source === "photos" ? t.attributionPhotos : t.attributionWorldCover}</>}
                {isSod && sod?.year != null && <> · {t.attributionAci}</>}
                {isSod && sod?.photos && <> · {t.attributionPhotos}</>}
                {terrain && <> · {t.attributionLidar}</>}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The lawn PDF: the address, lot, what was taken out and the lawn left, in square feet. */
function LawnReport() {
  const lang = useLang();
  const t = UI[lang];
  const lawn = useLawn();
  const q = useQuoteSettings();
  const address = useCourseName();
  const terrain = useTerrain();
  const sq = (n: number) => formatSqft(n, lang);
  const date = new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long" });
  const totals = lawn ? lawnTotals(lawn) : null;
  const quoted = lawnQuoteSqft(lawn, q);
  const empty = !lawn && q.lawnOverride === null;

  return (
    <div className="hidden bg-white text-ink print:block">
      <TabHeader
        lang={lang}
        icon="map"
        eyebrow={`Calculator · ${date}`}
        title={t.reportLawnTitle}
        lede={t.reportLawnLede}
        printTitle={`Calculator - ${t.tabs.acreage}`}
      />
      <div className="space-y-3 px-4 py-4">
        {empty ? (
          <p className="text-sm text-muted">{t.reportLawnEmpty}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-ink-2">{t.reportAddress}</dt>
              <dd>{address ?? t.unnamedLot}</dd>
              <dt className="font-semibold text-ink-2">{t.reportDate}</dt>
              <dd>{date}</dd>
              {lawn && (
                <>
                  <dt className="font-semibold text-ink-2">{t.lawnLot}</dt>
                  <dd>{lawn.lotNumber ? t.lawnLotNumber(lawn.lotNumber) : t.lawnLotTraced}</dd>
                </>
              )}
            </dl>

            {totals && (
              <ReportTable
                head={[t.reportCategory, t.reportMeasured, t.reportCounted]}
                rows={[
                  [t.lawnLot, sq(totals.lotSqft), "–"],
                  [t.lawnBuilt, sq(totals.builtSqft), "–"],
                  [t.lawnPaved, sq(totals.pavedSqft), "–"],
                  [t.lawnTracedOut, sq(totals.tracedSqft), "–"],
                  [t.lawnTotal, sq(totals.lawnSqft), quoted !== null ? sq(quoted) : "–"],
                ]}
              />
            )}

            <div className="flex items-center justify-between rounded-xl bg-brand px-5 py-3 text-white">
              <span className="text-sm font-semibold">{t.lawnQuoteTotal}</span>
              <span className={ui.kpi}>{quoted !== null ? sq(quoted) : "–"}</span>
            </div>

            <MowerFit lang={lang} print />

            <div className={`${ui.note} space-y-1`}>
              {/* One paragraph, so a lot with LiDAR buildings and photo areas still prints on one page. */}
              <p>
                {[
                  t.lawnTreesNote,
                  totals?.lidarCount ? t.lawnLidar(totals.lidarCount) : null,
                  totals && totals.photoPools + totals.photoPaved > 0 ? t.lawnPhotos(totals.photoPools, totals.photoPaved) : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
              {q.lawnOverride !== null && <p>{t.reportLawnOverride(sq(q.lawnOverride))}</p>}
              <p>
                {t.attribution}
                {lawn?.lotSource === "cadastre" && <> · {t.attributionCadastre}</>}
                {terrain && <> · {t.attributionLidar}</>}
                {!!lawn?.imagery && <> · {t.attributionPhotos}</>}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A grass run's PDF: the day at a glance, then each stop in the run's order
 * with its lawn, the mowing and the crew's trimming and blowing (the longer
 * in bold) and when the crew gets there and leaves, for the crew's run sheet.
 */
function RunReport() {
  const lang = useLang();
  const t = UI[lang];
  const r = t.run;
  const run = useRun();
  const { plan, works, lawnM2, leg, driveKm } = useRunPlan();
  const s = run.settings;
  const date = new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long" });
  const saved = plan.enteredDriveMin - plan.driveMin;
  const lidar = run.stops.some((stop) => stop.terrain);
  const photos = run.stops.some((stop) => !!stop.lawn?.imagery);

  return (
    <div className="hidden bg-white text-ink print:block">
      <TabHeader
        lang={lang}
        icon="route"
        eyebrow={`Calculator · ${date}`}
        title={r.title}
        lede={r.reportLede}
        printTitle={`Calculator - ${r.title}`}
      />
      <div className="space-y-3 px-4 py-4">
        {plan.stops.length === 0 ? (
          <p className="text-sm text-muted">{r.empty}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-ink-2">{r.shop}</dt>
              <dd>{run.shop ? (run.shop.label ?? r.shopLabel) : r.shopNone}</dd>
              <dt className="font-semibold text-ink-2">{t.reportDate}</dt>
              <dd>{date}</dd>
            </dl>
            <p className="text-sm">{r.reportSettings(`Kress Voyager ${s.voyager}`, r.crewOption(s.crew), driveKm === null ? s.speedKmh : null, s.setupMin)}</p>

            <div className="flex items-center justify-between rounded-xl bg-brand px-5 py-3 text-white">
              <span className="text-sm font-semibold">
                {r.day} · {r.dayLine(formatClock(s.startMin, lang), formatClock(plan.endMin, lang))}
              </span>
              <span className={ui.kpi}>{formatDuration(plan.totalMin)}</span>
            </div>
            <p className="text-xs text-ink-2">
              {[
                `${driveKm !== null ? r.driveKm(formatDuration(plan.driveMin), formatKm(driveKm, lang)) : r.drive(formatDuration(plan.driveMin))}${
                  saved >= 1 ? ` (${r.saves(formatDuration(saved))})` : ""
                }`,
                r.onSite(formatDuration(plan.onSiteMin)),
                r.waits(formatDuration(plan.crewWaitMin), formatDuration(plan.mowerWaitMin)),
                r.battery(formatAcres(plan.acres, lang), plan.chargeAcres),
              ].join(" · ")}
            </p>

            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-accent-soft text-accent-ink">
                  {r.reportHead.map((h, i) => (
                    <th key={h} className={`px-2 py-1.5 ${i <= 1 ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.stops.map((p, k) => {
                  const stop = run.stops[p.index];
                  const w = works[p.index]!;
                  const crewLonger = p.crewMin > p.mowMin;
                  return (
                    <tr key={stop.id} className="border-b border-line">
                      <td className="px-2 py-1 font-bold">{k + 1}</td>
                      <td className="px-2 py-1">
                        {stopName(stop, lang)}
                        {(!w.fits || w.notes.length > 0) && <span className="text-muted"> ({r.voyagerCheck})</span>}
                        {p.driveMin >= 0.5 && (
                          <span className="block text-[10px] text-muted">{legLine(p.driveMin, leg(k ? plan.stops[k - 1].index : SHOP, p.index), lang)}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{formatLawn(lawnM2[p.index], lang)}</td>
                      <td className={`whitespace-nowrap px-2 py-1 text-right tabular-nums ${crewLonger ? "" : "font-bold"}`}>{formatDuration(p.mowMin)}</td>
                      <td className={`whitespace-nowrap px-2 py-1 text-right tabular-nums ${crewLonger ? "font-bold" : ""}`}>{formatDuration(p.crewMin)}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{formatClock(p.arriveMin, lang)}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{formatClock(p.leaveMin, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {run.shop && (
              <p className="text-xs text-ink-2">{r.backToShop(legLine(plan.returnMin, leg(plan.stops[plan.stops.length - 1].index, SHOP), lang))}</p>
            )}

            <div className={`${ui.note} space-y-1`}>
              {plan.acres > plan.chargeAcres && <p>{r.overBattery(plan.chargeAcres)}</p>}
              {overWorkday(plan) && <p>{r.overDay}</p>}
              <p>{r.sources}</p>
              <p>
                {t.attribution} · {t.attributionCadastre}
                {lidar && <> · {t.attributionLidar}</>}
                {photos && <> · {t.attributionPhotos}</>}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
