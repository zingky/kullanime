# KullAnime 🌸

> **Demo live:** https://zingky.github.io/kullanime/

Website quản lý, đánh giá và chia sẻ danh sách Anime cá nhân & cộng đồng — **site tĩnh 100% (Vanilla JS)**, không cần build step, không cần server riêng. Dữ liệu + đăng nhập lưu trên **Supabase** (free), ảnh upload qua **Cloudinary** (free), auto-fill dữ liệu anime từ **AniList GraphQL API** (free, không cần key), phụ đề `.ass` tải tự động từ GitHub.

## ✨ Tính năng

- **2 tab điều hướng (nav trên đầu trang):** `Anime` và `Song` (Nhạc OST) — chuyển tab bằng nav; **Chat chung** là bong bóng chat nổi (góc dưới màn hình), không phải tab
- **Bộ sưu tập anime:** lưới card có poster, tìm theo tên/studio/thể loại, sắp xếp (Gần đây / Phát hành / Đánh giá / Tên A-Z) kèm nút đảo chiều ▼/▲; bộ lọc nâng cao (thể loại + trạng thái xem của tôi + tình trạng phát hành + mùa 🌸☀️🍂❄️ + năm) nằm trong panel gọn, mở bằng nút **🔽** có badge đếm số bộ lọc đang bật; nút **✕** cạnh ô tìm kiếm hoặc logo **KullAnime** ở header để xoá toàn bộ bộ lọc
- **Chi tiết anime (modal):** synopsis, studio, năm, rating, thanh tiến độ tập, dàn seiyuu (voice actors + ảnh nhân vật), liên kết (trang chủ/official site...) livato tựđộng (AniList → fallback Jikan/MAL)
- **Auto-fill từ AniList / Jikan:** nhập tên anime → tự điền đầy đủ metadata + seiyuu; fallback Jikan/MAL khi AniList tạm ngừng
- **Nhạc OST:** danh sách bài hát + player YouTube, tải phụ đề `.ass` từ GitHub + cập nhật Romaji/Vietsub theo thời gian phát, cài đặt phụ đề popup (font size, màu, karaoke, timeshift)
- **Bình luận:** rich text (BBCode + Markdown, lọc qua DOMPurify chống XSS), upload ảnh qua Cloudinary, captcha + rate-limit 45s chống spam, admin ghim/xóa
- **💬 Chat chung:** bong bóng chat nổi (góc dưới màn hình) tổng hợp toàn bộ tin nhắn — cả tin chat tự do (không gắn phim) lẫn bình luận trong từng phim, click nhãn phim để mở chi tiết; tự làm mới mỗi 30s; tin của chính mình căn phải theo nickname (thành viên) hoặc tên khách đã dùng — tên khách được nhớ qua `localStorage` nên lần truy cập sau vẫn nhận diện lại tin của mình
- **Admin Panel (đăng nhập):** CRUD anime & bài hát, quản lý bình luận, auto-fill form từ AniList API, upload poster Cloudinary, export/import backup JSON
- **Trạng thái xem:** mỗi anime có thể đặt `Đã xem / Chưa xem / Có ý định xem` + điểm đánh giá (0–10)

