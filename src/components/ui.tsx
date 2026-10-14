"use client";

import { useState } from "react";
import { UI, type Lang } from "@/lib/i18n";

/**
 * Shared look for every tab: one header, one button set, one type scale.
 * Class strings live here (under src/components, which Tailwind scans) so the
 * tabs can't drift apart again. Colors are the theme tokens from globals.css.
 */

export const ui = {
  /** Filled dark-green button, the main action on a screen. */
  btnPrimary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-60",
  /** Outlined button for secondary actions. */
  btnSecondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60",
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
  /** Content width shared by the header and the body of each tab. */
  container: "mx-auto w-full max-w-6xl px-4 sm:px-6",
};

function PrinterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
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
      <LinkIcon />
      <span aria-live="polite">{copied ? t.linkCopied : t.copyLink}</span>
    </button>
  );
}

const onBrandBtn =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/70 px-4 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white print:hidden";

/**
 * Dark-green header for a tab: eyebrow line, title, one-sentence pitch, a
 * Print / PDF button and (optionally) Copy link. Prints too (the buttons
 * hide), so a PDF opens with it.
 */
export function TabHeader({
  lang,
  eyebrow,
  title,
  lede,
  printTitle,
  getShareUrl,
}: {
  lang: Lang;
  eyebrow: string;
  title: string;
  lede: string;
  /** Suggested PDF file name, e.g. "Kress - ROI Voyager". */
  printTitle: string;
  /** Builds the share link with the tab's current inputs. */
  getShareUrl?: () => string;
}) {
  return (
    <header
      className="text-white"
      style={{ background: "repeating-linear-gradient(100deg,var(--band-a) 0 70px,var(--band-b) 70px 140px)" }}
    >
      <div className={`${ui.container} flex flex-wrap items-start justify-between gap-4 py-6 print:max-w-none print:px-4 print:py-3`}>
        <div className="min-w-0 max-w-3xl space-y-2 print:space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{eyebrow}</p>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl print:text-xl">{title}</h1>
          <p className="max-w-[65ch] text-sm text-white/85 sm:text-base print:text-xs">{lede}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
          {getShareUrl && <CopyLinkButton lang={lang} getUrl={getShareUrl} className={onBrandBtn} />}
          <button type="button" onClick={() => printAs(printTitle)} className={onBrandBtn}>
            <PrinterIcon />
            {UI[lang].printPdf}
          </button>
        </div>
      </div>
    </header>
  );
}
