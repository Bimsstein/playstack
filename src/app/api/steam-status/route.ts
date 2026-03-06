import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { getSteamConnectionStatus } from "@/lib/steam";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = await getSteamConnectionStatus(user.id);
  return NextResponse.json(status);
}