## 🧱 Tech Stack

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 | Không framework, không build step |
| Database & Auth | [Supabase](https://supabase.com) | PostgreSQL + Row Level Security + Auth Email/Password |
| Upload ảnh | [Cloudinary](https://cloudinary.com) | Unsigned upload preset (miễn phí) |
| API anime | [AniList GraphQL](https://anilist.co) | Miễn phí, không cần key — primary |
| API anime (fallback) | [Jikan / MyAnimeList](https://jikan.moe) | Miễn phí, rate limit chặt, hay quá tải |
| CDN libs | [jsDelivr](https://jsdelivr.com) + [Cloudflare](https://cdnjs.com) | DOMPurify, Marked.js, Supabase JS Client |
| Video | YouTube IFrame API | Player nhúng, thumbnail |
| Subtitles | GitHub API / raw.githubusercontent.com | File `.ass` tải tự động |

## 📁 Cấu trúc dự án

### File chính (cần thiết)

| File | Vai trò |
|---|---|
| `index.html` | Toàn bộ giao diện: `<title>`, meta SEO, header, nav, footer, modal, admin panel |
| `app.js` | Toàn bộ logic JS: Supabase CRUD, Cloudinary upload, AniList/Jikan auto-fill, YouTube player, bình luận, admin |
| `styles.css` | Toàn bộ style (dark mode, responsive, CSS variables) |
| `config.js` | Đọc config từ `.env.local` hoặc default — dựng URL Supabase/Cloudinary/GitHub/AniList |
| `favicon.svg` | Biểu tượng trang web (hiện là hoa anh đào 🌸) |

### File thiết lập database

| File | Vai trò |
|---|---|
| `supabase-setup.sql` | Kịch bản tạo bảng `animes`, `songs`, `comments` + RLS + trigger + hướng dẫn tạo admin |
| `reset-db.sql` | Kịch bản **reset toàn bộ database** (xoá sạch rồi tạo lại) — dùng khi muốn làm lại từ đầu |

### File phụ (không cần thiết khi fork)

| File | Vai trò |
|---|---|
| `.env.local` | Config khi chạy local (**KHÔNG commit**) — giá trị default trong `config.js` đủ dùng khi deploy |
| `.gitignore` | Loại `.env.local`, file tạm, node_modules khỏi git |

## ⚙️ Cài đặt & chạy local

> ⚠️ **KHÔNG mở `index.html` bằng double-click (file://).** Phải chạy qua HTTP server vì `config.js` dùng `fetch('./.env.local')`, mà trình duyệt chặn `file://`.

```bash
# Cách 1: Python
python -m http.server 3000

# Cách 2: Node
npx serve .

# Cách 3: VS Code — cài extension "Live Server" → bấm chuột phải → "Open with Live Server"
```

Mở `http://localhost:3000`.

### File `.env.local` (tuỳ chọn — chỉ dùng khi dev local)

Tạo file `.env.local` ở thư mục gốc (đã có trong `.gitignore`, không bị commit):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-upload-preset
NEXT_PUBLIC_ANILIST_API_URL=https://graphql.anilist.co
NEXT_PUBLIC_JIKAN_API_URL=https://api.jikan.moe/v4
```

> Nếu thiếu `.env.local` hoặc deploy lên hosting tĩnh (GitHub Pages, Netlify), `config.js` tự động dùng các giá trị `DEFAULTS` hardcoded bên trong — bạn **cần sửa `DEFAULTS` trong `config.js`** nếu muốn dùng project riêng thay vì project mẫu.

## 🗄️ Thiết lập Supabase

1. Tạo project tại [supabase.com](https://supabase.com) (chọn region gần bạn)
2. Vào **SQL Editor** → dán toàn bộ nội dung `supabase-setup.sql` → bấm **RUN**
3. **Tạo tài khoản admin** qua Supabase Dashboard:
   - `Authentication → Users → Add user` → nhập email + password → **Create User**
   - Click user vừa tạo → `Edit → App Metadata` → thêm `{"is_admin":"true"}` → **Save**
   - Hoặc dùng SQL:
     ```sql
     update auth.users
     set raw_app_meta_data =
         coalesce(raw_app_meta_data,'{}'::jsonb) || '{"is_admin":"true"}'::jsonb
     where email = 'EMAIL_CỦA_ADMIN';
     ```
4. **Tạo tài khoản thành viên** (bình luận/chat): `Authentication → Users → Add user` → nhập email + password (chỉ admin mới tạo được user — site đã tắt self-registration)
5. **Lấy thông tin kết nối:** `Project Settings → API` → sao chép `URL` và `anon public` key

### Đăng nhập & nickname

- Tài khoản đăng nhập bằng nút **👤 Đăng nhập** trên header
- Sau đăng nhập, bình luận & chat **không cần nhập tên hiển thị và không cần captcha** — hệ thống tự lấy **nickname** (nếu chưa có nickname thì hiển thị phần trước `@` của email)
- Bấm **✏️ Đổi tên** trong composer để đặt nickname → lưu vĩnh viễn qua `auth.updateUser`
- Khách chưa đăng nhập phải nhập tên + giải captcha

## 🖼️ Thiết lập Cloudinary

1. Tạo account tại [cloudinary.com](https://cloudinary.com)
2. **Settings → Upload → Upload presets** → tạo preset **Unsigned**
3. Ghi nhớ **Cloud name** và **Upload preset name** — điền vào `config.js` (DEFAULTS) hoặc `.env.local`

> Cloudinary dùng để upload ảnh khi người dùng bình luận. Ảnh poster anime và seiyuu được load trực tiếp từ CDN của AniList/Jikan (không qua Cloudinary).

## 🚀 Deploy online

### Cách 1: GitHub Pages (miễn phí, khuyến dùng)

1. Fork repo này hoặc tạo repo mới, push code lên:
   ```bash
   git init
   git add .
   git commit -m "initial"
   git remote add origin https://github.com/BAN_TEN/kullanime.git
   git push -u origin main
   ```
2. GitHub repo → **Settings → Pages**
3. **Source**: `Deploy from a branch` → Branch: `main` → `/ (root)` → **Save**
4. Chờ 1–2 phút → site tại `https://BAN_TEN.github.io/TEN_REPO/`
5. ⚠️ **Sửa `config.js`** — thay `DEFAULTS` bằng Supabase/Cloudinary project riêng của bạn (xem mục "Hướng dẫn từ đầu" bên dưới)

### Cách 2: Netlify (kéo-thả)

1. Vào [netlify.com](https://netlify.com) → **Add new site → Deploy manually**
2. Kéo thả thư mục dự án vào
3. URL dạng `https://<ten>.netlify.app`

---

## 🚀 Hướng dẫn tự tạo trang riêng từ đầu

Nếu bạn muốn tạo **trang riêng của mình** (không dùng chung data với bản mẫu), làm theo từng bước sau:

### Bước 1: Fork / clone dự án

- **Fork** repo này trên GitHub (dễ nhất) — hoặc copy 5 file chính: `index.html`, `app.js`, `config.js`, `styles.css`, `favicon.svg`

### Bước 2: Tạo project Supabase riêng

1. Đăng nhập [supabase.com](https://supabase.com) → **New project**
2. Nhập tên project, mật khẩu database, chọn region
3. Vào **SQL Editor** → dán toàn bộ nội dung file `supabase-setup.sql` → bấm **RUN**
4. Ghi lại **URL** và **anon key** (`Project Settings → API`)

### Bước 3: Tạo tài khoản admin

1. Đăng ký tài khoản trên trang web của bạn (bấm 👤 Đăng nhập → đăng ký)
2. Trên Supabase Dashboard → `Authentication → Users` → tìm user → `Edit → App Metadata` → thêm: `{"is_admin": "true"}`

### Bước 4: Tạo Cloudinary preset

1. Đăng ký [cloudinary.com](https://cloudinary.com)
2. `Settings → Upload → Upload presets` → nhấn **Add upload preset** → chọn **Unsigned** → lưu
3. Ghi lại **Cloud name** (trên Dashboard) và **Preset name**

### Bước 5: Cấu hình `config.js`

Mở file `config.js` → sửa phần `DEFAULTS`:

```js
const DEFAULTS = Object.freeze({
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...key-cua-ban...',
  CLOUDINARY_CLOUD_NAME: 'ten-cloud-cua-ban',
  CLOUDINARY_UPLOAD_PRESET: 'preset-cua-ban',
  ANILIST_API_URL: 'https://graphql.anilist.co',  // giữ nguyên
  GITHUB_SUBS_OWNER: 'ten-github-cua-ban',         // repo phụ đề riêng (hoặc bỏ trống)
  GITHUB_SUBS_REPO: 'ten-repo-phu-de',
  GITHUB_SUBS_BRANCH: 'main',
  GITHUB_SUBS_PATH: 'subs'
});
```

### Bước 6: Deploy

- **GitHub Pages:** push code → Settings → Pages → chọn branch → xong
- **Netlify:** kéo thả thư mục → xong
- Kiểm tra trang live → đăng nhập admin → tạo anime đầu tiên

### Bước 7 (tuỳ chọn): Tách phụ đề riêng

Nếu muốn dùng phụ đề `.ass` tự động:
1. Tạo repo GitHub chứa file `.ass` (tham khảo cấu trúc repo `Kull-Vietsub/subs/`)
2. Sửa `GITHUB_SUBS_OWNER` / `GITHUB_SUBS_REPO` trong `config.js` để trỏ repo của bạn

---

## 🎨 Cá nhân hóa (đổi tên, logo, màu sắc, footer)

Sau khi fork/duplicate, bạn có thể dễ dàng thay đổi giao diện. Dưới đây là danh sách **cần sửa file nào** (không cần tìm dòng cụ thể — Ctrl+F trong file là thấy ngay):

| Muốn thay đổi | Sửa file |
|---|---|
| **Tiêu đề tab trình duyệt** (chữ trên tab + khi Ctrl+U xem source) | `index.html` — thẻ `<title>` |
| **Mô tả SEO** (hiện khi Google tìm thấy trang) | `index.html` — thẻ `<meta name="description">` |
| **Màu thanh địa chỉ trên mobile** (theme color) | `index.html` — thẻ `<meta name="theme-color">` |
| **Logo/icon trang web** (favicon — biểu tượng trên tab / bookmark) | Thay file `favicon.svg` (hoặc thêm file `.ico`/`.png` + sửa link trong `index.html`) |
| **Tên brand góc trái header** (hiện "Kull*Anime*") | `index.html` — tìm `id="brandName"` |
| **Emoji logo cạnh brand** (hiện 🌸) | `index.html` — tìm `class="brand-logo"` |
| **Footer** (dòng chữ dưới cùng + link GitHub) | `index.html` — tìm `<footer` |
| **Tên tự đổi theo tab** (KullAnime ↔ KullSong khi chuyển tab) | `app.js` — tìm `brandName` (phần đổi brand theo tab, gần cuối file) |
| **Toàn bộ màu sắc / giao diện** (background, chữ, viền, gradient...) | `styles.css` — tìm các biến `--` ở đầu file (VD: `--bg`, `--text`, `--glass-border`...) |
| **Font chữ** | `styles.css` — tìm `font-family` |
| **Ảnh chia sẻ mạng xã hội** (Open Graph) | `index.html` — thêm thẻ `<meta property="og:image">` trỏ ảnh hosted online |

> 💡 **Mẹo:** Toàn bộ UI chỉ nằm trong **1 file `index.html`** + **1 file `styles.css`** — không cần mở nhiều file. Tìm bằng Ctrl+F với từ khóa tiếng Anh (header, footer, brand, nav, modal...) sẽ thấy ngay.

---

## ⚖️ Giới hạn dịch vụ Free đang sử dụng

Dưới đây là các giới hạn chính khi dùng bản free. Hầu hết site cá nhân **không chạm đến** — nhưng nên biết để tránh bất ngờ.

### GitHub Pages

| Mục | Giới hạn free |
|---|---|
| Kích thước repo | 1 GB |
| Bandwidth | ~100 GB / tháng |
| Build | 10 build / giờ — site HTML/JS này **không cần build** nên gần như vô hạn |
| Custom domain | Có (cấu hình CNAME) |

> ℹ️ Site HTML/JS thuần **không cần build** → GitHub Pages chỉ serve file tĩnh → giới hạn bandwidth là giới hạn duy nhất.

### Supabase (Free Plan)

| Mục | Giới hạn free |
|---|---|
| Database dung lượng | 500 MB |
| Storage dung lượng | 1 GB |
| Bandwidth | 5 GB / tháng |
| MAU (Monthly Active Users) | 50.000 |
| Auth users | Không giới hạn (trong 50k MAU hoạt động) |
| Project tự sleep | Ngủ sau 7 ngày không hoạt động → thức lại trong ~30s khi có request |
| Edge Functions | 500K invocation / tháng |

> ℹ️ Site cá nhân gần như **không bao giờ chạm** giới hạn Supabase free. Lưu ý 500 MB database: nếu up nhiều ảnh bình luận sẽ đầy nhanh (nên dùng Cloudinary cho ảnh).

### Cloudinary (Free Plan)

| Mục | Giới hạn free |
|---|---|
| Storage | 25 GB |
| Bandwidth (transformations) | 25 GB / tháng |
| Bandwidth (nhúng ảnh trực tiếp — fetch) | **Không giới hạn** |
| Presets | 10 unsigned presets |

> ℹ️ Ảnh bình luận upload lên Cloudinary chủ yếu **fetch** (load URL trực tiếp từ CDN) → bandwidth **gần như không bị giới hạn**. Giới hạn chính là storage 25 GB.

### AniList GraphQL API

| Mục | Giới hạn |
|---|---|
| Chi phí | Miễn phí |
| API key | **Không cần** — gọi trực tiếp `https://graphql.anilist.co` |
| Rate limit | ~90 request / phút |
| Dữ liệu | Tên, poster, synopsis, seiyuu, studio, genre... |

> ℹ️ AniList là nguồn primary cho auto-fill. Miễn phí, ổn định, không cần đăng ký — **không có rate limit thực tế** đối với site cá nhân.

### Jikan / MyAnimeList API (Fallback)

| Mục | Giới hạn |
|---|---|
| Chi phí | Miễn phí |
| API key | **Không cần** |
| Rate limit | **Chặt**: ~3 request/giây, 60 request/phút |
| Tính ổn định | **Hay quá tải** (504, 429) — chỉ gọi khi AniList tạm ngừng |

> ⚠️ Jikan **rất dễ bị rate limit** → site chỉ gọi khi AniList không hoạt động, có caching ở browser. Nếu cần gọi nhiều, nên tự host Jikan hoặc dùng MAL unofficial API.

### CDN Libraries (jsDelivr / Cloudflare)

| Library | CDN | Ghi chú |
|---|---|---|
| DOMPurify (chống XSS) | Cloudflare → jsDelivr (fallback) | Miễn phí, uptime cao |
| Marked.js (Markdown) | jsDelivr | Miễn phí |
| Supabase JS Client | jsDelivr | Miễn phí |
| YouTube IFrame API | youtube.com | Miễn phí |

### YouTube (Player nhúng)

| Mục | Giới hạn |
|---|---|
| Quota | 10.000 units / ngày (1 lần phát = ~50 units → ~200 video/ngày) |
| Thumbnail (`i.ytimg.com`) | Không giới hạn chính thức; có thể rate limit nếu load hàng trăm ảnh cùng lúc |

---

## 🔒 Bảo mật

- **RLS** trên Supabase: public chỉ đọc `animes`/`songs`; bình luận public đọc/ghi; ghi/sửa/xóa dữ liệu admin chỉ dành cho `is_admin`
- **DOMPurify** lọc mọi HTML render từ user (chống XSS) + fallback sanitizer tự viết khi CDN lỗi
- **Captcha + Rate limit (30s/lần)** chống spam bình luận — captcha chỉ bắt khách chưa đăng nhập; tài khoản đã đăng nhập (thành viên/admin) không cần captcha
- **Rate-limit SERVER-SIDE** (trigger `prevent_comment_spam` trong SQL): tối đa **1 bình luận forum / 30 giây / người**, tính theo `user_id` (server gán qua `auth.uid()`). Kẻ mở F12 gọi thẳng API cũng bị chặn
- **Validate nội dung server-side** (trigger `validate_comment_content`): chặn bình luận rỗng hoặc quá dài (> 5000 ký tự) ngay tại DB
- **Auto-block khách spam** (trigger `auto_block_guest_spam`): khách chưa đăng nhập dùng cùng 1 tên gửi ≥ 10 bình luận trong 10 phút thì bị khóa tên đó 12 giờ (bảng `blocked_guest_names` chỉ admin mới đọc được)
- **Cache dữ liệu công khai** (24h TTL): `localStorage` lưu toàn bộ danh sách anime/songs/chat — lần đầu load đọc từ cache, không gửi request Supabase. Nút **🔄 Tải lại** dùng RPC `get_data_versions()` (1 request nhẹ) để kiểm tra phiên bản trước khi fetch — tránh lãng phí quota khi dữ liệu chưa thay đổi
- **Tắt self-registration** (khuyến dùng): site chỉ có tài khoản do **admin tự tạo** — người ngoài không thể đăng ký, triệt tiêu spam tài khoản. Bật trong Dashboard:
  - `Authentication → Sign In / Up → Profile` → bật **"Disable sign ups"** → **Save**
- `.env.local` / key riêng tư không commit — chỉ chứa key publishable ở client

### Những gì AN TOÀN khi public trong `config.js`

| Thông tin | Tại sao an toàn |
|---|---|
| `SUPABASE_URL` | Chỉ là endpoint — quyền truy cập dữ liệu kiểm soát bằng **RLS** ở tầng database |
| `SUPABASE_ANON_KEY` | Key "publishable" — chỉ đọc data public + ghi bình luận, **không** sửa/xóa anime hay truy cập admin |
| `CLOUDINARY_CLOUD_NAME` + `UPLOAD_PRESET` | Preset "unsigned" — chỉ upload ảnh, **không** xóa/sửa file đã upload |

### KHÔNG BAO GIỜ để trong client / repo

| Thông tin | Tại sao nguy hiểm |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Bỏ qua RLS → đọc/ghi/xóa mọi data |
| `CLOUDINARY_API_SECRET` | Xóa/transform mọi ảnh trên Cloudinary |
| JWT / password | Đăng nhập được mọi tài khoản |

> ⚠️ Khi fork, **nên tạo Supabase/Cloudinary project riêng** và sửa `DEFAULTS` trong `config.js` — nếu không, dữ liệu bạn thêm sẽ chung database với bản gốc.

## 📌 Lưu ý cuối

- Quyền admin kiểm tra qua `app_metadata.is_admin = 'true'` (không hardcode email)
- Site **hoàn toàn tĩnh** — không cần Node.js server, không cần functions — chỉ cần host file HTML/CSS/JS