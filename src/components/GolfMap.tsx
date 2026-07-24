"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  LayersControl,
  useMap,
} from "react-leaflet";
import * as L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { BBox } from "@/lib/types";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Next.js bundles Leaflet's default marker images with hashed paths, which
// breaks Leaflet's built-in URL guessing. Point the default icon at the
// bundled assets so any markers (and draw handles) render correctly.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x.src,
  iconUrl: markerIcon.src,
  shadowUrl: markerShadow.src,
});

/** Default map center: Trois-Rivières, Quebec (fallback if geolocation fails). */
const DEFAULT_CENTER: [number, number] = [46.3432, -72.5428];
const DEFAULT_ZOOM = 14;
const LOCATED_ZOOM = 16;

/** Per-category styling for the detected golf polygons. */
const CATEGORY_STYLE: Record<string, L.PathOptions> = {
  // Whole-course boundary: bright dashed outline, no fill (reads on imagery).
  course: { color: "#facc15", weight: 3, dashArray: "6 5", fill: false },
  rough: { color: "#4d7c0f", weight: 1, fillColor: "#bbf7d0", fillOpacity: 0.3 },
  driving_range: {
    color: "#166534",
    weight: 1,
    fillColor: "#a7f3d0",
    fillOpacity: 0.35,
  },
  fairway: { color: "#14532d", weight: 2, fillColor: "#86efac", fillOpacity: 0.5 },
  tee: { color: "#14532d", weight: 1, fillColor: "#86efac", fillOpacity: 0.55 },
  green: { color: "#065f46", weight: 1, fillColor: "#34d399", fillOpacity: 0.65 },
};

const DEFAULT_STYLE = CATEGORY_STYLE.fairway;

function styleFeature(feature?: Feature): L.PathOptions {
  const category = feature?.properties?._category as string | undefined;
  return (category && CATEGORY_STYLE[category]) || DEFAULT_STYLE;
}

/** Shape of the leaflet-draw `draw:created` event we care about. */
interface DrawCreatedEvent {
  layer: L.Rectangle;
}

export interface GolfMapProps {
  onBoundsSelected: (bbox: BBox) => void;
  geojson: FeatureCollection | null;
  /** Incremented by the parent to request clearing the drawn rectangle. */
  clearSignal: number;
}

/** Lifts the Leaflet map instance up to the parent once it is ready. */
function MapReady({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

/**
 * Fits the map viewport to the detected golf features whenever they change so
 * the user immediately sees what was found.
 */
function FitToFairways({ geojson }: { geojson: FeatureCollection | null }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson || geojson.features.length === 0) return;
    const bounds = L.geoJSON(geojson).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 });
    }
  }, [geojson, map]);

  return null;
}

export default function GolfMap({
  onBoundsSelected,
  geojson,
  clearSignal,
}: GolfMapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [drawing, setDrawing] = useState(false);

  // A feature group holds the drawn/searched rectangle so we can clear it.
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  if (!featureGroupRef.current) {
    featureGroupRef.current = new L.FeatureGroup();
  }
  const drawerRef = useRef<L.Draw.Rectangle | null>(null);

  // Force the GeoJSON layer to re-render whenever the data reference changes
  // (react-leaflet's GeoJSON otherwise caches its initial `data`).
  const geojsonKeyRef = useRef(0);
  const prevGeojsonRef = useRef<FeatureCollection | null>(null);
  if (geojson !== prevGeojsonRef.current) {
    prevGeojsonRef.current = geojson;
    geojsonKeyRef.current += 1;
  }

  const emitBounds = useCallback(
    (bounds: L.LatLngBounds) => {
      onBoundsSelected({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
    },
    [onBoundsSelected],
  );

  // Wire the feature group + draw:created handler once the map is ready, and
  // center on the device's location if permission is granted.
  useEffect(() => {
    if (!map) return;
    const featureGroup = featureGroupRef.current!;
    featureGroup.addTo(map);

    const handleCreated = (event: L.LeafletEvent) => {
      const { layer } = event as unknown as DrawCreatedEvent;
      featureGroup.clearLayers();
      featureGroup.addLayer(layer);
      setDrawing(false);
      drawerRef.current = null;
      emitBounds(layer.getBounds());
    };

    map.on("draw:created", handleCreated);

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], LOCATED_ZOOM),
        () => {
          /* Permission denied or unavailable — keep the default view. */
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    }

    return () => {
      map.off("draw:created", handleCreated);
    };
  }, [map, emitBounds]);

  // Clear the drawn rectangle when the parent bumps clearSignal.
  useEffect(() => {
    if (clearSignal > 0) {
      featureGroupRef.current?.clearLayers();
    }
  }, [clearSignal]);

  const toggleDraw = useCallback(() => {
    if (!map) return;
    if (drawerRef.current) {
      drawerRef.current.disable();
      drawerRef.current = null;
      setDrawing(false);
      return;
    }
    const drawer = new L.Draw.Rectangle(map as unknown as L.DrawMap, {
      showArea: false,
      shapeOptions: { color: "#2563eb", weight: 2 },
    });
    drawer.enable();
    drawerRef.current = drawer;
    setDrawing(true);
  }, [map]);

  const searchThisArea = useCallback(() => {
    if (!map) return;
    if (drawerRef.current) {
      drawerRef.current.disable();
      drawerRef.current = null;
      setDrawing(false);
    }
    featureGroupRef.current?.clearLayers();
    emitBounds(map.getBounds());
  }, [map, emitBounds]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        maxZoom={19}
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

        <MapReady onReady={setMap} />

        {geojson && geojson.features.length > 0 && (
          <GeoJSON
            key={geojsonKeyRef.current}
            data={geojson}
            style={styleFeature}
          />
        )}

        <FitToFairways geojson={geojson} />
      </MapContainer>

      {/* Custom, mobile-friendly selection controls */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={searchThisArea}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-black/10 transition hover:bg-emerald-700 active:scale-95"
          >
            Search this area
          </button>
          <button
            onClick={toggleDraw}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg ring-1 ring-black/10 transition active:scale-95 ${
              drawing
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {drawing ? "Cancel draw" : "Draw box"}
          </button>
        </div>
        {drawing && (
          <div className="pointer-events-none rounded-md bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow">
            Drag across the course to draw a box
          </div>
        )}
      </div>
    </div>
  );
}
