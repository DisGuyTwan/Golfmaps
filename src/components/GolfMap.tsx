"use client";

import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  ImageOverlay,
  Polyline,
  Rectangle,
  CircleMarker,
  LayersControl,
  Marker,
  SVGOverlay,
  useMap,
  useMapEvents,
} from "react-leaflet";
import * as L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { TURF_COLORS } from "@/lib/area";
import { UI, type Lang } from "@/lib/i18n";
import { decodeView } from "@/lib/share";
import { ICON_PATHS } from "./icons";

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
  // Sod fields: counted, traced by hand (yellow edge), or tapped out of the quote.
  sod: { color: "#14532d", weight: 1.5, fillColor: TURF_COLORS.grass, fillOpacity: 0.45 },
  sod_traced: { color: TURF_COLORS.course, weight: 2.5, fillColor: TURF_COLORS.grass, fillOpacity: 0.45 },
  sod_off: { color: "#e5e7eb", weight: 1.5, dashArray: "4 4", fillColor: "#6b7280", fillOpacity: 0.15 },
  // Residential lawn: the lawn left, mapped or detected buildings/pools/paving,
  // areas traced out, and areas from the photos kept as lawn.
  lawn: { color: "#14532d", weight: 1, fillColor: TURF_COLORS.grass, fillOpacity: 0.45 },
  lawn_built: { color: "#f8fafc", weight: 1.5, fillColor: "#334155", fillOpacity: 0.55 },
  lawn_paved: { color: "#e2e8f0", weight: 1, fillColor: "#64748b", fillOpacity: 0.5 },
  lawn_removed: { color: "#f87171", weight: 2, dashArray: "5 4", fillColor: "#f87171", fillOpacity: 0.25 },
  lawn_kept: { color: "#e2e8f0", weight: 1.5, dashArray: "3 4", fill: false },
};

const DEFAULT_STYLE = CATEGORY_STYLE.fairway;

function styleFeature(feature?: Feature): L.PathOptions {
  const category = feature?.properties?._category as string | undefined;
  const base = (category && CATEGORY_STYLE[category]) || DEFAULT_STYLE;
  // Non-interactive so taps always reach the map (needed for area selection).
  return { ...base, interactive: false };
}

/** An area a source is reading right now, [[south, west], [north, east]]. */
export interface LiveScan {
  key: string;
  bounds: [[number, number], [number, number]];
}

/** The pulsing rings at a tapped point (styles in globals.css). */
const PING_ICON = L.divIcon({ className: "live-ping", html: "<span></span><span></span>", iconSize: [48, 48] });

/** One area being read: outlined, faintly filled, with a band sweeping across it. */
function ScanOverlay({ scan }: { scan: LiveScan }) {
  const gradient = `live-scan-${scan.key}`;
  return (
    <SVGOverlay bounds={scan.bounds} attributes={{ viewBox: "0 0 100 100", preserveAspectRatio: "none", class: "live-scan" }} interactive={false}>
      <defs>
        <linearGradient id={gradient}>
          <stop offset="0" stopOpacity="0" />
          <stop offset="0.6" stopOpacity="0.45" />
          <stop offset="1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect className="live-scan-area" x="0" y="0" width="100" height="100" />
      <rect className="live-scan-band" x="-40" y="0" width="40" height="100" fill={`url(#${gradient})`} />
    </SVGOverlay>
  );
}

/** A grass run on the map: its stops (numbered in the run's order once measured), the shop, and the route between them. */
export interface MapRun {
  /** `n` is null for a stop left out of the day (no lot or no lawn there), shown grey. */
  stops: { key: number; point: [number, number]; n: number | null; loading: boolean }[];
  shop: [number, number] | null;
  /** The route in order, [lat, lon], from the shop and back when there is one. */
  route: [number, number][];
}

// One icon per look, reused (a new icon each render would reset the marker).
const runIcons = new Map<string, L.DivIcon>();
function runIcon(kind: "stop" | "loading" | "off" | "shop", n: number | null = null): L.DivIcon {
  const key = `${kind}:${n ?? ""}`;
  let icon = runIcons.get(key);
  if (!icon) {
    const html =
      kind === "shop"
        ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS.home}"/></svg>`
        : `<span>${n ?? ""}</span>`;
    icon = L.divIcon({ className: `run-marker run-${kind}`, html, iconSize: [26, 26] });
    runIcons.set(key, icon);
  }
  return icon;
}

/** A picture laid over the map, e.g. the satellite grass counted inside an outline. */
export interface MapOverlay {
  url: string;
  bounds: [[number, number], [number, number]];
}

export interface GolfMapProps {
  lang: Lang;
  geojson: FeatureCollection | null;
  /** Taps are for the tool (scan box or tracing): crosshair, no double-tap zoom. */
  capturing: boolean;
  firstCorner: [number, number] | null;
  /** Points of the shape being traced, [lat, lon]; null when not tracing. */
  tracePoints: [number, number][] | null;
  overlay: MapOverlay | null;
  /** Drawn scan box as [south, west, north, east], or null. */
  scanBox: [number, number, number, number] | null;
  /** The robot's charger, [lat, lon] (placed or estimated), or null. */
  charger: [number, number] | null;
  /** Areas being read right now, swept while they load (live loading). */
  scans: LiveScan[];
  /** The point tapped or searched, pulsing while the property there is found. */
  ping: [number, number] | null;
  /** A grass run being planned, or null. */
  run: MapRun | null;
  onMapClick: (latlng: [number, number]) => void;
  onMapReady: (map: L.Map) => void;
}

