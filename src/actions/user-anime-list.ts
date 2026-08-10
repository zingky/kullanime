"use server";

import { createClient } from "@/lib/supabase/server";
import { userAnimeListSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

/**
 * Thêm anime vào danh sách cá nhân
 */
export async function addToUserList(input: {
  anime_id: string;
  status: "Watching" | "Completed" | "Plan to Watch" | "Dropped";
  rating?: number | null;
  review_text?: string | null;
  personal_photos?: string[];
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Vui lòng đăng nhập." };
  }

  const parsed = userAnimeListSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ",
    };
  }

  // Kiểm tra đã có trong danh sách chưa
  const { data: existing } = await supabase
    .from("user_anime_list")
    .select("id")
    .eq("user_id", user.id)
    .eq("anime_id", input.anime_id)
    .maybeSingle();

  if (existing) {
    // Cập nhật
    const { error } = await supabase
      .from("user_anime_list")
      .update({
        status: input.status,
        rating: input.rating || null,
        review_text: input.review_text || null,
        personal_photos: input.personal_photos || null,
      })
      .eq("id", existing.id);

    if (error) {
      return { error: error.message };
    }
  } else {
    // Thêm mới
    const { error } = await supabase.from("user_anime_list").insert({
      user_id: user.id,
      anime_id: input.anime_id,
      status: input.status,
      rating: input.rating || null,
      review_text: input.review_text || null,
      personal_photos: input.personal_photos || null,
    });

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/");
  revalidatePath(`/anime/${input.anime_id}`);
  revalidatePath(`/u/${user.user_metadata?.username || ""}`);
  return { success: true };
}

/**
 * Cập nhật anime trong danh sách cá nhân
 */
export async function updateUserListEntry(
  entryId: string,
  input: {
    status?: "Watching" | "Completed" | "Plan to Watch" | "Dropped";
    rating?: number | null;
    review_text?: string | null;
    personal_photos?: string[];
  }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Vui lòng đăng nhập." };
  }

  const { error } = await supabase
    .from("user_anime_list")
    .update(input)
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath(`/u/${user.user_metadata?.username || ""}`);
  return { success: true };
}

/**
 * Xóa anime khỏi danh sách cá nhân
 */
export async function removeFromUserList(entryId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Vui lòng đăng nhập." };
  }

  const { error } = await supabase
    .from("user_anime_list")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}