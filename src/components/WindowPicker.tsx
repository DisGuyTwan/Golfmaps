"use client";

import { useState } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { WINDOW_PRESETS, isAnyTime, presetOf, windowDays, type MowWindow, type WindowPreset } from "@/lib/window";
import { Segmented, ui } from "./ui";

type Choice = WindowPreset | "any" | "custom";

/** An hour of the day as the client reads it: "8 pm" / "20 h". */
export function formatHour(h: number, lang: Lang): string {
  if (lang === "fr") return `${h} h`;
  return h === 0 ? "midnight" : h === 12 ? "noon" : `${h % 12} ${h < 12 ? "am" : "pm"}`;
}

/** "8 pm to 7 am, every day" / "20 h à 7 h, tous les jours"; null for any time. */
export function windowLine(w: MowWindow | null, lang: Lang): string | null {
  return w ? UI[lang].fitWindow.line(formatHour(w.from, lang), formatHour(w.to, lang), windowDays(w)) : null;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * When the robots may mow: any time, nights, weekdays, or custom hours and
 * days. Each robot then keeps only part of its rating (window.ts), which the
 * fleet is sized for; the line under it says how much.
 */
export default function WindowPicker({
  lang,
  value,
  onChange,
  size = "sm",
  label,
  share,
}: {
  lang: Lang;
  value: MowWindow | null;
  onChange: (w: MowWindow | null) => void;
  size?: "sm" | "md";
  /** Replaces the question (the ROI tab's own label style). */
  label?: React.ReactNode;
  /** Share of its round-the-clock capacity the robot quoted keeps in this window, said under it. */
  share?: number;
}) {
  const t = UI[lang].fitWindow;
  const set = (next: MowWindow | null) => onChange(next && !isAnyTime(next) ? next : null);
  const preset = presetOf(value);
  // "Custom" stays open while its hours happen to match a preset.
  const [custom, setCustom] = useState(preset === "custom");
  const shown: Choice = custom ? "custom" : preset;
  const choose = (c: Choice) => {
    setCustom(c === "custom");
    if (c === "any") set(null);
    else if (c !== "custom") set(WINDOW_PRESETS[c]);
    else if (!value) set(WINDOW_PRESETS.nights);
  };
  const w = value ?? WINDOW_PRESETS.nights;
  const select = (id: string, text: string, current: number, options: number[], show: (n: number) => string, set: (n: number) => void) => (
    <label className="min-w-0 space-y-0.5" htmlFor={id}>
      <span className="block text-[11px] font-semibold text-ink-2">{text}</span>
      <select id={id} value={current} onChange={(e) => set(Number(e.target.value))} className={`${ui.input} py-1 text-sm`}>
        {options.map((n) => (
          <option key={n} value={n}>
            {show(n)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-1">
      {label ?? <div className="text-xs font-semibold text-ink-2">{t.question}</div>}
      <Segmented
        label={t.question}
        value={shown}
        size={size}
        options={(["any", "nights", "weekdays", "custom"] as const).map((c) => ({ value: c, label: t.options[c], sub: t.subs[c] }))}
        onChange={choose}
      />
      {shown === "custom" && (
        <div className="grid grid-cols-3 gap-2">
          {select("win-from", t.from, w.from, HOURS, (h) => formatHour(h, lang), (from) => set({ ...w, from }))}
          {select("win-to", t.to, w.to, HOURS, (h) => formatHour(h, lang), (to) => set({ ...w, to }))}
          {select("win-days", t.days, windowDays(w), DAYS, String, (days) => set({ ...w, days }))}
        </div>
      )}
      {value && share !== undefined && share < 1 && <p className="text-[11px] text-muted">{t.share(Math.round(share * 100))}</p>}
    </div>
  );
}
