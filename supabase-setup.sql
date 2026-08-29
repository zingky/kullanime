-- ============================================================
--  KullAnime — Kịch bản khởi tạo Database + RLS (Zero-Trust Security)
--  Dán toàn bộ nội dung file này vào Supabase Dashboard -> SQL Editor
--  rồi bấm RUN.
--
--  ✅ Đã tạo sẵn:
--    - Bảng: animes, songs, comments
--    - Triggers cập nhật updated_at
--    - Chính sách RLS theo đúng yêu cầu:
--        + Khách (public):  ĐỌC animes & songs; ĐỌC + GHI comments
--        + Admin (xác thực): toàn quyền CRUD mọi bảng
--    - Index & FULLTEXT search hỗ trợ
-- ============================================================

-- ============================================================
-- 0) Tạo extension (nếu chưa có)
-- ============================================================
create extension if not exists "pgcrypto";  -- cung cấp gen_random_uuid()

-- ============================================================
-- 1) BẢNG ANIMES
-- ============================================================
create table if not exists public.animes (
  id              uuid primary key default gen_random_uuid(),
  title           text not null default '',
  synopsis        text not null default '',
  poster_url      text not null default '',
  status          text not null default 'Đang chiếu',
  rating          numeric(3,1) not null default 0,
  genres          text[] not null default '{}',
  studio          text not null default '',
  year            integer,
  total_episodes  integer not null default 0,
  watched_episodes integer not null default 0,
  -- danh sách seiyuu: [{"name":"...","character":"...","image":"..."}]
  seiyuu          jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.animes is 'Danh sách anime đã xem / đang theo dõi của Kull';

-- ============================================================
-- 2) BẢNG SONGS (OST)
-- ============================================================
create table if not exists public.songs (
  id              uuid primary key default gen_random_uuid(),
  title           text not null default '',
  artist          text not null default '',
  youtube_id      text not null default '',
  anime           text not null default '',
  song_type       text not null default 'OST',   -- OP / ED / Insert / OST / Kara
  cover_url       text not null default '',
  -- Tên file .ass trong GitHub để hiển thị phụ đề (không bắt buộc).
  -- Nếu để trống, app sẽ tự khớp theo youtube_id trong tên file.
  ass_file        text not null default '',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.songs is 'Danh sách nhạc OST kèm liên kết phụ đề .ass';

-- ============================================================
-- 3) BẢNG COMMENTS
-- ============================================================
create table if not exists public.comments (
  id              uuid primary key default gen_random_uuid(),
  anime_id        uuid references public.animes(id) on delete cascade,
  content         text not null default '',
  author_name     text not null default '',
  is_pinned       boolean not null default false,
  created_at      timestamptz not null default now()
);

comment on table public.comments is 'Bình luận dạng forum, có thể ghim';

-- (Tự sửa schema nếu bảng comments đã tồn tại từ trước mà thiếu cột —
--  trường hợp thường gặp: bảng được tạo tay trước khi chạy script này.)
alter table public.comments add column if not exists is_pinned   boolean not null default false;
alter table public.comments add column if not exists author_name text    not null default '';


-- ============================================================
-- 4) TRIGGER CẬP NHẬT updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_animes_updated_at on public.animes;
create trigger trg_animes_updated_at
  before update on public.animes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_songs_updated_at on public.songs;
create trigger trg_songs_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5) BẬT ROW LEVEL SECURITY (MẶC ĐỊNH CHẶN HẾT)
-- ============================================================
alter table public.animes  enable row level security;
alter table public.songs   enable row level security;
alter table public.comments enable row level security;

-- ============================================================
-- 5b) GRANT QUYỀN TRUY CẬP BẢNG
--     RLS quyết định "dòng" nào được phép, GRANT quyết định
--     "vào bảng" được hay không. Với role anon/authenticated
--     như bên dưới, truy vấn của web sẽ hoạt động đúng.
-- ============================================================
grant usage on schema public to anon, authenticated;

-- Animes & Songs: công khai chỉ đọc; admin (authenticated) ghi/sửa/xóa
grant select on public.animes to anon, authenticated;
grant insert, update, delete on public.animes to authenticated;

grant select on public.songs to anon, authenticated;
grant insert, update, delete on public.songs to authenticated;

-- Comments: công khai đọc + ghi; admin sửa (ghim) + xóa
grant select, insert on public.comments to anon, authenticated;
grant update, delete on public.comments to authenticated;

-- ============================================================
-- 6) HÀM KIỂM TRA ADMIN
--    Admin = user đã đăng nhập (auth.uid() != null) VÀ có
--    app_metadata.is_admin = 'true' trong user.
--    (Cách thiết lập admin xem README / mục cuối file này)
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data->>'is_admin','false')::text = 'true'
  );
