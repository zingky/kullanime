"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminPanel from "@/components/AdminPanel";

export default function DashboardPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    anime: any[];
    comments: any[];
    users: any[];
    badWords: any[];
  }>({ anime: [], comments: [], users: [], badWords: [] });

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const [animeRes, commentsRes, usersRes, badWordsRes] = await Promise.all([
      supabase
        .from("anime")
        .select("*, profiles(username, avatar_url, role)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("comments")
        .select("*, profiles(username, avatar_url, role)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("bad_words").select("*").order("word", { ascending: true }),
    ]);

    setData({
      anime: animeRes.data || [],
      comments: commentsRes.data || [],
      users: usersRes.data || [],
      badWords: badWordsRes.data || [],
    });
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          <p className="mt-4 text-sm text-gray-500">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4">
        <div className="card mx-auto max-w-md p-8 text-center">
          <span className="text-5xl">🔒</span>
          <h1 className="mt-4 text-xl font-bold text-white">
            Không có quyền truy cập
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Trang này chỉ dành cho quản trị viên.
          </p>
        </div>
      </div>
    );
  }

  return <AdminPanel {...data} />;
}