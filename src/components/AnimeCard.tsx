"use client";

import Link from "next/link";
import type { AnimeWithUser } from "@/types";
import { getStatusColor } from "@/lib/utils";

interface AnimeCardProps {
  anime: AnimeWithUser;
}

export default function AnimeCard({ anime }: AnimeCardProps) {
  const firstEntry = anime.user_anime_list?.[0];
  const author = anime.profiles?.username || "Ẩn danh";

  return (
    <Link
      href={`/anime/${anime.id}`}
      className="group overflow-hidden rounded-2xl border border-dark-100 bg-white shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary-500/40 hover:shadow-card-hover dark:border-dark-800 dark:bg-dark-900/60"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-dark-100 dark:bg-dark-900">
        {anime.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anime.cover_image}
            alt={anime.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-900 to-dark-900">
            <span className="text-4xl font-bold text-primary-400">
              {anime.title?.[0]?.toUpperCase() || "?"}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-dark-950/90 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {firstEntry && (
          <span
            className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-xs font-semibold backdrop-blur-sm ${getStatusColor(
              firstEntry.status
            )}`}
          >
            {firstEntry.status}
          </span>
        )}

        {firstEntry?.rating && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-yellow-500/90 px-2 py-0.5 text-xs font-bold text-dark-950">
            ★ {firstEntry.rating}
          </span>
        )}
      </div>

      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-dark-800 group-hover:text-primary-600 dark:text-gray-100 dark:group-hover:text-primary-400">
          {anime.title}
        </h3>
        {anime.title_japanese && (
          <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
            {anime.title_japanese}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="truncate text-xs text-gray-500">
            {anime.studio || "Unknown Studio"}
          </span>
          <span className="ml-2 shrink-0 text-xs text-gray-400 dark:text-gray-600">
            bởi <span className="text-gray-500 dark:text-gray-400">{author}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}