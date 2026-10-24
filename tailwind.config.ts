import type { Config } from "tailwindcss";

/** A color backed by a CSS variable holding "R G B", so opacity modifiers work. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  // Dark mode follows the `dark` class on <html> (set by the boot script and
  // the theme toggle), not only the OS setting, so users can choose.
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // One motion vocabulary for the app (see globals.css for reduced motion).
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "none" } },
        "tab-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        pop: { from: { opacity: "0.35", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        sheen: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(100%)" } },
        scan: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(250%)" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "fade-in": "fade-in 0.35s ease-out both",
        "scale-in": "scale-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "tab-in": "tab-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        pop: "pop 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        shimmer: "shimmer 2.2s linear infinite",
        "spin-slow": "spin-slow 1.1s linear infinite",
        sheen: "sheen 1.6s cubic-bezier(0.4, 0, 0.2, 1) 0.15s both",
        scan: "scan 1.3s cubic-bezier(0.4, 0, 0.2, 1) infinite",
      },
      // Semantic colors: each one swaps value between light and dark in
      // globals.css, so components need one class instead of a dark: twin.
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        muted: token("muted"),
        faint: token("faint"),
        line: token("line"),
        brand: token("brand"),
        "brand-strong": token("brand-strong"),
        accent: token("accent"),
        "accent-soft": token("accent-soft"),
        "accent-ink": token("accent-ink"),
      },
    },
  },
  plugins: [],
};

export default config;
