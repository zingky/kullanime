"use server";

import { createClient } from "@/lib/supabase/server";
import { registerSchema, loginSchema } from "@/lib/validation";
import { redirect } from "next/navigation";

/**
 * Đăng ký tài khoản mới
 */
export async function registerUser(input: {
  email: string;
  password: string;
  username: string;
}) {
  const supabase = await createClient();

  // Validate
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ",
    };
  }

  // Kiểm tra username đã tồn tại chưa
  const { data: existingUsername } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", input.username)
    .maybeSingle();

  if (existingUsername) {
    return { error: "Username đã được sử dụng." };
  }

  // Đăng ký
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        username: input.username,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/login`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    // Tạo profile
    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      username: input.username,
      role: "user",
      is_private: false,
    });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      return { error: "Đăng ký thành công nhưng không thể tạo profile." };
    }
  }

  return { success: true, user: data.user };
}

/**
 * Đăng nhập
 */
export async function loginUser(input: { email: string; password: string }) {
  const supabase = await createClient();

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    return { error: "Email hoặc mật khẩu không chính xác." };
  }

  return { success: true, user: data.user };
}

/**
 * Đăng xuất
 */
export async function logoutUser() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}