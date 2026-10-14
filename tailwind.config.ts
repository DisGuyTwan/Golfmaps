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
        accent: token("accent"),
        "accent-soft": token("accent-soft"),
        "accent-ink": token("accent-ink"),
        roi: {
          canvas: token("roi-canvas"),
          surface: token("roi-surface"),
          ink: token("roi-ink"),
          label: token("roi-label"),
          sub: token("roi-sub"),
          hint: token("roi-hint"),
          note: token("roi-note"),
          border: token("roi-border"),
          line: token("roi-line"),
          head: token("roi-head"),
          soft: token("roi-soft"),
          readonly: token("roi-readonly"),
          accent: token("roi-accent"),
        },
      },
    },
  },
  plugins: [],
};

export default config;
