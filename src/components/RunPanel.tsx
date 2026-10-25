"use client";

import { useMemo, useState } from "react";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { formatSqft, SQ_M_TO_SQ_FT } from "@/lib/lawn";
import type { RoadLeg } from "@/lib/roads";
import {
  CREW_MOWERS,
  CREW_SIZES,
  MAX_STOPS,
  RUN_VOYAGERS,
  SHOP,
  crewMowSqftPerH,
  directionsLinks,
  lawnsPerDay,
  overWorkday,
  planRun,
  readyStops,
  runOrder,
  stopWork,
  straightDrive,
  todayDay,
  type DriveFn,
  type RunPlan,
  type RunSettings,
  type RunVoyager,
  type StopWork,
  type TodayDay,
} from "@/lib/run";
import {
  clearRun,
  closeRun,
  dismissImport,
  importAddresses,
  legKey,
  removeStop,
  retryRoads,
  retryStop,
  setPickingShop,
  setRunSettings,
  setShop,
  stopSiteOf,
  useRun,
  type RunImport,
  type RunPlace,
  type RunRoads,
  type RunStop,
} from "@/lib/run-store";
import { Icon } from "./icons";
import Sheet from "./Sheet";
import LiveSteps from "./LiveSteps";
import { CopyLinkButton, Notice, Pop, Segmented, printAs, ui } from "./ui";

export interface RunPlanResult {
  plan: RunPlan;
  /** Each stop's work for the chosen Voyager (null until measured, or with no lawn), by index. */
  works: (StopWork | null)[];
  lawnM2: number[];
  /** The day's length with each Voyager and each crew size, for the choices. */
  byVoyager: Record<RunVoyager, number>;
  byCrew: number[];
  /** A leg on the roads between two places (stop indexes, or SHOP); null before the roads load, or where they don't join. */
  leg: (from: number, to: number) => RoadLeg | null;
  /** The places in the day's order, [lat, lon], from the shop and back when there is one. */
  route: [number, number][];
  /** Kilometres driven in the day, when every leg is on the roads. */
  driveKm: number | null;
  /** Legs of the day driven by the straight line, once the roads have loaded (or failed to). */
  straightLegs: number;
  /** The same stops and route today, the crew mowing too. */
  today: TodayDay;
}

type PlanInputs = [RunStop[], RunPlace | null, RunSettings, RunRoads];
/** The last plan, so the calculator (panel and map) and the PDF share one computation per change. */
let lastPlan: { inputs: PlanInputs; result: RunPlanResult } | null = null;

function computePlan(...inputs: PlanInputs): RunPlanResult {
  if (lastPlan && inputs.every((v, i) => v === lastPlan!.inputs[i])) return lastPlan.result;
  const [stops, shop, settings, roads] = inputs;
  const sites = stops.map(stopSiteOf);
  const lawnM2 = sites.map((s) => s?.lawnM2 ?? 0);
  const points = stops.map((s) => s.point);
  const shopPoint = shop?.point ?? null;
  const worksFor = (v: RunVoyager) => sites.map((s) => (s ? stopWork(s, v, settings) : null));
  const all = Object.fromEntries(RUN_VOYAGERS.map((v) => [v, worksFor(v)])) as Record<RunVoyager, (StopWork | null)[]>;
  // Driving on the roads once they've loaded; the straight line until then, and for a leg they don't join.
  const at = (i: number) => (i === SHOP ? shopPoint! : points[i]);
  // Legs routed before stay while more load: the roads between two places don't change.
  const leg = (a: number, b: number) => roads.legs.get(legKey(at(a), at(b))) ?? null;
  const straight = straightDrive(points, shopPoint, settings.speedKmh);
  const drive: DriveFn = (a, b) => leg(a, b)?.minutes ?? straight(a, b);
  // Both Voyagers measure the same stops, so one order serves every choice.
  const order = runOrder(readyStops(all[settings.voyager]), shopPoint !== null, drive);
  const plan = (s: RunSettings) => planRun(points, all[s.voyager], lawnM2, shopPoint, s, { order, drive });
  const day = plan(settings);
  const places = [...(shopPoint ? [SHOP] : []), ...day.stops.map((p) => p.index), ...(shopPoint && day.stops.length ? [SHOP] : [])];
  const legs = places.slice(1).map((b, k) => leg(places[k], b));
  const result: RunPlanResult = {
    plan: day,
    works: all[settings.voyager],
    lawnM2,
    byVoyager: Object.fromEntries(RUN_VOYAGERS.map((v) => [v, plan({ ...settings, voyager: v }).totalMin])) as Record<RunVoyager, number>,
    byCrew: CREW_SIZES.map((crew) => plan({ ...settings, crew }).totalMin),
    leg,
    route: places.map(at),
    driveKm: legs.length && legs.every(Boolean) ? legs.reduce((t, l) => t + l!.km, 0) : null,
    straightLegs: roads.state === "ready" || roads.state === "failed" ? legs.filter((l) => !l).length : 0,
    today: todayDay(day, all[settings.voyager], settings),
  };
  lastPlan = { inputs, result };
  return result;
}

