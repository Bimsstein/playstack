import { NextResponse } from "next/server";

import { syncCompletedNintendoGamesToDone } from "@/lib/nintendo";
import { syncCompletedPsnGamesToDone } from "@/lib/psn";
import { syncCompletedSteamGamesToDone } from "@/lib/steam";

export async function POST() {
  try {
    const [psn, steam, nintendo] = await Promise.all([
      syncCompletedPsnGamesToDone(),
      syncCompletedSteamGamesToDone(),
      syncCompletedNintendoGamesToDone()
    ]);
    return NextResponse.json({
      completedTitles: (psn.completedTitles ?? 0) + (steam.completedTitles ?? 0) + (nintendo.completedTitles ?? 0),
      movedToDone: (psn.movedToDone ?? 0) + (steam.movedToDone ?? 0) + (nintendo.movedToDone ?? 0),
      createdInDone: (psn.createdInDone ?? 0) + (steam.createdInDone ?? 0) + (nintendo.createdInDone ?? 0),
      psn,
      steam,
      nintendo
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync completed games failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
