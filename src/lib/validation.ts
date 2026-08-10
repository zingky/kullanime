import { z } from "zod";

// ==================== AUTH ====================
export const registerSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
  username: z
    .string()
    .min(3, "Username phải có ít nhất 3 ký tự")
    .max(30, "Username tối đa 30 ký tự")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username chỉ chứa chữ cái, số và dấu gạch dưới"
    ),
});

export const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Mật khẩu không được trống"),
});

// ==================== ANIME ====================
export const animeCreateSchema = z.object({
  mal_id: z.number().int().nullable().optional(),
  title: z.string().min(1, "Tên anime không được trống").max(500),
  title_japanese: z.string().max(500).nullable().optional(),
  cover_image: z.string().url("URL ảnh không hợp lệ").nullable().optional(),
  studio: z.string().max(200).nullable().optional(),
  characters_staff: z.any().nullable().optional(),
  youtube_trailer_id: z.string().max(100).nullable().optional(),
  homepage_url: z.string().url("URL không hợp lệ").nullable().optional(),
  mal_url: z.string().url("URL không hợp lệ").nullable().optional(),
  theme_songs: z
    .array(
      z.object({
        type: z.enum(["OP", "ED", "Insert"]),
        title: z.string().min(1),
        artist: z.string().min(1),
        episodes: z.string().optional(),
      })
    )
    .default([]),
});

// ==================== USER ANIME LIST ====================
export const userAnimeListSchema = z.object({
  anime_id: z.string().uuid("ID anime không hợp lệ"),
  status: z.enum(["Watching", "Completed", "Plan to Watch", "Dropped"]),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  review_text: z.string().max(5000).nullable().optional(),
  personal_photos: z.array(z.string().url("URL ảnh không hợp lệ")).optional(),
});

// ==================== COMMENTS ====================
export const commentSchema = z
  .object({
    anime_id: z.string().uuid("ID anime không hợp lệ"),
    content: z
      .string()
      .min(1, "Bình luận không được trống")
      .max(2000, "Bình luận quá dài (tối đa 2000 ký tự)"),
    is_anonymous: z.boolean().default(false),
    guest_name: z
      .string()
      .max(50, "Tên khách tối đa 50 ký tự")
      .regex(
        /^[a-zA-Z0-9_\u00C0-\u1EF9 ]+$/,
        "Tên không chứa ký tự đặc biệt"
      )
      .nullable()
      .optional(),
  })
  .refine((data) => data.is_anonymous || data.guest_name, {
    message: "Vui lòng nhập tên khách hoặc chọn ẩn danh",
    path: ["guest_name"],
  });

// ==================== BAD WORDS ====================
export const badWordSchema = z.object({
  word: z.string().min(1, "Từ cấm không được trống").max(100),
});

// ==================== UTILS ====================
/**
 * Lọc từ cấm trong nội dung, thay bằng ***
 */
export function filterBadWords(
  content: string,
  badWords: string[]
): { filtered: string; hasBadWord: boolean } {
  let filtered = content;
  let hasBadWord = false;

  for (const word of badWords) {
    if (!word) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    if (regex.test(filtered)) {
      hasBadWord = true;
      filtered = filtered.replace(regex, "***");
    }
  }

  return { filtered, hasBadWord };
}

/**
 * Kiểm tra XSS bằng cách loại bỏ các thẻ script
 */
export function sanitizeContent(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "");
}

/**
 * Rate limiting đơn giản dựa trên localStorage (client-side)
 * Cho phép tối đa N bình luận trong X phút
 */
export function checkClientRateLimit(
  key: string,
  max: number,
  minutes: number
): boolean {
  if (typeof window === "undefined") return true;

  const now = Date.now();
  const windowMs = minutes * 60 * 1000;
  const raw = localStorage.getItem(key);

  if (!raw) {
    localStorage.setItem(key, JSON.stringify([now]));
    return true;
  }

  try {
    const timestamps: number[] = JSON.parse(raw);
    const recent = timestamps.filter((ts) => now - ts < windowMs);

    if (recent.length >= max) {
      return false;
    }

    recent.push(now);
    localStorage.setItem(key, JSON.stringify(recent));
    return true;
  } catch {
    localStorage.setItem(key, JSON.stringify([now]));
    return true;
  }
}