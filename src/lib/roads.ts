/**
 * Driving on OpenStreetMap's roads, for a grass run. The roads around the run
 * come from Overpass (main roads across the run, every street near each
 * stop, overpass.ts "roads" and "streets"); this turns them into a graph the
 * browser routes on, so each leg of the day follows the streets on the map
 * and counts its real driving time. Public routing servers (OSRM's demo,
 * FOSSGIS) aren't for commercial use, and the app takes no API keys, so the
 * routing is done here.
 *
 * Travel speeds: about 80 % of the speed limit where it's mapped (lights,
 * stops, turns), else a typical speed for the kind of road (an estimate).
 * One-way streets, roundabouts and motorways are driven one way only.
 * Pure, so it's tested without a browser.
 */

/** Roads a truck and trailer drive on (service roads, tracks and paths left out). */
const DRIVABLE = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road)(_link)?$/;

/** Typical travel speed (km/h) where no limit is mapped: town driving with a trailer. */
const TYPICAL_KMH: Record<string, number> = {
  motorway: 90,
  motorway_link: 50,
  trunk: 70,
  trunk_link: 45,
  primary: 55,
  primary_link: 40,
  secondary: 50,
  secondary_link: 35,
  tertiary: 45,
  tertiary_link: 30,
  unclassified: 40,
  residential: 30,
  living_street: 15,
  road: 30,
};
/** Share of a mapped speed limit actually averaged (lights, stops, turns). */
const LIMIT_SHARE = 0.8;
/** Between a stop and the road it's snapped to: the driveway or the curb, at walking-the-trailer pace (km/h). */
const ACCESS_KMH = 15;
/** A stop further than this from any road (m) gets no road route. */
export const MAX_SNAP_M = 400;

const R = 6_371_000;
const RAD = Math.PI / 180;

