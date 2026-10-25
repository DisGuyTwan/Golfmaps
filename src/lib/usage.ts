/**
 * What the reps use, counted per day (/api/usage, the admin page): only
 * these names are counted, so the counter can't be filled with anything
 * else. Page views come from Vercel Web Analytics.
 */
export const USAGE_EVENTS = [
  "measure.golf",
  "measure.sod",
  "measure.lawn",
  "measure.site",
  "run.open",
  "run.import",
  "portfolio.open",
  "roi.send",
  "pdf.acreage",
  "pdf.roi",
  "pdf.incentives",
  "link.copy",
  "proposal.create",
  "record.add",
] as const;
export type UsageEvent = (typeof USAGE_EVENTS)[number];
export const isUsageEvent = (v: unknown): v is UsageEvent => USAGE_EVENTS.includes(v as UsageEvent);

/** Counts one use (best effort: never in the way). */
export function countUse(name: UsageEvent) {
  try {
    const body = JSON.stringify({ name });
    if (!navigator.sendBeacon?.("/api/usage", new Blob([body], { type: "application/json" })))
      void fetch("/api/usage", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    // Counting never breaks the app.
  }
}
