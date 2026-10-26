import { describe, expect, it } from "vitest";
import area from "@turf/area";
import type { Polygon } from "geojson";
import {
  COVER,
  NO_SLOPE,
  coverClasses,
  decodeTerrain,
  fromLambert,
  lidarBuildings,
  slopeDeg,
  slopePct,
  steepAreas,
  terrainCellM,
  terrainStats,
  toLambert,
  toLatLonGrid,
  type NativeRaster,
} from "./terrain";

// EPSG:4617 → EPSG:3979 from pyproj (PROJ 9), as reference points.
const REFERENCE: [number, number, number, number][] = [
  [-73.4442, 45.5856, 1674348.28, -95829.103],
  [-79.38, 43.65, 1277733.195, -443861.406],
  [-95, 49, 0, 0],
  [-60, 47, 2550469.188, 496693.162],
  [-71.25, 46.81, 1786946.702, 92963.593],
  [-123, 49.3, -1969068.236, 473882.566],
];

describe("Canada Atlas Lambert (EPSG:3979)", () => {
  it("matches PROJ to the centimetre and inverts", () => {
    for (const [lon, lat, x, y] of REFERENCE) {
      const [px, py] = toLambert(lon, lat);
      expect(px).toBeCloseTo(x, 1);
      expect(py).toBeCloseTo(y, 1);
      const [lon2, lat2] = fromLambert(px, py);
      expect(lon2).toBeCloseTo(lon, 9);
      expect(lat2).toBeCloseTo(lat, 9);
    }
  });
});

