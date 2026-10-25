/**
 * When the robots may mow. A golf course often lets them out only at night,
 * a park only on weekdays; a robot sized as if it mowed around the clock is
 * then too few, the grass gets ahead of it and the client is lost. The
 * window shrinks each robot's capacity in the mower fit and the ROI tab.
 *
 * Kress's ratings are taken as round-the-clock: the robot mows and charges
 * in turn whenever it likes (an assumption: Kress doesn't say which schedule
 * its ratings use, and the field checks will tell). Within a window the robot
 * starts on a full battery (it charged outside the window), then mows and
 * charges in turn. Charging is taken to last about as long as a run
 * (CHARGE_PER_RUN, an estimate: Kress publishes few charge times). A Voyager
 * mows one charge per mowing day with the crew, so a window shorter than its
 * run time, or with fewer days than the crew works, cuts its capacity.
 * Pure, so it's tested without a browser.
 */

export interface MowWindow {
  /** Hours of the day (0-23): mowing from `from` to `to`, past midnight when `to` ≤ `from`. */
  from: number;
  to: number;
  /** Days a week it may mow (1-7). */
  days: number;
}

/** The windows offered as buttons; "custom" opens the hours and days. null is any time. */
export const WINDOW_PRESETS = {
  nights: { from: 20, to: 7, days: 7 },
  weekdays: { from: 7, to: 18, days: 5 },
} satisfies Record<string, MowWindow>;
export type WindowPreset = keyof typeof WINDOW_PRESETS;

/** Charging takes about as long as a run (an estimate). */
export const CHARGE_PER_RUN = 1;

const clampHour = (h: number) => ((Math.round(h) % 24) + 24) % 24;

/** Hours a day the window is open (24 for any time). */
export const windowHours = (w: MowWindow | null) => (w ? (clampHour(w.to) - clampHour(w.from) + 24) % 24 || 24 : 24);
/** Days a week the window is open (7 for any time). */
export const windowDays = (w: MowWindow | null) => (w ? Math.min(7, Math.max(1, Math.round(w.days))) : 7);

/** Whether a window is really "any time" (every hour, every day). */
export const isAnyTime = (w: MowWindow | null) => !w || (windowHours(w) >= 24 && windowDays(w) >= 7);

/** The preset a window is, or "custom" (null: any time). */
export function presetOf(w: MowWindow | null): WindowPreset | "any" | "custom" {
  if (isAnyTime(w)) return "any";
  for (const [name, p] of Object.entries(WINDOW_PRESETS) as [WindowPreset, MowWindow][])
    if (windowHours(p) === windowHours(w) && clampHour(p.from) === clampHour(w!.from) && windowDays(p) === windowDays(w)) return name;
  return "custom";
}

/**
 * Hours a robot mows in `hours` straight from a full battery: one run, then
 * runs and charges in turn. Around the clock it's the steady share of runs.
 */
export function mowingHours(hours: number, runtimeH: number, chargeH = runtimeH * CHARGE_PER_RUN): number {
  const duty = runtimeH / (runtimeH + chargeH);
  if (hours >= 24) return 24 * duty;
  return Math.min(hours, runtimeH) + Math.max(0, hours - runtimeH) * duty;
}

/** Share of a robot's round-the-clock rating it keeps within the window (1 for any time). */
export function robotWindowShare(w: MowWindow | null, runtimeMin: number): number {
  if (isAnyTime(w)) return 1;
  const runtimeH = runtimeMin / 60;
  return Math.min(1, (windowDays(w) * mowingHours(windowHours(w), runtimeH)) / (7 * mowingHours(24, runtimeH)));
}

/** Share of a Voyager's capacity (one charge on each of `crewDays` mowing days) left within the window. */
export function voyagerWindowShare(w: MowWindow | null, runtimeMin: number, crewDays: number): number {
  if (isAnyTime(w) || crewDays <= 0) return 1;
  const days = Math.min(windowDays(w), crewDays) / crewDays;
  return Math.min(1, windowHours(w) / (runtimeMin / 60)) * days;
}

/** "20-7-7" in a link: from, to, days. */
export const encodeWindow = (w: MowWindow) => `${clampHour(w.from)}-${clampHour(w.to)}-${windowDays(w)}`;

export function decodeWindow(value: string | null | undefined): MowWindow | null {
  const m = value?.match(/^(\d{1,2})-(\d{1,2})-([1-7])$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 23) return null;
  const w = { from: clampHour(Number(m[1])), to: clampHour(Number(m[2])), days: Number(m[3]) };
  return isAnyTime(w) ? null : w;
}
