"use client";

import Link from "next/link";
import { UI } from "@/lib/i18n";
import { useLang } from "@/lib/preferences";

/** Body of the 404 page, in the visitor's chosen language. */
export default function NotFoundContent() {
  const t = UI[useLang()];
  return (
    <main className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
      <h1 className="text-xl font-semibold text-ink">{t.notFoundTitle}</h1>
      <p className="max-w-prose text-sm text-muted">{t.notFoundBody}</p>
      <Link
        href="/"
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
      >
        {t.backHome}
      </Link>
    </main>
  );
}
