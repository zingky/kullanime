-- ============================================================
--  KullAnime — RESET & TẠO LẠI DATABASE TỪ ĐẦU
--  Xoá SẠCH cấu trúc cũ rồi tạo lại ĐÚNG theo supabase-setup.sql.
--
--  CÁCH DÙNG:
--   1. Mở Supabase Dashboard -> SQL Editor
--   2. Dán toàn bộ nội dung file này vào 1 ô -> RUN
--   3. Sau khi RUN xong: vào web -> Đăng xuất -> Đăng nhập lại
-- ============================================================

set role postgres;

-- ===== 1) XOÁ SẠCH CŨ =====
drop table if exists public.comments cascade;
drop table if exists public.songs    cascade;
drop table if exists public.animes   cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.prevent_comment_spam() cascade;

-- ===== 2) TẠO LẠI =====
create extension if not exists "pgcrypto";

create table public.animes (
  id                uuid primary key default gen_random_uuid(),
  title             text not null default '',
  synopsis          text not null default '',
  poster_url        text not null default '',
  status            text not null default 'Đang chiếu',
  rating            numeric(3,1) not null default 0,
  genres            text[] not null default '{}',
  studio            text not null default '',
  year              integer,
  total_episodes    integer not null default 0,
  watched_episodes  integer not null default 0,
  -- điểm đánh giá của riêng chủ web (0-10) & trạng thái xem cá nhân
  my_rating         numeric(3,1) not null default 0,
  my_status         text not null default 'Chưa xem',
  seiyuu            jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.animes is 'Danh sách anime đã xem / đang theo dõi của Kull';

create table public.songs (
  id              uuid primary key default gen_random_uuid(),
  title           text not null default '',
  artist          text not null default '',
  youtube_id      text not null default '',
  anime           text not null default '',
  song_type       text not null default 'OST',
  cover_url       text not null default '',
  ass_file        text not null default '',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.songs is 'Danh sách nhạc OST kèm liên kết phụ đề .ass';

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  anime_id     uuid references public.animes(id) on delete cascade,
  content      text not null default '',
  author_name  text not null default '',
  is_pinned    boolean not null default false,
  -- Người gửi (auto lấy từ auth) — phục vụ rate-limit & quản lý
  user_id      uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
comment on table public.comments is 'Bình luận dạng forum, có thể ghim';

-- ===== 3) TRIGGER updated_at =====
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

create trigger trg_set_updated_at
  before update on public.animes
  for each row execute function public.set_updated_at();

create trigger trg_set_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();

-- ===== 4) RLS + GRANT =====
alter table public.animes   enable row level security;
alter table public.songs    enable row level security;
alter table public.comments enable row level security;

grant usage on schema public to anon, authenticated;

grant select on public.animes to anon, authenticated;
grant insert, update, delete on public.animes to authenticated;

grant select on public.songs to anon, authenticated;
grant insert, update, delete on public.songs to authenticated;

grant select, insert on public.comments to anon, authenticated;
grant update, delete on public.comments to authenticated;

-- ===== 5) HÀM ADMIN =====
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

-- ===== 6) RLS POLICIES =====
-- ANIMES
drop policy if exists "animes_public_read" on public.animes;
create policy "animes_public_read" on public.animes
  for select to anon, authenticated using (true);
drop policy if exists "animes_admin_insert" on public.animes;
create policy "animes_admin_insert" on public.animes
  for insert to authenticated with check (public.is_admin());
drop policy if exists "animes_admin_update" on public.animes;
create policy "animes_admin_update" on public.animes
  for update to authenticated using (public.is_admin());
drop policy if exists "animes_admin_delete" on public.animes;
create policy "animes_admin_delete" on public.animes
  for delete to authenticated using (public.is_admin());

-- SONGS
drop policy if exists "songs_public_read" on public.songs;
create policy "songs_public_read" on public.songs
  for select to anon, authenticated using (true);
drop policy if exists "songs_admin_insert" on public.songs;
create policy "songs_admin_insert" on public.songs
  for insert to authenticated with check (public.is_admin());
drop policy if exists "songs_admin_update" on public.songs;
create policy "songs_admin_update" on public.songs
  for update to authenticated using (public.is_admin());
drop policy if exists "songs_admin_delete" on public.songs;
create policy "songs_admin_delete" on public.songs
  for delete to authenticated using (public.is_admin());

-- COMMENTS
drop policy if exists "comments_public_read" on public.comments;
create policy "comments_public_read" on public.comments
  for select to anon, authenticated using (true);
drop policy if exists "comments_public_insert" on public.comments;
create policy "comments_public_insert" on public.comments
  for insert to anon, authenticated
  with check (
    is_pinned = false
    and length(coalesce(content,'')) >= 1
    and length(coalesce(author_name,'')) >= 1
    and length(content) <= 5000
    and length(author_name) <= 60
  );
drop policy if exists "comments_admin_update" on public.comments;
create policy "comments_admin_update" on public.comments
  for update to authenticated using (public.is_admin());

drop policy if exists "comments_admin_delete" on public.comments;
create policy "comments_admin_delete" on public.comments
  for delete to authenticated using (public.is_admin());

-- ===== 6b) CHỐNG SPAM SERVER-SIDE (rate-limit bình luận) =====
-- Tối đa 1 bình luận / 45 giây / người. Dùng auth.uid() (server) — client không bypass được.
create or replace function public.prevent_comment_spam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid       uuid := auth.uid();
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
    -- Khách: giới hạn theo author_name
    select max(created_at) into _last_ts
      from public.comments
      where user_id is null and author_name = new.author_name;
  end if;

  if _last_ts is not null and (now() - _last_ts) < _min_gap then
    raise exception 'Bạn đang gửi bình luận quá nhanh, vui lòng chờ 45 giây.';
  end if;

  new.user_id := _uid;  -- server gán, không tin client
  return new;
end;
$$;

create trigger trg_prevent_comment_spam
  before insert on public.comments
  for each row execute function public.prevent_comment_spam();

-- ===== 7) INDEX =====
create index if not exists idx_animes_title        on public.animes (title);
create index if not exists idx_animes_status       on public.animes (status);
create index if not exists idx_songs_youtube_id    on public.songs (youtube_id);
create index if not exists idx_songs_title         on public.songs (title);
create index if not exists idx_comments_anime_id   on public.comments (anime_id);
create index if not exists idx_comments_created_at on public.comments (created_at desc);
create index if not exists idx_comments_pinned     on public.comments (is_pinned) where is_pinned = true;
create index if not exists idx_comments_user_id    on public.comments (user_id);
alter table public.animes add column if not exists title_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title,''))) stored;
create index if not exists idx_animes_title_tsv on public.animes using gin (title_tsv);

-- ===== 8) GHIM ADMIN (bỏ comment dòng dưới & chạy riêng) =====
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb)
--     || '{"is_admin":"true"}'::jsonb
-- where email = 'datkullaquarius@gmail.com';
