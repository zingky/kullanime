"use server";

import { createClient } from "@/lib/supabase/server";
import { animeCreateSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import type { ThemeSong } from "@/types";

/**
 * Tạo anime mới (tự động hoặc thủ công)
 */
export async function createAnime(input: {
  mal_id?: number | null;
  title: string;
  title_japanese?: string | null;
  cover_image?: string | null;
  studio?: string | null;
  characters_staff?: any;
  youtube_trailer_id?: string | null;
  homepage_url?: string | null;
  mal_url?: string | null;
  theme_songs: ThemeSong[];
}) {
  const supabase = await createClient();

  // Kiểm tra đăng nhập
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Vui lòng đăng nhập để thêm anime." };
  }

  // Validate dữ liệu
  const parsed = animeCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ",
    };
  }

  // Kiểm tra anime đã tồn tại chưa (theo mal_id hoặc title)
  if (input.mal_id) {
    const { data: existingByMal } = await supabase
      .from("anime")
      .select("id")
      .eq("mal_id", input.mal_id)
      .maybeSingle();

    if (existingByMal) {
      return { id: existingByMal.id, existed: true };
    }
  }

  const { data: existingByTitle } = await supabase
    .from("anime")
    .select("id")
    .ilike("title", input.title)
    .maybeSingle();

  if (existingByTitle) {
    return { id: existingByTitle.id, existed: true };
  }

  // Tạo anime mới
  const { data, error } = await supabase
    .from("anime")
    .insert({
      mal_id: input.mal_id || null,
      title: input.title,
      title_japanese: input.title_japanese || null,
      cover_image: input.cover_image || null,
      studio: input.studio || null,
      characters_staff: input.characters_staff || null,
      youtube_trailer_id: input.youtube_trailer_id || null,
      homepage_url: input.homepage_url || null,
      mal_url: input.mal_url || null,
      theme_songs: input.theme_songs,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/search");
  return { id: data.id };
}

/**
 * Cập nhật anime (creator hoặc admin)
 */
export async function updateAnime(
  animeId: string,
  input: Partial<{
    title: string;
    title_japanese: string | null;
    cover_image: string | null;
    studio: string | null;
    characters_staff: any;
    youtube_trailer_id: string | null;
    homepage_url: string | null;
    mal_url: string | null;
    theme_songs: ThemeSong[];
  }>
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Vui lòng đăng nhập." };
  }

  // Kiểm tra quyền admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    // Kiểm tra quyền creator
    const { data: anime } = await supabase
      .from("anime")
      .select("created_by")
      .eq("id", animeId)
      .single();

    if (!anime || anime.created_by !== user.id) {
      return { error: "Bạn không có quyền sửa anime này." };
    }
  }

  const { error } = await supabase
    .from("anime")
    .update(input)
    .eq("id", animeId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath(`/anime/${animeId}`);
  return { success: true };
}

/**
 * Xóa anime (creator hoặc admin)
 */
export async function deleteAnime(animeId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Vui lòng đăng nhập." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    const { data: anime } = await supabase
      .from("anime")
      .select("created_by")
      .eq("id", animeId)
      .single();

    if (!anime || anime.created_by !== user.id) {
      return { error: "Bạn không có quyền xóa anime này." };
    }
  }

  const { error } = await supabase.from("anime").delete().eq("id", animeId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/search");
  return { success: true };
}