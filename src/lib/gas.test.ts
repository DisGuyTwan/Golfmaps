import { describe, it, expect } from "vitest";
import { parseStatcanGas } from "./gas";

const wds = (value: unknown, refPer = "2026-09-01", status = "SUCCESS") => [
  { status, object: { vectorId: 735096, vectorDataPoint: [{ refPer, value }] } },
];

describe("parseStatcanGas", () => {
  it("reads the latest month in $/L", () => {
    expect(parseStatcanGas(wds(198.7))).toEqual({ price: 1.99, period: "2026-09", source: "statcan" });
  });
  it("rejects failures and implausible values", () => {
    expect(parseStatcanGas(wds(198.7, "2026-09-01", "FAILED"))).toBeNull();
    expect(parseStatcanGas(wds(1.99))).toBeNull();
    expect(parseStatcanGas(wds("n/a"))).toBeNull();
    expect(parseStatcanGas({})).toBeNull();
    expect(parseStatcanGas([{ status: "SUCCESS", object: { vectorDataPoint: [] } }])).toBeNull();
  });
});
