import type { DeviceLive } from "./types";

export type StatusTone = "error" | "working" | "charging" | "transit" | "idle" | "offline" | "unknown";

const WORKING = new Set([
  "mowing",
  "mowing_border",
  "arm_edging",
  "arm_trimming",
  "sweeping",
]);
const CHARGING = new Set(["charging", "home"]);
const TRANSIT = new Set([
  "going_home",
  "starting",
  "exploring_lawn",
  "searching_border",
  "searching_marker",
  "zone_search",
  "follow_border_training",
  "calibrating",
  "map_downloading",
  "map_uploading",
  "map_processing",
  "firmware_upgrading",
  "remote_driving",
]);

export const TONE_COLORS: Record<StatusTone, string> = {
  error: "#dc2626",
  working: "#16a34a",
  charging: "#2563eb",
  transit: "#d97706",
  idle: "#64748b",
  offline: "#334155",
  unknown: "#94a3b8",
};

/** Kress flags errors itself via state_is_error; we only bucket the rest. */
export function statusTone(live: DeviceLive | undefined): StatusTone {
  if (!live || live.error) return "unknown";
  if (live.stateIsError) return "error";
  if (!live.online) return "offline";
  if (!live.state) return "unknown";
  if (WORKING.has(live.state)) return "working";
  if (CHARGING.has(live.state)) return "charging";
  if (TRANSIT.has(live.state)) return "transit";
  return "idle";
}

export function stateLabel(state: string | null | undefined): string {
  if (!state) return "No status";
  const text = state.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
