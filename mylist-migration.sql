-- ============================================================
--  KullAnime — Migration: MY LIST (multi-user) + CHẶN HENTAI (PHẦN 1/2)
--  Chạy TRONG Supabase Dashboard -> SQL Editor -> RUN (1 lần).
--  Yêu cầu: đã chạy supabase-setup.sql trước đó.
--  Gồm: A) profiles  B) user_anime_states  C) migrate điểm admin cũ
-- ============================================================

-- A) BẢNG PROFILES — 1 row / 1 user (username = slug link ?u=)
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique,
  display_name text not null default '',
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Ho so public: username (link ?u=) + tick cong khai list';

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
