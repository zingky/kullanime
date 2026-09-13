/*
 * KullAnime — site tĩnh (GitHub Pages + Supabase)
 * Dùng:
 *   - Supabase (DB anime + bình luận ngắn)
 *   - Cloudinary (upload ảnh comment)
 *   - AniList GraphQL (auto-fill thông tin anime, diễn viên lồng tiếng)
 *   - GitHub repo Kull-Vietsub (file phụ đề .ass, tự động lấy topic)
 *
 * Hướng dẫn sửa config khi fork:
 *   1. Tạo project Supabase riêng → điền URL + anon key vào DEFAULTS
 *   2. Tạo Cloudinary account → điền cloud name + unsigned preset
 *   3. Nếu muốn dùng phụ đề .ass của riêng mình,
 *      sửa GITHUB_SUBS_OWNER / GITHUB_SUBS_REPO / GITHUB_SUBS_PATH
 *
 * Lưu ý bảo mật:
 *   - Khóa anon Supabase và upload preset Cloudinary là public —
 *     an toàn khi đưa lên trình duyệt, vì RLS/Supabase và preset
 *     unsigned kiểm soát quyền, không dựa vào việc giấu key.
 *   - KHÔNG đưa service_role key hay Cloudinary API secret vào đây.
 *
 * Cách dùng trong code:
 *   - App đọc config sau khi tải xong config.js:
 *       const cfg = await AppConfig.load();
 *     và dùng các trường cfg.SUPABASE_URL, cfg.GITHUB_RAW_BASE, ...
 *   - DEFAULTS là giá trị mặc định dùng được ngay khi không có
 *     .env.local / __APP_ENV__.
 */


(function (global) {
  'use strict';

  const DEFAULTS = Object.freeze({
    // Supabase
    SUPABASE_URL: 'https://mtyfhywujsicnkgtxwya.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_bW0XvOK3wp8gMJvgpykB9g_LUu1t6Xn',

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: 'kull',
    CLOUDINARY_UPLOAD_PRESET: 'kull_unsign',

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
