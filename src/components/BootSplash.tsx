"use client";

import { useEffect, useState } from "react";
import { ICON_PATHS, type IconName } from "./icons";

/** Pause on the finished frame before the iris opens. */
const HOLD_MS = 250;
/** Never keep the app waiting longer than this, whatever happens. */
const MAX_MS = 5000;
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


// Same icons as the tab bar.
const STEPS: { icon: IconName; en: string; fr: string }[] = [
  { icon: "map", en: "Acreage", fr: "Superficie" },
  { icon: "coins", en: "Incentives", fr: "Incitatifs" },
  { icon: "trend", en: "ROI Voyager", fr: "ROI Voyager" },
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

  // Leave only once the sequence has actually played to the end. The CSS
  // animations start at first paint, not at navigation or hydration, so a
  // fixed timer cut them short on slow loads; instead, wait for every finite
  // animation in the splash to finish (looping ones like the aurora don't
  // count), hold the final frame briefly, then open the iris.
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const leave = () => {
      if (cancelled) return;
      setPhase("leaving");
      timers.push(window.setTimeout(() => setPhase("gone"), EXIT_MS));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      leave();
      return () => {
        cancelled = true;
      };
    }

    const boot = document.getElementById("boot");
    const sequence = (boot?.getAnimations?.({ subtree: true }) ?? []).filter(
      (a) =>
        Number.isFinite(Number(a.effect?.getComputedTiming().endTime)) &&
        (a as CSSAnimation).animationName !== "boot-failsafe",
    );
    const finished = sequence.length
      ? Promise.all(sequence.map((a) => a.finished.catch(() => undefined)))
      : new Promise((resolve) => timers.push(window.setTimeout(resolve, 3000)));
    const cap = new Promise((resolve) => timers.push(window.setTimeout(resolve, MAX_MS)));
    void Promise.race([finished, cap]).then(() => {
      if (!cancelled) timers.push(window.setTimeout(leave, HOLD_MS));
    });

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
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
                  <path d={ICON_PATHS[step.icon]} />
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
