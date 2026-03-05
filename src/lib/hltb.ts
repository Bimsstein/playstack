import { prisma } from "@/lib/prisma";

type HltbItem = {
  game_name?: string;
  comp_plus?: number;
  comp_all?: number;
};

type HltbResponse = {
  data?: HltbItem[];
};

type HltbLookupResult = {
  hours: number | null;
  reason: "ok" | "http_error" | "empty" | "no_match";
  sourceKind?: "api" | "html";
  status?: number;
  chosenName?: string;
  compPlusMinutes?: number;
  compAllMinutes?: number;
  selectedMinutesField?: "comp_plus" | "comp_all";
  selectedValueUnit?: "minutes" | "seconds";
  chosenScore?: number;
  queryNormalized?: string;
  candidateCount?: number;
  topCandidates?: Array<{
    game_name?: string;
    normalizedName: string;
    score: number;
    comp_plus?: number;
    comp_all?: number;
  }>;
  attemptedUrls?: string[];
  attemptedStatuses?: Array<{ url: string; status: number }>;
  queryUsed?: string;
};

function buildSearchVariants(title: string): string[] {
  const base = title.trim();
  if (!base) return [];
  return [base];
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toHours(value?: number): { hours: number | null; unit: "minutes" | "seconds" } {
  if (!value || value <= 0) return { hours: null, unit: "minutes" };
  // HLTB values are usually minutes, but HTML fallbacks can expose second-based values.
  const fromMinutes = value / 60;
  const fromSeconds = value / 3600;
  const useSeconds = fromMinutes > 300 && fromSeconds > 0 && fromSeconds <= 300;
  const rawHours = useSeconds ? fromSeconds : fromMinutes;
  if (!Number.isFinite(rawHours) || rawHours <= 0) return { hours: null, unit: useSeconds ? "seconds" : "minutes" };
  return {
    hours: Math.max(1, Math.round(rawHours)),
    unit: useSeconds ? "seconds" : "minutes"
  };
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/\\u0027/g, "'")
    .replace(/\\u0022/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function extractJsonLikeMatchesFromHtml(html: string): HltbItem[] {
  const candidates: HltbItem[] = [];
  const regex =
    /"game_name"\s*:\s*"([^"]+)".{0,1000}?"comp_plus"\s*:\s*([0-9]+)(?:.{0,300}?"comp_all"\s*:\s*([0-9]+))?/g;
  let match = regex.exec(html);
  while (match) {
    candidates.push({
      game_name: decodeHtmlText(match[1] || ""),
      comp_plus: Number(match[2] || "0"),
      comp_all: Number(match[3] || "0")
    });
    match = regex.exec(html);
  }
  return candidates;
}

async function fetchHltbFromHtmlSearch(
  query: string,
  attemptedStatuses: Array<{ url: string; status: number }>
): Promise<HltbResponse | null> {
  const q = query.trim();
  if (!q) return null;
  const htmlUrls = [
    `https://www.howlongtobeat.com/search_results.php?page=1&queryString=${encodeURIComponent(q)}`,
    `https://howlongtobeat.com/search_results.php?page=1&queryString=${encodeURIComponent(q)}`,
    `https://www.howlongtobeat.com/search_results.php?page=1&q=${encodeURIComponent(q)}`,
    `https://howlongtobeat.com/search_results.php?page=1&q=${encodeURIComponent(q)}`,
    `https://www.howlongtobeat.com/search_results?page=1&q=${encodeURIComponent(q)}`,
    `https://howlongtobeat.com/search_results?page=1&q=${encodeURIComponent(q)}`,
    `https://www.howlongtobeat.com/search_results?page=1&queryString=${encodeURIComponent(q)}`,
    `https://howlongtobeat.com/search_results?page=1&queryString=${encodeURIComponent(q)}`,
    `https://www.howlongtobeat.com/?q=${encodeURIComponent(q)}`,
    `https://howlongtobeat.com/?q=${encodeURIComponent(q)}`
  ];

  for (const url of htmlUrls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0"
        }
      });
      attemptedStatuses.push({ url, status: res.status });
      if (!res.ok) continue;
      const html = await res.text();
      const data = extractJsonLikeMatchesFromHtml(html);
      if (data.length) return { data };
    } catch {
      attemptedStatuses.push({ url, status: 0 });
    }
  }
  return null;
}

