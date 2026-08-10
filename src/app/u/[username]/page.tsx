import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AnimeCard from "@/components/AnimeCard";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

async function getUserData(username: string) {
  const supabase = await createClient();

  // Lấy profile
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (error || !profile) return null;

  // Lấy danh sách anime của user
  const { data: userAnimeList } = await supabase
    .from("user_anime_list")
    .select(
      `
      id, user_id, anime_id, status, rating, review_text, personal_photos, created_at,
      anime(
        id, mal_id, title, title_japanese, cover_image, studio, characters_staff,
        youtube_trailer_id, homepage_url, mal_url, theme_songs, created_at, created_by,
        profiles(username, avatar_url, role)
      )
    `
    )
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return { profile, userAnimeList: userAnimeList || [] };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const data = await getUserData(username);

  if (!data) {
    notFound();
  }

  const { profile, userAnimeList } = data;

  // Kiểm tra privacy
  if (profile.is_private) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isOwner = user?.id === profile.id;
    const { data: viewerProfile } = user
      ? await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()
      : { data: null };

    if (!isOwner && viewerProfile?.role !== "admin") {
      return (
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <div className="card mx-auto max-w-md p-8">
            <span className="text-5xl">🔒</span>
            <h1 className="mt-4 text-xl font-bold text-white">
              Danh sách riêng tư
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Người dùng này đã bật chế độ riêng tư. Bạn không thể xem danh sách
              anime của họ.
            </p>
          </div>
        </div>
      );
    }
  }

  const watching = userAnimeList.filter((e: any) => e.status === "Watching").length;
  const completed = userAnimeList.filter((e: any) => e.status === "Completed").length;
  const planToWatch = userAnimeList.filter((e: any) => e.status === "Plan to Watch").length;
  const dropped = userAnimeList.filter((e: any) => e.status === "Dropped").length;
  const avgRating =
    userAnimeList.filter((e: any) => e.rating).length > 0
      ? (
          userAnimeList.reduce((sum: number, e: any) => sum + (e.rating || 0), 0) /
          userAnimeList.filter((e: any) => e.rating).length
        ).toFixed(1)
      : "N/A";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Profile header */}
      <div className="card overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-primary-900 via-dark-800 to-dark-900" />
        <div className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-end">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="-mt-16 h-28 w-28 rounded-2xl border-4 border-dark-800 object-cover shadow-lg"
            />
          ) : (
            <span className="-mt-16 flex h-28 w-28 items-center justify-center rounded-2xl border-4 border-dark-800 bg-primary-600 text-4xl font-black text-white shadow-lg">
              {profile.username[0]?.toUpperCase() || "U"}
            </span>
          )}
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              {profile.username}
              {profile.role === "admin" && (
                <span className="rounded bg-primary-500/20 px-2 py-0.5 text-xs font-semibold text-primary-400">
                  Admin
                </span>
              )}
              {profile.is_private && (
                <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-400">
                  🔒 Riêng tư
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Tham gia {formatDate(profile.created_at)}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 border-t border-dark-700 p-6 sm:grid-cols-5">
          <div>
            <p className="text-2xl font-bold text-white">{userAnimeList.length}</p>
            <p className="text-xs text-gray-500">Tổng anime</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{watching}</p>
            <p className="text-xs text-gray-500">Đang xem</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-400">{completed}</p>
            <p className="text-xs text-gray-500">Đã xem</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-400">{planToWatch}</p>
            <p className="text-xs text-gray-500">Muốn xem</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-500">{avgRating}</p>
            <p className="text-xs text-gray-500">Điểm TB</p>
          </div>
        </div>
      </div>

      {/* Anime list */}
      <h2 className="mb-4 mt-8 text-xl font-bold text-white">
        Danh sách Anime ({userAnimeList.length})
      </h2>

      {userAnimeList.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-lg font-semibold text-gray-300">
            Chưa có anime nào trong danh sách
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Người dùng này chưa thêm anime nào.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {userAnimeList.map((entry: any) =>
            entry.anime ? (
              <AnimeCard
                key={entry.id}
                anime={{
                  ...entry.anime,
                  user_anime_list: [entry],
                  profiles: entry.anime.profiles,
                }}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}