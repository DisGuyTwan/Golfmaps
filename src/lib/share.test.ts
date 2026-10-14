import { describe, it, expect } from "vitest";
import { buildShareUrl, decodeView, encodeView, prefixed, readParams } from "./share";
import { bboxParam, parseBBoxParam } from "./overpass";

describe("share links", () => {
  it("reads only one tab's keys, prefix stripped", () => {
    expect(readParams("?r_area=60&r_years=5&i_prov=ON", "r_")).toEqual({ area: "60", years: "5" });
  });
  it("builds a link with the query before the tab hash, dropping empty values", () => {
    const url = buildShareUrl(
      { origin: "https://kress.prodig-e.com", pathname: "/" },
      { ...prefixed("r_", { area: 60, model: "19", note: "" }), m: true },
      "#roi",
    );
    expect(url).toBe("https://kress.prodig-e.com/?r_area=60&r_model=19&m=1#roi");
  });
  it("round-trips a map view and rejects nonsense", () => {
    expect(decodeView(encodeView(46.343212, -72.542812, 16.4))).toEqual({ lat: 46.34321, lon: -72.54281, zoom: 16 });
    expect(decodeView("91,0,10")).toBeNull();
    expect(decodeView("a,b,c")).toBeNull();
    expect(decodeView(null)).toBeNull();
  });
});

describe("cache-route bbox parameter", () => {
  it("rounds to 5 decimals and parses back", () => {
    const p = bboxParam({ south: 46.123456, west: -72.654321, north: 46.2, east: -72.5 });
    expect(p).toBe("46.12346,-72.65432,46.20000,-72.50000");
    expect(parseBBoxParam(p)).toEqual({ south: 46.12346, west: -72.65432, north: 46.2, east: -72.5 });
  });
  it("rejects malformed, inverted or oversized boxes", () => {
    expect(parseBBoxParam("1,2,3")).toBeNull();
    expect(parseBBoxParam("46.2,-72.5,46.1,-72.4")).toBeNull();
    expect(parseBBoxParam("46,-73,47,-72")).toBeNull();
    expect(parseBBoxParam(null)).toBeNull();
  });
});
