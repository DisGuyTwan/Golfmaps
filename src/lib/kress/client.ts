import { NextResponse, type NextRequest } from "next/server";
import { KRESS_API_BASE, KRESS_API_VERSION, isConfigured } from "./config";
import { refreshTokens } from "./oidc";
import { clearTokens, readTokens, writeTokens, type TokenSet } from "./session";

/** Kress limits: 5 requests/second, 10 simultaneous. Stay a bit under both. */
const MIN_SPACING_MS = 220;
const MAX_CONCURRENT = 8;
const MAX_429_RETRIES = 4;
const MAX_PAGES = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class KressApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public wwwAuthenticate?: string,
  ) {
    super(message);
  }
}

/** Spaces request starts and caps concurrency. */
class Limiter {
  private active = 0;
  private waiters: (() => void)[] = [];
  private nextStart = 0;

  private async acquire() {
    if (this.active < MAX_CONCURRENT) {
      this.active += 1;
      return;
    }
    // The releasing request hands its slot straight to us (no increment).
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const now = Date.now();
      const start = Math.max(now, this.nextStart);
      this.nextStart = start + MIN_SPACING_MS;
      if (start > now) await sleep(start - now);
      return await fn();
    } finally {
      this.release();
    }
  }
}

/** Read-only Kress Connect client (write endpoints are intentionally absent). */
export class KressClient {
  private limiter = new Limiter();
  private refreshing: Promise<void> | null = null;

  constructor(
    private tokens: TokenSet,
    private onRefresh: (tokens: TokenSet) => void,
  ) {}

  get accessToken() {
    return this.tokens.accessToken;
  }

  private refresh(): Promise<void> {
    if (!this.refreshing) {
      const refreshToken = this.tokens.refreshToken;
      if (!refreshToken) return Promise.reject(new KressApiError(401, "Session expired"));
      this.refreshing = refreshTokens(refreshToken)
        .then((tokens) => {
          this.tokens = tokens;
          this.onRefresh(tokens);
        })
        .catch((err) => {
          throw new KressApiError(401, `Could not refresh the Kress session: ${err.message}`);
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  async request<T>(
    path: string,
    headers: Record<string, string> = {},
  ): Promise<{ data: T; headers: Headers }> {
    let refreshedForThisCall = false;

    for (let attempt = 0; ; attempt += 1) {
      const expired = !this.tokens.accessToken || (this.tokens.expiresAt > 0 && Date.now() > this.tokens.expiresAt);
      if (expired && this.tokens.refreshToken && !refreshedForThisCall) {
        refreshedForThisCall = true;
        await this.refresh();
      }

      const res = await this.limiter.run(() =>
        fetch(`${KRESS_API_BASE}${path}`, {
          headers: {
            Accept: "application/json",
            "Accept-Version": KRESS_API_VERSION,
            Authorization: `Bearer ${this.tokens.accessToken}`,
            ...headers,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        }),
      );

      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        await sleep(Math.min(8000, 2 ** attempt * 500) + Math.random() * 400);
        continue;
      }
      if (res.status === 401 && !refreshedForThisCall && this.tokens.refreshToken) {
        refreshedForThisCall = true;
        await this.refresh();
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new KressApiError(
          res.status,
          `Kress API ${res.status} on ${path}: ${body.slice(0, 300)}`,
          res.headers.get("www-authenticate") ?? undefined,
        );
      }

      const data = (res.status === 204 ? undefined : await res.json()) as T;
      return { data, headers: res.headers };
    }
  }

  async get<T>(path: string): Promise<T> {
    return (await this.request<T>(path)).data;
  }

  /** Follows header-based pagination until Pagination-Next-Token is empty. */
  async getAll<T>(path: string, pageSize = 100): Promise<T[]> {
    const items: T[] = [];
    const seen = new Set<string>();
    let token: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const headers: Record<string, string> = { "Pagination-Max-Items": String(pageSize) };
      if (token) headers["Pagination-Starting-Token"] = token;

      const { data, headers: resHeaders } = await this.request<unknown>(path, headers);
      if (Array.isArray(data)) items.push(...(data as T[]));
      else if (data && Array.isArray((data as { items?: unknown }).items)) {
        items.push(...((data as { items: T[] }).items)); // (inferred) wrapped shape
      }

      token = resHeaders.get("pagination-next-token");
      if (!token || seen.has(token)) break;
      seen.add(token);
    }
    return items;
  }
}

/**
 * Runs a route handler with an authenticated client, persisting refreshed
 * tokens and mapping Kress errors to sensible HTTP responses.
 */
export async function withKress(
  req: NextRequest,
  handler: (client: KressClient) => Promise<NextResponse>,
): Promise<NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const tokens = readTokens(req);
  if (!tokens) return NextResponse.json({ error: "not_connected" }, { status: 401 });

  const refreshed: { tokens: TokenSet | null } = { tokens: null };
  const client = new KressClient(tokens, (next) => {
    refreshed.tokens = next;
  });

  let res: NextResponse;
  try {
    res = await handler(client);
  } catch (err) {
    if (err instanceof KressApiError && err.status === 401) {
      const unauthorized = NextResponse.json({ error: "not_connected" }, { status: 401 });
      clearTokens(unauthorized);
      return unauthorized;
    }
    const status =
      err instanceof KressApiError ? (err.status === 429 ? 429 : err.status === 403 ? 403 : 502) : 500;
    res = NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status },
    );
  }

  if (refreshed.tokens) writeTokens(req, res, refreshed.tokens);
  return res;
}
