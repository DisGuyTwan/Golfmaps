import { describe, expect, it } from "vitest";
import { calibrationOf, MIN_CHECKS, parseRecord, spreadOf, summarize, trackRecord, type FieldRecord } from "./records";

const check = (model: string, predictedH: number, actualH: number, i = 0): FieldRecord => ({
  kind: "check",
  id: `c${i}`,
  at: "2026-10-25",
  model,
  areaM2: 4000,
  predictedH,
  actualH,
  note: "",
});
const install = (predictedAcres: number, actualAcres: number, basis: "mapped" | "photos" = "mapped", i = 0): FieldRecord => ({
  kind: "install",
  id: `i${i}`,
  at: "2026-10-25",
  basis,
  predictedAcres,
  actualAcres,
  property: "",
  note: "",
});

describe("field checks", () => {
  it("corrects a model's pace once it has enough checks, with the median", () => {
    const records = [check("KR238", 10, 12), check("KR238", 10, 11), check("KR238", 10, 14), check("KR800", 5, 6)];
    expect(MIN_CHECKS).toBe(3);
    expect(calibrationOf(records)).toEqual({ KR238: { n: 3, factor: 1.2 } });
  });

  it("leaves out a time that's surely a typo", () => {
    const records = [check("KR238", 10, 12), check("KR238", 10, 11), check("KR238", 10, 14), check("KR238", 1, 60)];
    expect(calibrationOf(records).KR238.n).toBe(3);
  });
});

describe("installs", () => {
  const records = [0.9, 0.95, 1.0, 1.05, 1.2].map((r, i) => install(100, 100 * r, "mapped", i));

  it("make the likely range once a basis has enough", () => {
    const spread = spreadOf(records).mapped!;
    expect(spread.n).toBe(5);
    expect(spread.low).toBeCloseTo(0.92, 6);
    expect(spread.high).toBeCloseTo(1.14, 6);
    expect(spreadOf(records.slice(0, 4))).toEqual({});
  });

  it("give the track record: the share within 10 % of ours", () => {
    expect(trackRecord(records)).toEqual({ installs: 5, within10: 0.8 });
    expect(trackRecord(records.slice(0, 2))).toEqual({ installs: 2, within10: null });
    expect(summarize(records)).toMatchObject({ installs: 5, checks: 0, within10: 0.8 });
  });
});

describe("what a form sends", () => {
  it("keeps a sound record and refuses the rest", () => {
    expect(parseRecord({ kind: "check", model: "KR238", areaM2: 4000, predictedH: 3, actualH: 3.5, note: "x" }, "a", "t")).toMatchObject({ kind: "check", id: "a" });
    expect(parseRecord({ kind: "check", model: "Ceora", areaM2: 4000, predictedH: 3, actualH: 3.5 }, "a", "t")).toBeNull();
    expect(parseRecord({ kind: "install", basis: "photos", predictedAcres: 50, actualAcres: 55 }, "b", "t")).toMatchObject({ basis: "photos" });
    expect(parseRecord({ kind: "install", basis: "guess", predictedAcres: 50, actualAcres: 55 }, "b", "t")).toBeNull();
    expect(parseRecord({ kind: "install", basis: "mapped", predictedAcres: -1, actualAcres: 55 }, "b", "t")).toBeNull();
  });
});

describe("what a field check is set against", () => {
  it("predicts a robot's time to mow a plain area once, more for more area", async () => {
    const { MOWERS } = await import("./mowers");
    const { predictedHours } = await import("./records");
    const kr238 = MOWERS.find((m) => m.id === "KR238")!;
    const oneAcre = predictedHours(kr238, 4046.86);
    // 62 cm at 1.5 m/s with 15 % overlap mows about 0.7 ac an hour, plus turns, edges and driving.
    expect(oneAcre).toBeGreaterThan(1.2);
    expect(oneAcre).toBeLessThan(2);
    expect(predictedHours(kr238, 4 * 4046.86)).toBeGreaterThan(3 * oneAcre);
  });
});
