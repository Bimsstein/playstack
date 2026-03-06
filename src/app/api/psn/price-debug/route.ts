import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { debugTrackedPsnPriceSync } from "@/lib/psn";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const query = request.nextUrl.searchParams.get("query") || undefined;
    const data = await debugTrackedPsnPriceSync(user.id, query);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run PSN price debug." },
      { status: 500 }
    );
  }
}
