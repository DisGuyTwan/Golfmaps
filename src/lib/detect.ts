/**
 * What kind of property a point is on, so the rep never has to say: a golf
 * course, a sod farm or a house lot (the Acreage tab's three modes). Each is
 * then measured by the same engine (surface.ts: aerial photos and LiDAR),
 * from its own outline: the course's outline in OpenStreetMap, the crop map's
 * sod fields, or the cadastre lot.
 *
 * A house-sized lot is a lawn whatever is around it (a house on a fairway, a
 * farmhouse by the fields). On a bigger lot, or where there's no cadastre:
 * sod if the crop map has sod around the point, a golf course if one of
 * OpenStreetMap's course outlines holds the point, else a lawn (a big lot).
 * Pure, so the rules are tested without a browser.
 */
import area from "@turf/area";
import osmtogeojson from "osmtogeojson";
import type { MultiPolygon, Polygon } from "geojson";
import { toAreaFeature } from "./area";
import { ACI_SOD, pointInGeometry, polygonMask, type LandGrid } from "./landcover";
import type { AcreageMode } from "./quote";

/** Lots smaller than this (m², about 1.2 acres) are a house's, whatever is around them. */
export const HOUSE_LOT_M2 = 5000;
/** How far around the point the crop map is read for sod (m): a farmhouse's yard, and the fields around it. */
export const SOD_LOOK_M = 150;
/** At least this share of sod around the point makes it a sod farm. */
export const SOD_SHARE = 0.3;
/** How far around the point a detected sod farm's fields are looked for (m). */
export const SOD_FARM_M = 1200;

export interface GolfCourse {
  geometry: Polygon | MultiPolygon;
  name: string | null;
}

/** The OpenStreetMap golf course whose outline holds the point, from an Overpass answer; the smallest if several. */
export function golfCourseAt(overpassJson: unknown, lat: number, lon: number): GolfCourse | null {
  let best: GolfCourse | null = null;
  let bestM2 = Infinity;
  for (const feature of osmtogeojson(overpassJson).features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (props.leisure !== "golf_course") continue;
    const shape = toAreaFeature(feature);
    const geometry = shape?.geometry as Polygon | MultiPolygon | undefined;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) continue;
    if (!pointInGeometry(lon, lat, geometry)) continue;
    const m2 = area({ type: "Feature", geometry, properties: {} });
    if (m2 < bestM2) {
      bestM2 = m2;
      best = { geometry, name: typeof props.name === "string" ? props.name : null };
    }
  }
  return best;
}

/** Share of the crop map's cells within `radiusM` of the point that are sod (0 where it has no data). */
export function sodShareAround(grid: LandGrid, lat: number, lon: number, radiusM: number): number {
  const { bbox, width, height, data } = grid;
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  let all = 0;
  let sod = 0;
  for (let r = 0; r < height; r++) {
    const cellLat = bbox.north - ((r + 0.5) * (bbox.north - bbox.south)) / height;
    for (let c = 0; c < width; c++) {
      const cellLon = bbox.west + ((c + 0.5) * (bbox.east - bbox.west)) / width;
      if (Math.hypot((cellLon - lon) * kx, (cellLat - lat) * 111_320) > radiusM) continue;
      const v = data[r * width + c];
      if (v === 0) continue;
      all++;
      if (v === ACI_SOD) sod++;
    }
  }
  return all ? sod / all : 0;
}

/** Share of the crop map's cells inside an outline that are sod (a traced property). */
export function sodShareInside(grid: LandGrid, outline: Polygon | MultiPolygon): number {
  const inside = polygonMask(grid, [outline]);
  let all = 0;
  let sod = 0;
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i] || grid.data[i] === 0) continue;
    all++;
    if (grid.data[i] === ACI_SOD) sod++;
  }
  return all ? sod / all : 0;
}

export interface Evidence {
  /** The cadastre lot's area (m²); null where there's no lot (outside Quebec, or nothing there). */
  lotM2: number | null;
  /** Share of sod around the point (sodShareAround). */
  sodShare: number;
  /** True when an OpenStreetMap golf course outline holds the point. */
  inGolfCourse: boolean;
}

/** The kind of property, from what was found at the point. */
export function propertyKind({ lotM2, sodShare, inGolfCourse }: Evidence): AcreageMode {
  if (lotM2 !== null && lotM2 < HOUSE_LOT_M2) return "lawn";
  if (sodShare >= SOD_SHARE) return "sod";
  if (inGolfCourse) return "golf";
  return "lawn";
}

/** True when the lot alone settles it (a house lot), so the slower lookups needn't be awaited. */
export function settledByLot(lotM2: number | null): boolean {
  return lotM2 !== null && lotM2 < HOUSE_LOT_M2;
}
