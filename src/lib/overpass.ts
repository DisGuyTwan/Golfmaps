import axios from "axios";
import type { BBox } from "./types";

/**
 * Public Overpass API mirrors (all free, no API key). We try them in order:
 * the main instance is frequently overloaded, and when it is it often times
 * out or errors without CORS headers, which the browser reports as a failed
 * request. Failing over to a mirror makes the tool far more reliable.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/**
 * Builds an Overpass QL query that selects a golf course boundary and all of
 * its golf features (fairways, greens, tees, rough, etc.) within the bounding
 * box, then recurses down to their nodes so the geometry can be reconstructed.
 *
 * We deliberately fetch more than just fairways: many courses in OpenStreetMap
 * only have the `leisure=golf_course` outline mapped, so querying for fairways
 * alone returns nothing even when a course is clearly present.
 */
export function buildFairwayQuery({ south, west, north, east }: BBox): string {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:25];
(
  way["leisure"="golf_course"](${bbox});
  relation["leisure"="golf_course"](${bbox});
  way["golf"](${bbox});
  relation["golf"](${bbox});
  way["natural"="wood"](${bbox});
  relation["natural"="wood"](${bbox});
  way["landuse"="forest"](${bbox});
  relation["landuse"="forest"](${bbox});
  way["natural"="scrub"](${bbox});
  way["natural"="water"](${bbox});
  relation["natural"="water"](${bbox});
  way["building"](${bbox});
  relation["building"](${bbox});
  way["amenity"="parking"](${bbox});
  relation["amenity"="parking"](${bbox});
);
out body;
>;
out skel qt;`;
}

/**
 * POSTs the golf query to the Overpass API and returns the raw OSM JSON.
 * The query is sent form-encoded as `data=...` (the endpoint's documented POST
 * format). Each mirror is tried in turn; the last error is re-thrown only if
 * every mirror fails.
 */
export async function fetchFairways(bbox: BBox): Promise<unknown> {
  const body = `data=${encodeURIComponent(buildFairwayQuery(bbox))}`;
  let lastError: unknown;

  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await axios.post(url, body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 30000,
      });
      return response.data;
    } catch (err) {
      lastError = err;
      // Fall through and try the next mirror.
    }
  }

  throw lastError;
}
