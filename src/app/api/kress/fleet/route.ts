import { NextResponse, type NextRequest } from "next/server";
import { KressApiError, withKress } from "@/lib/kress/client";
import { jwtSubject } from "@/lib/kress/session";
import type {
  FleetLocation,
  FleetResponse,
  KressLocationItem,
  KressMapItem,
  KressProductItem,
  KressUser,
} from "@/lib/kress/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function displayName(user: KressUser): string {
  const person = [user.name, user.surname].filter(Boolean).join(" ");
  return user.company || person || user.email || `User ${user.id}`;
}

/**
 * Walks users -> locations -> devices + maps. Device live status is fetched
 * separately (/api/kress/devices) so this stays fast and cacheable client-side.
 */
export async function GET(req: NextRequest) {
  return withKress(req, async (client) => {
    const warnings: string[] = [];
    const users = await client.getAll<KressUser>("/users");

    // (inferred) /users lists associated users, not necessarily yourself; use
    // the token's subject so your own locations are included too.
    const selfId = Number(jwtSubject(client.accessToken));
    if (Number.isInteger(selfId) && selfId > 0 && !users.some((u) => u.id === selfId)) {
      users.unshift({ id: selfId, type: "self", name: "My locations" });
    }

    const seen = new Set<number>();
    const locations: FleetLocation[] = [];

    await Promise.all(
      users.map(async (user) => {
        let items: KressLocationItem[] = [];
        try {
          items = await client.getAll<KressLocationItem>(`/users/${user.id}/locations`);
        } catch (err) {
          if (err instanceof KressApiError && err.status === 401) throw err;
          warnings.push(`Locations of ${displayName(user)} unavailable`);
          return;
        }

        await Promise.all(
          items.map(async ({ location, permission }) => {
            if (seen.has(location.id)) return;
            seen.add(location.id);
            const base = `/users/${user.id}/locations/${location.id}`;
            const [devices, maps] = await Promise.all([
              client.getAll<KressProductItem>(`${base}/product-items`).catch((err) => {
                if (err instanceof KressApiError && err.status === 401) throw err;
                warnings.push(`Devices of "${location.name}" unavailable`);
                return [] as KressProductItem[];
              }),
              client.getAll<KressMapItem>(`${base}/maps`).catch((err) => {
                if (err instanceof KressApiError && err.status === 401) throw err;
                warnings.push(`Maps of "${location.name}" unavailable`);
                return [] as KressMapItem[];
              }),
            ]);

            locations.push({
              id: location.id,
              name: location.name,
              ownerId: location.owner_id,
              ownerName: displayName(user),
              permission,
              devices: devices.map((d) => ({
                uuid: d.uuid,
                name: d.preferences?.name || d.serial_number,
                serial: d.serial_number,
                productCode: d.product?.code ?? null,
                firmware: d.firmware_version,
                activated: d.activated,
                locationId: location.id,
              })),
              maps: maps.map((m) => ({ uuid: m.uuid, name: m.name, group: m.group })),
            });
          }),
        );
      }),
    );

    locations.sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.name.localeCompare(b.name));
    const body: FleetResponse = { locations, warnings, fetchedAt: new Date().toISOString() };
    return NextResponse.json(body);
  });
}
