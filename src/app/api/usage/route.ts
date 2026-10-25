import { forbidden, isTeam, kv, noStorage } from "@/lib/kv-server";
import { USAGE_EVENTS, isUsageEvent } from "@/lib/usage";

/**
 * Usage counts: POST { name } counts one use today (only the names in
 * usage.ts); GET (team key) the last 30 days, per day and name. Kept 90 days.
 */
const day = (d = new Date()) => d.toISOString().slice(0, 10);

export async function POST(request: Request) {
  const db = kv();
  if (!db) return new Response(null, { status: 204 });
  const text = await request.text().catch(() => "");
  let name: unknown = null;
  try {
    name = (JSON.parse(text) as { name?: unknown }).name;
  } catch {
    // Not JSON: not counted.
  }
  if (!isUsageEvent(name)) return Response.json({ error: "Unknown event" }, { status: 400 });
  const key = `usage:${day()}`;
  await db.pipeline([
    ["HINCRBY", key, name, 1],
    ["EXPIRE", key, 90 * 86_400],
  ]);
  return new Response(null, { status: 204 });
}

export async function GET(request: Request) {
  if (!isTeam(request)) return forbidden();
  const db = kv();
  if (!db) return noStorage();
  const days = Array.from({ length: 30 }, (_, i) => day(new Date(Date.now() - i * 86_400_000)));
  const rows = (await db.pipeline(days.map((d) => ["HGETALL", `usage:${d}`]))) as (string[] | null)[];
  const byDay = days.map((d, i) => {
    const flat = rows[i] ?? [];
    const counts: Record<string, number> = {};
    for (let k = 0; k + 1 < flat.length; k += 2) counts[flat[k]] = Number(flat[k + 1]);
    return { day: d, counts };
  });
  return Response.json({ events: USAGE_EVENTS, days: byDay }, { headers: { "Cache-Control": "no-store" } });
}
