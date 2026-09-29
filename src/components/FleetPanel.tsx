"use client";

import { modelForCode } from "@/lib/kress-catalog";
import { TONE_COLORS, stateLabel, statusTone } from "@/lib/kress/status";
import type { DeviceLive, FleetDevice, FleetLocation, SessionInfo } from "@/lib/kress/types";

interface FleetPanelProps {
  session: SessionInfo | null;
  locations: FleetLocation[] | null;
  live: Record<string, DeviceLive>;
  warnings: string[];
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  mapsLocationId: number | null;
  selectedUuid: string | null;
  onConnect: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onClose: () => void;
  onSelectDevice: (device: FleetDevice, location: FleetLocation) => void;
  onShowLocationMap: (location: FleetLocation) => void;
  onHideLocationMap: () => void;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "unknown";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export default function FleetPanel(props: FleetPanelProps) {
  const { session, locations, live, loading, error } = props;
  const deviceCount = (locations ?? []).reduce((n, loc) => n + loc.devices.length, 0);

  return (
    <div
      className="pointer-events-auto absolute inset-x-2 z-[1250] flex max-h-[45dvh] flex-col rounded-2xl bg-white/95 shadow-2xl ring-1 ring-black/10 backdrop-blur sm:right-auto sm:w-96"
      style={{ top: "calc(max(0.5rem, env(safe-area-inset-top)) + 3.5rem)" }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Kress fleet{deviceCount ? ` · ${deviceCount} units` : ""}
        </h2>
        <div className="flex items-center gap-3 text-xs">
          {session?.connected && (
            <button
              onClick={props.onRefresh}
              disabled={loading}
              className="font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          )}
          <button onClick={props.onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close fleet">
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-3">
        {!session && <p className="text-xs text-slate-500">Checking Kress connection…</p>}

        {session && !session.configured && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Kress Connect isn&apos;t configured on this deployment yet. Add
            KRESS_CLIENT_ID, KRESS_CLIENT_SECRET and KRESS_SESSION_SECRET to the
            Vercel project, then redeploy.
          </p>
        )}

        {session?.configured && !session.connected && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Sign in with your Kress account to see your robots live on the map.
              Access is read-only: this app never starts, stops or reschedules a mower.
            </p>
            <button
              onClick={props.onConnect}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Connect Kress account
            </button>
          </div>
        )}

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        {props.warnings.length > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            Partially loaded: {props.warnings.slice(0, 3).join("; ")}
            {props.warnings.length > 3 ? ` (+${props.warnings.length - 3} more)` : ""}
          </p>
        )}

        {session?.connected && locations && locations.length === 0 && !loading && (
          <p className="text-xs text-slate-500">No Kress locations are shared with this account.</p>
        )}

        {locations?.map((location) => (
          <section key={location.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-xs font-semibold text-slate-800">{location.name}</h3>
                <p className="truncate text-[11px] text-slate-400">{location.ownerName}</p>
              </div>
              {location.maps.length > 0 &&
                (props.mapsLocationId === location.id ? (
                  <button onClick={props.onHideLocationMap} className="shrink-0 text-[11px] font-medium text-slate-500">
                    Hide map
                  </button>
                ) : (
                  <button
                    onClick={() => props.onShowLocationMap(location)}
                    className="shrink-0 text-[11px] font-medium text-violet-700"
                  >
                    Show map
                  </button>
                ))}
            </div>

            {location.devices.length === 0 && <p className="text-[11px] text-slate-400">No units</p>}

            {location.devices.map((device) => {
              const status = live[device.uuid];
              const tone = statusTone(status);
              const model = modelForCode(device.productCode);
              return (
                <button
                  key={device.uuid}
                  onClick={() => props.onSelectDevice(device, location)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50 ${
                    props.selectedUuid === device.uuid ? "bg-slate-100" : ""
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: TONE_COLORS[tone] }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{device.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {model?.name ?? device.productCode ?? "Unknown model"} ·{" "}
                      {status?.error ? status.error : stateLabel(status?.state)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-slate-500">
                    {status?.battery != null && <span className="block">{status.battery}%</span>}
                    <span className="block">{status ? timeAgo(status.timestamp) : "…"}</span>
                    {status && !status.position && <span className="block text-slate-400">no GPS</span>}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>

      {session?.connected && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span>
            {props.updatedAt ? `Updated ${props.updatedAt.toLocaleTimeString()}` : "Not loaded"} · online status is best effort
          </span>
          <button onClick={props.onDisconnect} className="font-medium hover:text-red-600">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
