import { NextResponse } from "next/server";

import { backfillStoryPlusHours } from "@/lib/hltb";
import { syncNintendoData } from "@/lib/nintendo";
import { evaluateWantPriceAlerts, syncLowestPriceHistoryForAllGames } from "@/lib/price-alerts";
import { syncPsnData } from "@/lib/psn";
import { syncSteamData } from "@/lib/steam";

export async function POST() {
  try {
    const [psn, steam, nintendo, hltb] = await Promise.all([
      syncPsnData(),
      syncSteamData(),
      syncNintendoData(),
      backfillStoryPlusHours(25)
    ]);
    await syncLowestPriceHistoryForAllGames();
    await evaluateWantPriceAlerts();
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
