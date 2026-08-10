import { createClient } from "@/lib/supabase/server";
import AnimeCard from "@/components/AnimeCard";
import AddAnimeButton from "@/components/AddAnimeButton";
import HomePageContent from "@/components/HomePageContent";

export const revalidate = 60;

const DEFAULT_TAB = process.env.NEXT_PUBLIC_DEFAULT_HOMEPAGE_TAB === "admin" ? "admin" : "community";

async function getAnimeData() {
  const supabase = await createClient();

  // Lấy danh sách anime kèm thông tin user và user_anime_list
  const { data: animeData, error } = await supabase
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
    .limit(50);

  if (error) {
    console.error("Error fetching anime:", error);
    return [];
  }

  return animeData || [];
}

async function getAdminAnimeData() {
  const supabase = await createClient();

  // Lấy danh sách anime do admin tạo
  const { data: adminIds } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (!adminIds || adminIds.length === 0) {
    return [];
  }

  const { data: animeData, error } = await supabase
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
    .in("created_by", adminIds.map((a) => a.id))
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching admin anime:", error);
    return [];
  }

  return animeData || [];
}

export default async function HomePage() {
  const [communityAnime, adminAnime] = await Promise.all([
    getAnimeData(),
    getAdminAnimeData(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-4 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400">
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Cộng đồng Anime Việt Nam
        </div>
        <h1 className="mt-4 bg-gradient-to-r from-primary-500 via-fuchsia-500 to-primary-400 bg-clip-text font-display text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
          KullAnime
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-500 sm:text-base dark:text-gray-400">
          Quản lý, đánh giá và chia sẻ danh sách anime yêu thích của bạn — cùng nhạc phim OP/ED, diễn viên lồng tiếng và cộng đồng.
        </p>
      </div>

      <HomePageContent
        communityAnime={communityAnime}
        adminAnime={adminAnime}
        defaultTab={DEFAULT_TAB}
      />
    </div>
  );
}