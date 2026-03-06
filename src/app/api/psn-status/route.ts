import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { getPsnConnectionStatus } from "@/lib/psn";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const status = await getPsnConnectionStatus(user.id);
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch PSN status";
    return NextResponse.json({ enabled: true, connected: false, error: message }, { status: 500 });
  }
}
