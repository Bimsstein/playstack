import { NextRequest, NextResponse } from "next/server";

import { searchSteamCatalog } from "@/lib/steam";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  try {
    const titles = await searchSteamCatalog(q);
    return NextResponse.json({ titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search Steam store";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
