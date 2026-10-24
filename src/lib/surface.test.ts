import { describe, expect, it } from "vitest";
import area from "@turf/area";
import type { Polygon } from "geojson";
import { classifySurface, latOfY, lonOfX, mercX, mercY, otsu, surfaceAreas, SURFACE, type SurfaceGrid } from "./surface";

// An 80 × 80 pixel scene at 20 cm a pixel (16 × 16 m), lawn by default.
const W = 80, H = 80, CELL = 0.2;
type Paint = (x: number, y: number) => [number, number, number] | null;
/** Deterministic ±6 noise, like JPEG grain. */
const grain = (x: number, y: number) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 13) - 6;

function scene(paint: Paint, roof?: (x: number, y: number) => boolean) {
  const rgb = new Uint8Array(W * H * 3);
  const open = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = paint(x, y) ?? [52, 74, 62];
      const n = grain(x, y);
      const i = y * W + x;
      rgb.set([r + n, g + n, b + n].map((v) => Math.max(0, Math.min(255, v))), 3 * i);
      if (roof?.(x, y)) open[i] = 0;
    }
  }
  return { rgb, width: W, height: H, cellM: CELL, valid: new Uint8Array(W * H).fill(1), open };
}

const driveway = (x: number, y: number) => x >= 5 && x < 20 && y >= 20 && y < 60; // 3 × 8 m
const pool = (x: number, y: number) => ((x - 55) / 10) ** 2 + ((y - 20) / 6) ** 2 <= 1; // about 4 × 2.4 m
const edging = (x: number, y: number) => x >= 30 && x < 32 && y >= 40 && y < 78; // 40 cm wide
const roof = (x: number, y: number) => x >= 40 && x < 70 && y >= 45 && y < 70;
const shade = (x: number, y: number) => x >= 22 && x < 30 && y >= 5 && y < 15;

const yard: Paint = (x, y) =>
  pool(x, y) ? [60, 150, 190] : driveway(x, y) || edging(x, y) || roof(x, y) ? [92, 96, 99] : shade(x, y) ? [18, 30, 36] : null;

const at = (classes: Uint8Array, x: number, y: number) => classes[y * W + x];

describe("aerial photo classes", () => {
  const classes = classifySurface(scene(yard, roof));

  it("finds the pool and the driveway", () => {
    expect(at(classes, 55, 20)).toBe(SURFACE.water);
    expect(at(classes, 12, 40)).toBe(SURFACE.hard);
    expect(at(classes, 70, 10)).toBe(SURFACE.other);
  });

  it("leaves roofs, thin edging and shade alone", () => {
    expect(at(classes, 55, 57)).toBe(SURFACE.other);
    expect(at(classes, 31, 60)).toBe(SURFACE.other);
    expect(at(classes, 25, 10)).toBe(SURFACE.other);
  });

  it("removes nothing from a yard that's all lawn", () => {
    const lawn = classifySurface(scene(() => null));
    expect(lawn.includes(SURFACE.hard)).toBe(false);
    expect(lawn.includes(SURFACE.water)).toBe(false);
  });

  it("marks pixels without a photo as unknown", () => {
    const s = scene(yard);
    s.valid.fill(0, 0, W * 10);
    expect(classifySurface(s)[5]).toBe(SURFACE.none);
  });

  it("splits a two-colour scene between its colours", () => {
    const values = [...Array(500).fill(0.34), ...Array(500).fill(0.375)];
    const { threshold, separation } = otsu(values, 0.3, 0.42);
    expect(threshold).toBeGreaterThan(0.34);
    expect(threshold).toBeLessThanOrEqual(0.375);
    expect(separation).toBeCloseTo(0.035, 2);
  });
});

describe("pools and paving on the lot", () => {
  const z = 19;
  const x0 = mercX(-73.3336, z), y0 = mercY(45.4442, z);
  const grid: SurfaceGrid = {
    bbox: { west: lonOfX(x0, z), east: lonOfX(x0 + W, z), north: latOfY(y0, z), south: latOfY(y0 + H, z) },
    width: W,
    height: H,
    cellM: CELL,
    classes: classifySurface(scene(yard, roof)),
  };
  const { west, east, north, south } = grid.bbox;
  const lot: Polygon = { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
  const m2 = (g: Polygon | import("geojson").MultiPolygon) => area({ type: "Feature", geometry: g, properties: {} });

  it("outlines one pool and one driveway at about their size", () => {
    const areas = surfaceAreas(grid, lot);
    const pools = areas.filter((a) => a.kind === "pool");
    const paved = areas.filter((a) => a.kind === "paving");
    expect(pools).toHaveLength(1);
    expect(paved).toHaveLength(1);
    // Pixels here are 20 cm on paper but Web Mercator at 45° stretches them: compare in pixels.
    const px = m2(lot) / (W * H);
    expect(m2(pools[0].geometry) / px).toBeGreaterThan(150);
    expect(m2(pools[0].geometry) / px).toBeLessThan(230);
    expect(m2(paved[0].geometry) / px).toBeGreaterThan(520);
    expect(m2(paved[0].geometry) / px).toBeLessThan(760);
    expect(new Set(areas.map((a) => a.id)).size).toBe(areas.length);
  });

  it("keeps only what's on the lot", () => {
    const half: Polygon = { type: "Polygon", coordinates: [[[west + (east - west) / 2, south], [east, south], [east, north], [west + (east - west) / 2, north], [west + (east - west) / 2, south]]] };
    const areas = surfaceAreas(grid, half);
    expect(areas.map((a) => a.kind)).toEqual(["pool"]);
  });
});
