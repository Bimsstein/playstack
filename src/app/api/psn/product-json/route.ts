import { NextRequest, NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/runtime-config";

function decodeEscapes(value: string) {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/\\u0027/g, "'")
    .replace(/\\u0022/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export async function GET(request: NextRequest) {
  const titleId = request.nextUrl.searchParams.get("titleId")?.trim();
  if (!titleId) {
    return NextResponse.json({ error: "Missing titleId" }, { status: 400 });
  }

  const cfg = await getRuntimeConfig();
  const locale = (cfg.PSN_STORE_LOCALE || "en-us").toLowerCase();
  const url = `https://store.playstation.com/${locale}/product/${encodeURIComponent(titleId)}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await res.text();
    const scripts = Array.from(
      html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi),
      (m) => ({
        attrs: m[1] || "",
        content: (m[2] || "").trim()
      })
    );

    const jsonBlocks: Array<{
      id?: string;
      type?: string;
      parsed: unknown;
    }> = [];

    for (const block of scripts) {
      if (!block.content) continue;
      const attrs = block.attrs;
      const type = attrs.match(/type="([^"]+)"/i)?.[1];
      const id = attrs.match(/id="([^"]+)"/i)?.[1];
      const isLikelyJson =
        (type && /json/i.test(type)) ||
        (id && /__NEXT_DATA__|wca-config|config/i.test(id));
      if (!isLikelyJson) continue;

      const raw = decodeEscapes(block.content);
      try {
        const parsed = JSON.parse(raw);
        jsonBlocks.push({ id, type, parsed });
      } catch {
        // Ignore non-JSON blocks.
      }
    }

    const lowestPriceSignals = Array.from(
      new Set(
        Array.from(
          html.matchAll(
            /(lowestPriceLast30Days|lowestPriceInLast30Days|lowestPrice30Days|lowest[^"']*30[^"']*|Niedrigster Preis[^<\n\r]{0,140}|Lowest price in last 30 days[^<\n\r]{0,140})/gi
          ),
          (m) => (m[0] || "").trim()
        ).filter(Boolean)
      )
    );

    return NextResponse.json({
      titleId,
      url,
      status: res.status,
      jsonBlockCount: jsonBlocks.length,
      jsonBlocks,
      lowestPriceSignals
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch PS Store product JSON." },
      { status: 500 }
    );
  }
}
