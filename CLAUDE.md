# Golf Course Acreage Calculator

Next.js 14 App Router + TypeScript + Tailwind. Measures golf course turf acreage
from OpenStreetMap for robotic mower quoting. No API keys, no backend — every
request goes straight from the browser to public APIs.

## Layout

```
src/app/          layout.tsx (metadata), page.tsx, globals.css
src/components/
  GolfCourseCalculator.tsx   top-level state, orchestrates fetch → measure
  GolfMap.tsx                Leaflet map; client-only (dynamic import, ssr: false)
  MeasurePanel.tsx           results panel + legend
  SearchBox.tsx              Photon geocoder autocomplete
src/lib/
  overpass.ts   builds the Overpass QL query, fails over across 3 mirrors
  area.ts       OSM → GeoJSON → categorize → clip → acres  (the core logic)
  types.ts      BBox, CourseMeasurement
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
- **No tests yet.** `src/lib/area.ts` is the first thing worth covering.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type check + production build
npm run lint
```
