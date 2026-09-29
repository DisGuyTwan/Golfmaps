/**
 * Kress Connect configuration. Server-only: reads secrets from the environment.
 * Never hardcode credentials here — set them in Vercel / .env.local.
 */

/** API version sent on every request. Bump here when Kress ships a new one. */
export const KRESS_API_VERSION = "2026-09-01";

/** Overridable for a mock/staging server; defaults to Kress production. */
export const KRESS_API_BASE =
  process.env.KRESS_API_BASE_URL ?? "https://api.connect.kress-robotik.com";
export const KRESS_ISSUER = process.env.KRESS_ISSUER_URL ?? "https://id.kress.com";

export const COOKIE = {
  access: "kress_at",
  refresh: "kress_rt",
  pkce: "kress_pkce",
} as const;

export function kressEnv() {
  return {
    clientId: process.env.KRESS_CLIENT_ID,
    /** Optional: a public PKCE client may not have one. */
    clientSecret: process.env.KRESS_CLIENT_SECRET,
    sessionSecret: process.env.KRESS_SESSION_SECRET,
    /** Space-separated override when Kress requires specific API scopes. */
    scopes: process.env.KRESS_SCOPES,
    /** Override when the registered redirect URL differs from this host. */
    redirectUri: process.env.KRESS_REDIRECT_URI,
  };
}

export function isConfigured(): boolean {
  const env = kressEnv();
  return Boolean(env.clientId && env.sessionSecret && env.sessionSecret.length >= 32);
}