async function fetchHltbFromFinderApi(
  query: string,
  attemptedStatuses: Array<{ url: string; status: number }>
): Promise<HltbResponse | null> {
  const q = query.trim();
  if (!q) return null;

  const initUrls = ["https://howlongtobeat.com/api/finder/init", "https://www.howlongtobeat.com/api/finder/init"];
  let token: string | null = null;
  let tokenOrigin = "https://howlongtobeat.com";

  for (const initUrl of initUrls) {
    try {
      const parsed = new URL(initUrl);
      const withTs = `${initUrl}?t=${Date.now()}`;
      const initRes = await fetch(withTs, {
        cache: "no-store",
        headers: {
          Accept: "application/json,text/plain,*/*",
          "User-Agent": "Mozilla/5.0",
          Origin: `${parsed.protocol}//${parsed.host}`,
          Referer: `${parsed.protocol}//${parsed.host}/`
        }
      });
      attemptedStatuses.push({ url: withTs, status: initRes.status });
      if (!initRes.ok) continue;
      const initJson = (await initRes.json()) as { token?: string };
      if (typeof initJson?.token === "string" && initJson.token.trim()) {
        token = initJson.token.trim();
        tokenOrigin = `${parsed.protocol}//${parsed.host}`;
        break;
      }
    } catch {
      attemptedStatuses.push({ url: initUrl, status: 0 });
    }
  }

  if (!token) return null;

  const payload = {
    searchType: "games",
    searchTerms: q.split(/\s+/).filter(Boolean),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { min: "", max: "" },
        modifier: ""
      },
      users: { sortCategory: "postcount" },
      filter: "",
      sort: 0,
      randomizer: 0
    },
    useCache: true
  };

  const finderUrls = ["https://howlongtobeat.com/api/finder", "https://www.howlongtobeat.com/api/finder"];
  for (const finderUrl of finderUrls) {
    try {
      const parsed = new URL(finderUrl);
      const finderRes = await fetch(finderUrl, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          "Accept-Language": "en",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Dnt: "1",
          "User-Agent": "Mozilla/5.0",
          Origin: tokenOrigin || `${parsed.protocol}//${parsed.host}`,
          Referer: `${parsed.protocol}//${parsed.host}/`,
          "x-auth-token": token
        },
        body: JSON.stringify(payload)
      });
      attemptedStatuses.push({ url: finderUrl, status: finderRes.status });
      if (!finderRes.ok) continue;
      return (await finderRes.json()) as HltbResponse;
    } catch {
      attemptedStatuses.push({ url: finderUrl, status: 0 });
    }
  }

  return null;
}

export async function fetchStoryPlusHoursFromHltb(title: string): Promise<number | null> {
  const result = await fetchStoryPlusHoursFromHltbDetailed(title);
  return result.hours;
}

async function fetchStoryPlusHoursFromHltbDetailed(title: string): Promise<HltbLookupResult> {
  const q = title.trim();
  if (!q) return { hours: null, reason: "empty" };
  const urlCandidates = ["https://howlongtobeat.com/api/finder", "https://www.howlongtobeat.com/api/finder"];
  const attemptedStatuses: Array<{ url: string; status: number }> = [];
  let lastStatus: number | undefined;
  let lastNoMatchResult: HltbLookupResult | null = null;
  const variants = buildSearchVariants(q);

  for (const queryVariant of variants) {
    let sourceKind: "api" | "html" | undefined;
    let json = await fetchHltbFromFinderApi(queryVariant, attemptedStatuses);
    if (json) sourceKind = "api";
    if (!json) {
      json = await fetchHltbFromHtmlSearch(queryVariant, attemptedStatuses);
      if (json) sourceKind = "html";
    }
    if (!json) {
      lastStatus = attemptedStatuses.at(-1)?.status;
      continue;
    }

    const list = json.data ?? [];
    if (!list.length) {
      continue;
    }

    const qNorm = normalize(queryVariant);
    const scored = list
      .map((item) => {
        const name = item.game_name || "";
        const n = normalize(name);
        let score = 0;
        if (n === qNorm) score += 100;
        if (n.startsWith(qNorm)) score += 40;
        if (n.includes(qNorm)) score += 20;
        const qTokens = qNorm.split(/\s+/).filter(Boolean);
        const matchedTokens = qTokens.filter((t) => n.includes(t)).length;
        score += matchedTokens * 5;
        return { item, score, normalizedName: n };
      })
      .sort((a, b) => b.score - a.score);
    const topCandidates = scored.slice(0, 5).map((entry) => ({
      game_name: entry.item.game_name,
      normalizedName: entry.normalizedName,
      score: entry.score,
      comp_plus: entry.item.comp_plus,
      comp_all: entry.item.comp_all
    }));
    const best = scored[0];
    if (!best || best.score < 20) {
      lastNoMatchResult = {
        hours: null,
        reason: "no_match",
        sourceKind,
        queryUsed: queryVariant,
        queryNormalized: qNorm,
        candidateCount: list.length,
        topCandidates,
        attemptedUrls: urlCandidates,
        attemptedStatuses
      };
      continue;
    }

    const hoursFromCompPlus = toHours(best.item.comp_plus);
    const hoursFromCompAll = toHours(best.item.comp_all);
    const hours = hoursFromCompPlus?.hours ?? hoursFromCompAll?.hours;
    const selectedMinutesField =
      hoursFromCompPlus?.hours != null ? "comp_plus" : hoursFromCompAll?.hours != null ? "comp_all" : undefined;
    const selectedValueUnit =
      hoursFromCompPlus?.hours != null ? hoursFromCompPlus.unit : hoursFromCompAll?.hours != null ? hoursFromCompAll.unit : undefined;

    if (hours == null) {
      lastNoMatchResult = {
        hours: null,
        reason: "no_match",
        sourceKind,
        queryUsed: queryVariant,
        chosenName: best.item.game_name,
        compPlusMinutes: best.item.comp_plus,
        compAllMinutes: best.item.comp_all,
        selectedMinutesField,
        selectedValueUnit,
        chosenScore: best.score,
        queryNormalized: qNorm,
        candidateCount: list.length,
        topCandidates,
        attemptedUrls: urlCandidates,
        attemptedStatuses
      };
      continue;
    }

    return {
      hours,
      reason: "ok",
      sourceKind,
      queryUsed: queryVariant,
      chosenName: best.item.game_name,
      compPlusMinutes: best.item.comp_plus,
      compAllMinutes: best.item.comp_all,
      selectedMinutesField,
      selectedValueUnit,
      chosenScore: best.score,
      queryNormalized: qNorm,
      candidateCount: list.length,
      topCandidates,
      attemptedUrls: urlCandidates,
      attemptedStatuses
    };
  }

  if (lastNoMatchResult) return lastNoMatchResult;

  return {
    hours: null,
    reason: "http_error",
    status: lastStatus,
    attemptedUrls: urlCandidates,
    attemptedStatuses
  };
}

