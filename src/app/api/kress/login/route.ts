import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, kressEnv } from "@/lib/kress/config";
import { buildAuthorizeUrl } from "@/lib/kress/oidc";
import { createPkce, randomToken, writePkce } from "@/lib/kress/session";

export const dynamic = "force-dynamic";

/** Starts the OAuth 2.0 Authorization Code + PKCE flow with Kress ID. */
export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.redirect(new URL("/?kress=not_configured", req.url));
  }

  const redirectUri =
    kressEnv().redirectUri ?? new URL("/api/kress/callback", req.nextUrl.origin).toString();
  const { verifier, challenge } = createPkce();
  const state = randomToken();

  try {
    const authorizeUrl = await buildAuthorizeUrl({ redirectUri, state, challenge });
    const res = NextResponse.redirect(authorizeUrl);
    writePkce(req, res, { verifier, state, redirectUri });
    return res;
  } catch (err) {
    console.error("Kress login failed:", err);
    return NextResponse.redirect(new URL("/?kress=error", req.url));
  }
}
