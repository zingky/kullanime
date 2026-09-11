-- ============================================================
-- HÀM KHÔI PHỤC BÌNH LUẬN — restore_comments(jsonb)
-- Chạy 1 LẦN trong Supabase Dashboard → SQL Editor.
-- Sau đó nút "Import Backup (Khôi phục)" trên web sẽ tự gọi hàm này:
--  - SECURITY DEFINER → bypass RLS, giữ nguyên user_id gốc của từng bình luận
--  - Chỉ admin (is_admin trong JWT) mới được gọi
--  - Chèn bình luận GỐC trước, reply sau (đúng yêu cầu trigger validate_comment_content)
--  - ON CONFLICT (id) DO NOTHING → không trùng, chạy lại an toàn
-- ============================================================
create or replace function public.restore_comments(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root_count   integer := 0;
  v_reply_count  integer := 0;
  v_is_admin     boolean;
begin
  -- Chỉ admin mới được gọi (kiểm tra is_admin trong JWT của người gọi — auth.uid() vẫn là user gọi hàm)
  v_is_admin := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'is_admin',
    'false'
  )::boolean;
  if v_is_admin is not true then
    raise exception 'Chỉ admin mới được phép khôi phục bình luận.';
  end if;

  -- 1) Chèn bình luận GỐC (parent_id null) trước
  with ins as (
    insert into comments (id, anime_id, parent_id, author_name, content, is_pinned, created_at, user_id)
    select
      (r->>'id')::uuid,
      nullif(r->>'anime_id', '')::uuid,
      nullif(r->>'parent_id', '')::uuid,
      r->>'author_name',
      r->>'content',
      coalesce((r->>'is_pinned')::boolean, false),
      coalesce(nullif(r->>'created_at', '')::timestamptz, now()),
      nullif(r->>'user_id', '')::uuid
    from jsonb_array_elements(p_rows) as r
    where r->>'parent_id' is null
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_root_count from ins;

  -- 2) Chèn reply sau (cha đã tồn tại ở bước 1)
  with ins as (
    insert into comments (id, anime_id, parent_id, author_name, content, is_pinned, created_at, user_id)
    select
      (r->>'id')::uuid,
      nullif(r->>'anime_id', '')::uuid,
      nullif(r->>'parent_id', '')::uuid,
      r->>'author_name',
      r->>'content',
      coalesce((r->>'is_pinned')::boolean, false),
      coalesce(nullif(r->>'created_at', '')::timestamptz, now()),
      nullif(r->>'user_id', '')::uuid
    from jsonb_array_elements(p_rows) as r
    where r->>'parent_id' is not null
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_reply_count from ins;

  return jsonb_build_object(
    'inserted', v_root_count + v_reply_count,
    'roots', v_root_count,
    'replies', v_reply_count,
    'total', jsonb_array_length(p_rows)
  );
end;
$$;

-- Quyền gọi: chỉ user đã đăng nhập (admin được kiểm tra bên trong hàm)
revoke all on function public.restore_comments(jsonb) from public, anon;
grant execute on function public.restore_comments(jsonb) to authenticated;