/** Metres between two points ([lat, lon]), on a sphere. */
function metres(lat0: number, lon0: number, lat1: number, lon1: number): number {
  const dLat = (lat1 - lat0) * RAD;
  const dLon = (lon1 - lon0) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat0 * RAD) * Math.cos(lat1 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A speed limit tag in km/h ("50", "50 km/h", "30 mph"); null when it isn't a number. */
export function maxspeedKmh(tag: string | undefined): number | null {
  const m = tag?.match(/^\s*(\d+(?:\.\d+)?)\s*(mph)?/i);
  if (!m) return null;
  const v = Number(m[1]) * (m[2] ? 1.609 : 1);
  return v >= 5 ? v : null;
}

/** Travel speed on a road (km/h). */
export function roadKmh(tags: Record<string, string>): number {
  const limit = maxspeedKmh(tags.maxspeed);
  return limit ? limit * LIMIT_SHARE : (TYPICAL_KMH[tags.highway] ?? 30);
}

/** Which ways a road can be driven: 1 with its nodes, -1 against them, 0 both. */
export function oneway(tags: Record<string, string>): -1 | 0 | 1 {
  const o = tags.oneway;
  if (o === "-1" || o === "reverse") return -1;
  if (o === "yes" || o === "true" || o === "1") return 1;
  if (o === "no" || o === "false" || o === "0") return 0;
  if (tags.junction === "roundabout" || tags.junction === "circular") return 1;
  if (tags.highway === "motorway" || tags.highway === "motorway_link") return 1;
  return 0;
}

/** The road network as a graph: nodes, and one-way edges in compressed rows (edges of node i at start[i]..start[i+1]). */
export interface RoadGraph {
  lat: Float64Array;
  lon: Float64Array;
  start: Int32Array;
  to: Int32Array;
  /** Seconds and metres along each edge, and its road's name (an index into `names`, -1 without). */
  sec: Float32Array;
  len: Float32Array;
  name: Int32Array;
  names: string[];
  /** Each node's connected piece (either way); `main` is the biggest, the one stops snap to. */
  comp: Int32Array;
  main: number;
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

const elementsOf = (json: unknown): OsmElement[] =>
  json && typeof json === "object" && Array.isArray((json as { elements?: unknown }).elements) ? (json as { elements: OsmElement[] }).elements : [];

/** The graph of the drivable roads in one or more Overpass answers (ways with their nodes), each way once. */
export function buildRoadGraph(...answers: unknown[]): RoadGraph {
  const coords = new Map<number, [number, number]>();
  const ways = new Map<number, OsmElement>();
  for (const answer of answers) {
    for (const el of elementsOf(answer)) {
      if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) coords.set(el.id, [el.lat, el.lon]);
      else if (el.type === "way" && el.nodes && el.tags && !ways.has(el.id)) ways.set(el.id, el);
    }
  }

  const index = new Map<number, number>();
  const lat: number[] = [];
  const lon: number[] = [];
  const nodeOf = (id: number) => {
    let i = index.get(id);
    if (i === undefined) {
      const c = coords.get(id)!;
      i = lat.length;
      index.set(id, i);
      lat.push(c[0]);
      lon.push(c[1]);
    }
    return i;
  };
  const names: string[] = [];
  const nameIndex = new Map<string, number>();
  const from: number[] = [];
  const to: number[] = [];
  const sec: number[] = [];
  const len: number[] = [];
  const name: number[] = [];
  for (const way of ways.values()) {
    const tags = way.tags!;
    if (!DRIVABLE.test(tags.highway ?? "") || tags.area === "yes") continue;
    if ((tags.access === "no" || tags.access === "private") && !tags.motor_vehicle && !tags.motorcar) continue;
    const dir = oneway(tags);
    const mps = roadKmh(tags) / 3.6;
    const label = tags.name ?? tags.ref ?? null;
    let n = -1;
    if (label !== null) {
      n = nameIndex.get(label) ?? -1;
      if (n < 0) {
        n = names.length;
        names.push(label);
        nameIndex.set(label, n);
      }
    }
    const ids = way.nodes!.filter((id) => coords.has(id));
    for (let k = 1; k < ids.length; k++) {
      const a = nodeOf(ids[k - 1]);
      const b = nodeOf(ids[k]);
      if (a === b) continue;
      const m = metres(lat[a], lon[a], lat[b], lon[b]);
      const edge = (u: number, v: number) => {
        from.push(u);
        to.push(v);
        sec.push(m / mps);
        len.push(m);
        name.push(n);
      };
      if (dir >= 0) edge(a, b);
      if (dir <= 0) edge(b, a);
    }
  }

  // Compressed rows: edges sorted by the node they leave.
  const nodes = lat.length;
  const start = new Int32Array(nodes + 1);
  for (const a of from) start[a + 1]++;
  for (let i = 0; i < nodes; i++) start[i + 1] += start[i];
  const fill = start.slice(0, nodes);
  const edges = from.length;
  const g: RoadGraph = {
    lat: Float64Array.from(lat),
    lon: Float64Array.from(lon),
    start,
    to: new Int32Array(edges),
    sec: new Float32Array(edges),
    len: new Float32Array(edges),
    name: new Int32Array(edges),
    names,
    comp: new Int32Array(nodes),
    main: 0,
  };
  for (let e = 0; e < edges; e++) {
    const slot = fill[from[e]]++;
    g.to[slot] = to[e];
    g.sec[slot] = sec[e];
    g.len[slot] = len[e];
    g.name[slot] = name[e];
  }

  // Connected pieces, either way (union-find), so stops snap to the network they can drive between.
  const parent = Int32Array.from({ length: nodes }, (_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let e = 0; e < edges; e++) {
    const a = root(from[e]);
    const b = root(to[e]);
    if (a !== b) parent[a] = b;
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < nodes; i++) {
    g.comp[i] = root(i);
    sizes.set(g.comp[i], (sizes.get(g.comp[i]) ?? 0) + 1);
  }
  let best = -1;
  for (const [c, size] of sizes) if (best < 0 || size > sizes.get(best)!) best = c;
  g.main = best;
  return g;
}

/** The node of the main network nearest a point ([lat, lon]) within MAX_SNAP_M, or -1. */
export function snap(g: RoadGraph, [lat, lon]: [number, number], maxM = MAX_SNAP_M): number {
  const kx = Math.cos(lat * RAD);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < g.lat.length; i++) {
    if (g.comp[i] !== g.main) continue;
    const dy = g.lat[i] - lat;
    const dx = (g.lon[i] - lon) * kx;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 && metres(lat, lon, g.lat[best], g.lon[best]) <= maxM ? best : -1;
}

/** A binary heap of nodes by time, for Dijkstra (stale entries are skipped when popped). */
class Heap {
  private node: number[] = [];
  private key: number[] = [];
  get size() {
    return this.node.length;
  }
  push(n: number, k: number) {
    const { node, key } = this;
    let i = node.length;
    node.push(n);
    key.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (key[p] <= k) break;
      node[i] = node[p];
      key[i] = key[p];
      i = p;
    }
    node[i] = n;
    key[i] = k;
  }
  pop(): [number, number] {
    const { node, key } = this;
    const top: [number, number] = [node[0], key[0]];
    const n = node.pop()!;
    const k = key.pop()!;
    if (node.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= node.length) break;
        const c = l + 1 < node.length && key[l + 1] < key[l] ? l + 1 : l;
        if (key[c] >= k) break;
        node[i] = node[c];
        key[i] = key[c];
        i = c;
      }
      node[i] = n;
      key[i] = k;
    }
    return top;
  }
}