/** A native raster around Boucherville whose height at (col, row) is `f(col, row)`. */
function raster(width: number, height: number, f: (c: number, r: number) => number, cellM = 1): NativeRaster {
  const [x, y] = toLambert(-73.4442, 45.5856);
  const data = new Float32Array(width * height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data[r * width + c] = f(c, r);
  return { x0: Math.floor(x) - width / 2, y0: Math.floor(y) + height / 2, cellM, width, height, data };
}

describe("slope", () => {
  it("reads a 20 % plane as 20 % and leaves gaps empty", () => {
    const s = slopePct(raster(10, 10, (c) => 0.2 * c));
    expect(s[5 * 10 + 5]).toBeCloseTo(20, 4);
    const gap = raster(10, 10, (c, r) => (c === 5 && r === 5 ? NaN : 0));
    expect(Number.isNaN(slopePct(gap)[5 * 10 + 4])).toBe(true);
  });

  // Under crowns the ground model is interpolated from few pulses: ±30 cm of noise here.
  const noise = (c: number, r: number) => ((((c * 73856093) ^ (r * 19349663)) >>> 0) % 1000) / 1000 * 0.6 - 0.3;
  const size = 40;
  const wooded = new Uint8Array(size * size).fill(COVER.tree);
  const interior = (s: Float32Array) => {
    const out: number[] = [];
    for (let r = 8; r < size - 8; r++) for (let c = 8; c < size - 8; c++) out.push(s[r * size + c]);
    return out.sort((a, b) => a - b);
  };

  it("reads a wooded flat lot as flat through the noise under the trees", () => {
    const flat = raster(size, size, (c, r) => 20 + noise(c, r));
    const open = interior(slopePct(flat));
    const under = interior(slopePct(flat, wooded));
    const p90 = (v: number[]) => v[Math.floor(0.9 * v.length)];
    expect(p90(open)).toBeGreaterThan(5);
    expect(p90(under)).toBeLessThan(p90(open) / 3);
  });

  it("still reads a wooded hillside as steep (45 %, about 24°)", () => {
    const hill = raster(size, size, (c, r) => 0.45 * c + noise(c, r));
    const under = interior(slopePct(hill, wooded));
    expect(under[Math.floor(0.5 * under.length)]).toBeCloseTo(45, -0.5);
    expect(under[0]).toBeGreaterThan(36);
    expect(slopeDeg(36.4)).toBeCloseTo(20, 1);
    expect(slopeDeg(84)).toBeCloseTo(40, 0);
  });
});

describe("cover", () => {
  // Ground at 20 m; a 10 × 10 m flat roof at 6 m; a rough 10 × 10 m tree crown; a 1 m hedge.
  const size = 40;
  const dtm = raster(size, size, () => 20);
  const roof = (c: number, r: number) => c >= 5 && c < 15 && r >= 5 && r < 15;
  const crown = (c: number, r: number) => c >= 25 && c < 35 && r >= 5 && r < 15;
  const hedge = (c: number, r: number) => r === 30 && c >= 5 && c < 35;
  const dsm = raster(size, size, (c, r) =>
    roof(c, r) ? 26 : crown(c, r) ? 24 + ((c * 7 + r * 13) % 5) : hedge(c, r) ? 21 : 20,
  );
  const cover = coverClasses(dtm, dsm);

  it("tells roofs from tree crowns and low plants", () => {
    const count = (pred: (c: number, r: number) => boolean, cls: number) => {
      let n = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (pred(c, r) && cover[r * size + c] === cls) n++;
      return n;
    };
    expect(count(roof, COVER.building)).toBeGreaterThanOrEqual(90);
    expect(count(crown, COVER.tree)).toBeGreaterThanOrEqual(90);
    expect(count(crown, COVER.building)).toBe(0);
    expect(count(hedge, COVER.low)).toBe(30);
  });

  it("calls a smooth canopy 25 m up a forest, not a roof", () => {
    const forest = raster(size, size, (c, r) => (roof(c, r) ? 45 : 20));
    const canopy = coverClasses(dtm, forest);
    expect(canopy[10 * size + 10]).toBe(COVER.tree);
    expect(canopy.includes(COVER.building)).toBe(false);
  });

  it("calls everything high a tree on coarse grids", () => {
    const coarse = coverClasses({ ...dtm, cellM: 8 }, { ...dsm, cellM: 8 });
    expect(coarse[10 * size + 10]).toBe(COVER.tree);
  });

  it("resamples to lat/lon and outlines the building on a lot", () => {
    const grid = toLatLonGrid(dtm, slopePct(dtm), cover, { south: 45.5853, west: -73.4447, north: 45.5859, east: -73.4437 });
    expect(grid.cellM).toBe(1);
    expect(grid.width).toBeGreaterThan(70);
    const [lon0, lat0] = fromLambert(dtm.x0, dtm.y0);
    const [lon1, lat1] = fromLambert(dtm.x0 + size, dtm.y0 - size);
    const lot: Polygon = { type: "Polygon", coordinates: [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]] };
    const [building] = lidarBuildings(grid, lot);
    // The 10 × 10 m roof, not cut half a cell inside by straightening.
    expect(area({ type: "Feature", geometry: building, properties: {} })).toBeGreaterThan(92);
    expect(area({ type: "Feature", geometry: building, properties: {} })).toBeLessThan(110);
    const stats = terrainStats(grid, [lot])!;
    expect(stats.slopeP90).toBe(0);
    expect(stats.canopy).toBeGreaterThan(0.04);
    expect(stats.canopy).toBeLessThan(0.1);
  });
});

describe("terrain stats", () => {
  it("measures steep shares on a 30 % hillside, and nothing where there's no LiDAR", () => {
    const hill = raster(60, 60, (c) => 0.3 * c);
    const cover = new Uint8Array(60 * 60);
    const grid = toLatLonGrid(hill, slopePct(hill), cover, { south: 45.5853, west: -73.4448, north: 45.5859, east: -73.4436 });
    const [lon0, lat0] = fromLambert(hill.x0 + 10, hill.y0 - 10);
    const [lon1, lat1] = fromLambert(hill.x0 + 50, hill.y0 - 50);
    const box: Polygon = { type: "Polygon", coordinates: [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]] };
    const stats = terrainStats(grid, [box])!;
    expect(stats.slopeP50).toBe(30);
    expect(stats.over25).toBe(1);
    expect(stats.over36).toBe(0);
    expect(stats.coverage).toBe(1);
    const empty = { ...grid, slope: new Uint8Array(grid.slope.length).fill(NO_SLOPE) };
    expect(terrainStats(empty, [box])).toBeNull();
  });
});

