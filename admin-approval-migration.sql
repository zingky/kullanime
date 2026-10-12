-- ============================================================
--  KullAnime — Migration G) DUYỆT ANIME + ẨN LINK LIST ADMIN
--  Chạy TRONG Supabase Dashboard -> SQL Editor -> RUN (1 lần).
--  Chạy lại nhiều lần vẫn an toàn (IF NOT EXISTS / OR REPLACE).
--  Yêu cầu: đã chạy supabase-setup.sql + mylist-migration.sql trước đó.
--
--  Ý tưởng (1 admin duy nhất):
--  - Trang chủ = list admin (chỉ anime ĐÃ DUYỆT).
--  - Member thêm anime → is_approved=false (CHỜ DUYỆT), chỉ hiện ở
--    panel Quản trị để admin duyệt, KHÔNG lên trang chủ.
--  - Link ?u=<username-admin> → RPC ném 'ADMIN_HOME', client về trang chủ.
-- ============================================================

-- G1) Cột duyệt + người tạo (tự vá nếu thiếu — tránh 42703)
alter table public.animes add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.animes add column if not exists is_approved boolean not null default true;
create index if not exists idx_animes_approved on public.animes (is_approved);
create index if not exists idx_animes_created_by on public.animes (created_by);

-- G2) Backfill: anime cũ = đã duyệt; gán chủ = admin đầu tiên (nếu trống)
do $$
declare _admin_id uuid;
begin
  select u.id into _admin_id from auth.users u
   where coalesce(u.raw_app_meta_data->>'is_admin','false')::text = 'true'
   order by u.created_at limit 1;
  update public.animes set is_approved = true where is_approved is null;
  if _admin_id is not null then
    update public.animes set created_by = _admin_id where created_by is null;
  end if;
end; $$;

-- G3) Trigger: admin thêm/sửa → duyệt luôn; member thêm → chờ duyệt.
-- (Ghi đè giá trị client gửi — F12 cũng không tự duyệt được.)
create or replace function public.set_anime_approval()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if public.is_admin() then new.is_approved := true;
    else new.is_approved := false; end if;
  elsif tg_op = 'UPDATE' then
    -- Member không có quyền update kho (RLS đã chặn); admin giữ nguyên
    -- cờ duyệt trừ khi update explicit (duyệt = update is_approved=true).
    if not public.is_admin() then
      new.is_approved := old.is_approved;
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_anime_approval on public.animes;
create trigger trg_anime_approval before insert or update on public.animes
  for each row execute function public.set_anime_approval();

-- G4) RLS đọc: khách chỉ thấy đã duyệt; member thêm thấy chờ duyệt của mình; admin thấy hết.
drop policy if exists "animes_public_read" on public.animes;
create policy "animes_public_read"
  on public.animes for select to anon, authenticated
  using (
    coalesce(is_approved, true) = true
    or auth.uid() = created_by
    or public.is_admin()
  );

-- G5) RPC get_public_list: thêm is_approved + is_admin_owner; chặn ?u=admin.
-- - Chủ list / admin xem: full items (kèm cờ is_approved để badge "Chờ duyệt").
-- - Người ngoài xem link share: chỉ anime ĐÃ DUYỆT.
-- - ?u=username-admin → ném 'ADMIN_HOME' (client về trang chủ).
drop function if exists public.get_public_list(text);
create or replace function public.get_public_list(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  _prof public.profiles%rowtype;
  _viewer uuid := auth.uid();
  _is_owner boolean;
  _is_admin_owner boolean := false;
  _items jsonb;
begin
  select * into _prof from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username,'')));
  if not found then raise exception 'NOT_FOUND'; end if;

  -- Username này có phải của admin không? (1 admin duy nhất)
  select exists (
    select 1 from auth.users u
     where u.id = _prof.user_id
       and coalesce(u.raw_app_meta_data->>'is_admin','false')::text = 'true'
  ) into _is_admin_owner;
  if _is_admin_owner then raise exception 'ADMIN_HOME'; end if;

  if _prof.is_public = false
     and (_viewer is null or (_viewer <> _prof.user_id and not public.is_admin())) then
    raise exception 'PRIVATE';
  end if;

  _is_owner := (_viewer is not null and _viewer = _prof.user_id) or public.is_admin();

  select coalesce(jsonb_agg(t ORDER BY t.my_rating DESC, t.title), '[]'::jsonb) into _items
    from (
      select a.id, a.title, a.title_romaji, a.title_native, a.poster_url,
             a.status, a.rating, a.genres, a.studio, a.year,
             a.total_episodes, a.is_approved, s.watched_episodes, s.my_rating, s.my_status,
             s.watch_count, s.watch_dates, s.updated_at
        from public.user_anime_states s
        join public.animes a on a.id = s.anime_id
       where s.user_id = _prof.user_id
         and (_is_owner or coalesce(a.is_approved, true) = true)
    ) t;
  return jsonb_build_object('username', _prof.username, 'display_name', _prof.display_name,
    'is_public', _prof.is_public, 'is_admin_owner', false,
    'total', jsonb_array_length(_items), 'items', _items);
end;
$$;

grant execute on function public.get_public_list(text) to anon, authenticated;
