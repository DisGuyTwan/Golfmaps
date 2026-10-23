import { describe, it, expect } from "vitest";
import { cadastreQueryUrl, fetchCadastreLot, inQuebec, parseCadastre } from "./parcel";

/* The cadastre can't be reached from CI: these tests feed the parser answers
 * shaped like the ArcGIS layer's GeoJSON and check the request it makes. */

const square = (w: number, s: number, d: number) => ({
  type: "Polygon" as const,
  coordinates: [[[w, s], [w + d, s], [w + d, s + d], [w, s + d], [w, s]]],
});
const lot = (geometry: ReturnType<typeof square>, props: Record<string, unknown>) => ({ type: "Feature", geometry, properties: props });

describe("parseCadastre", () => {
  it("picks the lot that contains the point, with its number", () => {
    const json = {
      type: "FeatureCollection",
      features: [lot(square(-73.451, 45.58, 0.0005), { NO_LOT: "2 115 417" }), lot(square(-73.45, 45.58, 0.0005), { NO_LOT: "2 115 418" })],
    };
    const p = parseCadastre(json, 45.5802, -73.4498);
    expect(p?.lot).toBe("2 115 418");
    expect(p?.geometry.type).toBe("Polygon");
  });
  it("finds the lot number under other field names, or none", () => {
    const one = (props: Record<string, unknown>) => parseCadastre({ features: [lot(square(0, 0, 1), props)] }, 0.5, 0.5)?.lot;
    expect(one({ numero_lot: 4567890 })).toBe("4567890");
    expect(one({ OBJECTID: 3 })).toBeNull();
  });
  it("returns null for an empty or error answer", () => {
    expect(parseCadastre({ type: "FeatureCollection", features: [] }, 45, -73)).toBeNull();
    expect(parseCadastre({ error: { code: 400 } }, 45, -73)).toBeNull();
    expect(parseCadastre(null, 45, -73)).toBeNull();
  });
});

describe("fetchCadastreLot", () => {
  it("asks for GeoJSON in lat/lon at the point", () => {
    const url = new URL(cadastreQueryUrl(45.58, -73.45));
    expect(url.searchParams.get("geometry")).toBe("-73.45,45.58");
    expect(url.searchParams.get("f")).toBe("geojson");
    expect(url.searchParams.get("outSR")).toBe("4326");
  });
  it("never calls the cadastre for a point outside Quebec", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    expect(inQuebec(43.65, -79.38)).toBe(false); // Toronto
    await expect(fetchCadastreLot(43.65, -79.38, fetchImpl)).resolves.toBeNull();
    expect(called).toBe(false);
  });
  it("turns an ArcGIS error answer into a failure, not an empty lot", async () => {
    const fetchImpl = (async () => Response.json({ error: { code: 500, message: "boom" } })) as unknown as typeof fetch;
    await expect(fetchCadastreLot(45.58, -73.45, fetchImpl)).rejects.toThrow(/boom/);
  });
});
