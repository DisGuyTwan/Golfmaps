import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import { lawnEdges, lawnTotals, type LawnMeasurement } from "./lawn";
import {
  BLOW_SQFT_PER_H,
  DEFAULT_RUN,
  ROAD_FACTOR,
  TRIM_FT_PER_H,
  bestOrder,
  decodeRun,
  distanceKm,
  driveMin,
  encodeRun,
  overWorkday,
  planRun,
  readyStops,
  runOrder,
  straightDrive,
  directionsLinks,
  type DriveFn,
  stopSite,
  stopWork,
  type StopWork,
} from "./run";

/** A rectangle of [lon, lat] corners, x and y in metres from a corner at 45.5 N, -73.5. */
const M_LON = 1 / (111_320 * Math.cos((45.5 * Math.PI) / 180));
const M_LAT = 1 / 111_320;
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => {
  const p = (x: number, y: number) => [-73.5 + x * M_LON, 45.5 + y * M_LAT];
  return { type: "Polygon", coordinates: [[p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1), p(x0, y0)]] };
};

// A 30 × 40 m lot: a 10 × 10 m house, and a 4 m wide driveway from the street (y = 0) to it.
const lot: LawnMeasurement = {
  lot: rect(0, 0, 30, 40),
  lotSource: "cadastre",
  lotNumber: "1 234 567",
  pickPoint: null,
  mapped: [
    { id: "b1", kind: "building", geometry: rect(10, 20, 20, 30) },
    { id: "p1", kind: "paving", geometry: rect(13, 0, 17, 20) },
  ],
  mappedFailed: false,
  traced: [],
};

describe("what a stop takes", () => {
  it("trims every lawn edge and blows along the paving", () => {
    const { edgeM, hardEdgeM } = lawnEdges(lawnTotals(lot));
    // Lot 140 m, less the driveway's 4 m mouth, plus its two 20 m sides, plus the house's 40 m less its 4 m at the driveway.
    expect(edgeM).toBeCloseTo(140 - 4 + 40 + 40 - 4, 0);
    expect(hardEdgeM).toBeCloseTo(40, 0);
  });

  it("times the crew at 1,500 ft of trimming and 25,000 sq ft of blowing an hour", () => {
    const s = stopSite(lot, null)!;
    expect(s.lawnM2).toBeCloseTo(1200 - 100 - 80, -1);
    const w = stopWork(s, "KR800");
    expect(w.trimMin).toBeCloseTo(((s.edgeM * 3.28084) / TRIM_FT_PER_H) * 60, 6);
    expect(w.trimMin).toBeGreaterThan(8);
    expect(w.blowMin).toBeCloseTo(((40 * 3.28084 * 3) / BLOW_SQFT_PER_H) * 60, 1);
    // The Voyager mows a quarter acre in minutes, the 60 in. deck faster than the 40 in.
    expect(w.mowMin).toBeGreaterThan(2);
    expect(w.mowMin).toBeLessThan(30);
    expect(stopWork(s, "KR804").mowMin).toBeLessThan(w.mowMin);
  });

  it("has nothing to plan on a lot with no lawn", () => {
    expect(stopSite({ ...lot, mapped: [{ id: "b", kind: "building", geometry: rect(0, 0, 30, 40) }] }, null)).toBeNull();
  });
});

describe("driving", () => {
  it("goes by road: the straight line × 1.3 at the average speed", () => {
    const a: [number, number] = [45.5, -73.5];
    const b: [number, number] = [45.509, -73.5];
    expect(distanceKm(a, b)).toBeCloseTo(1.0, 2);
    expect(driveMin(a, b, 30)).toBeCloseTo(((1.0 * ROAD_FACTOR) / 30) * 60, 1);
    expect(driveMin(a, b, 0)).toBe(0);
  });
});

