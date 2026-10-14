"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import GolfCourseCalculator from "./GolfCourseCalculator";

const loading = () => (
  <div className="flex h-full items-center justify-center bg-slate-50 text-slate-500">Loading…</div>
);

// Reads navigator/localStorage for its default language, so client-only.
const IncentivesTab = dynamic(() => import("./IncentivesTab"), { ssr: false, loading });
const RoiTab = dynamic(() => import("./RoiTab"), { ssr: false, loading });

type Tab = "acreage" | "incentives" | "roi";
type OverlayTab = Exclude<Tab, "acreage">;

const TABS: { id: Tab; label: string; hash: string }[] = [
  { id: "acreage", label: "Acreage", hash: "" },
  { id: "incentives", label: "Incentives", hash: "#incentives" },
  { id: "roi", label: "ROI Voyager", hash: "#roi" },
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

export default function AppTabs() {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const tab: Tab = TABS.find((t) => t.hash && t.hash === hash)?.id ?? "acreage";

  // Keep each overlay tab mounted once opened so its inputs survive tab switches.
  const [opened, setOpened] = useState<Record<OverlayTab, boolean>>({ incentives: false, roi: false });
  if (tab !== "acreage" && !opened[tab]) setOpened({ ...opened, [tab]: true });

  const select = (next: Tab) => {
    if (next === tab) return;
    const target = TABS.find((t) => t.id === next)!;
    window.history.pushState(null, "", target.hash || `${window.location.pathname}${window.location.search}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
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
        className="z-[3100] flex shrink-0 items-center border-b border-slate-200 bg-white px-1 print:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <span className="shrink-0 px-2 text-sm font-bold tracking-wide text-emerald-800">Kress</span>
        <div role="tablist" aria-label="Sections" className="flex min-w-0 items-center overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => select(id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                tab === id
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="relative min-h-0 flex-1 print:static">
        {/* The map stays mounted (and sized) underneath, so switching back is instant. */}
        <div className="h-full w-full print:hidden">
          <GolfCourseCalculator />
        </div>
        {panel("incentives", <IncentivesTab />)}
        {panel("roi", <RoiTab />)}
      </div>
    </main>
  );
}
