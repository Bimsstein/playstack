import { NextResponse } from "next/server";

import { getSteamLibraryTitles } from "@/lib/steam";

export async function GET() {
  try {
    const titles = await getSteamLibraryTitles();
    return NextResponse.json({ titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Steam library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
