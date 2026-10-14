import { GAS_VECTOR_ID, STATCAN_WDS_URL, parseStatcanGas } from "@/lib/gas";

/**
 * Latest Montréal regular gas price (Statistics Canada, monthly). Cached on
 * Vercel's CDN for a day, which is the "scheduled refresh": at most one call
 * to StatCan per day. On failure the ROI tab keeps its dated default.
 */
export async function GET() {
  try {
    const response = await fetch(STATCAN_WDS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ vectorId: GAS_VECTOR_ID, latestN: 1 }]),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const gas = response.ok ? parseStatcanGas(await response.json()) : null;
    if (!gas) throw new Error(`StatCan answered ${response.status} without a usable price`);
    return Response.json(gas, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (err) {
    console.error("[gas-price]", String(err));
    return Response.json({ error: "Gas price unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
