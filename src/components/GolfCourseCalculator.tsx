"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import type * as L from "leaflet";
import { fetchFairways } from "@/lib/overpass";
import { processOverpassData } from "@/lib/area";
import type { BBox, CourseMeasurement } from "@/lib/types";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { modelForCode } from "@/lib/kress-catalog";
import { TONE_COLORS, stateLabel, statusTone } from "@/lib/kress/status";
import type { FleetDevice, FleetLocation } from "@/lib/kress/types";
import FleetPanel from "./FleetPanel";
import type { FleetMarker } from "./GolfMap";
import MeasurePanel from "./MeasurePanel";
import SearchBox, { type PlaceResult } from "./SearchBox";
import { useKressFleet } from "./useKressFleet";

// Leaflet touches `window` at import time, so the map component must never run
// on the server. Dynamically importing it with `ssr: false` keeps it client-only.
const GolfMap = dynamic(() => import("./GolfMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sky-100 text-slate-500">
      Loading map…
    </div>
  ),
});

export default function GolfCourseCalculator() {
  const [result, setResult] = useState<CourseMeasurement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [firstCorner, setFirstCorner] = useState<[number, number] | null>(null);
  const [scanBox, setScanBox] = useState<
    [number, number, number, number] | null
  >(null);

  const [fleetOpen, setFleetOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [kressNotice, setKressNotice] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const fleet = useKressFleet(fleetOpen);
  const { loadFleet } = fleet;

  // Returning from the Kress login: open the fleet (or explain what failed).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("kress");
    if (!status) return;
    params.delete("kress");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

    setFleetOpen(true);
    if (status === "connected") void loadFleet();
    else if (status === "denied") setKressNotice("Kress sign-in was cancelled.");
    else if (status === "not_configured") setKressNotice("Kress Connect isn't configured on this deployment.");
    else setKressNotice("Kress sign-in failed. Please try again.");
  }, [loadFleet]);

  const openFleet = useCallback(() => {
    setFleetOpen(true);
    setKressNotice(null);
    if (fleet.session?.connected && !fleet.locations && !fleet.loading) void loadFleet();
  }, [fleet.session, fleet.locations, fleet.loading, loadFleet]);

  const fleetDevices = useMemo(
    () => (fleet.locations ?? []).flatMap((loc) => loc.devices),
    [fleet.locations],
  );

  const fleetMarkers = useMemo<FleetMarker[]>(
    () =>
      fleetDevices.flatMap((device) => {
        const live = fleet.live[device.uuid];
        if (!live?.position) return [];
        const model = modelForCode(device.productCode)?.name ?? device.productCode ?? "Kress unit";
        const battery = live.battery != null ? ` · ${live.battery}%` : "";
        return [
          {
            uuid: device.uuid,
            name: device.name,
            subtitle: `${model} · ${stateLabel(live.state)}${battery}`,
            lat: live.position.lat,
            lng: live.position.lng,
            color: TONE_COLORS[statusTone(live)],
            online: live.online,
            lastSeen: live.timestamp ? new Date(live.timestamp).toLocaleString() : "no report",
          },
        ];
      }),
    [fleetDevices, fleet.live],
  );

  // Kress units whose last GPS position is inside the measured course boundary.
  const installed = useMemo(() => {
    if (!result || !fleet.locations) return null;
    const courses = result.geojson.features.filter(
      (f): f is Feature<Polygon | MultiPolygon> =>
        f.properties?._category === "course" &&
        (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"),
    );
    if (courses.length === 0) return null;
    return fleetDevices
      .filter((device) => {
        const pos = fleet.live[device.uuid]?.position;
        return pos && courses.some((course) => booleanPointInPolygon([pos.lng, pos.lat], course));
      })
      .map((device) => ({ uuid: device.uuid, name: device.name }));
  }, [result, fleet.locations, fleet.live, fleetDevices]);

  const handleSelectDevice = useCallback(
    (device: FleetDevice, location: FleetLocation) => {
      setSelectedUnit(device.uuid);
      const pos = fleet.live[device.uuid]?.position;
      if (pos) mapRef.current?.setView([pos.lat, pos.lng], 18);
      if (fleet.mapsLocationId !== location.id) void fleet.loadLocationMaps(location);
    },
    [fleet],
  );

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  const runMeasure = useCallback(async (bboxOverride?: BBox) => {
    const map = mapRef.current;
    if (!map && !bboxOverride) return;

    setLoading(true);
    setError(null);

    try {
      let bbox = bboxOverride;
      if (!bbox) {
        const bounds = map!.getBounds();
        bbox = {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        };
      }
      const overpassJson = await fetchFairways(bbox);
      setResult(processOverpassData(overpassJson));
    } catch (err) {
      let message =
        "Couldn't reach the OpenStreetMap data servers. They may be busy — try again in a moment.";
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429 || status === 504) {
          message =
            "The OpenStreetMap data servers are busy right now. Please wait a moment and try again.";
        } else if (status === 400) {
          message =
            "That area was too large for the free data API. Zoom in closer to the course and measure again.";
        } else if (status) {
          message = `The data request failed (HTTP ${status}). Please try again.`;
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const getSearchBias = useCallback(() => {
    const map = mapRef.current;
    if (!map) return null;
    const center = map.getCenter();
    return { lat: center.lat, lon: center.lng };
  }, []);

  const handleSearchSelect = useCallback(
    (place: PlaceResult) => {
      const map = mapRef.current;
      if (!map) return;

      if (place.bbox) {
        const [south, west, north, east] = place.bbox;
        map.fitBounds(
          [
            [south, west],
            [north, east],
          ],
          { maxZoom: 17, padding: [40, 40] },
        );
      } else {
        map.setView([place.lat, place.lon], 16);
      }

      // Auto-measure once the map settles on a golf course.
      if (place.isGolf) {
        map.once("moveend", () => {
          void runMeasure();
        });
      }
    },
    [runMeasure],
  );

  const handleStartSelect = useCallback(() => {
    setSelecting(true);
    setFirstCorner(null);
    setScanBox(null);
  }, []);

  const handleCancelSelect = useCallback(() => {
    setSelecting(false);
    setFirstCorner(null);
  }, []);

  const handleMapClick = useCallback(
    (latlng: [number, number]) => {
      if (!selecting) return;
      if (!firstCorner) {
        setFirstCorner(latlng);
        return;
      }
      const [aLat, aLon] = firstCorner;
      const [bLat, bLon] = latlng;
      const bbox: BBox = {
        south: Math.min(aLat, bLat),
        west: Math.min(aLon, bLon),
        north: Math.max(aLat, bLat),
        east: Math.max(aLon, bLon),
      };
      setScanBox([bbox.south, bbox.west, bbox.north, bbox.east]);
      setFirstCorner(null);
      setSelecting(false);
      void runMeasure(bbox);
    },
    [selecting, firstCorner, runMeasure],
  );

  const handleClear = useCallback(() => {
    setResult(null);
    setError(null);
    setScanBox(null);
    setFirstCorner(null);
    setSelecting(false);
  }, []);

  return (
    <div className="relative h-full w-full">
      <GolfMap
        geojson={result?.geojson ?? null}
        selecting={selecting}
        firstCorner={firstCorner}
        scanBox={scanBox}
        onMapClick={handleMapClick}
        onMapReady={handleMapReady}
        fleetMarkers={fleetMarkers}
        kressGeojson={fleet.kressGeojson}
      />

      <SearchBox onSelect={handleSearchSelect} getBias={getSearchBias} />

      {fleetOpen ? (
        <FleetPanel
          session={fleet.session}
          locations={fleet.locations}
          live={fleet.live}
          warnings={fleet.warnings}
          loading={fleet.loading}
          error={kressNotice ?? fleet.error}
          updatedAt={fleet.updatedAt}
          mapsLocationId={fleet.mapsLocationId}
          selectedUuid={selectedUnit}
          onConnect={fleet.connect}
          onRefresh={() => void loadFleet()}
          onDisconnect={() => void fleet.disconnect()}
          onClose={() => setFleetOpen(false)}
          onSelectDevice={handleSelectDevice}
          onShowLocationMap={(location) => void fleet.loadLocationMaps(location)}
          onHideLocationMap={fleet.clearKressMap}
        />
      ) : (
        <button
          onClick={openFleet}
          className="absolute left-2 z-[1250] flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg ring-1 ring-black/10 hover:bg-slate-50"
          style={{ top: "calc(max(0.5rem, env(safe-area-inset-top)) + 3.5rem)" }}
        >
          <span className="h-2 w-2 rounded-full bg-violet-600" />
          Kress fleet
          {fleetMarkers.length > 0 && <span className="text-slate-400">· {fleetMarkers.length}</span>}
        </button>
      )}

      <MeasurePanel
        result={result}
        loading={loading}
        error={error}
        selecting={selecting}
        awaitingSecondCorner={firstCorner !== null}
        onMeasure={() => runMeasure()}
        onStartSelect={handleStartSelect}
        onCancelSelect={handleCancelSelect}
        onClear={handleClear}
        installed={installed}
      />
    </div>
  );
}
