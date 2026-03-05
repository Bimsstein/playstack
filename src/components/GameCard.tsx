"use client";

import { Star, Trophy, Trash2, X } from "lucide-react";
import { useState } from "react";

import { statusMeta, type StatusFilter } from "@/lib/types";

export type GameDto = {
  id: string;
  source: "PLAYSTATION" | "STEAM" | "NINTENDO";
  psnTitleId?: string | null;
  steamAppId?: number | null;
  nintendoGameId?: string | null;
  title: string;
  platform: string | null;
  coverUrl: string | null;
  currentPrice?: string | null;
  lowestPrice30Days?: string | null;
  psnStoreRating?: number | null;
  storyPlusHours?: number | null;
  status: StatusFilter;
  rating: number | null;
  trophyCompletion: number | null;
  earnedTrophies: number | null;
  totalTrophies: number | null;
  updatedAt: string;
};

type GameCardProps = {
  game: GameDto;
  onRatingChange: (id: string, rating: number | null) => Promise<void>;
  onStatusChange: (id: string, status: StatusFilter) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function formatNintendoPrice(value?: string | null) {
  if (!value) return value;
  const cleaned = value.trim();
  const numberMatch = cleaned.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!numberMatch) return cleaned.replace(/^EUR\s*/i, "€");
  const numeric = numberMatch[1].replace(",", ".");
  const [whole, fractionRaw = "00"] = numeric.split(".");
  const fraction = (fractionRaw + "00").slice(0, 2);
  return `€${whole},${fraction}`;
}

