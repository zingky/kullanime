"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { searchJikanAnime, fetchJikanAnimeFull, fetchJikanAnimeThemes } from "@/lib/jikan";
import { uploadToCloudinary, parseImageUrls } from "@/lib/cloudinary";
import { createAnime } from "@/actions/anime";
import type { JikanAnimeSearchResult, ThemeSong } from "@/types";

interface AddAnimeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (animeId: string) => void;
}

export default function AddAnimeModal({ open, onClose, onSuccess }: AddAnimeModalProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<JikanAnimeSearchResult[]>([]);
  const [dbResults, setDbResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [themeSongs, setThemeSongs] = useState<ThemeSong[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({
    title: "",
    title_japanese: "",
    cover_image: "",
    studio: "",
    youtube_trailer_id: "",
    theme_songs_text: "",
  });
  const [status, setStatus] = useState<"Watching" | "Completed" | "Plan to Watch" | "Dropped">("Watching");
  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      if (!value.trim() || value.trim().length < 3) {
        setSearchResults([]);
        setDbResults([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        // 1. Tìm trong DB
        const { data: dbData } = await supabase
          .from("anime")
          .select("id, title, title_japanese, cover_image, studio, mal_id")
          .ilike("title", `%${value.trim()}%`)
          .limit(5);

        setDbResults(dbData || []);

        // 2. Tìm trên Jikan API
        const jikanResults = await searchJikanAnime(value.trim());
        setSearchResults(jikanResults);
      } catch (err) {
        setError("Không thể tìm kiếm. Vui lòng thử lại.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSelectJikan = async (result: JikanAnimeSearchResult) => {
    setLoading(true);
    setError(null);
    try {
      // Lấy thông tin đầy đủ + themes
      const full = await fetchJikanAnimeFull(result.mal_id);
      const themes = await fetchJikanAnimeThemes(result.mal_id);

      const songs: ThemeSong[] = [];
      themes.opening.forEach((op) => {
        const parts = op.split(" by ");
        songs.push({
          type: "OP",
          title: parts[0]?.trim() || op,
          artist: parts[1]?.trim() || "Unknown",
        });
      });
      themes.ending.forEach((ed) => {
        const parts = ed.split(" by ");
        songs.push({
          type: "ED",
          title: parts[0]?.trim() || ed,
          artist: parts[1]?.trim() || "Unknown",
        });
      });

      setThemeSongs(songs);
      setSelected({
        mal_id: full.mal_id,
        title: full.title,
        title_japanese: full.title_japanese || null,
        cover_image: full.images.jpg.large_image_url,
        studio: full.studios[0]?.name || null,
        youtube_trailer_id: full.trailer?.youtube_id || null,
        homepage_url: full.homepage,
        mal_url: full.url,
        characters_staff: full.characters_staff?.data
          ? {
              characters: full.characters_staff.data.map((c) => ({
                id: c.character.mal_id,
                name: c.character.name,
                role: c.role,
                image: c.character.images.jpg.image_url,
                voice_actors: c.voice_actors
                  .filter((va) => va.language === "Japanese")
                  .map((va) => ({
                    id: va.person.mal_id,
                    name: va.person.name,
                    language: va.language,
                  })),
              })),
            }
          : null,
      });
    } catch (err) {
      setError("Không thể tải thông tin anime từ MyAnimeList.");
    } finally {
      setLoading(false);
    }
  };

  const handlePastePhotos = (raw: string) => {
    const urls = parseImageUrls(raw);
    if (urls.length > 0) {
      setPhotos((prev) => [...prev, ...urls]);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhotos(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const url = await uploadToCloudinary(files[i]);
        urls.push(url);
      }
      setPhotos((prev) => [...prev, ...urls]);
    } catch (err) {
      setError("Không thể upload ảnh. Vui lòng thử lại.");
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected && !manualMode) return;
    setSubmitting(true);
    setError(null);

    try {
      let animeId: string;

      if (manualMode) {
        // Tự nhập thủ công
        const parsedSongs: ThemeSong[] = manual.theme_songs_text
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => {
            const match = line.match(/^(OP|ED|Insert)\s*[:|-]\s*(.+?)\s*[|,-]\s*(.+)$/i);
            if (match) {
              return { type: match[1].toUpperCase() as ThemeSong["type"], title: match[2].trim(), artist: match[3].trim() };
            }
            return { type: "Insert" as ThemeSong["type"], title: line.trim(), artist: "Unknown" };
          });

        const result = await createAnime({
          title: manual.title,
          title_japanese: manual.title_japanese || null,
          cover_image: manual.cover_image || null,
          studio: manual.studio || null,
          youtube_trailer_id: manual.youtube_trailer_id || null,
          theme_songs: parsedSongs.length > 0 ? parsedSongs : themeSongs,
        });

        if (result.error) {
          setError(result.error);
          setSubmitting(false);
          return;
        }
        animeId = result.id!;
      } else if (selected) {
        const result = await createAnime({
          mal_id: selected.mal_id,
          title: selected.title,
          title_japanese: selected.title_japanese,
          cover_image: selected.cover_image,
          studio: selected.studio,
          characters_staff: selected.characters_staff,
          youtube_trailer_id: selected.youtube_trailer_id,
          homepage_url: selected.homepage_url,
          mal_url: selected.mal_url,
          theme_songs: themeSongs,
        });

        if (result.error) {
          setError(result.error);
          setSubmitting(false);
          return;
        }
        animeId = result.id!;
      } else {
        setSubmitting(false);
        return;
      }

      // Thêm vào danh sách cá nhân với album ảnh (cover là ảnh đầu tiên)
      const allPhotos = [
        selected?.cover_image || manual.cover_image || "",
        ...photos,
      ].filter(Boolean);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error: listError } = await supabase.from("user_anime_list").insert({
          user_id: user.id,
          anime_id: animeId,
          status,
          rating: rating || null,
          review_text: review || null,
          personal_photos: allPhotos.length > 0 ? allPhotos : null,
        });

        if (listError) {
          setError("Anime đã thêm nhưng không thể lưu danh sách cá nhân.");
        }
      }

      onSuccess(animeId);
      onClose();
      resetForm();
    } catch (err) {
      setError("Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setQuery("");
    setSearchResults([]);
    setDbResults([]);
    setSelected(null);
    setThemeSongs([]);
    setManualMode(false);
    setManual({ title: "", title_japanese: "", cover_image: "", studio: "", youtube_trailer_id: "", theme_songs_text: "" });
    setStatus("Watching");
    setRating(0);
    setReview("");
    setPhotos([]);
    setError(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-dark-950/80 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-700 p-4">
          <h2 className="text-lg font-bold text-white">Thêm Anime</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-dark-700 hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {!selected && !manualMode && (
            <>
              {/* Search */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Nhập tên Anime hoặc dán link MyAnimeList
                </label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="VD: One Piece, Attack on Titan, hoặc https://myanimelist.net/anime/16498..."
                  className="input-field"
                />
              </div>

              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                </div>
              )}

              {/* DB Results */}
              {dbResults.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-400">
                    Có trong cộng đồng:
                  </h3>
                  <div className="space-y-2">
                    {dbResults.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onSuccess(item.id)}
                        className="flex w-full items-center gap-3 rounded-lg border border-dark-700 bg-dark-800/50 p-2 text-left transition-colors hover:border-primary-500/50"
                      >
                        {item.cover_image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.cover_image} alt="" className="h-16 w-12 rounded object-cover" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-100">{item.title}</p>
                          <p className="text-xs text-gray-500">{item.studio || "Unknown"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Jikan Results */}
              {searchResults.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-400">
                    Kết quả từ MyAnimeList:
                  </h3>
                  <div className="space-y-2">
                    {searchResults.map((item) => (
                      <button
                        key={item.mal_id}
                        onClick={() => handleSelectJikan(item)}
                        className="flex w-full items-center gap-3 rounded-lg border border-dark-700 bg-dark-800/50 p-2 text-left transition-colors hover:border-primary-500/50"
                      >
                        {item.images.jpg.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.images.jpg.image_url} alt="" className="h-16 w-12 rounded object-cover" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-100">{item.title}</p>
                          <p className="text-xs text-gray-500">
                            {item.title_japanese} • {item.studios[0]?.name || "Unknown"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setManualMode(true)}
                className="w-full rounded-lg border border-dashed border-dark-600 py-3 text-sm text-gray-500 transition-colors hover:border-primary-500/50 hover:text-primary-400"
              >
                Tự nhập thủ công (không có trên MyAnimeList)
              </button>
            </>
          )}

          {/* Selected/Manual Form */}
          {(selected || manualMode) && (
            <>
              {manualMode ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={manual.title}
                    onChange={(e) => setManual({ ...manual, title: e.target.value })}
                    placeholder="Tên anime *"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={manual.title_japanese}
                    onChange={(e) => setManual({ ...manual, title_japanese: e.target.value })}
                    placeholder="Tên tiếng Nhật"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={manual.cover_image}
                    onChange={(e) => setManual({ ...manual, cover_image: e.target.value })}
                    placeholder="URL ảnh bìa"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={manual.studio}
                    onChange={(e) => setManual({ ...manual, studio: e.target.value })}
                    placeholder="Studio"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={manual.youtube_trailer_id}
                    onChange={(e) => setManual({ ...manual, youtube_trailer_id: e.target.value })}
                    placeholder="YouTube Trailer ID"
                    className="input-field"
                  />
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">
                      Nhạc phim (mỗi dòng: OP/ED/Insert - Tên bài - Ca sĩ)
                    </label>
                    <textarea
                      value={manual.theme_songs_text}
                      onChange={(e) => setManual({ ...manual, theme_songs_text: e.target.value })}
                      placeholder={"OP - Guren no Yumiya - Linked Horizon\nED - Utsukushiki Zankoku na Sekai - Yoko Hikasa"}
                      className="input-field min-h-[100px] resize-y"
                    />
                  </div>
                </div>
              ) : (
                selected && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      {selected.cover_image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selected.cover_image} alt={selected.title} className="h-28 w-20 rounded-lg object-cover" />
                      )}
                      <div>
                        <h3 className="text-base font-semibold text-white">{selected.title}</h3>
                        {selected.title_japanese && (
                          <p className="text-sm text-gray-500">{selected.title_japanese}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">Studio: {selected.studio || "Unknown"}</p>
                      </div>
                    </div>

                    {/* Theme songs */}
                    {themeSongs.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-gray-400">
                          Nhạc phim (tự động thu thập):
                        </h4>
                        <div className="space-y-1">
                          {themeSongs.map((song, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className="w-10 shrink-0 rounded bg-dark-700 px-1.5 py-0.5 text-center text-xs font-bold text-gray-300">
                                {song.type}
                              </span>
                              <span className="truncate text-gray-300">{song.title}</span>
                              <span className="truncate text-xs text-gray-500">{song.artist}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* User list info */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Trạng thái</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="input-field"
                  >
                    <option value="Watching">Đang xem</option>
                    <option value="Completed">Đã xem</option>
                    <option value="Plan to Watch">Muốn xem</option>
                    <option value="Dropped">Bỏ xem</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Đánh giá (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={rating || ""}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="input-field"
                    placeholder="Chưa đánh giá"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Cảm nghĩ của bạn</label>
                <textarea
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  className="input-field min-h-[80px] resize-y"
                  placeholder="Chia sẻ cảm nhận của bạn về bộ anime này..."
                  maxLength={5000}
                />
              </div>

              {/* Album ảnh */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Album ảnh (Ảnh bìa sẽ tự động là ảnh đầu tiên)
                </label>
                <div className="flex flex-wrap gap-2">
                  {(selected?.cover_image || manual.cover_image) && (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selected?.cover_image || manual.cover_image}
                        alt="Cover"
                        className="h-20 w-14 rounded object-cover ring-2 ring-primary-500"
                      />
                      <span className="absolute -left-1 -top-1 rounded bg-primary-500 px-1 text-xs font-bold text-white">
                        Cover
                      </span>
                    </div>
                  )}
                  {photos.map((photo, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt="" className="h-20 w-14 rounded object-cover" />
                      <button
                        onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                        className="absolute -right-1 -top-1 rounded-full bg-red-600 p-0.5 text-white"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-2 space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileUpload(e.target.files)}
                    disabled={uploadingPhotos}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-700"
                  />
                  <input
                    type="text"
                    placeholder="Dán link ảnh (ngăn cách bằng dấu phẩy hoặc xuống dòng)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handlePastePhotos((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setManualMode(false);
                  }}
                  className="btn-secondary flex-1"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || (manualMode && !manual.title.trim())}
                  className="btn-primary flex-1"
                >
                  {submitting ? "Đang lưu..." : "Lưu vào danh sách"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}