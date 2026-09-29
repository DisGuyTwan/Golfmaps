# Golf Course Acreage Calculator

Next.js 16 App Router + React 19 + TypeScript + Tailwind. Measures golf course
turf acreage from OpenStreetMap for robotic mower quoting, and shows a Kress
robot fleet on the map via the Kress Connect API.

OpenStreetMap/Overpass/Photon requests go straight from the browser to public
APIs with no keys. The only backend is `src/app/api/kress/*`, which exists
because the Kress OAuth client secret and user tokens must stay server-side.

## Layout

```
src/app/          layout.tsx (metadata), page.tsx, globals.css
src/components/
  GolfCourseCalculator.tsx   top-level state, orchestrates fetch → measure
  GolfMap.tsx                Leaflet map; client-only (dynamic import, ssr: false)
  MeasurePanel.tsx           results panel + legend
  SearchBox.tsx              Photon geocoder autocomplete
  FleetPanel.tsx             Kress fleet list; useKressFleet.ts holds its state
  KressRecommendation.tsx    unit suggestion shown after a measurement
src/app/api/kress/  OAuth (login/callback/logout/session) + read-only data routes
src/lib/kress/      Kress server client, OIDC, sealed cookies, shared types
src/lib/
  overpass.ts   builds the Overpass QL query, fails over across 3 mirrors
  area.ts       OSM → GeoJSON → categorize → clip → acres  (the core logic)
  types.ts      BBox, CourseMeasurement
  recommend.ts + kress-catalog.ts   unit sizing; catalog of models you sell
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
- **Kress integration is read-only on purpose.** It never calls the task,
  schedule, allocation or PATCH endpoints — those move real mowers at customer
  sites. Ask before adding any write call. The API version lives in one
  constant (`KRESS_API_VERSION` in `src/lib/kress/config.ts`); Kress marks the
  API early alpha, so re-read the docs before bumping it.
- **Never hardcode Kress secrets.** They come from env vars (see
  `.env.example`). Tokens live in AES-GCM sealed httpOnly cookies.
- **`src/lib/kress-catalog.ts` starts empty by design.** Don't invent model
  capacities or prices — a quote built on made-up specs is worse than none.
- **React 19 rules apply**: no reading/writing refs during render and no
  synchronous setState in effect bodies (the lint config enforces both).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type check + production build
npm run lint
npm test         # vitest: acreage pipeline + Kress client/geometry/recommender
```
