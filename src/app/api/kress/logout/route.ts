import { NextResponse } from "next/server";
import { clearTokens } from "@/lib/kress/session";

export const dynamic = "force-dynamic";

/** Forgets the Kress session on this browser. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearTokens(res);
  return res;
}
