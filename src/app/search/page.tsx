import { createClient } from "@/lib/supabase/server";
import AnimeCard from "@/components/AnimeCard";
import SearchBar from "@/components/SearchBar";
import { extractUniqueValues, extractArtists, extractSeiyuus } from "@/lib/utils";

export const revalidate = 60;

async function getAnimeData() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("anime")
    .select(
      `
      *,
      profiles(username, avatar_url, role),
      user_anime_list(
        id, user_id, anime_id, status, rating, review_text, personal_photos, created_at
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return [];
  return data || [];
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const allAnime = await getAnimeData();
  const params = await searchParams;

  const q = params.q?.toLowerCase() || "";
  const studio = params.studio || "";
  const seiyuu = params.seiyuu || "";
  const artist = params.artist || "";
  const song = params.song || "";

  const filtered = allAnime.filter((anime: any) => {
    if (q) {
      const matchTitle =
        anime.title?.toLowerCase().includes(q) ||
        anime.title_japanese?.toLowerCase().includes(q) ||
        anime.studio?.toLowerCase().includes(q);
      const matchSong = anime.theme_songs?.some(
        (s: any) =>
          s.title?.toLowerCase().includes(q) ||
          s.artist?.toLowerCase().includes(q)
      );
      const matchSeiyuu = anime.characters_staff?.characters?.some((c: any) =>
        c.voice_actors?.some((va: any) => va.name?.toLowerCase().includes(q))
      );
      if (!matchTitle && !matchSong && !matchSeiyuu) return false;
    }
    if (studio && anime.studio !== studio) return false;
    if (seiyuu) {
      const hasSeiyuu = anime.characters_staff?.characters?.some((c: any) =>
        c.voice_actors?.some((va: any) => va.name === seiyuu)
      );
      if (!hasSeiyuu) return false;
    }
    if (artist) {
      const hasArtist = anime.theme_songs?.some((s: any) => s.artist === artist);
      if (!hasArtist) return false;
    }
    if (song) {
      const hasSong = anime.theme_songs?.some((s: any) => s.title === song);
      if (!hasSong) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold text-white">Tìm kiếm Anime</h1>

      <div className="card mb-6 p-4">
        <SearchBar initialQuery={q} />
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500">
          Tìm thấy <span className="font-semibold text-white">{filtered.length}</span>{" "}
          anime
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-lg font-semibold text-gray-300">
            Không tìm thấy anime nào
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Hãy thử tìm kiếm với từ khóa khác
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((anime: any) => (
            <AnimeCard key={anime.id} anime={anime} />
          ))}
        </div>
      )}
    </div>
  );
}