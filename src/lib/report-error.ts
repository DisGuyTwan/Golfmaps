/**
 * Sends a client-side error to /api/log (Vercel runtime logs). Fire and
 * forget: never throws, never blocks, and stops after a few reports per page
 * so a render loop can't flood the log.
 */
const MAX_REPORTS = 10;
let sent = 0;

export function reportError(kind: string, error: unknown) {
  if (typeof window === "undefined" || sent >= MAX_REPORTS) return;
  sent += 1;
  const err = error instanceof Error ? error : null;
  const body = JSON.stringify({
    kind,
    message: err ? `${err.name}: ${err.message}` : String(error),
    stack: err?.stack,
    url: window.location.href,
  });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/log", blob)) {
      void fetch("/api/log", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* reporting must never break the app */
  }
}
