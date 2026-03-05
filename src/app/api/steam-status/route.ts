import { NextResponse } from "next/server";

import { getSteamConnectionStatus } from "@/lib/steam";

export async function GET() {
  const status = await getSteamConnectionStatus();
  return NextResponse.json(status);
}
