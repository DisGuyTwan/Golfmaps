import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTE } from "./quote";
import { assumptions, compareClient, measuredRange, MIN_RECORD } from "./trust";
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
