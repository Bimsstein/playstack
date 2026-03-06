import { GameStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getRuntimeConfig } from "@/lib/runtime-config";

async function getSteamConfig() {
  const cfg = await getRuntimeConfig();
  return {
    apiKey: cfg.STEAM_API_KEY,
    steamId: cfg.STEAM_STEAMID,
    enabled: Boolean(cfg.STEAM_API_KEY && cfg.STEAM_STEAMID)
  };
}

type SteamProfileStatus = {
  enabled: boolean;
  connected: boolean;
  profile?: {
    onlineId: string;
    accountId: string;
    avatarUrl?: string;
    totalTitles?: number;
  };
  error?: string;
};

export type SteamTitleCandidate = {
  steamAppId: number;
  title: string;
  platform?: string;
  coverUrl?: string;
  isDlc?: boolean;
  currentPrice?: string;
  lowestPrice30Days?: string;
  trophyCompletion?: number;
  earnedTrophies?: number;
  totalTrophies?: number;
  playtimeHours?: number;
};

export type SteamAchievementDetail = {
  trophyId: number;
  trophyName?: string;
  trophyDetail?: string;
  trophyType?: string;
  trophyIconUrl?: string;
  earned: boolean;
  earnedDateTime?: string;
};

type OwnedGamesResponse = {
  response?: {
    games?: Array<{
      appid: number;
      name?: string;
      playtime_forever?: number;
      img_icon_url?: string;
    }>;
  };
};

type PlayerSummariesResponse = {
  response?: {
    players?: Array<{
      steamid: string;
      personaname: string;
      avatarfull?: string;
    }>;
  };
};

type StoreSearchResponse = {
  items?: Array<{
    id: number;
    name: string;
    type?: string | number;
    tiny_image?: string;
    price?: {
      final?: number;
      initial?: number;
      currency?: string;
    };
  }>;
};

type PlayerAchievementsResponse = {
  playerstats?: {
    success?: boolean;
    achievements?: Array<{
      apiname: string;
      achieved: 0 | 1;
      unlocktime?: number;
    }>;
  };
};

type GameSchemaResponse = {
  game?: {
    availableGameStats?: {
      achievements?: Array<{
        name: string;
        displayName?: string;
        description?: string;
        icon?: string;
        icongray?: string;
      }>;
    };
  };
};

function formatSteamPrice(value?: number, currency?: string) {
  if (!value || value <= 0) return undefined;
  const eur = value / 100;
  if ((currency || "").toUpperCase() === "EUR") return `EUR ${eur.toFixed(2)}`;
  return `${(currency || "CUR").toUpperCase()} ${eur.toFixed(2)}`;
}

function appHeaderImage(appId: number) {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}

function appCapsuleImage(appId: number) {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_231x87.jpg`;
}

function appIconImage(appId: number, iconHash?: string) {
  if (!iconHash) return appHeaderImage(appId);
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
}

function normalizeSteamImageUrl(url?: string) {
  if (!url) return undefined;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://store.steampowered.com${url}`;
  return url;
}

function isLikelySteamDlc(name: string, type?: string | number) {
  const normalizedType = String(type ?? "").toLowerCase();
  const normalizedName = name.toLowerCase();

  // Non-base item types are usually not full games (dlc, bundles, soundtracks, etc).
  const nonBaseType =
    normalizedType.length > 0 &&
    !["app", "game"].includes(normalizedType);

  // Name heuristics to catch dlc-like items even when type metadata is inconsistent.
  const dlcLikeName =
    /\b(dlc|add[- ]?on|addon|season pass|expansion pass|expansion|costume pack|soundtrack|digital soundtrack|artbook|demo|beta|test server|starter pack|upgrade|upgrade pack|kit)\b/i.test(
      normalizedName
    ) ||
    /deluxe\s+kit/i.test(normalizedName);

  return nonBaseType || dlcLikeName;
}

