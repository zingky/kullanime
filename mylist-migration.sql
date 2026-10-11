-- ============================================================
--  KullAnime — Migration: MY LIST (multi-user) + CHẶN HENTAI (GỘP 1 FILE)
--  Chạy TRONG Supabase Dashboard -> SQL Editor -> RUN (1 lần duy nhất).
--  Chạy lại nhiều lần vẫn an toàn (toàn bộ IF NOT EXISTS / OR REPLACE).
--  Yêu cầu: đã chạy supabase-setup.sql trước đó.
--  Gồm: A) profiles  B) user_anime_states  C) migrate điểm admin cũ
--        D) user insert thẳng animes  E) trigger chặn 18+  F) RPC get_public_list
-- ============================================================

-- A) BẢNG PROFILES — 1 row / 1 user (username = slug link ?u=)
-- Nếu bảng profiles CŨ tồn tại mà KHÔNG có cột user_id (template cũ dùng id)
-- thì CREATE TABLE IF NOT EXISTS sẽ bỏ qua + policy gãy với lỗi
-- 42703 column "user_id" does not exist. Đổi tên bảng cũ để giữ dữ liệu
-- rồi tạo mới đúng schema (an toàn chạy lại nhiều lần).
do $$ begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'profiles')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles'
                and column_name = 'user_id') then
    if exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'profiles_backup_before_mylist') then
      drop table public.profiles_backup_before_mylist;
    end if;
    alter table public.profiles rename to profiles_backup_before_mylist;
    raise notice 'Bang profiles cu thieu user_id — da doi ten thanh profiles_backup_before_mylist, tao moi dung schema.';
  end if;
end; $$;
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique,
  display_name text not null default '',
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Ho so public: username (link ?u=) + tick cong khai list';

-- Tự vá schema nếu bảng profiles đã tồn tại từ trước mà thiếu cột
-- (đây chính là nguyên nhân lỗi 42703 column "is_public"/"user_id" does not exist:
-- CREATE TABLE IF NOT EXISTS bỏ qua bảng cũ, policy mới trỏ cột chưa có).
-- LƯU Ý: khối DO ở trên đã đổi tên bảng cũ thiếu user_id, nên tới đây bảng
-- profiles (nếu còn) chắc chắn đã có user_id — chỉ vá nốt các cột còn lại.
alter table public.profiles add column if not exists username text not null default '';
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists is_public boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
-- UNIQUE username (bảng cũ có thể chưa có constraint này).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_key') then
    alter table public.profiles add constraint profiles_username_key unique (username);
  end if;
end; $$;

alter table public.profiles enable row level security;
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read"
  on public.profiles for select to anon, authenticated using (is_public = true);

drop policy if exists "profiles_owner_read" on public.profiles;
create policy "profiles_owner_read"
  on public.profiles for select to authenticated using (auth.uid() = user_id);

drop policy if exists "profiles_owner_write" on public.profiles;
create policy "profiles_owner_write"
  on public.profiles for insert to authenticated
  with check (auth.uid() = user_id and username ~ '^[a-z0-9_]{3,30}$' and length(display_name) <= 60);
drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update"
  on public.profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and username ~ '^[a-z0-9_]{3,30}$' and length(display_name) <= 60);

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all"
  on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_profiles_username on public.profiles (username);

-- B) BẢNG USER_ANIME_STATES — điểm/trạng thái RIÊNG từng user
create table if not exists public.user_anime_states (
  user_id          uuid not null references auth.users(id) on delete cascade,
  anime_id         uuid not null references public.animes(id) on delete cascade,
  my_rating        numeric(3,1) not null default 0,
  my_status        text not null default 'Chưa xem',
  watched_episodes integer not null default 0,
  watch_count      integer not null default 0,
  watch_dates      text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  primary key (user_id, anime_id)
);
comment on table public.user_anime_states is 'Diem/trang thai xem RIENG tung user (1 row = 1 user x 1 anime)';

alter table public.user_anime_states enable row level security;
grant select, insert, update, delete on public.user_anime_states to authenticated;

drop policy if exists "states_owner_all" on public.user_anime_states;
create policy "states_owner_all"
  on public.user_anime_states for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and my_rating >= 0 and my_rating <= 10
    and length(my_status) <= 40 and watched_episodes >= 0 and watch_count >= 0);

drop policy if exists "states_admin_read" on public.user_anime_states;
create policy "states_admin_read"
  on public.user_anime_states for select to authenticated using (public.is_admin());

create index if not exists idx_states_user on public.user_anime_states (user_id);
create index if not exists idx_states_anime on public.user_anime_states (anime_id);

create or replace function public.is_list_public(p_uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_public from public.profiles where user_id = p_uid), false); $$;

