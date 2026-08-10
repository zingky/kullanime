import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SongSection from "@/components/SongSection";
import CommentSection from "@/components/CommentSection";
import PhotoGallery from "@/components/PhotoGallery";
import { formatDate } from "@/lib/utils";
import type { Anime, Profile, UserAnimeListEntry } from "@/types";

export const revalidate = 60;

async function getAnime(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("anime")
    .select(
      `
      *,
      profiles(username, avatar_url, role),
      user_anime_list(
        id, user_id, anime_id, status, rating, review_text, personal_photos, created_at,
        profiles(username, avatar_url)
      )
    `
    )
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const anime = await getAnime(id);

  if (!anime) {
    notFound();
  }

  const allEntries = anime.user_anime_list || [];

  // Studio và seiyuu cho cross-filter
  const studio = anime.studio;
  const characters = anime.characters_staff?.characters || [];
  const seiyuus = characters.flatMap(
    (c: any) => c.voice_actors?.map((va: any) => va.name) || []
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header info */}
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Cover */}
        <div className="w-full shrink-0 md:w-64 lg:w-72">
          <div className="overflow-hidden rounded-2xl border border-dark-700 shadow-lg">
            {anime.cover_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={anime.cover_image}
                alt={anime.title}
                className="h-auto w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center bg-gradient-to-br from-primary-900 to-dark-900">
                <span className="text-6xl font-black text-primary-400">
                  {anime.title[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
          </div>

          {/* Links */}
          <div className="mt-4 space-y-2">
            {anime.youtube_trailer_id && (
              <a
                href={`https://www.youtube.com/watch?v=${anime.youtube_trailer_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full"
              >
                ▶ Xem Trailer
              </a>
            )}
            {anime.mal_url && (
              <a
                href={anime.mal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full"
              >
                MyAnimeList
              </a>
            )}
            {anime.homepage_url && (
              <a
                href={anime.homepage_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full"
              >
                Trang chủ Official
              </a>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            {anime.title}
          </h1>
          {anime.title_japanese && (
            <p className="mt-1 text-gray-500">{anime.title_japanese}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {studio && (
              <Link
                href={`/search?studio=${encodeURIComponent(studio)}`}
                className="badge transition-colors hover:border-primary-500 hover:text-primary-400"
              >
                🏢 {studio}
              </Link>
            )}
            <span className="badge">
              Đóng góp bởi{" "}
              <Link
                href={`/u/${anime.profiles?.username || ""}`}
                className="ml-1 text-primary-400 hover:underline"
              >
                {anime.profiles?.username || "Ẩn danh"}
              </Link>
            </span>
            <span className="badge">
              {formatDate(anime.created_at)}
            </span>
          </div>

          {/* Stats from user lists */}
          {allEntries.length > 0 && (
            <div className="mt-6 grid grid-cols-4 gap-3 rounded-xl border border-dark-700 bg-dark-800/50 p-4">
              <div>
                <p className="text-2xl font-bold text-white">{allEntries.length}</p>
                <p className="text-xs text-gray-500">Người xem</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">
                  {(
                    allEntries.reduce((sum: number, e: any) => sum + (e.rating || 0), 0) /
                    Math.max(1, allEntries.filter((e: any) => e.rating).length)
                  ).toFixed(1)}
                </p>
                <p className="text-xs text-gray-500">Điểm TB</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">
                  {
                    allEntries.filter((e: any) => e.status === "Watching")
                      .length
                  }
                </p>
                <p className="text-xs text-gray-500">Đang xem</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">
                  {
                    allEntries.filter((e: any) => e.status === "Completed")
                      .length
                  }
                </p>
                <p className="text-xs text-gray-500">Đã xem</p>
              </div>
            </div>
          )}

          {/* Characters & Seiyuu */}
          {characters.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-lg font-bold text-white">
                Diễn viên lồng tiếng (Seiyuu)
              </h2>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set<string>(seiyuus)).slice(0, 12).map((seiyuu) => (
                  <Link
                    key={seiyuu}
                    href={`/search?seiyuu=${encodeURIComponent(seiyuu)}`}
                    className="badge transition-colors hover:border-primary-500 hover:text-primary-400"
                  >
                    🎙 {seiyuu}
                  </Link>
                ))}
                {seiyuus.length > 12 && (
                  <span className="badge">+{seiyuus.length - 12} khác</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* YouTube Trailer */}
      {anime.youtube_trailer_id && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-dark-700 bg-dark-900">
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${anime.youtube_trailer_id}`}
              title={`${anime.title} Trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        </div>
      )}

      {/* Photo Gallery */}
      {allEntries.some((e: any) => e.personal_photos && e.personal_photos.length > 0) && (
        <div className="mt-10">
          <h2 className="mb-4 text-xl font-bold text-white">Gallery Ảnh</h2>
          <PhotoGallery
            coverImage={anime.cover_image}
            photos={allEntries.flatMap((e: any) => e.personal_photos || [])}
          />
        </div>
      )}

      {/* Reviews */}
      {allEntries.filter((e: any) => e.review_text).length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-xl font-bold text-white">Đánh giá</h2>
          <div className="space-y-4">
            {allEntries
              .filter((e: any) => e.review_text)
              .map((entry: any) => (
                <div key={entry.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-200">
                        {entry.profiles?.username || "Ẩn danh"}
                      </span>
                      {entry.rating && (
                        <span className="flex items-center gap-1 rounded bg-yellow-500/15 px-2 py-0.5 text-xs font-bold text-yellow-400">
                          ★ {entry.rating}
                        </span>
                      )}
                    </div>
                    <span className="badge">{entry.status}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                    {entry.review_text}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Soundtrack */}
      <div className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-white">
          🎵 Nhạc Phim (Soundtrack)
        </h2>
        <SongSection songs={anime.theme_songs} />
      </div>

      {/* Comments */}
      <div className="mt-10">
        <CommentSection animeId={anime.id} />
      </div>
    </div>
  );
}