/** The day for the run on screen, planned once per change for the panel, the map and the PDF. */
export function useRunPlan(): RunPlanResult {
  const { stops, shop, settings, roads } = useRun();
  return useMemo(() => computePlan(stops, shop, settings, roads), [stops, shop, settings, roads]);
}

/** Kilometres, one decimal: "2.1" / "2,1". */
export const formatKm = (km: number, lang: Lang) => km.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** "4 min drive · 2.1 km via Rue X, Boul. Y": a leg as the crew drives it. */
export function legLine(minutes: number, leg: RoadLeg | null, lang: Lang): string {
  const r = UI[lang].run;
  return [r.driveTo(formatDuration(minutes)), leg && `${formatKm(leg.km, lang)} km`, leg?.via.length ? r.via(leg.via.join(", ")) : null]
    .filter(Boolean)
    .join(" · ");
}

/** "35 min", "1 h 05". */
export const formatDuration = (min: number) => {
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

/** "7:30 a.m." in English, "7 h 30" in French. */
export const formatClock = (min: number, lang: Lang) => {
  const m = Math.round(min);
  return new Date(2000, 0, 1, Math.floor(m / 60) % 24, m % 60).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
};

/** A stop's lawn: square feet on a house lot, acres past one. */
export const formatLawn = (m2: number, lang: Lang) =>
  m2 >= 4046.86 ? `${formatAcres(m2 / 4046.86, lang)} ac` : formatSqft(m2 * SQ_M_TO_SQ_FT, lang);

/** What a stop goes by: the address searched, else its lot number, else where it was tapped. */
export function stopName(stop: RunStop, lang: Lang): string {
  if (stop.label) return stop.label;
  if (stop.lawn?.lotNumber) return UI[lang].run.lot(stop.lawn.lotNumber);
  return `${stop.point[0].toFixed(5)}, ${stop.point[1].toFixed(5)}`;
}

/** The run's small inputs, all one height (an iPhone's time field is otherwise taller). */
const SMALL_INPUT = "block h-[34px] min-w-0 py-1.5 text-sm";

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * A small number input bound to one run setting. What's typed stays as typed
 * while editing (a speed of 40 passes through 4); only a value in range is
 * applied, and leaving the field shows the setting again.
 */
function SettingInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-xs font-semibold text-ink-2">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text ?? String(value)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setText(null)}
        className={`${ui.input} ${SMALL_INPUT}`}
      />
    </label>
  );
}

/** One stop still loading: what it's reading now, live, like the single-property list. */
function Loading({ stop, lang }: { stop: RunStop; lang: Lang }) {
  const t = UI[lang];
  const active = stop.live.find((s) => s.state === "active");
  if (stop.state === "waiting" || !active) return <div className="text-[11px] text-muted">{t.run.waiting}</div>;
  return (
    <>
      <div className="truncate text-[11px] text-muted">{t.live.reading[active.source]}</div>
      <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-line">
        <span className="absolute inset-y-0 left-0 w-2/5 animate-scan rounded-full bg-accent" />
      </div>
    </>
  );
}

/** Sheets the import reads (an .xls is offered too, to say it should be saved as .xlsx). */
const SHEET_TYPES = ".xlsx,.csv,.tsv,.txt,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

