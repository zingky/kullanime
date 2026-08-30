# KullAnime 🎌

Website quản lý, đánh giá và chia sẻ danh sách Anime cá nhân & cộng đồng — **site tĩnh 100% (Vanilla JS)**, không cần build, không cần server riêng. Dữ liệu + đăng nhập lưu trên **Supabase**, ảnh upload qua **Cloudinary**, auto-fill dữ liệu từ **AniList GraphQL API**, phụ đề `.ass` tải tự động từ GitHub.

## ✨ Tính năng

- **Tab Anime / Nhạc OST / Chat chung** — chuyển tab bằng nav trên đầu trang
- **Bộ sưu tập anime:** lưới card có poster, tìm theo tên/studio/thể loại, lọc theo trạng thái, sắp xếp (mới nhất / đánh giá cao / A-Z)
- **Chi tiết anime (modal):** synopsis, studio, năm, rating, thanh tiến độ tập, dàn seiyuu
- **Nhạc OST:** danh sách bài hát + player YouTube, tải phụ đề `.ass` từ GitHub + cập nhật Romaji/Vietsub theo thời gian phát
- **Bình luận:** rich text (BBCode + Markdown, lọc qua DOMPurify chống XSS), upload ảnh qua Cloudinary, captcha + rate-limit 45s chống spam, admin ghim/xóa
- **💬 Chat chung:** tab tổng hợp toàn bộ tin nhắn — cả tin chat tự do (không gắn phim) lẫn bình luận trong từng phim, click nhãn phim để mở chi tiết; tự làm mới mỗi 30s
- **Admin Panel (đăng nhập):** CRUD anime & bài hát, quản lý bình luận, auto-fill form anime từ AniList API, upload poster Cloudinary, export backup JSON
- **Trạng thái xem của tôi:** mỗi anime có thể đặt trạng thái `Đã xem / Chưa xem / Có ý định xem` + điểm đánh giá riêng (0-10) ngay khi đăng nhập admin

## 🧱 Tech Stack

