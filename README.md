# Golf Course Acreage Calculator

A completely free web app for quoting robotic mower jobs. Draw a bounding box
over a golf course on the map, and it automatically pulls the fairway polygons
from OpenStreetMap and calculates the total fairway acreage.

No API keys. No Google Maps or Mapbox. Just free OpenStreetMap tiles and the
public Overpass API.

## How it works

1. **Draw a rectangle** over a course using the rectangle tool (top-left of the
   map).
2. The app builds an [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API)
   query for `golf=fairway` ways and relations inside your box and POSTs it to
   the public Overpass API.
3. The OSM response is converted to GeoJSON with
   [`osmtogeojson`](https://github.com/tyrasd/osmtogeojson).
4. Each fairway polygon's area is measured with
   [`@turf/area`](https://turfjs.org/docs/api/area) and summed, then converted
   from square meters to acres (`1 m² = 0.000247105 acres`).
5. Detected fairways are drawn on the map (light green fill, dark green border)
   and a summary card shows the total acreage and fairway count.

## Tech stack

- **Next.js (App Router)** + **TypeScript** + **Tailwind CSS**
- **Leaflet** / **react-leaflet** / **react-leaflet-draw** with free
  OpenStreetMap tiles
- **axios** for the Overpass API request
- **osmtogeojson** + **@turf/area** / **@turf/helpers** for geospatial
  processing

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The map opens over Trois-Rivières, Quebec by default — pan/zoom to any course,
then draw a box.

## Deploy to Vercel

This is a standard Next.js app and deploys to Vercel with no extra
configuration:

1. Push this repository to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Deploy. (An `.npmrc` with `legacy-peer-deps=true` is included so the install
   succeeds with `react-leaflet-draw`'s older peer ranges.)

## Notes & limitations

- Results are only as good as OpenStreetMap. If a course's fairways aren't
  mapped as `golf=fairway`, nothing will be found — try a well-mapped course to
  verify.
- Acreage covers **fairways only** (not greens, tees, or rough). Adjust the
  Overpass query in `src/lib/overpass.ts` if you need other features.
- The public Overpass API is rate-limited and occasionally busy; the app
  surfaces a friendly message and you can retry.
