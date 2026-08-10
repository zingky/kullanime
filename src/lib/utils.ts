/**
 * Format ngày giờ
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format thời gian tương đối (vd: "3 phút trước")
 */
export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "vừa xong";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  const years = Math.floor(months / 12);
  return `${years} năm trước`;
}

const amp = "&";
const htmlEntities: Record<string, string> = {
  "&": amp + "amp;",
  "<": amp + "lt;",
  ">": amp + "gt;",
  '"': amp + "quot;",
  "'": amp + "#039;",
};

/**
 * Escape HTML để chống XSS khi hiển thị
 */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Nhận dạng status anime và trả về màu badge tương ứng
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case "Watching":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "Completed":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "Plan to Watch":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "Dropped":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

/**
 * Trích xuất các studio duy nhất từ danh sách anime
 */
export function extractUniqueValues(
  items: Array<{ studio?: string | null }>
): string[] {
  const values = new Set<string>();
  items.forEach((item) => {
    if (item.studio) values.add(item.studio);
  });
  return Array.from(values).sort();
}

/**
 * Trích xuất tên ca sĩ duy nhất từ theme_songs
 */
export function extractArtists(
  items: Array<{ theme_songs: Array<{ artist: string }> | null }>
): string[] {
  const artists = new Set<string>();
  items.forEach((item) => {
    const songs = item.theme_songs || [];
    songs.forEach((song) => {
      if (song.artist) artists.add(song.artist);
    });
  });
  return Array.from(artists).sort();
}

/**
 * Trích xuất tên seiyuu duy nhất từ characters_staff
 */
export function extractSeiyuus(
  items: Array<{
    characters_staff: {
      characters?: Array<{
        voice_actors?: Array<{ name: string }>;
      }>;
    } | null;
  }>
): string[] {
  const seiyuus = new Set<string>();
  items.forEach((item) => {
    const cs = item.characters_staff;
    if (cs?.characters) {
      cs.characters.forEach((char) => {
        char.voice_actors?.forEach((va) => {
          if (va.name) seiyuus.add(va.name);
        });
      });
    }
  });
  return Array.from(seiyuus).sort();
}