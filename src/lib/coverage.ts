/**
 * How much work an area is for a robot, beyond its size: straight stripes in
 * the best direction (a rectangle is a few long runs; an S-shaped or ragged
 * zone is many short, broken ones, each ending in a turn, with hops between
 * the pieces), a slower lap along every edge (an S has twice a square's), the
 * trips to and from the charger every time the battery runs low, the
 * drive from one separate area to the next, and going around every tree
 * trunk (each cuts a few stripes and needs a lap). Everything is
 * compared with a plain square of the same area with the charger at its
 * edge, which is what a robot's rated area assumes, so a simple lawn comes
 * out at 1 and a hard one above it. Geometry is in local metres. Pure, so
 * it's tested without a browser.
 */

/** A polygon in local metres: outer ring, then holes. */
export type LocalPolygon = [number, number][][];

/** Stripe layout in the best direction, per metre of stripe width (divide by a robot's stripe to get its count). */
export interface Stripes {
  /** Mowing direction, degrees from east. */
  angleDeg: number;
  /** Straight runs × stripe width (m): runs at stripe s ≈ runs1 / s, each ending in a turn. */
  runs1: number;
  /** Gaps between the pieces of broken stripes × stripe width (m²): the robot drives around them. */
  hops1: number;
  /** Length of every edge, holes included (m): the robot cuts a lap along each. */
  edgeM: number;
}

/** Driving distances from the charger (m). */
export interface Reach {
  /** Average distance from the charger to the mowed area, the way the robot drives. */
  avgM: number;
  /** Farthest mowed point. */
  farM: number;
  /** From the charger through every separate area once, nearest first. */
  tourM: number;
}

/** How a robot works: its stripe (cut width less the overlap), speed, a turn's time and its run time per charge. */
export interface Pace {
  stripeM: number;
  speedMS: number;
  turnS: number;
  runtimeMin: number;
}

/** Driving around the end of a broken stripe to reach its next piece takes about this much more than the gap. */
const HOP_DETOUR = 1.5;
/** Edge laps go at about half the stripe speed (following a curve, close to obstacles). */
const EDGE_SPEED = 0.5;
/** A turn weighs about as much as this many metres of driving when choosing the direction. */
const TURN_AS_M = 3;
/** Robots drive along paths, not as the crow flies, between areas on a course or a farm. */
const FIELD_DETOUR = 1.2;
/** A tree trunk with its root flare and the clearance a robot keeps (m): the stripes it cuts and the lap around it. */
const TRUNK_M = 1;

const area = (ring: [number, number][]) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a) / 2;
};
/** Area of a polygon with its holes (m²). */
export const polygonArea = (p: LocalPolygon) => p.reduce((s, ring, i) => s + (i === 0 ? area(ring) : -area(ring)), 0);

function centroid(p: LocalPolygon): [number, number] {
  const ring = p[0];
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  if (!a) return ring[0];
  return [x / (3 * a), y / (3 * a)];
}

/** Straight runs and hop length across one area at `refM` spacing, with stripes at `deg`. */
function stripeCount(part: LocalPolygon, deg: number, refM: number): { runs: number; hops: number } {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  // Along the stripe (u) and across it (v).
  const rings = part.map((ring) => ring.map(([x, y]) => [x * c + y * s, -x * s + y * c] as const));
  let vMin = Infinity, vMax = -Infinity;
  for (const [, v] of rings[0]) {
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }
  let runs = 0, hops = 0;
  for (let v = vMin + refM / 2; v < vMax; v += refM) {
    const cross: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [u1, v1] = ring[j], [u2, v2] = ring[i];
        if (v1 > v !== v2 > v) cross.push(u1 + ((v - v1) / (v2 - v1)) * (u2 - u1));
      }
    }
    cross.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cross.length; k += 2) {
      runs++;
      if (k > 0) hops += cross[k] - cross[k - 1];
    }
  }
  return { runs, hops };
}

/**
 * Stripes across each area at `refM` spacing, in the direction (every 5°)
 * with the fewest turns and hops for that area, as a robot sets each zone's
 * direction: each stripe line is cut by the area's edges into pieces (one on
 * a convex area, several across an S or a U). Separate areas are striped
 * separately (getting between them is travel, not hops). The angle reported
 * is the biggest area's.
 */
