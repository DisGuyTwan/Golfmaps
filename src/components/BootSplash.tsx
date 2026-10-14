"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "calculator-booted";
/** Full sequence on the first load of a session; a quick reveal on later loads. */
const FIRST_MS = 2700;
const REPEAT_MS = 700;
const EXIT_MS = 850;

// App icon geometry (SVG units, viewBox 120 × 120): six vertical mowing passes.
const STRIPES = 6;
const STRIPE_W = 120 / STRIPES;
/** One pass takes this long; passes alternate down and up, like a real mower. */
const PASS_S = 0.22;
const MOW_START_S = 0.45;
const MOW_PATH = Array.from({ length: STRIPES }, (_, i) => {
  const x = STRIPE_W * (i + 0.5);
  const [from, to] = i % 2 === 0 ? [10, 110] : [110, 10];
  return `${i === 0 ? "M" : "L"}${x} ${from} V${to}`;
}).join(" ");

/** Text in both languages; CSS shows the one matching <html lang> (set before paint). */
function Bi({ en, fr }: { en: string; fr: string }) {
  return (
    <>
      <span className="boot-en">{en}</span>
      <span className="boot-fr" lang="fr-CA">
        {fr}
      </span>
    </>
  );
}

const ICONS = {
  map: "M9 3 3 5.5v15.5l6-2.5 6 2.5 6-2.5V3l-6 2.5L9 3Zm0 0v15.5m6-13V21",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m3-7.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2-3-.9-3-2",
  chart: "M4 20h16M7 16l4-5 3 3 5-7",
};

const STEPS: { icon: keyof typeof ICONS; en: string; fr: string }[] = [
  { icon: "map", en: "Acreage", fr: "Superficie" },
  { icon: "coin", en: "Incentives", fr: "Incitatifs" },
  { icon: "chart", en: "ROI Voyager", fr: "ROI Voyager" },
];

const WORD = "Calculator";

/**
 * Full-screen boot sequence, in a modern product-launch style. Server-rendered,
 * so it covers the page before any JavaScript runs, then exits with an iris
 * reveal once the app has hydrated:
 * - backdrop: drifting aurora lights, a dot grid fading from the centre, grain;
 * - a glass app icon with a spinning gradient border, where a small mower lays
 *   six alternating stripes, then a shine sweeps across;
 * - the "Calculator" wordmark rising letter by letter in gradient type;
 * - a tagline, three status chips that turn from spinner to check, and a thin
 *   glowing progress line.
 * Styles, timeline, reduced-motion version and the no-JavaScript failsafe live
 * in src/app/boot.css.
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
    const gone = window.setTimeout(() => setPhase("gone"), wait + EXIT_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(gone);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div id="boot" className={phase === "leaving" ? "boot-done" : undefined} aria-hidden="true">
      <div className="boot-aurora">
        <span className="boot-blob boot-blob-1" />
        <span className="boot-blob boot-blob-2" />
        <span className="boot-blob boot-blob-3" />
      </div>
      <div className="boot-dots" />
      <div className="boot-grain" />

      <div className="boot-stage">
        <div className="boot-icon">
          <div className="boot-icon-inner">
            <svg viewBox="0 0 120 120" className="boot-icon-svg">
              {Array.from({ length: STRIPES }, (_, i) => (
                <rect
                  key={i}
                  className={`boot-stripe ${i % 2 === 0 ? "boot-stripe-down" : "boot-stripe-up"}`}
                  x={STRIPE_W * i}
                  y="0"
                  width={STRIPE_W + 0.4}
                  height="120"
                  style={{ animationDelay: `${MOW_START_S + i * PASS_S}s`, animationDuration: `${PASS_S}s` }}
                />
              ))}
              <g className="boot-mower">
                <rect x="-6.5" y="-4.5" width="13" height="9" rx="3" />
                <animateMotion
                  path={MOW_PATH}
                  begin={`${MOW_START_S}s`}
                  dur={`${(STRIPES * PASS_S * 1.18).toFixed(2)}s`}
                  fill="freeze"
                  rotate="auto"
                />
              </g>
            </svg>
            <span className="boot-icon-glass" />
            <span className="boot-icon-shine" />
          </div>
        </div>

        <h1 className="boot-word">
          {WORD.split("").map((letter, i) => (
            <span key={i} className="boot-letter">
              <span style={{ animationDelay: `${0.55 + i * 0.035}s, 1.3s` }}>{letter}</span>
            </span>
          ))}
        </h1>

        <p className="boot-tagline">
          <Bi
            en="Acreage, incentives and ROI for robotic mowing"
            fr="Superficie, incitatifs et ROI pour la tonte robotisée"
          />
        </p>

        <ul className="boot-steps">
          {STEPS.map((step, i) => {
            const done = `${1.35 + i * 0.4}s`;
            return (
              <li key={step.icon} style={{ animationDelay: `${0.9 + i * 0.12}s` }}>
                <span className="boot-step-state" style={{ animationDelay: done }}>
                  <span className="boot-spinner" style={{ animationDelay: `0s, ${done}` }} />
                  <svg viewBox="0 0 24 24" className="boot-check" style={{ animationDelay: done }}>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <svg viewBox="0 0 24 24" className="boot-step-icon">
                  <path d={ICONS[step.icon]} />
                </svg>
                <Bi en={step.en} fr={step.fr} />
              </li>
            );
          })}
        </ul>

        <div className="boot-progress">
          <span />
        </div>
      </div>

      <p className="boot-domain">calculator.prodig-e.com</p>
    </div>
  );
}
