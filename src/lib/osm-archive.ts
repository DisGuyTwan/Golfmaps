/**
 * Reading the OSM archive (scripts/osm-archive/build.py): OpenStreetMap's
 * features for Quebec and Ontario, cut nightly into tiles in one file, so
 * /api/overpass range-reads the few tiles under a box instead of waiting on
 * the Overpass mirrors (27-33 s from Vercel's addresses). The answer is built
 * in Overpass's own JSON (ways with their nodes, multipolygons with their
 * member ways), with each lookup's query emulated (overpass.ts), so every
 * reader of it (area.ts, lawn.ts, roads.ts, detect.ts) works unchanged.
 * Pure (the tile arithmetic, the queries and the assembly), so it's tested
 * without a network; osm-archive-server.ts does the reading.
 */
import type { OverpassQuery } from "./overpass";
import type { BBox } from "./types";

export type Layer = "f" | "s" | "r";

export interface ArchiveHeader {
  v: number;
  /** When the archive was built, and the date of the OpenStreetMap data in it (ISO). */
  built: string;
  osm: string | null;
  layers: Record<Layer, { deg: number; per: number }>;
  /** Each layer's 1° block ("layer/by/bx"): where its tile index is, from the start of the indexes. */
  blocks: Record<string, [number, number]>;
  indexBytes: number;
  /** The 1° blocks ("by/bx") in the regions: "F" whole, else which 0.1° cells (hex, bit row * 10 + column). */
  cover: Record<string, string>;
}

type Tags = Record<string, string>;
/** A way and its points, or a multipolygon and its rings; coordinates in 1e-7 degrees, deltas after the first pair. */
export type ArchiveRecord = ["w", number, Tags, number[]] | ["r", number, Tags, [string, number[]][]];

/** The layers each lookup reads: what's on a lot or a course, every street, the main roads. */
export const LAYERS_FOR: Record<OverpassQuery, Layer[]> = { golf: ["f"], lawn: ["f", "s"], streets: ["s"], roads: ["r"] };
/** Most tiles one lookup reads; a bigger box goes to the mirrors. */
export const MAX_TILES = 64;

const E7 = 1e7;
const tileOf = (v: number, offset: number, deg: number) => Math.floor((v + offset) / deg + 1e-9);

/** The tiles of a layer under a box: their block ("layer/by/bx") and key in it ("iy,ix"); null past MAX_TILES. */
export function tilesFor(header: ArchiveHeader, layer: Layer, bbox: BBox): { block: string; tile: string }[] | null {
  const { deg, per } = header.layers[layer];
  const out: { block: string; tile: string }[] = [];
  const [x0, x1] = [tileOf(bbox.west, 180, deg), tileOf(bbox.east, 180, deg)];
  const [y0, y1] = [tileOf(bbox.south, 90, deg), tileOf(bbox.north, 90, deg)];
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) return null;
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) out.push({ block: `${layer}/${Math.floor(iy / per)}/${Math.floor(ix / per)}`, tile: `${iy},${ix}` });
  }
  return out;
}

/** Whether the archive holds the whole box: every 0.1° cell under it is in the regions it was built from. */
export function covered(header: ArchiveHeader, bbox: BBox): boolean {
  const [x0, x1] = [tileOf(bbox.west, 180, 0.1), tileOf(bbox.east, 180, 0.1)];
  const [y0, y1] = [tileOf(bbox.south, 90, 0.1), tileOf(bbox.north, 90, 0.1)];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cells = header.cover[`${Math.floor(y / 10)}/${Math.floor(x / 10)}`];
      if (!cells) return false;
      if (cells === "F") continue;
      if (!((BigInt(`0x${cells}`) >> BigInt((y % 10) * 10 + (x % 10))) & BigInt(1))) return false;
    }
  }
  return true;
}

/** Byte ranges merged where they're within `gap` of each other, so neighbouring tiles come in one read. */
export function mergeRanges(ranges: [number, number][], gap = 65536): { start: number; end: number; parts: [number, number][] }[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: { start: number; end: number; parts: [number, number][] }[] = [];
  for (const [offset, length] of sorted) {
    const last = out[out.length - 1];
    if (last && offset <= last.end + gap) {
      last.end = Math.max(last.end, offset + length);
      last.parts.push([offset, length]);
    } else {
      out.push({ start: offset, end: offset + length, parts: [[offset, length]] });
    }
  }
  return out;
}

/** Whether a line (or ring) of [lat7, lon7] points has a point in the box or a segment across it, as Overpass's bbox does. */
function touches(pts: [number, number][], s: number, w: number, n: number, e: number): boolean {
  for (let i = 0; i < pts.length; i++) {
    const [y1, x1] = pts[i];
    if (y1 >= s && y1 <= n && x1 >= w && x1 <= e) return true;
    if (i === 0) continue;
    // Liang-Barsky: clip the segment from the previous point to the box.
    const [y0, x0] = pts[i - 1];
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const edges: [number, number][] = [[-dx, x0 - w], [dx, e - x0], [-dy, y0 - s], [dy, n - y0]];
    let crosses = true;
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) crosses = false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (crosses && t0 <= t1) return true;
  }
  return false;
}