export function stripes(parts: LocalPolygon[], refM: number): Stripes {
  let edgeM = 0;
  for (const ring of parts.flat()) {
    for (let i = 1; i < ring.length; i++) edgeM += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
  }
  let runs = 0, hops = 0, angleDeg = 0, biggest = -1;
  for (const part of parts) {
    let best = { deg: 0, runs: 0, hops: 0 }, bestCost = Infinity;
    for (let deg = 0; deg < 180; deg += 5) {
      const n = stripeCount(part, deg, refM);
      const cost = n.runs * TURN_AS_M + n.hops;
      if (cost < bestCost) {
        bestCost = cost;
        best = { deg, ...n };
      }
    }
    runs += best.runs;
    hops += best.hops;
    const a = polygonArea(part);
    if (a > biggest) {
      biggest = a;
      angleDeg = best.deg;
    }
  }
  return { angleDeg, runs1: runs * refM, hops1: hops * refM, edgeM };
}

/** A grid over the lot in local metres; masks are row-major from the top-left. */
interface Grid {
  x0: number;
  y0: number;
  cell: number;
  w: number;
  h: number;
}

/** Marks cells whose centres are inside any of the polygons (even-odd, holes respected) with `value`. */
function fill(mask: Int32Array | Uint8Array, polys: LocalPolygon[], g: Grid, value: number | ((i: number) => number)) {
  polys.forEach((rings, n) => {
    for (let r = 0; r < g.h; r++) {
      const y = g.y0 - (r + 0.5) * g.cell;
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [x1, y1] = ring[j], [x2, y2] = ring[i];
          if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - g.x0) / g.cell - 0.5));
        const c1 = Math.min(g.w - 1, Math.ceil((xs[k + 1] - g.x0) / g.cell - 0.5) - 1);
        for (let c = c0; c <= c1; c++) mask[r * g.w + c] = typeof value === "number" ? value : value(n);
      }
    }
  });
}

/** Shortest driving distance (m) from the source cells to every cell, over passable cells (8 neighbours). */
function dijkstra(sources: number[], passable: Uint8Array, g: Grid): Float64Array {
  const dist = new Float64Array(g.w * g.h).fill(Infinity);
  // Binary heap of cell indices keyed by dist.
  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (dist[heap[p]] <= dist[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l;
        if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (const s of sources) {
    dist[s] = 0;
    push(s);
  }
  const diag = Math.SQRT2 * g.cell;
  while (heap.length) {
    const i = pop();
    const r = Math.floor(i / g.w), c = i - r * g.w;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= g.h || cc < 0 || cc >= g.w) continue;
        const j = rr * g.w + cc;
        if (!passable[j]) continue;
        const d = dist[i] + (dr && dc ? diag : g.cell);
        if (d < dist[j]) {
          dist[j] = d;
          push(j);
        }
      }
    }
  }
  return dist;
}

/**
 * Driving distances on a lot: over the lot, around buildings and pools
 * (`blocked`), on a grid of about 0.5 m. The robot crosses paving and the
 * rest of the lot freely, the way RTK robots drive between zones.
 */
