"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      setLoading(false);
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError("Username chỉ chứa chữ cái, số và dấu gạch dưới.");
      setLoading(false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Email không hợp lệ.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      // Kiểm tra username
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", username)
        .maybeSingle();

      if (existingUser) {
        setError("Username đã được sử dụng.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { username },
          emailRedirectTo: `${window.location.origin}/?verified=true`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user) {
        // Tạo profile
        await supabase.from("profiles").insert({
          id: data.user.id,
          username,
          role: "user",
          is_private: false,
        });
      }

      // Hiện modal thông báo email xác thực (dù có session hay không)
      setRegisteredEmail(cleanEmail);
      setShowSuccess(true);
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
          <h1 className="text-2xl font-bold text-white">Đăng ký</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tham gia cộng đồng KullAnime
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="input-field"
              placeholder="yourname"
              minLength={3}
              maxLength={30}
            />
          </div>

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
              placeholder="Ít nhất 6 ký tự"
              minLength={6}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Đang đăng ký..." : "Đăng ký"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Đã có tài khoản?{" "}
          <Link href="/login" className="text-primary-400 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>

      {/* Modal thông báo email xác thực */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md animate-scale-up p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-7 w-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Gần xong rồi! 🎉</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Một email xác thực đã được gửi đến{" "}
              <span className="font-semibold text-primary-400">{registeredEmail}</span>.
              Vui lòng kiểm tra <span className="font-semibold text-gray-300">hộp thư đến</span> — hoặc cả{" "}
              <span className="font-semibold text-gray-300">Spam/Rác</span> nếu không tìm thấy — rồi bấm
              <span className="font-semibold text-gray-300"> "Xác thực tài khoản ngay"</span> để hoàn tất đăng ký.
            </p>
            <div className="mt-5 border-t border-dark-700 pt-4 text-xs text-gray-500">
              🔗 Chưa nhận được email? Bấm lại "Đăng ký" sau vài phút hoặc kiểm tra chính tả email.
            </div>
            <button
              onClick={() => router.push("/")}
              className="btn-primary mt-5 w-full"
            >
              Về trang chủ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
