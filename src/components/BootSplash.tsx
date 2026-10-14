"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "calculator-booted";
/** Full sequence on the first load of a session; a quick fade on later loads. */
const FIRST_MS = 2700;
const REPEAT_MS = 700;
const FADE_MS = 700;

// Emblem geometry (SVG units, viewBox 400 × 400, centre 200,200).
const DISC_R = 138;
const STRIPES = 8;
const STRIPE_TOP = 200 - DISC_R;
const STRIPE_H = (2 * DISC_R) / STRIPES;
const LEFT = 200 - DISC_R;
/** The mower mows one stripe in this long, alternating direction each pass. */
const PASS_S = 0.2;
const MOW_START_S = 0.35;

/**
 * Back-and-forth mowing path through the middle of each stripe, each pass
 * running edge to edge of the disc (a chord), so the mower stays on the turf.
 */
const MOW_PATH = Array.from({ length: STRIPES }, (_, i) => {
  const y = STRIPE_TOP + STRIPE_H * (i + 0.5);
  const half = Math.sqrt(DISC_R ** 2 - (y - 200) ** 2) - 10;
  const [from, to] = i % 2 === 0 ? [200 - half, 200 + half] : [200 + half, 200 - half];
  return `${i === 0 ? "M" : "L"}${from.toFixed(1)} ${y.toFixed(1)} H${to.toFixed(1)}`;
}).join(" ");

const TICKS = Array.from({ length: 72 }, (_, i) => i);