export function reachOnLot(lawn: LocalPolygon[], lot: LocalPolygon[], blocked: LocalPolygon[], charger: [number, number]): Reach {
  const lotArea = lot.reduce((s, p) => s + polygonArea(p), 0);
  const cell = Math.max(0.5, Math.sqrt(lotArea / 40000));
  const xs = lot.flatMap((p) => p[0].map((q) => q[0])).concat(charger[0]);
  const ys = lot.flatMap((p) => p[0].map((q) => q[1])).concat(charger[1]);
  const g: Grid = { x0: Math.min(...xs) - cell, y0: Math.max(...ys) + cell, cell, w: 0, h: 0 };
  g.w = Math.ceil((Math.max(...xs) + cell - g.x0) / cell);
  g.h = Math.ceil((g.y0 - (Math.min(...ys) - cell)) / cell);
  const passable = new Uint8Array(g.w * g.h);
  fill(passable, lot, g, 1);
  fill(passable, lawn, g, 1);
  fill(passable, blocked, g, 0);
  // Which lawn area each cell is in (1-based; 0 = not lawn).
  const partOf = new Int32Array(g.w * g.h);
  fill(partOf, lawn, g, (n) => n + 1);

  const cellOf = ([x, y]: [number, number]) => {
    const c = Math.min(g.w - 1, Math.max(0, Math.floor((x - g.x0) / cell)));
    const r = Math.min(g.h - 1, Math.max(0, Math.floor((g.y0 - y) / cell)));
    return r * g.w + c;
  };
  // The charger sits on the nearest cell the robot can drive on.
  let start = cellOf(charger);
  if (!passable[start]) {
    let bestD = Infinity;
    for (let i = 0; i < passable.length; i++) {
      if (!passable[i]) continue;
      const r = Math.floor(i / g.w), c = i - r * g.w;
      const d = Math.hypot(g.x0 + (c + 0.5) * cell - charger[0], g.y0 - (r + 0.5) * cell - charger[1]);
      if (d < bestD) {
        bestD = d;
        start = i;
      }
    }
  }
  passable[start] = 1;
  const fromCharger = dijkstra([start], passable, g);

  const parts = lawn.length;
  const cellsOf: number[][] = Array.from({ length: parts }, () => []);
  let sum = 0, n = 0, far = 0;
  for (let i = 0; i < partOf.length; i++) {
    if (!partOf[i]) continue;
    cellsOf[partOf[i] - 1].push(i);
    let d = fromCharger[i];
    if (!Number.isFinite(d)) {
      // Walled in (by mapped buildings): count it as the crow flies, with a detour.
      const r = Math.floor(i / g.w), c = i - r * g.w;
      d = 1.5 * Math.hypot(g.x0 + (c + 0.5) * cell - charger[0], g.y0 - (r + 0.5) * cell - charger[1]);
    }
    sum += d;
    n++;
    far = Math.max(far, d);
  }
  if (!n) return { avgM: 0, farM: 0, tourM: 0 };

  // Nearest-first tour of the separate areas.
  const minTo = (dist: Float64Array, k: number) => cellsOf[k].reduce((m, i) => Math.min(m, dist[i]), Infinity);
  const left = new Set(cellsOf.map((cells, k) => k).filter((k) => cellsOf[k].length));
  let tour = 0;
  let dist = fromCharger;
  while (left.size) {
    let next = -1, nextD = Infinity;
    for (const k of left) {
      const d = minTo(dist, k);
      if (d < nextD) {
        nextD = d;
        next = k;
      }
    }
    if (next < 0) break;
    tour += Number.isFinite(nextD) ? nextD : 0;
    left.delete(next);
    if (left.size) dist = dijkstra(cellsOf[next], passable, g);
  }
  return { avgM: sum / n, farM: far, tourM: tour };
}

/**
 * Driving distances on a course or a farm, from the shapes alone: to each
 * area's middle (with its spread: the average point of a disc of radius R is
 * 2/3 R from its centre), and a nearest-first tour between them, all with a
 * detour for driving along paths.
 */
export function reachOnFields(parts: LocalPolygon[], charger: [number, number]): Reach {
  const items = parts.map((p) => {
    const a = polygonArea(p);
    const c = centroid(p);
    return { a, c, r: Math.sqrt(a / Math.PI) };
  });
  const total = items.reduce((s, it) => s + it.a, 0);
  if (!total) return { avgM: 0, farM: 0, tourM: 0 };
  const d = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const avg = items.reduce((s, it) => s + it.a * Math.hypot(d(charger, it.c), (2 / 3) * it.r), 0) / total;
  const far = Math.max(...parts.flatMap((p) => p[0].map((q) => d(charger, q))));
  const left = new Set(items.map((_, k) => k));
  let at = charger, atR = 0, tour = 0;
  while (left.size) {
    let next = -1, nextD = Infinity;
    for (const k of left) {
      const gap = Math.max(0, d(at, items[k].c) - atR - items[k].r);
      if (gap < nextD) {
        nextD = gap;
        next = k;
      }
    }
    tour += nextD;
    left.delete(next);
    at = items[next].c;
    atR = items[next].r;
  }
  return { avgM: avg * FIELD_DETOUR, farM: far * FIELD_DETOUR, tourM: tour * FIELD_DETOUR };
}

/** Everything about an area's coverage that doesn't depend on the robot, and the same for a square of its size. */
export interface Coverage {
  areaM2: number;
  stripes: Stripes;
  reach: Reach;
  /** Trees standing in the mowed area (terrain.ts). */
  trees: number;
  base: { stripes: Stripes; reach: Reach };
}