-- C) MIGRATE điểm cũ của admin (chỉ row có dữ liệu thật)
do $$
declare _admin_id uuid;
begin
  select u.id into _admin_id from auth.users u
   where coalesce(u.raw_app_meta_data->>'is_admin','false')::text = 'true'
   order by u.created_at limit 1;
  if _admin_id is null then
    raise notice 'Chua co admin — bo qua migrate (chay lai sau khi tao admin).';
    return;
  end if;
  insert into public.profiles (user_id, username, display_name)
  values (_admin_id, 'kull_admin', 'Kull') on conflict (user_id) do nothing;
  insert into public.user_anime_states
    (user_id, anime_id, my_rating, my_status, watched_episodes, watch_count, watch_dates)
  select _admin_id, a.id, a.my_rating, a.my_status,
         coalesce(a.watched_episodes, 0), coalesce(a.watch_count, 0), coalesce(a.watch_dates, '{}')
    from public.animes a
   where a.my_rating > 0 or a.my_status is distinct from 'Chưa xem'
      or coalesce(a.watched_episodes, 0) > 0 or coalesce(a.watch_count, 0) > 0
  on conflict (user_id, anime_id) do nothing;
  raise notice 'Migrate diem cu xong cho admin %', _admin_id;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists trg_states_updated_at on public.user_anime_states;
create trigger trg_states_updated_at before update on public.user_anime_states
  for each row execute function public.set_updated_at();

-- ============================================================
-- D) USER ĐƯỢC THÊM THẲNG ANIME VÀO KHO CHUNG (khỏi duyệt)
-- ============================================================
drop policy if exists "animes_admin_insert" on public.animes;
drop policy if exists "animes_member_insert" on public.animes;
create policy "animes_member_insert"
  on public.animes for insert to authenticated
  with check (length(btrim(coalesce(title,''))) >= 1 and length(title) <= 300
    and coalesce(is_adult, false) = false);

-- ============================================================
-- E) CHẶN HENTAI 18+ Ở SERVER (F12 gọi thẳng cũng bị chặn)
-- ============================================================
alter table public.animes add column if not exists is_adult boolean not null default false;

create or replace function public.reject_adult_anime()
returns trigger language plpgsql security definer set search_path = public
as $$
declare _hay text;
begin
  if coalesce(new.is_adult, false) = true then
    raise exception 'Noi dung 18+ bi chan tren web nay.';
  end if;
  _hay := lower(coalesce(new.title,'') || ' ' || coalesce(new.title_romaji,'')
    || ' ' || coalesce(new.title_native,'') || ' ' || coalesce(array_to_string(new.genres,' '),'')
    || ' ' || coalesce(array_to_string(new.title_synonyms,' '),'') || ' ' || coalesce(new.tags::text,''));
  if _hay ~ '(^|[^a-z0-9])(hentai|porn|xxx|lolicon|shotacon|ahegao|netorare|harem[ _-]?sex|adult[ _-]?video|av[ _-]?idol|18\+)([^a-z0-9]|$)' then
    raise exception 'Noi dung 18+ bi chan tren web nay.';
  end if;
  new.is_adult := false;
  return new;
end;
$$;

drop trigger if exists trg_reject_adult_anime on public.animes;
create trigger trg_reject_adult_anime before insert or update on public.animes
  for each row execute function public.reject_adult_anime();

-- ============================================================
-- F) RPC GET_PUBLIC_LIST — 1 call lấy list công khai (?u=username)
-- ============================================================
drop function if exists public.get_public_list(text);
create or replace function public.get_public_list(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  _prof public.profiles%rowtype;
  _viewer uuid := auth.uid();
  _items jsonb;
begin
  select * into _prof from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username,'')));
  if not found then raise exception 'NOT_FOUND'; end if;
  if _prof.is_public = false
     and (_viewer is null or (_viewer <> _prof.user_id and not public.is_admin())) then
    raise exception 'PRIVATE';
  end if;
  select coalesce(jsonb_agg(t ORDER BY t.my_rating DESC, t.title), '[]'::jsonb) into _items
    from (
      select a.id, a.title, a.title_romaji, a.title_native, a.poster_url,
             a.status, a.rating, a.genres, a.studio, a.year,
             a.total_episodes, s.watched_episodes, s.my_rating, s.my_status,
             s.watch_count, s.watch_dates, s.updated_at
        from public.user_anime_states s
        join public.animes a on a.id = s.anime_id
       where s.user_id = _prof.user_id
    ) t;
  return jsonb_build_object('username', _prof.username, 'display_name', _prof.display_name,
    'is_public', _prof.is_public, 'total', jsonb_array_length(_items), 'items', _items);
end;
$$;

grant execute on function public.get_public_list(text) to anon, authenticated;
grant execute on function public.is_list_public(uuid) to anon, authenticated;
