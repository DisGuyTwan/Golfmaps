/**
 * The app's small database: Upstash Redis on Vercel (added from the Vercel
 * Marketplace, which sets KV_REST_API_URL and KV_REST_API_TOKEN, or
 * UPSTASH_REDIS_REST_URL and _TOKEN), spoken to over its REST API with the
 * built-in fetch: no package. It holds proposals and what clients do with
 * them, the field checks and installs recorded, and usage counts. Route
 * handlers only: the token never reaches the browser. Without it, `kv()` is
 * null and the routes say storage isn't connected (503).
 *
 * Also the team key (TEAM_KEY): reps and the admin page send it to create
 * proposals, record actuals and read the lists.
 */

export interface Kv {
  /** One command (["SET", key, value]), its result. */
  cmd<T = unknown>(...args: (string | number)[]): Promise<T>;
  /** Several commands in one round trip, their results in order. */
  pipeline(commands: (string | number)[][]): Promise<unknown[]>;
}

export function kv(): Kv | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const call = async (path: string, body: unknown) => {
    const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Redis answered ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  return {
    async cmd<T>(...args: (string | number)[]) {
      const r = (await call("", args)) as { result?: T; error?: string };
      if (r.error) throw new Error(r.error);
      return r.result as T;
    },
    async pipeline(commands) {
      const r = (await call("/pipeline", commands)) as { result?: unknown; error?: string }[];
      return r.map((x) => {
        if (x.error) throw new Error(x.error);
        return x.result;
      });
    },
  };
}

/** The reply when there's no database connected. */
export const noStorage = () =>
  Response.json({ error: "Storage isn't connected: add Upstash Redis to the project from the Vercel Marketplace." }, { status: 503 });

/** Compares two strings in time that doesn't depend on where they differ. */
function sameText(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Whether a request carries the team key (header x-team-key). False when none is set up. */
export function isTeam(request: Request): boolean {
  const key = process.env.TEAM_KEY;
  const given = request.headers.get("x-team-key");
  return !!key && !!given && sameText(given, key);
}

export const forbidden = () => Response.json({ error: "The team key is missing or wrong." }, { status: 403 });

/** A random id for a proposal's link: 12 letters and digits (no look-alikes), about 69 bits. */
export function newId(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
