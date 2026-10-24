# Calculator

Live at <https://calculator.prodig-e.com>.

A completely free web app for quoting robotic mower jobs. It has three tabs:
**Acreage**, **Incentives** and **ROI**. Search for a course (or pan to it), and it measures the turf acreage from OpenStreetMap — broken down by
fairway, green, tee and rough, net of trees, buildings and parking. When a
course isn't mapped in detail, it counts the grass inside its outline from
satellite land cover instead (or inside an outline you trace). Switch the
Acreage tab to **Sod farm** and it finds a sod producer's fields on Agriculture
Canada's yearly crop map, which you can edit by tapping fields out or tracing
new ones. Switch it to **Lawn**, type a residential address, and it measures the
lawn on that lot in square feet. Whatever it measures, **Mower fit** rates how
hard the property is for a robot (slope, trees, separate areas, narrow
passages, obstacles) and recommends the Kress model that fits it best.

No API keys. No Google Maps or Mapbox. Just free OpenStreetMap and Esri satellite
tiles, the public Overpass API, Photon for search, ESA WorldCover and
Agriculture Canada's Annual Crop Inventory for land cover, NRCan's HRDEM LiDAR
for slope and trees, and Statistics Canada for the gas price. Six small Vercel
functions cache course lookups, land cover, terrain, cadastre lots and the gas
price and collect client errors in the runtime logs.

The tabs work together: measure a course, choose what's actually mowed, and
**Send to ROI** sizes the zero-turn crew and the Voyager fleet for those acres;
the ROI tab prices grants and credits with the profile picked on the
Incentives tab. Every tab has a **Copy link** (its inputs go in the URL, so a
quote can be reopened or sent) and a **Print / PDF** for clients.

Every tab is in **English (default) and French**: the EN | FR switch at the top
right switches the whole app, including printouts and the 404 page. A sun/moon button switches between **light and dark
mode** (it follows the device setting until you pick one). Both choices are
remembered on the device. Printing always comes out light.

Incentives and ROI share the same dark-green header with a short
description and a **Print / PDF** button, so either tab can be saved as a PDF
and sent to a client. Both keep their key figures in a sticky bar at the bottom
(savings on Incentives; payback, ROI and profit per year on ROI).

The app opens on a full-screen boot sequence (aurora backdrop, a glass app
icon where a small mower lays stripes, the Calculator wordmark, status chips
and an iris reveal into the app; it plays in full, about 3 s, on every load)
and uses subtle motion throughout:
the tab underline and EN | FR pill slide, the sun and moon morph, the theme
spreads from the button in a circle, and numbers tick when they recalculate.
It all respects the device's reduced-motion setting, and printouts are never
animated.

## How it works

