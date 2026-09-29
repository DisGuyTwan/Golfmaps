"use client";
import { useEffect } from "react";

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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
      <h1 className="text-xl font-semibold text-slate-800">
        The measurement tool hit an error.
      </h1>
      <p className="max-w-prose text-sm text-slate-600">
        This is usually the public Overpass API being unavailable. Retrying
        often works; if it doesn&apos;t, wait a minute and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-95"
      >
        Try again
      </button>
    </main>
  );
}
