"use client";

import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { formatSqft } from "@/lib/lawn";
import { useCharger, useLawn, useMeasurement, useMode, useQuoteSettings, useSod, useTerrain } from "@/lib/quote-store";
import { useRecords } from "@/lib/records-store";
import { assumptions, type Assumption, type AssumptionKind } from "@/lib/trust";
import { Icon } from "./icons";
import { useMowerFit } from "./MowerFit";

/** Everything the Acreage tab's numbers rest on, from the measurement on screen. */
export function useAssumptions(): Assumption[] {
  const mode = useMode();
  const q = useQuoteSettings();
  const lawn = useLawn();
  const terrain = useTerrain();
  const records = useRecords();
  const fit = useMowerFit();
  return assumptions({
    mode,
    measurement: useMeasurement(),
    sod: useSod(),
    q,
    lot: lawn?.lotSource ?? "traced",
    lidar: terrain ? true : null,
    chargerPlaced: useCharger() !== null,
    calibratedChecks: Object.values(records.calibration).reduce((n, c) => n + c.n, 0),
    installs: records.installs,
    ground: !!fit?.site.ground,
    lotRange: mode === "lawn" && q.lawnOverride === null && fit?.lawnRange?.rangeFrom === "sources",
  });
}

const KIND_TONE: Record<AssumptionKind, string> = {
  measured: "bg-accent-soft text-accent-ink",
  rating: "bg-surface-2 text-ink-2",
  estimate: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  client: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  rule: "bg-surface-2 text-muted",
};

/** One assumption in words. */
function text(a: Assumption, lang: Lang, mode: string): string {
  const s = UI[lang].sources;
  const [v0, v1, v2, v3, v4] = a.values;
  const n = (v: string | number | undefined) => Number(v ?? 0);
  switch (a.key) {
    case "client":
      return s.client(mode === "lawn" ? formatSqft(n(v0), lang) : `${formatAcres(n(v0), lang)} ac`);
    case "mapped":
      return s.mapped;
    case "roughEstimated":
      return s.roughEstimated(n(v0));
    case "photos":
      return s.photos(n(v0), n(v1), n(v2), n(v3));
    case "worldcover":
      return s.worldcover(n(v0), n(v1), n(v2), n(v3), v4 ?? "");
    case "sod":
      return s.sod(v0 ?? "", n(v1), n(v2) === 1);
    case "lawn":
      // Proposals saved before lots could be estimated carry 1 (cadastre) or 0 (traced).
      return s.lawn(v0 === "cadastre" || v0 === 1 ? "cadastre" : v0 === "estimated" ? "estimated" : "traced");
    case "lidar":
      return s.lidar;
    case "noLidar":
      return s.noLidar;
    case "ratings":
      return s.ratings(new Date(`${v0}T12:00:00`).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long" }));
    case "pace":
      return s.pace;
    case "calibrated":
      return s.calibrated(n(v0));
    case "every":
      return s.every(n(v0));
    case "window":
      return s.window;
    case "anyTime":
      return s.anyTime;
    case "fleet":
      return s.fleet(n(v0));
    case "charger":
      return s.charger(n(v0) === 1);
    case "record":
      return s.record(n(v0));
    case "ground":
      return s.ground(n(v0).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA"), n(v1));
    case "lotRange":
      return s.lotRange;
  }
}

/** The list itself: each assumption with a tag saying what kind it is. */
export function SourceList({ lang, items, mode }: { lang: Lang; items: Assumption[]; mode: string }) {
  const s = UI[lang].sources;
  return (
    <ul className="space-y-1.5">
      {items.map((a, i) => (
        <li key={`${a.key}-${i}`} className="flex items-start gap-2 text-[11px] leading-snug text-ink-2 print:text-xs">
          <span className={`mt-px w-[5.5rem] shrink-0 rounded px-1.5 py-px text-center text-[10px] font-semibold uppercase tracking-wide ${KIND_TONE[a.kind]}`}>
            {s.kinds[a.kind]}
          </span>
          <span>{text(a, lang, mode)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where the Acreage tab's numbers come from: folded at the foot of the panel
 * (the rep opens it when a client asks), and a page of its own in the PDF.
 */
export default function Sources({ lang, print = false }: { lang: Lang; print?: boolean }) {
  const s = UI[lang].sources;
  const items = useAssumptions();
  const mode = useMode();
  if (print)
    return (
      <section className="break-before-page space-y-3 pt-2">
        <h2 className={`flex items-center gap-2 text-lg font-bold text-ink`}>
          <Icon name="info" className="h-5 w-5 text-accent" />
          {s.reportTitle}
        </h2>
        <p className="text-sm text-muted">{s.reportLede}</p>
        <SourceList lang={lang} items={items} mode={mode} />
      </section>
    );
  return (
    <details className="group border-t border-line pt-3 print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-ink-2 hover:text-ink">
        <span className="flex items-center gap-1.5">
          <Icon name="info" className="h-3.5 w-3.5 text-accent" />
          {s.title}
        </span>
        <Icon name="arrowDown" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2">
        <SourceList lang={lang} items={items} mode={mode} />
      </div>
    </details>
  );
}