/**
 * One unit's share when several robots split the area, each with its own zone
 * and charger: lengths (stripes' turns and edges, driving) shrink with the
 * square root of the share, areas (mowing, broken stripes, trees) with the
 * share itself. Its square is scaled the same way, so a big property's long
 * drives shrink and its zones' extra turns show.
 */
export function share(c: Coverage, units: number): Coverage {
  if (units <= 1) return c;
  const k = 1 / units, r = Math.sqrt(k);
  const scale = (s: Stripes): Stripes => ({ ...s, runs1: s.runs1 * r, hops1: s.hops1 * k, edgeM: s.edgeM * r });
  const near = (q: Reach): Reach => ({ avgM: q.avgM * r, farM: q.farM * r, tourM: q.tourM * r });
  return {
    areaM2: c.areaM2 * k,
    stripes: scale(c.stripes),
    reach: near(c.reach),
    trees: c.trees * k,
    base: { stripes: scale(c.base.stripes), reach: near(c.base.reach) },
  };
}

/** A square of `areaM2` with the charger at the middle of one edge, measured the same way (on a lot or on fields). */
export function baseline(areaM2: number, onLot: boolean, refM: number): { stripes: Stripes; reach: Reach } {
  const side = Math.sqrt(areaM2);
  const square: LocalPolygon = [[[0, 0], [side, 0], [side, side], [0, side], [0, 0]]];
  const charger: [number, number] = [side / 2, 0];
  return {
    stripes: stripes([square], refM),
    reach: onLot ? reachOnLot([square], [square], [], charger) : reachOnFields([square], charger),
  };
}

interface Work {
  /** Mowing along the stripes, turns, hops around broken stripes, edge laps, going around trees, and driving (s). */
  mowS: number;
  turnsS: number;
  hopsS: number;
  edgeS: number;
  treesS: number;
  travelS: number;
  totalS: number;
  /** Charges it takes to mow everything once. */
  cycles: number;
}

/**
 * Time for one robot to mow the area once. A trunk cuts TRUNK_M / stripe
 * stripes (each an extra turn and a hop of TRUNK_M around it) and takes a lap.
 */
function workTime(areaM2: number, s: Stripes, reach: Reach, trees: number, pace: Pace): Work {
  const mowS = areaM2 / (pace.stripeM * pace.speedMS);
  const turnsS = (s.runs1 / pace.stripeM) * pace.turnS;
  const hopsS = ((s.hops1 / pace.stripeM) * HOP_DETOUR) / pace.speedMS;
  const edgeS = s.edgeM / (pace.speedMS * EDGE_SPEED);
  const perTree = (TRUNK_M / pace.stripeM) * (pace.turnS + (TRUNK_M * HOP_DETOUR) / pace.speedMS) + (Math.PI * TRUNK_M) / (pace.speedMS * EDGE_SPEED);
  const treesS = trees * perTree;
  const busy = mowS + turnsS + hopsS + edgeS + treesS;
  const cycles = Math.max(1, busy / (pace.runtimeMin * 60));
  const travelS = (cycles * 2 * reach.avgM + reach.tourM) / pace.speedMS;
  return { mowS, turnsS, hopsS, edgeS, treesS, travelS, totalS: busy + travelS, cycles };
}

/** How much more work the area is than the square its rating assumes, for one robot. */
export interface Overhead {
  /** Total time over the square's (1 = as rated). */
  factor: number;
  /** Extra time in turns, broken stripes and edges, going around trees, and driving, as shares of the square's total. */
  shape: number;
  trees: number;
  travel: number;
  /** Hours to mow it all once. */
  hours: number;
}

export function overhead(c: Coverage, pace: Pace): Overhead {
  const site = workTime(c.areaM2, c.stripes, c.reach, c.trees, pace);
  const base = workTime(c.areaM2, c.base.stripes, c.base.reach, 0, pace);
  const busy = (w: Work) => w.totalS - w.travelS - w.treesS;
  return {
    factor: site.totalS / base.totalS,
    shape: (busy(site) - busy(base)) / base.totalS,
    trees: site.treesS / base.totalS,
    travel: (site.travelS - base.travelS) / base.totalS,
    hours: site.totalS / 3600,
  };
}