export function GameCard({ game, onRatingChange, onStatusChange, onDelete }: GameCardProps) {
  const meta = statusMeta[game.status];
  const [trophyLoading, setTrophyLoading] = useState(false);
  const [trophyError, setTrophyError] = useState("");
  const [trophiesLoaded, setTrophiesLoaded] = useState(false);
  const [trophyModalOpen, setTrophyModalOpen] = useState(false);
  const [trophyItems, setTrophyItems] = useState<
    Array<{
      trophyId: number;
      trophyName?: string;
      trophyDetail?: string;
      trophyType?: string;
      trophyIconUrl?: string;
      earned: boolean;
      earnedDateTime?: string;
    }>
  >([]);
  const [trophySummary, setTrophySummary] = useState<{ earned: number; total: number } | null>(null);
  const [jsonDebugOpen, setJsonDebugOpen] = useState(false);
  const [jsonDebugLoading, setJsonDebugLoading] = useState(false);
  const [jsonDebugError, setJsonDebugError] = useState("");
  const [jsonDebugPayload, setJsonDebugPayload] = useState<unknown>(null);

  const storyPlusHours = game.storyPlusHours ?? null;
  const timeBadge =
    storyPlusHours == null ? "Unknown" : storyPlusHours <= 15 ? "Short" : storyPlusHours <= 35 ? "Medium" : "Long";
  const displayCurrentPrice = game.source === "NINTENDO" ? formatNintendoPrice(game.currentPrice) : game.currentPrice;
  const displayLowestPrice30Days =
    game.source === "NINTENDO" ? formatNintendoPrice(game.lowestPrice30Days) : game.lowestPrice30Days;

  async function loadTrophies() {
    if (trophiesLoaded || trophyLoading) return;
    if (game.source === "NINTENDO") {
      setTrophyError("Nintendo trophy details are not available.");
      setTrophiesLoaded(true);
      return;
    }
    if (game.source === "STEAM" && !game.steamAppId) {
      setTrophyError("No Steam app id linked for this game.");
      setTrophiesLoaded(true);
      return;
    }
    if (game.source !== "STEAM" && !game.psnTitleId) {
      setTrophyError("No PSN title id linked for this game.");
      setTrophiesLoaded(true);
      return;
    }

    setTrophyLoading(true);
    setTrophyError("");
    try {
      const res =
        game.source === "STEAM"
          ? await fetch(`/api/steam/achievements?appId=${encodeURIComponent(String(game.steamAppId || ""))}`, {
              cache: "no-store"
            })
          : await fetch(`/api/psn/trophies?titleId=${encodeURIComponent(game.psnTitleId || "")}`, {
              cache: "no-store"
            });
      const data = (await res.json()) as {
        error?: string;
        trophies?: Array<{
          trophyId: number;
          trophyName?: string;
          trophyDetail?: string;
          trophyType?: string;
          trophyIconUrl?: string;
          earned: boolean;
          earnedDateTime?: string;
        }>;
        earned?: number;
        total?: number;
      };
      if (!res.ok) {
        setTrophyError(data.error || "Failed to load trophies.");
        setTrophiesLoaded(true);
        return;
      }
      setTrophyItems(data.trophies ?? []);
      setTrophySummary({
        earned: data.earned ?? 0,
        total: data.total ?? (data.trophies?.length ?? 0)
      });
      setTrophiesLoaded(true);
    } catch {
      setTrophyError("Failed to load trophies.");
      setTrophiesLoaded(true);
    } finally {
      setTrophyLoading(false);
    }
  }

  async function openTrophyModal() {
    setTrophyModalOpen(true);
    if (!trophiesLoaded && !trophyLoading) {
      await loadTrophies();
    }
  }

  async function openStoreJsonDebug() {
    if (!game.psnTitleId) return;
    setJsonDebugOpen(true);
    setJsonDebugLoading(true);
    setJsonDebugError("");
    try {
      const res = await fetch(`/api/psn/product-json?titleId=${encodeURIComponent(game.psnTitleId)}`, {
        cache: "no-store"
      });
      const data = await res.json();
      if (!res.ok) {
        setJsonDebugError(data.error || "Failed to load store JSON.");
        setJsonDebugPayload(null);
      } else {
        setJsonDebugPayload(data);
      }
    } catch {
      setJsonDebugError("Failed to load store JSON.");
      setJsonDebugPayload(null);
    } finally {
      setJsonDebugLoading(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-[6px] bg-[#fcfdff] ring-1 ring-black/5">
      <div className="grid gap-3 p-3 md:grid-cols-[196px_minmax(0,1fr)]">
        <div
          className="relative h-56 w-full self-stretch overflow-hidden rounded-[6px] bg-[#eef2f6] md:h-full"
        >
          {game.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.coverUrl} alt={game.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">No cover art</div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold leading-tight text-ink">{game.title}</h3>
              <p className="text-xs text-muted">{game.platform || "Platform unknown"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-[6px] border border-[#d9dee7] bg-[#f8fafc] px-2 py-1 text-xs font-medium text-[#475569]">
                {game.source === "STEAM" ? "Steam" : game.source === "NINTENDO" ? "Nintendo" : "PlayStation"}
              </span>
              {game.source === "PLAYSTATION" && typeof game.psnStoreRating === "number" ? (
                <span className="rounded-[6px] border border-[#d9dee7] bg-[#fffaf0] px-2 py-1 text-xs font-medium text-[#7a5a00]">
                  ★ {game.psnStoreRating.toFixed(2)}
                </span>
              ) : null}
              <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-1 text-xs font-medium text-[#4f596d]">{meta.label}</span>
              <button
                type="button"
                onClick={() => onDelete(game.id)}
                className="inline-flex items-center gap-1 rounded-[6px] border border-[#f2d2cf] px-2 py-1 text-xs font-medium text-[#b42318] transition hover:bg-[#fff6f5]"
              >
                <Trash2 size={12} /> Remove
              </button>
              {game.source === "PLAYSTATION" && game.psnTitleId ? (
                <button
                  type="button"
                  onClick={() => void openStoreJsonDebug()}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[#d9dee7] px-2 py-1 text-xs font-medium text-[#334155] transition hover:bg-[#f6f8fc]"
                >
                  Store JSON
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-[6px] border border-[#e7ebf0] bg-white px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Current Price</p>
              <p className="mt-1 text-sm font-semibold text-ink">{displayCurrentPrice || "n/a"}</p>
              <p className="text-xs text-muted">{displayLowestPrice30Days ? `30d low: ${displayLowestPrice30Days}` : "30d low: n/a"}</p>
            </div>
            <div className="rounded-[6px] border border-[#e7ebf0] bg-white px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Story + Extra</p>
              <p className="mt-1 text-sm font-semibold text-ink">{storyPlusHours != null ? `${storyPlusHours}h` : "n/a"}</p>
              <div className="mt-1">
                <span className="rounded-[6px] border border-[#d9dee7] bg-[#f5f7fb] px-2 py-0.5 text-[11px] font-medium text-[#4f596d]">
                  {timeBadge}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void openTrophyModal()}
              className="rounded-[6px] border border-[#e7ebf0] bg-white px-2.5 py-2 text-left transition hover:bg-[#fafbfc]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Trophy Progress</p>
              <p className="mt-1 text-sm font-semibold text-ink">{game.trophyCompletion ?? 0}%</p>
              <div className="mt-1 h-2 rounded-[6px] bg-[#edf1f4]">
                <div
                  className="h-full rounded-[6px] bg-[#334155] transition-all"
                  style={{ width: `${Math.max(0, Math.min(game.trophyCompletion ?? 0, 100))}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">{game.earnedTrophies ?? 0}/{game.totalTrophies ?? 0} trophies</p>
              <p className="mt-1 text-[11px] text-muted">Click to view trophy details</p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={game.status}
              onChange={(e) => onStatusChange(game.id, e.target.value as StatusFilter)}
              className="rounded-[6px] border border-[#e7ebf0] bg-white px-2 py-1.5 text-xs outline-none focus:border-accent"
            >
              <option value="WANT_TO_PLAY">Want to Play</option>
              <option value="PLAYING">Playing</option>
              <option value="DONE">Done</option>
            </select>

            <label className="flex items-center gap-2 rounded-[6px] border border-[#e7ebf0] bg-white px-2 py-1.5 text-xs">
              <Star size={13} />
              <input
                type="number"
                min={1}
                max={10}
                value={game.rating ?? ""}
                onChange={(e) => onRatingChange(game.id, e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-transparent outline-none"
                placeholder="1-10"
              />
            </label>
          </div>

        </div>
      </div>

      {trophyModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-[6px] bg-white ring-1 ring-black/10">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">{game.title}</p>
                <p className="text-xs text-muted">Trophy details</p>
              </div>
              <button
                type="button"
                onClick={() => setTrophyModalOpen(false)}
                className="rounded-[6px] border border-[#e7ebf0] p-1.5 text-muted hover:bg-[#fafbfc]"
                aria-label="Close trophy details"
              >
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[calc(80vh-64px)] space-y-2 overflow-y-auto p-4">
              {trophyLoading ? (
                <p className="text-xs text-muted">Loading trophy details...</p>
              ) : trophyError ? (
                <p className="text-xs text-[#b42318]">{trophyError}</p>
              ) : !trophiesLoaded ? (
                <p className="text-xs text-muted">Loading trophy details...</p>
              ) : trophyItems.length === 0 ? (
                <p className="text-xs text-muted">No trophy details available for this title.</p>
              ) : (
                <>
                  <p className="text-xs text-muted">
                    Earned {trophySummary?.earned ?? 0} of {trophySummary?.total ?? trophyItems.length}
                  </p>
                  <div className="space-y-2">
                    {trophyItems.map((trophy) => (
                      <div
                        key={`${trophy.trophyId}-${trophy.trophyName || "trophy"}`}
                        className="rounded-[6px] border border-[#e7ebf0] bg-[#fcfdff] p-2"
                      >
                        <div className="flex items-start gap-2">
                          {trophy.trophyIconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={trophy.trophyIconUrl}
                              alt={trophy.trophyName || `Trophy ${trophy.trophyId}`}
                              className="h-8 w-8 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#eef3f4] text-[10px] text-muted">
                              <Trophy size={12} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-ink">
                              {trophy.trophyName || `Trophy #${trophy.trophyId}`}
                            </p>
                            {trophy.trophyDetail ? (
                              <p className="line-clamp-2 text-[11px] text-muted">{trophy.trophyDetail}</p>
                            ) : null}
                            <p className="text-[11px] text-muted">
                              {trophy.trophyType || "Unknown"} · {trophy.earned ? "Earned" : "Not earned"}
                              {trophy.earned && trophy.earnedDateTime
                                ? ` · ${new Date(trophy.earnedDateTime).toLocaleDateString()}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {jsonDebugOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-[6px] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h4 className="text-sm font-semibold text-ink">PS Store JSON Debug</h4>
              <button
                type="button"
                onClick={() => setJsonDebugOpen(false)}
                className="rounded-[6px] p-1 text-muted transition hover:bg-[#f3f4f6] hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[calc(85vh-52px)] overflow-auto p-4">
              {jsonDebugLoading ? (
                <p className="text-sm text-muted">Loading product JSON...</p>
              ) : jsonDebugError ? (
                <p className="text-sm text-[#b42318]">{jsonDebugError}</p>
              ) : (
                <pre className="whitespace-pre-wrap break-all rounded-[6px] border border-line bg-[#f8fafc] p-3 text-xs text-[#334247]">
                  {JSON.stringify(jsonDebugPayload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
