"use server";

import { createClient } from "@/lib/supabase/server";
import { badWordSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

/**
 * Kiểm tra user có phải admin
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Vui lòng đăng nhập." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Bạn không có quyền quản trị." };
  }

  return { user };
}

/**
 * Thêm từ cấm
 */
export async function addBadWord(word: string) {
  const check = await requireAdmin();
  if (check.error) return { error: check.error };

  const parsed = badWordSchema.safeParse({ word });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || "Từ cấm không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bad_words")
    .insert({ word: word.trim().toLowerCase() });

  if (error) {
    if (error.code === "23505") return { error: "Từ cấm này đã tồn tại." };
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Xóa từ cấm
 */
export async function removeBadWord(wordId: string) {
  const check = await requireAdmin();
  if (check.error) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("bad_words").delete().eq("id", wordId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Ban/Unban user (chuyển role thành 'banned' hoặc 'user')
 */
export async function setUserRole(userId: string, role: "banned" | "user") {
  const check = await requireAdmin();
  if (check.error) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Xóa bình luận (admin)
 */
export async function adminDeleteComment(commentId: string) {
  const check = await requireAdmin();
  if (check.error) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Xóa anime (admin)
 */
export async function adminDeleteAnime(animeId: string) {
  const check = await requireAdmin();
  if (check.error) return { error: check.error };

  const supabase = await createClient();
  // Xóa comments, user_anime_list liên quan trước
  await supabase.from("comments").delete().eq("anime_id", animeId);
  await supabase.from("user_anime_list").delete().eq("anime_id", animeId);

  const { error } = await supabase.from("anime").delete().eq("id", animeId);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Export dữ liệu (JSON/CSV)
 */
export async function exportData(format: "json" | "csv") {
  const check = await requireAdmin();
  if (check.error) return { error: check.error };

  const supabase = await createClient();

  const [anime, comments, userAnimeList] = await Promise.all([
    supabase.from("anime").select("*"),
    supabase.from("comments").select("*, profiles(username)"),
    supabase.from("user_anime_list").select("*, anime(title), profiles(username)"),
  ]);

  const data = {
    exported_at: new Date().toISOString(),
    anime: anime.data || [],
    comments: comments.data || [],
    user_anime_list: userAnimeList.data || [],
  };

  if (format === "csv") {
    // Tạo CSV cho từng bảng
    const toCsv = (rows: any[]) => {
      if (!rows.length) return "";
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((h) => {
              const val = row[h];
              if (val === null || val === undefined) return "";
              if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
              return `"${String(val).replace(/"/g, '""')}"`;
            })
            .join(",")
        ),
      ].join("\n");
      return csv;
    };

    return {
      success: true,
      data: {
        anime_csv: toCsv(data.anime),
        comments_csv: toCsv(data.comments),
        user_anime_list_csv: toCsv(data.user_anime_list),
      },
    };
  }

  return { success: true, data };
}