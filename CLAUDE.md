# Kress

Next.js 16 App Router + React 19 + TypeScript + Tailwind. Measures golf course
turf acreage from OpenStreetMap for robotic mower quoting, plus a second
"Incentives" tab that estimates grant/tax savings on robotic mowers and battery
tools (Quebec, Ontario, federal). No API keys, no backend — every request goes
straight from the browser to public APIs.

## Layout

```
src/app/          layout.tsx (metadata), page.tsx, globals.css
src/components/
  AppTabs.tsx                tab bar (Acreage | Incentives); tab lives in the URL hash
  GolfCourseCalculator.tsx   top-level state, orchestrates fetch → measure
  GolfMap.tsx                Leaflet map; client-only (dynamic import, ssr: false)
  MeasurePanel.tsx           results panel + legend
  SearchBox.tsx              Photon geocoder autocomplete
  IncentivesTab.tsx          bilingual FR/EN incentive checker UI (client-only)
src/lib/
  overpass.ts   builds the Overpass QL query, fails over across 3 mirrors
  area.ts       OSM → GeoJSON → categorize → clip → acres  (the core logic)
  types.ts      BBox, CourseMeasurement
  incentives.ts program rules, FR/EN copy and savings math (pure, tested)
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
  `src/lib/incentives.ts` reflect research as of Oct 9, 2026; the "as of" date
  appears in the copy (`eyebrow`, `sumFoot`). Update both when the data changes.
  Customer-facing copy uses Quebec French and no em dashes. Keep the
  "not tax advice" disclaimer; only "ok" (in force) items count toward the low
  end of the range.
- **React 19 rules apply**: no reading/writing refs during render and no
  synchronous setState in effect bodies (the lint config enforces both).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type check + production build
npm run lint
npm test         # vitest: acreage pipeline + incentive math
```
