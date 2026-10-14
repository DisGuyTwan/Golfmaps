"use client";
import { useEffect } from "react";
import { UI } from "@/lib/i18n";
import { useLang } from "@/lib/preferences";
import { ui } from "@/components/ui";

/**
 * Route-level error boundary. The measurement path talks to three third-party
 * Overpass mirrors and a geocoder; if any of that throws during render, this
 * keeps the app on a readable screen with a way to retry instead of a blank
 * page over a dead map.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = UI[useLang()];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
      <h1 className="text-xl font-semibold text-ink">{t.errorTitle}</h1>
      <p className="max-w-prose text-sm text-muted">{t.errorBody}</p>
      <button
        type="button"
        onClick={reset}
        className={ui.btnPrimary}
      >
        {t.tryAgain}
      </button>
    </main>
  );
}