- **Frontend:** Vanilla JS (ES6+), HTML5, CSS3 — không framework, không build step
- **Database & Auth:** [Supabase](https://supabase.com) (PostgreSQL + RLS + Auth Email/Password)
- **Media Storage:** Cloudinary (unsigned upload preset)
- **External API:** AniList GraphQL API (`https://graphql.anilist.co`)
- **Subtitles:** GitHub API / raw.githubusercontent.com (thư mục `subs` của repo phụ đề)

## 📁 Cấu trúc dự án

| File | Vai trò |
|---|---|
| `index.html` | Toàn bộ giao diện (header, tab, modal anime/music, admin panel…) |
| `styles.css` | Toàn bộ style |
| `app.js` | Toàn bộ logic (Supabase, Cloudinary, AniList, bình luận, admin…) |
| `config.js` | Đọc config (`__APP_ENV__` → `.env.local` → default), dựng URL tiện ích |
| `supabase-setup.sql` | Schema bảng + RLS + hướng dẫn tạo admin |
| `.env.local` | Config khi chạy local (**KHÔNG commit** — đã trong `.gitignore`) |

## ⚙️ Cài đặt & chạy local

> ⚠️ **KHÔNG mở `index.html` bằng double-click.** Phải chạy qua HTTP server vì `config.js` dùng `fetch('./.env.local')`, mà trình duyệt chặn fetch trên giao thức `file://`.

```bash
# Cách 1: Python (đã rất phổ biến)
python -m http.server 3000

# Cách 2: Node
npx serve .
```

Mở `http://localhost:3000`.

### Tạo `.env.local` ở thư mục gốc

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=...
NEXT_PUBLIC_ANILIST_API_URL=https://graphql.anilist.co
```

Nếu thiếu `.env.local` hoặc deploy lên hosting tĩnh không serve file này, `config.js` tự động rơi về các giá trị default khai trong file.

## 🗄️ Supabase

1. Tạo project tại [supabase.com](https://supabase.com)
2. **SQL Editor** → chạy toàn bộ nội dung `supabase-setup.sql` (tạo bảng `animes`, `songs`, `comments` + RLS)
3. Tạo **admin** (2 cách — chi tiết ở cuối file `supabase-setup.sql`):
   - **Dashboard:** `Authentication → Users → chọn user → Edit → App Metadata` thêm `{"is_admin": "true"}`
   - **SQL:**
     ```sql
     update auth.users
     set raw_app_meta_data =
         coalesce(raw_app_meta_data,'{}'::jsonb) || '{"is_admin":"true"}'::jsonb
     where email = 'EMAIL_CỦA_ADMIN';
     ```
4. Tạo tài khoản quản trị (admin): login bằng email/password trên web rồi set `is_admin` như trên
5. Tạo tài khoản **thành viên thường** (bình luận/chat): `Authentication → Users → Add user` (nhập email + password, không cần mời qua email). Không cần đặt gì thêm — người dùng tự đặt nickname sau khi đăng nhập.

### Đăng nhập & nickname cho thành viên

- Tài khoản thường đăng nhập bằng nút **👤 Đăng nhập** (email/password) giống admin.
- Khi đã đăng nhập, bình luận & chat **không cần nhập tên hiển thị và không cần captcha** — hệ thống tự lấy tên theo **nickname** của tài khoản.
- Nếu tài khoản chưa có nickname, hệ thống hiển thị **phần trước dấu `@`** của email (không lộ cả địa chỉ email). Người dùng bấm **✏️ Đổi tên** trong composer để đặt nickname và được lưu vĩnh viễn (qua `auth.updateUser`) — không cần chỉnh SQL nào.
- **Khách chưa đăng nhập** vẫn gửi bình luận/chat như cũ: phải nhập tên hiển thị + giải captcha.

## 🖼️ Cloudinary

1. Tạo account tại [cloudinary.com](https://cloudinary.com)
2. **Settings → Upload → Upload presets** → tạo preset **Unsigned**
3. Điền `CLOUDINARY_CLOUD_NAME` và `CLOUDINARY_UPLOAD_PRESET` vào `.env.local` / default trong `config.js`

## 🚀 Deploy online

### GitHub Pages (khuyên dùng — miễn phí, không cần CLI)

1. Push code lên GitHub:
   ```bash
   git add .
   git commit -m "update site"
   git push origin main
   ```
2. Trên GitHub: repo `zingky/kullanime` → **Settings → Pages**
3. **Build and deployment → Source**: chọn **Deploy from a branch**
4. **Branch**: `main` → thư mục **`/ (root)`** → **Save**
5. Chờ 1–2 phút, site mở tại: `https://zingky.github.io/kullanime/`

> Khi deploy tĩnh, `.env.local` không được serve → `config.js` tự rơi về default. Hãy đảm bảo các default trong `config.js` đúng project của bạn (hiện đã đúng).

### Netlify (kéo-thả thư mục — không cần git)

1. Vào [netlify.com](https://netlify.com) → **Add new site → Deploy manually**
2. Kéo thả cả dự án (gồm `index.html`, `app.js`, `config.js`, `styles.css`) vào
3. Xong — URL dạng `https://<tên>.netlify.app`

## 🔒 Bảo mật

- **RLS** trên Supabase: public chỉ đọc `animes`/`songs`; bình luận public đọc/ghi; ghi/sửa/xóa dữ liệu admin chỉ dành cho `is_admin`
- **DOMPurify** lọc mọi HTML render từ user (chống XSS)
- **Captcha + Rate limit (45s/lần)** chống spam bình luận — **chỉ áp dụng cho khách chưa đăng nhập**; tài khoản đã đăng nhập (thành viên/admin) gửi bình luận/chat không cần captcha
- `.env.local` không commit (chỉ chứa key publishable — không bao giờ để Service Role Key ở client)

## 📌 Lưu ý

- Quyền admin kiểm tra qua `app_metadata.is_admin = 'true'` (không phải email tĩnh)
- `.env.local` hiện chứa key của project Supabase `mtyfhywujsicnkgtxwya` và preset Cloudinary `kull_unsign` — chỉ dùng khi dev