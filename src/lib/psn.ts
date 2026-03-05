import { prisma } from "@/lib/prisma";
import { GameStatus } from "@prisma/client";

type TrophySnapshot = {
  titleId: string;
  titleName: string;
  platform?: string;
  coverUrl?: string;
  progress?: number;
  earned?: number;
  total?: number;
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const hasPsnConfig = () => Boolean(process.env.PSN_NPSSO);
const getResolvedAccountId = () => process.env.PSN_ACCOUNT_ID || "me";

type PsnProfileStatus = {
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

export type PsnTitleCandidate = {
  psnTitleId: string;
  title: string;
  platform?: string;
  coverUrl?: string;
  isDlc?: boolean;
  currentPrice?: string;
  lowestPrice30Days?: string;
  psnStoreRating?: number;
  trophyCompletion?: number;
  earnedTrophies?: number;
  totalTrophies?: number;
};

export type PsnCatalogSearchDebug = {
  query: string;
  url: string;
  attemptedUrls: string[];
  attemptedResponses?: Array<{
    attempt: string;
    status: number;
    errorBody?: string;
  }>;
  status?: number;
  errorBody?: string;
  nodesScanned: number;
  candidatesSeen: number;
  accepted: number;
  sampleCandidates: Array<{
    id: string;
    rawTitle: string;
    accepted: boolean;
  }>;
  finalImageDebug?: Array<{
    id: string;
    initialTitle: string;
    finalTitle: string;
    initialCoverUrl?: string;
    productUrl: string;
    ogTitle?: string;
    ogImage?: string;
    productPageImageCandidates?: string[];
    currentPrice?: string;
    lowestPrice30Days?: string;
    psnStoreRating?: number;
    rawPriceSignals?: Record<string, string | undefined>;
    finalCoverUrl?: string;
  }>;
  htmlSignals?: {
    htmlLength: number;
    hasNextData: boolean;
    nextDataBytes: number;
    productPathHits: number;
    conceptPathHits: number;
  };
};

export type PsnTrophyDetail = {
  trophyId: number;
  trophyGroupId?: string;
  trophyName?: string;
  trophyDetail?: string;
  trophyType?: string;
  trophyIconUrl?: string;
  trophyHidden?: boolean;
  trophyEarnedRate?: string;
  earned: boolean;
  earnedDateTime?: string;
};

async function getPsnAuth() {
  const { exchangeNpssoForAccessCode, exchangeAccessCodeForAuthTokens } = await import("psn-api");
  const npsso = process.env.PSN_NPSSO;

  if (!npsso) {
    throw new Error("Missing PSN_NPSSO");
  }

  const accessCode = await exchangeNpssoForAccessCode(npsso);
  return exchangeAccessCodeForAuthTokens(accessCode);
}

async function fetchTrophiesFromPsn(): Promise<TrophySnapshot[]> {
  if (!hasPsnConfig()) {
    return [];
  }

  const { getUserTitles } = await import("psn-api");

  const accountId = getResolvedAccountId();

  const auth = await getPsnAuth();
  const userTitles = await getUserTitles(auth, accountId, { limit: 800 });
  const titles = userTitles?.trophyTitles ?? [];

  const snapshots: TrophySnapshot[] = [];

  for (const title of titles) {
    const titleId = title.npCommunicationId;
    if (!titleId || !title.trophyTitleName) {
      continue;
    }

    const earnedByType = title.earnedTrophies;
    const totalByType = title.definedTrophies;

    const earned =
      (earnedByType?.bronze ?? 0) +
      (earnedByType?.silver ?? 0) +
      (earnedByType?.gold ?? 0) +
      (earnedByType?.platinum ?? 0);

    const total =
      (totalByType?.bronze ?? 0) +
      (totalByType?.silver ?? 0) +
      (totalByType?.gold ?? 0) +
      (totalByType?.platinum ?? 0);

    snapshots.push({
      titleId,
      titleName: title.trophyTitleName,
      platform: title.trophyTitlePlatform,
      coverUrl: title.trophyTitleIconUrl,
      progress: title.progress ?? (total > 0 ? Math.round((earned / total) * 100) : 0),
      earned,
      total
    });
  }

  return snapshots;
}

export async function syncPsnData() {
  const snapshots = await fetchTrophiesFromPsn();
  let updatedTrackedCount = 0;
  const trackedMissingPrice = await prisma.game.findMany({
    where: {
      psnTitleId: { not: null },
      OR: [{ currentPrice: null }, { lowestPrice30Days: null }, { psnStoreRating: null }]
    },
    select: {
      psnTitleId: true,
      title: true
    }
  });
  const missingPriceIds = new Set(
    trackedMissingPrice.map((game) => game.psnTitleId).filter((id): id is string => Boolean(id))
  );
  const pickBestCatalogMatch = (
    candidates: PsnTitleCandidate[],
    title: string,
    psnTitleId?: string
  ) => {
    const target = normalizeSearchText(title);
    return (
      candidates.find((candidate) => psnTitleId && candidate.psnTitleId === psnTitleId) ||
      candidates.find((candidate) => normalizeSearchText(candidate.title) === target) ||
      candidates.find((candidate) => normalizeSearchText(candidate.title).includes(target)) ||
      candidates.find((candidate) => target.includes(normalizeSearchText(candidate.title))) ||
      candidates[0]
    );
  };

  for (const entry of snapshots) {
    await prisma.psnLibraryTitle.upsert({
      where: { psnTitleId: entry.titleId },
      update: {
        title: entry.titleName,
        platform: entry.platform,
        coverUrl: entry.coverUrl,
        trophyCompletion: entry.progress,
        earnedTrophies: entry.earned,
        totalTrophies: entry.total,
        lastSyncedAt: new Date()
      },
      create: {
        psnTitleId: entry.titleId,
        title: entry.titleName,
        platform: entry.platform,
        coverUrl: entry.coverUrl,
        trophyCompletion: entry.progress,
        earnedTrophies: entry.earned,
        totalTrophies: entry.total,
        lastSyncedAt: new Date()
      }
    });

    const updateResult = await prisma.game.updateMany({
      where: { psnTitleId: entry.titleId },
      data: {
        title: entry.titleName,
        platform: entry.platform,
        coverUrl: entry.coverUrl,
        trophyCompletion: entry.progress,
        earnedTrophies: entry.earned,
        totalTrophies: entry.total,
        lastSyncedAt: new Date()
      }
    });
    updatedTrackedCount += updateResult.count;

    if (updateResult.count > 0 && missingPriceIds.has(entry.titleId)) {
      const candidates = await searchPsnCatalog(entry.titleName);
      const bestMatch = pickBestCatalogMatch(candidates, entry.titleName, entry.titleId);

      if (bestMatch?.currentPrice || bestMatch?.lowestPrice30Days || bestMatch?.psnStoreRating != null) {
        const existing = await prisma.game.findUnique({
          where: { psnTitleId: entry.titleId },
          select: { currentPrice: true, lowestPrice30Days: true, psnStoreRating: true }
        });
        await prisma.game.updateMany({
          where: { psnTitleId: entry.titleId },
          data: {
            currentPrice: bestMatch.currentPrice ?? existing?.currentPrice ?? null,
            lowestPrice30Days: bestMatch.lowestPrice30Days ?? existing?.lowestPrice30Days ?? null,
            psnStoreRating: bestMatch.psnStoreRating ?? existing?.psnStoreRating ?? null
          }
        });
      }
    }
  }

  // Also refresh prices for tracked PlayStation Want-to-Play titles.
  // These can exist outside trophy snapshots (e.g. added from Store search).
  const wantTrackedPsn = await prisma.game.findMany({
    where: {
      source: "PLAYSTATION",
      status: GameStatus.WANT_TO_PLAY,
      psnTitleId: { not: null }
    },
    select: {
      id: true,
      psnTitleId: true,
      title: true,
      currentPrice: true,
      lowestPrice30Days: true,
      psnStoreRating: true
    }
  });

  for (const game of wantTrackedPsn) {
    const shouldRefresh = !game.currentPrice || !game.lowestPrice30Days || game.psnStoreRating == null;
    if (!shouldRefresh) continue;

    const candidates = await searchPsnCatalog(game.title);
    const bestMatch = pickBestCatalogMatch(candidates, game.title, game.psnTitleId ?? undefined);
    if (!bestMatch) continue;

    const nextCurrent = bestMatch.currentPrice ?? game.currentPrice;
    const nextLowest30 = bestMatch.lowestPrice30Days ?? game.lowestPrice30Days;
    const nextRating = bestMatch.psnStoreRating ?? game.psnStoreRating;
    if (!nextCurrent && !nextLowest30 && nextRating == null) continue;

    await prisma.game.update({
      where: { id: game.id },
      data: {
        currentPrice: nextCurrent ?? null,
        lowestPrice30Days: nextLowest30 ?? null,
        psnStoreRating: nextRating ?? null,
        lastSyncedAt: new Date()
      }
    });
  }

  return {
    syncedCount: snapshots.length,
    updatedTrackedCount,
    enabled: hasPsnConfig()
  };
}

export async function debugTrackedPsnPriceSync(queryTitle?: string) {
  const baseWhere = {
    source: "PLAYSTATION" as const,
    status: GameStatus.WANT_TO_PLAY,
    psnTitleId: { not: null as string | null }
  };

  const games = await prisma.game.findMany({
    where: queryTitle?.trim()
      ? {
          ...baseWhere,
          title: { contains: queryTitle.trim() }
        }
      : baseWhere,
    select: {
      id: true,
      title: true,
      psnTitleId: true,
      currentPrice: true,
      lowestPrice30Days: true,
      psnStoreRating: true
    },
    orderBy: { updatedAt: "desc" },
    take: 8
  });

  const normalize = (value: string) => normalizeSearchText(value);
  const results: Array<{
    gameId: string;
    title: string;
    psnTitleId: string | null;
      currentPrice: string | null;
      lowestPrice30Days: string | null;
      psnStoreRating: number | null;
    selectedCandidate?: {
      psnTitleId: string;
      title: string;
      currentPrice?: string;
      lowestPrice30Days?: string;
      psnStoreRating?: number;
    };
    reason: string;
    storeDebug?: PsnCatalogSearchDebug;
  }> = [];

  for (const game of games) {
    const q = game.title?.trim();
    if (!q) {
      results.push({
        gameId: game.id,
        title: game.title,
        psnTitleId: game.psnTitleId,
        currentPrice: game.currentPrice,
        lowestPrice30Days: game.lowestPrice30Days,
        psnStoreRating: game.psnStoreRating,
        reason: "empty_title"
      });
      continue;
    }

    try {
      const { titles, debug } = await searchPsnCatalogWithDebug(q);
      const target = normalize(q);
      const selected =
        titles.find((candidate) => game.psnTitleId && candidate.psnTitleId === game.psnTitleId) ||
        titles.find((candidate) => normalize(candidate.title) === target) ||
        titles.find((candidate) => normalize(candidate.title).includes(target)) ||
        titles[0];

      results.push({
        gameId: game.id,
        title: game.title,
        psnTitleId: game.psnTitleId,
        currentPrice: game.currentPrice,
        lowestPrice30Days: game.lowestPrice30Days,
        psnStoreRating: game.psnStoreRating,
        selectedCandidate: selected
          ? {
              psnTitleId: selected.psnTitleId,
              title: selected.title,
              currentPrice: selected.currentPrice,
              lowestPrice30Days: selected.lowestPrice30Days,
              psnStoreRating: selected.psnStoreRating
            }
          : undefined,
        reason: selected
          ? selected.currentPrice || selected.lowestPrice30Days || selected.psnStoreRating != null
            ? "selected_candidate_has_price"
            : "selected_candidate_missing_price_fields"
          : "no_candidate",
        storeDebug: debug
      });
    } catch (error) {
      results.push({
        gameId: game.id,
        title: game.title,
        psnTitleId: game.psnTitleId,
        currentPrice: game.currentPrice,
        lowestPrice30Days: game.lowestPrice30Days,
        psnStoreRating: game.psnStoreRating,
        reason: error instanceof Error ? error.message : "search_error"
      });
    }
  }

  return {
    scanned: games.length,
    results
  };
}

export async function getPsnLibraryTitles(): Promise<PsnTitleCandidate[]> {
  const rows = await prisma.psnLibraryTitle.findMany({
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });

  return rows.map((row) => ({
    psnTitleId: row.psnTitleId,
    title: row.title,
    platform: row.platform ?? undefined,
    coverUrl: row.coverUrl ?? undefined,
    trophyCompletion: row.trophyCompletion ?? undefined,
    earnedTrophies: row.earnedTrophies ?? undefined,
    totalTrophies: row.totalTrophies ?? undefined
  }));
}

export async function syncCompletedPsnGamesToDone() {
  const completedLibraryRows = await prisma.psnLibraryTitle.findMany({
    where: {
      trophyCompletion: {
        gte: 100
      }
    },
    select: {
      psnTitleId: true,
      title: true,
      platform: true,
      coverUrl: true,
      trophyCompletion: true,
      earnedTrophies: true,
      totalTrophies: true
    }
  });

  const completedIds = completedLibraryRows.map((row) => row.psnTitleId);
  if (completedIds.length === 0) {
    return {
      completedTitles: 0,
      movedToDone: 0,
      createdInDone: 0
    };
  }

  const update = await prisma.game.updateMany({
    where: {
      psnTitleId: {
        in: completedIds
      },
      status: {
        not: GameStatus.DONE
      }
    },
    data: {
      status: GameStatus.DONE
    }
  });

  let createdInDone = 0;
  for (const row of completedLibraryRows) {
    const existing = await prisma.game.findUnique({
      where: { psnTitleId: row.psnTitleId },
      select: { id: true }
    });
    if (existing) continue;

    await prisma.game.create({
      data: {
        psnTitleId: row.psnTitleId,
        title: row.title,
        platform: row.platform ?? null,
        coverUrl: row.coverUrl ?? null,
        trophyCompletion: row.trophyCompletion ?? null,
        earnedTrophies: row.earnedTrophies ?? null,
        totalTrophies: row.totalTrophies ?? null,
        status: GameStatus.DONE
      }
    });
    createdInDone += 1;
  }

  return {
    completedTitles: completedIds.length,
    movedToDone: update.count,
    createdInDone
  };
}

export async function searchPsnCatalogWithDebug(
  query: string
): Promise<{ titles: PsnTitleCandidate[]; debug: PsnCatalogSearchDebug }> {
  const q = query.trim();
  const locale = (process.env.PSN_STORE_LOCALE || "en-us").toLowerCase();
  const url = `https://store.playstation.com/${locale}/search/${encodeURIComponent(q)}`;

  const debug: PsnCatalogSearchDebug = {
    query: q,
    url,
    attemptedUrls: [],
    attemptedResponses: [],
    nodesScanned: 0,
    candidatesSeen: 0,
    accepted: 0,
    sampleCandidates: [],
    finalImageDebug: []
  };

  if (!q) return { titles: [], debug };

  const normalize = (v: string) => normalizeSearchText(v);
  const isLikelyPsnDlc = (title: string) =>
    /\b(dlc|add[- ]?on|addon|season pass|expansion pass|costume pack|soundtrack|virtual currency|coins|points|token pack|starter pack|upgrade pack|upgrade|deluxe kit|kit)\b/i.test(
      title
    );
  const upscaleImageUrl = (input?: string): string | undefined => {
    if (!input) return undefined;
    try {
      const parsed = new URL(input);
      const w = Number(parsed.searchParams.get("w") || "0");
      const h = Number(parsed.searchParams.get("h") || "0");
      if (!Number.isNaN(w) && w > 0 && w < 600) parsed.searchParams.set("w", "1024");
      if (!Number.isNaN(h) && h > 0 && h < 600) parsed.searchParams.set("h", "1024");
      return parsed.toString();
    } catch {
      return input;
    }
  };
  const qNorm = normalize(q);
  const qTokens = qNorm.split(/\s+/).filter(Boolean);
  const matches = (title: string) => {
    const t = normalize(title);
    if (!t) return false;
    if (t.includes(qNorm)) return true;
    return qTokens.every((tok) => t.includes(tok));
  };
  debug.attemptedUrls.push(url);
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0"
    }
  });
  debug.status = res.status;
  const pageHtml = await res.text();
  debug.attemptedResponses?.push({
    attempt: "store-search-page",
    status: res.status,
    errorBody: res.ok ? undefined : pageHtml.slice(0, 2000)
  });
  if (!res.ok) {
    debug.errorBody = pageHtml.slice(0, 2000);
    return { titles: [], debug };
  }
  debug.htmlSignals = {
    htmlLength: pageHtml.length,
    hasNextData: false,
    nextDataBytes: 0,
    productPathHits: (pageHtml.match(/\/product\//g) ?? []).length,
    conceptPathHits: (pageHtml.match(/\/concept\//g) ?? []).length
  };

  const decodeEscapes = (v: string) =>
    v
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');

  const pullField = (source: string, key: string): string | undefined => {
    const escapedPattern = new RegExp(`"${key}":"([^"]+)"`);
    const plainPattern = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
    const escapedMatch = source.match(escapedPattern);
    if (escapedMatch?.[1]) return decodeEscapes(escapedMatch[1]);
    const plainMatch = source.match(plainPattern);
    if (plainMatch?.[1]) return decodeEscapes(plainMatch[1]);
    return undefined;
  };
  const collectStringsDeep = (value: unknown, out: string[] = []): string[] => {
    if (!value) return out;
    if (typeof value === "string") {
      const v = value.trim();
      if (v) out.push(v);
      return out;
    }
    if (Array.isArray(value)) {
      for (const item of value) collectStringsDeep(item, out);
      return out;
    }
    if (typeof value === "object") {
      for (const sub of Object.values(value as Record<string, unknown>)) {
        collectStringsDeep(sub, out);
      }
    }
    return out;
  };
  const pickBestCoverUrl = (
    obj: Record<string, unknown>,
    raw: string
  ): { directCoverUrl?: string; chosenCoverUrl?: string } => {
    const direct =
      pullField(raw, "image") ||
      pullField(raw, "imageUrl") ||
      pullField(raw, "thumbnail") ||
      pullField(raw, "src") ||
      pullField(raw, "backgroundImage") ||
      pullField(raw, "icon");
    if (direct?.startsWith("http")) {
      const decoded = decodeEscapes(direct);
      return { directCoverUrl: decoded, chosenCoverUrl: decoded };
    }

    const deepStrings = collectStringsDeep(obj);
    const imageCandidate = deepStrings.find(
      (v) =>
        /^https?:\/\//i.test(v) &&
        (/\.(png|jpe?g|webp)(\?|$)/i.test(v) ||
          v.includes("image.api.playstation.com") ||
          v.includes("/image/"))
    );
    const chosen = imageCandidate ? decodeEscapes(imageCandidate) : undefined;
    return {
      directCoverUrl: direct ? decodeEscapes(direct) : undefined,
      chosenCoverUrl: chosen
    };
  };
  const collectPlatformTokensFromPlatformKeys = (
    value: unknown,
    currentKey = "",
    out: Set<string> = new Set<string>()
  ): Set<string> => {
    if (!value) return out;
    if (typeof value === "string") {
      const upper = value.toUpperCase();
      if (upper.includes("PS5")) out.add("PS5");
      if (upper.includes("PS4")) out.add("PS4");
      if (upper.includes("PS VR2") || upper.includes("PSVR2")) out.add("PS VR2");
      if (upper.includes("PS VR") || upper.includes("PSVR")) out.add("PS VR");
      return out;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectPlatformTokensFromPlatformKeys(item, currentKey, out);
      }
      return out;
    }
    if (typeof value === "object") {
      for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
        const nextKey = `${currentKey}.${key}`.toLowerCase();
        // Limit platform extraction to platform-like keys to avoid unrelated page labels.
        if (nextKey.includes("platform")) {
          collectPlatformTokensFromPlatformKeys(sub, nextKey, out);
        } else if (typeof sub === "object") {
          collectPlatformTokensFromPlatformKeys(sub, nextKey, out);
        }
      }
    }
    return out;
  };
  const inferPlatformFromTitleId = (id: string): string | undefined => {
    const upper = id.toUpperCase();
    const tokens = new Set<string>();
    if (upper.includes("PPSA") || upper.includes("PPSH") || upper.includes("PPSB")) tokens.add("PS5");
    if (upper.includes("CUSA") || upper.includes("PCSA") || upper.includes("PCSE")) tokens.add("PS4");
    if (!tokens.size) return undefined;
    return Array.from(tokens).join(" / ");
  };
  const pickPlatform = (
    obj: Record<string, unknown>,
    raw: string,
    id: string
  ): {
    directPlatform?: string;
    keyedPlatforms: string[];
    inferredPlatformFromId?: string;
    chosenPlatform?: string;
  } => {
    const direct =
      pullField(raw, "platform") ||
      pullField(raw, "platformName") ||
      pullField(raw, "platforms");
    if (direct) {
      const clean = decodeEscapes(direct);
      const directTokens = new Set<string>();
      if (/ps5/i.test(clean)) directTokens.add("PS5");
      if (/ps4/i.test(clean)) directTokens.add("PS4");
      if (/ps\s?vr2/i.test(clean)) directTokens.add("PS VR2");
      if (/ps\s?vr/i.test(clean)) directTokens.add("PS VR");
      if (directTokens.size) {
        const chosen = Array.from(directTokens).join(" / ");
        return {
          directPlatform: clean,
          keyedPlatforms: [],
          inferredPlatformFromId: undefined,
          chosenPlatform: chosen
        };
      }
    }

    const keyedTokens = collectPlatformTokensFromPlatformKeys(obj);
    if (keyedTokens.size) {
      return {
        directPlatform: direct ? decodeEscapes(direct) : undefined,
        keyedPlatforms: Array.from(keyedTokens),
        inferredPlatformFromId: undefined,
        chosenPlatform: Array.from(keyedTokens).join(" / ")
      };
    }

    const inferred = inferPlatformFromTitleId(id);
    return {
      directPlatform: direct ? decodeEscapes(direct) : undefined,
      keyedPlatforms: [],
      inferredPlatformFromId: inferred,
      chosenPlatform: inferred
    };
  };
  const pullFields = (source: string, key: string): string[] => {
    const results = new Set<string>();
    const escapedPattern = new RegExp(`"${key}":"([^"]+)"`, "g");
    const plainPattern = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "g");
    let match = escapedPattern.exec(source);
    while (match) {
      if (match[1]) results.add(decodeEscapes(match[1]).trim());
      match = escapedPattern.exec(source);
    }
    match = plainPattern.exec(source);
    while (match) {
      if (match[1]) results.add(decodeEscapes(match[1]).trim());
      match = plainPattern.exec(source);
    }
    return Array.from(results);
  };
  const isGenericLabel = (value: string) => {
    const v = normalize(value);
    return [
      "latest",
      "collections",
      "deals",
      "subscriptions",
      "games",
      "game",
      "see more",
      "view all",
      "new",
      "popular"
    ].includes(v);
  };

  const candidateObjects: string[] = [];
  const nextDataMatch = pageHtml.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i
  );
  if (nextDataMatch?.[1]) {
    debug.htmlSignals.hasNextData = true;
    debug.htmlSignals.nextDataBytes = nextDataMatch[1].length;
    candidateObjects.push(nextDataMatch[1]);
  }
  const objectRegex = /\{[^{}]{0,2500}\/product\/[^{}]{0,2500}\}/g;
  const objectMatches = pageHtml.match(objectRegex) ?? [];
  candidateObjects.push(...objectMatches);
  const conceptObjectRegex = /\{[^{}]{0,2500}\/concept\/[^{}]{0,2500}\}/g;
  const conceptObjectMatches = pageHtml.match(conceptObjectRegex) ?? [];
  candidateObjects.push(...conceptObjectMatches);
  // Extract common url/name pairs directly from serialized JSON blocks.
  const urlNameRegex = /"url":"([^"]*\/product\/[^"]+)".{0,800}?"name":"([^"]+)"/g;
  let urlNameMatch = urlNameRegex.exec(pageHtml);
  while (urlNameMatch) {
    candidateObjects.push(
      JSON.stringify({
        url: decodeEscapes(urlNameMatch[1] || ""),
        name: decodeEscapes(urlNameMatch[2] || "")
      })
    );
    urlNameMatch = urlNameRegex.exec(pageHtml);
  }
  const nameUrlRegex = /"name":"([^"]+)".{0,800}?"url":"([^"]*\/product\/[^"]+)"/g;
  let nameUrlMatch = nameUrlRegex.exec(pageHtml);
  while (nameUrlMatch) {
    candidateObjects.push(
      JSON.stringify({
        url: decodeEscapes(nameUrlMatch[2] || ""),
        name: decodeEscapes(nameUrlMatch[1] || "")
      })
    );
    nameUrlMatch = nameUrlRegex.exec(pageHtml);
  }

  const anchorRegex = /<a[^>]+href="([^"]*\/product\/[^"]+)"[^>]*>([\s\S]{0,600}?)<\/a>/gi;
  let anchorMatch = anchorRegex.exec(pageHtml);
  while (anchorMatch) {
    const href = decodeEscapes(anchorMatch[1] || "");
    const block = anchorMatch[2] || "";
    const titleFromAria = (block.match(/aria-label="([^"]+)"/i)?.[1] || "").trim();
    const titleFromImg = (block.match(/alt="([^"]+)"/i)?.[1] || "").trim();
    const title = decodeEscapes(titleFromAria || titleFromImg);
    const coverUrl = decodeEscapes((block.match(/src="([^"]+)"/i)?.[1] || "").trim());
    candidateObjects.push(
      JSON.stringify({
        url: href,
        name: title,
        image: coverUrl
      })
    );
    anchorMatch = anchorRegex.exec(pageHtml);
  }
  // Some cards expose title directly on the anchor element.
  const anchorAriaRegex = /<a[^>]+href="([^"]*\/product\/[^"]+)"[^>]+aria-label="([^"]+)"[^>]*>/gi;
  let anchorAriaMatch = anchorAriaRegex.exec(pageHtml);
  while (anchorAriaMatch) {
    candidateObjects.push(
      JSON.stringify({
        url: decodeEscapes(anchorAriaMatch[1] || ""),
        name: decodeEscapes(anchorAriaMatch[2] || "")
      })
    );
    anchorAriaMatch = anchorAriaRegex.exec(pageHtml);
  }

  const queue: unknown[] = candidateObjects;
  const unique = new Map<string, PsnTitleCandidate>();
  const addCandidate = (
    id: string,
    title: string,
    platform?: string,
    coverUrl?: string
  ) => {
    const cleanId = id.trim();
    const cleanTitle = decodeEscapes(title).trim();
    if (!cleanId || !cleanTitle || !matches(cleanTitle) || unique.has(cleanId)) return false;
    unique.set(cleanId, {
      psnTitleId: cleanId,
      title: cleanTitle,
      platform: platform ? decodeEscapes(platform) : undefined,
      coverUrl: coverUrl?.startsWith("http") ? decodeEscapes(coverUrl) : undefined,
      isDlc: isLikelyPsnDlc(cleanTitle)
    });
    return true;
  };

  let safety = 0;
  while (queue.length && safety < 20000) {
    safety += 1;
    const current = queue.shift();
    if (!current) continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current === "object") {
      debug.nodesScanned += 1;
      const obj = current as Record<string, unknown>;
      const raw = JSON.stringify(obj);
      const getDirectString = (key: string): string => {
        const value = obj[key];
        return typeof value === "string" ? decodeEscapes(value).trim() : "";
      };
      const directPathCandidates = [
        getDirectString("url"),
        getDirectString("webUrl"),
        getDirectString("link"),
        getDirectString("href"),
        getDirectString("path")
      ].filter(Boolean);
      const productPath =
        directPathCandidates.find((p) => p.includes("/product/") || p.includes("/concept/")) || "";

      const idFromProduct = productPath.split("/product/")[1]?.split(/[/?#"]/)[0]?.trim() ?? "";
      const idFromConcept = productPath.split("/concept/")[1]?.split(/[/?#"]/)[0]?.trim() ?? "";
      const directIdCandidates = [
        getDirectString("productId"),
        getDirectString("conceptId"),
        getDirectString("skuId"),
        getDirectString("id"),
        getDirectString("titleId")
      ].filter(Boolean);
      const id = idFromProduct || idFromConcept || directIdCandidates[0] || "";
      const hasDirectStoreIdentity = Boolean(id || productPath);

      if (hasDirectStoreIdentity) {
        const titleCandidates = Array.from(
          new Set([
            getDirectString("name"),
            getDirectString("titleName"),
            getDirectString("title"),
            getDirectString("displayName"),
            getDirectString("localizedName"),
            getDirectString("defaultName"),
            getDirectString("productName"),
            getDirectString("gameName"),
            getDirectString("description")
          ])
        ).filter(Boolean);
        const rawTitle =
          titleCandidates.find((candidate) => !isGenericLabel(candidate) && matches(candidate)) ||
          titleCandidates.find((candidate) => !isGenericLabel(candidate) && candidate.length > 2) ||
          "";
        if (id && rawTitle) {
          debug.candidatesSeen += 1;
          const accepted = matches(rawTitle) && !unique.has(id);
          const platformInfo = pickPlatform(obj, raw, id);
          const coverInfo = pickBestCoverUrl(obj, raw);

          if (debug.sampleCandidates.length < 12) {
            debug.sampleCandidates.push({
              id,
              rawTitle,
              accepted
            });
          }
          if (accepted) {
            const coverUrl = coverInfo.chosenCoverUrl;
            const platformRaw = platformInfo.chosenPlatform;
            if (addCandidate(id, rawTitle, platformRaw, coverUrl)) {
              debug.accepted += 1;
            }
          }
        }
      }
    }
    if (typeof current === "string" && current.length > 10) {
      try {
        const parsed = JSON.parse(current) as unknown;
        queue.push(parsed);
      } catch {
        // Not JSON; ignore.
      }
    }
  }

  // Fallback: scan around each product path in raw HTML to recover multiple cards
  // when structured object extraction is too coarse for a given storefront response.
  if (unique.size < 5) {
    const productRegex = /\/product\/([A-Z0-9_-]+)(?:[/?#"]|$)/gi;
    let match = productRegex.exec(pageHtml);
    while (match && unique.size < 20) {
      const productId = (match[1] || "").trim();
      const idx = match.index;
      const start = Math.max(0, idx - 2000);
      const end = Math.min(pageHtml.length, idx + 2000);
      const window = pageHtml.slice(start, end);

      const titleCandidates = [
        ...Array.from(window.matchAll(/"name":"([^"]+)"/g), (m) => decodeEscapes(m[1] || "")),
        ...Array.from(window.matchAll(/"title":"([^"]+)"/g), (m) => decodeEscapes(m[1] || "")),
        ...Array.from(window.matchAll(/"displayName":"([^"]+)"/g), (m) => decodeEscapes(m[1] || "")),
        ...Array.from(window.matchAll(/aria-label="([^"]+)"/gi), (m) => decodeEscapes(m[1] || "")),
        ...Array.from(window.matchAll(/alt="([^"]+)"/gi), (m) => decodeEscapes(m[1] || ""))
      ]
        .map((s) => s.trim())
        .filter((s) => s.length > 2 && !isGenericLabel(s));

      const chosenTitle =
        titleCandidates.find((t) => matches(t)) ||
        titleCandidates.find((t) => normalize(t).includes("resident") || normalize(t).includes("evil")) ||
        "";
      if (!chosenTitle) {
        match = productRegex.exec(pageHtml);
        continue;
      }

      const imageCandidate =
        Array.from(window.matchAll(/https?:\/\/[^"' ]*(?:image\.api\.playstation\.com|akamaized\.net)[^"' ]*/gi), (m) => m[0]).find(
          (u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u) || u.includes("/image/")
        ) || undefined;

      const platformTokens = new Set<string>();
      const upperWindow = window.toUpperCase();
      if (upperWindow.includes("PS5")) platformTokens.add("PS5");
      if (upperWindow.includes("PS4")) platformTokens.add("PS4");
      const inferred = inferPlatformFromTitleId(productId);
      const platform =
        platformTokens.size > 0 ? Array.from(platformTokens).join(" / ") : inferred;

      if (addCandidate(productId, chosenTitle, platform, imageCandidate)) {
        debug.accepted += 1;
        if (debug.sampleCandidates.length < 12) {
          debug.sampleCandidates.push({
            id: productId,
            rawTitle: chosenTitle,
            accepted: true
          });
        }
      }

      match = productRegex.exec(pageHtml);
    }
  }

  // Final recovery: derive candidates globally from the page when structured parsing fails.
  if (unique.size === 0) {
    const findCoverForProductId = (productId: string): string | undefined => {
      const marker = `/product/${productId}`;
      const at = pageHtml.indexOf(marker);
      if (at < 0) return undefined;
      const start = Math.max(0, at - 4000);
      const end = Math.min(pageHtml.length, at + 4000);
      const window = pageHtml.slice(start, end);

      const candidates = [
        ...Array.from(
          window.matchAll(
            /https?:\/\/[^"' ]*image\.api\.playstation\.com[^"' ]*/gi
          ),
          (m) => decodeEscapes(m[0] || "")
        ),
        ...Array.from(
          window.matchAll(/https?:\/\/[^"' ]*akamaized\.net[^"' ]*/gi),
          (m) => decodeEscapes(m[0] || "")
        )
      ].filter(
        (u) =>
          /\.(png|jpe?g|webp)(\?|$)/i.test(u) ||
          u.includes("/image/") ||
          u.includes("w=")
      );

      return candidates[0];
    };

    const globalIds = Array.from(
      new Set(
        Array.from(pageHtml.matchAll(/\/product\/([A-Za-z0-9_-]+)(?:[/?#"]|$)/g), (m) =>
          (m[1] || "").trim()
        ).filter(Boolean)
      )
    );

    const globalTitles = Array.from(
      new Set(
        [
          ...Array.from(pageHtml.matchAll(/"name":"([^"]+)"/g), (m) => decodeEscapes(m[1] || "")),
          ...Array.from(pageHtml.matchAll(/"title":"([^"]+)"/g), (m) => decodeEscapes(m[1] || "")),
          ...Array.from(pageHtml.matchAll(/"displayName":"([^"]+)"/g), (m) =>
            decodeEscapes(m[1] || "")
          ),
          ...Array.from(pageHtml.matchAll(/aria-label="([^"]+)"/gi), (m) =>
            decodeEscapes(m[1] || "")
          ),
          ...Array.from(pageHtml.matchAll(/alt="([^"]+)"/gi), (m) => decodeEscapes(m[1] || ""))
        ]
          .map((t) => t.trim())
          .filter((t) => t.length > 2 && !isGenericLabel(t) && matches(t))
      )
    );

    for (let i = 0; i < Math.min(globalTitles.length, globalIds.length, 20); i += 1) {
      const id = globalIds[i]!;
      const title = globalTitles[i]!;
      const platform = inferPlatformFromTitleId(id);
      const cover = findCoverForProductId(id);
      if (addCandidate(id, title, platform, cover)) {
        debug.accepted += 1;
        if (debug.sampleCandidates.length < 12) {
          debug.sampleCandidates.push({
            id,
            rawTitle: title,
            accepted: true
          });
        }
      }
    }
  }

  const scored = Array.from(unique.values())
    .map((item) => {
      const tNorm = normalize(item.title);
      let score = 0;
      if (tNorm === qNorm) score += 100;
      if (tNorm.startsWith(qNorm)) score += 60;
      if (tNorm.includes(qNorm)) score += 40;
      for (const token of qTokens) {
        if (tNorm.includes(token)) score += 8;
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .map((entry) => entry.item);
  const top = scored.slice(0, 5);

  const enrichFromProductPage = async (candidate: PsnTitleCandidate): Promise<PsnTitleCandidate> => {
    const productUrl = `https://store.playstation.com/${locale}/product/${encodeURIComponent(
      candidate.psnTitleId
    )}`;
    try {
      const productRes = await fetch(productUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0"
        }
      });
      if (!productRes.ok) {
        return {
          ...candidate,
          coverUrl: upscaleImageUrl(candidate.coverUrl)
        };
      }
      const html = await productRes.text();
      const ogImage =
        html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] ||
        html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i)?.[1];
      const ogTitle =
        html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1] ||
        html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)?.[1];
      const productPageImageCandidates = Array.from(
        new Set(
          Array.from(
            html.matchAll(/https?:\/\/image\.api\.playstation\.com[^"'\\\s<>()]+/gi),
            (m) => decodeEscapes(m[0] || "")
          ).filter((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u) || u.includes("/image/"))
        )
      ).slice(0, 20);
      const chosenPageImage =
        productPageImageCandidates.find(
          (u) =>
            !u.includes("w=54") &&
            !u.includes("w=64") &&
            !u.includes("thumb=true") &&
            !u.includes("avatar")
        ) || productPageImageCandidates[0];
      const extractFirst = (patterns: RegExp[]): string | undefined => {
        for (const pattern of patterns) {
          const m = html.match(pattern);
          const value = m?.[1]?.trim();
          if (value) return decodeEscapes(value);
        }
        return undefined;
      };
      const currencyCode = extractFirst([
        /"currencyCode"\s*:\s*"([^"]+)"/i,
        /"priceCurrency"\s*:\s*"([^"]+)"/i,
        /itemprop="priceCurrency"\s+content="([^"]+)"/i
      ]);
      const discountedPrice = extractFirst([
        /"discountedPrice"\s*:\s*"([^"]+)"/i,
        /"salePrice"\s*:\s*"([^"]+)"/i
      ]);
      const basePrice = extractFirst([
        /"basePrice"\s*:\s*"([^"]+)"/i,
        /"regularPrice"\s*:\s*"([^"]+)"/i,
        /"originalPrice"\s*:\s*"([^"]+)"/i
      ]);
      const genericPrice = extractFirst([
        /itemprop="price"\s+content="([^"]+)"/i,
        /"price"\s*:\s*"([^"]+)"/i
      ]);
      const ratingRaw = extractFirst([
        /"ratingValue"\s*:\s*"([^"]+)"/i,
        /"averageRating"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
        /"starRating"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
        /"aggregateRating"[\s\S]{0,160}?"ratingValue"\s*:\s*"([^"]+)"/i
      ]);
      const lowest30Raw = extractFirst([
        /"lowestPriceLast30Days"\s*:\s*"([^"]+)"/i,
        /"lowestPriceInLast30Days"\s*:\s*"([^"]+)"/i,
        /"lowestPrice30Days"\s*:\s*"([^"]+)"/i,
        /"lowest[^"]*30[^"]*"\s*:\s*"([^"]+)"/i,
        /"lowest[^"]*price[^"]*"\s*:\s*"([^"]+)"/i,
        /Lowest price in last 30 days[^$€£0-9]*([$€£]?\s?[0-9]+(?:[.,][0-9]{1,2})?\s?(?:[$€£]|EUR|USD|GBP)?)/i,
        /Niedrigster Preis[^<"{]{0,120}(?:letzten|der letzten)\s*30\s*Tage[^$€£0-9]*([$€£]?\s?[0-9]+(?:[.,][0-9]{1,2})?\s?(?:[$€£]|EUR)?)/i,
        /30\s*Tage[^$€£0-9]{0,80}(?:niedrigster preis|lowest price)[^$€£0-9]{0,80}([$€£]?\s?[0-9]+(?:[.,][0-9]{1,2})?\s?(?:[$€£]|EUR)?)/i
      ]);
      const formatPrice = (value?: string): string | undefined => {
        if (!value) return undefined;
        const v = value.trim();
        if (/[$€£]/.test(v)) return v;
        if (/^[0-9]+([.,][0-9]{1,2})?\s*(EUR|USD|GBP)$/i.test(v)) return v;
        if (/^[0-9]+([.,][0-9]{1,2})?$/.test(v) && currencyCode) {
          return `${currencyCode} ${v}`;
        }
        return v;
      };
      const currentPrice = formatPrice(discountedPrice || basePrice || genericPrice);
      const lowestPrice30Days = formatPrice(lowest30Raw);
      const ratingNormalized = ratingRaw?.replace(",", ".");
      const psnStoreRating =
        ratingNormalized && Number.isFinite(Number(ratingNormalized))
          ? Number.parseFloat(Number(ratingNormalized).toFixed(2))
          : undefined;

      const platformText =
        html.match(/"platforms"\s*:\s*"([^"]+)"/i)?.[1] ||
        html.match(/"platform"\s*:\s*"([^"]+)"/i)?.[1];
      const cleanPlatform = platformText
        ? decodeEscapes(platformText)
            .replace(/,/g, " / ")
            .replace(/\s*\/\s*/g, " / ")
            .trim()
        : candidate.platform;

      const finalTitle = decodeEscapes(ogTitle || candidate.title || "").trim() || candidate.title;
      const finalCover = upscaleImageUrl(
        decodeEscapes(ogImage || chosenPageImage || candidate.coverUrl || "")
      );
      debug.finalImageDebug?.push({
        id: candidate.psnTitleId,
        initialTitle: candidate.title,
        finalTitle,
        initialCoverUrl: candidate.coverUrl,
        productUrl,
        ogTitle: ogTitle ? decodeEscapes(ogTitle) : undefined,
        ogImage: ogImage ? decodeEscapes(ogImage) : undefined,
        productPageImageCandidates,
        currentPrice,
        lowestPrice30Days,
        psnStoreRating,
        rawPriceSignals: {
          currencyCode,
          discountedPrice,
          basePrice,
          genericPrice,
          lowest30Raw,
          ratingRaw
        },
        finalCoverUrl: finalCover
      });

      return {
        ...candidate,
        title: finalTitle,
        coverUrl: finalCover,
        isDlc: candidate.isDlc || isLikelyPsnDlc(finalTitle),
        currentPrice: currentPrice ?? candidate.currentPrice,
        lowestPrice30Days: lowestPrice30Days ?? candidate.lowestPrice30Days,
        psnStoreRating: psnStoreRating ?? candidate.psnStoreRating,
        platform: cleanPlatform || candidate.platform
      };
    } catch {
      debug.finalImageDebug?.push({
        id: candidate.psnTitleId,
        initialTitle: candidate.title,
        finalTitle: candidate.title,
        initialCoverUrl: candidate.coverUrl,
        productUrl,
        productPageImageCandidates: [],
        currentPrice: candidate.currentPrice,
        lowestPrice30Days: candidate.lowestPrice30Days,
        finalCoverUrl: upscaleImageUrl(candidate.coverUrl)
      });
      return {
        ...candidate,
        isDlc: candidate.isDlc || isLikelyPsnDlc(candidate.title),
        coverUrl: upscaleImageUrl(candidate.coverUrl)
      };
    }
  };

  const enriched = await Promise.all(top.map((item) => enrichFromProductPage(item)));
  return { titles: enriched, debug };
}

