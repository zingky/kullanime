-- ============================================================
--  KullAnime — DATA TEST: 10 anime ảo + 50 bình luận ảo
--  ------------------------------------------------------------
--  Mục đích: test chức năng hiển thị anime, bình luận & Realtime.
--  - 10 anime ảo (tên/tóm tắt tự tạo, poster dùng picsum.photos)
--  - 5 anime có 10 bình luận mỗi phim (tổng 50 bình luận)
--  - created_at của anime & bình luận: NGẪU NHIÊN trong 30 phút trước
--  - An toàn chạy lại: tự xoá data test cũ (đối chiếu theo title) trước khi insert.
--
--  Cách dùng: mở Supabase Dashboard -> SQL Editor -> dán toàn bộ -> RUN.
--  Sau khi chạy xong, reload trang web để tải danh sách anime mới.
-- ============================================================

begin;

-- ============================================================
-- 1) DỌN DATA TEST CŨ (nếu đã chạy script lần trước)
-- ============================================================
delete from public.comments
where anime_id in (
  select id from public.animes where title in (
    'Hành Trình Rồng Phượng',
    'Ánh Trăng Giữa Thành Phố',
    'Hiệp Sĩ Hộp Cơm',
    'Ký Ức Mưa Xanh',
    'Làn Sóng Nexus',
    'Vua Bóng Đêm',
    'Bếp Nhà Yêu',
    'Cô Gái Của Núi Xanh',
    'Tân Thế Giới: Khởi Nguyên',
    'Nhật Ký Lập Dị'
  )
);

delete from public.animes
where title in (
  'Hành Trình Rồng Phượng',
  'Ánh Trăng Giữa Thành Phố',
  'Hiệp Sĩ Hộp Cơm',
  'Ký Ức Mưa Xanh',
  'Làn Sóng Nexus',
  'Vua Bóng Đêm',
  'Bếp Nhà Yêu',
  'Cô Gái Của Núi Xanh',
  'Tân Thế Giới: Khởi Nguyên',
  'Nhật Ký Lập Dị'
);

