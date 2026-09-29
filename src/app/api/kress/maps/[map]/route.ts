import { NextResponse, type NextRequest } from "next/server";
import { withKress } from "@/lib/kress/client";
import { kressMapToGeoJSON } from "@/lib/kress/geometry";
import type { KressMapDetail } from "@/lib/kress/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Kress map's boundaries, zones, exclusions and markers as GeoJSON. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ map: string }> },
) {
  const { map } = await params;
  if (!UUID.test(map)) {
    return NextResponse.json({ error: "Invalid map id" }, { status: 400 });
  }
  return withKress(req, async (client) => {
    const detail = await client.get<KressMapDetail>(`/maps/${map}`);
    return NextResponse.json({
      uuid: map,
      name: detail.map?.name ?? "Kress map",
      geojson: kressMapToGeoJSON(detail),
    });
  });
}
