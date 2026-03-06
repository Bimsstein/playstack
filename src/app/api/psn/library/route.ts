import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { getPsnLibraryTitles } from "@/lib/psn";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const titles = await getPsnLibraryTitles(user.id);
    return NextResponse.json({ titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load PSN library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
