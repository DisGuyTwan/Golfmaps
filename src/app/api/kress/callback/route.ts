import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, isConfigured } from "@/lib/kress/config";
import { exchangeCode } from "@/lib/kress/oidc";
import { readPkce, writeTokens } from "@/lib/kress/session";

export const dynamic = "force-dynamic";

/** OAuth redirect target: validates state and exchanges the code for tokens. */
export async function GET(req: NextRequest) {
  const home = (status: string) => new URL(`/?kress=${status}`, req.url);
  if (!isConfigured()) return NextResponse.redirect(home("not_configured"));

  const params = req.nextUrl.searchParams;
  const pkce = readPkce(req);
  const fail = (status: string) => {
    const res = NextResponse.redirect(home(status));
    res.cookies.delete(COOKIE.pkce);
    return res;
  };

  if (params.get("error")) return fail("denied");
  const code = params.get("code");
  if (!code || !pkce || params.get("state") !== pkce.state) return fail("error");

  try {
    const tokens = await exchangeCode(code, pkce.verifier, pkce.redirectUri);
    const res = NextResponse.redirect(home("connected"));
    res.cookies.delete(COOKIE.pkce);
    writeTokens(req, res, tokens);
    return res;
  } catch (err) {
    console.error("Kress token exchange failed:", err);
    return fail("error");
  }
}
