import { NextResponse } from "next/server";

import { getPsnConnectionStatus } from "@/lib/psn";

export async function GET() {
  try {
    const status = await getPsnConnectionStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch PSN status";
    return NextResponse.json({ enabled: true, connected: false, error: message }, { status: 500 });
  }
}