/** Deterministic "random" spread, identical on server and client (no hydration mismatch). */
const spread = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(spread(i, 1) * 100).toFixed(2)}%`,
  size: `${(1.5 + spread(i, 2) * 2.5).toFixed(2)}px`,
  duration: `${(6 + spread(i, 3) * 7).toFixed(2)}s`,
  delay: `${(-spread(i, 4) * 10).toFixed(2)}s`,
}));

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

const LOG: { en: string; fr: string }[] = [
  { en: "Satellite imagery and OpenStreetMap turf data", fr: "Imagerie satellite et données de gazon OpenStreetMap" },
  { en: "Quebec, Ontario and federal incentive programs", fr: "Programmes incitatifs du Québec, de l’Ontario et du fédéral" },
  { en: "Voyager ROI model and live gas price", fr: "Modèle ROI Voyager et prix de l’essence en direct" },
];

/**
 * Full-screen boot sequence. Server-rendered, so it covers the page before any
 * JavaScript runs, then fades out once the app has hydrated:
 * - backdrop: perspective grid floor, scanlines, rising particles, HUD corners
 *   with telemetry readouts;
 * - emblem: rotating dashed ring, dial ticks, a progress arc, and a robot mower
 *   laying down alternating mowing stripes under a radar sweep;
 * - CALCULATOR wordmark, tagline, a three-line boot log and a progress bar counting to 100.
 * Styles, the reduced-motion version and the no-JavaScript failsafe live in
 * src/app/boot.css.
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
      <div className="boot-backdrop" />
      <div className="boot-grid" />
      <div className="boot-particles">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            style={{ left: p.left, width: p.size, height: p.size, animationDuration: p.duration, animationDelay: p.delay }}
          />
        ))}
      </div>
      <div className="boot-scanlines" />
      <div className="boot-sweep" />

      <div className="boot-hud">
        <span className="boot-corner boot-tl" />
        <span className="boot-corner boot-tr" />
        <span className="boot-corner boot-bl" />
        <span className="boot-corner boot-br" />
        <span className="boot-tele boot-tele-tl">
          <i className="boot-blink" /> RTK · GNSS · FIX
        </span>
        <span className="boot-tele boot-tele-tr">OSM · OVERPASS · STATCAN</span>
        <span className="boot-tele boot-tele-bl">46.3432° N · 72.5428° W</span>
        <span className="boot-tele boot-tele-br">CALCULATOR · 2026.10</span>
      </div>

      <div className="boot-center">
        <div className="boot-emblem">
          <svg className="boot-svg" viewBox="0 0 400 400">
            <defs>
              <clipPath id="boot-disc">
                <circle cx="200" cy="200" r={DISC_R} />
              </clipPath>
              <radialGradient id="boot-halo" cx="50%" cy="50%" r="50%">
                <stop offset="55%" stopColor="#86cf98" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#86cf98" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="boot-arc-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#bbf7d0" />
              </linearGradient>
            </defs>

            <circle className="boot-halo" cx="200" cy="200" r="200" fill="url(#boot-halo)" />
            <circle className="boot-outer" cx="200" cy="200" r="192" />
            <g className="boot-ticks">
              {TICKS.map((i) => {
                const a = (i / TICKS.length) * Math.PI * 2;
                const long = i % 6 === 0;
                const r1 = long ? 162 : 168;
                const r2 = 176;
                return (
                  <line
                    key={i}
                    x1={(200 + Math.cos(a) * r1).toFixed(2)}
                    y1={(200 + Math.sin(a) * r1).toFixed(2)}
                    x2={(200 + Math.cos(a) * r2).toFixed(2)}
                    y2={(200 + Math.sin(a) * r2).toFixed(2)}
                    className={long ? "boot-tick-long" : undefined}
                  />
                );
              })}
            </g>
            <circle className="boot-track" cx="200" cy="200" r="152" />
            <circle className="boot-arc" cx="200" cy="200" r="152" stroke="url(#boot-arc-grad)" />

            <g clipPath="url(#boot-disc)">
              <circle className="boot-disc" cx="200" cy="200" r={DISC_R} />
              {Array.from({ length: STRIPES }, (_, i) => (
                <rect
                  key={i}
                  className={`boot-stripe ${i % 2 === 0 ? "boot-stripe-ltr" : "boot-stripe-rtl"}`}
                  x={LEFT}
                  y={STRIPE_TOP + STRIPE_H * i}
                  width={2 * DISC_R}
                  height={STRIPE_H + 0.5}
                  style={{ animationDelay: `${MOW_START_S + i * PASS_S}s`, animationDuration: `${PASS_S}s` }}
                />
              ))}
              <path className="boot-trail" d={MOW_PATH} />
            </g>

            {/* The robot mower driving the stripes (SMIL, so it runs before scripts). */}
            <g className="boot-mower">
              <rect x="-11" y="-8" width="22" height="16" rx="4" />
              <rect className="boot-mower-eye" x="5" y="-3" width="4" height="6" rx="1.5" />
              <animateMotion
                path={MOW_PATH}
                begin={`${MOW_START_S}s`}
                dur={`${(STRIPES * PASS_S * 1.11).toFixed(2)}s`}
                fill="freeze"
                rotate="auto"
              />
            </g>

            {/* Compass marks */}
            {[0, 90, 180, 270].map((deg) => (
              <path key={deg} className="boot-mark" d="M200 40 l-5 -9 h10 z" transform={`rotate(${deg} 200 200)`} />
            ))}
          </svg>
          <div className="boot-radar" />
        </div>

        <div className="boot-word">
          {"CALCULATOR".split("").map((letter, i) => (
            <span key={i} style={{ animationDelay: `${0.5 + i * 0.05}s` }}>
              {letter}
            </span>
          ))}
        </div>
        <p className="boot-tagline">
          <Bi en="Robotic mowing toolkit · Acreage · Incentives · ROI" fr="Outils de tonte robotisée · Superficie · Incitatifs · ROI" />
        </p>

        <ul className="boot-log">
          {LOG.map((line, i) => (
            <li key={i} style={{ animationDelay: `${0.7 + i * 0.55}s` }}>
              <span className="boot-ok" style={{ animationDelay: `${1.15 + i * 0.55}s` }}>
                OK
              </span>
              <Bi en={line.en} fr={line.fr} />
            </li>
          ))}
        </ul>

        <div className="boot-progress">
          <div className="boot-progress-track">
            <div className="boot-progress-fill" />
          </div>
          <span className="boot-pct" />
        </div>
      </div>
    </div>
  );
}
