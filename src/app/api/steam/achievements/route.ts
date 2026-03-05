import { NextRequest, NextResponse } from "next/server";

import { getSteamAchievementsForApp } from "@/lib/steam";

export async function GET(request: NextRequest) {
  const appIdRaw = request.nextUrl.searchParams.get("appId");
  const appId = Number(appIdRaw);
  if (!Number.isFinite(appId) || appId <= 0) {
    return NextResponse.json({ error: "Missing or invalid appId" }, { status: 400 });
  }

  try {
    const result = await getSteamAchievementsForApp(appId);
    return NextResponse.json({
      trophies: result.achievements,
      earned: result.earned,
      total: result.total
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Steam achievements";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
