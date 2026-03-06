import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie, clearSessionFromRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await clearSessionFromRequest(request);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
