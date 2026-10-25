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
tools (Quebec, Ontario, federal) and an "ROI" tab comparing Kress robots
(KR238s that cut and stay, or Voyagers that cut and go) with a zero-turn crew. Every tab is in English (default) and Quebec
French, with light and dark themes. The tabs are connected (measured acres →
ROI sizing; the Incentives profile → ROI's net investment) and every tab has a
share link and a client PDF. The kind of property (course, farm or
lot) is detected from where the rep taps or what they search, and one engine
(aerial photos and LiDAR) measures all three. Every measurement gets a mower
fit: how hard the property is for a robot and which Kress model fits. A
"grass run" plans a crew's day of cut-and-go stops (several addresses, each
measured like a lawn) in the order with the least driving, routed on
OpenStreetMap's roads. No API keys and no
database: seven small route handlers (Overpass cache, land cover, LiDAR terrain,
aerial photo surfaces, Quebec cadastre lot, gas price, client error log) run on
Vercel; everything
else goes straight from the browser to public APIs (built-in `fetch`).

## Layout

```
src/app/          layout.tsx (metadata, theme boot script), page.tsx, error.tsx,
                  not-found.tsx, globals.css (theme color variables), boot.css
  api/overpass/   cached Overpass lookup (CDN 1 day, hedged mirror requests,
                  Server-Timing per mirror); the browser races it with the mirrors.
                  Kinds (q=): golf, lawn, and a grass run's roads / streets
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
  ui.tsx                     shared TabHeader, SectionTitle, Notice, Loader, Pop,
                             Segmented; re-exports the style classes
  styles.ts                  the `ui.*` class strings and `delay()` alone (the
                             error and 404 pages import these, not ui.tsx)
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
  Sheet.tsx                  the panel over the map as a sheet the rep sizes
                             (drag or arrow keys on its handle, tap to fold)
  WindowPicker.tsx           "When may the robots mow?" (any time, nights,
                             weekdays, custom), in the mower fit and ROI tab
  Sources.tsx                "Where these numbers come from": each assumption
                             with its kind, folded in the panel, page 2 of the PDF
  MeasurePanel.tsx           results panel + legend; "Select a property" until
                             something is measured, then the detected kind with
                             a Change switch (Golf course | Sod farm | Lawn)
  MowerFit.tsx               mower fit card (score, reasons, mowing frequency,
                             recommended Kress model and units); useMowerFit()
                             for the panel, PDF and Send to ROI
  QuoteSection.tsx           acres for the quote: categories, % rough (or %
                             satellite grass, or % sod), override, Send to ROI,
                             PDF report, Copy link
  RunPanel.tsx               grass run panel (stops, shop, Voyager, crew, the
                             day, a sheet of addresses to import); useRunPlan()
                             for the panel, map and PDF
  AcreageReport.tsx          print-only Acreage PDF (replaces the map in print),
                             or the grass run's run sheet
  SearchBox.tsx              Photon geocoder autocomplete
  IncentivesTab.tsx          incentive checker UI (client-only)
  RoiTab.tsx                 ROI calculator UI (cut and stay KR238 or cut and
                             go Voyager, mowing every 1-3 days), printable
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
  window.ts     when the robots may mow → share of a robot's capacity (pure, tested)
  trust.ts      likely ranges (acres, from calibration or installs), the
                client's number against ours, the assumptions list (pure, tested)
  records-store.ts  field-check calibration and installs' spread from
                /api/records (empty without a database: estimates are used)
  surface.ts    the measuring engine: aerial photo pixels + LiDAR → grass,
                trees, buildings, paving, water; cover inside an outline, pools
                and paving on a lot (pure, tested)
  detect.ts     what a point is: house lot, sod farm or golf course (pure, tested)
  live.ts       what's loading, source by source, for the live list and map (pure, tested)
  surface-server.ts  MRNF photo tiles (jpeg-js) + LiDAR cover for /api/surface (route only)
  parcel.ts     Quebec cadastre lot lookup and parsing (pure parts tested)
  types.ts      BBox, CourseMeasurement, SatelliteTurf, SodField, SodMeasurement
  incentives.ts program rules, FR/EN copy and savings math (pure, tested)
  roi.ts        ROI model (KR238 or Voyager fleet) sized from acreage and
                mowing frequency, formatting (pure, tested)
  roi-copy.ts   ROI tab copy, FR and EN, incl. "as of" source for each default
  quote.ts      measurement → acres for the quote, share params (pure, tested)
  quote-store.ts  client store shared by the tabs (useSyncExternalStore)
  run.ts        grass run: a stop's mowing vs trimming and blowing, driving,
                the order with the least driving, the day, links (pure, tested)
  run-store.ts  the grass run being planned: stops measured a few at a time,
                then the roads between them loaded and routed
  roads.ts      OpenStreetMap roads → a graph; fastest legs (Dijkstra) with
                their path, km and streets; the Overpass boxes (pure, tested)
  addresses.ts  a sheet of addresses (.xlsx read as a zip, or CSV) → address
                columns by header (EN/FR) → Photon in Quebec (pure parts tested)
  lot-lookups.ts  lookAround (lot, OSM, LiDAR at a point) and measureLot (a
                lawn filled in source by source), for the lawn mode and runs
  share.ts      share-link helpers + polylines (pure, tested); keys r_ / i_ / q_ /
                v, m, b, n, a, o, sf, sx, lp, lo, lx, ld, lk, ch; a run's a=run,
                rs, rn, rh, rhn, rv, rc, rk, ru, rt
  gas.ts        StatCan gas price parsing (pure, tested)
  report-error.ts  sendBeacon to /api/log
  tabs.ts       goToTab() for in-app navigation
  i18n.ts       EN/FR copy for the tab bar, Acreage tab (grass run included), search
  i18n-pages.ts EN/FR copy for the error and 404 pages, kept apart: Next loads
                both boundaries with every page, and each would bundle i18n.ts
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
  frequency / 2: `QuoteSettings.mowEvery` is 1, 2 (default) or 3 days, asked
  in the card for every property ("How often do you want to mow?"), kept in
  links as `q_every`. A Voyager's is its acres per charge × 5 charges a week
  (the ROI tab's default) shared among the week's mowings (× days / 7). A lawn
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
  or farm) unless the rep places it (store `charger`, link `ch`). A golf
  course asks "Cut and stay or cut and go?" (`recommendBoth`, store
  `approach`, link `q_how`): cut and stay is KR238s living on the course,
  cut and go Voyagers (KR800/KR804) the crew brings; each option shows its
  fleet, and cut and stay is suggested whenever the KR238 can mow it all
  (it's made to stay on a course). Golf with fairways is two jobs (the KR238
  on the fairways either way, the chosen approach on the rest). A sod farm
  is cut and go. Send to ROI passes the approach, the frequency, the
  Voyager size (`roiModel`, the cut-and-go one on a course) and the layout's
  extra time (`layoutPct`, never below 0), so the ROI tab sizes the same
  fleet (it can differ by a unit where the layout reads quicker than a
  square: the ROI tab never counts that). Specs are dated (`MOWERS_AS_OF`,
  in the copy); `passageM`, `speedMS`, `turnS` and most `runtimeMin` are
  estimates (Kress publishes none). Update both when Kress changes the lineup.
- **A grass run is a day of cut-and-go stops.** "Plan a grass run" (or "Add
  to a grass run" on a measured lawn) opens `RunPanel` in the results panel's
  place; while it's open, a search or a tap adds a stop (or sets the shop,
  `pickingShop`) instead of selecting a property, and the map shows numbered
  stops, the shop and the route. "Import addresses (Excel or CSV)" adds a
  sheet's addresses as stops (`importAddresses`, `addresses.ts`): an .xlsx
  is read as a zip (DecompressionStream, no spreadsheet library) and its
  first visible sheet's XML parsed; a CSV may use commas, semicolons (French
  Excel) or tabs, in UTF-8 or Windows-1252. Columns are found by their
  headers in English or French (address, or number and street; city,
  province, postal code; name or client), else each row's first cell that
  starts with a civic number. Each address is placed with Photon in Quebec,
  a house first (`layer=house`), else the street, flagged `onStreet` when the
  house number isn't the one asked; the summary lists the rows not found.
  An old .xls (binary) isn't read: the rep saves it as .xlsx or .csv. Each stop is measured like a lawn
  (`measureLot` in `lot-lookups.ts`: cadastre lot, OSM, LiDAR buildings,
  photo pools and paving), `AT_ONCE` (2) at a time since the Overpass mirrors
  limit each address, each with its own live list and map sweep. At a stop
  the crew parks and unloads (`setupMin`), the Voyager mows (the mower fit's
  full-mow time, `overhead(...).hours`, one unit however big the lawn) while
  the crew trims every lawn edge (`perimeterM`) at `TRIM_FT_PER_H` (1,500 ft
  an hour a person) plus the LiDAR trees at 60 an hour, and blows a 3 ft
  strip along the edges shared with paving (`lawnEdges`) at 25,000 sq ft an
  hour (SingleOps production rates), shared among the crew: the stop takes
  set-up plus the longer of the two, and the panel says who waits for whom.
  The rep puts in the crew's own rates ("Your crew's rates": `trimFtPerH`,
  `blowSqftPerH`, links `rtr`, `rbr`). "Today against the Voyager" plans the
  same stops and route with the crew mowing too (`todayDay`: one person mows
  with the crew's mower, `crewMower`/`rm`, while the rest trim and blow;
  alone, one does all three), at `crewMowSqftPerH` (deck × mph × 50 % ÷ 8.25,
  the field-capacity formula, or the rep's `mowSqftPerH`/`rmr`), and says
  lawns per 8 h day and per week (`lawnsPerDay`) both ways.
  Driving is on OpenStreetMap's roads, routed in the browser (`roads.ts`):
  public routing servers (OSRM's demo, FOSSGIS) aren't for commercial use and
  the app takes no API keys, so don't call them from here. Once no stop is
  still being measured, `run-store` reads Overpass `streets` (every drivable
  street in a 0.03° box around each place, neighbourhoods merged while they
  fit 0.05°, so a run in one part of town is one lookup) and, only to join
  several neighbourhoods, `roads` (motorway down to unclassified, over the
  run's box + 0.02°), all on a 0.01° grid so the cache route and nearby runs
  share them, two at a time (the mirrors turn away an address asking
  several: on production the main-road lookup failed while the streets
  loaded, and every leg fell back to the straight line). It routes on
  whatever answered (`missed` when some didn't, retried once on its own
  after 3 s), and builds the graph (one-way streets,
  roundabouts, motorways; about 80 % of `maxspeed`, else `TYPICAL_KMH`). Each
  place meets the biggest connected piece at a point on a road segment
  (`snapPlace`), not a node: the segment nearest its cadastre lot within
  400 m, the address's street first (`streetOf`, `sameStreet`, within
  150 m), and its leg ends at the lot's edge facing that road. Snapping to
  the nearest node sent a leg across the neighbours' yards to the street
  behind, where a long straight street had no node near the lot. Dijkstra
  runs from each place in turn, off its segment both ways the road allows
  (pausing between, so the page stays responsive).
  Each leg keeps its path, km and up to three street names (`via`). The road
  lookup is a live step ("Road map") swept on the map. Where the roads don't
  join two places, or don't load, or the neighbourhoods span over 0.3°, that
  leg is the straight line × `ROAD_FACTOR` (1.3) at the set speed (`DriveFn`
  `straightDrive`), and the speed input and a notice saying why only show
  then (`straightLegs`). Legs routed before stay while more load. The order is the
  least driving (exact Held-Karp up to 12 stops, else nearest neighbour +
  2-opt), from the shop and back when there is one; time on site doesn't
  depend on it, so `runOrder` is worked out once per change and shared by
  every Voyager and crew choice (`useRunPlan` keeps the last plan, with each
  leg and the route, for the panel, map and PDF). "Directions in Google Maps"
  (`directionsLinks`) is a link out with the stops in order, up to 9 between
  per part; nothing is fetched from Google. The day
  warns past 8 h or past one charge's acres (`VOYAGER_PRESETS`). The run
  stays in `run-store` when closed; links carry `a=run` and its `r*` keys
  (stops as a polyline, names `|`-separated) and re-measure on open.
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
- **The panel over the map is a sheet the rep sizes** (`Sheet.tsx`, both the
  results and the grass run panel): it fits its content up to 70 % of the
  screen until its handle is dragged (or moved with the arrow keys), folds
  to its title row on a tap, and keeps that height across panels. On a phone
  it otherwise covered the map the rep taps. `fitAbovePanel` frames the map
  above whatever height it has.
- **Every number says how sure it is.** The client's own acreage (`override`,
  "Client's acreage") replaces ours, and the panel shows ours beside it with
  whether theirs falls in our likely range (`trust.ts` `compareClient`). The
  likely range is the photo or satellite count's calibrated range, or, once
  a basis has `MIN_RECORD` (5) installs, the 10th-90th percentile of what
  installs measured over ours (`RecordSpread`); mapped OSM turf has none
  until then (don't invent one). The fleet is sized at both ends of the
  range (`unitsAt` in MowerFit) and the ROI tab shows payback across it
  (`RoiImport.range`, link `r_range`). Every assumption is listed with its
  kind (measured, Kress rating, estimate, client, rule) in "Where these
  numbers come from" and on page 2 of the Acreage PDF, so the Acreage PDF is
  now 2 pages (the grass run sheet stays 1). The ROI PDF lists the inputs
  the client changed from our defaults (`CLIENT_KEYS`).
- **When the robots may mow sizes the fleet.** `QuoteSettings.window`
  (`q_win=20-7-7`, from-to-days; null any time) and the ROI tab's own
  (`r_win`): `window.ts` takes Kress's ratings as round-the-clock (an
  assumption), each window starting on a full battery, then runs and charges
  in turn (`CHARGE_PER_RUN` 1, an estimate); a Voyager loses what its day is
  shorter than its run time, and days past the crew's. Nights only (8 pm to
  7 am) leaves a KR238 54 % of its rating: 60 acres every 2 days goes from 4
  to 7 KR238s. Fit functions take `FitOptions` ({ window, calibration }).
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
  acres and how often they're mowed (every 1, 2 or 3 days, `r_every`; older
  links' mowings per week map to the nearest): zero-turn crew in full-time
  equivalents (paid for the share of their shifts the mowing takes) on whole
  machines, versus whole robots (`r_how`): cut and stay is KR238s at their
  48 h rating × days / 2, filled to 90 % when there are several
  (`STAY_LOAD`, like the mower fit), with installation, electricity per acre
  (`KR238_KWH_PER_ACRE`, an estimate) and a weekly check; cut and go is
  Voyagers at their acres per charge, plus supervision time. Both take the
  layout's extra time (`layoutPct`). The robot side keeps its `voy` names.
  Existing zero-turns are either a purchase avoided or (already owned) their
  resale value; grants and the tax credit from the Incentives tab can reduce
  the robot investment (write-offs never do: they're timing). Don't go back to
  "one employee vs one Voyager": the handoff's figures are reproduced in
  `roi.test.ts` only as a formula regression with matching inputs.
- **ROI defaults are dated market data.** Gas (live from StatCan only once its
  month is at least `DEFAULT_GAS_PERIOD`, since StatCan lags; else the dated
  default; bump both together), the Hydro-Québec Tarif G rate (`HQ_RATE`,
  update each April 1), payroll rates (each January), Voyager and KR238
  prices and capacities (the KR238's US$39,999 dealer price is converted
  like the Voyager's; its installation, maintenance, checks and energy are
  estimates). Each default shows its source under the input (`asOf` in
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
  user-facing text needs both languages (incentives.ts, roi-copy.ts, i18n.ts,
  or i18n-pages.ts for the error and 404 pages, which must not import i18n.ts
  or ui.tsx: that put three copies of the app's text in every first load).
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
  (the report on page 1, mapped course, satellite count, sod farm or lawn,
  and its assumptions and sources on page 2; a grass run's sheet is 1 page), Incentives the profile and results (about 2 pages, form hidden),
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
npm test         # vitest: acreage pipeline, land cover, terrain, photos, detection, mower fit, coverage, quote, grass run, road routing, address sheets, incentives, ROI model, share links
```
