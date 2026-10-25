import { describe, expect, it } from "vitest";
import { buildRoadGraph, maxspeedKmh, oneway, roadBoxes, roadKmh, routeAll, snap } from "./roads";

/** Overpass JSON for roads drawn in metres from 45.5 N, -73.5 (a node per distinct point, shared where roads meet). */
const M_LAT = 1 / 111_320;
const M_LON = 1 / (111_320 * Math.cos((45.5 * Math.PI) / 180));
const at = (x: number, y: number): [number, number] => [45.5 + y * M_LAT, -73.5 + x * M_LON];
function roads(...ways: [[number, number][], Record<string, string>][]) {
  const ids = new Map<string, number>();
  const elements: object[] = [];
  let id = 1;
  for (const [points, tags] of ways) {
    const nodes = points.map(([x, y]) => {
      const key = `${x},${y}`;
      if (!ids.has(key)) {
        ids.set(key, id);
        const [lat, lon] = at(x, y);
        elements.push({ type: "node", id: id++, lat, lon });
      }
      return ids.get(key)!;
    });
    elements.push({ type: "way", id: id++, nodes, tags });
  }
  return { version: 0.6, elements };
}
const street = (name: string, extra: Record<string, string> = {}) => ({ highway: "residential", name, ...extra });

describe("road tags", () => {
  it("reads speed limits in km/h or mph", () => {
    expect(maxspeedKmh("50")).toBe(50);
    expect(maxspeedKmh("40 km/h")).toBe(40);
    expect(maxspeedKmh("30 mph")).toBeCloseTo(48.3, 1);
    expect(maxspeedKmh("CA:urban")).toBeNull();
    expect(maxspeedKmh(undefined)).toBeNull();
  });

  it("drives at 80 % of the limit, or a typical speed for the road", () => {
    expect(roadKmh({ highway: "residential", maxspeed: "50" })).toBe(40);
    expect(roadKmh({ highway: "residential" })).toBe(30);
    expect(roadKmh({ highway: "primary" })).toBe(55);
  });

  it("knows one-way streets, roundabouts and motorways", () => {
    expect(oneway({ highway: "residential", oneway: "yes" })).toBe(1);
    expect(oneway({ highway: "residential", oneway: "-1" })).toBe(-1);
    expect(oneway({ highway: "primary", junction: "roundabout" })).toBe(1);
    expect(oneway({ highway: "motorway" })).toBe(1);
    expect(oneway({ highway: "motorway", oneway: "no" })).toBe(0);
    expect(oneway({ highway: "residential" })).toBe(0);
  });
});

describe("routes on the streets", () => {
  // Two parallel streets 200 m apart, joined at both ends; Rue Nord is one-way going east.
  const json = roads(
    [[[0, 0], [500, 0], [1000, 0]], street("Rue Sud")],
    [[[0, 200], [500, 200], [1000, 200]], street("Rue Nord", { oneway: "yes" })],
    [[[0, 0], [0, 200]], street("Rue Ouest")],
    [[[1000, 0], [1000, 200]], street("Rue Est")],
    // A footpath straight across is no road for a truck.
    [[[500, 0], [500, 200]], { highway: "footway" }],
    // An unconnected lane far off.
    [[[3000, 3000], [3100, 3000]], street("Rue Isolée")],
  );
  const g = buildRoadGraph(json);

  it("leaves paths out and keeps the connected network as the main one", () => {
    const a = snap(g, at(500, 10));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(snap(g, at(3050, 3005))).toBe(-1);
  });

  it("follows the streets between two stops, with its length, time and the streets taken", () => {
    const [[, ab]] = routeAll(g, [at(500, -10), at(1000, 210)]);
    // Along Rue Sud to the east end, then up Rue Est: 700 m plus the curb at each end.
    expect(ab!.km).toBeCloseTo(0.72, 2);
    expect(ab!.minutes).toBeCloseTo((700 / (30 / 3.6) + 20 / (15 / 3.6)) / 60, 1);
    expect(ab!.via).toEqual(["Rue Sud", "Rue Est"]);
    expect(ab!.path[0]).toEqual(at(500, -10));
    expect(ab!.path.at(-1)).toEqual(at(1000, 210));
  });

  it("goes around a one-way street the wrong way", () => {
    const legs = routeAll(g, [at(500, 210), at(0, 210)]);
    // East then west on Rue Nord isn't allowed: round by Rue Est, Rue Sud and Rue Ouest.
    expect(legs[0][1]!.km).toBeCloseTo(0.5 + 0.2 + 1 + 0.2 + 0.02, 2);
    expect(legs[1][0]!.km).toBeCloseTo(0.52, 2);
  });

  it("has no route for a place far from every road", () => {
    const legs = routeAll(g, [at(500, 0), at(5000, 5000)]);
    expect(legs[0][1]).toBeNull();
    expect(legs[1][0]).toBeNull();
  });

  it("takes each way once across several answers (main roads and streets overlap)", () => {
    expect(buildRoadGraph(json, json).to.length).toBe(g.to.length);
  });
});

describe("where a run's roads come from", () => {
  it("reads the main roads across the run and every street around each place, on a shared grid", () => {
    const boxes = roadBoxes([
      [45.4442, -73.3335],
      [45.4505, -73.312],
      [45.4449, -73.3331],
    ]);
    expect(boxes.roads).toEqual({ south: 45.42, west: -73.36, north: 45.48, east: -73.29 });
    // The first and third places share a neighbourhood box.
    expect(boxes.streets).toEqual([
      { south: 45.43, west: -73.35, north: 45.46, east: -73.32 },
      { south: 45.44, west: -73.33, north: 45.47, east: -73.3 },
    ]);
    for (const b of boxes.streets) expect(b.north - b.south).toBeLessThanOrEqual(0.05);
  });

  it("leaves the main roads out when the run is spread too wide for one lookup", () => {
    expect(roadBoxes([[45.4, -73.5], [45.9, -73.5]]).roads).toBeNull();
    expect(roadBoxes([]).streets).toEqual([]);
  });
});