$$;

-- ============================================================
-- 7) RLS POLICIES — ANIMES
-- ============================================================
-- 7.1 Khách: chỉ ĐỌC
drop policy if exists "animes_public_read" on public.animes;
create policy "animes_public_read"
  on public.animes for select
  to anon, authenticated
  using (true);

-- 7.2 Admin: toàn quyền (INSERT / UPDATE / DELETE)
drop policy if exists "animes_admin_insert" on public.animes;
create policy "animes_admin_insert"
  on public.animes for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "animes_admin_update" on public.animes;
create policy "animes_admin_update"
  on public.animes for update
  to authenticated
  using (public.is_admin());


-- ============================================================
-- 8) RLS POLICIES — SONGS
-- ============================================================
drop policy if exists "songs_public_read" on public.songs;
create policy "songs_public_read"
  on public.songs for select
  to anon, authenticated
  using (true);

drop policy if exists "songs_admin_insert" on public.songs;
create policy "songs_admin_insert"
  on public.songs for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "songs_admin_update" on public.songs;
create policy "songs_admin_update"
  on public.songs for update
  to authenticated
  using (public.is_admin());

drop policy if exists "songs_admin_delete" on public.songs;
create policy "songs_admin_delete"
  on public.songs for delete
  to authenticated
  using (public.is_admin());

-- ============================================================
-- 9) RLS POLICIES — COMMENTS
--    Khách: ĐỌC + GHI (gửi bình luận). Admin: toàn quyền.
-- ============================================================
drop policy if exists "comments_public_read" on public.comments;
create policy "comments_public_read"
  on public.comments for select
  to anon, authenticated
  using (true);

-- Khách được phép INSERT (bình luận) nhưng không được đặt is_pinned=true,
-- không chỉnh sửa nội dung thành rỗng, và author_name bắt buộc.
drop policy if exists "comments_public_insert" on public.comments;
create policy "comments_public_insert"
  on public.comments for insert
  to anon, authenticated
  with check (
    is_pinned = false
    and length(coalesce(content,'')) >= 1
    and length(coalesce(author_name,'')) >= 1
    and length(content) <= 5000
    and length(author_name) <= 60
  );

-- Admin: update / delete (ghim, xóa)
drop policy if exists "comments_admin_update" on public.comments;
create policy "comments_admin_update"
  on public.comments for update
  to authenticated
  using (public.is_admin());

drop policy if exists "comments_admin_delete" on public.comments;
create policy "comments_admin_delete"
  on public.comments for delete
  to authenticated
  using (public.is_admin());


-- ============================================================
-- 10) INDEX TĂNG TỐC TRUY VẤN
-- ============================================================
create index if not exists idx_animes_title        on public.animes (title);
create index if not exists idx_animes_status       on public.animes (status);
create index if not exists idx_songs_youtube_id    on public.songs (youtube_id);
create index if not exists idx_songs_title         on public.songs (title);
create index if not exists idx_comments_anime_id   on public.comments (anime_id);
create index if not exists idx_comments_created_at on public.comments (created_at desc);
create index if not exists idx_comments_pinned     on public.comments (is_pinned) where is_pinned = true;

-- Hỗ trợ tìm kiếm toàn văn cơ bản theo title
alter table public.animes add column if not exists title_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title,''))) stored;
create index if not exists idx_animes_title_tsv on public.animes using gin (title_tsv);

-- ============================================================
-- 11) THIẾT LẬP ADMIN (chạy MỘT LẦN sau khi tạo user)
-- ------------------------------------------------------------
-- Cách 1 (khuyên dùng): trên Dashboard
--   Authentication -> Users -> chọn user -> Edit -> App Metadata
--   thêm:  { "is_admin": "true" }
--
-- Cách 2: bằng SQL (thay thế EMAIL bằng email admin thật):
--
--   update auth.users
--   set raw_app_meta_data =
--       coalesce(raw_app_meta_data,'{}'::jsonb)
--       || '{"is_admin":"true"}'::jsonb
--   where email = 'EMAIL_CỦA_ADMIN';
--
-- ============================================================

-- Nếu muốn cho phép người dùng tự sửa/xóa comment của chính mình
-- (tuỳ chọn) — mở comment dưới nếu cần:
-- drop policy if exists "comments_owner_update" on public.comments;
-- create policy "comments_owner_update"
--   on public.comments for update
--   to authenticated
--   using (auth.uid() = user_id);

drop policy if exists "animes_admin_delete" on public.animes;
create policy "animes_admin_delete"
  on public.animes for delete
  to authenticated
  using (public.is_admin());
