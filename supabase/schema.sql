-- ============================================
-- KULLANIME - SUPABASE SCHEMA (FIXED RLS RECURSION)
-- Chạy file này trong Supabase SQL Editor
-- File đã được sửa lỗi "infinite recursion" bằng SECURITY DEFINER function
-- ============================================

-- 1. BẢNG PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'banned')),
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. BẢNG ANIME
CREATE TABLE IF NOT EXISTS public.anime (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mal_id INTEGER UNIQUE,
  title TEXT NOT NULL,
  title_japanese TEXT,
  cover_image TEXT,
  studio TEXT,
  characters_staff JSONB,
  youtube_trailer_id TEXT,
  homepage_url TEXT,
  mal_url TEXT,
  theme_songs JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anime_mal_id ON public.anime (mal_id);
CREATE INDEX IF NOT EXISTS idx_anime_title ON public.anime (title);
CREATE INDEX IF NOT EXISTS idx_anime_studio ON public.anime (studio);
CREATE INDEX IF NOT EXISTS idx_anime_created_at ON public.anime (created_at DESC);

-- 3. BẢNG USER ANIME LIST
CREATE TABLE IF NOT EXISTS public.user_anime_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  anime_id UUID NOT NULL REFERENCES public.anime (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Watching' CHECK (status IN ('Watching', 'Completed', 'Plan to Watch', 'Dropped')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 10),
  review_text TEXT,
  personal_photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, anime_id)
);

CREATE INDEX IF NOT EXISTS idx_user_anime_list_user ON public.user_anime_list (user_id);
CREATE INDEX IF NOT EXISTS idx_user_anime_list_anime ON public.user_anime_list (anime_id);
CREATE INDEX IF NOT EXISTS idx_user_anime_list_status ON public.user_anime_list (status);

-- 4. BẢNG COMMENTS
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anime_id UUID NOT NULL REFERENCES public.anime (id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
  guest_name TEXT,
  content TEXT NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comments_user_or_guest CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_comments_anime ON public.comments (anime_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments (created_at DESC);

-- 5. BẢNG BAD WORDS
CREATE TABLE IF NOT EXISTS public.bad_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT UNIQUE NOT NULL
);

-- ============================================
-- GRANT QUYỀN TRUY CẬP CHO CÁC ROLE
-- BẮT BUỘC: bảng tạo bằng SQL Editor mặc định chỉ owner truy cập được.
-- RLS policies chỉ có tác dụng sau khi đã GRANT cho anon/authenticated
-- ============================================

-- PROFILES
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- ANIME
GRANT SELECT ON public.anime TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anime TO authenticated;
GRANT ALL ON public.anime TO service_role;

-- USER ANIME LIST
GRANT SELECT ON public.user_anime_list TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_anime_list TO authenticated;
GRANT ALL ON public.user_anime_list TO service_role;

-- COMMENTS
GRANT SELECT ON public.comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;

-- BAD WORDS
GRANT SELECT ON public.bad_words TO anon;
GRANT SELECT ON public.bad_words TO authenticated;
GRANT ALL ON public.bad_words TO service_role;

-- ============================================
-- HÀM KIỂM TRA ADMIN (FIX LỖI INFINITE RECURSION)
-- SECURITY DEFINER: chạy với quyền owner, BỎ QUA RLS
-- nên không gây đệ quy như `EXISTS (SELECT 1 FROM profiles ...)`
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- BẬT RLS TRÊN TẤT CẢ BẢNG
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_anime_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bad_words ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
DROP POLICY IF EXISTS "Profiles: public read" ON public.profiles;
CREATE POLICY "Profiles: public read" 
  ON public.profiles FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Profiles: user insert own" ON public.profiles;
CREATE POLICY "Profiles: user insert own" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: user update own" ON public.profiles;
CREATE POLICY "Profiles: user update own" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: admin all" ON public.profiles;
CREATE POLICY "Profiles: admin all" 
  ON public.profiles FOR ALL 
  USING (public.is_admin());

-- ============ ANIME ============
DROP POLICY IF EXISTS "Anime: public read" ON public.anime;
CREATE POLICY "Anime: public read" 
  ON public.anime FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Anime: authenticated create" ON public.anime;
CREATE POLICY "Anime: authenticated create" 
  ON public.anime FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anime: creator update" ON public.anime;
CREATE POLICY "Anime: creator update" 
  ON public.anime FOR UPDATE 
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Anime: creator delete" ON public.anime;
CREATE POLICY "Anime: creator delete" 
  ON public.anime FOR DELETE 
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Anime: admin all" ON public.anime;
CREATE POLICY "Anime: admin all" 
  ON public.anime FOR ALL 
  USING (public.is_admin());

-- ============ USER ANIME LIST ============
DROP POLICY IF EXISTS "UserAnimeList: public read non-private" ON public.user_anime_list;
CREATE POLICY "UserAnimeList: public read non-private" 
  ON public.user_anime_list FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = user_anime_list.user_id 
        AND p.is_private = false
    )
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "UserAnimeList: user insert own" ON public.user_anime_list;
CREATE POLICY "UserAnimeList: user insert own" 
  ON public.user_anime_list FOR INSERT 
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "UserAnimeList: user update own" ON public.user_anime_list;
CREATE POLICY "UserAnimeList: user update own" 
  ON public.user_anime_list FOR UPDATE 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "UserAnimeList: user delete own" ON public.user_anime_list;
