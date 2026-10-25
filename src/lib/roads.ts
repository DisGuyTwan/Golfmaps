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
  /** The way along the streets, [lat, lon], from the place left (its lot's front) to the place reached. */
  path: [number, number][];
  /** The main roads taken, in order (up to three, the longest stretches). */
  via: string[];
}

/**
 * A place to route to: where it is and, for a stop, its lot (GeoJSON rings,
 * [lon, lat]) and the street of its address, so it's reached from its own
 * street at the front of the lot, not across the neighbours' yards.
 */
export interface RoutePlace {
  at: [number, number];
  lot?: [number, number][][] | null;
  street?: string | null;
}

/**
 * Where a place meets the roads: a point on a road segment between nodes u
 * and v (u < v), `t` of the way from u to v, and the place's door (its
 * lot's edge nearest that road, or the place itself without a lot).
 */
export interface PlaceSnap {
  u: number;
  v: number;
  t: number;
  /** The segment's edge from u to v, and from v to u: -1 where it's one way the other way. */
  uv: number;
  vu: number;
  road: [number, number];
  door: [number, number];
  /** Metres from the road to the door. */
  access: number;
}

const placeOf = (p: [number, number] | RoutePlace): RoutePlace => (Array.isArray(p) ? { at: p } : p);

/** Words that don't tell two streets apart: kinds of road, articles, directions, saints ("boul. St-Laurent" is "Boulevard Saint-Laurent"). */
const GENERIC = new Set(
  (
    "rue avenue av ave boulevard boul bd blvd chemin ch route rte rang montee place pl croissant crois terrasse impasse allee " +
    "promenade carre cote street st road rd drive dr court ct crescent cres lane ln way circle cir saint sainte ste " +
    "de du des la le les l d the nord sud est ouest north south east west n s e o w"
  ).split(" "),
);
/** A street name's distinctive words: "boul. De Montarville" and "Boulevard De Montarville" both give "montarville". */
export const nameCore = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !GENERIC.has(w))
    .join(" ");
/** Whether a road's name is the street of an address (by their distinctive words). */
export function sameStreet(a: string, b: string): boolean {
  const x = nameCore(a);
  const y = nameCore(b);
  return !!x && !!y && (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y)));
}

/** The street of an address ("1225 rue Lionel-Daunais, Boucherville" → "rue Lionel-Daunais"); null without a civic number. */
export function streetOf(label: string | null | undefined): string | null {
  if (!label) return null;
  // An imported stop is "Name · address"; the street is in the address's first part.
  const first = label.split(" · ").at(-1)!.split(",")[0].trim();
  const m = first.match(/^\d+[a-zA-Z]?(?:[-–]\d+[a-zA-Z]?)?\s+(.+)$/);
  return m && /[a-zA-ZÀ-ÿ]{2}/.test(m[1]) ? m[1].trim() : null;
}

/** Within this of a lot, a road with the address's street name is the one it's reached by (m). */
const STREET_M = 150;
/** The road straight in front of the place still counts as the lot's front within this of its nearest point (m). */
const FRONT_M = 15;

/** t along segment a-b (2D) of the point nearest p. */
function along(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  return l2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
}

/**
 * Where a place meets the main network: the road segment nearest its lot
 * (or the place, without one), within `maxM`; a road named like the
 * address's street wins within STREET_M of the lot, so a lot with a street
 * behind it is reached from its front. Ties go to the road nearer the place.
 * Null when no road is that close.
 */
