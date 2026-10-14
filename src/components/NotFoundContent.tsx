"use client";

import Link from "next/link";
import { UI } from "@/lib/i18n";
import { useLang } from "@/lib/preferences";
import { ui } from "./ui";

/** Body of the 404 page, in the visitor's chosen language. */
export default function NotFoundContent() {
  const t = UI[useLang()];
  return (
    <main className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
      <h1 className="text-xl font-semibold text-ink">{t.notFoundTitle}</h1>
      <p className="max-w-prose text-sm text-muted">{t.notFoundBody}</p>
      <Link
        href="/"
        className={ui.btnPrimary}
      >
        {t.backHome}
      </Link>
    </main>
  );
}
