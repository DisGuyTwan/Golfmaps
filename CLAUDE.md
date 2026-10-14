# Kress

Next.js 16 App Router + React 19 + TypeScript + Tailwind. Measures golf course
turf acreage from OpenStreetMap for robotic mower quoting, plus an
"Incentives" tab that estimates grant/tax savings on robotic mowers and battery
tools (Quebec, Ontario, federal) and a "ROI Voyager" tab comparing a Kress
Voyager with a zero-turn crew. Every tab is in English (default) and Quebec
French, with light and dark themes. No API keys, no backend — every request goes
straight from the browser to public APIs (built-in `fetch`, no HTTP library).

## Layout

```
src/app/          layout.tsx (metadata, theme boot script), page.tsx, error.tsx,
                  globals.css (theme color variables)
src/components/
  ui.tsx                     shared TabHeader + style classes for every tab
  AppTabs.tsx                tab bar (Acreage | Incentives | ROI Voyager) + FR/EN and
                             light/dark buttons; tab in the URL hash
  GolfCourseCalculator.tsx   top-level state, orchestrates fetch → measure
  GolfMap.tsx                Leaflet map; client-only (dynamic import, ssr: false)
  MeasurePanel.tsx           results panel + legend
  SearchBox.tsx              Photon geocoder autocomplete
  IncentivesTab.tsx          incentive checker UI (client-only)
  RoiTab.tsx                 Voyager ROI calculator UI, printable
src/lib/
  overpass.ts   builds the Overpass QL query, fails over across 3 mirrors
  area.ts       OSM → GeoJSON → categorize → clip → acres  (the core logic)
  types.ts      BBox, CourseMeasurement
  incentives.ts program rules, FR/EN copy and savings math (pure, tested)
  roi.ts        Voyager ROI formulas and formatting (pure, tested)
  roi-copy.ts   ROI tab copy, FR (handoff original) and EN
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
- **The ROI calculator is a finished, checked port.** Keep its formulas and
  French wording (`roi-copy.ts`; the English is a translation, and the
  formatters default to French). Its defaults are dated market data and need
  refreshing: gas price (Oct 2026), the Hydro-Québec Tarif G rate (`HQ_RATE`,
  update each April 1), payroll rates in the footnote (each January), Voyager
  prices/batteries. When a default changes, update the footnote source and the
  "defaults" values in `roi.test.ts`; the handoff's original inputs stay there
  as a regression check on the formulas. Equipment is counted once in payback/ROI, and
  there is deliberately no "Levier 2" / redeployment profit (it double-counted
  the same worker).
- **Language and theme are app-wide.** Read them with `useLang()` /
  `useTheme()` from `src/lib/preferences.ts`; never keep per-tab copies. English
  is the default; the server always renders English/light and the boot script in
  `preferences-boot.ts` applies a saved dark theme before paint. Any new
  user-facing text needs both languages (incentives.ts, roi-copy.ts or i18n.ts).
- **One look for every tab.** Reuse `src/components/ui.tsx`: `TabHeader` (the
  dark-green header with eyebrow, title, pitch line and Print / PDF button) and
  the `ui.*` class strings (buttons, h2, label, input, card, note, kpi,
  container). Don't introduce new font sizes or button styles per tab.
- **Use the theme color tokens, not raw colors.** `bg-brand` (dark green fills:
  headers, buttons, highlight boxes), `text-accent`, `bg-surface`, `text-ink`,
  `text-muted`, `border-line`, `bg-accent-soft`, … are CSS variables in
  `globals.css` that swap in dark mode, so one class covers both themes. Dark
  values sit under `@media screen`, so printing stays light.
- **Print / PDF is a client deliverable.** Incentives prints the profile and
  results (the form is hidden); ROI fits one Letter page. Check both with
  print emulation after layout changes.
- **React 19 rules apply**: no reading/writing refs during render and no
  synchronous setState in effect bodies (the lint config enforces both).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type check + production build
npm run lint
npm test         # vitest: acreage pipeline, incentive math, ROI acceptance values
```
