import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { COOKIE, kressEnv } from "./config";

export interface TokenSet {
  accessToken: string;
  /** Epoch ms after which the access token should be refreshed (0 = unknown). */
  expiresAt: number;
  refreshToken: string | null;
}

// ---- AES-256-GCM sealed cookies -------------------------------------------

function key(): Buffer {
  const secret = kressEnv().sessionSecret;
  if (!secret) throw new Error("KRESS_SESSION_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

export function seal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function unseal(sealed: string | undefined): string | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null; // tampered, wrong secret, or malformed
  }
}

// ---- Token cookies ---------------------------------------------------------

function cookieOptions(req: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function readTokens(req: NextRequest): TokenSet | null {
  const access = unseal(req.cookies.get(COOKIE.access)?.value);
  const refreshToken = unseal(req.cookies.get(COOKIE.refresh)?.value);
  if (access) {
    try {
      const parsed = JSON.parse(access) as { t: string; e: number };
      return { accessToken: parsed.t, expiresAt: parsed.e, refreshToken };
    } catch {
      /* fall through */
    }
  }
  // No usable access token, but a refresh token can mint a new one.
  return refreshToken ? { accessToken: "", expiresAt: 0, refreshToken } : null;
}

export function writeTokens(req: NextRequest, res: NextResponse, tokens: TokenSet) {
  res.cookies.set(
    COOKIE.access,
    seal(JSON.stringify({ t: tokens.accessToken, e: tokens.expiresAt })),
    cookieOptions(req, 60 * 60 * 24),
  );
  if (tokens.refreshToken) {
    res.cookies.set(COOKIE.refresh, seal(tokens.refreshToken), cookieOptions(req, 60 * 60 * 24 * 30));
  }
}

export function clearTokens(res: NextResponse) {
  res.cookies.delete(COOKIE.access);
  res.cookies.delete(COOKIE.refresh);
}

// ---- PKCE / state ------------------------------------------------------------

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createPkce() {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function writePkce(
  req: NextRequest,
  res: NextResponse,
  value: { verifier: string; state: string; redirectUri: string },
) {
  res.cookies.set(COOKIE.pkce, seal(JSON.stringify(value)), cookieOptions(req, 600));
}

export function readPkce(req: NextRequest) {
  const raw = unseal(req.cookies.get(COOKIE.pkce)?.value);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { verifier: string; state: string; redirectUri: string };
  } catch {
    return null;
  }
}

/** Reads the `sub` claim of a JWT without verifying it (display/lookup only). */
export function jwtSubject(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return payload?.sub != null ? String(payload.sub) : null;
  } catch {
    return null;
  }
}