CREATE POLICY "UserAnimeList: user delete own" 
  ON public.user_anime_list FOR DELETE 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "UserAnimeList: admin all" ON public.user_anime_list;
CREATE POLICY "UserAnimeList: admin all" 
  ON public.user_anime_list FOR ALL 
  USING (public.is_admin());

-- ============ COMMENTS ============
DROP POLICY IF EXISTS "Comments: public read" ON public.comments;
CREATE POLICY "Comments: public read" 
  ON public.comments FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Comments: authenticated insert" ON public.comments;
CREATE POLICY "Comments: authenticated insert" 
  ON public.comments FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Comments: guest insert" ON public.comments;
CREATE POLICY "Comments: guest insert" 
  ON public.comments FOR INSERT 
  WITH CHECK (auth.uid() IS NULL AND guest_name IS NOT NULL);

DROP POLICY IF EXISTS "Comments: user update own" ON public.comments;
CREATE POLICY "Comments: user update own" 
  ON public.comments FOR UPDATE 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Comments: user delete own" ON public.comments;
CREATE POLICY "Comments: user delete own" 
  ON public.comments FOR DELETE 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Comments: admin all" ON public.comments;
CREATE POLICY "Comments: admin all" 
  ON public.comments FOR ALL 
  USING (public.is_admin());

-- ============ BAD WORDS ============
DROP POLICY IF EXISTS "BadWords: public read" ON public.bad_words;
CREATE POLICY "BadWords: public read" 
  ON public.bad_words FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "BadWords: admin all" ON public.bad_words;
CREATE POLICY "BadWords: admin all" 
  ON public.bad_words FOR ALL 
  USING (public.is_admin());

-- ============================================
-- TRIGGER: TỰ ĐỘNG TẠO PROFILE KHI ĐĂNG KÝ
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SEED: TỪ CẤM MẪU (BAD WORDS)
-- ============================================
INSERT INTO public.bad_words (word) VALUES
  ('fuck'), ('shit'), ('bitch'), ('damn'), ('asshole'),
  ('địt'), ('lồn'), ('cặc'), ('chó má'), ('đồ khốn'),
  ('ngu'), ('đần'), ('mất dạy'), ('vô học'), ('cút đi')
ON CONFLICT (word) DO NOTHING;

-- ============================================
-- SEED: ADMIN MẪU
-- Sau khi tạo user trên Supabase Auth, chạy lệnh này với UUID của user:
-- UPDATE public.profiles SET role = 'admin' WHERE id = 'UUID_CỦA_USER';
-- ============================================