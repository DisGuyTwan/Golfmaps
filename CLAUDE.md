# Calculator

The app is called **Calculator** (calculator.prodig-e.com). "Kress" only
names the mower product (Kress Voyager, KR800/KR804); don't use it as the
app's brand.

Next.js 16 App Router + React 19 + TypeScript + Tailwind. Measures golf course
turf acreage from OpenStreetMap for robotic mower quoting, plus an
"Incentives" tab that estimates grant/tax savings on robotic mowers and battery
tools (Quebec, Ontario, federal) and an "ROI" tab comparing a Kress
Voyager with a zero-turn crew. Every tab is in English (default) and Quebec
French, with light and dark themes. The tabs are connected (measured acres →
ROI sizing; the Incentives profile → ROI's net investment) and every tab has a
share link and a client PDF. No API keys and no database: three small route
handlers (Overpass cache, gas price, client error log) run on Vercel; everything
else goes straight from the browser to public APIs (built-in `fetch`).

## Layout

```
src/app/          layout.tsx (metadata, theme boot script), page.tsx, error.tsx,
                  not-found.tsx, globals.css (theme color variables), boot.css
  api/overpass/   cached Overpass lookup (CDN 1 day, hedged mirror requests);
                  the browser falls back to calling the mirrors itself
  api/gas-price/  Montréal gas price from Statistics Canada (CDN 1 day)
  api/log/        client error reports → Vercel runtime logs
src/components/
  ui.tsx                     shared TabHeader, SectionTitle, Notice, Loader, Pop + style
                             classes for every tab
  icons.tsx                  the app's line-icon set (<Icon name>, ICON_PATHS)
  BootSplash.tsx             full-screen boot sequence (server-rendered, fades out
                             after hydration; styles and timeline in app/boot.css)
  AppTabs.tsx                tab bar (Acreage | Incentives | ROI) + FR/EN and
                             light/dark buttons; tab in the URL hash
  GolfCourseCalculator.tsx   top-level state, orchestrates fetch → measure
  GolfMap.tsx                Leaflet map; client-only (dynamic import, ssr: false)
  MeasurePanel.tsx           results panel + legend
  QuoteSection.tsx           acres for the quote: categories, % rough, override,
                             Send to ROI, PDF report, Copy link
  AcreageReport.tsx          print-only Acreage PDF (replaces the map in print)
  SearchBox.tsx              Photon geocoder autocomplete
  IncentivesTab.tsx          incentive checker UI (client-only)
  RoiTab.tsx                 Voyager ROI calculator UI, printable
src/lib/
  overpass.ts   builds the Overpass QL query; cache route first, then 3 mirrors
  area.ts       OSM → GeoJSON → categorize → clip → acres  (the core logic)
  types.ts      BBox, CourseMeasurement
  incentives.ts program rules, FR/EN copy and savings math (pure, tested)
  roi.ts        Voyager ROI model sized from acreage, formatting (pure, tested)
  roi-copy.ts   ROI tab copy, FR and EN, incl. "as of" source for each default
  quote.ts      measurement → acres for the quote, share params (pure, tested)
  quote-store.ts  client store shared by the tabs (useSyncExternalStore)
  share.ts      share-link helpers (pure, tested); keys r_ / i_ / q_ / v, m, b, n
  gas.ts        StatCan gas price parsing (pure, tested)
  report-error.ts  sendBeacon to /api/log
  tabs.ts       goToTab() for in-app navigation
  i18n.ts       EN/FR copy for the tab bar, Acreage tab, search, error page
  preferences.ts       useLang / useTheme / setLang / setTheme (client)
  preferences-boot.ts  storage keys + inline script that applies them pre-paint
src/types/      ambient module declarations for untyped deps
```

## Things to know

- **`src/lib/area.ts` is where the real logic lives.** Categorization, clipping
  trees/buildings to the course boundary, and the rough estimate all happen in
  `processOverpassData`. It is pure — input is Overpass JSON, output is a
  `CourseMeasurement` — so it can be exercised without a browser.
- **Rough is deliberately conservative.** When rough isn't mapped, it's estimated
  from the boundary minus everything else; when a course has *only* a boundary
  and no detail, it reports `boundaryOnly` rather than estimating. Don't "fix"
  that into always producing a number — it would silently inflate quotes.
- **Leaflet touches `window` at import time.** `GolfMap` must stay behind
  `dynamic(..., { ssr: false })` or the build breaks.
- **Incentive data is dated research, not live data.** Rates, caps and links in
  `src/lib/incentives.ts` reflect research as of Oct 9, 2026, with the federal
  write-off rules re-checked Oct 14, 2026 (the Productivity Mega Deduction is
  proposed, not law, so it only raises the high end); the "as of" date
  appears in the copy (`eyebrow`, `sumFoot`). Update both when the data changes.
  Customer-facing copy uses Quebec French and no em dashes. Keep the
  "not tax advice" disclaimer; only "ok" (in force) items count toward the low
  end of the range.
- **The ROI compares the same job on both sides.** Both are sized from the
  acres to mow per week: zero-turn crew in full-time equivalents (paid for the
  share of their shifts the mowing takes) on whole machines, versus whole
  Voyager units at their acres per charge, plus supervision time. Existing
  zero-turns are either a purchase avoided or (already owned) their resale
  value; grants and the tax credit from the Incentives tab can reduce the
  Voyager investment (write-offs never do: they're timing). Don't go back to
  "one employee vs one Voyager": the handoff's figures are reproduced in
  `roi.test.ts` only as a formula regression with matching inputs.
- **ROI defaults are dated market data.** Gas (live from StatCan only once its
  month is at least `DEFAULT_GAS_PERIOD`, since StatCan lags; else the dated
  default; bump both together), the Hydro-Québec Tarif G rate (`HQ_RATE`,
  update each April 1), payroll rates (each January), Voyager prices and
  capacities. Each default shows its source under the input (`asOf` in
  `roi-copy.ts`); when one changes, update that, the footnote and the
  "defaults" values in `roi.test.ts`. Equipment is counted once in payback/ROI,
  and there is deliberately no "Levier 2" / redeployment profit.
- **Incentives keep two kinds of money apart.** Items are `kind: "kept"` (grants,
  rebates, the refundable credit) or `"timing"` (write-offs). Show and sum them
  separately; only "kept" feeds the ROI tab.
- **Measured turf is not quoted turf.** `quote.ts` counts only chosen categories
  (greens/tees off by default), a share of the rough (80% default) or a manual
  override, and refuses to quote a boundary-only course without an override.
- **Language and theme are app-wide.** Read them with `useLang()` /
  `useTheme()` from `src/lib/preferences.ts`; never keep per-tab copies. English
  is the default; the server always renders English/light and the boot script in
  `preferences-boot.ts` applies a saved dark theme before paint. Any new
  user-facing text needs both languages (incentives.ts, roi-copy.ts or i18n.ts).
- **One look for every tab.** Reuse `src/components/ui.tsx`: `TabHeader` (the
  dark-green header with eyebrow, title, pitch line and Print / PDF button) and
  the `ui.*` class strings (buttons, h2, label, input, card, note, kpi,
  container). Don't introduce new font sizes or button styles per tab.
- **Motion has one vocabulary.** Tailwind animations in `tailwind.config.ts`
  (`fade-up`, `fade-in`, `scale-in`, `tab-in`, `pop`, `sheen`, `spin-slow`);
  `ui.enter` + `delay(n)` for staggered entrances, `<Pop value>` for numbers
  that recalculate, `<Loader>` for loading states. Theme and language switches
  use View Transitions in `preferences.ts` (circle reveal / cross-fade) with a
  fallback. `prefers-reduced-motion` shortens everything (globals.css) and
  print disables all animation, so PDFs never catch a half-faded frame.
  When testing PDFs with Playwright, don't call `emulateMedia({ media: "screen" })`
  before `page.pdf()`: it forces screen styles into the PDF.
- **Icons come from `src/components/icons.tsx`, never emoji or Unicode
  symbols** (no ⛳ ▭ ✕ → in copy or JSX). One style: 24 px grid, 1.75 stroke,
  round caps, `currentColor`; size with `h-4 w-4` style classes (passing a
  className replaces the default size). Each tab has one icon (map, coins,
  trend) used in the tab bar, its header and the boot screen. Add a path to
  `ICON_PATHS` rather than inlining an `<svg>`; the favicon is `app/icon.svg`.
- **Use the theme color tokens, not raw colors.** `bg-brand` (dark green fills:
  headers, buttons, highlight boxes), `text-accent`, `bg-surface`, `text-ink`,
  `text-muted`, `border-line`, `bg-accent-soft`, … are CSS variables in
  `globals.css` that swap in dark mode, so one class covers both themes. Dark
  values sit under `@media screen`, so printing stays light.
- **Print / PDF is a client deliverable.** Acreage prints `AcreageReport`
  (1 page), Incentives the profile and results (about 2 pages, form hidden),
  ROI one Letter page (printed at 80%, inputs as "label … value", sources full
  width). Check page counts with print emulation after layout changes.
- **Share links** put a tab's inputs in the query string (`share.ts`); tabs read
  them once on load. Keep new inputs in the link, with the tab's prefix.
- **React 19 rules apply**: no reading/writing refs during render and no
  synchronous setState in effect bodies (the lint config enforces both).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type check + production build
npm run lint
npm test         # vitest: acreage pipeline, quote, incentives, ROI model, share links
```
