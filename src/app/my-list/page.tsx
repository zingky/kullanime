import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddAnimeButton from "@/components/AddAnimeButton";
import MyListContent from "./MyListContent";

export const revalidate = 0;

export default async function MyListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/my-list");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login?redirect=/my-list");

  const { data: userAnimeList } = await supabase
    .from("user_anime_list")
    .select(
      `id, anime_id, status, rating, review_text, personal_photos, created_at,
       anime(id, mal_id, title, title_japanese, cover_image, studio, theme_songs)`
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const entries = (userAnimeList || []).filter((e: any) => e.anime);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My List 🎬</h1>
          <p className="mt-1 text-sm text-gray-500">
            Danh sách anime của bạn ({entries.length})
          </p>
        </div>
        <AddAnimeButton variant="card" />
      </div>
      <MyListContent initialEntries={entries} username={profile.username} />
    </div>
  );
}