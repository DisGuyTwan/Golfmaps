"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "kress-booted";
/** Full sequence (ring + stripes) on the first load of a session, a quick fade after. */
const FIRST_MS = 1500;
const REPEAT_MS = 350;
const FADE_MS = 500;

/**
 * Boot screen: a ring drawing itself around four mowing stripes, an orbiting
 * dot and a scanning progress line. Server-rendered (so it covers the page
 * before scripts run), then faded out once the app has hydrated. Styles and
 * the no-JavaScript failsafe live in globals.css (#boot).
 */
export default function BootSplash() {
  const [phase, setPhase] = useState<"on" | "leaving" | "gone">("on");

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage blocked: play the full sequence */
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minimum = reduced ? 0 : seen ? REPEAT_MS : FIRST_MS;
    const wait = Math.max(0, minimum - performance.now());
    const leave = window.setTimeout(() => setPhase("leaving"), wait);
    const gone = window.setTimeout(() => setPhase("gone"), wait + FADE_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(gone);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div id="boot" className={phase === "leaving" ? "boot-done" : undefined} aria-hidden="true">
      <div className="boot-mark">
        <svg className="boot-svg" viewBox="0 0 120 120">
          <defs>
            <clipPath id="boot-clip">
              <circle cx="60" cy="60" r="43" />
            </clipPath>
          </defs>
          <g clipPath="url(#boot-clip)">
            {[16, 38, 60, 82].map((y) => (
              <rect key={y} className="boot-stripe" x="17" y={y} width="86" height="22" />
            ))}
          </g>
          <circle className="boot-track" cx="60" cy="60" r="52" />
          <circle className="boot-ring" cx="60" cy="60" r="52" />
          <g className="boot-orbit">
            <circle cx="60" cy="8" r="3.5" />
          </g>
        </svg>
        <div className="boot-bar">
          <span />
        </div>
      </div>
    </div>
  );
}
