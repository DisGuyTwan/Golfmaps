import { describe, expect, it } from "vitest";
import { capacityM2, MOWERS, fitMower } from "./mowers";
import { computeRoi, ROI_DEFAULTS } from "./roi";
import {
  decodeWindow,
  encodeWindow,
  mowingHours,
  presetOf,
  robotWindowShare,
  voyagerWindowShare,
  windowDays,
  windowHours,
  WINDOW_PRESETS,
} from "./window";
import type { Site } from "./site";

const mower = (id: string) => MOWERS.find((m) => m.id === id)!;

describe("when the robots may mow", () => {
  it("reads hours past midnight and days a week", () => {
    expect(windowHours(WINDOW_PRESETS.nights)).toBe(11);
    expect(windowHours({ from: 7, to: 18, days: 5 })).toBe(11);
    expect(windowHours({ from: 6, to: 6, days: 7 })).toBe(24);
    expect(windowHours(null)).toBe(24);
    expect(windowDays({ from: 0, to: 0, days: 9 })).toBe(7);
    expect(presetOf(null)).toBe("any");
    expect(presetOf({ from: 20, to: 7, days: 7 })).toBe("nights");
    expect(presetOf({ from: 21, to: 6, days: 7 })).toBe("custom");
  });

  it("starts a window on a full battery, then runs and charges in turn", () => {
    // 2 h runs and 2 h charges: 9 h at night is 2 h + 7 h at half.
    expect(mowingHours(9, 2)).toBeCloseTo(5.5, 6);
    // Around the clock it's the steady half.
    expect(mowingHours(24, 2)).toBeCloseTo(12, 6);
  });

  it("gives a KR238 kept to nights well under half its rating", () => {
    // 8 pm to 7 am: 2 + 9 × 0.5 = 6.5 h of mowing out of 12.
    expect(robotWindowShare(WINDOW_PRESETS.nights, 120)).toBeCloseTo(6.5 / 12, 6);
    expect(robotWindowShare(null, 120)).toBe(1);
    // Weekdays only: 5 days out of 7.
    expect(robotWindowShare({ from: 0, to: 0, days: 5 }, 120)).toBeCloseTo(5 / 7, 6);
  });

  it("cuts a Voyager's day to the window, and its days to the crew's", () => {
    expect(voyagerWindowShare({ from: 7, to: 11, days: 7 }, 480, 5)).toBeCloseTo(0.5, 6);
    expect(voyagerWindowShare({ from: 7, to: 18, days: 4 }, 480, 5)).toBeCloseTo(0.8, 6);
    expect(voyagerWindowShare(WINDOW_PRESETS.weekdays, 480, 5)).toBe(1);
  });

  it("sizes a bigger fleet for a course mowed only at night", () => {
    const kr238 = mower("KR238");
    expect(capacityM2(kr238, 2, { window: WINDOW_PRESETS.nights })).toBeCloseTo(capacityM2(kr238, 2) * (6.5 / 12), 3);
    const site: Site = { kind: "golf", areaM2: 60 * 4046.86, parts: 1, fairwayM2: 0, terrain: null, shape: null, coverage: null, charger: null, chargerEstimated: true };
    const anyTime = fitMower(site, kr238, 2).units;
    const nights = fitMower(site, kr238, 2, { window: WINDOW_PRESETS.nights }).units;
    expect(anyTime).toBe(4);
    expect(nights).toBe(7);
  });

  it("sizes the ROI tab's KR238s and Voyagers the same way", () => {
    const stay = { ...ROI_DEFAULTS, approach: "stay" as const, area: 60, mowEvery: 2 };
    expect(computeRoi(stay).units).toBe(4);
    expect(computeRoi({ ...stay, window: WINDOW_PRESETS.nights }).units).toBe(7);
    const go = { ...ROI_DEFAULTS, approach: "go" as const, area: 14, mowEvery: 2 };
    expect(computeRoi(go).units).toBe(2);
    expect(computeRoi({ ...go, window: { from: 7, to: 11, days: 7 } }).units).toBe(3);
  });

  it("travels in a link", () => {
    expect(encodeWindow({ from: 20, to: 7, days: 6 })).toBe("20-7-6");
    expect(decodeWindow("20-7-6")).toEqual({ from: 20, to: 7, days: 6 });
    expect(decodeWindow("0-0-7")).toBeNull();
    expect(decodeWindow("25-7-6")).toBeNull();
    expect(decodeWindow(null)).toBeNull();
  });
});
