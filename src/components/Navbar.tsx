"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "./ThemeProvider";
import type { Profile } from "@/types";

export default function Navbar() {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    const fetchUser = async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (authUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .single();
          setUser(profile as Profile | null);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        setUser((profile as Profile) || null);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setMobileOpen(false);
    router.push("/");
  };

  const handleToggleTheme = () => {
    setSpinning(true);
    toggleTheme();
    setTimeout(() => setSpinning(false), 600);
  };

  const navItems = [
    { href: "/", label: "Trang chủ" },
    { href: "/search", label: "Tìm kiếm" },
    ...(user?.role === "admin"
      ? [{ href: "/dashboard", label: "Quản trị" }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-dark-100/80 bg-white/80 backdrop-blur-xl dark:border-dark-800/80 dark:bg-dark-950/80">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-bold text-dark-900 transition-colors hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-base font-black text-white shadow-glow">
              K
            </span>
            <span className="font-display tracking-tight">
              Kull<span className="text-primary-500">Anime</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-gray-500 hover:text-dark-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-primary-500 transition-all duration-300 ${
                    pathname === item.href
                      ? "opacity-100"
                      : "translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                  }`}
                />
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme toggle */}
          <button
            onClick={handleToggleTheme}
            aria-label="Đổi chế độ sáng/tối"
            className={`flex h-9 w-9 items-center justify-center rounded-full border border-dark-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-primary-400 hover:text-primary-500 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400 ${
              spinning ? "animate-spin" : ""
            }`}
          >
            {theme === "dark" ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-dark-100 dark:bg-dark-800" />
          ) : user ? (
            <>
              <Link
                href={`/u/${user.username}`}
                className="flex items-center gap-2 rounded-full border border-dark-200 py-1 pl-1 pr-3 transition-all hover:border-primary-400 hover:shadow-glow dark:border-dark-700"
              >
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt={user.username}
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-xs font-bold text-white">
                    {user.username?.[0]?.toUpperCase() || "U"}
                  </span>
                )}
                <span className="hidden text-sm font-medium text-gray-600 dark:text-gray-300 lg:block">
                  {user.username}
                  {user.role === "admin" && (
                    <span className="ml-1 rounded bg-primary-500/20 px-1.5 py-0.5 text-xs font-semibold text-primary-500 dark:text-primary-400">
                      Admin
                    </span>
                  )}
                </span>
              </Link>
              <button
                onClick={handleLogout}
                className="hidden rounded-full border border-dark-200 px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-red-400 hover:text-red-500 dark:border-dark-700 dark:text-gray-400 dark:hover:border-red-500 sm:block"
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="hidden rounded-full border border-dark-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-primary-400 hover:text-primary-600 sm:inline-flex dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary-600/20 transition-all hover:bg-primary-500 hover:shadow-glow"
              >
                Đăng ký
              </Link>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-dark-100 hover:text-primary-600 md:hidden dark:text-gray-400 dark:hover:bg-dark-800 dark:hover:text-primary-400"
            aria-label="Menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-dark-100 bg-white/95 px-4 pb-4 backdrop-blur-xl md:hidden dark:border-dark-800 dark:bg-dark-950/95">
          <div className="flex flex-col gap-1 pt-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? "bg-primary-500/10 text-primary-600 dark:text-primary-400"
                    : "text-gray-500 hover:bg-dark-100 hover:text-dark-900 dark:text-gray-400 dark:hover:bg-dark-800 dark:hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link
                  href={`/u/${user.username}`}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-dark-100 hover:text-dark-900 dark:text-gray-400 dark:hover:bg-dark-800 dark:hover:text-white"
                >
                  Hồ sơ của tôi
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-xl px-3 py-2 text-left text-sm font-medium text-red-500 hover:bg-red-500/10 dark:text-red-400"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-dark-100 hover:text-dark-900 dark:text-gray-400 dark:hover:bg-dark-800 dark:hover:text-white"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-dark-100 hover:text-dark-900 dark:text-gray-400 dark:hover:bg-dark-800 dark:hover:text-white"
                >
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}