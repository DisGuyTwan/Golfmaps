import { fetchCadastreLot } from "@/lib/parcel";

/**
 * The Quebec cadastre lot at a point (?lat=&lon=), for residential lawns. A
 * lot is cached on the CDN for a week (the cadastre is updated every two
 * months); "no lot here" for a day; errors are never cached.
 */
export const maxDuration = 30;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!params.get("lat") || !params.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat and lon are required" }, { status: 400 });
  }

  try {
    const parcel = await fetchCadastreLot(lat, lon);
    if (!parcel) {
      return Response.json({ error: "No lot here" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } });
    }
    return Response.json(parcel, {
      headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" },
    });
  } catch (err) {
    console.error("[parcel]", JSON.stringify({ lat, lon, error: String(err) }));
    return Response.json({ error: "Cadastre unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
