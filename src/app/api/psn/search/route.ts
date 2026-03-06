import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { searchPsnCatalogWithDebug } from "@/lib/psn";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") || "";
  const debugMode = request.nextUrl.searchParams.get("debug") === "1";

  try {
    const { titles, debug } = await searchPsnCatalogWithDebug(q, user.id);
    if (debug.status && debug.status >= 400) {
      return NextResponse.json(
        { error: `Store search failed (${debug.status})`, debug },
        { status: 500 }
      );
    }
    return NextResponse.json(debugMode ? { titles, debug } : { titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search PSN catalog";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
