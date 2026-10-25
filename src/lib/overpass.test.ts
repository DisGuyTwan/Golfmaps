import { afterEach, describe, expect, it, vi } from "vitest";
import { DIRECT_AFTER_MS, OverpassHttpError, fetchFairways, fetchFromMirrorsHedged, parseBBoxParam, type MirrorAttempt } from "./overpass";

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

describe("mirror attempts", () => {
  it("records each mirror asked, how it ended and when", async () => {
    mockMirrors({ [endpoints[0]]: "hang", [endpoints[1]]: 429, [endpoints[2]]: "ok" });
    const attempts: MirrorAttempt[] = [];
    await fetchFromMirrorsHedged(bbox, { hedgeMs: 5, endpoints, attempts });
    expect(attempts.map((a) => [a.host, a.result])).toEqual([
      ["a.test", "cancelled"],
      ["b.test", "429"],
      ["c.test", "ok"],
    ]);
    expect(attempts[0].at).toBeLessThan(5);
    expect(attempts.every((a) => a.ms >= 0)).toBe(true);
  });
  it("stops every request when the caller cancels", async () => {
    const calls = mockMirrors({ [endpoints[0]]: "hang", [endpoints[1]]: "hang", [endpoints[2]]: "hang" });
    const cancel = new AbortController();
    const attempts: MirrorAttempt[] = [];
    const lookup = fetchFromMirrorsHedged(bbox, { hedgeMs: 5, endpoints, signal: cancel.signal, attempts });
    // All three mirrors asked (not a fixed wait: timers run late on a busy machine).
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    cancel.abort();
    await expect(lookup).rejects.toMatchObject({ name: "AbortError" });
    expect(attempts.map((a) => a.result)).toEqual(["cancelled", "cancelled", "cancelled"]);
  });
});

/** Mocks the cache route and the real mirrors for fetchFairways. */
function mockRouteAndMirrors(route: Behaviour, mirrors: Behaviour) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const isRoute = url.startsWith("/api/overpass");
    calls.push(isRoute ? "route" : new URL(url).host);
    const b = isRoute ? route : mirrors;
    if (b === "ok") return Promise.resolve(new Response(JSON.stringify({ from: isRoute ? "route" : "mirror" })));
    if (typeof b === "number") return Promise.resolve(new Response("", { status: b }));
    return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  });
  return calls;
}

describe("fetchFairways", () => {
  it("takes the cache route's answer without asking the mirrors", async () => {
    const calls = mockRouteAndMirrors("ok", "ok");
    await expect(fetchFairways(bbox)).resolves.toEqual({ from: "route" });
    expect(calls).toEqual(["route"]);
  });
  it("also asks the mirrors when the route is slow, and takes the first answer", async () => {
    vi.useFakeTimers();
    const calls = mockRouteAndMirrors("hang", "ok");
    const lookup = fetchFairways(bbox, "lawn");
    await vi.advanceTimersByTimeAsync(DIRECT_AFTER_MS - 1);
    expect(calls).toEqual(["route"]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(lookup).resolves.toEqual({ from: "mirror" });
    expect(calls).toEqual(["route", "overpass-api.de"]);
  });
  it("waits for a route that has started answering, without asking the mirrors", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url.startsWith("/api/overpass") ? "route" : "mirror");
      // Headers now, the body (a big course on a slow phone) well after the head start.
      const body = new ReadableStream({
        start(c) {
          setTimeout(() => {
            c.enqueue(new TextEncoder().encode('{"from":"route"}'));
            c.close();
          }, DIRECT_AFTER_MS * 2);
        },
      });
      return Promise.resolve(new Response(body));
    });
    const lookup = fetchFairways(bbox);
    await vi.advanceTimersByTimeAsync(DIRECT_AFTER_MS * 2);
    await expect(lookup).resolves.toEqual({ from: "route" });
    expect(calls).toEqual(["route"]);
  });
  it("asks the mirrors at once when the route fails", async () => {
    const calls = mockRouteAndMirrors(502, "ok");
    await expect(fetchFairways(bbox)).resolves.toEqual({ from: "mirror" });
    expect(calls).toEqual(["route", "overpass-api.de"]);
  });
  it("rejects a too-large box without asking the mirrors", async () => {
    const calls = mockRouteAndMirrors(400, "ok");
    await expect(fetchFairways(bbox)).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual(["route"]);
  });
  it("fails once both the route and every mirror have failed", async () => {
    mockRouteAndMirrors(502, 504);
    await expect(fetchFairways(bbox)).rejects.toMatchObject({ status: 504 });
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

describe("grass run road queries", () => {
  const bodyFor = async (kind: "roads" | "streets") => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      bodies.push(decodeURIComponent(String(init.body)));
      return Promise.resolve(new Response("{}"));
    });
    await fetchFromMirrorsHedged(bbox, { endpoints: [endpoints[0]], kind });
    return bodies[0];
  };

  it("asks for the main roads across a run, and every street around a stop", async () => {
    const roads = await bodyFor("roads");
    expect(roads).toContain("tertiary|unclassified)(_link)?$");
    expect(roads).not.toContain("residential");
    expect(await bodyFor("streets")).toContain("|residential|living_street|road)(_link)?$");
  });

  it("keeps every-street boxes to a neighbourhood", () => {
    expect(parseBBoxParam("45.4,-73.4,45.44,-73.36", "streets")).not.toBeNull();
    expect(parseBBoxParam("45.4,-73.4,45.5,-73.3", "streets")).toBeNull();
    expect(parseBBoxParam("45.4,-73.4,45.5,-73.3", "roads")).not.toBeNull();
  });
});
