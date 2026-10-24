# Calculator

The app is called **Calculator** (calculator.prodig-e.com). "Kress" only
names the mower product (Kress Voyager, KR800/KR804); don't use it as the
app's brand.

Next.js 16 App Router + React 19 + TypeScript + Tailwind. Measures golf course
turf acreage from OpenStreetMap (or satellite land cover when a course isn't
mapped in detail), a sod farm's fields from Agriculture Canada's crop map and
a residential lawn (Quebec cadastre lot minus buildings), for robotic mower
quoting, plus an
"Incentives" tab that estimates grant/tax savings on robotic mowers and battery
tools (Quebec, Ontario, federal) and an "ROI" tab comparing a Kress
Voyager with a zero-turn crew. Every tab is in English (default) and Quebec
French, with light and dark themes. The tabs are connected (measured acres →
ROI sizing; the Incentives profile → ROI's net investment) and every tab has a
share link and a client PDF. The kind of property (course, farm or
lot) is detected from where the rep taps or what they search, and one engine
(aerial photos and LiDAR) measures all three. Every measurement gets a mower
fit: how hard the property is for a robot and which Kress model fits. No API keys and no
database: seven small route handlers (Overpass cache, land cover, LiDAR terrain,
aerial photo surfaces, Quebec cadastre lot, gas price, client error log) run on
Vercel; everything
else goes straight from the browser to public APIs (built-in `fetch`).

## Layout

```
src/app/          layout.tsx (metadata, theme boot script), page.tsx, error.tsx,
                  not-found.tsx, globals.css (theme color variables), boot.css
  api/overpass/   cached Overpass lookup (CDN 1 day, hedged mirror requests,
                  Server-Timing per mirror); the browser races it with the mirrors
  api/landcover/  satellite land cover as a small class grid (CDN 30 days):
                  ESA WorldCover (src=worldcover) or AAFC crop inventory (src=aci)
  api/terrain/    slope and cover (ground, low plants, trees, buildings) from
                  NRCan's HRDEM LiDAR as a small lat/lon grid (CDN 30 days)
  api/surface/    what covers a property (grass, trees, buildings, paving,
                  water) from Quebec's aerial photos and the LiDAR, as a class
                  grid (CDN 30 days): 20 cm on a lot, 85 cm on a course
  api/parcel/     the Quebec cadastre lot at a point (CDN 1 week), for lawns
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
  GolfCourseCalculator.tsx   top-level state: detects the property at a tap or
                             a search (selectProperty), orchestrates fetch →
                             measure, the photo / satellite count, sod
                             detection and tracing
  GolfMap.tsx                Leaflet map; client-only (dynamic import, ssr: false)
  LiveSteps.tsx              the measurement loading live: each source being
                             read, for how long, and what it found
  MeasurePanel.tsx           results panel + legend; "Select a property" until
                             something is measured, then the detected kind with
                             a Change switch (Golf course | Sod farm | Lawn)
  MowerFit.tsx               mower fit card (score, reasons, mowing frequency,
                             recommended Kress model and units); useMowerFit()
                             for the panel, PDF and Send to ROI
  QuoteSection.tsx           acres for the quote: categories, % rough (or %
                             satellite grass, or % sod), override, Send to ROI,
                             PDF report, Copy link
  AcreageReport.tsx          print-only Acreage PDF (replaces the map in print)
  SearchBox.tsx              Photon geocoder autocomplete
  IncentivesTab.tsx          incentive checker UI (client-only)
  RoiTab.tsx                 Voyager ROI calculator UI, printable
src/lib/
  overpass.ts   builds the Overpass QL query; cache route, raced by 3 mirrors
  area.ts       OSM → GeoJSON → categorize → clip → acres  (the core logic)
  landcover.ts  land cover grids: grass inside an outline, sod fields, traced
                shapes (pure, tested)
  landcover-server.ts  WorldCover COG reader + crop inventory exportImage (route only)
  lawn.ts       residential lawn: lot − OSM/LiDAR buildings, pools, paving − traced
                areas, in sq ft (pure, tested)
  terrain.ts    EPSG:3979 projection, slope, cover classes, stats under a shape,
                LiDAR building outlines (pure, tested)
  terrain-server.ts  minimal BigTIFF tile reader for the HRDEM COGs (route only)
  site.ts       lawn shape (parts, passages, islands, edges) and the complexity
                score; site builders for lawn, golf, sod (pure, tested)
  coverage.ts   how a robot works an area: stripes per zone (turns, broken runs,
                edge laps), trees to go around, driving from the charger and
                between zones, against a square of the same area; one unit's
                share when several split it (pure, tested)
  mowers.ts     the 12 Kress models quoted and the fit / recommendation (pure, tested)
  surface.ts    the measuring engine: aerial photo pixels + LiDAR → grass,
                trees, buildings, paving, water; cover inside an outline, pools
                and paving on a lot (pure, tested)
  detect.ts     what a point is: house lot, sod farm or golf course (pure, tested)
  live.ts       what's loading, source by source, for the live list and map (pure, tested)
  surface-server.ts  MRNF photo tiles (jpeg-js) + LiDAR cover for /api/surface (route only)
  parcel.ts     Quebec cadastre lot lookup and parsing (pure parts tested)
  types.ts      BBox, CourseMeasurement, SatelliteTurf, SodField, SodMeasurement
  incentives.ts program rules, FR/EN copy and savings math (pure, tested)
  roi.ts        Voyager ROI model sized from acreage, formatting (pure, tested)
  roi-copy.ts   ROI tab copy, FR and EN, incl. "as of" source for each default
  quote.ts      measurement → acres for the quote, share params (pure, tested)
  quote-store.ts  client store shared by the tabs (useSyncExternalStore)
  share.ts      share-link helpers + polylines (pure, tested); keys r_ / i_ / q_ /
                v, m, b, n, a, o, sf, sx, lp, lo, lx, ld, lk, ch
  gas.ts        StatCan gas price parsing (pure, tested)
  report-error.ts  sendBeacon to /api/log
  tabs.ts       goToTab() for in-app navigation
  i18n.ts       EN/FR copy for the tab bar, Acreage tab, search, error page
  preferences.ts       useLang / useTheme / setLang / setTheme (client)
  preferences-boot.ts  storage keys + inline script that applies them pre-paint
src/types/      ambient module declarations for untyped deps
scripts/calibrate-satellite-turf.py  recomputes TURF_PER_GRASS / TURF_RANGE from
                fully mapped OSM courses (Python: pyarrow, shapely, rasterio)
```

## Things to know

- **`src/lib/area.ts` is where the real logic lives.** Categorization, clipping
  trees/buildings to the course boundary, and the rough estimate all happen in
  `processOverpassData`. It is pure — input is Overpass JSON, output is a
  `CourseMeasurement` — so it can be exercised without a browser.
- **Rough is deliberately conservative.** When rough isn't mapped, it's estimated
  from the boundary minus everything else; when a course has *only* a boundary
  and no detail, it reports `boundaryOnly` rather than estimating. Don't "fix"
  that into "boundary minus nothing" — it would silently inflate quotes. Mapped
  rough is counted net of what's drawn over it (`netAcres`: fairways, greens,
  tees, bunkers, water, woods, buildings), since mappers often draw rough under
  everything and the plain sum overcounted rough by 50%.
