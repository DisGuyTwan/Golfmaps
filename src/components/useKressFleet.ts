"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import type {
  DeviceLive,
  FleetLocation,
  FleetResponse,
  SessionInfo,
} from "@/lib/kress/types";

const STATUS_CHUNK = 20;
/** Poll no faster than once a minute; slower for big fleets (shared rate limit). */
const MIN_POLL_MS = 60_000;

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 429) return "Kress is rate limiting requests — try again shortly.";
  if (res.status === 403) return "Your Kress account doesn't have access to this data.";
  return body.error ?? `Kress request failed (HTTP ${res.status})`;
}

export function useKressFleet(active: boolean) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [locations, setLocations] = useState<FleetLocation[] | null>(null);
  const [live, setLive] = useState<Record<string, DeviceLive>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [kressGeojson, setKressGeojson] = useState<FeatureCollection | null>(null);
  const [mapsLocationId, setMapsLocationId] = useState<number | null>(null);
  const polling = useRef(false);

  const markDisconnected = useCallback(() => {
    setSession((s) => (s ? { ...s, connected: false } : s));
    setLocations(null);
    setLive({});
    setKressGeojson(null);
  }, []);

  useEffect(() => {
    fetch("/api/kress/session")
      .then((res) => res.json() as Promise<SessionInfo>)
      .then(setSession)
      .catch(() => setSession({ configured: false, connected: false }));
  }, []);

  const deviceIds = useMemo(
    () => (locations ?? []).flatMap((loc) => loc.devices.map((d) => d.uuid)),
    [locations],
  );

  const fetchStatuses = useCallback(
    async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += STATUS_CHUNK) {
        const chunk = ids.slice(i, i + STATUS_CHUNK);
        const res = await fetch(`/api/kress/devices?ids=${chunk.join(",")}`);
        if (res.status === 401) {
          markDisconnected();
          return;
        }
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { devices: DeviceLive[] };
        setLive((prev) => {
          const next = { ...prev };
          for (const device of data.devices) next[device.uuid] = device;
          return next;
        });
      }
      setUpdatedAt(new Date());
    },
    [markDisconnected],
  );

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kress/fleet");
      if (res.status === 401) {
        markDisconnected();
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as FleetResponse;
      setLocations(data.locations);
      setWarnings(data.warnings);
      await fetchStatuses(data.locations.flatMap((loc) => loc.devices.map((d) => d.uuid)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the Kress fleet.");
    } finally {
      setLoading(false);
    }
  }, [fetchStatuses, markDisconnected]);

  // Poll live status while the fleet view is open (no webhooks exist).
  useEffect(() => {
    if (!active || deviceIds.length === 0) return;
    const interval = Math.max(MIN_POLL_MS, deviceIds.length * 300);
    const timer = setInterval(async () => {
      if (polling.current || document.visibilityState !== "visible") return;
      polling.current = true;
      try {
        await fetchStatuses(deviceIds);
      } catch {
        /* keep the last known state; the next tick retries */
      } finally {
        polling.current = false;
      }
    }, interval);
    return () => clearInterval(timer);
  }, [active, deviceIds, fetchStatuses]);

  const loadLocationMaps = useCallback(async (location: FleetLocation) => {
    setMapsLocationId(location.id);
    if (location.maps.length === 0) {
      setKressGeojson(null);
      return;
    }
    const results = await Promise.all(
      location.maps.map(async (map) => {
        const res = await fetch(`/api/kress/maps/${map.uuid}`);
        if (!res.ok) return null;
        return ((await res.json()) as { geojson: FeatureCollection }).geojson;
      }),
    );
    setKressGeojson({
      type: "FeatureCollection",
      features: results.flatMap((fc) => fc?.features ?? []),
    });
  }, []);

  const connect = useCallback(() => {
    window.location.assign("/api/kress/login");
  }, []);

  const disconnect = useCallback(async () => {
    await fetch("/api/kress/logout", { method: "POST" }).catch(() => undefined);
    markDisconnected();
  }, [markDisconnected]);

  return {
    session,
    locations,
    live,
    warnings,
    loading,
    error,
    updatedAt,
    kressGeojson,
    mapsLocationId,
    loadFleet,
    loadLocationMaps,
    clearKressMap: () => {
      setKressGeojson(null);
      setMapsLocationId(null);
    },
    connect,
    disconnect,
  };
}
