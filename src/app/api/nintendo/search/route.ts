import { NextRequest, NextResponse } from "next/server";

import { searchNintendoCatalog } from "@/lib/nintendo";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  try {
    const titles = await searchNintendoCatalog(q);
    return NextResponse.json({ titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search Nintendo eShop";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
