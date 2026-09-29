import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/kress/config";
import { readTokens } from "@/lib/kress/session";
import type { SessionInfo } from "@/lib/kress/types";

export const dynamic = "force-dynamic";

/** Cheap check so the UI knows whether to show "Connect" or the fleet. */
export async function GET(req: NextRequest) {
  const configured = isConfigured();
  const body: SessionInfo = {
    configured,
    connected: configured && readTokens(req) !== null,
  };
  return NextResponse.json(body);
}
