import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { getPsnTrophiesForTitle } from "@/lib/psn";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const titleId = request.nextUrl.searchParams.get("titleId") || "";
  if (!titleId.trim()) {
    return NextResponse.json({ error: "Missing titleId query parameter." }, { status: 400 });
  }

  try {
    const data = await getPsnTrophiesForTitle(user.id, titleId);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load trophy details from PSN.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
