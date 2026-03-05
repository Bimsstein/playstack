import { NextRequest, NextResponse } from "next/server";

import { debugTrackedPsnPriceSync } from "@/lib/psn";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("query") || undefined;
    const data = await debugTrackedPsnPriceSync(query);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run PSN price debug." },
      { status: 500 }
    );
  }
}