/**
 * Lifts the map instance up and, unless a share link set the view, centers on
 * the device location once.
 */
function MapInit({ onReady, locate }: { onReady: (map: L.Map) => void; locate: boolean }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    if (locate && typeof navigator !== "undefined" && navigator.geolocation) {
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
  }, [map, onReady, locate]);
  return null;
}

/**
 * Passes every tap up (the calculator decides what it means: a scan box
 * corner, a traced point, a sod field to toggle). While a tool is capturing,
 * shows a crosshair and turns off double-tap zoom.
 */
function TapCapture({
  capturing,
  onMapClick,
}: {
  capturing: boolean;
  onMapClick: (latlng: [number, number]) => void;
}) {
  const map = useMapEvents({
    click(event) {
      onMapClick([event.latlng.lat, event.latlng.lng]);
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    if (capturing) {
      map.doubleClickZoom.disable();
      container.style.cursor = "crosshair";
    } else {
      map.doubleClickZoom.enable();
      container.style.cursor = "";
    }
    return () => {
      container.style.cursor = "";
    };
  }, [capturing, map]);

  return null;
}

export default function GolfMap({
  lang,
  geojson,
  capturing,
  firstCorner,
  tracePoints,
  overlay,
  scanBox,
  charger,
  scans,
  ping,
  run,
  onMapClick,
  onMapReady,
}: GolfMapProps) {
  // Force the GeoJSON layer to remount whenever the data reference changes —
  // react-leaflet's GeoJSON does not diff `data`, so a new key is the only way
  // to get fresh geometry on screen.
  //
  // This used to mutate two refs during render, which React 19 rejects
  // ("Cannot access refs during render"). The state form below is React's
  // documented way to adjust state when a prop changes: the setters run during
  // render, React discards the in-progress output and immediately re-renders
  // with the new values, without committing the first pass or firing effects.
  // A share link's map view (v=lat,lon,zoom). This component is client-only.
  const [linkedView] = useState(() => decodeView(new URLSearchParams(window.location.search).get("v")));
  const [prevGeojson, setPrevGeojson] = useState<FeatureCollection | null>(null);
  const [geojsonKey, setGeojsonKey] = useState(0);
  if (geojson !== prevGeojson) {
    setPrevGeojson(geojson);
    setGeojsonKey((k) => k + 1);
  }

  return (
    <MapContainer
      center={linkedView ? [linkedView.lat, linkedView.lon] : DEFAULT_CENTER}
      zoom={linkedView?.zoom ?? DEFAULT_ZOOM}
      scrollWheelZoom
      maxZoom={19}
      attributionControl={false}
      zoomControl={false}
      className="h-full w-full"
    >
      {/* Leaflet reads layer names once, so a language change remounts the control. */}
      <LayersControl key={lang} position="topright">
        <LayersControl.BaseLayer checked name={UI[lang].layers.satellite}>
          <TileLayer
            attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={UI[lang].layers.streets}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <MapInit onReady={onMapReady} locate={!linkedView} />
      <TapCapture capturing={capturing} onMapClick={onMapClick} />

      {overlay && <ImageOverlay url={overlay.url} bounds={overlay.bounds} interactive={false} />}

      {geojson && geojson.features.length > 0 && (
        <GeoJSON
          key={geojsonKey}
          data={geojson}
          style={styleFeature}
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

      {tracePoints && tracePoints.length > 0 && (
        <>
          <Polyline
            positions={tracePoints}
            pathOptions={{ color: "#ffffff", weight: 2.5, dashArray: "6 5", interactive: false }}
          />
          {tracePoints.map((point, i) => (
            <CircleMarker
              key={i}
              center={point}
              // The first point is bigger: tapping it closes the shape.
              radius={i === 0 ? 8 : 5}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: i === 0 ? TURF_COLORS.course : "#2563eb",
                fillOpacity: 1,
                interactive: false,
              }}
            />
          ))}
        </>
      )}

      {scans.map((scan) => (
        <ScanOverlay key={scan.key} scan={scan} />
      ))}

      {ping && <Marker position={ping} icon={PING_ICON} interactive={false} keyboard={false} />}

      {run && run.route.length > 1 && (
        <Polyline positions={run.route} pathOptions={{ color: "#ffffff", weight: 3, opacity: 0.9, dashArray: "8 7", interactive: false }} />
      )}
      {run?.stops.map((s) => (
        <Marker key={s.key} position={s.point} icon={runIcon(s.loading ? "loading" : s.n === null ? "off" : "stop", s.n)} interactive={false} keyboard={false} />
      ))}
      {run?.shop && <Marker position={run.shop} icon={runIcon("shop")} interactive={false} keyboard={false} />}

      {charger && (
        <CircleMarker
          center={charger}
          radius={8}
          pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#f59e0b", fillOpacity: 1, interactive: false }}
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
    </MapContainer>
  );
}
