import { describe, it, expect } from "vitest";
import { DEFAULT_QUOTE, decodeQuote, encodeQuote, quoteAcres, quoteBreakdown, type QuoteSettings } from "./quote";
import type { CourseMeasurement } from "./types";

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
    expect(quoteAcres({ ...m, boundaryOnly: true }, DEFAULT_QUOTE)).toBeNull();
    expect(quoteAcres(null, DEFAULT_QUOTE)).toBeNull();
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
    };
    expect(decodeQuote(new URLSearchParams(encodeQuote(q)))).toEqual(q);
  });
  it("ignores missing or bad values", () => {
    expect(decodeQuote(new URLSearchParams("q_pct=abc&q_ovr=-3"))).toEqual(DEFAULT_QUOTE);
  });
});