describe("steep patches and wooded slopes", () => {
  // A 20 × 20 cell grid of 1 m cells, all ground at 5 % slope.
  const w = 20, h = 20;
  const bbox = { south: 45.5853, west: -73.4447, north: 45.5853 + h / 111320, east: -73.4447 + w / (111320 * Math.cos((45.5853 * Math.PI) / 180)) };
  const all: Polygon = { type: "Polygon", coordinates: [[[bbox.west, bbox.south], [bbox.east, bbox.south], [bbox.east, bbox.north], [bbox.west, bbox.north], [bbox.west, bbox.south]]] };
  const grid = (edit: (slope: Uint8Array, cover: Uint8Array) => void) => {
    const slope = new Uint8Array(w * h).fill(5);
    const cover = new Uint8Array(w * h).fill(COVER.ground);
    edit(slope, cover);
    return { bbox, width: w, height: h, cellM: 1, slope, cover };
  };

  it("counts a bank but not a curb", () => {
    const curb = grid((s) => [0, 1, 2].forEach((c) => (s[5 * w + c] = 60)));
    expect(terrainStats(curb, [all])!.over36).toBe(0);
    const bank = grid((s) => {
      for (let r = 10; r < 13; r++) for (let c = 0; c < 4; c++) s[r * w + c] = 60;
    });
    expect(terrainStats(bank, [all])!.over36).toBeCloseTo(12 / 400, 5);
    expect(terrainStats(bank, [all])!.over84).toBe(0);
  });

  it("outlines where it's steeper than 20°: the bank, not the curb", () => {
    const both = grid((s) => {
      [0, 1, 2].forEach((c) => (s[5 * w + c] = 60));
      for (let r = 10; r < 14; r++) for (let c = 8; c < 13; c++) s[r * w + c] = 40;
    });
    const patches = steepAreas(both, [all]);
    expect(patches).toHaveLength(1);
    // The 4 × 5 m bank, as counted (20 of the 400 cells; the outline rounds its corners).
    expect(area({ type: "Feature", geometry: patches[0], properties: {} })).toBeGreaterThan(19);
    expect(area({ type: "Feature", geometry: patches[0], properties: {} })).toBeLessThan(20.5);
    expect(terrainStats(both, [all])!.over36).toBeCloseTo(20 / 400, 5);
    // Only what's on the shapes: a lawn that stops short of the bank has none.
    const westHalf: Polygon = { type: "Polygon", coordinates: [[[bbox.west, bbox.south], [bbox.west + (bbox.east - bbox.west) * 0.35, bbox.south], [bbox.west + (bbox.east - bbox.west) * 0.35, bbox.north], [bbox.west, bbox.north], [bbox.west, bbox.south]]] };
    expect(steepAreas(both, [westHalf])).toHaveLength(0);
  });

  it("counts the slope under the trees: a wooded hillside above a graded lawn", () => {
    const shaded = grid((s, c) => {
      for (let i = 0; i < 300; i++) {
        s[i] = 45;
        c[i] = COVER.tree;
      }
    });
    const stats = terrainStats(shaded, [all])!;
    expect(stats.canopy).toBeCloseTo(300 / 400, 5);
    // One grove of 300 m² of crowns: about 2.5 trees.
    expect(stats.trees).toBe(3);
    expect(stats.slopeP90).toBe(45);
    expect(stats.over36).toBeCloseTo(300 / 400, 5);
    expect(stats.over47).toBe(0);
  });
});

describe("grid size and transport", () => {
  it("uses 1 m cells for a lot and coarser ones for a course", () => {
    expect(terrainCellM({ south: 45.585, west: -73.445, north: 45.587, east: -73.443 })).toBe(1);
    expect(terrainCellM({ south: 45.47, west: -73.935, north: 45.49, east: -73.895 })).toBe(8);
  });
  it("decodes what the route sends", () => {
    const b64 = (a: Uint8Array) => Buffer.from(a).toString("base64");
    const grid = decodeTerrain({
      bbox: { south: 0, west: 0, north: 1, east: 1 },
      width: 2,
      height: 1,
      cellM: 1,
      slope: b64(new Uint8Array([3, NO_SLOPE])),
      cover: b64(new Uint8Array([COVER.tree, COVER.none])),
    });
    expect([...grid.slope]).toEqual([3, NO_SLOPE]);
    expect([...grid.cover]).toEqual([COVER.tree, COVER.none]);
  });
});
