import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { backfillStoryPlusHours } from "@/lib/hltb";
import { syncNintendoData } from "@/lib/nintendo";
import { evaluateWantPriceAlerts, syncLowestPriceHistoryForAllGames } from "@/lib/price-alerts";
import { syncPsnData } from "@/lib/psn";
import { syncSteamData } from "@/lib/steam";

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [psn, steam, nintendo, hltb] = await Promise.all([
      syncPsnData(user.id),
      syncSteamData(user.id),
      syncNintendoData(user.id),
      backfillStoryPlusHours(user.id, 25)
    ]);
    await syncLowestPriceHistoryForAllGames(user.id);
    await evaluateWantPriceAlerts(user.id);
    return NextResponse.json({
      enabled: psn.enabled || steam.enabled || nintendo.enabled,
      psn,
      steam,
      nintendo,
      hltb,
      syncedCount: (psn.syncedCount ?? 0) + (steam.syncedCount ?? 0) + (nintendo.syncedCount ?? 0),
      updatedTrackedCount:
        (psn.updatedTrackedCount ?? 0) + (steam.updatedTrackedCount ?? 0) + (nintendo.updatedTrackedCount ?? 0)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
