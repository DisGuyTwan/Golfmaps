"use client";

import Link from "next/link";
import { PAGE_COPY } from "@/lib/i18n-pages";
import { useLang } from "@/lib/preferences";
import { Icon } from "./icons";
import { ui } from "./styles";

/** Body of the 404 page, in the visitor's chosen language. */
export default function NotFoundContent() {
  const t = PAGE_COPY[useLang()];
  return (
    <main className="flex h-[100dvh] w-full animate-fade-up flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon name="compass" className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-semibold text-ink">{t.notFoundTitle}</h1>
      <p className="max-w-prose text-sm text-muted">{t.notFoundBody}</p>
      <Link
        href="/"
        className={ui.btnPrimary}
      >
        <Icon name="home" />
        {t.backHome}
      </Link>
    </main>
  );
}