- **The kind of property is detected, not picked.** A tap (or "Select a
  property", or a search that isn't a golf course) runs `selectProperty`: the
  cadastre lot, the crop map around the point and the Overpass lawn lookup
  (which also holds the golf course around the point, `is_in`) start at once.
  `detect.ts` decides: a lot under `HOUSE_LOT_M2` (5,000 m²) is a lawn without
  waiting for the rest; else sod when `SOD_SHARE` (30 %) of the crop map within
  `SOD_LOOK_M` is sod, a golf course when an OSM course outline holds the
  point, else a lawn (a big lot). A search Photon calls a golf course measures
  the course directly. "Trace the property" sorts a traced shape the same way
  (lawn under 5,000 m², sod when the crop map says so, else a course outline).
  The panel says what was detected; Change switches by hand (`chosen`), and
  each kind's own buttons then stay in that kind. Links still carry `a=`.
- **One engine measures every kind.** `surface.ts` classifies the MRNF photos
  with the LiDAR (see the lawn notes for the photos and the colour rules): a
  lot at 20 cm (zoom 19), a course at about 85 cm (17), a farm coarser, within
  `MAX_PIXELS` (4 M) and 0.04° a side; the LiDAR is read at 2 m or finer so
  roofs and crowns stay apart. Canopy patches of `WOODS_M2` (1,000 m²) or more
  are woods; smaller ones are single trees over grass, counted as grass. Water
  is clear blue (pools) or ground the LiDAR reads dead flat over 200 m²
  (ponds: the ground model is flattened over water, and dark water reads as
  shade in the photos). Paving must be grey (G − B under 8) or bright (sand,
  concrete): on courses, summer-dried rough and ranges aren't green but stay
  yellow, and the plain "not green" rule took 24 % of Memphrémagog's rough.
- **Outline-only courses count the grass seen instead.** For `boundaryOnly`
  (or an outline traced by hand, `outlineTraced`), the calculator measures the
  outline on the photos in Quebec (`photoTurf`, `source: "photos"`): grass
  seen × `PHOTO_TURF_PER_GRASS` (0.66), likely range `PHOTO_TURF_RANGE`
  (0.82–1.39×), from the 4 fully mapped Quebec courses (Mont-Cascades,
  Memphrémagog, Milby, 9Chatel: turf was 54-92 % of the grass seen; Château
  Bromont was left out, most of its rough isn't mapped). Outside Quebec, or
  where under 90 % of the outline has photos, it reads ESA
  WorldCover inside the outline (`satelliteTurf` in `landcover.ts`); class 30
  (grassland) is the grass seen, and `estimatedTurf` takes `TURF_PER_GRASS`
  (0.59) of it, with `TURF_RANGE` (0.79–1.26×) as the likely range. Those are
  calibrated on the 45 fully mapped OSM courses in ON/QC/nearby states
  (`scripts/calibrate-satellite-turf.py`, left-one-out median error 16%); raw
  grass overstated turf by 60%+. Don't quote raw grass again. The quote takes
  `grassPct` (80% default) of the estimated turf. If WorldCover fails, the
  quote still needs an override. WorldCover is 2021 v200 on AWS with no CORS,
  so it goes through `/api/landcover`. Tested and not worth it: Meta's 1 m
  canopy height, Sentinel-2 seasonal NDVI and hole counts didn't beat this.
- **Sod farms are a mode of the Acreage tab** (`mode` in quote-store, `a=sod`
  in links). Fields come from AAFC's Annual Crop Inventory, class 192 (Sod),
  via ArcGIS `exportImage` resampled to a 15 m lat/lon grid; `ACI_YEARS` in
  `landcover-server.ts` lists years newest first (add the next one when AAFC
  publishes it, usually the following spring). `findSodFields` fills enclosed
  gaps under 1 ac and drops specks under 1 ac; acres come from the cells, the
  outline (d3-contour) is for display. Tapping a field toggles `included`;
  traced fields are measured with turf. The quote takes `sodPct` (90% default)
  of the included fields. In Quebec, detected fields are then measured on the
  photos (`measureSodOnPhotos`: the field's grass and bare ground, without the
  roads, hedgerows, buildings and water the 30 m map takes in; `sod.photos`).
  Switching modes clears the results, name and override.
- **Residential lawns are the third mode** (`a=lawn`), in **square feet only**
  (`formatSqft`), with no ROI (`acresForQuote` returns null: the ROI tab is
  commercial). The lot comes from the Quebec cadastre allégé at a point
  (`/api/parcel` → the environment ministry's ArcGIS layer; indicative only, not
  a survey), or is traced (Ontario has no open parcels). OSM buildings, pools,
  parking (incl. multipolygons and spaces), paved areas and `highway=service`
  lines (driveways, parking aisles, widened by `stripAlong` to their width tag
  or a typical width) on the lot are removed automatically (Overpass
  `kind: "lawn"`), as Buildings or Paving. OSM misses most houses in some
  Quebec suburbs (Microsoft footprints there aren't reachable), so buildings
  the HRDEM LiDAR sees come off too (`lawn.lidar`, see Terrain below). OSM
  also misses most residential driveways (1-30% mapped), so the rep traces
  them: Remove a
  driveway is a centre line (2+ taps) at 11/20/29 ft (1/2/3 cars), kept as
  path + width so links (`ld`) rebuild it exactly; Remove an area is a
  polygon. Pools and paving OSM misses come from Quebec's aerial photos
  (`lawn.imagery`, `surface.ts`): the MRNF forest-inventory mosaic
  (`Inventaire_Ecoforestier` WMTS, CC BY 4.0, summer, about 20 cm, zoom 19),
  the only Quebec imagery whose licence allows it. Don't switch to
  `Imagerie_GQ` (its service isn't for outside use) or Esri (its terms forbid
  automated extraction). Clearly blue is a pool. Paving is open ground that
  isn't green: the LiDAR rules out only crowns and roofs (photo and LiDAR years
  differ, so cars and hedges in the LiDAR stay candidates). Grass is told from
  grey per scene by Otsu on G / (R+G+B), clamped to 0.335-0.37 (a fixed split
  removed shaded lawns in Boucherville), and the darkest 15 % (at most 50) is
  shade, left as lawn (a higher cap dropped dark asphalt in Carignan). The rep
  taps a misread area to keep it (`lawn.kept`, points, link `lk`).
  `lawnTotals` counts every removal once.
  Trees aren't removed. A cadastre lot is framed above the results panel.
  Streets are cadastre lots too and a geocoded address can land on the road,
  so `lotLooksOdd` (over 5,000 m², or a strip with compactness under 0.2)
  warns the rep to tap the house itself.
- **Overpass is the slow step, and only from Vercel.** The mirrors queue
  Vercel's shared server addresses: 27-33 s per lookup measured on the preview,
  even for one house lot, while the cadastre, WorldCover and crop map answer in
  about 1 s. So `fetchFairways` asks the cache route, and if it hasn't started
  answering within `DIRECT_AFTER_MS` (1.5 s; a CDN hit starts in well under a
  second) the browser also asks the mirrors from its own address; the first
  answer wins and the route still finishes to fill the cache. Don't make the
  browser wait on the route again. Lawn mode looks up buildings `aroundPoint`
  (100 m) while the cadastre lot loads, and again on the lot's box only when
  the lot is bigger. The route's Server-Timing header shows each mirror's
  result and time.
- **Mower fit is capability, then outlay.** `site.ts` scores the property
  (1-3 points per difficulty; 0-2 simple, 3-5 moderate, 6+ complex) and
  `mowers.ts` ranks the 12 Kress models quoted (KR161/172/173/174,
  KR272/276, KR282/284/286, KR238, KR800/804; keep to that list unless told
  otherwise): fits first (slope limit), then fewest penalties (no camera
  under trees, no 4x4 on slopes, no ZeroTrim on edgy lawns, no obstacle
  avoidance among buildings, beds and trees, passages, each extra unit), then
  `listUsd × units`. `listUsd` is a rough order only, never shown: prices
  conflict between sources. Slope limits are the dealer's rule, not Kress's
  listings: only the EyePilot 4x4 (KR282/284/286) take slopes over 20°
  (36 %), up to 84 %; every other model stops at 36 % (KR804 47 %). Ground
  past a robot's limit rules it out past 2 % of the area or `TRIMMER_M2`
  (250 m²), whichever is less: on a big property 2 % is acres. Ground past
  84 % (40°) is left to a trimmer (`trimmerShare`, a notice) and the 4x4 is
  sized for the rest, rather than recommending nothing.
  Every site gets as many units as it takes (each with its own zone and
  charger): one if it keeps up, else the fewest that each stay under 90 % of
  their capacity (`LIMIT_LOAD`; Voyager fleets fill to 100 % like the ROI
  tab's). A robot's capacity is its rating (every 48 h) × the mowing
  frequency / 2: `QuoteSettings.mowEvery` is 1, 2 (default) or 3 days, picked
  in the card (lawns, and golf when fairways are quoted), kept in links as
  `q_every`; Voyagers follow the ROI tab's defaults whatever it says. A lawn
  gets home robots only; commercial models join only past three of the
  biggest (`MAX_LAWN_UNITS`), so a steep 3-acre lot gets 2 × KR286, never a
  KR238. The area a unit must keep up with is its zone's area × the layout's
  extra time for that robot (`coverage.ts` `overhead` on `share(c, units)`:
  stripes in each zone's best direction, turns, hops around broken stripes,
  edge laps, trees, driving to and from the charger every charge and between
  zones, around buildings on a lot), relative to a square of the same area
  with the charger at its edge (what a rated area assumes). `share` scales
  lengths by 1/√units and areas by 1/units, so a big property's long drives
  shrink with more units. Trees are counted from the LiDAR crowns on the
  mowed area (`terrainStats.trees`: each crown patch one tree, or one per
  `CROWN_M2` 120 m² where crowns run together, which matched local height
  maxima within 5-30 % in forest and streets); each costs the stripes it cuts
  and a lap around a 1 m trunk (`TRUNK_M`), and is listed with that time in
  the score. The charger
  is estimated (next to the house; the middle of the biggest area on a course
  or farm) unless the rep places it (store `charger`, link `ch`). Golf with
  fairways is two jobs (the KR238 on the fairways, the best robot on the
  rest). Voyager units use the ROI tab's defaults (`capacityM2`), and Send to
  ROI passes the Voyager size (`roiModel`). Specs are dated (`MOWERS_AS_OF`,
  in the copy); `passageM`, `speedMS`, `turnS` and most `runtimeMin` are
  estimates (Kress publishes none). Update both when Kress changes the lineup.
- **Terrain is HRDEM LiDAR, read sparingly.** geotiff.js would load each 500 km
  file's whole tile index (15 MB), so `terrain-server.ts` parses the BigTIFF
  header once per instance and range-reads only the index entries and LZW
  tiles under the box (decoded with geotiff's `getDecoder`). Slope is smoothed
  over 3 × 3 cells (1 m LiDAR noise reads as 10-20 %); under trees and low
  plants, where the DTM is interpolated, it's a plane fitted over about 9 m
  (`CANOPY_SLOPE_M`). Every cell counts, wooded or not: reading open ground
  only called a wooded mountain lot "about 20 %" and recommended a KR238
  (the route's `v=2` param skips grids the CDN cached before). Steep shares
  only count patches of 8 m² or more. Roofs are smooth, crowns rough
  (`coverClasses`, 1-2 m cells only); a smooth patch over 18 m
  (`MAX_BUILDING_M`) is a forest canopy, not a roof (Mont Saint-Bruno's reads
  smooth at 20-28 m and came out as buildings). LiDAR buildings are
  straightened (Douglas-Peucker, ¾ cell) and taken off a lawn unless an OSM building
  already covers 30 % of one. `lawn.lidar` is undefined while loading, null
  where there's no LiDAR, [] when it found none: the "no building" notice only
  shows once both OSM and the LiDAR have answered and found nothing. Don't drop
  the smoothing, the plane fit under trees or the patch filter: flat lawns
  then read as steep and get a 4x4.
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
  override, and never quotes a boundary-only course from its outline: only its
  satellite grass count, else an override. `acresForQuote` picks the golf or sod
  basis for the ROI tab and the PDF.
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
  (`fade-up`, `fade-in`, `scale-in`, `tab-in`, `pop`, `sheen`, `spin-slow`,
  `scan`); `ui.enter` + `delay(n)` for staggered entrances, `<Pop value>` for
  numbers that recalculate, `<Loader>` only for the map's first load.
- **Measurements load live, never behind a spinner.** Every lookup is tracked
  per run (`track(source, id, area)` in the calculator, `live.ts`): the cadastre
  lot, the crop map, OpenStreetMap, the LiDAR, the aerial photos and the
  satellite land cover. `LiveSteps` lists them in the panel (what each is
  reading, its seconds, then what it found, `LiveFinding`) and lingers
  `LIVE_LINGER_MS` after the last answer; the map sweeps each active source's
  area (`live-scan`, sky blue `--live` in globals.css) and pulses the point
  tapped while the property is found (`live-ping`). Results fill in as each
  source answers (the lot outline first). A new lookup gets a `track` call
  with its area; don't add spinners or "Loading…" notices. Theme and language switches
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
  (1 page; mapped course, satellite count or sod farm), Incentives the profile and results (about 2 pages, form hidden),
  ROI one Letter page (printed at 80%, inputs as "label … value", sources full
  width). Check page counts with print emulation after layout changes.
- **Share links** put a tab's inputs in the query string (`share.ts`); tabs read
  them once on load. Keep new inputs in the link, with the tab's prefix.
  Traced shapes travel as encoded polylines (5 decimals), and traced points are
  rounded to the same precision when the trace ends so a reopened link
  measures the same shape. Detected sod fields left out are stored as a point
  inside each (`sx`), not by index.
- **React 19 rules apply**: no reading/writing refs during render and no
  synchronous setState in effect bodies (the lint config enforces both).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type check + production build
npm run lint
npm test         # vitest: acreage pipeline, land cover, terrain, mower fit, quote, incentives, ROI model, share links
```