export function snapPlace(g: RoadGraph, place: [number, number] | RoutePlace, maxM = MAX_SNAP_M): PlaceSnap | null {
  const p = placeOf(place);
  const [lat0, lon0] = p.at;
  // Metres east and north of the place.
  const kx = Math.cos(lat0 * RAD) * R * RAD;
  const ky = R * RAD;
  const X = (lon: number) => (lon - lon0) * kx;
  const Y = (lat: number) => (lat - lat0) * ky;
  // The lot's edges, or the place as a point.
  const sides: [number, number, number, number][] = [];
  for (const ring of p.lot?.length ? p.lot : [[[lon0, lat0]] as [number, number][]]) {
    if (ring.length === 1) sides.push([X(ring[0][0]), Y(ring[0][1]), X(ring[0][0]), Y(ring[0][1])]);
    for (let i = 0; i + 1 < ring.length; i++) sides.push([X(ring[i][0]), Y(ring[i][1]), X(ring[i + 1][0]), Y(ring[i + 1][1])]);
  }
  const minX = Math.min(...sides.map((e) => Math.min(e[0], e[2]))) - maxM;
  const maxX = Math.max(...sides.map((e) => Math.max(e[0], e[2]))) + maxM;
  const minY = Math.min(...sides.map((e) => Math.min(e[1], e[3]))) - maxM;
  const maxY = Math.max(...sides.map((e) => Math.max(e[1], e[3]))) + maxM;
  const wanted = p.street ? p.street : null;
  const matches = wanted ? g.names.map((n) => sameStreet(n, wanted)) : null;

  let best: { e: number; u: number; d: number; t: number; dx: number; dy: number; named: boolean; near: number } | null = null;
  for (let u = 0; u < g.lat.length; u++) {
    if (g.comp[u] !== g.main) continue;
    const ax = X(g.lon[u]);
    const ay = Y(g.lat[u]);
    for (let e = g.start[u]; e < g.start[u + 1]; e++) {
      const v = g.to[e];
      const bx = X(g.lon[v]);
      const by = Y(g.lat[v]);
      if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX || Math.max(ay, by) < minY || Math.min(ay, by) > maxY) continue;
      // The closest the road segment comes to the lot: an end of one projected on the other.
      let d = Infinity;
      let t = 0;
      let dx = 0;
      let dy = 0;
      for (const [cx, cy, ex, ey] of sides) {
        const tryPair = (tt: number, qx: number, qy: number) => {
          const rx = ax + (bx - ax) * tt;
          const ry = ay + (by - ay) * tt;
          const dd = Math.hypot(rx - qx, ry - qy);
          if (dd < d) [d, t, dx, dy] = [dd, tt, qx, qy];
        };
        tryPair(along(cx, cy, ax, ay, bx, by), cx, cy);
        tryPair(along(ex, ey, ax, ay, bx, by), ex, ey);
        for (const [tt, ox, oy] of [
          [0, ax, ay],
          [1, bx, by],
        ] as const) {
          const s2 = along(ox, oy, cx, cy, ex, ey);
          tryPair(tt, cx + (ex - cx) * s2, cy + (ey - cy) * s2);
        }
      }
      if (d > maxM) continue;
      const named = !!matches && g.name[e] >= 0 && matches[g.name[e]] && d <= STREET_M;
      const near = Math.hypot(ax + (bx - ax) * t, ay + (by - ay) * t);
      const better =
        !best ||
        (named !== best.named ? named : Math.abs(d - best.d) > 1 ? d < best.d : near < best.near);
      if (better) best = { e, u, d, t, dx, dy, named, near };
    }
  }
  if (!best) return null;
  const a = best.u;
  const b = g.to[best.e];

  // A street along the lot is nearest at a corner as much as anywhere along its front: meet it straight in front of the place.
  if (p.lot?.length) {
    const [ax, ay, bx, by] = [X(g.lon[a]), Y(g.lat[a]), X(g.lon[b]), Y(g.lat[b])];
    const tp = along(0, 0, ax, ay, bx, by);
    const rx = ax + (bx - ax) * tp;
    const ry = ay + (by - ay) * tp;
    let front: [number, number, number] = [Infinity, 0, 0];
    for (const [cx, cy, ex, ey] of sides) {
      const k = along(rx, ry, cx, cy, ex, ey);
      const qx = cx + (ex - cx) * k;
      const qy = cy + (ey - cy) * k;
      const dd = Math.hypot(qx - rx, qy - ry);
      if (dd < front[0]) front = [dd, qx, qy];
    }
    if (front[0] <= best.d + FRONT_M) [best.t, best.dx, best.dy] = [tp, front[1], front[2]];
  }

  // The segment from its lower node, with each way it can be driven.
  const edgeFrom = (from: number, to: number) => {
    for (let e = g.start[from]; e < g.start[from + 1]; e++) if (g.to[e] === to) return e;
    return -1;
  };
  const [u, v, t] = a < b ? [a, b, best.t] : [b, a, 1 - best.t];
  const road: [number, number] = [g.lat[u] + (g.lat[v] - g.lat[u]) * t, g.lon[u] + (g.lon[v] - g.lon[u]) * t];
  const door: [number, number] = p.lot?.length ? [lat0 + best.dy / ky, lon0 + best.dx / kx] : p.at;
  return { u, v, t, uv: edgeFrom(u, v), vu: edgeFrom(v, u), road, door, access: metres(road[0], road[1], door[0], door[1]) };
}

/** Where each place meets the roads (null for a place too far from any). */
export function snapPlaces(g: RoadGraph, places: ([number, number] | RoutePlace)[]): (PlaceSnap | null)[] {
  return places.map((p) => snapPlace(g, p));
}

/**
 * The fastest legs from one place to each of the others: from its point on
 * the road both ways the road allows, Dijkstra over the nodes (stopping once
 * every other place's segment is reached), then along the last segment to
 * the place's point. legs[j] is null for itself, or a place it can't reach.
 */
