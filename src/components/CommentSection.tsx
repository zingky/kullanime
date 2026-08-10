"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Comment as CommentType, Profile } from "@/types";
import { timeAgo } from "@/lib/utils";
import { filterBadWords, sanitizeContent, checkClientRateLimit } from "@/lib/validation";

interface CommentSectionProps {
  animeId: string;
}

export default function CommentSection({ animeId }: CommentSectionProps) {
  const [comments, setComments] = useState<CommentType[]>([]);
  const [user, setUser] = useState<Profile | null>(null);
  const [content, setContent] = useState("");
  const [guestName, setGuestName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [badWords, setBadWords] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const fetchData = async () => {
      // Fetch comments
      const { data: commentsData } = await supabase
        .from("comments")
        .select("*, profiles(username, avatar_url, role)")
        .eq("anime_id", animeId)
        .order("created_at", { ascending: false });

      if (isMounted && commentsData) {
        setComments(commentsData as CommentType[]);
      }

      // Fetch bad words
      const { data: badWordsData } = await supabase
        .from("bad_words")
        .select("word");

      if (isMounted && badWordsData) {
        setBadWords(badWordsData.map((bw) => bw.word as string));
      }

      // Fetch current user
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (isMounted && authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .single();
        if (profile) {
          setUser(profile as Profile);
          setIsAdmin(profile.role === "admin");
        }
      }
    };

    fetchData();

    // Subscribe to new comments
    const channel = supabase
      .channel("comments-channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `anime_id=eq.${animeId}`,
        },
        async (payload) => {
          const newComment = payload.new as CommentType;
          // Fetch profile data for the new comment
          if (newComment.user_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("username, avatar_url, role")
              .eq("id", newComment.user_id)
              .single();
            if (profile && isMounted) {
              newComment.profiles = profile as Profile;
            }
          }
          if (isMounted) {
            setComments((prev) => [newComment, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [animeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Rate limiting: max 2 comments/minute for guests
    if (!user) {
      const allowed = checkClientRateLimit(
        "rate_limit_guest_comments",
        2,
        1
      );
      if (!allowed) {
        setError(
          "Bạn đã gửi quá nhiều bình luận. Vui lòng đợi 1 phút và thử lại."
        );
        return;
      }
    }

    // Validate content
    if (!content.trim()) {
      setError("Vui lòng nhập nội dung bình luận.");
      return;
    }

    // Filter bad words
    const { filtered, hasBadWord } = filterBadWords(content, badWords);
    if (hasBadWord) {
      setContent(filtered);
    }

    // Validate guest name
    if (!user && !isAnonymous && !guestName.trim()) {
      setError("Vui lòng nhập tên của bạn hoặc chọn ẩn danh.");
      return;
    }

    const sanitized = sanitizeContent(filtered);

    const supabase = createClient();
    setSubmitting(true);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      const commentData: {
        anime_id: string;
        content: string;
        is_anonymous: boolean;
        user_id: string | null;
        guest_name: string | null;
      } = {
        anime_id: animeId,
        content: sanitized,
        is_anonymous: false,
        user_id: null,
        guest_name: null,
      };

      if (authUser) {
        commentData.user_id = authUser.id;
        commentData.is_anonymous = isAnonymous;
      } else {
        commentData.guest_name = isAnonymous ? null : guestName.trim() || null;
      }

      const { data, error: insertError } = await supabase
        .from("comments")
        .insert(commentData)
        .select("*, profiles(username, avatar_url, role)")
        .single();

      if (insertError) {
        throw insertError;
      }

      if (data) {
        setComments((prev) => [data as CommentType, ...prev]);
      }

      setContent("");
      setGuestName("");
      setIsAnonymous(false);
    } catch (err) {
      setError("Không thể gửi bình luận. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!user) return;
    if (!isAdmin && !comments.find((c) => c.id === commentId)?.user_id?.includes(user.id)) {
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">
        Bình luận ({comments.length})
      </h2>

      {/* Form bình luận */}
      <form onSubmit={handleSubmit} className="card space-y-3 p-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {!user && !isAnonymous && (
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Tên của bạn (hoặc chọn ẩn danh)"
            className="input-field"
            maxLength={50}
          />
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            user
              ? "Chia sẻ cảm nghĩ của bạn về bộ anime này..."
              : "Bình luận với tư cách khách..."
          }
          className="input-field min-h-[100px] resize-y"
          maxLength={2000}
        />

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="h-4 w-4 rounded border-dark-600 bg-dark-800 accent-primary-600"
            />
            Bình luận ẩn danh
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? "Đang gửi..." : "Gửi bình luận"}
          </button>
        </div>
      </form>

      {/* Danh sách bình luận */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-gray-500">
              Chưa có bình luận nào. Hãy là người đầu tiên!
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const displayName = comment.is_anonymous
              ? "Ẩn danh"
              : comment.profiles?.username || comment.guest_name || "Khách";
            const isOwner = user && (comment.user_id === user.id || isAdmin);

            return (
              <div
                key={comment.id}
                className="card p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {!comment.is_anonymous && comment.profiles?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={comment.profiles.avatar_url}
                        alt={displayName}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-dark-700 text-sm font-bold text-gray-300">
                        {displayName[0]?.toUpperCase() || "?"}
                      </span>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-100">
                        {displayName}
                        {comment.profiles?.role === "admin" && (
                          <span className="ml-1 rounded bg-primary-500/20 px-1.5 py-0.5 text-xs font-semibold text-primary-400">
                            Admin
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {timeAgo(comment.created_at)}
                      </p>
                    </div>
                  </div>

                  {isOwner && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs text-gray-600 transition-colors hover:text-red-400"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                  {comment.content}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}