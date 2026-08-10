# KullAnime 🎌

Website quản lý, đánh giá và chia sẻ danh sách Anime cá nhân & cộng đồng. Tự động cào dữ liệu từ MyAnimeList qua Jikan API v4.

## 🚀 Tech Stack

- **Framework:** Next.js 14 (App Router), React 18, Tailwind CSS
- **Database & Auth:** Supabase (PostgreSQL, RLS, Auth Email/Password)
- **Media Storage:** Cloudinary (upload ảnh) & Link ảnh ngoài
- **External API:** Jikan API v4 (https://api.jikan.moe/v4)
- **Hosting:** Vercel

## 📁 Cấu trúc dự án

```
├── src/
│   ├── actions/          # Server Actions (auth, anime, comments, admin)
│   ├── app/              # App Router pages
│   │   ├── anime/[id]/   # Trang chi tiết anime
│   │   ├── dashboard/    # Admin Dashboard
│   │   ├── login/        # Đăng nhập
│   │   ├── register/     # Đăng ký
│   │   ├── search/       # Tìm kiếm & Cross-filter
│   │   └── u/[username]/ # User Profile
│   ├── components/       # UI Components
│   ├── lib/              # Lib (Supabase, Jikan API, Cloudinary, Validation)
│   ├── types/            # TypeScript types
│   └── middleware.ts     # Session middleware
├── supabase/
│   └── schema.sql        # Database schema + RLS policies
└── .env.local            # Environment variables
```

## ⚙️ Cài đặt

### 1. Môi trường (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-upload-preset
NEXT_PUBLIC_DEFAULT_HOMEPAGE_TAB=community
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Cài đặt & chạy

```bash
npm install
npm run dev
```

### 3. Tạo database trên Supabase

1. Tạo project trên [Supabase](https://supabase.com)
2. Vào **SQL Editor**
3. Chạy toàn bộ nội dung file `supabase/schema.sql`
4. Tạo admin user:
   - Đăng ký user qua trang `/register`
   - Chạy SQL: `UPDATE public.profiles SET role = 'admin' WHERE id = 'UUID_CỦA_USER';`

### 4. Cấu hình Cloudinary

1. Tạo account tại [Cloudinary](https://cloudinary.com)
2. Tạo **Upload Preset** với mode **Unsigned**
3. Điền vào `.env.local`

## ✨ Tính năng

- **Homepage:** Tab Community List / Admin List, Filter theo Tên/Studio/Seiyuu/Ca sĩ
- **Thêm Anime thông minh:** Realtime search Jikan API, tự động lấy Studio, Seiyuu, Trailer, Theme Songs (OP/ED/Insert)
- **Trang chi tiết:** Trailer YouTube, Gallery ảnh (Cover tự động làm ảnh đầu tiên), Cross-filter Studio/Seiyuu/Ca sĩ, Bình luận (Ẩn danh + Bộ lọc từ cấm + Rate limit)
- **User Profile:** `/u/[username]`, chế độ riêng tư
- **Admin Dashboard:** Quản lý anime/bình luận/users, Quản lý từ cấm, Ban user, Export JSON/CSV

## 🔒 Bảo mật

- **RLS (Row Level Security):** Mọi người đọc public, user chỉ sửa/xóa dữ liệu của mình, admin toàn quyền
- **Zod validation:** Chống SQL Injection & XSS
- **Rate Limiting:** 2 bình luận/phút/IP cho khách ẩn danh
- **Bad words filter:** Từ cấm bị chặn hoặc biến thành `***`

## 🚀 Deploy lên Vercel

1. Push code lên GitHub
2. Import vào [Vercel](https://vercel.com)
3. Điền đầy đủ env variables
4. Deploy!