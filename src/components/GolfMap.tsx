"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  FeatureGroup,
  GeoJSON,
  useMap,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import * as L from "leaflet";
import type { FeatureCollection } from "geojson";
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

/** Default map center: Trois-Rivières, Quebec. */
const DEFAULT_CENTER: [number, number] = [46.3432, -72.5428];
const DEFAULT_ZOOM = 14;

/** Styling for the detected fairway polygons: light green fill, dark border. */
const FAIRWAY_STYLE: L.PathOptions = {
  color: "#166534",
  weight: 2,
  fillColor: "#86efac",
  fillOpacity: 0.5,
};

export interface GolfMapProps {
  onBoundsSelected: (bbox: BBox) => void;
  onDeleted: () => void;
  geojson: FeatureCollection | null;
  /** Incremented by the parent to request clearing the drawn rectangle. */
  clearSignal: number;
}

/**
 * Fits the map viewport to the detected fairways whenever they change so the
 * user immediately sees what was found.
 */
function FitToFairways({ geojson }: { geojson: FeatureCollection | null }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson || geojson.features.length === 0) return;
    const bounds = L.geoJSON(geojson).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
    }
  }, [geojson, map]);

  return null;
}

export default function GolfMap({
  onBoundsSelected,
  onDeleted,
  geojson,
  clearSignal,
}: GolfMapProps) {
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);

  // Force the GeoJSON layer to re-render whenever the data reference changes
  // (react-leaflet's GeoJSON otherwise caches its initial `data`).
  const geojsonKeyRef = useRef(0);
  const prevGeojsonRef = useRef<FeatureCollection | null>(null);
  if (geojson !== prevGeojsonRef.current) {
    prevGeojsonRef.current = geojson;
    geojsonKeyRef.current += 1;
  }

  // Clear the drawn rectangle when the parent bumps clearSignal.
  useEffect(() => {
    if (clearSignal > 0) {
      featureGroupRef.current?.clearLayers();
    }
  }, [clearSignal]);

  const handleCreated = (event: { layerType: string; layer: L.Layer }) => {
    const featureGroup = featureGroupRef.current;
    const layer = event.layer as L.Rectangle;

    // Only keep the most recent rectangle so a single box is ever active.
    if (featureGroup) {
      featureGroup.eachLayer((existing) => {
        if (existing !== layer) featureGroup.removeLayer(existing);
      });
    }

    const bounds = layer.getBounds();
    onBoundsSelected({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });
  };

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <FeatureGroup ref={featureGroupRef}>
        <EditControl
          position="topleft"
          onCreated={handleCreated}
          onDeleted={onDeleted}
          draw={{
            // Rectangle only. `showArea: false` avoids Leaflet.draw's
            // readableArea crash with Leaflet >= 1.8.
            rectangle: {
              showArea: false,
              shapeOptions: { color: "#2563eb", weight: 2 },
            },
            polyline: false,
            polygon: false,
            circle: false,
            circlemarker: false,
            marker: false,
          }}
          edit={{ edit: false }}
        />
      </FeatureGroup>

      {geojson && geojson.features.length > 0 && (
        <GeoJSON
          key={geojsonKeyRef.current}
          data={geojson}
          style={() => FAIRWAY_STYLE}
        />
      )}

      <FitToFairways geojson={geojson} />
    </MapContainer>
  );
}