describe("the order with the least driving", () => {
  const line = (xs: number[]) => (i: number, j: number) => Math.abs(xs[i] - xs[j]);

  it("visits stops along a street in order, from the nearer end", () => {
    const xs = [3, 0, 4, 1, 2];
    const order = bestOrder(5, line(xs));
    expect(order.map((i) => xs[i])).toEqual(order[0] === 1 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0]);
  });

  it("from a shop at one end and back, out and home again", () => {
    const xs = [3, 1, 2];
    const order = bestOrder(3, line(xs), (j) => xs[j], (i) => xs[i]);
    expect(order.map((i) => xs[i])).toEqual(expect.arrayContaining([1, 2, 3]));
    const cost = (o: number[]) => xs[o[0]] + xs[o[o.length - 1]] + o.slice(1).reduce((t, i, k) => t + Math.abs(xs[i] - xs[o[k]]), 0);
    expect(cost(order)).toBe(6);
  });

  it("goes round a ring of 20 stops (past the exact search) without crossing itself", () => {
    const n = 20;
    const pts = Array.from({ length: n }, (_, k) => [(k * 7) % n].map((i) => [Math.cos((2 * Math.PI * i) / n), Math.sin((2 * Math.PI * i) / n)])[0]);
    const d = (i: number, j: number) => Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
    const order = bestOrder(n, d, (j) => d(j, j) + Math.hypot(pts[j][0] - 1, pts[j][1]), (i) => Math.hypot(pts[i][0] - 1, pts[i][1]));
    expect(new Set(order).size).toBe(n);
    const tour = order.reduce((t, i, k) => (k ? t + d(order[k - 1], i) : t), 0);
    // The ring's own order: n chords of 2 sin(π / n).
    expect(tour).toBeLessThan((n - 1) * 2 * Math.sin(Math.PI / n) + 1e-6 + 2 * Math.sin(Math.PI / n));
  });
});

describe("the day", () => {
  // Three stops 1 km apart going north, entered out of order; a shop 1 km south of the first.
  const p = (km: number): [number, number] => [45.5 + km / 111.2, -73.5];
  const points = [p(2), p(0), p(1)];
  const work = (mowMin: number, trimMin: number, blowMin: number): StopWork => ({ mowMin, trimMin, blowMin, fits: true, notes: [] });
  const works = [work(30, 40, 4), work(20, 10, 2), null];
  const settings = { ...DEFAULT_RUN, crew: 2, setupMin: 10, speedKmh: 30, startMin: 7 * 60 };

  it("leaves out stops still measuring, and plans the rest from the shop and back", () => {
    const plan = planRun(points, works, [1000, 800, 900], p(-1), settings);
    expect(plan.stops.map((s) => s.index)).toEqual([1, 0]);
    const leg = driveMin(p(0), p(2), 30);
    expect(plan.stops[0].driveMin).toBeCloseTo(driveMin(p(-1), p(0), 30), 6);
    expect(plan.stops[1].driveMin).toBeCloseTo(leg, 6);
    expect(plan.returnMin).toBeCloseTo(driveMin(p(2), p(-1), 30), 6);
    expect(plan.acres).toBeCloseTo(1800 / 4046.86, 6);
  });

  it("takes set-up plus the longer of the mowing and the crew's work, shared among them", () => {
    const plan = planRun(points, works, [1000, 800, 900], null, settings);
    const [first, second] = plan.stops;
    expect(first.arriveMin).toBe(7 * 60);
    // Stop 2 (index 1): mowing 20 min, crew (10 + 2) / 2 = 6 min: the crew waits 14.
    expect(first.leaveMin - first.arriveMin).toBeCloseTo(10 + 20, 6);
    expect(first.crewWaitMin).toBeCloseTo(14, 6);
    // Stop 1 (index 0): crew (40 + 4) / 2 = 22 min against 30 of mowing.
    expect(second.leaveMin - second.arriveMin).toBeCloseTo(10 + 30, 6);
    expect(plan.totalMin).toBeCloseTo(plan.driveMin + 70, 6);
    expect(plan.endMin).toBeCloseTo(7 * 60 + plan.totalMin, 6);
    // One person alone: 44 min of trimming and blowing outlasts the mowing.
    const alone = planRun(points, works, [1000, 800, 900], null, { ...settings, crew: 1 });
    expect(alone.mowerWaitMin).toBeCloseTo(44 - 30, 6);
    expect(alone.totalMin).toBeGreaterThan(plan.totalMin);
  });

  it("works the order out once for every speed, Voyager and crew", () => {
    const order = runOrder(readyStops(works), true, straightDrive(points, p(-1), 1));
    expect(order).toEqual([1, 0]);
    for (const s of [settings, { ...settings, speedKmh: 60, crew: 1 }]) {
      expect(planRun(points, works, [1000, 800, 900], p(-1), s, { order })).toEqual(planRun(points, works, [1000, 800, 900], p(-1), s));
    }
  });

  it("drives as the roads say once they've loaded, in the order they make best", () => {
    // One-way streets: stop 0 to stop 1 is a long way round, stop 1 to stop 0 isn't, so the run goes to 1 first.
    const roadMin: Record<string, number> = { "-1>0": 5, "0>-1": 5, "-1>1": 6, "1>-1": 6, "0>1": 30, "1>0": 12 };
    const drive: DriveFn = (a, b) => roadMin[`${a}>${b}`];
    const plan = planRun(points, works, [1000, 800, 900], p(-1), settings, { drive });
    expect(plan.stops.map((s) => [s.index, s.driveMin])).toEqual([
      [1, 6],
      [0, 12],
    ]);
    expect(plan.returnMin).toBe(5);
    expect(plan.driveMin).toBe(23);
    expect(plan.enteredDriveMin).toBe(41);
  });

  it("says what the order saves against the order entered", () => {
    const three = [work(10, 10, 1), work(10, 10, 1), work(10, 10, 1)];
    const plan = planRun(points, three, [1, 1, 1], null, settings);
    expect(plan.enteredDriveMin).toBeCloseTo(driveMin(p(2), p(0), 30) + driveMin(p(0), p(1), 30), 6);
    expect(plan.driveMin).toBeCloseTo(driveMin(p(0), p(2), 30), 6);
    expect(overWorkday(plan)).toBe(false);
  });
});