/** Absolute [lat7, lon7] pairs from the archive's deltas. */
function points(coords: number[]): [number, number][] {
  const out: [number, number][] = [];
  let lat = 0;
  let lon = 0;
  for (let i = 0; i + 1 < coords.length; i += 2) {
    lat = i === 0 ? coords[0] : lat + coords[i];
    lon = i === 0 ? coords[1] : lon + coords[i + 1];
    out.push([lat, lon]);
  }
  return out;
}

const STREETS = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road)(_link)?$/;
const MAIN = /^(motorway|trunk|primary|secondary|tertiary|unclassified)(_link)?$/;

/** Whether a feature is one the lookup's Overpass query selects (overpass.ts), going by its tags. */
export function selects(kind: OverpassQuery, type: "w" | "r", t: Tags): boolean {
  const way = type === "w";
  switch (kind) {
    case "golf":
      return (
        t.leisure === "golf_course" ||
        "golf" in t ||
        t.natural === "wood" ||
        t.landuse === "forest" ||
        (way && t.natural === "scrub") ||
        t.natural === "water" ||
        "building" in t ||
        t.amenity === "parking"
      );
    case "lawn":
      return (
        t.leisure === "golf_course" ||
        "building" in t ||
        t.amenity === "parking" ||
        (way &&
          (t.leisure === "swimming_pool" ||
            t.amenity === "parking_space" ||
            "area:highway" in t ||
            (!!t.highway && t.area === "yes") ||
            t.highway === "service" ||
            (!!t.highway && STREETS.test(t.highway))))
      );
    case "streets":
      return way && !!t.highway && STREETS.test(t.highway);
    case "roads":
      return way && !!t.highway && MAIN.test(t.highway);
  }
}

/**
 * The records from the tiles read, as the Overpass answer to the lookup:
 * the features its query selects within the box (once each, however many
 * tiles held them), ways with their nodes and multipolygons with their member
 * ways. Nodes get an id per point, so ways that share a node (a street
 * corner) share it here too. A lawn lookup's golf course is the one around
 * the box's middle (Overpass's is_in), wherever its outline is.
 */
export function toOverpass(records: ArchiveRecord[], kind: OverpassQuery, bbox: BBox, header: Pick<ArchiveHeader, "built" | "osm">): unknown {
  const [s, w, n, e] = [bbox.south, bbox.west, bbox.north, bbox.east].map((v) => Math.round(v * E7));
  const mid: [number, number] = [Math.round(((bbox.south + bbox.north) / 2) * E7), Math.round(((bbox.west + bbox.east) / 2) * E7)];
  const seen = new Set<string>();
  const nodeIds = new Map<string, number>();
  const nodes: { type: "node"; id: number; lat: number; lon: number }[] = [];
  const ways: object[] = [];
  const relations: object[] = [];
  let memberId = 9e15;
  const nodesOf = (pts: [number, number][]) =>
    pts.map(([lat, lon]) => {
      const key = `${lat},${lon}`;
      let id = nodeIds.get(key);
      if (id === undefined) {
        id = nodes.length + 1;
        nodeIds.set(key, id);
        nodes.push({ type: "node", id, lat: lat / E7, lon: lon / E7 });
      }
      return id;
    });

  for (const record of records) {
    const [type, id, tags] = record;
    const key = `${type}${id}`;
    if (seen.has(key) || !selects(kind, type, tags)) continue;
    const rings = type === "w" ? [points(record[3])] : record[3].map(([, c]) => points(c));
    // In a lawn lookup only the course around the middle counts (whose box holds it: detect.ts
    // checks the outline); elsewhere what touches the box.
    const wanted =
      kind === "lawn" && tags.leisure === "golf_course"
        ? rings.some((ring) => ring.some(([lat]) => lat >= mid[0]) && ring.some(([lat]) => lat <= mid[0]) && ring.some(([, lon]) => lon >= mid[1]) && ring.some(([, lon]) => lon <= mid[1]))
        : rings.some((ring) => touches(ring, s, w, n, e));
    if (!wanted) continue;
    seen.add(key);
    if (type === "w") {
      ways.push({ type: "way", id, nodes: nodesOf(rings[0]), tags });
    } else {
      const members = record[3].map(([role], i) => {
        const ref = memberId++;
        ways.push({ type: "way", id: ref, nodes: nodesOf(rings[i]) });
        return { type: "way", ref, role };
      });
      relations.push({ type: "relation", id, members, tags });
    }
  }
  return {
    version: 0.6,
    generator: "Calculator OSM archive",
    osm3s: {
      timestamp_osm_base: header.osm ?? header.built,
      copyright: "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    },
    elements: [...ways, ...relations, ...nodes],
  };
}
