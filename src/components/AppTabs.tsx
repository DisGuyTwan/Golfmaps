"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { UI, type Lang } from "@/lib/i18n";
import { setLang, setTheme, useLang, useTheme } from "@/lib/preferences";
import { reportError } from "@/lib/report-error";
import { goToTab } from "@/lib/tabs";
import AcreageReport from "./AcreageReport";
import GolfCourseCalculator from "./GolfCourseCalculator";
import { Loader } from "./ui";

function TabLoading() {
  const lang = useLang();
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <Loader label={UI[lang].loading} />
    </div>
  );
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

const ICON_MOTION = "absolute inset-0 h-4 w-4 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]";

/** Sun and moon stacked: the one showing spins and shrinks away as the other turns in. */
function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <span className="relative block h-4 w-4" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={`${ICON_MOTION} ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${ICON_MOTION} ${dark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </span>
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

  // Sliding pieces (tab underline, language pill) only animate after the first
  // frame, so they don't visibly slide into place when the page loads.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // The tab underline glides to the active tab (and follows label widths when
  // the language changes). On narrow phones the tab row scrolls; keep the
  // active tab in view.
  const tablistRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const list = tablistRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const place = () => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
      indicator.style.width = `${active.offsetWidth}px`;
    };
    place();
    list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tab, lang]);

  const select = (next: Tab) => {
    if (next === tab) return;
    goToTab(TABS.find((x) => x.id === next)!.hash);
  };

  const panel = (id: OverlayTab, content: React.ReactNode) =>
    opened[id] && (
      <div
        role="tabpanel"
        className={tab === id ? "absolute inset-0 z-[3000] animate-tab-in print:static print:animate-none" : "hidden"}
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
        <div
          ref={tablistRef}
          role="tablist"
          aria-label={t.sections}
          className="relative flex min-w-0 flex-1 items-center overflow-x-auto"
        >
          {TABS.map(({ id }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => select(id)}
              className={`shrink-0 whitespace-nowrap px-2.5 py-2.5 text-sm font-semibold transition-colors duration-300 sm:px-3 ${
                tab === id ? "text-accent" : "text-muted hover:text-ink-2"
              }`}
            >
              {t.tabs[id]}
            </button>
          ))}
          <span
            ref={indicatorRef}
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-accent ${
              animated ? "transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]" : ""
            }`}
          />
        </div>
        {/* Both languages always visible, so it reads as a switch, not a link. */}
        <div
          role="group"
          aria-label={t.langGroup}
          className="relative mx-1 grid shrink-0 grid-cols-2 rounded-full border border-line bg-surface-2 p-0.5"
        >
          {/* The pill slides under the active language. */}
          <span
            aria-hidden="true"
            className={`absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] rounded-full bg-accent shadow-sm ${
              animated ? "transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]" : ""
            }`}
            style={{ transform: lang === "fr" ? "translateX(100%)" : "none" }}
          />
          {LANGS.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              lang={code === "fr" ? "fr-CA" : "en-CA"}
              aria-pressed={lang === code}
              aria-label={name}
              title={name}
              onClick={() => lang !== code && setLang(code)}
              className={`relative min-h-8 w-9 rounded-full text-xs font-bold tracking-wide transition-colors duration-300 ${
                lang === code ? "text-surface" : "text-muted hover:text-ink"
              }`}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setTheme(theme === "dark" ? "light" : "dark", { x: box.left + box.width / 2, y: box.top + box.height / 2 });
          }}
          aria-label={theme === "dark" ? t.toLight : t.toDark}
          title={theme === "dark" ? t.toLight : t.toDark}
          className="shrink-0 rounded-md p-2 text-muted transition hover:bg-surface-2 hover:text-ink active:scale-90"
        >
          <ThemeIcon dark={theme === "dark"} />
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
