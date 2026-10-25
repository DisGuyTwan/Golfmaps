import { describe, expect, it } from "vitest";
import { MOWERS } from "./mowers";
import { INSTALL, edgesToMap, installEstimate, monthlyPayment } from "./prices";
import type { Site } from "./site";

const model = (id: string) => MOWERS.find((m) => m.id === id)!;

describe("installation estimate", () => {
  it("sets up each robot that stays and maps its edges", () => {
    // Two KR286 on a lawn with 300 m of edges: a trip, 2 set-ups, 300 m at 0.35 m/s.
    const e = installEstimate(model("KR286"), 2, 300);
    expect(e.hours).toBeCloseTo(1 + 2 * 1.5 + 300 / 0.35 / 3600, 6);
    expect(e.materials).toBe(2 * INSTALL.home.materials);
    expect(e.total).toBeCloseTo(e.hours * INSTALL.rateHour + e.materials, 6);
  });

  it("sets a Voyager up once, however many come", () => {
    expect(installEstimate(model("KR804"), 3, 2000).hours).toBeCloseTo(installEstimate(model("KR804"), 1, 2000).hours, 6);
    expect(installEstimate(model("KR238"), 1, 0).materials).toBe(INSTALL.kr238.materials);
  });

  it("measures the edges to map from the layout, else a ragged square", () => {
    const site = { areaM2: 10_000, coverage: null } as Site;
    expect(edgesToMap(site)).toBeCloseTo(4 * 100 * 1.3, 6);
  });
});

describe("monthly payment", () => {
  it("is the usual loan payment, and a plain split at 0 %", () => {
    expect(monthlyPayment(100_000, 0, 48)).toBeCloseTo(2083.33, 2);
    // 100 000 $ at 6 % over 60 months: 1 933,28 $.
    expect(monthlyPayment(100_000, 6, 60)).toBeCloseTo(1933.28, 2);
    expect(monthlyPayment(100_000, 6, 60, 20_000)).toBeLessThan(1933.28);
    expect(monthlyPayment(0, 6, 60)).toBe(0);
  });
});
