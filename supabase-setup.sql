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
  -- điểm đánh giá của riêng chủ web (0-10) & trạng thái xem cá nhân
  my_rating       numeric(3,1) not null default 0,
  my_status       text         not null default 'Chưa xem',
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
  -- Người gửi (auto lấy từ auth) — phục vụ rate-limit & quản lý
  user_id         uuid default auth.uid(),
  created_at      timestamptz not null default now()
);

comment on table public.comments is 'Bình luận dạng forum, có thể ghim';

-- (Tự sửa schema nếu bảng comments đã tồn tại từ trước mà thiếu cột —
--  trường hợp thường gặp: bảng được tạo tay trước khi chạy script này.)
alter table public.comments add column if not exists is_pinned   boolean not null default false;
alter table public.comments add column if not exists author_name text    not null default '';

-- (Tự sửa schema nếu bảng animes thiếu cột trạng thái cá nhân —
--  thêm "điểm đánh giá của tôi" & "trạng thái xem của tôi")
alter table public.animes add column if not exists my_rating numeric(3,1) not null default 0;
alter table public.animes add column if not exists my_status text         not null default 'Chưa xem';


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
-- 9b) CHỐNG SPAM SERVER-SIDE (rate-limit bình luận)
--     Không phụ thuộc client — kẻ gọi thẳng API cũng bị chặn.
--     Quy tắc: tối đa 1 bình luận / 45 giây / người.
--       + Đã đăng nhập: tính theo user_id (do server gán, không thể giả).
--       + Khách: tính theo author_name (giảm thiểu hơn là chặn tuyệt đối).
-- ============================================================
-- Đảm bảo cột user_id tồn tại (an toàn chạy lại nhiều lần):
alter table public.comments add column if not exists user_id uuid default auth.uid();

create or replace function public.prevent_comment_spam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid       uuid := auth.uid();   -- server-side identity, client không giả mạo được
  _last_ts   timestamptz;
  _min_gap   interval := interval '45 seconds';
begin
  -- Chỉ áp dụng cho bình luận forum (anime_id có giá trị).
  -- Chat (anime_id null) là realtime, không giới hạn 45s — chỉ có client-side throttle.
  if new.anime_id is null then
    return new;
  end if;

  if _uid is not null then
    select max(created_at) into _last_ts
      from public.comments where user_id = _uid;
  else
    -- Khách chưa đăng nhập: giới hạn theo author_name
    select max(created_at) into _last_ts
      from public.comments
      where user_id is null and author_name = new.author_name;
  end if;

  if _last_ts is not null and (now() - _last_ts) < _min_gap then
    raise exception 'Bạn đang gửi bình luận quá nhanh, vui lòng chờ 45 giây.';
  end if;

  -- Gán lại user_id theo auth thay vì tin giá trị client gửi lên
  new.user_id := _uid;
  return new;
end;
$$;

drop trigger if exists trg_prevent_comment_spam on public.comments;
create trigger trg_prevent_comment_spam
  before insert on public.comments
  for each row execute function public.prevent_comment_spam();

create index if not exists idx_comments_user_id on public.comments (user_id);

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