async function steamFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Steam request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function fetchSteamAchievementSnapshot(appId: number): Promise<{
  completion?: number;
  earned?: number;
  total?: number;
}> {
  const { apiKey: key, steamId } = await getSteamConfig();
  const achievementsUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(
    key
  )}&steamid=${encodeURIComponent(steamId)}&appid=${appId}&l=english`;
  const achievementsResponse = await steamFetch<PlayerAchievementsResponse>(achievementsUrl);
  const items = achievementsResponse.playerstats?.achievements ?? [];
  if (!items.length) return {};
  const total = items.length;
  const earned = items.filter((item) => item.achieved === 1).length;
  return {
    completion: total > 0 ? Math.round((earned / total) * 100) : 0,
    earned,
    total
  };
}

export async function getSteamConnectionStatus(): Promise<SteamProfileStatus> {
  const { apiKey: key, steamId, enabled } = await getSteamConfig();
  if (!enabled) {
    return { enabled: false, connected: false, error: "Missing STEAM_API_KEY or STEAM_STEAMID." };
  }

  try {
    const profileUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(
      key
    )}&steamids=${encodeURIComponent(steamId)}`;
    const profileResponse = await steamFetch<PlayerSummariesResponse>(profileUrl);
    const profile = profileResponse.response?.players?.[0];
    if (!profile) {
      return { enabled: true, connected: false, error: "Steam profile not found." };
    }

    const ownedGamesUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(
      key
    )}&steamid=${encodeURIComponent(steamId)}&include_appinfo=true&include_played_free_games=true`;
    const owned = await steamFetch<OwnedGamesResponse>(ownedGamesUrl);
    const total = owned.response?.games?.length ?? 0;

    return {
      enabled: true,
      connected: true,
      profile: {
        onlineId: profile.personaname,
        accountId: profile.steamid,
        avatarUrl: profile.avatarfull,
        totalTitles: total
      }
    };
  } catch (error) {
    return {
      enabled: true,
      connected: false,
      error: error instanceof Error ? error.message : "Steam connection failed."
    };
  }
}

export async function syncSteamData() {
  const { apiKey: key, steamId, enabled } = await getSteamConfig();
  if (!enabled) {
    return { enabled: false, syncedCount: 0, updatedTrackedCount: 0 };
  }
  const ownedGamesUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(
    key
  )}&steamid=${encodeURIComponent(steamId)}&include_appinfo=true&include_played_free_games=true`;
  const owned = await steamFetch<OwnedGamesResponse>(ownedGamesUrl);
  const games = owned.response?.games ?? [];
  let updatedTrackedCount = 0;

  for (const game of games) {
    const appId = game.appid;
    const title = game.name || `App ${appId}`;
    const coverUrl = appIconImage(appId, game.img_icon_url);
    const playtimeHours = Math.round((game.playtime_forever ?? 0) / 60);

    await prisma.steamLibraryTitle.upsert({
      where: { steamAppId: appId },
      update: {
        title,
        platform: "Steam",
        coverUrl,
        playtimeHours,
        lastSyncedAt: new Date()
      },
      create: {
        steamAppId: appId,
        title,
        platform: "Steam",
        coverUrl,
        playtimeHours,
        lastSyncedAt: new Date()
      }
    });

    const tracked = await prisma.game.findUnique({
      where: { steamAppId: appId },
      select: { id: true }
    });

    if (!tracked) continue;

    let completion: number | undefined;
    let earned: number | undefined;
    let total: number | undefined;
    try {
      const snapshot = await fetchSteamAchievementSnapshot(appId);
      completion = snapshot.completion;
      earned = snapshot.earned;
      total = snapshot.total;
    } catch {
      // Ignore per-game achievement sync failures.
    }

    await prisma.game.update({
      where: { steamAppId: appId },
      data: {
        source: "STEAM",
        title,
        platform: "Steam",
        coverUrl,
        trophyCompletion: completion ?? null,
        earnedTrophies: earned ?? null,
        totalTrophies: total ?? null,
        lastSyncedAt: new Date()
      }
    });
    updatedTrackedCount += 1;
  }

  return {
    enabled: true,
    syncedCount: games.length,
    updatedTrackedCount
  };
}

export async function getSteamLibraryTitles(): Promise<SteamTitleCandidate[]> {
  const rows = await prisma.steamLibraryTitle.findMany({
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });

  return rows.map((row) => ({
    steamAppId: row.steamAppId,
    title: row.title,
    platform: row.platform ?? "Steam",
    coverUrl: row.coverUrl ?? undefined,
    trophyCompletion: row.trophyCompletion ?? undefined,
    earnedTrophies: row.earnedTrophies ?? undefined,
    totalTrophies: row.totalTrophies ?? undefined,
    playtimeHours: row.playtimeHours ?? undefined
  }));
}

export async function searchSteamCatalog(query: string): Promise<SteamTitleCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
    q
  )}&l=english&cc=de`;
  const search = await steamFetch<StoreSearchResponse>(searchUrl);

  return (search.items ?? []).map((item) => ({
    steamAppId: item.id,
    title: item.name,
    platform: "Steam",
    coverUrl: normalizeSteamImageUrl(item.tiny_image) || appCapsuleImage(item.id) || appHeaderImage(item.id),
    isDlc: isLikelySteamDlc(item.name, item.type),
    currentPrice: formatSteamPrice(item.price?.final, item.price?.currency)
  }));
}

export async function getSteamAchievementsForApp(appId: number): Promise<{
  achievements: SteamAchievementDetail[];
  earned: number;
  total: number;
}> {
  const { apiKey: key, steamId, enabled } = await getSteamConfig();
  if (!enabled) {
    throw new Error("Missing STEAM_API_KEY or STEAM_STEAMID.");
  }
  const achievementsUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(
    key
  )}&steamid=${encodeURIComponent(steamId)}&appid=${appId}&l=english`;
  const schemaUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${encodeURIComponent(
    key
  )}&appid=${appId}&l=english`;

  const [achievementsResponse, schemaResponse] = await Promise.all([
    steamFetch<PlayerAchievementsResponse>(achievementsUrl),
    steamFetch<GameSchemaResponse>(schemaUrl)
  ]);

  const progress = achievementsResponse.playerstats?.achievements ?? [];
  const schema = schemaResponse.game?.availableGameStats?.achievements ?? [];
  const schemaByApiName = new Map(schema.map((item) => [item.name, item]));

  const achievements: SteamAchievementDetail[] = progress.map((item, idx) => {
    const meta = schemaByApiName.get(item.apiname);
    return {
      trophyId: idx + 1,
      trophyName: meta?.displayName || item.apiname,
      trophyDetail: meta?.description,
      trophyType: "Achievement",
      trophyIconUrl: item.achieved ? meta?.icon : meta?.icongray,
      earned: item.achieved === 1,
      earnedDateTime: item.unlocktime ? new Date(item.unlocktime * 1000).toISOString() : undefined
    };
  });

  const total = achievements.length;
  const earned = achievements.filter((item) => item.earned).length;
  return { achievements, earned, total };
}

export async function syncCompletedSteamGamesToDone() {
  const rows = await prisma.game.findMany({
    where: {
      source: "STEAM",
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