export function routeFrom(g: RoadGraph, snaps: (PlaceSnap | null)[], source: number): (RoadLeg | null)[] {
  const legs: (RoadLeg | null)[] = snaps.map(() => null);
  const s = snaps[source];
  if (!s) return legs;
  const nodes = g.lat.length;
  const dist = new Float64Array(nodes).fill(Infinity);
  const prevEdge = new Int32Array(nodes).fill(-1);
  const prevNode = new Int32Array(nodes).fill(-1);
  const done = new Uint8Array(nodes);
  const heap = new Heap();
  // Off the place's segment toward v (with the road's direction), or toward u (against it). At an end, that end is free.
  const seed = (n: number, cost: number) => {
    if (cost < dist[n]) {
      dist[n] = cost;
      heap.push(n, cost);
    }
  };
  if (s.uv >= 0) seed(s.v, (1 - s.t) * g.sec[s.uv]);
  else if (s.t >= 1 - 1e-9) seed(s.v, 0);
  if (s.vu >= 0) seed(s.u, s.t * g.sec[s.vu]);
  else if (s.t <= 1e-9) seed(s.u, 0);
  const wanted = new Set(snaps.flatMap((t, j) => (j !== source && t ? [t.u, t.v] : [])));
  while (heap.size && wanted.size) {
    const [n, d] = heap.pop();
    if (done[n] || d > dist[n]) continue;
    done[n] = 1;
    wanted.delete(n);
    for (let e = g.start[n]; e < g.start[n + 1]; e++) {
      const w = g.to[e];
      const nd = d + g.sec[e];
      if (nd < dist[w]) {
        dist[w] = nd;
        prevEdge[w] = e;
        prevNode[w] = n;
        heap.push(w, nd);
      }
    }
  }

  // The first stretch, off the place's segment (to the node the chain starts from).
  const firstStretch = (n: number): [number, number] => (n === s.v && s.uv >= 0 ? [s.uv, 1 - s.t] : n === s.u && s.vu >= 0 ? [s.vu, s.t] : [-1, 0]);
  snaps.forEach((tj, j) => {
    if (j === source || !tj) return;
    // Arriving from u (along u to v), from v (along v to u), or straight along the segment both are on.
    const options: { cost: number; from: number; edge: number; share: number }[] = [];
    if (Number.isFinite(dist[tj.u]) && (tj.uv >= 0 || tj.t <= 1e-9)) options.push({ cost: dist[tj.u] + (tj.uv >= 0 ? tj.t * g.sec[tj.uv] : 0), from: tj.u, edge: tj.uv, share: tj.t });
    if (Number.isFinite(dist[tj.v]) && (tj.vu >= 0 || tj.t >= 1 - 1e-9))
      options.push({ cost: dist[tj.v] + (tj.vu >= 0 ? (1 - tj.t) * g.sec[tj.vu] : 0), from: tj.v, edge: tj.vu, share: 1 - tj.t });
    if (tj.u === s.u && tj.v === s.v) {
      if (tj.t >= s.t && s.uv >= 0) options.push({ cost: (tj.t - s.t) * g.sec[s.uv], from: -1, edge: s.uv, share: tj.t - s.t });
      if (tj.t <= s.t && s.vu >= 0) options.push({ cost: (s.t - tj.t) * g.sec[s.vu], from: -1, edge: s.vu, share: s.t - tj.t });
    }
    if (!options.length) return;
    const best = options.reduce((a, b) => (b.cost < a.cost ? b : a));

    // The stretches driven, in order: [edge, share of it].
    const stretches: [number, number][] = [];
    const chain: number[] = [];
    if (best.from >= 0) {
      let n = best.from;
      for (; prevNode[n] >= 0; n = prevNode[n]) {
        chain.push(n);
        stretches.push([prevEdge[n], 1]);
      }
      chain.push(n);
      stretches.push(firstStretch(n));
      chain.reverse();
      stretches.reverse();
    }
    if (best.edge >= 0) stretches.push([best.edge, best.share]);
    const byName = new Map<number, number>();
    let onRoads = 0;
    for (const [e, share] of stretches) {
      if (e < 0 || share <= 0) continue;
      const m = g.len[e] * share;
      onRoads += m;
      if (g.name[e] >= 0) byName.set(g.name[e], (byName.get(g.name[e]) ?? 0) + m);
    }
    const order = [...new Set(stretches.filter(([e, share]) => e >= 0 && share > 0 && g.name[e] >= 0).map(([e]) => g.name[e]))];
    const longest = new Set([...byName].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n));
    const access = s.access + tj.access;
    const path: [number, number][] = [s.door, s.road, ...chain.map((n): [number, number] => [g.lat[n], g.lon[n]]), tj.road, tj.door];
    legs[j] = {
      minutes: (best.cost + access / (ACCESS_KMH / 3.6)) / 60,
      km: (onRoads + access) / 1000,
      path: path.filter((pt, k) => k === 0 || pt[0] !== path[k - 1][0] || pt[1] !== path[k - 1][1]),
      via: order.filter((n) => longest.has(n)).map((n) => g.names[n]),
    };
  });
  return legs;
}

/** Every leg between the places (legs[i][j], i to j), on the roads. */
export function routeAll(g: RoadGraph, places: ([number, number] | RoutePlace)[]): (RoadLeg | null)[][] {
  const snaps = snapPlaces(g, places);
  return places.map((_, i) => routeFrom(g, snaps, i));
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