describe("share link", () => {
  it("round-trips the stops, their names, the shop and the settings", () => {
    const run = {
      stops: [
        { point: [45.44425, -73.3335] as [number, number], label: "123 Rue Principale" },
        { point: [45.45, -73.34] as [number, number], label: null },
      ],
      shop: { point: [45.4, -73.3] as [number, number], label: "Garage" },
      settings: { voyager: "KR804" as const, crew: 3, speedKmh: 40, setupMin: 15, startMin: 6 * 60 + 45 },
    };
    const params = new URLSearchParams(Object.entries(encodeRun(run)).filter((e): e is [string, string] => e[1] !== undefined));
    expect(params.get("rt")).toBe("06:45");
    expect(decodeRun(params)).toEqual(run);
  });

  it("leaves defaults out, and ignores what isn't a run", () => {
    const params = encodeRun({ stops: [], shop: null, settings: DEFAULT_RUN });
    expect(Object.values(params).filter(Boolean)).toEqual(["run"]);
    expect(decodeRun(new URLSearchParams("a=lawn"))).toBeNull();
    expect(decodeRun(new URLSearchParams("a=run&rc=9&rk=abc"))?.settings).toEqual({ ...DEFAULT_RUN, crew: 3 });
  });
});

describe("directions for the crew", () => {
  const route = Array.from({ length: 14 }, (_, i): [number, number] => [45.4 + i / 1000, -73.3]);

  it("opens the run in Google Maps, the stops in order between the start and the end", () => {
    const [link] = directionsLinks(route.slice(0, 4));
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("45.400000,-73.300000");
    expect(url.searchParams.get("waypoints")).toBe("45.401000,-73.300000|45.402000,-73.300000");
    expect(url.searchParams.get("destination")).toBe("45.403000,-73.300000");
    expect(url.searchParams.get("travelmode")).toBe("driving");
  });

  it("splits a long run in parts of up to 9 stops between, each starting where the last ended", () => {
    const links = directionsLinks(route).map((l) => new URL(l).searchParams);
    expect(links).toHaveLength(2);
    expect(links[0].get("waypoints")!.split("|")).toHaveLength(9);
    expect(links[1].get("origin")).toBe(links[0].get("destination"));
    expect(links[1].get("destination")).toBe("45.413000,-73.300000");
    expect(directionsLinks(route.slice(0, 1))).toEqual([]);
  });
});
