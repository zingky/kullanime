# 📧 Cấu hình Email Template tiếng Việt + SMTP Resend (Supabase Auth)

Hướng dẫn chi tiết để gửi email xác thực đăng ký & quên mật khẩu bằng **tiếng Việt chuyên nghiệp** qua **SMTP Resend**.

---

## 1️⃣ Cấu hình SMTP Resend trên Supabase

> **Yêu cầu:** Tài khoản miễn phí tại [resend.com](https://resend.com) — 3.000 emails/tháng.

### Bước 1: Lấy API Key trên Resend
1. Vào **https://resend.com/api-keys** → bấm **Create API Key**
2. Copy chuỗi key dạng: `re_xxxxxxxxxxxx`
3. *(Tùy chọn)* Thêm domain của bạn tại **Domains** (vd: `kullanime.com`) → được phép dùng SMTP từ domain riêng. Nếu chưa có domain → dùng địa chỉ mặc định `onboarding@resend.dev`.

### Bước 2: Cấu hình SMTP trong Supabase
1. Vào **Supabase Dashboard** → Project của bạn → **Project Settings** → **Authentication** → mục **SMTP Settings**
2. Nhập các giá trị:

| Trường | Giá trị |
|--------|---------|
| **Enable Custom SMTP** | ✅ Bật |
| **Sender email address** | `KullAnime <onboarding@resend.dev>` (hoặc `no-reply@kullanime.com` nếu có domain riêng) |
| **Host** | `smtp.resend.com` |
| **Port** | `465` |
| **Username** | `resend` |
| **Password** | *(dán API Key `re_...` lấy ở Bước 1)* |

3. Bấm **Save**

> ⚠️ Nếu email mặc định của Resend chỉ cho phép gửi tới email bạn đã đăng ký tài khoản Resend → dùng domain riêng hoặc tạm dùng email của bạn để test.

---

## 2️⃣ Cập nhật nội dung Email Templates (tiếng Việt)

Vào **Supabase Dashboard → Authentication → Email Templates** → chỉnh từng template:

---

### ✉️ TEMPLATE 1: Confirm signup (Xác nhận đăng ký)

**Subject:**
```
[KullAnime] Xác nhận địa chỉ Email của bạn
```

**Body:**
```html
<h2>Chào mừng bạn đến với KullAnime! 🎉</h2>

<p>Chào {{ .Email }},</p>
<p>Cảm ơn bạn đã đăng ký tài khoản KullAnime. Vui lòng bấm vào nút bên dưới để xác thực địa chỉ email và hoàn tất đăng ký:</p>

<p style="margin: 20px 0;">
  <a href="{{ .ConfirmationURL }}" style="background-color: #a855f7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
    Xác thực tài khoản ngay
  </a>
</p>

<p style="color: #666; font-size: 13px;">
  Lưu ý: Link này sẽ hết hạn sau 30 phút.<br>
  Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
</p>
```

---

### ✉️ TEMPLATE 2: Reset password (Đặt lại mật khẩu)

**Subject:**
```
[KullAnime] Yêu cầu đặt lại mật khẩu
```

**Body:**
```html
<h2>Yêu cầu đặt lại mật khẩu 🔑</h2>

<p>Chào {{ .Email }},</p>
<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản KullAnime của bạn. Bấm vào nút bên dưới để tạo mật khẩu mới:</p>

<p style="margin: 20px 0;">
  <a href="{{ .RedirectTo }}" style="background-color: #06b6d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
    Đặt lại mật khẩu
  </a>
</p>

<p style="color: #666; font-size: 13px;">
  Nếu bạn không gửi yêu cầu này, mật khẩu của bạn vẫn an toàn và bạn có thể bỏ qua email này.
</p>
```

---

### ✉️ TEMPLATE 3 (Tùy chọn): Magic Link (nếu dùng đăng nhập không mật khẩu)

**Subject:**
```
[KullAnime] Đăng nhập vào tài khoản của bạn
```

**Body:**
```html
<h2>Đăng nhập KullAnime ✨</h2>

<p>Bấm vào nút bên dưới để đăng nhập an toàn:</p>

<p style="margin: 20px 0;">
  <a href="{{ .ConfirmationURL }}" style="background-color: #a855f7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
    Đăng nhập ngay
  </a>
</p>

<p style="color: #666; font-size: 13px;">Link chỉ có hiệu lực trong 30 phút.</p>
```

---

## 3️⃣ Cấu hình Redirect URL (Khi user bấm link trong email)

Vào **Supabase Dashboard → Authentication → URL Configuration**:

| Mục | Giá trị |
|-----|---------|
| **Site URL** | `http://localhost:3000` (dev) hoặc `https://kullanime.vercel.app` (prod) |
| **Redirect URLs** | Thêm `http://localhost:3000/**,https://kullanime.vercel.app/**` |

> Code frontend đã set `emailRedirectTo` = site hiện tại → sau khi xác thực user sẽ quay về `/?verified=true`.

---

## 4️⃣ Kiểm tra / Giải quyết "email rate limit exceeded"

Free Tier Supabase giới hạn **~60 request auth/giờ/IP**. Nếu gặp lỗi này:

1. **Không bấm đăng ký lại liên tục** — chỉ làm nặng thêm
2. **Kiểm tra** Dashboard → **Authentication → Users** xem tài khoản đã tồn tại chưa
3. **Bật tùy chọn xác thực nhanh (chỉ khi dev):**
   - **Authentication → Sign In / Up → Confirm email** → tắt → **Save**
   - User đăng ký sẽ vào thẳng mà không cần email
4. Hoặc **kiểm tra Email Template + SMTP Resend** (mục 1-2) → bấm **Resend** trong Users

---

## ✅ Checklist hoàn tất

- [ ] Có API Key Resend (`re_...`)
- [ ] SMTP Settings trong Supabase = `smtp.resend.com:465`
- [ ] Confirm signup template = tiếng Việt (màu tím #a855f7)
- [ ] Reset password template = tiếng Việt (màu cyan #06b6d4)
- [ ] Site URL + Redirect URLs đúng (localhost + Vercel)
- [ ] Frontend: Modal "Email xác thực đã gửi" hiển thị sau đăng ký ✅
- [ ] Frontend: `emailRedirectTo` đã set ✅