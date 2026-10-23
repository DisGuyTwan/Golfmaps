import { afterEach, describe, expect, it, vi } from "vitest";
import { OverpassHttpError, fetchFromMirrorsHedged } from "./overpass";

const bbox = { south: 46.3, west: -72.6, north: 46.31, east: -72.59 };
const endpoints = ["https://a.test", "https://b.test", "https://c.test"];

type Behaviour = "hang" | "ok" | number;

/** Mocks fetch per mirror: hang until aborted, answer, or fail with a status. */
function mockMirrors(behaviour: Record<string, Behaviour>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push(url);
    const b = behaviour[url];
    if (b === "ok") return Promise.resolve(new Response(JSON.stringify({ from: url })));
    if (typeof b === "number") return Promise.resolve(new Response("", { status: b }));
    return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchFromMirrorsHedged", () => {
  it("starts the next mirror when one hangs, and takes the first answer", async () => {
    const calls = mockMirrors({ [endpoints[0]]: "hang", [endpoints[1]]: "ok", [endpoints[2]]: "ok" });
    await expect(fetchFromMirrorsHedged(bbox, { hedgeMs: 5, endpoints })).resolves.toEqual({ from: endpoints[1] });
    expect(calls).toEqual(endpoints.slice(0, 2));
  });
  it("moves on at once when a mirror fails fast", async () => {
    const calls = mockMirrors({ [endpoints[0]]: 429, [endpoints[1]]: "ok" });
    await expect(fetchFromMirrorsHedged(bbox, { hedgeMs: 60000, endpoints })).resolves.toEqual({ from: endpoints[1] });
    expect(calls).toEqual(endpoints.slice(0, 2));
  });
  it("rejects with the last error when every mirror fails", async () => {
    mockMirrors({ [endpoints[0]]: 504, [endpoints[1]]: 429, [endpoints[2]]: 503 });
    await expect(fetchFromMirrorsHedged(bbox, { hedgeMs: 5, endpoints })).rejects.toBeInstanceOf(OverpassHttpError);
  });
  it("rejects at once on a 400 (bad or too-large query)", async () => {
    const calls = mockMirrors({ [endpoints[0]]: 400, [endpoints[1]]: "ok" });
    await expect(fetchFromMirrorsHedged(bbox, { hedgeMs: 60000, endpoints })).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual([endpoints[0]]);
  });
});

describe("lawn query", () => {
  it("asks for buildings, pools and paving instead of golf features", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      bodies.push(decodeURIComponent(String(init.body)));
      return Promise.resolve(new Response("{}"));
    });
    await fetchFromMirrorsHedged(bbox, { endpoints: [endpoints[0]], kind: "lawn" });
    expect(bodies[0]).toContain('way["building"]');
    expect(bodies[0]).toContain('way["leisure"="swimming_pool"]');
    expect(bodies[0]).not.toContain('"golf"');
  });
});
