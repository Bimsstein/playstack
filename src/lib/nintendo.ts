import { GameStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getRuntimeConfig } from "@/lib/runtime-config";

const getRawgApiKey = async (userId: string) => {
  const cfg = await getRuntimeConfig(userId);
  return cfg.RAWG_API_KEY || "";
};

export type NintendoTitleCandidate = {
  nintendoGameId: string;
  title: string;
  platform?: string;
  coverUrl?: string;
  isDlc?: boolean;
  currentPrice?: string;
  lowestPrice30Days?: string;
  releaseDate?: string;
  trophyCompletion?: number;
  earnedTrophies?: number;
  totalTrophies?: number;
};

type NintendoEuropeSearchResponse = {
  response?: {
    docs?: Array<Record<string, unknown>>;
  };
};

type RawgResponse = {
  results?: Array<{
    id: number;
    name: string;
    background_image?: string | null;
    released?: string | null;
    platforms?: Array<{
      platform?: {
        name?: string;
      };
    }>;
  }>;
};

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === "string" && v.trim());
    if (typeof first === "string") return first.trim();
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function formatEur(value?: number): string | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return `€${value.toFixed(2).replace(".", ",")}`;
}

function isLikelyDlc(title: string) {
  return /\b(dlc|add[- ]?on|addon|season pass|expansion pass|expansion|costume pack|soundtrack|virtual currency|coins|points|token pack|starter pack|upgrade pack|upgrade|deluxe kit|kit|bundle content)\b/i.test(
    title
  );
}

function parseNintendoEuropeDoc(doc: Record<string, unknown>): NintendoTitleCandidate | null {
  const id =
    asString(doc.nsuid_txt) ||
    asString(doc.product_code_txt) ||
    asString(doc.slug) ||
    asString(doc.url) ||
    asString(doc.id);
  const title =
    asString(doc.title) ||
    asString(doc.title_extras_txt) ||
    asString(doc.product_title_txt) ||
    asString(doc.name);
  if (!id || !title) return null;

  const image =
    asString(doc.image_url_h2x1_s) ||
    asString(doc.image_url_sq_s) ||
    asString(doc.image_url) ||
    asString(doc.cover);

  const platformRaw =
    asString(doc.system_type) ||
    asString(doc.playable_on_txt) ||
    asString(doc.platform);

  const platform =
    platformRaw?.toLowerCase().includes("switch2") || platformRaw?.toLowerCase().includes("switch 2")
      ? "Nintendo Switch 2"
      : "Nintendo Switch";

  const discountedPrice =
    asNumber(doc.price_discounted_f) ||
    asNumber(doc.discount_price_f) ||
    asNumber(doc.price_lowest_f) ||
    asNumber(doc.eshop_price);
  const regularPrice =
    asNumber(doc.price_regular_f) ||
    asNumber(doc.price_f) ||
    asNumber(doc.msrp_price);

  const currentPrice = formatEur(discountedPrice ?? regularPrice);
  const lowestPrice30Days = formatEur(asNumber(doc.price_lowest_30d_f) || asNumber(doc.lowest_price_30d_f));

  return {
    nintendoGameId: `eshop:${id}`,
    title,
    platform,
    coverUrl: image,
    isDlc: isLikelyDlc(title),
    currentPrice,
    lowestPrice30Days,
    releaseDate: asString(doc.dates_released_dts) || asString(doc.release_date)
  };
}

async function searchNintendoEshop(query: string): Promise<NintendoTitleCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `https://search.nintendo-europe.com/de/select?fq=type:GAME%20AND%20(system_type:nintendoswitch*%20OR%20system_type:nintendoswitch2*)&q=${encodeURIComponent(
    q
  )}&rows=40&start=0&wt=json`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Nintendo eShop search failed (${res.status})`);
  }

  const json = (await res.json()) as NintendoEuropeSearchResponse;
  const docs = json.response?.docs ?? [];

  const parsed = docs
    .map((doc) => parseNintendoEuropeDoc(doc))
    .filter((v): v is NintendoTitleCandidate => Boolean(v));

  return parsed.slice(0, 40);
}

export async function searchNintendoCatalog(query: string): Promise<NintendoTitleCandidate[]> {
  return searchNintendoEshop(query);
}

export async function searchNintendoLegacyCatalog(userId: string, query: string): Promise<NintendoTitleCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const key = await getRawgApiKey(userId);
  if (!key) return [];

  const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&search=${encodeURIComponent(
    q
  )}&page_size=40`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const json = (await res.json()) as RawgResponse;
  const nintendoPlatforms = [
    "Nintendo",
    "Game Boy",
    "GameCube",
    "Nintendo 64",
    "NES",
    "SNES",
    "Wii",
    "Wii U",
    "Nintendo DS",
    "Nintendo 3DS",
    "Switch"
  ];

  return (json.results ?? [])
    .map((item): NintendoTitleCandidate | null => {
      const platforms = (item.platforms ?? [])
        .map((p) => p.platform?.name)
        .filter((v): v is string => Boolean(v));
      const platformHit = platforms.find((name) => nintendoPlatforms.some((needle) => name.includes(needle)));
      if (!platformHit) return null;

      return {
        nintendoGameId: `legacy:${item.id}`,
        title: item.name,
        platform: platformHit,
        coverUrl: item.background_image ?? undefined,
        isDlc: isLikelyDlc(item.name),
        releaseDate: item.released ?? undefined
      };
    })
    .filter((v): v is NintendoTitleCandidate => Boolean(v))
    .slice(0, 40);
}