/** One leg of a run on the roads. */
export interface RoadLeg {
  minutes: number;
  km: number;
  /** The way along the streets, [lat, lon], from the place left to the place reached. */
  path: [number, number][];
  /** The main roads taken, in order (up to three, the longest stretches). */
  via: string[];
}

/** The road node each place ([lat, lon]) starts from, -1 for a place too far from any road. */
export function snapPlaces(g: RoadGraph, places: [number, number][]): number[] {
  return places.map((p) => snap(g, p));
}

/**
 * The fastest legs from one place to each of the others (Dijkstra from its
 * road node, stopping once every other place's node is reached). legs[j] is
 * null for itself, or a place it can't reach on these roads.
 */
export function routeFrom(g: RoadGraph, places: [number, number][], snapped: number[], source: number): (RoadLeg | null)[] {
  const legs: (RoadLeg | null)[] = places.map(() => null);
  const s = snapped[source];
  if (s < 0) return legs;
  const nodes = g.lat.length;
  const dist = new Float64Array(nodes).fill(Infinity);
  const prevEdge = new Int32Array(nodes).fill(-1);
  const prevNode = new Int32Array(nodes).fill(-1);
  const done = new Uint8Array(nodes);
  const wanted = new Set(snapped.filter((n, j) => j !== source && n >= 0));
  const heap = new Heap();
  dist[s] = 0;
  heap.push(s, 0);
  while (heap.size && wanted.size) {
    const [u, d] = heap.pop();
    if (done[u] || d > dist[u]) continue;
    done[u] = 1;
    wanted.delete(u);
    for (let e = g.start[u]; e < g.start[u + 1]; e++) {
      const v = g.to[e];
      const nd = d + g.sec[e];
      if (nd < dist[v]) {
        dist[v] = nd;
        prevEdge[v] = e;
        prevNode[v] = u;
        heap.push(v, nd);
      }
    }
  }

  const [lat0, lon0] = places[source];
  const accessIn = metres(lat0, lon0, g.lat[s], g.lon[s]);
  places.forEach((place, j) => {
    const t = snapped[j];
    if (j === source || t < 0 || !Number.isFinite(dist[t])) return;
    const nodesOnPath: number[] = [];
    const byName = new Map<number, number>();
    const order: number[] = [];
    let metresOnRoads = 0;
    for (let v = t; v !== s; v = prevNode[v]) {
      nodesOnPath.push(v);
      const e = prevEdge[v];
      metresOnRoads += g.len[e];
      const n = g.name[e];
      if (n >= 0) {
        if (!byName.has(n)) order.push(n);
        byName.set(n, (byName.get(n) ?? 0) + g.len[e]);
      }
    }
    nodesOnPath.push(s);
    nodesOnPath.reverse();
    const accessOut = metres(g.lat[t], g.lon[t], place[0], place[1]);
    const access = accessIn + accessOut;
    // The longest stretches, kept in the order they're driven (names were collected from the end back).
    const longest = new Set([...byName].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n));
    legs[j] = {
      minutes: (dist[t] + access / (ACCESS_KMH / 3.6)) / 60,
      km: (metresOnRoads + access) / 1000,
      path: [places[source], ...nodesOnPath.map((v): [number, number] => [g.lat[v], g.lon[v]]), place],
      via: order.reverse().filter((n) => longest.has(n)).map((n) => g.names[n]),
    };
  });
  return legs;
}

