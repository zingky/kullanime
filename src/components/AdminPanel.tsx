"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addBadWord,
  removeBadWord,
  setUserRole,
  adminDeleteComment,
  adminDeleteAnime,
  exportData,
} from "@/actions/admin";
import { formatDate } from "@/lib/utils";

interface AdminPanelProps {
  anime: any[];
  comments: any[];
  users: any[];
  badWords: any[];
}

type TabType = "anime" | "comments" | "users" | "badwords" | "backup";

export default function AdminPanel({
  anime,
  comments,
  users,
  badWords,
}: AdminPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("anime");
  const [newBadWord, setNewBadWord] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleError = (err: any) => {
    setMessage({ type: "error", text: err?.error || "Có lỗi xảy ra." });
  };

  const tabButton = (tab: TabType, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        activeTab === tab
          ? "bg-dark-700 text-white"
          : "text-gray-400 hover:bg-dark-800 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  const handleExport = async (format: "json" | "csv") => {
    setExporting(true);
    setMessage(null);
    try {
      const result = await exportData(format);

      if (result.error) {
        handleError(result);
        return;
      }

      if (format === "json" && result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kullanime-backup-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === "csv" && result.data) {
        const csvData = result.data as {
          anime_csv: string;
          comments_csv: string;
          user_anime_list_csv: string;
        };
        const { anime_csv, comments_csv, user_anime_list_csv } = csvData;
        const blob = new Blob([anime_csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kullanime-anime-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        const blob2 = new Blob([comments_csv], { type: "text/csv" });
        const url2 = URL.createObjectURL(blob2);
        const a2 = document.createElement("a");
        a2.href = url2;
        a2.download = `kullanime-comments-${new Date().toISOString().split("T")[0]}.csv`;
        a2.click();
        URL.revokeObjectURL(url2);
        const blob3 = new Blob([user_anime_list_csv], { type: "text/csv" });
        const url3 = URL.createObjectURL(blob3);
        const a3 = document.createElement("a");
        a3.href = url3;
        a3.download = `kullanime-user-anime-list-${new Date().toISOString().split("T")[0]}.csv`;
        a3.click();
        URL.revokeObjectURL(url3);
      }

      setMessage({ type: "success", text: "Export thành công!" });
    } catch {
      setMessage({ type: "error", text: "Export thất bại." });
    } finally {
      setExporting(false);
    }
  };

  const handleAddBadWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBadWord.trim()) return;
    setMessage(null);
    const result = await addBadWord(newBadWord);
    if (result.error) {
      handleError(result);
    } else {
      setNewBadWord("");
      setMessage({ type: "success", text: "Đã thêm từ cấm." });
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-dark-700 pb-2">
        {tabButton("anime", `Anime (${anime.length})`)}
        {tabButton("comments", `Bình luận (${comments.length})`)}
        {tabButton("users", `Users (${users.length})`)}
        {tabButton("badwords", `Từ cấm (${badWords.length})`)}
        {tabButton("backup", "Sao lưu")}
      </div>

      {/* Anime tab */}
      {activeTab === "anime" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dark-700 text-gray-400">
              <tr>
                <th className="px-4 py-3">Tên</th>
                <th className="px-4 py-3">Studio</th>
                <th className="px-4 py-3">Người tạo</th>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {anime.map((item) => (
                <tr key={item.id} className="border-b border-dark-800/50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/anime/${item.id}`)}
                      className="font-medium text-gray-200 hover:text-primary-400"
                    >
                      {item.title}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{item.studio || "-"}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {item.profiles?.username || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        const result = await adminDeleteAnime(item.id);
                        if (result.error) handleError(result);
                        else {
                          setMessage({ type: "success", text: "Đã xóa anime." });
                          router.refresh();
                        }
                      }}
                      className="rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Comments tab */}
      {activeTab === "comments" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dark-700 text-gray-400">
              <tr>
                <th className="px-4 py-3">Người dùng</th>
                <th className="px-4 py-3">Nội dung</th>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((comment) => (
                <tr key={comment.id} className="border-b border-dark-800/50">
                  <td className="px-4 py-3 font-medium text-gray-200">
                    {comment.is_anonymous
                      ? "Ẩn danh"
                      : comment.profiles?.username || comment.guest_name || "Khách"}
                  </td>
                  <td className="max-w-[300px] px-4 py-3 text-gray-400">
                    <p className="truncate">{comment.content}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(comment.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        const result = await adminDeleteComment(comment.id);
                        if (result.error) handleError(result);
                        else {
                          setMessage({ type: "success", text: "Đã xóa bình luận." });
                          router.refresh();
                        }
                      }}
                      className="rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Users tab */}
      {activeTab === "users" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dark-700 text-gray-400">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-dark-800/50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/u/${user.username}`)}
                      className="font-medium text-gray-200 hover:text-primary-400"
                    >
                      {user.username}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        user.role === "admin"
                          ? "bg-primary-500/20 text-primary-400"
                          : user.role === "banned"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-dark-700 text-gray-300"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {user.role === "admin" ? (
                      <span className="text-xs text-gray-600">Không thể thay đổi</span>
                    ) : (
                      <button
                        onClick={async () => {
                          const result = await setUserRole(
                            user.id,
                            user.role === "banned" ? "user" : "banned"
                          );
                          if (result.error) handleError(result);
                          else {
                            setMessage({
                              type: "success",
                              text:
                                user.role === "banned"
                                  ? "Đã bỏ ban user."
                                  : "Đã ban user.",
                            });
                            router.refresh();
                          }
                        }}
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          user.role === "banned"
                            ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        }`}
                      >
                        {user.role === "banned" ? "Bỏ ban" : "Ban"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bad words tab */}
      {activeTab === "badwords" && (
        <div className="space-y-4">
          <form onSubmit={handleAddBadWord} className="flex gap-2">
            <input
              type="text"
              value={newBadWord}
              onChange={(e) => setNewBadWord(e.target.value)}
              placeholder="Nhập từ cấm mới..."
              className="input-field flex-1"
            />
            <button type="submit" className="btn-primary">
              Thêm
            </button>
          </form>

          <div className="card">
            <div className="flex flex-wrap gap-2 p-4">
              {badWords.map((word) => (
                <span
                  key={word.id}
                  className="flex items-center gap-2 rounded-lg bg-dark-700 px-3 py-1.5 text-sm text-gray-300"
                >
                  {word.word}
                  <button
                    onClick={async () => {
                      const result = await removeBadWord(word.id);
                      if (result.error) handleError(result);
                      else router.refresh();
                    }}
                    className="text-gray-500 transition-colors hover:text-red-400"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              {badWords.length === 0 && (
                <p className="text-sm text-gray-500">Chưa có từ cấm nào.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Backup tab */}
      {activeTab === "backup" && (
        <div className="card space-y-4 p-6">
          <h2 className="text-lg font-bold text-white">Sao lưu Dữ liệu</h2>
          <p className="text-sm text-gray-500">
            Tải về toàn bộ dữ liệu của các bảng anime, comments, user_anime_list.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleExport("json")}
              disabled={exporting}
              className="btn-primary"
            >
              {exporting ? "Đang xuất..." : "📦 Export JSON"}
            </button>
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting}
              className="btn-secondary"
            >
              {exporting ? "Đang xuất..." : "📊 Export CSV"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}