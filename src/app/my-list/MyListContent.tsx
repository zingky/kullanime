"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { updateUserListEntry, removeFromUserList } from "@/actions/user-anime-list";

const STATUSES = ["Watching", "Completed", "Plan to Watch", "Dropped"] as const;
const STATUS_COLORS: Record<string, string> = {
  Watching: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Completed: "bg-green-500/20 text-green-300 border-green-500/30",
  "Plan to Watch": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Dropped: "bg-red-500/20 text-red-300 border-red-500/30",
};

type Entry = {
  id: string;
  anime_id: string;
  status: string;
  rating: number | null;
  review_text: string | null;
  created_at: string;
  anime: {
    id: string;
    title: string;
    title_japanese: string | null;
    cover_image: string | null;
    studio: string | null;
  };
};

export default function MyListContent({
  initialEntries,
  username,
}: {
  initialEntries: Entry[];
  username: string;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  async function changeStatus(entryId: string, status: string) {
    setBusyId(entryId);
    const res = await updateUserListEntry(entryId, { status: status as any });
    setBusyId(null);
    if (res?.error) {
      alert(res.error);
      return;
    }
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, status } : e))
    );
    router.refresh();
  }

  async function remove(entryId: string) {
    if (!confirm("Xóa anime này khỏi danh sách?")) return;
    setBusyId(entryId);
    const res = await removeFromUserList(entryId);
    setBusyId(null);
    if (res?.error) {
      alert(res.error);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
        <p className="text-lg text-white">Danh sách trống</p>
        <p className="mt-2 text-sm text-gray-500">
          Bấm "+ Thêm Anime" để bắt đầu xây dựng danh sách của bạn.
        </p>
        <Link
          href={`/u/${username}`}
          className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300"
        >
          Xem trang cá nhân →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => {
        const a = entry.anime;
        return (
          <div
            key={entry.id}
            className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
          >
            <Link href={`/anime/${a.id}`} className="shrink-0">
              {a.cover_image ? (
                <Image
                  src={a.cover_image}
                  alt={a.title}
                  width={75}
                  height={106}
                  className="rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-[106px] w-[75px] items-center justify-center rounded-lg bg-white/10 text-gray-400">
                  ?
                </div>
              )}
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                href={`/anime/${a.id}`}
                className="line-clamp-2 font-medium text-white hover:text-indigo-300"
              >
                {a.title}
              </Link>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {a.studio || "—"}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[entry.status]}`}
                >
                  {entry.status}
                </span>
                {entry.rating ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                    ★ {entry.rating}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <select
                  value={entry.status}
                  disabled={busyId === entry.id}
                  onChange={(e) => changeStatus(entry.id, e.target.value)}
                  className="rounded-xl border border-white/10 bg-gray-900 px-2 py-1 text-xs text-white outline-none focus:border-indigo-400"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => remove(entry.id)}
                  disabled={busyId === entry.id}
                  className="rounded-xl border border-red-500/30 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}