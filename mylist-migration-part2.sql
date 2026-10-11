-- ============================================================
--  KullAnime — Migration: MY LIST + CHẶN HENTAI (PHẦN 2/2)
--  Chạy SAU phần 1/2 (cùng SQL Editor, RUN 1 lần).
--  Gồm: D) user insert thẳng animes  E) trigger chặn 18+  F) RPC get_public_list
-- ============================================================

-- D) USER ĐƯỢC THÊM THẲNG ANIME VÀO KHO CHUNG (khỏi duyệt)
drop policy if exists "animes_admin_insert" on public.animes;
drop policy if exists "animes_member_insert" on public.animes;
create policy "animes_member_insert"
  on public.animes for insert to authenticated
  with check (length(btrim(coalesce(title,''))) >= 1 and length(title) <= 300
    and coalesce(is_adult, false) = false);

-- E) CHẶN HENTAI 18+ Ở SERVER (F12 gọi thẳng cũng bị chặn)
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

-- F) RPC GET_PUBLIC_LIST — 1 call lấy list công khai (?u=username)
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
