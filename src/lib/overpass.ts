import axios from "axios";
import type { BBox } from "./types";

/** Public Overpass API endpoint (free, no API key required). */
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Builds an Overpass QL query that selects golf fairways (ways + relations)
 * within the given bounding box, then recurses down to their nodes so the
 * geometry can be reconstructed.
 */
export function buildFairwayQuery({ south, west, north, east }: BBox): string {
  return `[out:json][timeout:25];
(
  way["golf"="fairway"](${south},${west},${north},${east});
  relation["golf"="fairway"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;
}

/**
 * POSTs the fairway query to the Overpass API and returns the raw OSM JSON.
 * The query is sent form-encoded as `data=...`, which is the endpoint's
 * documented POST format.
 */
export async function fetchFairways(bbox: BBox): Promise<unknown> {
  const query = buildFairwayQuery(bbox);

  const response = await axios.post(
    OVERPASS_URL,
    `data=${encodeURIComponent(query)}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30000,
    },
  );

  return response.data;
}
