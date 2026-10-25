import type { CSSProperties } from "react";

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
export const delay = (step: number): CSSProperties => ({ animationDelay: `${step * 80}ms` });
