import { NextRequest, NextResponse } from "next/server";

import { getPsnTrophiesForTitle } from "@/lib/psn";

export async function GET(request: NextRequest) {
  const titleId = request.nextUrl.searchParams.get("titleId") || "";
  if (!titleId.trim()) {
    return NextResponse.json({ error: "Missing titleId query parameter." }, { status: 400 });
  }

  try {
    const data = await getPsnTrophiesForTitle(titleId);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load trophy details from PSN.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