1. **Find the course** — type a course name or address in the search bar
   (autocomplete via [Photon](https://photon.komoot.io/)), or pan the map
   yourself. To restrict the query to part of a property, start a scan and tap
   two opposite corners of the area.
2. The app builds an [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API)
   query over that area and POSTs it to the Overpass API. It fetches the whole
   picture, not just fairways: the `leisure=golf_course` boundary, every `golf=*`
   feature, plus woods, water, buildings and parking. Three public mirrors are
   tried in turn, because the main instance is frequently overloaded
   (`src/lib/overpass.ts`).
3. The OSM response is converted to GeoJSON with
   [`osmtogeojson`](https://github.com/tyrasd/osmtogeojson) and each polygon is
   measured with [`@turf/area`](https://turfjs.org/docs/api/area), then converted
   to acres (`1 m² = 0.000247105 acres`).
4. **Trees, buildings and parking are subtracted** — but only the portion that
   actually falls inside the course boundary, clipped with `@turf/intersect`
   rather than subtracted wholesale (`src/lib/area.ts`).
5. Results are drawn on the map (layered course → rough → fairway → tee → green)
   and summarized in the side panel.
6. **Acres for the quote**: measured turf isn't all robot-mowed. Choose the
   categories (greens and tees are off by default: they're usually reel-mowed),
   the share of the rough actually mowed (80% by default) or type the acreage by
   hand, then Send to ROI, print the PDF report or copy a link that re-measures
   the same area with the same settings.

Lookups go through `/api/overpass` first, which Vercel's CDN caches for a day,
so a course measured once is instant. The mirrors queue Vercel's shared server
addresses for about half a minute, though, so if the route hasn't started
answering within 1.5 s (or fails) the browser also asks the mirrors from its
own address and takes whichever answer comes first; the route still finishes
and caches its answer for next time.

### How rough is handled

Rough is the number that matters most for a mowing quote and the one OSM maps
least often, so the app is deliberately careful about it:

- If rough polygons **are** mapped, it uses them, net of the fairways, greens,
  tees, bunkers, water, woods and buildings drawn over them. Mappers often draw
  rough as big polygons under everything else; summed as-is, that overcounts
  rough by 50% across 280 Ontario/Quebec courses.
- If they aren't, it **estimates**: course boundary minus fairways, greens, tees,
  driving range, water, bunkers, trees and buildings. The panel labels this
  figure as an estimate.
- If a course has **only a boundary** mapped and no fairways/greens/tees at all,
  it never uses "boundary minus nothing" (that would claim the entire property
  is rough and quietly inflate a quote). It counts the **satellite grass inside
  the outline** instead: see below.

### Courses that aren't mapped in detail

Many courses have only their outline in OpenStreetMap, and some aren't there at
all. For those, the app reads [ESA WorldCover](https://esa-worldcover.org/)
(10 m satellite land cover, 2021) inside the outline: the **grassland** cells
are painted green over the satellite image, and the panel shows grass, trees,
built and water separately. If the course isn't in OSM, **Trace the course
outline** (tap its corners on the satellite image) and the same count runs
inside your outline.

Satellite grass isn't all turf: it also takes in hay, meadows, native and buffer
areas on the property. So the app reports **estimated turf = 59% of the grass**,
with a likely range (0.79 to 1.26 times the estimate). That factor comes from
the 45 courses in Ontario, Quebec and the neighbouring states whose turf is
fully mapped in OSM: estimated this way, their turf comes out within 16% of
the mapped figure on median (left-one-out), versus a 60%+ overestimate when
the raw grass was used. It also matches GCSAA's 2021 median of 95 acres of
maintained turf per 18 holes (Parcours du Cerf, 36 holes: about 196 ac
estimated vs 190 ac by the per-hole average). `scripts/calibrate-satellite-turf.py`
recomputes the factor from the latest OSM data.

For the quote, estimated turf is counted at **80%** by default ("Turf mowed by
robot"): on fully mapped courses the category defaults come to 81% of the
turf. The share and a manual override stay editable.

WorldCover is read through `/api/landcover?src=worldcover` (the bucket sends no
CORS headers), which stitches the 3° tiles and keeps each window on the CDN for
30 days (`src/lib/landcover-server.ts`); the counting is pure and tested
(`src/lib/landcover.ts`).

## Sod farms

The **Golf course | Sod farm** switch at the top of the Acreage panel turns it
into a sod field measurer:

1. Search the farm or its address (it frames the area and searches right away),
   or pan to it and tap **Find sod fields in view** (or **Select area**).
2. The app reads Agriculture and Agri-Food Canada's
   [Annual Crop Inventory](https://open.canada.ca/data/en/dataset/ba2645d5-4458-414d-b196-6303ac06c1c9)
   (newest year first: 2025, then 2024), which has its own **Sod** class, through
   `/api/landcover?src=aci`. It cuts the sod pixels into fields, fills small
   misread gaps inside a field and drops specks under 1 acre. Its 30 m pixels
   put field edges within about 15 m.
3. **Tap a field** to leave it out of the quote (it turns grey and dashed), tap
   again to put it back. **Trace a field** adds one the map missed; traced
   fields are measured exactly.
4. **Acres for the quote** counts the fields left in at **90%** by default ("Sod
   being mowed"): fields just harvested or reseeded aren't mowed. Then Send to
   ROI, the PDF report and Copy link work as they do for a course (the link
   keeps traced fields and the fields left out).

## Residential lawns

The **Lawn** switch measures a residential lawn in **square feet**:

1. Search the address (or tap **Select a lot**, then tap the property). In
   Quebec, the app looks up the lot under that point in the provincial cadastre
   (cadastre allégé, through `/api/parcel`) and frames it on the map. Outside
   Quebec (Ontario has no open lot data), **Trace the lot** instead.
2. Buildings, pools, parking and paving on the lot come from OpenStreetMap and
   are taken out automatically (only the part on the lot), including
   driveways and parking aisles mapped as lines, widened to their width. OSM
   has most houses in Laval, Gatineau, Sherbrooke, Ottawa, Barrie and Kingston,
   but few in Boucherville, Trois-Rivières or Saint-Jean-sur-Richelieu, and
   few residential driveways anywhere; the panel says so when the lot has no
   building.
3. **Remove a driveway**: tap along its middle from the street to the garage
   and pick its width (1, 2 or 3 cars: 11, 20 or 29 ft); the strip shows on
   the map as you go. **Remove an area** traces out a patio, garden beds, or
   the house when OSM doesn't have it. Tap a traced area to put it back. Lawn
   under trees counts as lawn.
4. The lawn (lot minus everything removed, each counted once) is the quote;
   a manual override in square feet wins. The PDF report and Copy link work as
   elsewhere; a lawn doesn't go to the ROI tab, which compares a Voyager with a
   commercial crew.

The cadastre is indicative only (the surveyor's boundary is the official one).

Houses OSM doesn't have are found in the LiDAR (next section) and taken off
too; the panel says how many. One that mostly overlaps an OSM building is left
to OSM's outline. The panel only asks the rep to trace the house when neither
OSM nor the LiDAR has a building on the lot (a house newer than the LiDAR, or
no LiDAR there).

## Mower fit

Under every measurement (lawn, course or sod farm), **Mower fit** says how
hard the property is for a robot and which Kress model to quote:

- **Terrain** comes from Natural Resources Canada's HRDEM mosaic: 1 m LiDAR
  bare-earth and surface models (`/api/terrain` reads just the tiles under the
  property from the Cloud Optimized GeoTIFFs on AWS; CDN 30 days). Slope is
  read over 3 m where the LiDAR sees open ground, and only patches of 8 m² or
  more count as steep (a bank, not a curb). What stands on the ground is low
  plants, trees (rough crowns) or buildings (smooth roofs).
- **Shape** (lawns): separate lawn areas, the narrowest passage a robot must
  drive through (from the distance to the nearest edge) and islands to go
  around.
- **Layout** (`coverage.ts`): how a robot would actually work it. Each area is
  striped in its best direction: a rectangle is a few long runs, an S-shaped or
  ragged zone many short, broken ones, each ending in a turn, plus a slower lap
  along every edge. Then the driving: to and from the **charger** on every
  charge, and from one area to the next, around buildings and pools on a lot.
  The charger is estimated (next to the house on a lot, the middle of the
  biggest area on a course or farm) and shown on the map; **Move the charger**
  and a tap puts it where it will really go (kept in the link). All of it is
  compared with a plain square of the same area with the charger at its edge,
  which is what a rated area assumes.
- The **score** adds 1-3 points per difficulty (separate areas, passages,
  irregular shapes, driving, slope, trees, obstacles): Simple (0-2), Moderate
  (3-5), Complex (6+), with the reasons listed.
- The **recommendation** chooses among the twelve Kress models quoted: RTKn
  KR161, KR172, KR173, KR174; EyePilot KR272, KR276; EyePilot 4x4 KR282, KR284,
  KR286; MasterSeries KR238; Voyager KR800 and KR804. A robot has to keep up
  with the area times the extra time the layout costs it, so a ragged lawn far
  from the charger can need the next size up; then the fewest drawbacks win
  (no camera under trees, no 4x4 on slopes over 40%, no ZeroTrim on lawns that
  are mostly edges, a passage narrower than the robot), then the lowest
  outlay. On a course with fairways in the quote, the MasterSeries takes the
  fairways (it cuts to 10 mm) and the best robot the rest, usually a Voyager;
  a sod farm gets a Voyager. The card says about how many hours a full mow
  takes. Send to ROI carries the recommended Voyager size to the ROI tab.

Kress specs are as of Oct 24, 2026 (`src/lib/mowers.ts`). Kress publishes no
minimum passage width, mowing speed or (for most models) run time per charge,
so those are estimates: check passages on site.

## Incentives tab

A second tab estimates first-year savings on robotic mowers and battery tools
for a customer proposal: pick the province, profile (landscaper, golf course,
farm, municipality, institution, developer, homeowner), structure and purchase,
and it shows two separate figures: **money kept** (grants and the refundable
tax credit) and **tax deferred** (faster write-offs, which lower tax now but not
over the equipment's life), then a line-by-line breakdown with status and
official links, other useful programs, and a "Copy my summary" button. Link straight to it
with `/#incentives`.

The low end counts only rules in force; the high end adds items that need
confirmation or approval (Class 56, the Clean Tech ITC, Prime-Vert, GMF).
Research as of October 9, 2026 (federal write-offs re-checked October 14,
2026, including the proposed Productivity Mega Deduction), in
`src/lib/incentives.ts`. Estimate only, not
tax advice.

## ROI tab

A live ROI calculator for client meetings: a crew on 60" zero-turns versus
Kress Voyagers **mowing the same acreage**, over a 1 to 10 year horizon. From the
acres to mow per week it sizes the zero-turn crew (full-time equivalents and
machines, at about 3 acres/h) and the Voyager fleet (7 or 19 acres per charge),
adds Voyager supervision time, treats existing zero-turns as either due for
replacement or already owned (resale value), and can deduct grants and credits
from the Incentives tab. It shows total cost, profit per year, cost per acre
mowed and payback/ROI, with the source and date of each default under its
input, and recalculates on every keystroke. "Print / PDF" prints a
one-page Letter summary, in the language on screen, to leave with the client. Link straight to it with
`/#roi`. Formulas and sources are in `src/lib/roi.ts` (copy in
`src/lib/roi-copy.ts`). The gas price is fetched from Statistics Canada
(Montréal, monthly) through `/api/gas-price`, cached a day, and used once it is
at least as recent as the dated default (StatCan publishes about a month late);
the other defaults
are dated market data (Hydro-Québec Rate G, April 1, 2026; KR800 10 kWh,
KR804 38 kWh) and need refreshing over time.

## Tech stack

- **Next.js 16 (App Router)** + **React 19** + **TypeScript** + **Tailwind CSS**
- **Leaflet** / **react-leaflet**, with Esri World Imagery (default) and
  OpenStreetMap street tiles selectable from the layer control
- The browser's built-in `fetch` for Overpass and Photon (no HTTP library)
- **osmtogeojson** + **@turf/area** / **@turf/intersect** / **@turf/helpers**
- **geotiff** (server only) to read WorldCover and the crop inventory, and
  **d3-contour** to outline sod fields
- **@turf/union** / **@turf/difference** to count mapped rough net and to take
  buildings and traced areas out of a lawn

## Getting started

```bash
npm install
npm run dev
```

Checks (the same ones CI runs): `npm run lint`, `npm test`, `npm run build`,
`npm run typecheck`.

Open [http://localhost:3000](http://localhost:3000).

The map opens in satellite view and centers on your device location if you allow
it, falling back to Trois-Rivières, Quebec.

## Deploy to Vercel

Standard Next.js app, no extra configuration:

1. Push this repository to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Deploy.

## Notes & limitations

- Results are only as good as OpenStreetMap. A course whose turf isn't mapped
  comes back boundary-only (the app says so, then counts satellite grass) or
  empty (trace its outline).
- Satellite land cover is coarse next to a survey: WorldCover cells are 10 m
  (grass under scattered trees reads as trees) and describes 2021; crop
  inventory cells are 30 m and a year behind. The turf estimate for an
  outline-only course is within 16% for half of courses and within about 25%
  for most; a course with unusual amounts of meadow or native area can fall
  outside the range. Spot-check against the imagery, and use the override when
  you know the real figure.
- Estimated rough inherits every gap in the underlying data — treat it as a
  starting point for a quote, not a survey.
- The LiDAR was flown between about 2015 and 2023 depending on the area:
  trees have grown since, and newer houses aren't in it (trace them out).
  Where there's no LiDAR, the mower fit says slope and trees weren't checked.
- The public Overpass API is rate-limited and occasionally busy. The app races
  three mirrors (from the server and from the browser) and surfaces a friendly
  message if all of them are down.
