/**
 * Shared by the server layout and the client preference hooks (so no
 * "use client" here). The boot script runs in <head> before first paint: it
 * applies the saved theme, or the device's dark-mode setting, and the saved
 * language, so dark-mode users never see a light flash.
 */
export const LANG_KEY = "kress-lang";
export const THEME_KEY = "kress-theme";

export const PREFERENCES_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}");if(t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches)d.classList.add("dark");if(localStorage.getItem("${LANG_KEY}")==="fr")d.lang="fr-CA"}catch(e){}})()`;
