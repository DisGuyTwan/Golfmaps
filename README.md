# Kress

Live at <https://kress.prodig-e.com>.

A completely free web app for quoting robotic mower jobs. It has three tabs:
**Acreage**, **Incentives** and **ROI Voyager**. Search for a course (or pan to it), and it measures the turf acreage from OpenStreetMap — broken down by
fairway, green, tee and rough, net of trees, buildings and parking.

No API keys. No Google Maps or Mapbox. Just free OpenStreetMap and Esri satellite
tiles, the public Overpass API, Photon for search and Statistics Canada for the
gas price. Three small Vercel functions cache course lookups and the gas price
and collect client errors in the runtime logs.

The tabs work together: measure a course, choose what's actually mowed, and
**Send to ROI** sizes the zero-turn crew and the Voyager fleet for those acres;
the ROI tab prices grants and credits with the profile picked on the
Incentives tab. Every tab has a **Copy link** (its inputs go in the URL, so a
quote can be reopened or sent) and a **Print / PDF** for clients.

Every tab is in **English (default) and French**: the EN | FR switch at the top
right switches the whole app, including printouts and the 404 page. A sun/moon button switches between **light and dark
mode** (it follows the device setting until you pick one). Both choices are
remembered on the device. Printing always comes out light.

Incentives and ROI Voyager share the same dark-green header with a short
description and a **Print / PDF** button, so either tab can be saved as a PDF
and sent to a client.

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
so a course measured once is instant and survives busy mirrors; if the route
fails, the browser calls the mirrors directly.

### How rough is handled

Rough is the number that matters most for a mowing quote and the one OSM maps
least often, so the app is deliberately careful about it:

- If rough polygons **are** mapped, it uses them.
- If they aren't, it **estimates**: course boundary minus fairways, greens, tees,
  driving range, water, bunkers, trees and buildings. The panel labels this
  figure as an estimate.
- If a course has **only a boundary** mapped and no fairways/greens/tees at all,
  it reports that instead of estimating. "Boundary minus nothing" would claim the
  entire property is rough, which would quietly inflate a quote.

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

## ROI Voyager tab

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
  comes back boundary-only (the app says so) or empty.
- Estimated rough inherits every gap in the underlying data — treat it as a
  starting point for a quote, not a survey.
- The public Overpass API is rate-limited and occasionally busy. The app fails
  over across three mirrors and surfaces a friendly message if all of them are
  down.
