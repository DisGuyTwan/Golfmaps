"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { LANG_KEY, THEME_KEY } from "./preferences-boot";

/**
 * App-wide language and theme, shared by every tab and remembered per device.
 *
 * Both live outside React (localStorage + the <html> element) and are read
 * through useSyncExternalStore. The server always renders English/light; the
 * boot script in preferences-boot.ts applies the saved theme before first
 * paint, so there is no light flash in dark mode.
 */

export type Lang = "en" | "fr";
export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keep other open tabs of the app in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) {
      document.documentElement.classList.toggle("dark", event.newValue === "dark");
    }
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked (private mode): the choice lasts for this page only */
  }
}

// English is the default; French only when the user picked it.
function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "fr" ? "fr" : "en";
  } catch {
    return "en";
  }
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Applies a UI change inside a View Transition when the browser has them
 * (Chrome, Edge, Safari 18+): the old and new page are snapshotted and
 * animated. flushSync makes React render the change inside the callback, so
 * the "new" snapshot is the updated page. Without support, or with reduced
 * motion, the change applies directly (`fallback` can add its own effect).
 */
function withViewTransition(
  apply: () => void,
  { onReady, className, fallback }: { onReady?: () => void; className?: string; fallback?: () => void } = {},
) {
  if (!("startViewTransition" in document) || prefersReducedMotion()) {
    fallback?.();
    apply();
    return;
  }
  const root = document.documentElement;
  if (className) root.classList.add(className);
  const transition = document.startViewTransition(() => flushSync(apply));
  if (onReady) transition.ready.then(onReady).catch(() => {});
  transition.finished.finally(() => {
    if (className) root.classList.remove(className);
  });
}

/** Switches language with a short cross-fade of the whole page. */
export function setLang(lang: Lang) {
  withViewTransition(() => {
    save(LANG_KEY, lang);
    document.documentElement.lang = lang === "fr" ? "fr-CA" : "en-CA";
    emit();
  });
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, readLang, () => "en");
}

/** The theme actually applied (saved choice, else the device setting). */
function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Switches theme. With view transitions the new theme spreads in a circle from
 * `origin` (the toggle button); otherwise colors ease over 350 ms.
 */
export function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  const root = document.documentElement;
  const apply = () => {
    save(THEME_KEY, theme);
    root.classList.toggle("dark", theme === "dark");
    emit();
  };
  const { x, y } = origin ?? { x: window.innerWidth - 24, y: 24 };
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  withViewTransition(apply, {
    className: "vt-theme",
    onReady: () =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 600, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    fallback: () => {
      root.classList.add("theme-fade");
      window.setTimeout(() => root.classList.remove("theme-fade"), 400);
    },
  });
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}
