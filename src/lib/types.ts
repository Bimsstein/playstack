export type StatusFilter = "WANT_TO_PLAY" | "PLAYING" | "DONE";

export const statusMeta: Record<StatusFilter, { label: string; color: string }> = {
  WANT_TO_PLAY: { label: "Want to Play", color: "bg-[#fdf0d5] text-[#9d5f00]" },
  PLAYING: { label: "Playing", color: "bg-[#d5f6f6] text-[#0a7c7b]" },
  DONE: { label: "Done", color: "bg-[#ddf8e6] text-[#136f3d]" }
};
