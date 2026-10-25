import { forbidden, isTeam, kv, newId, noStorage } from "@/lib/kv-server";
import { parseRecord, summarize, type FieldRecord } from "@/lib/records";

/**
 * Field checks and installs (records.ts). GET: what the app needs from them
 * (calibration per model, likely ranges per basis, the track record),
 * public and cached 5 minutes; with the team key and ?all=1, every record.
 * POST (team key): a new record, or { delete: id }.
 */
export const maxDuration = 15;

async function allRecords(): Promise<FieldRecord[]> {
  const values = (await kv()!.cmd<string[]>("HVALS", "records")) ?? [];
  return values.flatMap((v) => {
    try {
      return [JSON.parse(v) as FieldRecord];
    } catch {
      return [];
    }
  });
}

export async function GET(request: Request) {
  if (!kv()) return Response.json(summarize([]), { headers: { "Cache-Control": "public, s-maxage=300" } });
  try {
    const records = await allRecords();
    if (new URL(request.url).searchParams.get("all") === "1") {
      if (!isTeam(request)) return forbidden();
      return Response.json({ records: records.sort((a, b) => b.at.localeCompare(a.at)) }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(summarize(records), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (err) {
    console.error("[records]", String(err));
    return Response.json(summarize([]), { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!isTeam(request)) return forbidden();
  const db = kv();
  if (!db) return noStorage();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body && typeof body.delete === "string") {
    await db.cmd("HDEL", "records", body.delete);
    return Response.json({ deleted: body.delete });
  }
  const record = parseRecord(body, newId(), new Date().toISOString());
  if (!record) return Response.json({ error: "Not a field check or an install" }, { status: 400 });
  await db.cmd("HSET", "records", record.id, JSON.stringify(record));
  return Response.json({ record });
}
