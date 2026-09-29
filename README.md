# Golf Course Acreage Calculator

A completely free web app for quoting robotic mower jobs. Search for a course (or
pan to it), and it measures the turf acreage from OpenStreetMap — broken down by
fairway, green, tee and rough, net of trees, buildings and parking.

No API keys. No Google Maps or Mapbox. Just free OpenStreetMap and Esri satellite
tiles, the public Overpass API, and Photon for search.

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

## Tech stack

- **Next.js 14 (App Router)** + **TypeScript** + **Tailwind CSS**
- **Leaflet** / **react-leaflet**, with Esri World Imagery (default) and
  OpenStreetMap street tiles selectable from the layer control
- **axios** for the Overpass request
- **osmtogeojson** + **@turf/area** / **@turf/intersect** / **@turf/helpers**

## Getting started

```bash
npm install
npm run dev
```

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