export async function getNintendoLibraryTitles(userId: string): Promise<NintendoTitleCandidate[]> {
  const rows = await prisma.nintendoLibraryTitle.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });

  return rows.map((row) => ({
    nintendoGameId: row.nintendoGameId,
    title: row.title,
    platform: row.platform ?? "Nintendo",
    coverUrl: row.coverUrl ?? undefined,
    currentPrice: row.currentPrice ?? undefined,
    lowestPrice30Days: row.lowestPrice30Days ?? undefined,
    releaseDate: row.releaseDate ?? undefined,
    isDlc: isLikelyDlc(row.title),
    trophyCompletion: row.trophyCompletion ?? undefined,
    earnedTrophies: row.earnedTrophies ?? undefined,
    totalTrophies: row.totalTrophies ?? undefined
  }));
}

export async function syncNintendoData(userId: string) {
  // Best-effort sync: keep Nintendo library cache aligned with tracked Nintendo titles
  // and refresh eShop pricing for Switch/Switch 2 titles.
  const tracked = await prisma.game.findMany({
    where: {
      userId,
      source: "NINTENDO",
      nintendoGameId: { not: null }
    },
    select: {
      nintendoGameId: true,
      title: true,
      platform: true,
      coverUrl: true,
      currentPrice: true,
      lowestPrice30Days: true,
      trophyCompletion: true,
      earnedTrophies: true,
      totalTrophies: true
    }
  });

  let updatedTrackedCount = 0;

  for (const game of tracked) {
    if (!game.nintendoGameId) continue;

    let currentPrice = game.currentPrice ?? undefined;
    let lowestPrice30Days = game.lowestPrice30Days ?? undefined;

    if ((game.platform || "").toLowerCase().includes("switch")) {
      try {
        const results = await searchNintendoEshop(game.title);
        const best =
          results.find((item) => item.title.toLowerCase() === game.title.toLowerCase()) ||
          results.find((item) => item.title.toLowerCase().includes(game.title.toLowerCase())) ||
          results[0];
        currentPrice = best?.currentPrice ?? currentPrice;
        lowestPrice30Days = best?.lowestPrice30Days ?? lowestPrice30Days;
      } catch {
        // Ignore eShop lookup failures per title.
      }
    }

    await prisma.nintendoLibraryTitle.upsert({
      where: { userId_nintendoGameId: { userId, nintendoGameId: game.nintendoGameId } },
      update: {
        userId,
        title: game.title,
        platform: game.platform,
        coverUrl: game.coverUrl,
        currentPrice: currentPrice ?? null,
        lowestPrice30Days: lowestPrice30Days ?? null,
        trophyCompletion: game.trophyCompletion ?? null,
        earnedTrophies: game.earnedTrophies ?? null,
        totalTrophies: game.totalTrophies ?? null,
        lastSyncedAt: new Date()
      },
      create: {
        nintendoGameId: game.nintendoGameId,
        userId,
        title: game.title,
        platform: game.platform,
        coverUrl: game.coverUrl,
        currentPrice: currentPrice ?? null,
        lowestPrice30Days: lowestPrice30Days ?? null,
        trophyCompletion: game.trophyCompletion ?? null,
        earnedTrophies: game.earnedTrophies ?? null,
        totalTrophies: game.totalTrophies ?? null,
        lastSyncedAt: new Date()
      }
    });

    await prisma.game.updateMany({
      where: { userId, nintendoGameId: game.nintendoGameId },
      data: {
        currentPrice: currentPrice ?? null,
        lowestPrice30Days: lowestPrice30Days ?? null,
        lastSyncedAt: new Date()
      }
    });
    updatedTrackedCount += 1;
  }

  return {
    enabled: true,
    syncedCount: tracked.length,
    updatedTrackedCount
  };
}

export async function syncCompletedNintendoGamesToDone(userId: string) {
  const rows = await prisma.game.findMany({
    where: {
      userId,
      source: "NINTENDO",
      trophyCompletion: { gte: 100 },
      status: { not: GameStatus.DONE }
    },
    select: { id: true }
  });

  if (rows.length === 0) {
    return { completedTitles: 0, movedToDone: 0, createdInDone: 0 };
  }

  const ids = rows.map((row) => row.id);
  const update = await prisma.game.updateMany({
    where: { id: { in: ids } },
    data: { status: GameStatus.DONE }
  });

  return {
    completedTitles: ids.length,
    movedToDone: update.count,
    createdInDone: 0
  };
}