/** What came of a sheet of addresses: added, not found, on their street only, left out; or why it couldn't be read. */
function ImportResult({ imported: im, lang }: { imported: RunImport; lang: Lang }) {
  const r = UI[lang].run;
  const lines = im.error
    ? [im.error === "xls" ? r.importXls : im.error === "empty" ? r.importEmpty : r.importFailed]
    : [
        r.importDone(im.added, im.total),
        im.missed.length ? r.importMissed(im.missed.map((m) => r.importRow(m.row, m.address)).join(", ")) : "",
        im.onStreet ? r.importStreet(im.onStreet) : "",
        im.already ? r.importAlready(im.already) : "",
        im.over ? r.importOver(im.over, MAX_STOPS) : "",
      ].filter(Boolean);
  return (
    <Notice tone={im.error || im.missed.length || im.onStreet || im.over ? "warn" : "info"}>
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1 space-y-0.5">
          {lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </span>
        <button onClick={dismissImport} aria-label={r.close} className="shrink-0 rounded p-0.5 opacity-70 transition hover:opacity-100">
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </span>
    </Notice>
  );
}

/**
 * Planning a grass run: stops added by search or a tap (each measured like a
 * lawn, live), the shop the day starts and ends at, the Voyager and the crew,
 * and the day in the order with the least driving: at each stop the set-up
 * plus the longer of the mowing and the crew's trimming and blowing, with
 * who waits for whom. Stops can also come from a sheet of addresses (Excel
 * or CSV). Takes the single-property panel's place.
 */
export default function RunPanel({
  lang,
  notice,
  planned: { plan, works, lawnM2, byVoyager, byCrew, leg, route, driveKm, straightLegs, today },
  getShareUrl,
  getBias,
  onImported,
}: {
  lang: Lang;
  notice: string | null;
  /** The day, planned by the caller once for the panel and the map (useRunPlan). */
  planned: RunPlanResult;
  getShareUrl: () => string;
  /** Where the map is, to place a sheet's addresses near it. */
  getBias: () => { lat: number; lon: number } | null;
  /** A sheet's addresses are all placed: frame the run. */
  onImported: () => void;
}) {
  const t = UI[lang];
  const r = t.run;
  const run = useRun();
  const [startText, setStartText] = useState<string | null>(null);
  const s = run.settings;
  const position = new Map(plan.stops.map((p, k) => [p.index, k]));
  const planned = plan.stops.map((p) => ({ stop: run.stops[p.index], p }));
  const others = run.stops.filter((_, i) => !position.has(i));
  const saved = plan.enteredDriveMin - plan.driveMin;
  const fitNote = (n: string) => t.fitNote[n as keyof typeof t.fitNote] ?? n;
  // The set speed only counts for legs the roads don't join: then it's asked, and why.
  const straightLine = straightLegs > 0;
  const roadsNote =
    run.roads.state === "failed" && !run.roads.legs.size
      ? r.roadsFailed
      : run.roads.tooFar
        ? r.roadsTooFar
        : run.roads.missed
          ? r.roadsMissed(straightLegs)
          : r.roadsUnjoined(straightLegs);
  const lastStop = plan.stops.at(-1)?.index;
  const importing = !!run.imported && !run.imported.done;
  const directions = plan.stops.length ? directionsLinks(route) : [];
  const n = plan.stops.length;
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const perDay = (min: number) => lawnsPerDay(n, min).toLocaleString(locale, { maximumFractionDigits: 1 });
  const perWeek = (min: number) => Math.round(lawnsPerDay(n, min) * 5).toLocaleString(locale);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1200] flex justify-center p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <Sheet handleLabel={t.sheetHandle}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Icon name="route" className="h-[18px] w-[18px] text-accent" />
            {r.title}
          </h2>
          <button
            onClick={closeRun}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-faint transition hover:bg-surface-2 hover:text-ink"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
            {r.close}
          </button>
        </div>

        {run.pickingShop ? (
          <div className="space-y-2">
            <Notice tone="info">{r.shopPick}</Notice>
            <button onClick={() => setPickingShop(false)} className={`${ui.btnSecondary} w-full`}>
              <Icon name="close" />
              {t.cancel}
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-muted">{r.hint}</p>
        )}
        {notice && <Notice tone="info">{notice}</Notice>}

        {/* A sheet of addresses: each placed in turn and added as a stop. */}
        {!run.pickingShop && (
          <div className="space-y-1">
            <label
              className={`${ui.btnSecondary} w-full cursor-pointer focus-within:ring-2 focus-within:ring-accent ${importing ? "pointer-events-none opacity-60" : ""}`}
            >
              <Icon name="table" />
              {r.importSheet}
              <input
                type="file"
                accept={SHEET_TYPES}
                disabled={importing}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Cleared, so the same file can be picked again.
                  e.target.value = "";
                  if (file) void importAddresses(file, lang, getBias()).then(onImported);
                }}
              />
            </label>
            {run.stops.length === 0 && !run.imported && <p className="text-[11px] text-muted">{r.importHint}</p>}
          </div>
        )}
        {run.imported && <LiveSteps lang={lang} steps={run.imported.live} />}
        {run.imported?.done && <ImportResult imported={run.imported} lang={lang} />}

        {/* The shop */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink-2">{r.shop}</div>
            <div className="flex items-center gap-1.5 truncate text-sm text-ink">
              {run.shop ? (
                <>
                  <Icon name="home" className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="truncate">{run.shop.label ?? r.shopLabel}</span>
                </>
              ) : (
                <span className="text-xs text-muted">{r.shopNone}</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2 text-xs font-semibold">
            <button onClick={() => setPickingShop(true)} className="text-accent hover:underline">
              {run.shop ? r.changeShop : r.setShop}
            </button>
            {run.shop && (
              <button onClick={() => setShop(null)} className="text-faint hover:text-ink">
                {r.removeShop}
              </button>
            )}
          </div>
        </div>

        {/* The Voyager and the crew: each choice shows the day it makes. */}
        <div className="space-y-1">
          <div className="text-xs font-semibold text-ink-2">{r.voyager}</div>
          <Segmented
            label={r.voyager}
            value={s.voyager}
            options={RUN_VOYAGERS.map((v) => ({ value: v, label: v, sub: plan.stops.length ? formatDuration(byVoyager[v]) : undefined }))}
            onChange={(voyager) => setRunSettings({ voyager })}
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold text-ink-2">{r.crew}</div>
          <Segmented
            label={r.crew}
            value={s.crew}
            options={CREW_SIZES.map((n, i) => ({ value: n, label: r.crewOption(n), sub: plan.stops.length ? formatDuration(byCrew[i]) : undefined }))}
            onChange={(crew) => setRunSettings({ crew })}
          />
        </div>
        <div className={`grid ${straightLine ? "grid-cols-[1.3fr_1fr_1fr]" : "grid-cols-2"} items-end gap-2`}>
          <label className="min-w-0 space-y-1">
            <span className="block text-xs font-semibold text-ink-2">{r.startTime}</span>
            <input
              type="time"
              value={startText ?? hhmm(s.startMin)}
              onChange={(e) => {
                setStartText(e.target.value);
                const [h, m] = e.target.value.split(":").map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) setRunSettings({ startMin: h * 60 + m });
              }}
              onBlur={() => setStartText(null)}
              // iPhones draw a time field at its own width and height, over the field beside it: drawn plainly, it fits its cell.
              className={`${ui.input} ${SMALL_INPUT} appearance-none`}
            />
          </label>
          {straightLine && (
            <SettingInput label={r.speed} value={s.speedKmh} min={5} max={100} onChange={(speedKmh) => setRunSettings({ speedKmh })} />
          )}
          <SettingInput label={r.setup} value={s.setupMin} min={0} max={60} onChange={(setupMin) => setRunSettings({ setupMin })} />
        </div>

        {/* The crew's own rates: our defaults are estimates. */}
        <details className="rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink-2">{r.rates}</summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-muted">{r.ratesHint}</p>
            <label className="block space-y-1">
              <span className="block text-xs font-semibold text-ink-2">{r.crewMower}</span>
              <select
                value={s.crewMower}
                onChange={(e) => setRunSettings({ crewMower: e.target.value as RunSettings["crewMower"], mowSqftPerH: null })}
                className={`${ui.input} py-1.5 text-sm`}
              >
                {CREW_MOWERS.map((m) => (
                  <option key={m} value={m}>
                    {r.crewMowers[m]}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <SettingInput
                label={r.mowRate}
                value={s.mowSqftPerH ?? crewMowSqftPerH(s.crewMower)}
                min={1000}
                max={500000}
                onChange={(mowSqftPerH) => setRunSettings({ mowSqftPerH })}
              />
              <SettingInput label={r.trimRate} value={s.trimFtPerH} min={100} max={10000} onChange={(trimFtPerH) => setRunSettings({ trimFtPerH })} />
              <SettingInput label={r.blowRate} value={s.blowSqftPerH} min={1000} max={200000} onChange={(blowSqftPerH) => setRunSettings({ blowSqftPerH })} />
            </div>
            <p className="text-[10px] text-faint">{r.mowRateHint(crewMowSqftPerH(s.crewMower).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA"))}</p>
          </div>
        </details>

        {/* The day */}
        {plan.stops.length > 0 ? (
          <div className="space-y-1 rounded-lg bg-accent-soft px-3 py-2 text-accent-ink">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{r.day}</span>
              <Pop value={formatDuration(plan.totalMin)} className="text-lg font-bold tabular-nums" />
            </div>
            <div className="text-xs">{r.dayLine(formatClock(s.startMin, lang), formatClock(plan.endMin, lang))}</div>
            <ul className="space-y-0.5 text-[11px]">
              <li className="flex items-center gap-1">
                <Icon name="truck" className="h-3 w-3" />
                {driveKm !== null ? r.driveKm(formatDuration(plan.driveMin), formatKm(driveKm, lang)) : r.drive(formatDuration(plan.driveMin))}
                {saved >= 1 && ` (${r.saves(formatDuration(saved))})`}
              </li>
              <li className="flex items-center gap-1">
                <Icon name="clock" className="h-3 w-3" />
                {r.onSite(formatDuration(plan.onSiteMin))}
              </li>
              <li className="flex items-start gap-1">
                <Icon name="users" className="mt-px h-3 w-3 shrink-0" />
                {r.waits(formatDuration(plan.crewWaitMin), formatDuration(plan.mowerWaitMin))}
              </li>
              <li className="flex items-center gap-1">
                <Icon name="zap" className="h-3 w-3" />
                {r.battery(formatAcres(plan.acres, lang), plan.chargeAcres)}
              </li>
            </ul>
            {/* The same stops today, with the crew mowing: what the Voyager is worth to this crew. */}
            <div className="mt-1.5 space-y-1 border-t border-accent-ink/15 pt-1.5">
              <div className="text-[11px] font-semibold">{r.compareTitle}</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {(
                  [
                    [r.today, today.totalMin],
                    [r.withVoyager, plan.totalMin],
                  ] as const
                ).map(([label, min]) => (
                  <div key={label} className="rounded-md bg-surface/60 px-2 py-1">
                    <div className="text-faint">{label}</div>
                    <div className="text-sm font-bold tabular-nums">{formatDuration(min)}</div>
                    <div>{r.perDay(perDay(min))}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] font-semibold">{r.perWeek(perWeek(today.totalMin), perWeek(plan.totalMin))}</div>
              <p className="text-[10px] text-accent-ink/80">{r.compareNote(r.crewMowers[s.crewMower])}</p>
            </div>
          </div>
        ) : (
          run.stops.length === 0 && <p className="text-xs text-muted">{r.empty}</p>
        )}
        {plan.acres > plan.chargeAcres && <Notice tone="warn">{r.overBattery(plan.chargeAcres)}</Notice>}
        {overWorkday(plan) && <Notice tone="warn">{r.overDay}</Notice>}
        {/* The roads between the stops, loading live like a measurement. */}
        <LiveSteps lang={lang} steps={run.roads.live} />
        {straightLine && (
          <Notice tone="warn">
            {roadsNote}
            {run.roads.missed && (
              <button onClick={retryRoads} className="ml-1.5 font-semibold underline underline-offset-2">
                {r.retryRoads}
              </button>
            )}
          </Notice>
        )}

        {/* The stops: in the run's order, then those still loading or that failed. */}
        {run.stops.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-ink-2">{r.stops}</div>
            <ol className="space-y-1.5">
              {planned.map(({ stop, p }, k) => {
                const w = works[p.index]!;
                const crewLonger = p.crewMin > p.mowMin;
                return (
                  <li key={stop.id} className="animate-fade-in rounded-lg border border-line px-2.5 py-2">
                    {p.driveMin >= 0.5 && (
                      <div className="mb-1 flex items-start gap-1 text-[11px] text-faint">
                        <Icon name="truck" className="mt-px h-3 w-3 shrink-0" />
                        {legLine(p.driveMin, leg(k ? plan.stops[k - 1].index : SHOP, p.index), lang)}
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{k + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{stopName(stop, lang)}</span>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted">
                            {formatClock(p.arriveMin, lang)} · {formatClock(p.leaveMin, lang)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                          <span>{formatLawn(lawnM2[p.index], lang)}</span>
                          <span className={`inline-flex items-center gap-0.5 ${crewLonger ? "" : "font-semibold text-accent"}`}>
                            <Icon name="mower" className="h-3 w-3" />
                            {r.mow(formatDuration(p.mowMin))}
                          </span>
                          <span className={`inline-flex items-center gap-0.5 ${crewLonger ? "font-semibold text-accent" : ""}`}>
                            <Icon name="scissors" className="h-3 w-3" />
                            {r.trimBlow(formatDuration(p.crewMin))}
                          </span>
                        </div>
                        {stop.onStreet && <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">{r.onStreet}</div>}
                        {(!w.fits || w.notes.length > 0) && (
                          <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                            {r.voyagerCheck}: {[...(w.fits ? [] : [r.tooSteep]), ...w.notes.filter((n) => n !== "tooSteep").map(fitNote)].join(", ")}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeStop(stop.id)}
                        aria-label={r.remove}
                        className="shrink-0 rounded p-0.5 text-faint transition hover:bg-surface-2 hover:text-ink"
                      >
                        <Icon name="close" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
              {others.map((stop) => (
                <li key={stop.id} className="animate-fade-in rounded-lg border border-dashed border-line px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-faint">
                      <Icon name={stop.state === "noLot" || stop.state === "failed" || stop.state === "done" ? "alert" : "pin"} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink">{stopName(stop, lang)}</div>
                      {stop.onStreet && <div className="text-[11px] text-amber-700 dark:text-amber-300">{r.onStreet}</div>}
                      {stop.state === "waiting" || stop.state === "measuring" ? (
                        <Loading stop={stop} lang={lang} />
                      ) : (
                        <div className="text-[11px] text-muted">
                          {stop.state === "noLot" ? r.noLot : stop.state === "failed" ? r.failed : r.noLawn}
                          {stop.state === "failed" && (
                            <button onClick={() => retryStop(stop.id)} className="ml-1.5 font-semibold text-accent hover:underline">
                              {r.retry}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeStop(stop.id)}
                      aria-label={r.remove}
                      className="shrink-0 rounded p-0.5 text-faint transition hover:bg-surface-2 hover:text-ink"
                    >
                      <Icon name="close" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {run.shop && lastStop !== undefined && (
              <div className="flex items-start gap-1 px-1 text-[11px] text-faint">
                <Icon name="home" className="mt-px h-3 w-3 shrink-0" />
                {r.backToShop(legLine(plan.returnMin, leg(lastStop, SHOP), lang))}
              </div>
            )}
          </div>
        )}

        {/* Turn-by-turn for the crew: the run's order, opened in Google Maps (a link out, nothing fetched). */}
        {directions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {directions.map((href, k) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ui.btnSecondary} grow print:hidden`}
              >
                <Icon name="route" />
                {directions.length > 1 ? r.directionsPart(k + 1, directions.length) : r.directions}
                <Icon name="external" className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!plan.stops.length} onClick={() => printAs(`Calculator - ${r.title}`)} className={`${ui.btnPrimary} flex-1`}>
            <Icon name="file" />
            {t.reportPdf}
          </button>
          <CopyLinkButton lang={lang} getUrl={getShareUrl} className={ui.btnSecondary} />
          {run.stops.length > 0 && (
            <button type="button" onClick={clearRun} className={ui.btnSecondary}>
              <Icon name="close" />
              {r.clear}
            </button>
          )}
        </div>
        <p className="text-[10px] leading-snug text-faint">{r.sources}</p>
      </Sheet>
    </div>
  );
}
