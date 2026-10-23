import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUOTE,
  acresForQuote,
  decodeQuote,
  lawnQuoteSqft,
  encodeQuote,
  quoteAcres,
  quoteBreakdown,
  sodFieldAcres,
  sodQuoteAcres,
  type QuoteSettings,
} from "./quote";
import type { CourseMeasurement, SatelliteTurf, SodField, SodMeasurement } from "./types";

const m = {
  fairway: { acres: 30, count: 18 },
  rough: { acres: 50, count: 0 },
  green: { acres: 3, count: 18 },
  tee: { acres: 2, count: 30 },
  drivingRangeAcres: 10,
  found: true,
  boundaryOnly: false,
} as CourseMeasurement;

describe("quoteAcres", () => {
  it("defaults: fairways + 80% of the rough + the range, no greens or tees", () => {
    expect(quoteBreakdown(m, DEFAULT_QUOTE)).toEqual({ fairway: 30, rough: 40, green: 0, tee: 0, range: 10 });
    expect(quoteAcres(m, DEFAULT_QUOTE)).toBe(80);
  });
  it("a manual override wins, even with no measurement", () => {
    expect(quoteAcres(m, { ...DEFAULT_QUOTE, override: 42 })).toBe(42);
    expect(quoteAcres(null, { ...DEFAULT_QUOTE, override: 42 })).toBe(42);
  });
  it("boundary-only courses need an override instead of a guess", () => {
    expect(quoteAcres({ ...m, boundaryOnly: true, satellite: null }, DEFAULT_QUOTE)).toBeNull();
    expect(quoteAcres(null, DEFAULT_QUOTE)).toBeNull();
  });
  it("an outline-only course counts the turf estimated from satellite grass, never the outline", () => {
    const satellite = { grassAcres: 100, treesAcres: 40, builtAcres: 5, waterAcres: 3, otherAcres: 2, outlineAcres: 150 } as SatelliteTurf;
    const outlineOnly = { ...m, boundaryOnly: true, courseAcres: 150, satellite };
    // 100 ac of grass → 59 ac of estimated turf → 80% of it mowed by robot.
    expect(quoteAcres(outlineOnly, DEFAULT_QUOTE)).toBeCloseTo(47.2, 6);
    expect(quoteAcres(outlineOnly, { ...DEFAULT_QUOTE, grassPct: 100 })).toBeCloseTo(59, 6);
    expect(quoteAcres({ ...outlineOnly, satellite: { ...satellite, grassAcres: 0 } }, DEFAULT_QUOTE)).toBeNull();
    expect(quoteAcres(outlineOnly, { ...DEFAULT_QUOTE, override: 61 })).toBe(61);
  });
  it("clamps the rough share to 0–100%", () => {
    expect(quoteBreakdown(m, { ...DEFAULT_QUOTE, roughPct: 150 }).rough).toBe(50);
  });
});

describe("share-link round trip", () => {
  it("encodes and decodes the settings", () => {
    const q: QuoteSettings = {
      include: { fairway: false, rough: true, green: false, tee: true, range: false },
      roughPct: 65,
      override: 55.5,
      grassPct: 70,
      sodPct: DEFAULT_QUOTE.sodPct,
      lawnOverride: null,
    };
    expect(decodeQuote(new URLSearchParams(encodeQuote(q)))).toEqual(q);
  });
  it("a sod link carries the sod share only", () => {
    const q: QuoteSettings = { ...DEFAULT_QUOTE, sodPct: 75, override: null };
    expect(encodeQuote(q, "sod")).toEqual({ q_spct: "75" });
    expect(decodeQuote(new URLSearchParams(encodeQuote(q, "sod")))).toEqual(q);
  });
  it("ignores missing or bad values", () => {
    expect(decodeQuote(new URLSearchParams("q_pct=abc&q_ovr=-3"))).toEqual(DEFAULT_QUOTE);
  });
});

describe("sod quote", () => {
  const field = (id: string, acres: number, included = true): SodField =>
    ({ id, acres, included, traced: id.startsWith("t") }) as SodField;
  const sod: SodMeasurement = { year: 2025, fields: [field("d1", 120), field("d2", 40, false), field("t1", 20)] };

  it("counts the fields left in, at the mowed share", () => {
    expect(sodFieldAcres(sod)).toBe(140);
    expect(sodQuoteAcres(sod, DEFAULT_QUOTE)).toBeCloseTo(126, 6);
    expect(sodQuoteAcres(sod, { ...DEFAULT_QUOTE, sodPct: 100 })).toBe(140);
  });
  it("has nothing to quote without fields, unless overridden", () => {
    expect(sodQuoteAcres(null, DEFAULT_QUOTE)).toBeNull();
    expect(sodQuoteAcres({ year: null, fields: [] }, { ...DEFAULT_QUOTE, override: 30 })).toBe(30);
  });
  it("acresForQuote follows the mode", () => {
    expect(acresForQuote("sod", m, sod, { ...DEFAULT_QUOTE, sodPct: 100 })).toBe(140);
    expect(acresForQuote("golf", m, sod, DEFAULT_QUOTE)).toBe(80);
  });
});

describe("lawn quote", () => {
  it("is in square feet, never goes to the ROI tab, and takes an override", () => {
    expect(acresForQuote("lawn", m, null, { ...DEFAULT_QUOTE, override: 5 })).toBeNull();
    expect(lawnQuoteSqft(null, DEFAULT_QUOTE)).toBeNull();
    expect(lawnQuoteSqft(null, { ...DEFAULT_QUOTE, lawnOverride: 4200 })).toBe(4200);
  });
  it("round-trips the lawn override in a link, and nothing else", () => {
    const q: QuoteSettings = { ...DEFAULT_QUOTE, lawnOverride: 5150 };
    expect(encodeQuote(q, "lawn")).toEqual({ q_lovr: "5150" });
    expect(encodeQuote(DEFAULT_QUOTE, "lawn")).toEqual({});
    expect(decodeQuote(new URLSearchParams(encodeQuote(q, "lawn")))).toEqual(q);
  });
});
