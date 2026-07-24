"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  LayersControl,
  useMap,
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
  return (category && CATEGORY_STYLE[category]) || DEFAULT_STYLE;
}

export interface GolfMapProps {
  geojson: FeatureCollection | null;
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

export default function GolfMap({ geojson, onMapReady }: GolfMapProps) {
  // Force the GeoJSON layer to re-render whenever the data reference changes.
  const geojsonKeyRef = useRef(0);
  const prevGeojsonRef = useRef<FeatureCollection | null>(null);
  if (geojson !== prevGeojsonRef.current) {
    prevGeojsonRef.current = geojson;
    geojsonKeyRef.current += 1;
  }

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

      {geojson && geojson.features.length > 0 && (
        <GeoJSON
          key={geojsonKeyRef.current}
          data={geojson}
          style={styleFeature}
        />
      )}
    </MapContainer>
  );
}
