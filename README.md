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

## Kress Connect integration (read-only)

Sign in with a Kress account to see your robots live on the map, draw their
Kress maps (boundaries, zones, exclusions, base stations), and see which units
are installed on a measured course. After measuring, the panel also suggests
which Kress model and how many units fit the selected turf.

The integration is **read-only by design**: it never starts, stops, homes or
reschedules a mower. Kress marks its API as early alpha, so re-check the docs
when upgrading `KRESS_API_VERSION` in `src/lib/kress/config.ts`.

### Setup

1. At <https://id.kress.com/developer>, click **Add new client**, set the app
   name and base URL (`https://golfmaps.prodig-e.com`), and copy the client
   secret.
2. Add these **Redirect URLs**:
   - `https://golfmaps.prodig-e.com/api/kress/callback`
   - `http://localhost:3000/api/kress/callback` (local development)
3. In Vercel, add `KRESS_CLIENT_ID`, `KRESS_CLIENT_SECRET` and
   `KRESS_SESSION_SECRET` (see `.env.example`), then redeploy.
4. Fill in the models you sell in `src/lib/kress-catalog.ts` (rated capacity
   in acres, optional price and product code) to enable recommendations.

Tokens live in encrypted, httpOnly cookies; the client secret never reaches the
browser. Requests respect Kress's limits (5 req/s, 10 concurrent), back off on
429, follow header pagination, and refresh expired tokens once.