/** Every leg between the places (legs[i][j], i to j), on the roads. */
export function routeAll(g: RoadGraph, places: [number, number][]): (RoadLeg | null)[][] {
  const snapped = snapPlaces(g, places);
  return places.map((_, i) => routeFrom(g, places, snapped, i));
}

/** Main roads are read this far past the run's places (degrees), and boxes snap to this grid so nearby runs share them. */
const ROADS_MARGIN_DEG = 0.02;
const GRID_DEG = 0.01;
/** Largest main-road box (degrees per side, the cache route's limit): a run spread wider is driven by the straight line between neighbourhoods. */
const MAX_ROADS_DEG = 0.3;
/** Largest box of every street (degrees per side, the cache route's limit for "streets"). */
const MAX_STREETS_DEG = 0.05;

type Box = { south: number; west: number; north: number; east: number };

export interface RoadBoxes {
  /**
   * Every street around the places: each place's grid cell and the cells
   * around it (about 3 × 2 km), neighbourhoods merged while they fit one
   * lookup, so a run in one part of town is a single lookup.
   */
  streets: Box[];
  /** The main roads across the run, to join neighbourhoods; null when there's one, or the run is too wide. */
  roads: Box | null;
  /** The neighbourhoods are spread too wide for one main-road lookup: the legs between them are the straight line. */
  tooFar: boolean;
}

const down = (v: number) => Math.floor(v / GRID_DEG + 1e-9) * GRID_DEG;
const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
const union = (a: Box, b: Box): Box => ({
  south: Math.min(a.south, b.south),
  west: Math.min(a.west, b.west),
  north: Math.max(a.north, b.north),
  east: Math.max(a.east, b.east),
});
const fitsStreets = (b: Box) => b.north - b.south <= MAX_STREETS_DEG + 1e-9 && b.east - b.west <= MAX_STREETS_DEG + 1e-9;

/**
 * The Overpass boxes a run's roads come from, on a 0.01° grid so the cache
 * route serves them again. Fewer lookups matter more than smaller ones: the
 * mirrors turn away an address asking several at once.
 */
export function roadBoxes(places: [number, number][]): RoadBoxes {
  if (!places.length) return { streets: [], roads: null, tooFar: false };
  let streets: Box[] = [];
  for (const [lat, lon] of places) {
    const south = round5(down(lat) - GRID_DEG);
    const west = round5(down(lon) - GRID_DEG);
    if (!streets.some((b) => b.south === south && b.west === west))
      streets.push({ south, west, north: round5(south + 3 * GRID_DEG), east: round5(west + 3 * GRID_DEG) });
  }
  // Merge the two neighbourhoods whose box together is smallest, while it fits one lookup.
  for (;;) {
    let best: [number, number, Box] | null = null;
    for (let i = 0; i < streets.length; i++)
      for (let j = i + 1; j < streets.length; j++) {
        const u = union(streets[i], streets[j]);
        if (fitsStreets(u) && (!best || (u.north - u.south) * (u.east - u.west) < (best[2].north - best[2].south) * (best[2].east - best[2].west)))
          best = [i, j, u];
      }
    if (!best) break;
    const [i, j, u] = best;
    streets = [...streets.filter((_, k) => k !== i && k !== j), u];
  }
  if (streets.length === 1) return { streets, roads: null, tooFar: false };

  const lats = places.map((p) => p[0]);
  const lons = places.map((p) => p[1]);
  const roads = {
    south: round5(down(Math.min(...lats) - ROADS_MARGIN_DEG)),
    west: round5(down(Math.min(...lons) - ROADS_MARGIN_DEG)),
    north: round5(down(Math.max(...lats) + ROADS_MARGIN_DEG) + GRID_DEG),
    east: round5(down(Math.max(...lons) + ROADS_MARGIN_DEG) + GRID_DEG),
  };
  const fits = roads.north - roads.south <= MAX_ROADS_DEG + 1e-9 && roads.east - roads.west <= MAX_ROADS_DEG + 1e-9;
  return { streets, roads: fits ? roads : null, tooFar: !fits };
}
