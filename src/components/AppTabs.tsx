"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import GolfCourseCalculator from "./GolfCourseCalculator";

// Reads navigator/localStorage for its default language, so client-only.
const IncentivesTab = dynamic(() => import("./IncentivesTab"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-50 text-slate-500">Loading…</div>
  ),
});

type Tab = "acreage" | "incentives";
const INCENTIVES_HASH = "#incentives";

// The active tab lives in the URL hash so dealers can share a direct link
// (…/#incentives) and the back button switches tabs.
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

const TABS: { id: Tab; label: string }[] = [
  { id: "acreage", label: "Acreage" },
  { id: "incentives", label: "Incentives" },
];

export default function AppTabs() {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const tab: Tab = hash === INCENTIVES_HASH ? "incentives" : "acreage";

  // Keep the checker mounted once opened so its inputs survive tab switches.
  const [incentivesOpened, setIncentivesOpened] = useState(false);
  if (tab === "incentives" && !incentivesOpened) setIncentivesOpened(true);

  const select = (next: Tab) => {
    if (next === tab) return;
    const url =
      next === "incentives"
        ? INCENTIVES_HASH
        : `${window.location.pathname}${window.location.search}`;
    window.history.pushState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden">
      <nav
        className="z-[3100] flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-2"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <span className="px-2 text-sm font-bold tracking-wide text-emerald-800">Kress</span>
        <div role="tablist" aria-label="Sections" className="flex items-center gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => select(id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
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

      <div className="relative min-h-0 flex-1">
        {/* The map stays mounted (and sized) underneath, so switching back is instant. */}
        <GolfCourseCalculator />
        {incentivesOpened && (
          <div role="tabpanel" className={tab === "incentives" ? "absolute inset-0 z-[3000]" : "hidden"}>
            <IncentivesTab />
          </div>
        )}
      </div>
    </main>
  );
}
