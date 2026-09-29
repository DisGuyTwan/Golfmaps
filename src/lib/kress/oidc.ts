import { KRESS_ISSUER, kressEnv } from "./config";
import type { TokenSet } from "./session";

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

let discoveryPromise: Promise<Discovery> | null = null;

/** Fetches (and caches per server instance) the OpenID discovery document. */
export function getDiscovery(): Promise<Discovery> {
  if (!discoveryPromise) {
    discoveryPromise = fetch(`${KRESS_ISSUER}/.well-known/openid-configuration`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`OIDC discovery failed (HTTP ${res.status})`);
        const doc = (await res.json()) as Discovery;
        if (!doc.authorization_endpoint || !doc.token_endpoint) {
          throw new Error("OIDC discovery document is missing endpoints");
        }
        return doc;
      })
      .catch((err) => {
        discoveryPromise = null; // retry on the next call
        throw err;
      });
  }
  return discoveryPromise;
}

function resolveScopes(doc: Discovery): string {
  const env = kressEnv();
  if (env.scopes) return env.scopes;
  const wanted = ["openid", "offline_access"];
  if (!Array.isArray(doc.scopes_supported)) return wanted.join(" ");
  const supported = wanted.filter((scope) => doc.scopes_supported!.includes(scope));
  return supported.length ? supported.join(" ") : "openid";
}

export async function buildAuthorizeUrl(params: {
  redirectUri: string;
  state: string;
  challenge: string;
}): Promise<string> {
  const doc = await getDiscovery();
  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", kressEnv().clientId ?? "");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", resolveScopes(doc));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const doc = await getDiscovery();
  const { clientId, clientSecret } = kressEnv();
  const form = new URLSearchParams(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  const methods = doc.token_endpoint_auth_methods_supported;
  if (clientSecret && (!methods || methods.includes("client_secret_basic"))) {
    const basic = Buffer.from(
      `${encodeURIComponent(clientId ?? "")}:${encodeURIComponent(clientSecret)}`,
    ).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  } else {
    form.set("client_id", clientId ?? "");
    if (clientSecret) form.set("client_secret", clientSecret);
  }

  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers,
    body: form.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Token request failed (HTTP ${res.status}): ${json.error ?? ""} ${json.error_description ?? ""}`.trim(),
    );
  }
  return {
    accessToken: json.access_token,
    // Refresh 30 s early; if expiry is unknown, rely on 401 handling instead.
    expiresAt: json.expires_in ? Date.now() + (json.expires_in - 30) * 1000 : 0,
    refreshToken: json.refresh_token ?? body.refresh_token ?? null,
  };
}

export function exchangeCode(code: string, verifier: string, redirectUri: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
}

export function refreshTokens(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}
