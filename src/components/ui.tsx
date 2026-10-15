"use client";

import { useState } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { Icon, type IconName } from "./icons";

/**
 * Shared look for every tab: one header, one button set, one type scale.
 * Class strings live here (under src/components, which Tailwind scans) so the
 * tabs can't drift apart again. Colors are the theme tokens from globals.css.
 */

export const ui = {
  /** Filled dark-green button, the main action on a screen. */
  btnPrimary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:bg-brand-strong hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-60",
  /** Outlined button for secondary actions. */
  btnSecondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink-2 transition-all duration-200 ease-out hover:-translate-y-px hover:bg-surface-2 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60",
  /** Card holding a section of a tab. */
  card: "rounded-xl border border-line bg-surface p-5",
  /** Section heading inside a tab (h2). */
  h2: "text-lg font-bold text-ink",
  /** Form label. */
  label: "text-sm font-semibold text-ink-2",
  /** Text and number inputs, selects. */
  input:
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
  /** Small explanatory text and footnotes. */
  note: "text-xs leading-relaxed text-muted",
  /** Big headline number (savings, profit, payback). */
  kpi: "text-3xl font-bold leading-tight tabular-nums",
  /** Entrance for cards and sections; pair with `delay()` to stagger. */
  enter: "animate-fade-up print:animate-none",
  /** Content width shared by the header and the body of each tab. */
  container: "mx-auto w-full max-w-6xl px-4 sm:px-6",
};

/** Stagger helper for `ui.enter`: style={delay(2)} starts the third item 160 ms later. */
export const delay = (step: number): React.CSSProperties => ({ animationDelay: `${step * 80}ms` });

/**
 * Re-animates its content whenever `value` changes (a key swap), so a number
 * that recalculates visibly ticks into place instead of silently changing.
 */
export function Pop({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span key={value} className={`inline-block animate-pop ${className}`}>
      {value}
    </span>
  );
}

/** Loading state: a glowing arc spinning around a pulsing core, with a label. */
export function Loader({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-sm text-muted animate-fade-in">
      <span className="relative block h-10 w-10" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border-2 border-line" />
        <span className="absolute inset-0 animate-spin-slow rounded-full border-2 border-transparent border-t-accent drop-shadow-[0_0_6px_rgb(var(--accent)/0.6)]" />
        <span className="absolute inset-[14px] animate-pulse rounded-full bg-accent/70" />
      </span>
      {label}
    </div>
  );
}

/** Section heading (h2) led by its icon in the accent color. */
export function SectionTitle({ icon, className = "", children }: { icon: IconName; className?: string; children: React.ReactNode }) {
  return (
    <h2 className={`flex items-center gap-2 ${ui.h2} ${className}`}>
      <Icon name={icon} className="h-[18px] w-[18px] text-accent print:h-3.5 print:w-3.5" />
      {children}
    </h2>
  );
}

const NOTICE = {
  info: { icon: "info", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200" },
  warn: { icon: "alert", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200" },
  error: { icon: "alert", cls: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-200" },
} as const;

/** Short message box with its icon: info (blue), warn (amber) or error (red). */
export function Notice({ tone, children }: { tone: keyof typeof NOTICE; children: React.ReactNode }) {
  const { icon, cls } = NOTICE[tone];
  return (
    <p className={`flex animate-fade-in items-start gap-2 rounded-md px-3 py-2 text-xs font-medium ${cls}`}>
      <Icon name={icon} className="mt-px h-3.5 w-3.5" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * Opens the browser's print dialog ("Save as PDF" there). The document title
 * becomes the suggested PDF file name, so it's set for the duration of the print.
 */
export function printAs(fileTitle: string) {
  const previous = document.title;
  document.title = fileTitle;
  window.addEventListener("afterprint", () => (document.title = previous), { once: true });
  window.print();
}

/**
 * Copies a share link (the tab's inputs in the URL). Shows "Link copied" for a
 * moment; if the clipboard is blocked, offers the link in a prompt instead.
 */
export function CopyLinkButton({ lang, getUrl, className }: { lang: Lang; getUrl: () => string; className: string }) {
  const t = UI[lang];
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = getUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t.copyPrompt, url);
    }
  };
  return (
    <button type="button" onClick={copy} className={className}>
      <Icon name={copied ? "check" : "link"} />
      <span aria-live="polite">{copied ? t.linkCopied : t.copyLink}</span>
    </button>
  );
}

const onBrandBtn =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/70 px-4 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:-translate-y-px hover:bg-white/10 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white print:hidden";

/**
 * Dark-green header for a tab: eyebrow line, title, one-sentence pitch, a
 * Print / PDF button and (optionally) Copy link. Prints too (the buttons
 * hide), so a PDF opens with it.
 */
export function TabHeader({
  lang,
  icon,
  eyebrow,
  title,
  lede,
  printTitle,
  getShareUrl,
}: {
  lang: Lang;
  /** The tab's icon (same as in the tab bar), shown in the eyebrow line. */
  icon: IconName;
  eyebrow: string;
  title: string;
  lede: string;
  /** Suggested PDF file name, e.g. "Calculator - ROI Voyager". */
  printTitle: string;
  /** Builds the share link with the tab's current inputs. */
  getShareUrl?: () => string;
}) {
  return (
    <header
      className="relative overflow-hidden text-white"
      style={{ background: "repeating-linear-gradient(100deg,var(--band-a) 0 70px,var(--band-b) 70px 140px)" }}
    >
      {/* A light sheen sweeps across the stripes once when the tab opens. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 animate-sheen bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/0.12)_50%,transparent_70%)] print:hidden"
      />
      <div className={`${ui.container} relative flex flex-wrap items-start justify-between gap-4 py-6 print:max-w-none print:px-4 print:py-3`}>
        <div className="min-w-0 max-w-3xl space-y-2 print:space-y-1">
          <p className={`${ui.enter} flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/75`}>
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white/15 text-white ring-1 ring-white/25 print:h-5 print:w-5">
              <Icon name={icon} className="h-3.5 w-3.5" />
            </span>
            {eyebrow}
          </p>
          <h1 className={`${ui.enter} text-2xl font-bold leading-tight sm:text-3xl print:text-xl`} style={delay(1)}>
            {title}
          </h1>
          <p className={`${ui.enter} max-w-[65ch] text-sm text-white/85 sm:text-base print:text-xs`} style={delay(2)}>
            {lede}
          </p>
        </div>
        <div className={`${ui.enter} flex shrink-0 flex-wrap gap-2 print:hidden`} style={delay(3)}>
          {getShareUrl && <CopyLinkButton lang={lang} getUrl={getShareUrl} className={onBrandBtn} />}
          <button type="button" onClick={() => printAs(printTitle)} className={onBrandBtn}>
            <Icon name="printer" />
            {UI[lang].printPdf}
          </button>
        </div>
      </div>
    </header>
  );
}
