"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Email không hợp lệ.");
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        // Email chưa xác thực
        if (error.message.toLowerCase().includes("email not confirmed")) {
          setError(
            "Email chưa được xác thực. Vui lòng kiểm tra hộp thư (kể cả Spam) và bấm link xác nhận trong email."
          );
        } else if (
          error.message.toLowerCase().includes("invalid login") ||
          error.message.toLowerCase().includes("invalid credentials")
        ) {
          setError("Email hoặc mật khẩu không đúng.");
        } else {
          setError(error.message);
        }
        return;
      }

      if (data.user) {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4 py-12">
      <div className="w-full">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Đăng nhập</h1>
          <p className="mt-1 text-sm text-gray-500">
            Chào mừng trở lại KullAnime
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
              {info}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-field"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-field"
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="text-primary-400 hover:underline">
            Đăng ký
          </Link>
        </p>
      </div>
    </div>
  );
}