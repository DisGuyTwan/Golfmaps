"use client";

import { useMemo } from "react";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { mowerName, roiModel, MOWERS } from "@/lib/mowers";
import { fleetLine, planPortfolio, type PortfolioPlan } from "@/lib/portfolio";
import { MOW_EVERY } from "@/lib/quote";
import { sendAcresToRoi, setQuoteSettings, useQuoteSettings } from "@/lib/quote-store";
import { useRecords } from "@/lib/records-store";
import { stopSiteOf, useRun, type RunStop } from "@/lib/run-store";
import { goToTab } from "@/lib/tabs";
import { Icon } from "./icons";
import { stopName } from "./RunPanel";
import { Notice, Pop, Segmented, ui } from "./ui";
import WindowPicker from "./WindowPicker";

/** The portfolio on screen: each site measured, its robots, and the fleet (for the panel and the PDF). */
export function usePortfolioPlan(): PortfolioPlan {
  const run = useRun();
  const q = useQuoteSettings();
  const { calibration } = useRecords();
  return useMemo(() => {
    const sites = run.stops.map((stop) => stopSiteOf(stop)?.site ?? null);
    const factors = Object.fromEntries(Object.entries(calibration).map(([id, c]) => [id, c.factor]));
    return planPortfolio(sites, q.mowEvery, q.approach ?? "stay", { window: q.window, calibration: factors });
  }, [run.stops, q.mowEvery, q.approach, q.window, calibration]);
}

/** A site still loading, or why it has no lawn. */
function SiteState({ stop, lang }: { stop: RunStop; lang: Lang }) {
  const r = UI[lang].run;
  const active = stop.live.find((s) => s.state === "active");
  if (stop.state === "waiting") return <div className="text-[11px] text-muted">{r.waiting}</div>;
  if (stop.state === "measuring") return <div className="truncate text-[11px] text-muted">{active ? UI[lang].live.reading[active.source] : r.waiting}</div>;
  return <div className="text-[11px] text-muted">{stop.state === "noLot" ? r.noLot : stop.state === "failed" ? r.failed : r.noLawn}</div>;
}

/**
 * A portfolio of commercial or municipal sites in the run panel's place:
 * how often and when the robots may mow, whether they stay or come and go,
 * each site with its acres and robots, and the fleet for all of them, sent
 * to the ROI tab in one go.
 */
export default function PortfolioSection({ lang }: { lang: Lang }) {
  const t = UI[lang];
  const r = t.run;
  const run = useRun();
  const q = useQuoteSettings();
  const plan = usePortfolioPlan();
  const approach = q.approach ?? "stay";
  const line = new Map(plan.lines.map((l) => [l.index, l]));
  const ac = (n: number) => `${formatAcres(n, lang)} ac`;
  const voyager = approach === "go" ? MOWERS.find((m) => m.id === plan.fleet[0]?.[0]) : undefined;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-xs font-semibold text-ink-2">{t.fitEvery.question}</div>
        <Segmented
          label={t.fitEvery.question}
          value={q.mowEvery}
          options={MOW_EVERY.map((days) => ({ value: days, label: t.fitEvery.options[days] }))}
          onChange={(mowEvery) => setQuoteSettings({ mowEvery })}
        />
      </div>
      <WindowPicker lang={lang} value={q.window} onChange={(window) => setQuoteSettings({ window })} />
      <div className="space-y-1">
        <div className="text-xs font-semibold text-ink-2">{t.fitHow.question}</div>
        <Segmented
          label={t.fitHow.question}
          value={approach}
          options={(["stay", "go"] as const).map((a) => ({ value: a, label: t.fitHow.options[a] }))}
          onChange={(a) => setQuoteSettings({ approach: a })}
        />
        <p className="text-[11px] text-muted">{approach === "stay" ? r.portfolioStay : r.portfolioGo}</p>
      </div>

      {run.stops.length > 0 ? (
        <ol className="space-y-1.5">
          {run.stops.map((stop, i) => {
            const l = line.get(i);
            const fit = l?.fit ?? null;
            return (
              <li key={stop.id} className="animate-fade-in rounded-lg border border-line px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{stopName(stop, lang)}</span>
                      {l && <span className="shrink-0 text-[11px] tabular-nums text-muted">{ac(l.acres)}</span>}
                    </div>
                    {!l ? (
                      <SiteState stop={stop} lang={lang} />
                    ) : (
                      <div className={`text-[11px] ${fit ? "text-ink-2" : "text-amber-700 dark:text-amber-300"}`}>
                        {!fit ? r.portfolioNoFit : approach === "go" ? r.portfolioVoyagerOk : `${fit.units} × ${mowerName(fit.mower)}`}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-muted">{r.portfolioEmpty}</p>
      )}
      {plan.unfit.length > 0 && <Notice tone="warn">{r.portfolioUnfit(plan.unfit.length)}</Notice>}

      {plan.lines.length > 0 && (
        <div className="space-y-1 rounded-lg bg-accent-soft px-3 py-2 text-accent-ink">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{r.portfolioTotal}</span>
            <Pop value={ac(plan.acres)} className="text-lg font-bold tabular-nums" />
          </div>
          <div className="text-xs">
            <span className="font-semibold">{r.portfolioFleet}: </span>
            {plan.fleet.length ? fleetLine(plan.fleet) : t.fitHow.none}
          </div>
        </div>
      )}
      {plan.lines.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const mowed = plan.lines.filter((l) => !plan.unfit.includes(l.index)).reduce((s, l) => s + l.acres, 0);
            sendAcresToRoi({
              acres: mowed,
              approach,
              every: q.mowEvery,
              model: roiModel(voyager),
              layoutPct: Math.max(0, Math.round((plan.layoutFactor - 1) * 100)),
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
    </div>
  );
}
