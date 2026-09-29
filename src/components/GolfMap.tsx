"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Rectangle,
  CircleMarker,
  LayersControl,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import * as L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { TURF_COLORS } from "@/lib/area";

import "leaflet/dist/leaflet.css";

/** Default map center: Trois-Rivières, Quebec (fallback if geolocation fails). */
const DEFAULT_CENTER: [number, number] = [46.3432, -72.5428];
const DEFAULT_ZOOM = 14;
const LOCATED_ZOOM = 16;

/** Per-category styling for detected golf polygons. */
const CATEGORY_STYLE: Record<string, L.PathOptions> = {
  course: { color: TURF_COLORS.course, weight: 3, dashArray: "6 5", fill: false },
  rough: { color: "#4d7c0f", weight: 1, fillColor: TURF_COLORS.rough, fillOpacity: 0.3 },
  fairway: { color: "#14532d", weight: 2, fillColor: TURF_COLORS.fairway, fillOpacity: 0.5 },
  tee: { color: "#14532d", weight: 1, fillColor: TURF_COLORS.tee, fillOpacity: 0.55 },
  green: { color: "#065f46", weight: 1, fillColor: TURF_COLORS.green, fillOpacity: 0.65 },
};

const DEFAULT_STYLE = CATEGORY_STYLE.fairway;

function styleFeature(feature?: Feature): L.PathOptions {
  const category = feature?.properties?._category as string | undefined;
  const base = (category && CATEGORY_STYLE[category]) || DEFAULT_STYLE;
  // Non-interactive so taps always reach the map (needed for area selection).
  return { ...base, interactive: false };
}

/** A Kress unit to draw on the map. */
export interface FleetMarker {
  uuid: string;
  name: string;
  subtitle: string;
  lat: number;
  lng: number;
  color: string;
  online: boolean;
  lastSeen: string;
}

/** Styling for a Kress map (boundaries, zones, exclusions). */
function kressStyle(feature?: Feature): L.PathOptions {
  const kind = String(feature?.properties?.kind ?? "");
  const enabled = feature?.properties?.enabled !== false;
  const base: L.PathOptions = { interactive: false, dashArray: enabled ? undefined : "4 4" };
  if (kind === "boundary") return { ...base, color: "#7c3aed", weight: 3, fillOpacity: 0.05 };
  if (kind === "exclusion") return { ...base, color: "#dc2626", weight: 2, fillColor: "#dc2626", fillOpacity: 0.2 };
  return { ...base, color: "#a78bfa", weight: 1, dashArray: "3 3", fillOpacity: 0.08 };
}

/** Bumps a key whenever `data` changes identity, so GeoJSON layers re-render. */
function useDataKey(data: unknown): number {
  const key = useRef(0);
  const prev = useRef<unknown>(null);
  if (data !== prev.current) {
    prev.current = data;
    key.current += 1;
  }
  return key.current;
}

export interface GolfMapProps {
  geojson: FeatureCollection | null;
  fleetMarkers: FleetMarker[];
  kressGeojson: FeatureCollection | null;
  selecting: boolean;
  firstCorner: [number, number] | null;
  /** Drawn scan box as [south, west, north, east], or null. */
  scanBox: [number, number, number, number] | null;
  onMapClick: (latlng: [number, number]) => void;
  onMapReady: (map: L.Map) => void;
}

/** Lifts the map instance up and centers on the device location once. */
function MapInit({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          map.setView(
            [pos.coords.latitude, pos.coords.longitude],
            LOCATED_ZOOM,
          ),
        () => {
          /* Permission denied or unavailable — keep the default view. */
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    }
  }, [map, onReady]);
  return null;
}

/** Captures taps while selecting a scan box; shows a crosshair cursor. */
function SelectCapture({
  selecting,
  onMapClick,
}: {
  selecting: boolean;
  onMapClick: (latlng: [number, number]) => void;
}) {
  const map = useMapEvents({
    click(event) {
      if (selecting) onMapClick([event.latlng.lat, event.latlng.lng]);
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    if (selecting) {
      map.doubleClickZoom.disable();
      container.style.cursor = "crosshair";
    } else {
      map.doubleClickZoom.enable();
      container.style.cursor = "";
    }
    return () => {
      container.style.cursor = "";
    };
  }, [selecting, map]);

  return null;
}

export default function GolfMap({
  geojson,
  selecting,
  firstCorner,
  scanBox,
  onMapClick,
  onMapReady,
  fleetMarkers,
  kressGeojson,
}: GolfMapProps) {
  const geojsonKey = useDataKey(geojson);
  const kressKey = useDataKey(kressGeojson);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      maxZoom={19}
      attributionControl={false}
      zoomControl={false}
      className="h-full w-full"
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer
            attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Streets">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <MapInit onReady={onMapReady} />
      <SelectCapture selecting={selecting} onMapClick={onMapClick} />

      {geojson && geojson.features.length > 0 && (
        <GeoJSON
          key={geojsonKey}
          data={geojson}
          style={styleFeature}
        />
      )}

      {kressGeojson && kressGeojson.features.length > 0 && (
        <GeoJSON
          key={`kress-${kressKey}`}
          data={kressGeojson}
          style={kressStyle}
          pointToLayer={(_feature, latlng) =>
            L.circleMarker(latlng, {
              radius: 5,
              color: "#ffffff",
              weight: 2,
              fillColor: "#7c3aed",
              fillOpacity: 1,
              interactive: false,
            })
          }
        />
      )}

      {scanBox && (
        <Rectangle
          bounds={[
            [scanBox[0], scanBox[1]],
            [scanBox[2], scanBox[3]],
          ]}
          pathOptions={{
            color: "#2563eb",
            weight: 2,
            dashArray: "5 5",
            fillOpacity: 0.05,
            interactive: false,
          }}
        />
      )}

      {firstCorner && (
        <CircleMarker
          center={firstCorner}
          radius={6}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: "#2563eb",
            fillOpacity: 1,
            interactive: false,
          }}
        />
      )}
      {fleetMarkers.map((marker) => (
        <CircleMarker
          key={marker.uuid}
          center={[marker.lat, marker.lng]}
          radius={9}
          pathOptions={{
            color: "#ffffff",
            weight: 3,
            fillColor: marker.color,
            fillOpacity: marker.online ? 1 : 0.45,
          }}
        >
          <Popup>
            <div className="space-y-0.5 text-xs">
              <div className="text-sm font-semibold">{marker.name}</div>
              <div>{marker.subtitle}</div>
              <div className="text-slate-500">
                {marker.online ? "Online" : "Offline"} (best effort) · {marker.lastSeen}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
