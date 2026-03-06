import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { searchNintendoCatalog } from "@/lib/nintendo";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") || "";
  try {
    const titles = await searchNintendoCatalog(q);
    return NextResponse.json({ titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search Nintendo eShop";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
