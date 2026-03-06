import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { getSteamLibraryTitlesForUser } from "@/lib/steam";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const titles = await getSteamLibraryTitlesForUser(user.id);
    return NextResponse.json({ titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Steam library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
