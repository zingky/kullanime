"use client";

import { useMemo, useState } from "react";
import AnimeCard from "./AnimeCard";
import AddAnimeButton from "./AddAnimeButton";
import { extractUniqueValues, extractArtists, extractSeiyuus } from "@/lib/utils";

type TabType = "community" | "admin";

interface HomePageContentProps {
  communityAnime: any[];
  adminAnime: any[];
  defaultTab: TabType;
}

export default function HomePageContent({
  communityAnime,
  adminAnime,
  defaultTab,
}: HomePageContentProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const [search, setSearch] = useState("");
  const [filterStudio, setFilterStudio] = useState("");
  const [filterSeiyuu, setFilterSeiyuu] = useState("");
  const [filterArtist, setFilterArtist] = useState("");
  const [filterSong, setFilterSong] = useState("");

  const currentAnime = activeTab === "admin" ? adminAnime : communityAnime;
  const allAnime = useMemo(() => [...communityAnime, ...adminAnime], [communityAnime, adminAnime]);

  const studios = useMemo(() => extractUniqueValues(allAnime), [allAnime]);
  const artists = useMemo(() => extractArtists(allAnime), [allAnime]);
  const seiyuus = useMemo(() => extractSeiyuus(allAnime), [allAnime]);

  const filteredAnime = useMemo(() => {
    return currentAnime.filter((anime: any) => {
      const q = search.toLowerCase().trim();

      if (q && !anime.title?.toLowerCase().includes(q) && !anime.title_japanese?.toLowerCase().includes(q)) {
        return false;
      }
      if (filterStudio && anime.studio !== filterStudio) {
        return false;
      }
      if (filterSeiyuu) {
        const vaNames = anime.characters_staff?.characters?.flatMap((c: any) => c.voice_actors?.map((va: any) => va.name) || []) || [];
        if (!vaNames.includes(filterSeiyuu)) return false;
      }
      if (filterArtist) {
        const hasArtist = anime.theme_songs?.some((s: any) => s.artist === filterArtist);
        if (!hasArtist) return false;
      }
      if (filterSong) {
        const hasSong = anime.theme_songs?.some((s: any) => s.title === filterSong);
        if (!hasSong) return false;
      }
      return true;
    });
  }, [currentAnime, search, filterStudio, filterSeiyuu, filterArtist, filterSong]);

  return (
    <div className="space-y-6">
      {/* Tab switcher - pill shaped */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-dark-100 bg-white p-1 shadow-card dark:border-dark-800 dark:bg-dark-900">
          <button
            onClick={() => setActiveTab("community")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 sm:px-6 ${
              activeTab === "community"
                ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-glow"
                : "text-gray-500 hover:text-primary-500 dark:text-gray-400"
            }`}
          >
            Cộng đồng
            <span className="ml-1.5 text-xs opacity-80">({communityAnime.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("admin")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 sm:px-6 ${
              activeTab === "admin"
                ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-glow"
                : "text-gray-500 hover:text-primary-500 dark:text-gray-400"
            }`}
          >
            Admin List
            <span className="ml-1.5 text-xs opacity-80">({adminAnime.length})</span>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card space-y-3 p-4 sm:p-5">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên anime, studio, ca sĩ, bài hát..."
            className="input-field pl-10"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select value={filterStudio} onChange={(e) => setFilterStudio(e.target.value)} className="input-field">
            <option value="">Tất cả Studio</option>
            {studios.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={filterSeiyuu} onChange={(e) => setFilterSeiyuu(e.target.value)} className="input-field">
            <option value="">Tất cả Seiyuu</option>
            {seiyuus.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={filterArtist} onChange={(e) => setFilterArtist(e.target.value)} className="input-field">
            <option value="">Tất cả Ca sĩ</option>
            {artists.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select value={filterSong} onChange={(e) => setFilterSong(e.target.value)} className="input-field">
            <option value="">Tất cả Bài hát</option>
            {allAnime.flatMap((a: any) => a.theme_songs || []).map((s: any, i: number) => (
              <option key={`${s.title}-${i}`} value={s.title}>{s.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Anime grid + Add card */}
      {filteredAnime.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 p-12 text-center">
          <div className="flex h-16 w-16 animate-float items-center justify-center rounded-2xl bg-primary-500/10 text-primary-500 dark:text-primary-400">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-dark-800 dark:text-gray-200">Không tìm thấy anime nào</p>
            <p className="mt-1 text-sm text-gray-500">Hãy thử thay đổi bộ lọc hoặc thêm anime mới!</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredAnime.map((anime: any) => (
            <AnimeCard key={anime.id} anime={anime} />
          ))}
          <AddAnimeButton variant="card" />
        </div>
      )}
    </div>
  );
}