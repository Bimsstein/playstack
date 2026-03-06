"use client";

import { Bell, ChevronDown, ChevronRight, RefreshCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { GameCard, type GameDto } from "@/components/GameCard";
import { statusMeta, type StatusFilter } from "@/lib/types";

const statuses: StatusFilter[] = ["WANT_TO_PLAY", "PLAYING", "DONE"];
type FrontFilterStatus = "ALL" | StatusFilter;
type TrophyFilter = "ALL" | "WITH_TROPHIES" | "NO_TROPHIES";
type AppView = "LIBRARY" | "STORE" | "OVERVIEW" | "SETTINGS";
type ToolPlatform = "PLAYSTATION" | "STEAM" | "NINTENDO";

type PsnStatus = {
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

type PsnTitleCandidate = {
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

type SteamTitleCandidate = {
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

type NintendoTitleCandidate = {
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

type CatalogDebug = {
  query: string;
  url: string;
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

type UiNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string | null;
};

type RuntimeSettings = {
  PSN_NPSSO: string;
  PSN_ACCOUNT_ID: string;
  PSN_STORE_LOCALE: string;
  STEAM_API_KEY: string;
  STEAM_STEAMID: string;
  RAWG_API_KEY: string;
};

function formatNintendoPrice(value?: string) {
  if (!value) return value;
  const cleaned = value.trim();
  const numberMatch = cleaned.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!numberMatch) return cleaned.replace(/^EUR\s*/i, "€");
  const numeric = numberMatch[1].replace(",", ".");
  const [whole, fractionRaw = "00"] = numeric.split(".");
  const fraction = (fractionRaw + "00").slice(0, 2);
  return `€${whole},${fraction}`;
}

export default function HomePage() {
  const [games, setGames] = useState<GameDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingCompleted, setSyncingCompleted] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [notifications, setNotifications] = useState<UiNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [psnStatus, setPsnStatus] = useState<PsnStatus | null>(null);

  const [libraryTitles, setLibraryTitles] = useState<PsnTitleCandidate[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [steamLibraryTitles, setSteamLibraryTitles] = useState<SteamTitleCandidate[]>([]);
  const [nintendoLibraryTitles, setNintendoLibraryTitles] = useState<NintendoTitleCandidate[]>([]);

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<PsnTitleCandidate[]>([]);
  const [steamCatalogResults, setSteamCatalogResults] = useState<SteamTitleCandidate[]>([]);
  const [nintendoCatalogResults, setNintendoCatalogResults] = useState<NintendoTitleCandidate[]>([]);
  const [nintendoLegacyCatalogResults, setNintendoLegacyCatalogResults] = useState<NintendoTitleCandidate[]>([]);
  const [includePsnDlc, setIncludePsnDlc] = useState(false);
  const [includeSteamDlc, setIncludeSteamDlc] = useState(false);
  const [includeNintendoDlc, setIncludeNintendoDlc] = useState(false);
  const [nintendoPlatformFilter, setNintendoPlatformFilter] = useState("ALL");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogDebug, setCatalogDebug] = useState<CatalogDebug | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FrontFilterStatus>("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [trophyFilter, setTrophyFilter] = useState<TrophyFilter>("ALL");

  const [activeView, setActiveView] = useState<AppView>("OVERVIEW");
  const [toolPlatform, setToolPlatform] = useState<ToolPlatform>("PLAYSTATION");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [steamStatus, setSteamStatus] = useState<PsnStatus | null>(null);
  const [collapsedOverviewSections, setCollapsedOverviewSections] = useState<Record<StatusFilter, boolean>>({
    WANT_TO_PLAY: false,
    PLAYING: false,
    DONE: false
  });
  const [settings, setSettings] = useState<RuntimeSettings>({
    PSN_NPSSO: "",
    PSN_ACCOUNT_ID: "me",
    PSN_STORE_LOCALE: "en-us",
    STEAM_API_KEY: "",
    STEAM_STEAMID: "",
    RAWG_API_KEY: ""
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  async function fetchGames() {
    const res = await fetch("/api/games", { cache: "no-store" });
    const data = (await res.json()) as GameDto[];
    setGames(data);
    setLoading(false);
  }

  async function fetchPsnStatus() {
    const res = await fetch("/api/psn-status", { cache: "no-store" });
    const data = (await res.json()) as PsnStatus;
    setPsnStatus(data);
  }

  async function fetchSteamStatus() {
    const res = await fetch("/api/steam-status", { cache: "no-store" });
    const data = (await res.json()) as PsnStatus;
    setSteamStatus(data);
  }

  async function fetchLibrary() {
    setLibraryLoading(true);
    const res = await fetch("/api/psn/library", { cache: "no-store" });
    const data = (await res.json()) as { titles?: PsnTitleCandidate[] };
    setLibraryTitles(data.titles ?? []);
    setLibraryLoading(false);
  }

  async function fetchSteamLibrary() {
    setLibraryLoading(true);
    const res = await fetch("/api/steam/library", { cache: "no-store" });
    const data = (await res.json()) as { titles?: SteamTitleCandidate[] };
    setSteamLibraryTitles(data.titles ?? []);
    setLibraryLoading(false);
  }

  async function fetchNintendoLibrary() {
    setLibraryLoading(true);
    const res = await fetch("/api/nintendo/library", { cache: "no-store" });
    const data = (await res.json()) as { titles?: NintendoTitleCandidate[] };
    setNintendoLibraryTitles(data.titles ?? []);
    setLibraryLoading(false);
  }

  async function fetchNotifications() {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    const data = (await res.json()) as { unreadCount?: number; notifications?: UiNotification[] };
    setUnreadNotifications(data.unreadCount ?? 0);
    setNotifications(data.notifications ?? []);
  }

  async function fetchSettings() {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const data = (await res.json()) as { values?: RuntimeSettings };
    if (!data.values) return;
    setSettings(data.values);
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsMessage("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: settings })
    });
    const data = await res.json();
    if (!res.ok) {
      setSettingsMessage(data.error ? "Failed to save settings." : "Failed to save settings.");
      setSettingsSaving(false);
      return;
    }
    setSettings(data.values ?? settings);
    setSettingsMessage("Settings saved.");
    await fetchPsnStatus();
    await fetchSteamStatus();
    setSettingsSaving(false);
  }

  async function markNotificationsRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    await fetchNotifications();
  }

  async function syncPsn() {
    setSyncing(true);
    setSyncMessage("");

    const res = await fetch("/api/sync", { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      setSyncMessage(
        data.enabled
          ? `Synced: ${data.syncedCount} library title${data.syncedCount === 1 ? "" : "s"}; updated ${data.updatedTrackedCount ?? 0} tracked game${data.updatedTrackedCount === 1 ? "" : "s"}; HLTB estimates updated: ${data.hltb?.updated ?? 0}.`
          : "Sync is not configured yet."
      );
      await fetchGames();
      await fetchPsnStatus();
      await fetchSteamStatus();
      await fetchLibrary();
      await fetchSteamLibrary();
      await fetchNintendoLibrary();
      await fetchNotifications();
    } else {
      setSyncMessage(data.error || "PSN sync failed.");
    }

    setSyncing(false);
  }

  async function syncCompletedToDone() {
    setSyncingCompleted(true);
    const res = await fetch("/api/sync-completed", { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      setSyncMessage(
        `Platinum sync: ${data.completedTitles ?? 0} completed title${data.completedTitles === 1 ? "" : "s"}; moved ${data.movedToDone ?? 0} tracked game${data.movedToDone === 1 ? "" : "s"} and created ${data.createdInDone ?? 0} in Done.`
      );
      await fetchGames();
      await fetchLibrary();
      await fetchSteamLibrary();
      await fetchNintendoLibrary();
      await fetchNotifications();
    } else {
      setSyncMessage(data.error || "Sync completed games failed.");
    }

    setSyncingCompleted(false);
  }


  useEffect(() => {
    const init = async () => {
      await fetchGames();
      await fetchPsnStatus();
      await fetchSteamStatus();
      await fetchLibrary();
      await fetchSteamLibrary();
      await fetchNintendoLibrary();
      await fetchNotifications();
      await fetchSettings();
      await syncPsn();
    };
    void init();
  }, []);

  useEffect(() => {
    const query = catalogQuery.trim();
    if (!query) {
      setCatalogResults([]);
      setSteamCatalogResults([]);
      setNintendoCatalogResults([]);
      setNintendoLegacyCatalogResults([]);
      setCatalogLoading(false);
      setCatalogError("");
      setCatalogDebug(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        if (toolPlatform === "NINTENDO") {
          const [eshopRes, legacyRes] = await Promise.all([
            fetch(`/api/nintendo/search?q=${encodeURIComponent(query)}`, { cache: "no-store" }),
            fetch(`/api/nintendo/legacy-search?q=${encodeURIComponent(query)}`, { cache: "no-store" })
          ]);
          const eshopData = (await eshopRes.json()) as { titles?: NintendoTitleCandidate[]; error?: string };
          const legacyData = (await legacyRes.json()) as { titles?: NintendoTitleCandidate[]; error?: string };

          if (!cancelled) {
            setCatalogDebug(null);
            setCatalogResults([]);
            setSteamCatalogResults([]);
            setNintendoCatalogResults(eshopData.titles ?? []);
            setNintendoLegacyCatalogResults(legacyData.titles ?? []);
            if (!eshopRes.ok && !legacyRes.ok) {
              setCatalogError(eshopData.error || legacyData.error || "Search failed.");
            }
          }
        } else {
          const res = await fetch(
            toolPlatform === "PLAYSTATION"
              ? `/api/psn/search?q=${encodeURIComponent(query)}&debug=1`
              : `/api/steam/search?q=${encodeURIComponent(query)}`,
            {
              cache: "no-store"
            }
          );
          const data = (await res.json()) as {
            titles?: PsnTitleCandidate[];
            debug?: CatalogDebug;
            error?: string;
          };

          if (!cancelled) {
            setCatalogDebug(toolPlatform === "PLAYSTATION" ? data.debug ?? null : null);
            if (res.ok) {
              if (toolPlatform === "PLAYSTATION") {
                setCatalogResults(data.titles ?? []);
                setSteamCatalogResults([]);
                setNintendoCatalogResults([]);
                setNintendoLegacyCatalogResults([]);
              } else {
                setSteamCatalogResults((data.titles as unknown as SteamTitleCandidate[]) ?? []);
                setCatalogResults([]);
                setNintendoCatalogResults([]);
                setNintendoLegacyCatalogResults([]);
              }
            } else {
              setCatalogResults([]);
              setSteamCatalogResults([]);
              setNintendoCatalogResults([]);
              setNintendoLegacyCatalogResults([]);
              setCatalogError(data.error || "Search failed.");
            }
          }
        }
      } catch {
        if (!cancelled) {
          setCatalogResults([]);
          setSteamCatalogResults([]);
          setNintendoCatalogResults([]);
          setNintendoLegacyCatalogResults([]);
          setCatalogError("Search failed.");
          setCatalogDebug(null);
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [catalogQuery, toolPlatform]);

  const trackedPsnIds = useMemo(
    () => new Set(games.map((game) => game.psnTitleId).filter(Boolean)),
    [games]
  );
  const trackedSteamIds = useMemo(
    () => new Set(games.map((game) => game.steamAppId).filter((id): id is number => typeof id === "number")),
    [games]
  );
  const trackedNintendoIds = useMemo(
    () => new Set(games.map((game) => game.nintendoGameId).filter((id): id is string => typeof id === "string")),
    [games]
  );

  const filteredLibraryTitles = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    const list =
      toolPlatform === "PLAYSTATION"
        ? libraryTitles
        : toolPlatform === "STEAM"
          ? steamLibraryTitles
          : nintendoLibraryTitles;
    if (!q) return list;
    return list.filter((title) => {
      const titleText = title.title.toLowerCase();
      const platformText = (title.platform || "").toLowerCase();
      return titleText.includes(q) || platformText.includes(q);
    });
  }, [libraryTitles, steamLibraryTitles, nintendoLibraryTitles, libraryQuery, toolPlatform]);

  const platformOptions = useMemo(() => {
    const unique = Array.from(
      new Set(games.map((g) => g.platform).filter((p): p is string => Boolean(p)))
    );
    return unique.sort((a, b) => a.localeCompare(b));
  }, [games]);

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        game.title.toLowerCase().includes(query) ||
        (game.platform || "").toLowerCase().includes(query);

      const matchesStatus = statusFilter === "ALL" || game.status === statusFilter;
      const matchesPlatform = platformFilter === "ALL" || game.platform === platformFilter;

      const hasTrophies = (game.totalTrophies ?? 0) > 0;
      const matchesTrophies =
        trophyFilter === "ALL" ||
        (trophyFilter === "WITH_TROPHIES" && hasTrophies) ||
        (trophyFilter === "NO_TROPHIES" && !hasTrophies);

      return matchesQuery && matchesStatus && matchesPlatform && matchesTrophies;
    });
  }, [games, searchQuery, statusFilter, platformFilter, trophyFilter]);

  const grouped = useMemo(
    () =>
      statuses.reduce<Record<StatusFilter, GameDto[]>>((acc, status) => {
        acc[status] = filteredGames.filter((g) => g.status === status);
        return acc;
      }, {} as Record<StatusFilter, GameDto[]>),
    [filteredGames]
  );

  const displayedCatalogResults = useMemo(() => {
    if (toolPlatform === "PLAYSTATION") {
      if (includePsnDlc) return catalogResults;
      return catalogResults.filter((title) => !title.isDlc);
    }
    if (toolPlatform === "STEAM") {
      if (includeSteamDlc) return steamCatalogResults;
      return steamCatalogResults.filter((title) => !title.isDlc);
    }
    if (includeNintendoDlc) return nintendoCatalogResults;
    return nintendoCatalogResults.filter((title) => !title.isDlc);
  }, [
    toolPlatform,
    catalogResults,
    steamCatalogResults,
    nintendoCatalogResults,
    includePsnDlc,
    includeSteamDlc,
    includeNintendoDlc
  ]);

  const filteredNintendoEshopResults = useMemo(() => {
    if (toolPlatform !== "NINTENDO") return [] as NintendoTitleCandidate[];
    const list = displayedCatalogResults as NintendoTitleCandidate[];
    if (nintendoPlatformFilter === "ALL") return list;
    const needle = nintendoPlatformFilter.toLowerCase();
    return list.filter((item) => (item.platform || "").toLowerCase().includes(needle));
  }, [toolPlatform, displayedCatalogResults, nintendoPlatformFilter]);

  const filteredNintendoLegacyResults = useMemo(() => {
    if (toolPlatform !== "NINTENDO") return [] as NintendoTitleCandidate[];
    if (nintendoPlatformFilter === "ALL") return nintendoLegacyCatalogResults;
    const needle = nintendoPlatformFilter.toLowerCase();
    return nintendoLegacyCatalogResults.filter((item) =>
      (item.platform || "").toLowerCase().includes(needle)
    );
  }, [toolPlatform, nintendoLegacyCatalogResults, nintendoPlatformFilter]);

  const statusCounts = useMemo(
    () => ({
      WANT_TO_PLAY: grouped.WANT_TO_PLAY?.length ?? 0,
      PLAYING: grouped.PLAYING?.length ?? 0,
      DONE: grouped.DONE?.length ?? 0
    }),
    [grouped]
  );

  async function createGame(payload: {
    source?: ToolPlatform;
    psnTitleId?: string;
    steamAppId?: number;
    nintendoGameId?: string;
    title: string;
    platform?: string | null;
    coverUrl?: string | null;
    currentPrice?: string | null;
    lowestPrice30Days?: string | null;
    psnStoreRating?: number | null;
    status: StatusFilter;
    rating?: number | null;
    trophyCompletion?: number | null;
    earnedTrophies?: number | null;
    totalTrophies?: number | null;
    storyPlusHours?: number | null;
  }) {
    await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await fetchGames();
    await fetchNotifications();
  }

  async function addCandidateToStatus(
    candidate: PsnTitleCandidate | SteamTitleCandidate | NintendoTitleCandidate,
    status: StatusFilter
  ) {
    if (toolPlatform === "STEAM" && "steamAppId" in candidate && candidate.steamAppId) {
      await createGame({
        source: "STEAM",
        steamAppId: candidate.steamAppId,
        title: candidate.title,
        platform: "Steam",
        coverUrl: candidate.coverUrl || null,
        currentPrice: candidate.currentPrice || null,
        lowestPrice30Days: candidate.lowestPrice30Days || null,
        psnStoreRating: null,
        trophyCompletion: candidate.trophyCompletion ?? null,
        earnedTrophies: candidate.earnedTrophies ?? null,
        totalTrophies: candidate.totalTrophies ?? null,
        storyPlusHours: null,
        status,
        rating: null
      });
      return;
    }

    if (toolPlatform === "NINTENDO" && "nintendoGameId" in candidate && candidate.nintendoGameId) {
      await createGame({
        source: "NINTENDO",
        nintendoGameId: candidate.nintendoGameId,
        title: candidate.title,
        platform: candidate.platform || "Nintendo",
        coverUrl: candidate.coverUrl || null,
        currentPrice: candidate.currentPrice || null,
        lowestPrice30Days: candidate.lowestPrice30Days || null,
        psnStoreRating: null,
        trophyCompletion: candidate.trophyCompletion ?? null,
        earnedTrophies: candidate.earnedTrophies ?? null,
        totalTrophies: candidate.totalTrophies ?? null,
        storyPlusHours: null,
        status,
        rating: null
      });
      return;
    }

    await createGame({
      source: "PLAYSTATION",
      psnTitleId: "psnTitleId" in candidate ? candidate.psnTitleId : undefined,
      title: candidate.title,
      platform: candidate.platform || null,
      coverUrl: candidate.coverUrl || null,
      currentPrice: candidate.currentPrice || null,
      lowestPrice30Days: candidate.lowestPrice30Days || null,
      psnStoreRating: "psnStoreRating" in candidate ? candidate.psnStoreRating ?? null : null,
      trophyCompletion: candidate.trophyCompletion ?? null,
      earnedTrophies: candidate.earnedTrophies ?? null,
      totalTrophies: candidate.totalTrophies ?? null,
      storyPlusHours: null,
      status,
      rating: null
    });
  }

  async function updateGame(id: string, patch: Partial<GameDto>) {
    await fetch("/api/games", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch })
    });
    await fetchGames();
    await fetchNotifications();
  }

  async function removeGame(id: string) {
    await fetch(`/api/games?id=${id}`, { method: "DELETE" });
    await fetchGames();
    await fetchNotifications();
  }

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("ALL");
    setPlatformFilter("ALL");
    setTrophyFilter("ALL");
  }

  function toggleOverviewSection(status: StatusFilter) {
    setCollapsedOverviewSections((prev) => ({
      ...prev,
      [status]: !prev[status]
    }));
  }

  const selectedPlatformLabel =
    toolPlatform === "PLAYSTATION" ? "PSN" : toolPlatform === "STEAM" ? "Steam" : "Nintendo";
  const isSyncingNow = syncing || syncingCompleted;

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6">
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-[6px] bg-white p-5 text-ink ring-1 ring-black/5 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Playstack</p>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative rounded-[6px] border border-[#d9dee7] bg-white p-1.5 text-muted hover:text-ink"
                aria-label="Open notifications"
              >
                <Bell size={15} />
                {unreadNotifications > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#b42318] px-1 text-[10px] font-semibold text-white">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                ) : null}
              </button>
              {notificationsOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-80 rounded-[6px] border border-[#e6e9ef] bg-white p-3 shadow-lg shadow-black/10">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Notifications</p>
                    <button
                      type="button"
                      onClick={() => void markNotificationsRead()}
                      className="text-[11px] font-semibold text-[#334155] hover:text-ink"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-auto">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-muted">No notifications yet.</p>
                    ) : (
                      notifications.map((item) => (
                        <div key={item.id} className="rounded-[6px] border border-[#e6e9ef] bg-[#fcfdff] p-2">
                          <p className="text-xs font-semibold text-ink">{item.title}</p>
                          <p className="mt-1 text-xs text-[#334247]">{item.message}</p>
                          <p className="mt-1 text-[11px] text-muted">
                            {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Games Hub</h1>

          <nav className="mt-5 space-y-2">
            {([
              ["OVERVIEW", "Overview"],
              ["LIBRARY", "My Library"],
              ["STORE", "Store search"],
              ["SETTINGS", "Settings"]
            ] as Array<[AppView, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setActiveView(value)}
                className={`w-full rounded-[6px] border px-3 py-2 text-left text-sm font-medium transition ${
                  activeView === value
                    ? "border-[#d9dee7] bg-[#f3f6fa] text-ink shadow-sm"
                    : "border-[#e3e8f0] bg-transparent text-[#425066] hover:bg-[#f7f9fc]"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">{syncMessage || "Auto-sync on page load."}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-1 text-[11px] font-semibold ${
                isSyncingNow
                  ? "border-[#c9d7eb] bg-[#eef4ff] text-[#1f4d8f]"
                  : "border-[#d9dee7] bg-white text-muted"
              }`}
            >
              <RefreshCcw size={11} className={isSyncingNow ? "animate-spin" : ""} />
              {isSyncingNow ? "Syncing..." : "Idle"}
            </span>
          </div>
        </aside>

        <section className="space-y-4">
          <header className="rounded-[6px] bg-white p-5 ring-1 ring-black/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.14em] text-muted">Dashboard</p>
                <p className="text-xl font-semibold text-ink">
                  {activeView === "LIBRARY"
                    ? "My Library"
                    : activeView === "STORE"
                      ? "Store search"
                      : activeView === "SETTINGS"
                        ? "Settings"
                        : "Overview"}
                </p>
                <div className="mt-2 inline-flex rounded-[6px] border border-[#d9dee7] bg-[#f8fafc] p-0.5">
                  <button
                    type="button"
                    onClick={() => setToolPlatform("PLAYSTATION")}
                    className={`rounded-[6px] px-2.5 py-1 text-xs font-semibold ${toolPlatform === "PLAYSTATION" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                  >
                    PlayStation
                  </button>
                  <button
                    type="button"
                    onClick={() => setToolPlatform("STEAM")}
                    className={`rounded-[6px] px-2.5 py-1 text-xs font-semibold ${toolPlatform === "STEAM" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                  >
                    Steam
                  </button>
                  <button
                    type="button"
                    onClick={() => setToolPlatform("NINTENDO")}
                    className={`rounded-[6px] px-2.5 py-1 text-xs font-semibold ${toolPlatform === "NINTENDO" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                  >
                    Nintendo
                  </button>
                </div>
              </div>

              <div className="relative rounded-[6px] border border-[#e8ebf0] bg-[#fafbfc] px-3 py-2">
                {toolPlatform === "NINTENDO" ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-[6px] border border-[#d9dee7] bg-white px-2 py-1 text-xs font-semibold text-ink">Nintendo</span>
                    <button
                      type="button"
                      onClick={() => setUserMenuOpen((prev) => !prev)}
                      className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-semibold text-ink hover:bg-white"
                    >
                      Actions
                    </button>
                    {userMenuOpen ? (
                      <div className="absolute right-0 top-[calc(100%+0.4rem)] z-20 w-64 rounded-[6px] border border-[#e6e9ef] bg-white p-3 shadow-lg shadow-black/10">
                        <button
                          type="button"
                          onClick={() => void syncPsn()}
                          disabled={syncing}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-[6px] bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1f2b2f] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <RefreshCcw size={14} className={syncing ? "animate-spin" : ""} />
                          {syncing ? "Syncing..." : "Sync Nintendo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void syncCompletedToDone()}
                          disabled={syncingCompleted}
                          className="mt-2 inline-flex w-full items-center justify-center rounded-[6px] border border-[#d9dee7] px-3 py-2 text-sm font-semibold text-ink transition hover:bg-[#f6f8fc] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {syncingCompleted ? "Syncing done..." : "Sync completed to Done"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : !(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus) ? (
                  <p className="text-sm text-muted">Checking {selectedPlatformLabel}...</p>
                ) : !(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.enabled ? (
                  <p className="text-sm text-muted">{selectedPlatformLabel} not configured</p>
                ) : !(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.connected ? (
                  <p className="text-sm text-[#b42318]">{(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.error || "Connection failed."}</p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setUserMenuOpen((prev) => !prev)}
                      className="flex items-center gap-3 rounded-[6px] px-1 py-0.5 text-left hover:bg-white/70"
                    >
                      {(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.profile?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.profile?.avatarUrl}
                          alt={(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.profile?.onlineId}
                          className="h-9 w-9 rounded-full object-cover ring-1 ring-line"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef3f4] text-xs font-semibold text-muted ring-1 ring-line">
                          {toolPlatform === "PLAYSTATION" ? "PS" : "ST"}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-ink">{(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.profile?.onlineId}</p>
                        <p className="text-xs text-muted">{(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.profile?.totalTitles ?? 0} titles</p>
                      </div>
                    </button>

                    {userMenuOpen ? (
                      <div className="absolute right-0 top-[calc(100%+0.4rem)] z-20 w-64 rounded-[6px] border border-[#e6e9ef] bg-white p-3 shadow-lg shadow-black/10">
                        <p className="text-xs text-muted">Account: {(toolPlatform === "PLAYSTATION" ? psnStatus : steamStatus)?.profile?.accountId}</p>
                        <button
                          type="button"
                          onClick={() => void syncPsn()}
                          disabled={syncing}
                          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[6px] bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1f2b2f] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <RefreshCcw size={14} className={syncing ? "animate-spin" : ""} />
                          {syncing ? "Syncing..." : `Sync ${selectedPlatformLabel}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => void syncCompletedToDone()}
                          disabled={syncingCompleted}
                          className="mt-2 inline-flex w-full items-center justify-center rounded-[6px] border border-[#d9dee7] px-3 py-2 text-sm font-semibold text-ink transition hover:bg-[#f6f8fc] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {syncingCompleted ? "Syncing platinum..." : "Sync platinum games to Done"}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </header>

          {toolPlatform === "STEAM" && steamStatus && !steamStatus.enabled && activeView !== "SETTINGS" ? (
            <section className="rounded-[6px] border border-[#f0dfb4] bg-[#fffbf2] p-4 ring-1 ring-[#f5e8c8]">
              <p className="text-sm font-semibold text-ink">Steam Setup Required</p>
              <p className="mt-1 text-xs text-muted">
                Configure Steam credentials in the Settings page.
              </p>
              <button
                type="button"
                onClick={() => setActiveView("SETTINGS")}
                className="mt-2 rounded-[6px] border border-[#d9dee7] bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[#f6f8fc]"
              >
                Open Settings
              </button>
              <p className="mt-2 text-xs text-muted">
                Keep your Steam profile public so library and achievements can sync.
              </p>
            </section>
          ) : null}

          {activeView === "SETTINGS" ? (
            <section className="rounded-[6px] bg-white p-5 ring-1 ring-black/5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">PSN NPSSO</span>
                  <input type="password" value={settings.PSN_NPSSO} onChange={(e) => setSettings((prev) => ({ ...prev, PSN_NPSSO: e.target.value }))} className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 outline-none focus:border-accent" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">PSN Account ID</span>
                  <input value={settings.PSN_ACCOUNT_ID} onChange={(e) => setSettings((prev) => ({ ...prev, PSN_ACCOUNT_ID: e.target.value }))} className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 outline-none focus:border-accent" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">PSN Store Locale</span>
                  <input value={settings.PSN_STORE_LOCALE} onChange={(e) => setSettings((prev) => ({ ...prev, PSN_STORE_LOCALE: e.target.value }))} placeholder="en-us / de-de" className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 outline-none focus:border-accent" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">Steam API Key</span>
                  <input type="password" value={settings.STEAM_API_KEY} onChange={(e) => setSettings((prev) => ({ ...prev, STEAM_API_KEY: e.target.value }))} className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 outline-none focus:border-accent" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">Steam ID64</span>
                  <input value={settings.STEAM_STEAMID} onChange={(e) => setSettings((prev) => ({ ...prev, STEAM_STEAMID: e.target.value }))} className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 outline-none focus:border-accent" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">RAWG API Key</span>
                  <input type="password" value={settings.RAWG_API_KEY} onChange={(e) => setSettings((prev) => ({ ...prev, RAWG_API_KEY: e.target.value }))} className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 outline-none focus:border-accent" />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveSettings()}
                  disabled={settingsSaving}
                  className="rounded-[6px] bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-[#1f2b2f] disabled:opacity-70"
                >
                  {settingsSaving ? "Saving..." : "Save Settings"}
                </button>
                <p className="text-xs text-muted">{settingsMessage}</p>
              </div>
              <p className="mt-3 text-xs text-muted">These settings are stored in your app database and can be edited online after deploying to Vercel.</p>
            </section>
          ) : null}

          {activeView === "LIBRARY" ? (
            <section className="rounded-[6px] bg-white p-5 ring-1 ring-black/5">
              <div className="mb-4 flex items-center gap-2 rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2">
                <Search size={14} className="text-muted" />
                <input
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder={`Search your ${toolPlatform === "PLAYSTATION" ? "PSN" : toolPlatform === "STEAM" ? "Steam" : "Nintendo"} library`}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              <div className="space-y-2">
                {libraryLoading ? (
                  <p className="text-sm text-muted">Loading library...</p>
                ) : (toolPlatform === "PLAYSTATION"
                    ? libraryTitles.length
                    : toolPlatform === "STEAM"
                      ? steamLibraryTitles.length
                      : nintendoLibraryTitles.length) === 0 ? (
                  <p className="text-sm text-muted">No library titles cached yet. Use Sync {selectedPlatformLabel} first.</p>
                ) : filteredLibraryTitles.length === 0 ? (
                  <p className="text-sm text-muted">No library games match your search.</p>
                ) : (
                  filteredLibraryTitles.slice(0, 60).map((title) => {
                    const isTracked =
                      toolPlatform === "PLAYSTATION"
                        ? trackedPsnIds.has((title as PsnTitleCandidate).psnTitleId)
                        : toolPlatform === "STEAM"
                          ? trackedSteamIds.has((title as SteamTitleCandidate).steamAppId)
                          : trackedNintendoIds.has((title as NintendoTitleCandidate).nintendoGameId);
                    const isCompleted = (title.trophyCompletion ?? 0) >= 100;
                    return (
                      <div
                        key={
                          toolPlatform === "PLAYSTATION"
                            ? (title as PsnTitleCandidate).psnTitleId
                            : toolPlatform === "STEAM"
                              ? (title as SteamTitleCandidate).steamAppId
                              : (title as NintendoTitleCandidate).nintendoGameId
                        }
                        className="rounded-[6px] border border-[#e6e9ef] bg-[#fcfdff] p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            {title.coverUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={title.coverUrl}
                                alt={title.title}
                                className="h-14 w-14 rounded-[6px] border border-line bg-white p-0.5 object-contain"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-[6px] border border-line bg-[#eef3f4] text-[10px] text-muted">
                                No Art
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">{title.title}</p>
                              <p className="text-xs text-muted">
                                {title.platform || "Unknown platform"} · {title.trophyCompletion ?? 0}% {toolPlatform === "PLAYSTATION" ? "trophies" : toolPlatform === "STEAM" ? "achievements" : "completion"}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isTracked ? (
                              <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-1 text-xs font-medium text-[#4f596d]">Tracked</span>
                            ) : null}
                            {isCompleted ? (
                              <span className="rounded-[6px] border border-[#cde8d5] bg-[#edf8f1] px-2 py-1 text-xs font-medium text-[#157347]">100%</span>
                            ) : null}
                            <button type="button" onClick={() => addCandidateToStatus(title, "WANT_TO_PLAY")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Want</button>
                            <button type="button" onClick={() => addCandidateToStatus(title, "PLAYING")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Playing</button>
                            <button type="button" onClick={() => addCandidateToStatus(title, "DONE")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Done</button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          ) : null}

          {activeView === "STORE" ? (
            <section className="rounded-[6px] bg-white p-5 ring-1 ring-black/5">
              <div className="mb-4 flex items-center gap-2 rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2">
                <Search size={14} className="text-muted" />
                <input
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder={
                    toolPlatform === "PLAYSTATION"
                      ? "Search games in PlayStation store"
                      : toolPlatform === "STEAM"
                        ? "Search games in Steam store"
                        : "Search games in Nintendo eShop (Switch/Switch 2)"
                  }
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              {toolPlatform === "PLAYSTATION" ? (
                <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={includePsnDlc}
                    onChange={(e) => setIncludePsnDlc(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-ink"
                  />
                  Include downloadable content (DLC)
                </label>
              ) : null}
              {toolPlatform === "STEAM" ? (
                <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={includeSteamDlc}
                    onChange={(e) => setIncludeSteamDlc(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-ink"
                  />
                  Include downloadable content (DLC)
                </label>
              ) : null}
              {toolPlatform === "NINTENDO" ? (
                <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={includeNintendoDlc}
                    onChange={(e) => setIncludeNintendoDlc(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-ink"
                  />
                  Include downloadable content (DLC)
                </label>
              ) : null}
              {toolPlatform === "NINTENDO" ? (
                <div className="mb-3">
                  <select
                    value={nintendoPlatformFilter}
                    onChange={(e) => setNintendoPlatformFilter(e.target.value)}
                    className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    <option value="ALL">All Nintendo platforms</option>
                    <option value="switch 2">Switch 2</option>
                    <option value="switch">Switch</option>
                    <option value="gamecube">GameCube</option>
                    <option value="wii u">Wii U</option>
                    <option value="wii">Wii</option>
                    <option value="nintendo 64">Nintendo 64</option>
                    <option value="snes">SNES</option>
                    <option value="nes">NES</option>
                    <option value="game boy advance">Game Boy Advance</option>
                    <option value="game boy color">Game Boy Color</option>
                    <option value="game boy">Game Boy</option>
                    <option value="nintendo ds">Nintendo DS</option>
                    <option value="nintendo 3ds">Nintendo 3DS</option>
                  </select>
                </div>
              ) : null}
              {catalogLoading ? (
                <p className="text-sm text-muted">Searching...</p>
              ) : catalogError ? (
                <p className="text-sm text-[#b42318]">{catalogError}</p>
              ) : catalogQuery.trim() &&
                (toolPlatform === "NINTENDO"
                  ? filteredNintendoEshopResults.length === 0 && filteredNintendoLegacyResults.length === 0
                  : displayedCatalogResults.length === 0) ? (
                <p className="text-sm text-muted">
                  {(toolPlatform === "STEAM" && !includeSteamDlc && steamCatalogResults.length > 0) ||
                  (toolPlatform === "PLAYSTATION" && !includePsnDlc && catalogResults.length > 0) ||
                  (toolPlatform === "NINTENDO" && !includeNintendoDlc && nintendoCatalogResults.length > 0)
                    ? "Only DLC matches were found. Enable DLC to show them."
                    : "No games found."}
                </p>
              ) : (
                <div className="space-y-2">
                  {(toolPlatform === "NINTENDO" ? filteredNintendoEshopResults : displayedCatalogResults)
                    .slice(0, 20)
                    .map((title) => {
                    const isTracked =
                      toolPlatform === "PLAYSTATION"
                        ? trackedPsnIds.has((title as PsnTitleCandidate).psnTitleId)
                        : toolPlatform === "STEAM"
                          ? trackedSteamIds.has((title as SteamTitleCandidate).steamAppId)
                          : trackedNintendoIds.has((title as NintendoTitleCandidate).nintendoGameId);
                    const displayCurrentPrice =
                      toolPlatform === "NINTENDO" ? formatNintendoPrice(title.currentPrice) : title.currentPrice;
                    const displayLowestPrice30Days =
                      toolPlatform === "NINTENDO" ? formatNintendoPrice(title.lowestPrice30Days) : title.lowestPrice30Days;
                    return (
                      <div
                        key={
                          toolPlatform === "PLAYSTATION"
                            ? (title as PsnTitleCandidate).psnTitleId
                            : toolPlatform === "STEAM"
                              ? (title as SteamTitleCandidate).steamAppId
                              : (title as NintendoTitleCandidate).nintendoGameId
                        }
                        className="rounded-[6px] border border-[#e6e9ef] bg-[#fcfdff] p-3"
                      >
                        <div className="mb-2 flex items-center gap-3">
                          {title.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={title.coverUrl}
                              alt={title.title}
                              className={
                                toolPlatform === "STEAM"
                                  ? "h-16 w-32 rounded-[6px] border border-line object-cover"
                                  : toolPlatform === "NINTENDO"
                                    ? "h-16 w-28 rounded-[6px] border border-line object-cover"
                                  : "h-12 w-12 rounded-[6px] border border-line object-cover"
                              }
                            />
                          ) : (
                            <div
                              className={
                                toolPlatform === "STEAM"
                                  ? "flex h-16 w-32 items-center justify-center rounded-[6px] border border-line bg-[#eef3f4] text-[10px] text-muted"
                                  : toolPlatform === "NINTENDO"
                                    ? "flex h-16 w-28 items-center justify-center rounded-[6px] border border-line bg-[#eef3f4] text-[10px] text-muted"
                                  : "flex h-12 w-12 items-center justify-center rounded-[6px] border border-line bg-[#eef3f4] text-[10px] text-muted"
                              }
                            >
                              No Art
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{title.title}</p>
                            <p className="text-xs text-muted">{title.platform || "Unknown platform"}</p>
                            <p className="text-xs text-muted">
                              {displayCurrentPrice ? `Price: ${displayCurrentPrice}` : "Price: n/a"}
                              {displayLowestPrice30Days ? ` · 30d low: ${displayLowestPrice30Days}` : ""}
                            </p>
                            {toolPlatform === "PLAYSTATION" && typeof (title as PsnTitleCandidate).psnStoreRating === "number" ? (
                              <p className="text-xs text-[#7a5a00]">PS Store ★ {(title as PsnTitleCandidate).psnStoreRating?.toFixed(2)}</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isTracked ? (
                            <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-1 text-xs font-medium text-[#4f596d]">Tracked</span>
                          ) : null}
                          <button type="button" onClick={() => addCandidateToStatus(title, "WANT_TO_PLAY")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Want</button>
                          <button type="button" onClick={() => addCandidateToStatus(title, "PLAYING")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Playing</button>
                          <button type="button" onClick={() => addCandidateToStatus(title, "DONE")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Done</button>
                        </div>
                      </div>
                    );
                  })}
                  {toolPlatform === "NINTENDO" && filteredNintendoLegacyResults.length > 0 ? (
                    <div className="mt-3 rounded-[6px] border border-[#e6e9ef] bg-[#f8fafc] p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                        Legacy Nintendo Catalog (GameCube/SNES/GB/etc.)
                      </p>
                      <div className="space-y-2">
                        {filteredNintendoLegacyResults.slice(0, 20).map((title) => {
                          const isTracked = trackedNintendoIds.has(title.nintendoGameId);
                          return (
                            <div key={title.nintendoGameId} className="rounded-[6px] border border-[#e6e9ef] bg-white p-3">
                              <div className="mb-2 flex items-center gap-3">
                                {title.coverUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={title.coverUrl}
                                    alt={title.title}
                                    className="h-16 w-28 rounded-[6px] border border-line object-cover"
                                  />
                                ) : (
                                  <div className="flex h-16 w-28 items-center justify-center rounded-[6px] border border-line bg-[#eef3f4] text-[10px] text-muted">
                                    No Art
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-ink">{title.title}</p>
                                  <p className="text-xs text-muted">{title.platform || "Nintendo legacy"}</p>
                                  <p className="text-xs text-muted">{title.releaseDate ? `Release: ${title.releaseDate}` : ""}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {isTracked ? (
                                  <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-1 text-xs font-medium text-[#4f596d]">Tracked</span>
                                ) : null}
                                <button type="button" onClick={() => addCandidateToStatus(title, "WANT_TO_PLAY")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Want</button>
                                <button type="button" onClick={() => addCandidateToStatus(title, "PLAYING")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Playing</button>
                                <button type="button" onClick={() => addCandidateToStatus(title, "DONE")} className="rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f6f8fc]">Done</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {catalogDebug && catalogError ? (
                <details className="mt-3 rounded-[6px] border border-line bg-[#f8fbfc] p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-muted">Search Debug</summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-[#334247]">
                    {JSON.stringify(catalogDebug, null, 2)}
                  </pre>
                </details>
              ) : null}
            </section>
          ) : null}

          {activeView === "OVERVIEW" ? (
            <>
              <section className="relative rounded-[6px] bg-white p-3 ring-1 ring-black/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFiltersOpen((prev) => !prev)}
                      className="inline-flex items-center gap-2 rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#4f596d] hover:bg-white"
                    >
                      <SlidersHorizontal size={13} /> Filters
                    </button>
                    <button type="button" onClick={resetFilters} className="rounded-[6px] border border-[#e6e9ef] px-2.5 py-2 text-xs font-medium text-ink hover:bg-[#fafbfc]">
                      Reset
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted">{filteredGames.length} / {games.length} shown</p>
                    <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-0.5 text-xs font-medium text-[#4f596d]">{statusCounts.WANT_TO_PLAY}</span>
                    <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-0.5 text-xs font-medium text-[#4f596d]">{statusCounts.PLAYING}</span>
                    <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-0.5 text-xs font-medium text-[#4f596d]">{statusCounts.DONE}</span>
                  </div>
                </div>

                {filtersOpen ? (
                  <div className="absolute left-3 top-[calc(100%+0.45rem)] z-20 w-[min(560px,calc(100vw-3rem))] rounded-[6px] border border-[#e6e9ef] bg-white p-3 shadow-lg shadow-black/10">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="flex items-center gap-2 rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 md:col-span-2">
                        <Search size={13} className="text-muted" />
                        <input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Title or platform"
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </div>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as FrontFilterStatus)} className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 text-sm outline-none focus:border-accent">
                        <option value="ALL">All statuses</option>
                        <option value="WANT_TO_PLAY">Want to Play</option>
                        <option value="PLAYING">Playing</option>
                        <option value="DONE">Done</option>
                      </select>
                      <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 text-sm outline-none focus:border-accent">
                        <option value="ALL">All platforms</option>
                        {platformOptions.map((platform) => (
                          <option key={platform} value={platform}>{platform}</option>
                        ))}
                      </select>
                      <select value={trophyFilter} onChange={(e) => setTrophyFilter(e.target.value as TrophyFilter)} className="w-full rounded-[6px] border border-[#e6e9ef] bg-[#fafbfc] px-3 py-2 text-sm outline-none focus:border-accent md:col-span-2">
                        <option value="ALL">All trophy states</option>
                        <option value="WITH_TROPHIES">Has trophy data</option>
                        <option value="NO_TROPHIES">No trophy data</option>
                      </select>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="grid gap-4 xl:grid-cols-3">
                {loading ? (
                  <div className="rounded-[6px] bg-white p-4 text-sm text-muted ring-1 ring-black/5 xl:col-span-3">Loading games...</div>
                ) : (
                  statuses.map((status) => (
                    <section key={status} className="rounded-[6px] bg-white p-3 ring-1 ring-black/5">
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-base font-semibold text-ink">{statusMeta[status].label}</h2>
                        <div className="flex items-center gap-2">
                          <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-1 text-xs font-medium text-[#4f596d]">{grouped[status]?.length || 0}</span>
                          <button
                            type="button"
                            onClick={() => toggleOverviewSection(status)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] text-[#4f596d] hover:bg-white"
                            aria-label={collapsedOverviewSections[status] ? `Expand ${statusMeta[status].label}` : `Collapse ${statusMeta[status].label}`}
                          >
                            {collapsedOverviewSections[status] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>
                      {!collapsedOverviewSections[status] ? (
                        <div className="space-y-2">
                          {grouped[status]?.length ? (
                            grouped[status].map((game) => (
                            <GameCard
                              key={game.id}
                              game={game}
                              onDelete={removeGame}
                              onStatusChange={(id, value) => updateGame(id, { status: value })}
                              onRatingChange={(id, value) => updateGame(id, { rating: value })}
                            />
                            ))
                          ) : (
                            <div className="rounded-[6px] border border-dashed border-line bg-white/70 p-4 text-sm text-muted">
                              No games in {statusMeta[status].label.toLowerCase()} for current filters.
                            </div>
                          )}
                        </div>
                      ) : null}
                    </section>
                  ))
                )}
              </section>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