export async function searchPsnCatalog(query: string): Promise<PsnTitleCandidate[]> {
  const result = await searchPsnCatalogWithDebug(query);
  if (result.debug.status && result.debug.status >= 400) {
    throw new Error(`Store search failed (${result.debug.status})`);
  }
  return result.titles;
}

export async function getPsnConnectionStatus(): Promise<PsnProfileStatus> {
  if (!hasPsnConfig()) {
    return {
      enabled: false,
      connected: false
    };
  }

  try {
    const { getProfileFromAccountId, getUserTitles } = await import("psn-api");
    const accountId = getResolvedAccountId();
    const auth = await getPsnAuth();
    const [profileResult, titlesResult] = await Promise.allSettled([
      getProfileFromAccountId(auth, accountId),
      getUserTitles(auth, accountId, { limit: 1 })
    ]);

    const profile = profileResult.status === "fulfilled" ? profileResult.value : undefined;
    const totalTitles = titlesResult.status === "fulfilled" ? titlesResult.value.totalItemCount : 0;
    const avatarUrl = profile?.avatars?.[0]?.url;

    return {
      enabled: true,
      connected: true,
      profile: {
        onlineId: profile?.onlineId || "Authenticated User",
        accountId,
        avatarUrl,
        totalTitles
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PSN connection failed";
    return {
      enabled: true,
      connected: false,
      error: message
    };
  }
}

export async function getPsnTrophiesForTitle(npCommunicationId: string): Promise<{
  titleId: string;
  trophies: PsnTrophyDetail[];
  total: number;
  earned: number;
  service: "trophy2" | "trophy";
}> {
  if (!npCommunicationId?.trim()) {
    throw new Error("Missing title id");
  }
  if (!hasPsnConfig()) {
    throw new Error("PSN is not configured");
  }

  const { getUserTrophiesEarnedForTitle, getTitleTrophies } = await import("psn-api");
  const auth = await getPsnAuth();
  const accountId = getResolvedAccountId();
  const titleId = npCommunicationId.trim();

  const tryService = async (service: "trophy2" | "trophy") => {
    const [earnedRes, metaRes] = await Promise.all([
      getUserTrophiesEarnedForTitle(auth, accountId, titleId, "all", { npServiceName: service }),
      getTitleTrophies(auth, titleId, "all", { npServiceName: service })
    ]);

    const metaById = new Map<number, (typeof metaRes.trophies)[number]>();
    for (const trophy of metaRes.trophies ?? []) {
      metaById.set(trophy.trophyId, trophy);
    }

    const combined: PsnTrophyDetail[] = [];
    for (const trophy of earnedRes.trophies ?? []) {
      const meta = metaById.get(trophy.trophyId);
      combined.push({
        trophyId: trophy.trophyId,
        trophyGroupId: meta?.trophyGroupId,
        trophyName: meta?.trophyName,
        trophyDetail: meta?.trophyDetail,
        trophyType: trophy.trophyType,
        trophyIconUrl: meta?.trophyIconUrl,
        trophyHidden: trophy.trophyHidden,
        trophyEarnedRate: trophy.trophyEarnedRate,
        earned: Boolean(trophy.earned),
        earnedDateTime: trophy.earnedDateTime
      });
    }

    combined.sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      return a.trophyId - b.trophyId;
    });

    return {
      titleId,
      trophies: combined,
      total: earnedRes.totalItemCount ?? combined.length,
      earned: combined.filter((t) => t.earned).length,
      service
    };
  };

  try {
    return await tryService("trophy2");
  } catch {
    return await tryService("trophy");
  }
}
