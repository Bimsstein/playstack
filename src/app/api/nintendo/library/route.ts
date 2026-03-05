import { NextResponse } from "next/server";

import { getNintendoLibraryTitles } from "@/lib/nintendo";

export async function GET() {
  try {
    const titles = await getNintendoLibraryTitles();
    return NextResponse.json({ titles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read Nintendo library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
