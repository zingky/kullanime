-- ============================================================
--  KullAnime — FIX: "Failed to create user: Database error creating new user"
--  Chạy trong Supabase Dashboard -> SQL Editor -> RUN (an toàn chạy lại).
--
--  NGUYÊN NHÂN: trigger cũ `on_auth_user_created` (tạo theo template
--  Supabase "User Management" trước đây) ghi vào bảng profiles theo SCHEMA
--  CŨ (id uuid) — nhưng mylist-migration.sql đã đổi tên bảng cũ thành
--  profiles_backup_before_mylist và tạo profiles mới (user_id uuid, KHÔNG
--  có cột id). Mỗi lần INSERT auth.users → trigger lỗi → rollback toàn bộ
--  → GoTrue báo "Database error creating new user".
--
--  FIX: (1) gỡ trigger/function cũ (tự tìm tên động)
--       (2) tạo function mới: tự thêm row profiles từ prefix email,
--           đúng regex ^[a-z0-9_]{3,30}$, chống trùng username,
--           BỌC EXCEPTION → không bao giờ chặn đăng ký nữa
--       (3) gắn lại trigger
-- ============================================================

-- ═══ 1) Gỡ trigger/function CŨ ═══
do $$
declare
  _schema text; _fn text; _args text;
begin
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    into _schema, _fn, _args
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
   where t.tgrelid = 'auth.users'::regclass
     and t.tgname = 'on_auth_user_created';
  if found then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
    execute format('drop function if exists %I.%I(%s)', _schema, _fn, _args);
    raise notice 'Da go trigger cu: %.%(%)', _schema, _fn, _args;
  else
    raise notice 'Khong tim thay trigger cu — bo qua.';
  end if;
end $$;

-- ═══ 2) Function MỚI: tự tạo profiles (username lấy từ email) ═══
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _slug text;
  _i int := 0;
begin
  -- slug từ phần trước @ của email: thường xuống + chỉ giữ a-z0-9_
  _slug := lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-z0-9]+', '_', 'g'));
  _slug := regexp_replace(_slug, '^_+|_+$', '');
  if length(_slug) < 3 then
    _slug := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;
  _slug := left(_slug, 30);
  -- chống trùng username UNIQUE (thêm hậu tố _1, _2, ...)
  while exists (select 1 from public.profiles where username = _slug) and _i < 100 loop
    _i := _i + 1;
    _slug := left(regexp_replace(_slug, '_?\d+$', '') || '_' || _i, 30);
  end loop;
  insert into public.profiles (user_id, username, display_name, is_public)
  values (new.id, _slug, _slug, false)
  on conflict (user_id) do nothing;
  return new;
exception when others then
  -- KHÔNG chặn đăng ký vì lỗi profile — user tự đặt tên sau qua menu 👤 → Đổi tên
  raise warning 'handle_new_user (khong chan dang ky): %', sqlerrm;
  return new;
end;
$$;

-- ═══ 3) Gắn lại trigger ═══
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
--  SAU KHI CHẠY: vào Authentication -> Users -> Add user again.
--  User sẽ tự có row profiles (username = prefix email, list RIÊNG TƯ mặc định,
--  bật công khai trong menu 👤). Nếu bỏ tick "Auto Confirm" thì xác nhận mail giúp user.
-- ============================================================