export async function backfillStoryPlusHours(limit = 20) {
  const totalTrackedGames = await prisma.game.count();
  const missingEstimateCount = await prisma.game.count({
    where: { storyPlusHours: null }
  });
  const suspiciousEstimateCount = await prisma.game.count({
    where: { storyPlusHours: { gt: 300 } }
  });
  const rows = await prisma.game.findMany({
    where: {},
    select: { id: true, title: true, storyPlusHours: true },
    take: limit,
    orderBy: { updatedAt: "desc" }
  });

  let updated = 0;
  let clearedSuspicious = 0;
  const samples: Array<{
    title: string;
    status: string;
    sourceKind?: "api" | "html";
    previousHours?: number | null;
    chosenName?: string;
    hours?: number;
    httpStatus?: number;
    chosenScore?: number;
    selectedMinutesField?: "comp_plus" | "comp_all";
    selectedValueUnit?: "minutes" | "seconds";
    compPlusMinutes?: number;
    compAllMinutes?: number;
    queryUsed?: string;
    queryNormalized?: string;
    candidateCount?: number;
    topCandidates?: Array<{
      game_name?: string;
      normalizedName: string;
      score: number;
      comp_plus?: number;
      comp_all?: number;
    }>;
    attemptedStatuses?: Array<{ url: string; status: number }>;
  }> = [];
  for (const row of rows) {
    try {
      const result = await fetchStoryPlusHoursFromHltbDetailed(row.title);
      if (result.hours == null) {
        const hadEstimate = typeof row.storyPlusHours === "number" && row.storyPlusHours > 0;
        const wasSuspicious = typeof row.storyPlusHours === "number" && row.storyPlusHours > 300;
        const shouldClearNoMatch = result.reason === "no_match" && hadEstimate;
        if (wasSuspicious || shouldClearNoMatch) {
          await prisma.game.update({
            where: { id: row.id },
            data: { storyPlusHours: null }
          });
          if (wasSuspicious) clearedSuspicious += 1;
        }
        if (samples.length < 12) {
          samples.push({
            title: row.title,
            status: wasSuspicious
              ? "cleared_suspicious_no_match"
              : shouldClearNoMatch
              ? "cleared_no_exact_match"
              : result.reason,
            sourceKind: result.sourceKind,
            previousHours: row.storyPlusHours,
            chosenName: result.chosenName,
            httpStatus: result.status,
            chosenScore: result.chosenScore,
            selectedMinutesField: result.selectedMinutesField,
            selectedValueUnit: result.selectedValueUnit,
            compPlusMinutes: result.compPlusMinutes,
            compAllMinutes: result.compAllMinutes,
            queryUsed: result.queryUsed,
            queryNormalized: result.queryNormalized,
            candidateCount: result.candidateCount,
            topCandidates: result.topCandidates,
            attemptedStatuses: result.attemptedStatuses
          });
        }
        continue;
      }
      await prisma.game.update({
        where: { id: row.id },
        data: { storyPlusHours: result.hours }
      });
      updated += 1;
      if (samples.length < 12) {
        samples.push({
          title: row.title,
          status: "updated",
          sourceKind: result.sourceKind,
          previousHours: row.storyPlusHours,
          chosenName: result.chosenName,
          hours: result.hours,
          chosenScore: result.chosenScore,
          selectedMinutesField: result.selectedMinutesField,
          selectedValueUnit: result.selectedValueUnit,
          compPlusMinutes: result.compPlusMinutes,
          compAllMinutes: result.compAllMinutes,
          queryUsed: result.queryUsed,
          queryNormalized: result.queryNormalized,
          candidateCount: result.candidateCount,
          topCandidates: result.topCandidates
        });
      }
    } catch {
      if (samples.length < 12) {
        samples.push({
          title: row.title,
          status: "exception"
        });
      }
    }
  }

  return {
    totalTrackedGames,
    missingEstimateCount,
    suspiciousEstimateCount,
    scanned: rows.length,
    updated,
    clearedSuspicious,
    samples
  };
}
