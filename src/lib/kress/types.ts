/**
 * Kress Connect API types (subset of API version 2026-09-01) plus the
 * normalized shapes our /api/kress/* routes return to the browser.
 *
 * This file must stay free of server-only imports: client components use it.
 */

// ---- Raw API shapes -------------------------------------------------------

export interface KressUser {
  id: number;
  type: "internal" | "customer" | "fleet_commander" | "dealer" | string;
  email?: string;
  name?: string;
  surname?: string;
  company?: string | null;
}

export interface KressLocationItem {
  location: { id: number; owner_id: number; default: boolean; name: string };
  permission: "owner" | "read" | "write" | "admin" | string;
}

export interface KressProductItem {
  uuid: string;
  owner_id: number;
  location_id: number;
  firmware_version: string;
  serial_number: string;
  mac_address: string | null;
  activated: boolean;
  product?: { code: string };
  head?: { code: string };
  preferences?: { name?: string; timezone?: string };
}

export interface KressMapItem {
  uuid: string;
  owner_id: number;
  location_id: number;
  group: string;
  name: string;
}

export interface KressDeviceStatus {
  timestamp: string;
  timezone: string;
  state: string;
  state_is_error: boolean;
  battery?: {
    charge_level: number;
    charging_status: string;
    maintenance_charge: boolean;
  } | null;
  position?: { latitude: number; longitude: number } | null;
}

export interface KressDeviceDetail {
  product_item: KressProductItem;
  head_item: KressProductItem | null;
  online: boolean;
  status: KressDeviceStatus | null;
}

/** Closed polygon; children are holes (and their children nested islands). */
export interface KressContour {
  points: { latitude: number; longitude: number }[];
  children?: KressContour[];
}

interface KressArea {
  id: number;
  enabled: boolean;
  name: string;
  area?: number;
  contours: KressContour[];
}

export interface KressMapDetail {
  map: KressMapItem;
  layers: {
    boundaries?: (KressArea & {
      zones?: (KressArea & { type: string })[];
    })[];
    exclusions?: KressArea[];
    markers?: {
      type: string;
      id: number;
      enabled: boolean;
      name: string;
      record: { latitude: number; longitude: number };
      product_item_uuid: string | null;
    }[];
  };
}

// ---- Normalized shapes for the browser ------------------------------------

export interface FleetDevice {
  uuid: string;
  name: string;
  serial: string;
  productCode: string | null;
  firmware: string;
  activated: boolean;
  locationId: number;
}

export interface FleetLocation {
  id: number;
  name: string;
  ownerId: number;
  ownerName: string;
  permission: string;
  devices: FleetDevice[];
  maps: { uuid: string; name: string; group: string }[];
}

export interface FleetResponse {
  locations: FleetLocation[];
  /** Partial failures (e.g. one customer's location was not readable). */
  warnings: string[];
  fetchedAt: string;
}

export interface DeviceLive {
  uuid: string;
  /** Kress says `online` is best effort: treat it as a hint. */
  online: boolean;
  state: string | null;
  stateIsError: boolean;
  battery: number | null;
  charging: string | null;
  position: { lat: number; lng: number } | null;
  timestamp: string | null;
  headCode: string | null;
  error?: string;
}

export interface SessionInfo {
  configured: boolean;
  connected: boolean;
}
