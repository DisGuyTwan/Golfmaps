/**
 * The app's icon set: minimal line icons on a 24 × 24 grid, one stroke weight,
 * round caps and joins, drawn in `currentColor` so they follow the text color
 * (and the theme). Use these instead of emoji or Unicode symbols (⛳ ▭ ✕ →),
 * which render differently on every device.
 *
 * No hooks, so server components (the boot screen) can use the paths too.
 */

export const ICON_PATHS = {
  // Tabs
  map: "M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11V20",
  coins: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm3.5-13.5h-5a2 2 0 1 0 0 4h3a2 2 0 1 1 0 4h-5M12 6v12",
  trend: "m22 7-8.5 8.5-5-5L2 17M16 7h6v6",
  // Acreage
  ruler:
    "M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0l12.6 12.6ZM14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2",
  select: "M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3M9 12h6m-3-3v6",
  flag: "M8 19V3l9 4-9 4M3.5 19.5c0-1 3.8-1.8 8.5-1.8s8.5.8 8.5 1.8-3.8 1.8-8.5 1.8-8.5-.8-8.5-1.8Z",
  pin: "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  calculator:
    "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2 4h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-4.3-4.3",
  sprout:
    "M7 20h10m-7 0c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8ZM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2Z",
  pen: "M12 20h9M16.4 3.6a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4L16.4 3.6Z",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  // Actions
  close: "M18 6 6 18M6 6l12 12",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  arrowDown: "M12 5v14m-6-6 6 6 6-6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6m-6 4h6",
  printer:
    "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6v-7Z",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  copy: "M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM4 16V6a2 2 0 0 1 2-2h10",
  check: "M20 6 9 17l-5-5",
  external: "M15 3h6v6M10 14 21 3m-3 10v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  refresh: "M3 12a9 9 0 0 1 15.5-6.2L21 8m0-5v5h-5m5 4a9 9 0 0 1-15.5 6.2L3 16m0 5v-5h5",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  // Notices
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v-4m0-4h.01",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01",
  compass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm4.2-14.2-2.1 6.3-6.3 2.1 2.1-6.3 6.3-2.1Z",
  // Incentives
  building:
    "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18H6Zm0-10H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m12-13h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4m-4 4h4m-4 4h4m-4 4h4",
  cart: "M2 3h2.5l2.7 11.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 1.9-1.4L22 7H5.2M9 21h.01M18 21h.01",
  wallet: "M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  layers: "m12 2 10 5-10 5L2 7l10-5ZM2 17l10 5 10-5M2 12l10 5 10-5",
  // ROI
  mower: "M3 15a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v1H3v-1Zm4 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9 12.5h6M12 9V6",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  calendar: "M8 2v4m8-4v4M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm-2 6h18",
  scale:
    "m16 16 3-8 3 8a5 5 0 0 1-6 0Zm-14 0 3-8 3 8a5 5 0 0 1-6 0Zm5 5h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  table: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 6h18M3 15h18M9 9v12",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2",
} as const;

export type IconName = keyof typeof ICON_PATHS;

/**
 * One icon. Decorative by default (hidden from screen readers, since the
 * button or heading next to it already says what it is). Size with className
 * (default 16 px); color comes from the surrounding text.
 */
export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
