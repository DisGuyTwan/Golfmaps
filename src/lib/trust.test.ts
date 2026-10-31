import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTE } from "./quote";
import { assumptions, compareClient, measuredRange, MIN_RECORD, lotRange, MISSED_DRIVEWAY_M2 } from "./trust";
import type { CourseMeasurement, SatelliteTurf } from "./types";

const mapped = {
  fairway: { acres: 30, count: 18 },
  rough: { acres: 50, count: 0 },
  green: { acres: 3, count: 18 },
  tee: { acres: 2, count: 30 },
  drivingRangeAcres: 10,
  roughEstimated: true,
  found: true,
  boundaryOnly: false,
  satellite: null,
} as unknown as CourseMeasurement;
const photos = { source: "photos", grassAcres: 100, treesAcres: 40, builtAcres: 5, waterAcres: 3, otherAcres: 2, outlineAcres: 150, year: null } as SatelliteTurf;
const outline = { ...mapped, boundaryOnly: true, satellite: photos } as CourseMeasurement;

describe("how sure the acres are", () => {
  it("gives a photo count its calibrated range, at the share counted", () => {
    const r = measuredRange("golf", outline, null, DEFAULT_QUOTE)!;
    // 100 ac of grass × 0.66 = 66 ac of turf, 80% counted = 52.8 ac; likely 0.82× to 1.39×.
    expect(r.value).toBeCloseTo(52.8, 6);
    expect(r.low).toBeCloseTo(52.8 * 0.82, 6);
    expect(r.high).toBeCloseTo(52.8 * 1.39, 6);
    expect(r).toMatchObject({ basis: "photos", rangeFrom: "calibration" });
  });

  it("has no range for mapped turf until installs measure one", () => {
    expect(measuredRange("golf", mapped, null, DEFAULT_QUOTE)).toMatchObject({ value: 80, low: null, high: null, basis: "mapped" });
    const few = { mapped: { n: MIN_RECORD - 1, low: 0.9, high: 1.1 } };
    expect(measuredRange("golf", mapped, null, DEFAULT_QUOTE, few)!.low).toBeNull();
    const enough = { mapped: { n: MIN_RECORD, low: 0.9, high: 1.1 } };
    expect(measuredRange("golf", mapped, null, DEFAULT_QUOTE, enough)).toMatchObject({ low: 72, high: 88, rangeFrom: "record", n: MIN_RECORD });
  });

  it("measures ours even when the client's number replaces it, and says where theirs falls", () => {
    const q = { ...DEFAULT_QUOTE, override: 60 };
    const r = measuredRange("golf", outline, null, q)!;
    expect(r.value).toBeCloseTo(52.8, 6);
    expect(compareClient(60, r)).toEqual({ inRange: true, diffPct: expect.closeTo(13.6, 1) });
    expect(compareClient(80, r).inRange).toBe(false);
    expect(compareClient(90, measuredRange("golf", mapped, null, q)!)).toEqual({ inRange: null, diffPct: expect.closeTo(12.5, 1) });
    expect(measuredRange("lawn", null, null, q)).toBeNull();
  });
});

describe("what the numbers rest on", () => {
  const base = {
    mode: "golf" as const,
    measurement: mapped,
    sod: null,
    q: DEFAULT_QUOTE,
    lot: "traced" as const,
    lidar: true,
    chargerPlaced: false,
    calibratedChecks: 0,
    installs: 0,
  };

  it("lists a mapped course's sources, estimates marked as such", () => {
    expect(assumptions(base).map((a) => `${a.key}:${a.kind}`)).toEqual([
      "mapped:measured",
      "roughEstimated:estimate",
      "lidar:measured",
      "ratings:rating",
      "pace:estimate",
      "every:client",
      "anyTime:rule",
      "fleet:rule",
      "charger:estimate",
    ]);
  });

  it("puts the client's number first, and field checks and installs in place of estimates", () => {
    const keys = assumptions({ ...base, q: { ...DEFAULT_QUOTE, override: 90, window: { from: 20, to: 7, days: 7 } }, calibratedChecks: 6, installs: 3, chargerPlaced: true })
      .map((a) => `${a.key}:${a.kind}`);
    expect(keys[0]).toBe("client:client");
    expect(keys).toContain("calibrated:measured");
    expect(keys).not.toContain("pace:estimate");
    expect(keys).toContain("record:measured");
    expect(keys).toContain("charger:client");
    expect(keys).toContain("window:estimate");
  });
});

describe("how sure a lot's lawn is", () => {
  const base = { lotSource: "cadastre" as const, lotM2: 600, lawnM2: 400, osmM2: 150, lidarM2: 0, photoM2: 0, edgeM: 100, noDriveway: false, trimM2: 0, slopeM2: 0 };

  it("is narrow on a cadastre lot with mapped buildings: its edges are the doubt", () => {
    const r = lotRange(base);
    // √(18² + 7.5² + 10²) = 21.9 m², × 1.28 either way: about ±7 % of 400.
    expect(r.high).toBeCloseTo(1 + (1.2816 * Math.sqrt(18 ** 2 + 7.5 ** 2 + 10 ** 2)) / 400, 4);
    expect(r.low).toBeCloseTo(2 - r.high, 6);
    expect(r.doubts).toEqual(["edges"]);
  });

  it("widens with an estimated lot, buildings only the LiDAR sees and paving only the photos show", () => {
    const est = lotRange({ ...base, lotSource: "estimated" });
    expect(est.high - est.low).toBeGreaterThan(0.9);
    expect(est.doubts[0]).toBe("estimatedLot");
    const lidar = lotRange({ ...base, lidarM2: 150, photoM2: 60 });
    expect(lidar.high).toBeGreaterThan(lotRange(base).high);
    expect(lidar.doubts.slice(0, 2)).toEqual(["lidar", "photos"]);
  });

  it("lowers only the low end for a driveway nobody found, and widens with ragged edges and what's trimmed", () => {
    const r = lotRange({ ...base, noDriveway: true });
    expect(r.high).toBeCloseTo(lotRange(base).high, 6);
    expect(r.low).toBeCloseTo(lotRange(base).low - MISSED_DRIVEWAY_M2 / 400, 6);
    expect(r.doubts).toContain("driveway");
    expect(lotRange({ ...base, edgeM: 400 }).high).toBeGreaterThan(lotRange(base).high);
    expect(lotRange({ ...base, trimM2: 80 }).doubts).toContain("trim");
  });
});
