import { describe, it, expect } from "vitest";
import { writeArrayBuffer } from "geotiff";
import { ACI_SOD } from "./landcover";
import { ACI_YEARS, cropInventoryUrl, decodeCropTiff, readCropInventory, worldCoverTileName } from "./landcover-server";

/*
 * The crop inventory service can't be reached from CI, so these tests feed
 * the reader TIFFs built in memory and check the request it makes, the year
 * fallback and both answer shapes (class values, or a rendered RGB image).
 */

const box = { south: 46.3, west: -72.6, north: 46.32, east: -72.57 };

function tiffResponse(buffer: ArrayBuffer) {
  return new Response(buffer, { status: 200, headers: { "content-type": "image/tiff" } });
}

describe("worldCoverTileName", () => {
  it("names tiles by their south-west corner", () => {
    expect(worldCoverTileName(45, -75)).toBe("N45W075");
    expect(worldCoverTileName(-3, 6)).toBe("S03E006");
  });
});

describe("cropInventoryUrl", () => {
  it("asks for raw class values on a lat/lon grid, nearest neighbour", () => {
    const url = new URL(cropInventoryUrl("https://agriculture.canada.ca", 2025, box, 150, 148));
    expect(url.pathname).toBe("/imagery-images/rest/services/annual_crop_inventory/2025/ImageServer/exportImage");
    expect(url.searchParams.get("bbox")).toBe("-72.6,46.3,-72.57,46.32");
    expect(url.searchParams.get("imageSR")).toBe("4326");
    expect(url.searchParams.get("interpolation")).toBe("RSP_NearestNeighbor");
    expect(JSON.parse(url.searchParams.get("renderingRule")!)).toEqual({ rasterFunction: "None" });
    expect(url.searchParams.get("size")).toBe("150,148");
  });
});

describe("decodeCropTiff", () => {
  it("reads single-band class values as they are", async () => {
    const buffer = await writeArrayBuffer(Uint8Array.from([0, 192, 122, 192, 0, 34]), {
      width: 3,
      height: 2,
      BitsPerSample: [8],
      SampleFormat: [1],
    });
    const out = await decodeCropTiff(buffer);
    expect(out).toMatchObject({ width: 3, height: 2 });
    expect([...out.data]).toEqual([0, 192, 122, 192, 0, 34]);
  });
  it("maps the sod colour back to the sod class in a rendered image", async () => {
    // Two pixels, RGB interleaved: sod green, then pasture yellow.
    const buffer = await writeArrayBuffer(Uint8Array.from([181, 251, 5, 255, 204, 51]), {
      width: 2,
      height: 1,
      BitsPerSample: [8, 8, 8],
      SampleFormat: [1, 1, 1],
      PhotometricInterpretation: 2,
    });
    const out = await decodeCropTiff(buffer);
    expect([...out.data]).toEqual([ACI_SOD, 0]);
  });
});

describe("readCropInventory", () => {
  it("falls back to the previous year when the newest isn't published", async () => {
    const asked: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      asked.push(url);
      if (url.includes(`/${ACI_YEARS[0]}/`)) {
        return new Response('{"error":{"code":404}}', { status: 200, headers: { "content-type": "application/json" } });
      }
      const size = new URL(url).searchParams.get("size")!.split(",").map(Number);
      const values = new Uint8Array(size[0] * size[1]).fill(ACI_SOD);
      return tiffResponse(await writeArrayBuffer(values, { width: size[0], height: size[1], BitsPerSample: [8], SampleFormat: [1] }));
    }) as typeof fetch;

    const grid = await readCropInventory(box, fetchImpl);
    expect(grid.year).toBe(ACI_YEARS[1]);
    expect(grid.source).toBe("aci");
    expect(grid.bbox).toEqual(box);
    // 15 m cells: 0.02° of latitude ≈ 2.2 km ≈ 148 rows.
    expect(grid.height).toBe(148);
    expect(grid.data.length).toBe(grid.width * grid.height);
    expect(grid.data.every((v) => v === ACI_SOD)).toBe(true);
    expect(asked.filter((u) => u.includes(`/${ACI_YEARS[0]}/`))).toHaveLength(2);
  });
  it("fails when no year answers", async () => {
    const fetchImpl = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    await expect(readCropInventory(box, fetchImpl)).rejects.toThrow();
  });
});
