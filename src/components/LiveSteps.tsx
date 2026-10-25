"use client";

import { useEffect, useState } from "react";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { liveSeconds, liveVisible, type LiveFinding, type LiveSource, type LiveStep } from "@/lib/live";
import { Icon, type IconName } from "./icons";

const SOURCE_ICON: Record<LiveSource, IconName> = {
  addresses: "table",
  lot: "home",
  crop: "sprout",
  osm: "map",
  lidar: "layers",
  photos: "camera",
  satellite: "compass",
  roads: "road",
};

/** What a source found, in words. */
function finding(source: LiveSource, found: LiveFinding | null, lang: Lang): string {
  const t = UI[lang].live;
  switch (found?.kind) {
    case "lot":
      return t.lot(found.lot);
    case "sod":
      return t.sod(Math.round(found.share * 100));
    case "course":
      return t.course(found.name);
    case "golf":
      return t.golf(found.fairways, found.outlineOnly);
    case "mapped":
      return t.mapped(found.n);
    case "fields":
      return t.fields(found.n);
    case "surfaces":
      return t.surfaces(found.pools, found.paved);
    case "grass":
      return t.grass(formatAcres(found.acres, lang));
    case "roads":
      return t.roads(found.places);
    case "addresses":
      return t.addresses(found.found, found.total);
    case "none":
      return source === "lot" ? t.noLot : t.none;
    default:
      return t.read;
  }
}

/**
 * The measurement loading live: each source being read (the cadastre lot,
 * the crop map, OpenStreetMap, the LiDAR, the aerial photos), what it's
 * looking for and for how long, then what it found as it answers. Shown
 * while anything loads and for a moment after the last answer; the map
 * sweeps the same areas meanwhile.
 */
export default function LiveSteps({ lang, steps }: { lang: Lang; steps: LiveStep[] }) {
  const t = UI[lang].live;
  const [now, setNow] = useState(0);
  const active = steps.some((s) => s.state === "active");
  // Ticks while something loads (the seconds count up), then once more past the linger to hide.
  const running = liveVisible(steps, now);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 200);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running]);
  if (!running) return null;

  return (
    <section aria-live="polite" aria-label={t.title} className="animate-fade-in space-y-2 rounded-xl border border-line bg-surface-2 p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span className="relative flex h-2 w-2">
          {active && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${active ? "bg-accent" : "bg-faint"}`} />
        </span>
        {active ? t.title : t.ready}
      </p>
      <ul className="space-y-1.5">
        {steps.map((step) => {
          const seconds = liveSeconds(step, now);
          return (
            <li key={step.source} className="flex animate-fade-in items-center gap-2.5">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                  step.state === "active" ? "bg-accent-soft text-accent" : step.state === "done" ? "bg-brand text-white" : "bg-surface text-faint"
                }`}
              >
                <Icon name={step.state === "done" ? "check" : step.state === "failed" ? "alert" : SOURCE_ICON[step.source]} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-ink">{t.sources[step.source]}</span>
                  {seconds && <span className="shrink-0 tabular-nums text-faint">{t.seconds(seconds)}</span>}
                </div>
                {step.state === "active" ? (
                  <>
                    <div className="truncate text-[11px] text-muted">{t.reading[step.source]}</div>
                    <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-line">
                      <span className="absolute inset-y-0 left-0 w-2/5 animate-scan rounded-full bg-accent" />
                    </div>
                  </>
                ) : (
                  <div className={`truncate text-[11px] ${step.state === "failed" ? "text-faint" : "text-muted"}`}>
                    {step.state === "failed" ? t.failed : finding(step.source, step.found, lang)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
