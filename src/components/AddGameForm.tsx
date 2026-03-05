"use client";

import { useState } from "react";

import type { StatusFilter } from "@/lib/types";

type AddGameFormProps = {
  onCreate: (payload: {
    title: string;
    platform?: string | null;
    coverUrl?: string | null;
    status: StatusFilter;
    rating?: number | null;
  }) => Promise<void>;
};

export function AddGameForm({ onCreate }: AddGameFormProps) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [status, setStatus] = useState<StatusFilter>("WANT_TO_PLAY");
  const [rating, setRating] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    await onCreate({
      title: title.trim(),
      platform: platform.trim() || null,
      coverUrl: coverUrl.trim() || null,
      status,
      rating: rating ? Number(rating) : null
    });

    setTitle("");
    setPlatform("");
    setCoverUrl("");
    setStatus("WANT_TO_PLAY");
    setRating("");
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="rounded-[6px] border border-line bg-surface p-5 shadow-card">
      <p className="mb-4 text-lg font-semibold">Add a game</p>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="rounded-[6px] border border-line bg-white px-3 py-2 outline-none focus:border-accent"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          className="rounded-[6px] border border-line bg-white px-3 py-2 outline-none focus:border-accent"
          placeholder="Platform (PS5, PS4...)"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        />
        <input
          className="rounded-[6px] border border-line bg-white px-3 py-2 outline-none focus:border-accent md:col-span-2"
          placeholder="Cover URL (optional)"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
        />
        <select
          className="rounded-[6px] border border-line bg-white px-3 py-2 outline-none focus:border-accent"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="WANT_TO_PLAY">Want to Play</option>
          <option value="PLAYING">Playing</option>
          <option value="DONE">Done</option>
        </select>
        <input
          type="number"
          min={1}
          max={10}
          className="rounded-[6px] border border-line bg-white px-3 py-2 outline-none focus:border-accent"
          placeholder="Rating (1-10)"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="mt-4 inline-flex rounded-[6px] bg-accent px-4 py-2 font-semibold text-white transition hover:bg-accentDeep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Adding..." : "Add game"}
      </button>
    </form>
  );
}
