/**
 * Shared by the server layout and the client preference hooks (so no
 * "use client" here). The boot script runs in <head> before first paint: it
 * applies the saved theme, or the device's dark-mode setting, and the saved
 * language, so dark-mode users never see a light flash.
 */
export const LANG_KEY = "calculator-lang";
export const THEME_KEY = "calculator-theme";

/**
 * Before the rename to Calculator, choices were saved as kress-lang /
 * kress-theme. The boot script moves them to the new keys once, so nobody
 * loses their language or theme.
 */
const MIGRATE = `["lang","theme"].forEach(function(k){var o=localStorage.getItem("kress-"+k);if(o!==null){if(localStorage.getItem("calculator-"+k)===null)localStorage.setItem("calculator-"+k,o);localStorage.removeItem("kress-"+k)}});`;

export const PREFERENCES_BOOT_SCRIPT = `(function(){try{${MIGRATE}var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}");if(t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches)d.classList.add("dark");if(localStorage.getItem("${LANG_KEY}")==="fr")d.lang="fr-CA"}catch(e){}})()`;