-- ============================================================
-- 2) TẠO 10 ANIME ẢO (created_at ngẫu nhiên trong 30 phút trước)
-- ============================================================
create temp table tmp_kullanime_test as
with inserted as (
  insert into public.animes (
    title, synopsis, poster_url, status, rating, genres, studio, year,
    total_episodes, watched_episodes, title_romaji, title_native, title_synonyms,
    start_date, end_date, season, source, hashtag, producers,
    my_rating, my_status, watch_count, watch_dates, seiyuu, tags,
    created_at, updated_at
  ) values
  -- 1. Hành Trình Rồng Phượng
  (
    'Hành Trình Rồng Phượng',
    'Hai người thừa kế của dòng tộc rồng và phượng bị buộc phải hợp sức bảo vệ thành phố song sinh khi bóng tối cổ xưa thức tỉnh sau một thiên niên kỷ ngủ yên.',
    'https://picsum.photos/seed/kull-rong-phuong/300/450',
    'Đang chiếu', 8.5, array['Hành động', 'Phiêu lưu', 'Fantasy'], 'Studio Bay Gió', 2026,
    24, 6, 'Ryuu Hou no Tabiji', '竜鳳の旅路', array['Ryuu Hou Tabiji', 'Journey of Dragon and Phoenix'],
    '2026-01-10', '', 'Đông', 'LIGHT_NOVEL', '',
    array['Nhà xuất bản Á Châu'],
    9, 'Đang xem', 1, array['2026-09-05'], '[]'::jsonb,
    '[{"name":"Hành động","rank":92,"spoiler":false},{"name":"Fantasy","rank":88,"spoiler":false},{"name":"Anh em","rank":60,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
  -- 2. Ánh Trăng Giữa Thành Phố
  (
    'Ánh Trăng Giữa Thành Phố',
    'Một cô nàng hướng nội suốt ngày ngắm mặt trăng từ ban công chợt kết bạn với chàng trai hàng xóm mới chuyển đến — và cả hai cùng khám phá những góc khuất lãng mạn của thành phố về đêm.',
    'https://picsum.photos/seed/kull-anh-trang/300/450',
    'Hoàn thành', 7.8, array['Lãng mạn', 'Hài hước', 'Học đường'], 'Kull Studio', 2025,
    12, 12, 'Machikado no Tsukiakari', '街角の月明かり', array['City Moonlight', 'Moonlight in the City'],
    '2025-07-05', '2025-09-27', 'Hạ', 'MANGA', '',
    array['Nhà xuất bản Sao Mai'],
    8, 'Đã xem', 3, array['2025-09-28', '2025-10-05', '2025-10-12'], '[]'::jsonb,
    '[{"name":"Lãng mạn","rank":85,"spoiler":false},{"name":"Học đường","rank":70,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
  -- 3. Hiệp Sĩ Hộp Cơm
  (
    'Hiệp Sĩ Hộp Cơm',
    'Cô sinh viên nghèo mơ ước trở thành đầu bếp huyền thoại, nhưng mỗi trận chiến ẩm thực của cô lại kết thúc bằng một chiếc hộp cơm bento cực chất lượng. Liệu bento có thực sự cứu được thế giới?',
    'https://picsum.photos/seed/kull-hoppcom/300/450',
    'Hoàn thành', 8.2, array['Hài hước', 'Hành động', 'Ẩm thực'], 'Studio Nấu Ăn Vui', 2024,
    13, 13, 'Bento Kishi', '弁当騎士', array['Bento Knight'],
    '2024-04-04', '2024-06-27', 'Xuân', 'ORIGINAL', '',
    array['Kênh Ẩm Thực Kull'],
    8, 'Đã xem', 2, array['2024-07-01', '2025-01-15'], '[]'::jsonb,
    '[{"name":"Hài hước","rank":90,"spoiler":false},{"name":"Ẩm thực","rank":94,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
  -- 4. Ký Ức Mưa Xanh
  (
    'Ký Ức Mưa Xanh',
    'Khi những cơn mưa bắt đầu rơi, một cô gái trẻ vô tình quay ngược về ký ức tuổi thơ của chính mình — nơi ẩn giấu bí mật về cái chết của người anh trai mà cả làng không ai nhắc tới.',
    'https://picsum.photos/seed/kull-mua-xanh/300/450',
    'Hoàn thành', 9.0, array['Tâm lý', 'Siêu nhiên', 'Drama'], 'Studio Dòng Sông', 2023,
    26, 26, 'Aoi Ame no Kioku', '青い雨の記憶', array['Blue Rain Memories'],
    '2023-10-07', '2024-03-30', 'Thu', 'NOVEL', '',
    array['Ban Biên Tập Kull'],
    9, 'Đã xem', 4, array['2024-04-02', '2024-06-20', '2024-12-24', '2025-03-15'], '[]'::jsonb,
    '[{"name":"Tâm lý","rank":95,"spoiler":false},{"name":"Siêu nhiên","rank":80,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
-- 5. Làn Sóng Nexus
  (
    'Làn Sóng Nexus',
    'Năm 2099, những "làn sóng" dữ liệu bí ẩn bắt đầu nuốt chửng các thành phố. Một hacker trẻ tuổi cùng đội ngũ của mình phải xâm nhập Nexus — mạng lưới AI điều khiển thế giới — trước khi nó hoàn tất việc tái lập nhân loại.',
    'https://picsum.photos/seed/kull-nexus/300/450',
    'Đang chiếu', 8.0, array['Khoa học viễn tưởng', 'Hành động', 'Cyberpunk'], 'Studio Mạch Điện', 2026,
    25, 4, 'Nexus no Nami', 'ネクサスの波', array['Nexus Wave'],
    '2026-04-11', '', 'Xuân', 'ORIGINAL', '',
    array['Hãng Phim Mặt Trời'],
    8, 'Đang xem', 0, '{}', '[]'::jsonb,
    '[{"name":"Sci-Fi","rank":90,"spoiler":false},{"name":"Cyberpunk","rank":82,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
  -- 6. Vua Bóng Đêm
  (
    'Vua Bóng Đêm',
    'Chàng trai bán thần bị trục xuất khỏi thiên giới phải chiêu mộ một đội quân gồm những kẻ bị ruồng bỏ để giành lại ánh sáng cho vương quốc — nhưng bóng tối trong chính hắn ngày một lớn.',
    'https://picsum.photos/seed/kull-bong-dem/300/450',
    'Hoàn thành', 7.5, array['Hành động', 'Thần thoại', 'Tối tăm'], 'Studio Đêm Trắng', 2022,
    12, 12, 'Yami no Ou', '闇の王', array['King of Darkness'],
    '2022-01-09', '2022-03-27', 'Đông', 'MANGA', '',
    array['Hãng Phim Hoàng Hôn'],
    7, 'Đã xem', 1, array['2022-04-01'], '[]'::jsonb,
    '[{"name":"Thần thoại","rank":78,"spoiler":false},{"name":"Anti-hero","rank":65,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
  -- 7. Bếp Nhà Yêu
  (
    'Bếp Nhà Yêu',
    'Hai chị em gái mồ côi mở một quán ăn nhỏ ven sông. Mỗi món ăn họ nấu đều gợi lại một ký ức gia đình, kéo theo những vị khách kỳ lạ thay đổi cuộc đời họ từng ngày.',
    'https://picsum.photos/seed/kull-bepnha/300/450',
    'Hoàn thành', 8.8, array['Đời thường', 'Ẩm thực', 'Gia đình'], 'Studio Bếp Ấm', 2024,
    11, 11, 'Ai no Kitchen', '愛のキッチン', array['Kitchen of Love', 'Love Kitchen'],
    '2024-10-06', '2024-12-22', 'Thu', 'MANGA', '',
    array['Tạp Chí Làng Quê'],
    8, 'Đã xem', 2, array['2024-12-25', '2025-06-08'], '[]'::jsonb,
    '[{"name":"Đời thường","rank":88,"spoiler":false},{"name":"Ấm áp","rank":93,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
  -- 8. Cô Gái Của Núi Xanh
  (
    'Cô Gái Của Núi Xanh',
    'Truyền thuyết kể rằng ngọn núi xanh có một cô gái giữ rừng. Khi công ty khai thác gỗ tìm cách san phẳng ngọn núi, một nhóm trẻ em làng chân núi quyết tâm tìm ra sự thật.',
    'https://picsum.photos/seed/kull-nui-xanh/300/450',
    'Hoàn thành', 7.2, array['Phiêu lưu', 'Thiên nhiên', 'Fantasy'], 'Studio Cây Xanh', 2023,
    10, 10, 'Aoi Yama no Shoujo', '青い山の少女', array['Girl of the Green Mountain'],
    '2023-07-08', '2023-09-09', 'Hạ', 'ORIGINAL', '',
    array['Quỹ Bảo Tồn Rừng'],
    7, 'Đã xem', 1, array['2023-09-10'], '[]'::jsonb,
    '[{"name":"Thiên nhiên","rank":86,"spoiler":false},{"name":"Phiêu lưu","rank":74,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
  -- 9. Tân Thế Giới: Khởi Nguyên
  (
    'Tân Thế Giới: Khởi Nguyên',
    'Chàng nhân viên văn phòng kiệt sức chuyển sinh sang một thế giới khác nơi ma thuật và công nghệ song hành. Với cuốn sổ ghi chép mọi quy tắc của thế giới mới, anh dần trở thành người kiến tạo lại nền văn minh.',
    'https://picsum.photos/seed/kull-tan-thegioi/300/450',
    'Đang chiếu', 8.6, array['Isekai', 'Phiêu lưu', 'Fantasy'], 'Studio Cổng Sao', 2026,
    24, 5, 'Shin Sekai: Kigen', '新世界：起源', array['New World: Genesis'],
    '2026-01-15', '', 'Đông', 'LIGHT_NOVEL', '',
    array['Nhà Xuất Bản Huyền Không'],
    9, 'Đang xem', 0, '{}', '[]'::jsonb,
    '[{"name":"Isekai","rank":91,"spoiler":false},{"name":"Xây dựng thế giới","rank":84,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  ),
  -- 10. Nhật Ký Lập Dị
  (
    'Nhật Ký Lập Dị',
    'Mỗi ngày thức dậy, chàng sinh viên lại thấy một trang nhật ký mới mà chính tay anh viết nhưng không hề nhớ — ghi chép chính xác những sự kiện sẽ xảy ra trong ngày. Và ngày hôm nay, trang nhật ký ghi: "Đừng đi tàu điện số 3."',
    'https://picsum.photos/seed/kull-lap-di/300/450',
    'Hoàn thành', 7.9, array['Khoa học viễn tưởng', 'Trinh thám', 'Tâm lý'], 'Studio Đồng Hồ Cát', 2025,
    12, 12, 'Henkaku Nikki', '変革日記', array['Anomaly Diary'],
    '2025-01-12', '2025-03-30', 'Đông', 'NOVEL', '',
    array['Hãng Phim Nửa Đêm'],
    8, 'Đã xem', 1, array['2025-04-01'], '[]'::jsonb,
    '[{"name":"Trinh thám","rank":83,"spoiler":false},{"name":"Tâm lý","rank":77,"spoiler":false}]'::jsonb,
    now() - (random() * interval '30 minutes'), now() - (random() * interval '30 minutes')
  )
  returning *
)
select * from inserted;

-- ============================================================
-- 3) TẠO 50 BÌNH LUẬN ẢO + 20 REPLY CON (reply threading)
--    - 5 anime có 10 bình luận gốc mỗi phim (tổng 50)
--    - 10 tác giả ảo: Ngọc Anh, Minh Khang, Thu Hà, Bảo Long, Lan Phương,
--      Đức Huy, Quỳnh Trâm, Gia Bảo, Thanh Mai, Khánh Linh
--    - created_at NGẪU NHIÊN trong 30 phút trước
--    - Bình luận #1 & #4 của mỗi phim được GHIM (test sắp xếp pin)
--    - Reply: comment gốc #1 & #4 mỗi phim có 2 reply con (Hải Đăng, Tuấn Anh)
--      = 5 phim × 2 cha × 2 reply = 20 reply (test lồng 1 cấp)
--
--    ⚠️ TẠM THỜI TẮT TRIGGER chống spam & auto-block:
--    Trigger là FOR EACH ROW — trong 1 INSERT 50 dòng,
--    author 'Ngọc Anh' xuất hiện 5 lần → trigger cho dòng sau
--    thấy dòng trước (cùng statement) → nghĩ spam → lỗi.
--    Tắt trigger trước khi insert, bật lại ngay sau.
-- ============================================================

-- Tắt trigger chống spam & auto-block (chỉ trong transaction này)
alter table public.comments disable trigger trg_prevent_comment_spam;
alter table public.comments disable trigger trg_auto_block_guest_spam;

-- Lập kế hoạch 50 bình luận (giữ vị trí g để tạo reply phía dưới)
create temp table tmp_kullanime_comment_plan as
with pick as (
  select id, title
  from tmp_kullanime_test
  order by title
  limit 5
)
select
  p.id                                   as anime_id,
  p.title                                as title,
  g,
  case g
    when 1  then 'Chào mừng mọi người đến topic "' || p.title || '"! Thảo luận vui vẻ nhé 📌'
    when 2  then 'Phim hay quá, mới xem thử 1 tập mà mê luôn 👌'
    when 3  then 'Nhân vật chính được xây dựng có chiều sâu thật sự.'
    when 4  then 'Chất lượng sub của Kull Vietsub không phải bàn, xem cực đã. Ghim để mọi người cùng thấy 😆'
    when 5  then 'Cốt truyện cuốn hút, xem lại lần 2 vẫn thấy mới.'
    when 6  then 'Nhạc mở đầu đỉnh thật, nghe phát là ghiền luôn 🎵'
    when 7  then 'Diễn hoạt mượt mà, nhất là mấy cảnh hành động. 10 điểm!'
    when 8  then 'Kết phim hơi hụt hẫng nhưng tổng thể vẫn rất đáng xem.'
    when 9  then 'Recommend cho bạn nào thích thể loại này, đừng bỏ lỡ nha.'
    when 10 then 'Sau khi xem "' || p.title || '" thì mình có cảm giác sẽ còn mùa 2! 🤞'
  end                                    as content,
  (array[
    'Ngọc Anh', 'Minh Khang', 'Thu Hà', 'Bảo Long', 'Lan Phương',
    'Đức Huy', 'Quỳnh Trâm', 'Gia Bảo', 'Thanh Mai', 'Khánh Linh'
  ])[g]                                   as author_name,
  g in (1, 4)                             as is_pinned,
  now() - (random() * interval '30 minutes') as created_at
from pick p
cross join generate_series(1, 10) as g;

-- Insert 50 bình luận gốc
insert into public.comments (anime_id, content, author_name, is_pinned, created_at)
select anime_id, content, author_name, is_pinned, created_at
from tmp_kullanime_comment_plan;

-- Capture id thật của comment vừa insert (join theo anime_id + content — unique theo g)
alter table tmp_kullanime_comment_plan add column id uuid;
update tmp_kullanime_comment_plan p
set id = c.id
from public.comments c
where c.anime_id = p.anime_id and c.content = p.content;

-- Reply threading: mỗi phim, comment gốc #1 (topic chào mừng) và #4 (khen sub)
-- → 2 reply cho mỗi comment gốc (Hải Đăng, Tuấn Anh) = 20 reply con.
insert into public.comments (anime_id, parent_id, content, author_name, is_pinned, created_at)
select
  c.anime_id,
  c.id,
  case r.gfx
    when 1 then 'Cảm ơn bạn đã khởi topic, mình sẽ tham gia thường xuyên nhé! 😊'
    else        'Chuẩn luôn, mình cũng có cảm nhận giống hệt!'
  end,
  (array['Hải Đăng', 'Tuấn Anh'])[r.gfx],
  false,
  now() - (random() * interval '20 minutes') as created_at
from tmp_kullanime_comment_plan c
cross join (select 1 as gfx union all select 2) r
where c.g in (1, 4);

-- Bật lại trigger chống spam & auto-block
alter table public.comments enable trigger trg_prevent_comment_spam;
alter table public.comments enable trigger trg_auto_block_guest_spam;

-- ============================================================
-- 4) KIỂM TRA KẾT QUẢ
-- ============================================================
select
  a.title                    as ten_anime,
  a.status                   as trang_thai,
  a.rating                   as diem,
  count(c.id)                as so_binh_luan,
  count(c.id) filter (where c.parent_id is not null) as so_reply,
  count(c.id) filter (where c.is_pinned) as so_ghi_pin,
  min(c.created_at)          as binh_luan_som_nhat,
  max(c.created_at)          as binh_luan_muon_nhat
from tmp_kullanime_test a
left join public.comments c on c.anime_id = a.id
group by a.title, a.status, a.rating
order by a.title;

-- Kiểm tra reply: mỗi reply phải có cha là bình luận gốc cùng anime, đúng 1 cấp
select
  count(*) filter (where p.id is null)                                             as reply_not_found,
  count(*) filter (where p.anime_id is distinct from r.anime_id)                   as reply_cross_anime,
  count(*) filter (where p.parent_id is not null)                                  as reply_on_reply,
  count(*)                                                                         as total_reply
from public.comments r
left join public.comments p on p.id = r.parent_id
where r.parent_id is not null;

commit;