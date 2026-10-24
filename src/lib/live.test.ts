import { describe, expect, it } from "vitest";
import { LIVE_LINGER_MS, beginStep, endStep, liveSeconds, liveVisible } from "./live";

const box = { south: 45.44, west: -73.34, north: 45.45, east: -73.33 };

describe("live steps", () => {
  it("lists sources in order and keeps a request already under way", () => {
    let steps = beginStep([], "photos", box, 1000);
    steps = beginStep(steps, "lot", null, 1100);
    steps = beginStep(steps, "osm", null, 1200);
    expect(steps.map((s) => s.source)).toEqual(["lot", "osm", "photos"]);
    // The lot lookup that started the detection carries on into the lawn: same start.
    const again = beginStep(steps, "osm", box, 1500);
    expect(again.find((s) => s.source === "osm")).toMatchObject({ started: 1200, area: box });
  });

  it("records what each source found, and restarts one asked again", () => {
    let steps = beginStep([], "lot", null, 0);
    steps = endStep(steps, "lot", "done", { kind: "lot", lot: "2 598 489" }, 900);
    expect(steps[0]).toMatchObject({ state: "done", ended: 900, found: { kind: "lot", lot: "2 598 489" } });
    expect(liveSeconds(steps[0], 5000)).toBe("0.9");
    steps = beginStep(steps, "lot", null, 2000);
    expect(steps[0]).toMatchObject({ state: "active", started: 2000, found: null });
    expect(liveSeconds(steps[0], 14600)).toBe("13");
  });

  it("shows while anything loads and a moment after", () => {
    let steps = beginStep([], "lidar", box, 0);
    expect(liveVisible(steps, 60_000)).toBe(true);
    steps = endStep(steps, "lidar", "failed", null, 1000);
    expect(liveVisible(steps, 1000 + LIVE_LINGER_MS - 1)).toBe(true);
    expect(liveVisible(steps, 1000 + LIVE_LINGER_MS + 1)).toBe(false);
    expect(liveVisible([], 0)).toBe(false);
  });
});
