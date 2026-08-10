"use client";

import Link from "next/link";
import type { ThemeSong } from "@/types";

interface SongSectionProps {
  songs: ThemeSong[] | null;
}

const typeColors: Record<string, string> = {
  OP: "bg-green-500/20 text-green-400 border-green-500/30",
  ED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Insert: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export default function SongSection({ songs }: SongSectionProps) {
  if (!songs || songs.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-gray-500">
          Chưa có thông tin nhạc phim. Hãy là người đầu tiên thêm nhạc phim cho
          anime này.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {songs.map((song, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border border-dark-700 bg-dark-800/50 p-3 transition-colors hover:border-primary-500/30"
        >
          <span
            className={`flex w-14 shrink-0 items-center justify-center rounded border px-2 py-1 text-xs font-bold ${typeColors[song.type] || typeColors.Insert}`}
          >
            {song.type}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-100">
              <Link
                href={`/search?song=${encodeURIComponent(song.title)}`}
                className="transition-colors hover:text-primary-400"
              >
                {song.title}
              </Link>
            </p>
            {song.artist && (
              <p className="truncate text-xs text-gray-500">
                <Link
                  href={`/search?artist=${encodeURIComponent(song.artist)}`}
                  className="transition-colors hover:text-primary-400"
                >
                  {song.artist}
                </Link>
              </p>
            )}
          </div>
          {song.episodes && (
            <span className="shrink-0 text-xs text-gray-600">
              Ep {song.episodes}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}