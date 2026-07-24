"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  CircleMarker,
  LayersControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import * as L from "leaflet";
import { TURF_META, type TurfShape, type TurfType } from "@/lib/measure";

import "leaflet/dist/leaflet.css";

/** Default map center: Trois-Rivières, Quebec (fallback if geolocation fails). */
const DEFAULT_CENTER: [number, number] = [46.3432, -72.5428];
const DEFAULT_ZOOM = 14;
const LOCATED_ZOOM = 16;

function shapeStyle(type: TurfType, selected: boolean): L.PathOptions {
  const meta = TURF_META[type];
  return {
    color: selected ? "#ffffff" : meta.color,
    weight: selected ? 4 : 2,
    fillColor: meta.fill,
    fillOpacity: selected ? 0.6 : 0.4,
  };
}

export interface GolfMapProps {
  shapes: TurfShape[];
  /** Points of the in-progress polygon, or null when not drawing. */
  draftPoints: [number, number][] | null;
  activeType: TurfType;
  selectedId: string | null;
  /** Bumped by the parent to fit the map to all shapes (after auto-detect). */
  fitSignal: number;
  onMapClick: (latlng: [number, number]) => void;
  onSelectShape: (id: string) => void;
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

/** Captures taps to add polygon points, and sets the crosshair cursor. */
function DrawingLayer({
  drawing,
  onMapClick,
}: {
  drawing: boolean;
  onMapClick: (latlng: [number, number]) => void;
}) {
  const map = useMapEvents({
    click(event) {
      if (drawing) onMapClick([event.latlng.lat, event.latlng.lng]);
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    if (drawing) {
      map.doubleClickZoom.disable();
      container.style.cursor = "crosshair";
    } else {
      map.doubleClickZoom.enable();
      container.style.cursor = "";
    }
    return () => {
      container.style.cursor = "";
    };
  }, [drawing, map]);

  return null;
}

/** Fits the viewport to every shape when the signal changes. */
function FitToShapes({
  shapes,
  signal,
}: {
  shapes: TurfShape[];
  signal: number;
}) {
  const map = useMap();
  const lastSignal = useRef(0);
  useEffect(() => {
    if (signal === lastSignal.current) return;
    lastSignal.current = signal;
    if (shapes.length === 0) return;
    const points = shapes.flatMap((shape) =>
      shape.latlngs.map(([lat, lng]) => L.latLng(lat, lng)),
    );
    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 });
    }
  }, [signal, shapes, map]);
  return null;
}

export default function GolfMap({
  shapes,
  draftPoints,
  activeType,
  selectedId,
  fitSignal,
  onMapClick,
  onSelectShape,
  onMapReady,
}: GolfMapProps) {
  const drawing = draftPoints !== null;
  const activeMeta = TURF_META[activeType];

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      maxZoom={19}
      attributionControl={false}
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
      <DrawingLayer drawing={drawing} onMapClick={onMapClick} />
      <FitToShapes shapes={shapes} signal={fitSignal} />

      {/* Finished shapes */}
      {shapes.map((shape) => (
        <Polygon
          key={shape.id}
          positions={shape.latlngs}
          pathOptions={shapeStyle(shape.type, shape.id === selectedId)}
          interactive={!drawing}
          eventHandlers={{ click: () => onSelectShape(shape.id) }}
        />
      ))}

      {/* In-progress polygon */}
      {draftPoints && draftPoints.length >= 3 && (
        <Polygon
          positions={draftPoints}
          pathOptions={{
            color: activeMeta.color,
            weight: 2,
            dashArray: "5 5",
            fillColor: activeMeta.fill,
            fillOpacity: 0.25,
          }}
          interactive={false}
        />
      )}
      {draftPoints && draftPoints.length === 2 && (
        <Polyline
          positions={draftPoints}
          pathOptions={{ color: activeMeta.color, weight: 2, dashArray: "5 5" }}
          interactive={false}
        />
      )}
      {draftPoints?.map((point, index) => (
        <CircleMarker
          key={index}
          center={point}
          radius={5}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: activeMeta.color,
            fillOpacity: 1,
          }}
          interactive={false}
        />
      ))}
    </MapContainer>
  );
}
