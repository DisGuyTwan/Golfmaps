import { NextResponse, type NextRequest } from "next/server";
import { KressApiError, withKress } from "@/lib/kress/client";
import type { DeviceLive, KressDeviceDetail } from "@/lib/kress/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 25;

/** Live status for up to 25 devices: GET /api/kress/devices?ids=a,b,c */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => UUID.test(id))) {
    return NextResponse.json({ error: `Pass 1-${MAX_IDS} device UUIDs in ?ids=` }, { status: 400 });
  }

  return withKress(req, async (client) => {
    const devices = await Promise.all(
      ids.map(async (uuid): Promise<DeviceLive> => {
        try {
          const detail = await client.get<KressDeviceDetail>(`/product-items/${uuid}`);
          const status = detail.status;
          const pos = status?.position;
          return {
            uuid,
            online: Boolean(detail.online),
            state: status?.state ?? null,
            stateIsError: Boolean(status?.state_is_error),
            battery: status?.battery?.charge_level ?? null,
            charging: status?.battery?.charging_status ?? null,
            position:
              pos && Number.isFinite(pos.latitude) && Number.isFinite(pos.longitude)
                ? { lat: pos.latitude, lng: pos.longitude }
                : null,
            timestamp: status?.timestamp ?? null,
            headCode: detail.head_item?.head?.code ?? null,
          };
        } catch (err) {
          if (err instanceof KressApiError && err.status === 401) throw err;
          return {
            uuid,
            online: false,
            state: null,
            stateIsError: false,
            battery: null,
            charging: null,
            position: null,
            timestamp: null,
            headCode: null,
            error: err instanceof KressApiError ? `HTTP ${err.status}` : "Unavailable",
          };
        }
      }),
    );
    return NextResponse.json({ devices, fetchedAt: new Date().toISOString() });
  });
}
