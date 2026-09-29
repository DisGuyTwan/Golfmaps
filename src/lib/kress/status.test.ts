import { describe, it, expect } from "vitest";
import { stateLabel, statusTone } from "./status";
import type { DeviceLive } from "./types";

const live = (overrides: Partial<DeviceLive>): DeviceLive => ({
  uuid: "u", online: true, state: "idle", stateIsError: false, battery: 50, charging: null,
  position: null, timestamp: null, headCode: null, ...overrides,
});

describe("statusTone", () => {
  it("trusts Kress's state_is_error flag over the state name", () => {
    expect(statusTone(live({ state: "mowing", stateIsError: true }))).toBe("error");
  });
  it("buckets working, charging, transit, idle and offline units", () => {
    expect(statusTone(live({ state: "mowing" }))).toBe("working");
    expect(statusTone(live({ state: "charging" }))).toBe("charging");
    expect(statusTone(live({ state: "going_home" }))).toBe("transit");
    expect(statusTone(live({ state: "rain_delay" }))).toBe("idle");
    expect(statusTone(live({ online: false }))).toBe("offline");
  });
  it("reports unknown for missing or failed lookups", () => {
    expect(statusTone(undefined)).toBe("unknown");
    expect(statusTone(live({ error: "HTTP 404" }))).toBe("unknown");
  });
});

it("stateLabel humanizes snake_case states", () => {
  expect(stateLabel("manual_action_required")).toBe("Manual action required");
  expect(stateLabel(null)).toBe("No status");
});
