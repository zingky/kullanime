/* ============================================================
   config.js — Cấu hình App (Supabase, Cloudinary, AniList, GitHub)
   ------------------------------------------------------------
   Đây là website tĩnh 100%, không có build-time. file `.env.local`
   ở thư mục gốc dùng để lưu các giá trị nhạy cảm (không commit).
   Ở môi trường dev (mở qua http server), `loadConfig()` sẽ cố gắng
   fetch `.env.local` để đọc trực tiếp. Khi không đọc được (vd: khi
   deploy lên GitHub Pages nơi file này không được serve) thì rơi về
   các giá trị mặc định công khai bên dưới.

   ⚠️ LƯU Ý BẢO MẬT:
   - SUPABASE_ANON_KEY là khóa "publishable" — an toàn để đưa lên
     trình duyệt. Quyền truy cập dữ liệu được kiểm soát CHẶT CHẼ
     bằng RLS ở tầng Supabase (xem supabase-setup.sql), KHÔNG dựa
     vào việc giấu key.
   - UPLOAD_PRESET là preset "unsigned" — cho phép tải ảnh bình luận
     lên Cloudinary mà không cần API secret.
   - KHÔNG BAO GIỜ đặt SUPABASE_SERVICE_ROLE_KEY hoặc cloudinary
     API SECRET ở đây — những thứ đó phải nằm ở server-side.
   ============================================================ */

(function (global) {
  'use strict';

  const DEFAULTS = Object.freeze({
    // Supabase
    SUPABASE_URL: 'https://mtyfhywujsicnkgtxwya.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_bW0XvOK3wp8gMJvgpykB9g_LUu1t6Xn',

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: 'datkull',
    CLOUDINARY_UPLOAD_PRESET: 'datkull_unsign',

    // AniList GraphQL API — miễn phí, không cần key, ổn định (thay cho Jikan/MAL hay bị quá tải)
    ANILIST_API_URL: 'https://graphql.anilist.co',

    // GitHub repo phụ đề .ass (Kull-Vietsub)
    GITHUB_SUBS_OWNER: 'zingky',
    GITHUB_SUBS_REPO: 'Kull-Vietsub',
    GITHUB_SUBS_BRANCH: 'main',
    GITHUB_SUBS_PATH: 'subs'
  });

  // Đọc biến toàn cục nếu có (nhúng trực tiếp vào HTML trước config.js)
  function readGlobal(name) {
    if (global.__APP_ENV__ && typeof global.__APP_ENV__[name] !== 'undefined') {
      return global.__APP_ENV__[name];
    }
    return undefined;
  }

  // Parse nội dung file có dạng KEY=value (giống .env)
  function parseEnvText(text) {
    const result = {};
    if (!text) return result;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue; // bỏ comment/trống
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Bỏ dấu nháy đơn/kép bao quanh nếu có
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  }

  const CONFIG = {};

  // Hàm async để có thể fetch .env.local ở dev
  CONFIG.load = async function load() {
    const envVars = {};

    // 1) Ưu tiên: biến toàn cục __APP_ENV__ (nhúng trực tiếp trên HTML)
    for (const key of Object.keys(DEFAULTS)) {
      const v = readGlobal(key);
      if (typeof v !== 'undefined' && v !== null && v !== '') envVars[key] = v;
    }

    // 2) Thử đọc .env.local (chỉ ở môi trường có http server serve file này)
    const needsFetch = Object.keys(envVars).length === 0;
    if (needsFetch && typeof fetch === 'function') {
      try {
        const res = await fetch('./.env.local', { cache: 'no-store' });
        if (res.ok) {
          const text = await res.text();
          const parsed = parseEnvText(text);
          for (const key of Object.keys(DEFAULTS)) {
            const envKey = 'NEXT_PUBLIC_' + key;
            if (parsed[envKey]) envVars[key] = parsed[envKey];
          }
        }
      } catch (_e) {
        /* .env.local không được serve (vd deploy tĩnh) -> dùng default */
      }
    }

    // 3) Rơi về giá trị mặc định công khai
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof envVars[key] === 'undefined' || envVars[key] === '') {
        envVars[key] = DEFAULTS[key];
      }
    }

    CONFIG.SUPABASE_URL = envVars.SUPABASE_URL;
    CONFIG.SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY;
    CONFIG.CLOUDINARY_CLOUD_NAME = envVars.CLOUDINARY_CLOUD_NAME;
    CONFIG.CLOUDINARY_UPLOAD_PRESET = envVars.CLOUDINARY_UPLOAD_PRESET;
    CONFIG.ANILIST_API_URL = envVars.ANILIST_API_URL;
    CONFIG.GITHUB_SUBS_OWNER = envVars.GITHUB_SUBS_OWNER;
    CONFIG.GITHUB_SUBS_REPO = envVars.GITHUB_SUBS_REPO;
    CONFIG.GITHUB_SUBS_BRANCH = envVars.GITHUB_SUBS_BRANCH;
    CONFIG.GITHUB_SUBS_PATH = envVars.GITHUB_SUBS_PATH;

    // URL tiện ích
    CONFIG.SUPABASE_REST = CONFIG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';
    CONFIG.CLOUDINARY_UPLOAD_URL =
      'https://api.cloudinary.com/v1_1/' +
      CONFIG.CLOUDINARY_CLOUD_NAME +
      '/image/upload';
    CONFIG.GITHUB_SUBS_LIST_URL =
      'https://api.github.com/repos/' +
      CONFIG.GITHUB_SUBS_OWNER +
      '/' +
      CONFIG.GITHUB_SUBS_REPO +
      '/contents/' +
      CONFIG.GITHUB_SUBS_PATH +
      '?ref=' +
      CONFIG.GITHUB_SUBS_BRANCH;
    CONFIG.GITHUB_RAW_BASE =
      'https://raw.githubusercontent.com/' +
      CONFIG.GITHUB_SUBS_OWNER +
      '/' +
      CONFIG.GITHUB_SUBS_REPO +
      '/' +
      CONFIG.GITHUB_SUBS_BRANCH +
      '/' +
      CONFIG.GITHUB_SUBS_PATH;

    return CONFIG;
  };

  global.AppConfig = CONFIG;
})(window);
