"use client";

import { useSyncExternalStore } from "react";
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

export function setLang(lang: Lang) {
  save(LANG_KEY, lang);
  document.documentElement.lang = lang === "fr" ? "fr-CA" : "en-CA";
  emit();
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, readLang, () => "en");
}

/** The theme actually applied (saved choice, else the device setting). */
function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  save(THEME_KEY, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  emit();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}
