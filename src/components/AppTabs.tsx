"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { UI, type Lang } from "@/lib/i18n";
import { setLang, setTheme, useLang, useTheme } from "@/lib/preferences";
import { reportError } from "@/lib/report-error";
import { goToTab } from "@/lib/tabs";
import AcreageReport from "./AcreageReport";
import GolfCourseCalculator from "./GolfCourseCalculator";

function TabLoading() {
  const lang = useLang();
  return <div className="flex h-full items-center justify-center bg-canvas text-muted">{UI[lang].loading}</div>;
}
const loading = () => <TabLoading />;

// Loaded on first open; client-only (they read the saved language on mount).
const IncentivesTab = dynamic(() => import("./IncentivesTab"), { ssr: false, loading });
const RoiTab = dynamic(() => import("./RoiTab"), { ssr: false, loading });

type Tab = "acreage" | "incentives" | "roi";
type OverlayTab = Exclude<Tab, "acreage">;

// Each language's name in itself, as screen readers and tooltips announce it.
const LANGS: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
];

const TABS: { id: Tab; hash: "" | "#incentives" | "#roi" }[] = [
  { id: "acreage", hash: "" },
  { id: "incentives", hash: "#incentives" },
  { id: "roi", hash: "#roi" },
];

// The active tab lives in the URL hash so a direct link can be shared
// (…/#incentives, …/#roi) and the back button switches tabs.
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}
const getHash = () => window.location.hash;
const getServerHash = () => "";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function AppTabs() {
  const lang = useLang();
  const theme = useTheme();
  const t = UI[lang];
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const tab: Tab = TABS.find((x) => x.hash && x.hash === hash)?.id ?? "acreage";

  // Keep each overlay tab mounted once opened so its inputs survive tab switches.
  const [opened, setOpened] = useState<Record<OverlayTab, boolean>>({ incentives: false, roi: false });
  if (tab !== "acreage" && !opened[tab]) setOpened({ ...opened, [tab]: true });

  // Uncaught errors and rejected promises go to the server log (Vercel).
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError("window", event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportError("promise", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // On narrow phones the tab row scrolls; keep the active tab in view.
  const tablistRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tablistRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab, lang]);

  const select = (next: Tab) => {
    if (next === tab) return;
    goToTab(TABS.find((x) => x.id === next)!.hash);
  };

  const panel = (id: OverlayTab, content: React.ReactNode) =>
    opened[id] && (
      <div
        role="tabpanel"
        className={tab === id ? "absolute inset-0 z-[3000] print:static" : "hidden"}
      >
        {content}
      </div>
    );

  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
      <nav
        className="z-[3100] flex shrink-0 items-center border-b border-line bg-surface px-1 print:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <span className="hidden shrink-0 px-2 text-sm font-bold tracking-wide text-accent min-[420px]:inline">
          {t.brand}
        </span>
        <div ref={tablistRef} role="tablist" aria-label={t.sections} className="flex min-w-0 flex-1 items-center overflow-x-auto">
          {TABS.map(({ id }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => select(id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm font-semibold transition sm:px-3 ${
                tab === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink-2"
              }`}
            >
              {t.tabs[id]}
            </button>
          ))}
        </div>
        {/* Both languages always visible, so it reads as a switch, not a link. */}
        <div
          role="group"
          aria-label={t.langGroup}
          className="mx-1 flex shrink-0 rounded-full border border-line bg-surface-2 p-0.5"
        >
          {LANGS.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              lang={code === "fr" ? "fr-CA" : "en-CA"}
              aria-pressed={lang === code}
              aria-label={name}
              title={name}
              onClick={() => setLang(code)}
              className={`min-h-8 rounded-full px-2.5 text-xs font-bold tracking-wide transition ${
                lang === code ? "bg-accent text-surface shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? t.toLight : t.toDark}
          title={theme === "dark" ? t.toLight : t.toDark}
          className="shrink-0 rounded-md p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </nav>

      <div className="relative min-h-0 flex-1 print:static">
        {/* The map stays mounted (and sized) underneath, so switching back is instant. */}
        <div className="h-full w-full print:hidden">
          <GolfCourseCalculator />
        </div>
        {/* The Acreage tab prints a report instead of the map. */}
        {tab === "acreage" && <AcreageReport />}
        {panel("incentives", <IncentivesTab />)}
        {panel("roi", <RoiTab />)}
      </div>
    </main>
  );
}
