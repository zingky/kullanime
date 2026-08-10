"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AddAnimeModal from "./AddAnimeModal";

interface AddAnimeButtonProps {
  variant?: "fab" | "card";
}

export default function AddAnimeButton({ variant = "fab" }: AddAnimeButtonProps) {
  const [open, setOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const router = useRouter();

  const checkAuth = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setIsLoggedIn(!!user);

    if (!user) {
      router.push("/login");
      return;
    }
    setOpen(true);
  };

  if (variant === "card") {
    return (
      <>
        <button
          onClick={checkAuth}
          className="group flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary-500/40 bg-primary-500/5 text-primary-500 transition-all duration-300 hover:scale-[1.02] hover:border-primary-500 hover:bg-primary-500/10 hover:shadow-glow dark:border-primary-500/30 dark:text-primary-400 dark:hover:border-primary-400"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary-500/50 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-90">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold">Thêm Anime mới</span>
        </button>

        <AddAnimeModal
          open={open}
          onClose={() => setOpen(false)}
          onSuccess={(animeId) => {
            router.push(`/anime/${animeId}`);
          }}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={checkAuth}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:bg-primary-500 hover:shadow-glow-lg"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        Thêm Anime
      </button>

      <AddAnimeModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={(animeId) => {
          router.push(`/anime/${animeId}`);
        }}
      />
    </>
  );
}