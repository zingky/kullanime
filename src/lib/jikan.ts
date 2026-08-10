import type {
  JikanAnimeSearchResult,
  JikanAnimeFull,
  JikanTheme,
} from "@/types";

const BASE_URL = "https://api.jikan.moe/v4";
const RATE_LIMIT_DELAY = 350; // Jikan API: 3 requests/second

/**
 * Chờ giữa các request để tránh rate limit của Jikan API
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tìm kiếm anime theo tên trên Jikan API
 */
export async function searchJikanAnime(
  query: string
): Promise<JikanAnimeSearchResult[]> {
  const res = await fetch(
    `${BASE_URL}/anime?q=${encodeURIComponent(query)}&limit=8&sfw=true`,
    { next: { revalidate: 3600 } }
  );

  if (!res.ok) {
    if (res.status === 429) {
      await delay(RATE_LIMIT_DELAY * 2);
      return searchJikanAnime(query);
    }
    throw new Error(`Jikan API error: ${res.status}`);
  }

  const data = await res.json();
  return (data.data || []) as JikanAnimeSearchResult[];
}

/**
 * Lấy thông tin đầy đủ của anime theo MAL ID
 */
export async function fetchJikanAnimeFull(
  malId: number
): Promise<JikanAnimeFull> {
  await delay(RATE_LIMIT_DELAY);

  const res = await fetch(`${BASE_URL}/anime/${malId}/full`, {
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    if (res.status === 429) {
      await delay(RATE_LIMIT_DELAY * 2);
      return fetchJikanAnimeFull(malId);
    }
    throw new Error(`Jikan API error: ${res.status}`);
  }

  const data = await res.json();
  return data.data as JikanAnimeFull;
}

/**
 * Lấy danh sách nhạc phim (OP/ED) theo MAL ID
 */
export async function fetchJikanAnimeThemes(
  malId: number
): Promise<JikanTheme> {
  await delay(RATE_LIMIT_DELAY);

  const res = await fetch(`${BASE_URL}/anime/${malId}/themes`, {
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    if (res.status === 429) {
      await delay(RATE_LIMIT_DELAY * 2);
      return fetchJikanAnimeThemes(malId);
    }
    throw new Error(`Jikan API error: ${res.status}`);
  }

  const data = await res.json();
  const themes = data.data || {};

  return {
    opening: themes.opening || [],
    ending: themes.ending || [],
  } as JikanTheme;
}

/**
 * Phân tích URL MyAnimeList để trích xuất MAL ID
 * VD: https://myanimelist.net/anime/16498/Attack_on_Titan -> 16498
 */
export function extractMalIdFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url.trim());
    if (!parsed.hostname.includes("myanimelist.net")) {
      return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    // /anime/{id}/...
    const animeIndex = parts.findIndex((p) => p === "anime");
    if (animeIndex !== -1 && parts[animeIndex + 1]) {
      const id = parseInt(parts[animeIndex + 1], 10);
      if (!isNaN(id)) return id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Kiểm tra query có phải là URL MyAnimeList hay không
 */
export function isMalUrl(query: string): boolean {
  return /myanimelist\.net\/anime\//i.test(query);
}