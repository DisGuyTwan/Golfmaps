"use client";

import { COMPETITORS_AS_OF, matchups } from "@/lib/competitors";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { formatSqft, SQ_M_TO_SQ_FT } from "@/lib/lawn";
import { mainFleet, type Recommendation } from "@/lib/mowers";
import type { Approach } from "@/lib/roi";
import type { Site } from "@/lib/site";
import { Icon } from "./icons";

/**
 * The robots a client may be comparing, on the property measured: each
 * maker's published area and slope, the units it would take here, what it
 * can't do on this property, and where Kress wins. For the rep only: folded
 * in the mower fit card and never printed.
 */
export default function Battlecard({ lang, site, rec, approach }: { lang: Lang; site: Site; rec: Recommendation; approach: Approach | null }) {
  const t = UI[lang];
  const b = t.battle;
  const rows = matchups(site);
  const fleet = mainFleet(rec);
  if (!rows.length) return null;
  const pct = (share: number) => `${Math.round(share * 100)}${lang === "fr" ? " %" : "%"}`;
  const area = (m2: number) => (site.kind === "lawn" ? formatSqft(m2 * SQ_M_TO_SQ_FT, lang) : `${formatAcres(m2 / 4046.86, lang)} ac`);
  const date = new Date(`${COMPETITORS_AS_OF}T12:00:00`).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long" });
  // Where Kress wins on this property.
  const tooSteep = rows.filter((m) => m.steepShare !== null && m.steepShare > 0.02).map((m) => m.competitor.name);
  const noFairway = rows.filter((m) => m.noFairway).map((m) => m.competitor.name);
  const moreUnits = fleet ? rows.find((m) => m.units > fleet.units && fleet.mower.line !== "voyager") : undefined;
  const edges = [
    fleet && moreUnits ? b.edgeUnits(fleet.units, moreUnits.competitor.name, moreUnits.units) : null,
    fleet && tooSteep.length ? b.edgeSlope(fleet.mower.id, tooSteep.join(", ")) : null,
    rec.best && noFairway.length && rec.best.mower.minCutMm <= 15 ? b.edgeFairway(noFairway.join(", ")) : null,
    approach === "go" ? b.edgeGo : null,
  ].filter((e): e is string => !!e);

  return (
    <details className="group rounded-lg border border-dashed border-line px-3 py-2 print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-ink-2">
        <span className="flex items-center gap-1.5">
          <Icon name="scale" className="h-3.5 w-3.5 text-accent" />
          {b.title}
        </span>
        <Icon name="arrowDown" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-muted">{b.lede(date)}</p>
        {edges.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-accent-ink">
            {edges.map((e) => (
              <li key={e} className="flex items-start gap-1">
                <Icon name="check" className="mt-px h-3 w-3 shrink-0" />
                {e}
              </li>
            ))}
          </ul>
        )}
        <ul className="space-y-1.5">
          {rows.map((m) => (
            <li key={m.competitor.id} className="rounded-md bg-surface-2 px-2 py-1.5 text-[11px] text-ink-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">{m.competitor.name}</span>
                <a href={m.competitor.source} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-0.5 text-accent hover:underline">
                  {b.source}
                  <Icon name="external" className="h-3 w-3" />
                </a>
              </div>
              <div>
                {b.rated} {area(m.competitor.areaM2)} · {b.slope(m.competitor.slopePct)} · {b.units(m.units)}
              </div>
              {(m.steepShare !== null && m.steepShare > 0.02) || m.noFairway ? (
                <div className="text-amber-700 dark:text-amber-300">
                  {[m.steepShare !== null && m.steepShare > 0.02 ? b.steep(pct(m.steepShare)) : null, m.noFairway ? b.noFairway : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}
              <div className="text-muted">
                {b.price}: {m.competitor.price ?? b.onRequest}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
