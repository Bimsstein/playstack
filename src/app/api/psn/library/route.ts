import { NextResponse } from "next/server";

import { getPsnLibraryTitles } from "@/lib/psn";

export async function GET() {
  try {
    const titles = await getPsnLibraryTitles();
    return NextResponse.json({ titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load PSN library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
