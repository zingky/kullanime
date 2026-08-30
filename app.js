/* ============================================================
   app.js — Toàn bộ logic KullAnime (Vanilla JS, ES6+ modular)
   ------------------------------------------------------------
   Gồm: Supabase Client, Cloudinary Upload, YouTube Player,
   Auto-fetch GitHub .ass, AniList API Auto-fill, Rich Text Parser
   (BBCode + Markdown), DOMPurify (chống XSS), Admin Panel,
   Rate limiting & Captcha chống spam.
   ============================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────
     1. KHỞI TẠO TOÀN CỤC
     ────────────────────────────────────────────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

  const State = {
    config: null,
    supabase: null,
    animes: [],
    songs: [],
    subsFiles: [],         // danh sách file .ass từ GitHub
    currentAnime: null,    // anime đang xem trong modal
    currentSong: null,     // bài hát đang phát
    subtitles: [],         // [ {start,end,romaji,vietsub} ] parse từ .ass
    subsEnabled: false,
    subsTick: null,
    isAdmin: false,
    isLoggedIn: false,   // đã đăng nhập (thành viên hoặc admin)
    adminEmail: '',
    nickname: '',        // tên hiển thị (nickname) của tài khoản đã đăng nhập
    youtubeReady: false,
    ytPlayer: null,
    // Rate limit comment
    lastCommentAt: 0,
    lastChatAt: 0,
    chatTimer: null,
    // Captcha hiện tại
    captcha: { a: 0, b: 0, result: 0 },
    chatCaptcha: { a: 0, b: 0, result: 0 },
    // AniList (search auto-fill abort)
    jikanAbort: null,
    // Phân trang hiển thị trên 1 trang
    animeVisible: 10,      // số anime render mỗi lượt
    songVisible: 15,       // số bài hát render mỗi lượt
    commentAll: [],        // toàn bộ bình luận của anime đang mở
    commentVisible: 20,    // số bình luận anime hiển thị hiện tại
    chatAll: [],           // toàn bộ tin chat chung
    chatVisible: 3,        // số tin chat hiển thị (thu gọn = 3)
    chatExpanded: false    // trạng thái mở rộng sticky chat
  };

  const REFRESH_MS = 60000; // tự làm mới dữ liệu công khai mỗi phút

  /* ──────────────────────────────────────────────────────
     2. TIỆN ÍCH (helpers)
     ────────────────────────────────────────────────────── */
  function toast(msg, type = 'info', duration = 3200) {
    const box = $('#toastContainer');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 350); }, duration);
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_e) { return ''; }
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return 'vừa xong';
    if (secs < 3600) return Math.floor(secs / 60) + ' phút trước';
    if (secs < 86400) return Math.floor(secs / 3600) + ' giờ trước';
    if (secs < 604800) return Math.floor(secs / 86400) + ' ngày trước';
    return formatDate(iso);
  }

  function parseYoutubeId(input) {
    if (!input) return '';
    const s = String(input).trim();
    // ID thuần 11 ký tự
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0].split('?')[0];
      if (u.searchParams.has('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    } catch (_e) { /* not a url */ }
    const m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function posterFallback(anime) {
    const initial = (anime.title || '?').trim().charAt(0).toUpperCase();
    return '<div class="poster-fallback" aria-label="Không có poster">' + esc(initial || '🎞') + '</div>';
  }
  // Fallback poster: thay <img> hỏng bằng khối poster-fallback — dùng hàm toàn cục
  // thay vì nhúng HTML thô vào onerror="..." (tránh dấu " cắt cụt attribute gây ký tự " /> dư)
  window.__posterFallback = function (img, title) {
    if (!img || !img.parentNode) return;
    const initial = String(title || '?').trim().charAt(0).toUpperCase() || '🎞';
    const div = document.createElement('div');
    div.className = 'poster-fallback';
    div.setAttribute('aria-label', 'Không có poster');
    div.textContent = initial;
    img.replaceWith(div);
  };

  function openModal(id) {
    const m = $('#' + id);
    if (!m) return;
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
  }
  function closeModal(id) {
    const m = $('#' + id);
    if (!m) return;
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
  }

  // Chặn cuộn nền khi mở modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal-overlay.open').forEach((m) => {
        m.classList.remove('open');
        m.setAttribute('aria-hidden', 'true');
      });
    }
  });
  $$('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
      }
    });
  });
  $$('.modal-close, [data-close]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.getAttribute('data-close') || el.closest('.modal-overlay')?.id;
      if (target) closeModal(target);
    });
  });

  function statusClass(status) {
    const s = String(status || '');
    if (/hoàn|finish|completed/i.test(s)) return 'finish';
    if (/sắp|upcoming|tba/i.test(s)) return 'upcoming';
    return '';
  }

  /* ──────────────────────────────────────────────────────
     3. RICH TEXT PARSER (BBCode + Markdown) + DOMPurify
     ────────────────────────────────────────────────────── */
  // Chuyển BBCode ([b]...[/b]) thành Markdown trước khi đưa qua marked.js
  function bbcodeToMarkdown(input) {
    let s = String(input || '');
    // Quote — giữ cấu trúc
    s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, (m, inner) => {
      return '\n> ' + inner.trim().split('\n').map((l) => l.trim()).join('\n> ') + '\n';
    });
    // Các thẻ inline
    s = s.replace(/\[b\]/gi, '**').replace(/\[\/b\]/gi, '**');
    s = s.replace(/\[i\]/gi, '*').replace(/\[\/i\]/gi, '*');
    s = s.replace(/\[u\]/gi, '<u>').replace(/\[\/u\]/gi, '</u>');
    s = s.replace(/\[s\]/gi, '~~').replace(/\[\/s\]/gi, '~~');
    s = s.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (m, inner) => {
      return '\n```\n' + inner.replace(/```/g, '').trim() + '\n```\n';
    });
    s = s.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '[$2]($1)');
    s = s.replace(/\[url\]([^\]]+)\[\/url\]/gi, '[$1]($1)');
    s = s.replace(/\[img\]([^\]]+)\[\/img\]/gi, '![]($1)');
    s = s.replace(/\[img=([^\]]+)\]/gi, '![]($1)');
    return s;
  }

  // Fallback sanitizer khi DOMPurify CDN không tải được.
  // Chỉ cho phép một tập tag/attr an toàn, loại bỏ mọi script/event/iframe.
  const SAFE_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
    'code', 'pre', 'blockquote', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'img']);
  function sanitizeHTMLFallback(html) {
    if (typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'script'],
        FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
        ADD_ATTR: ['target', 'rel', 'class']
      });
    }
    // Không có DOMPurify (CDN lỗi) → tự làm sạch qua DOM (vẫn an toàn XSS)
    const doc = new DOMParser().parseFromString('<div id="__root">' + html + '</div>', 'text/html');
    const root = doc.getElementById('__root');
    function walk(node) {
      // Xử lý text node: yên tâm giữ nguyên
      Array.from(node.children || []).forEach((el) => {
        const tag = (el.tagName || '').toLowerCase();
        if (!SAFE_TAGS.has(tag) || /script|style|iframe|form|input|button|object|embed|link|meta/i.test(tag)) {
          // Thay thế element nguy hiểm bằng text thuần (mất tag nhưng an toàn)
          const txt = document.createTextNode(el.textContent || '');
          el.replaceWith(txt);
          return;
        }
        // Lọc attribute: chỉ giữ attr an toàn, và chỉ trên <a>/<img>
        Array.from(el.attributes || []).forEach((attr) => {
          const name = attr.name.toLowerCase();
          const isHref = name === 'href' && (tag === 'a');
          const isImg = (name === 'src' || name === 'alt') && tag === 'img';
          const isSafeCommon = ['title', 'alt'].includes(name);
          const isTargetRel = name === 'target' || name === 'rel';
          if (!(isHref || isImg || isSafeCommon || isTargetRel)) {
            el.removeAttribute(attr.name);
          }
          // Chỉ cho href/src bắt đầu bằng http(s) hoặc # , chặn javascript:
          if ((name === 'href' || name === 'src') && !/^(https?:|#|\.|\/)/i.test(String(attr.value || ''))) {
            el.removeAttribute(attr.name);
            if (name === 'href') el.textContent = '[' + (el.textContent || '') + ']';
          }
        });
        if (tag === 'a') {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
        walk(el);
      });
    }
    walk(root);
    return root.innerHTML;
  }

  // Sanitize XSS. KHÔNG BAO GIỜ render HTML chưa qua đây.
  function renderRichText(raw) {
    const md = bbcodeToMarkdown(raw || '');
    let html;
    try {
      html = marked.parse(md, { breaks: true, gfm: true });
    } catch (_e) {
      html = esc(md);
    }
    // DOMPurify triệt hạ 100% script/event handler/iframe độc hại;
    // nếu CDN DOMPurify lỗi (không tải được) thì dùng fallback an toàn thay vì crash.
    return sanitizeHTMLFallback(html);
  }

  // Bộ lọc từ cấm cơ bản (biến thành ***)
  const BAD_WORDS = ['fuck', 'shit', 'bitch', 'đmm', 'clmm', 'cmm', 'clgt', 'đụ', 'địt', 'lồn', 'cặc', 'buồi'];
  function filterBadWords(str) {
    let s = String(str || '');
    for (const w of BAD_WORDS) {
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      s = s.replace(re, '***');
    }
    return s;
  }

  /* ──────────────────────────────────────────────────────
     4. SUPABASE KHỞI TẠO & ĐỌC DỮ LIỆU
     ────────────────────────────────────────────────────── */
  async function initSupabase() {
    State.config = await AppConfig.load();
    // Tạo client Supabase từ CDN (window.supabase)
    const sb = window.supabase && window.supabase.createClient
      ? window.supabase.createClient(State.config.SUPABASE_URL, State.config.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        })
      : null;
    if (!sb) {
      toast('Không tải được Supabase client. Kiểm tra kết nối CDN.', 'error', 5000);
      return null;
    }
    State.supabase = sb;
    return sb;
  }

  async function refreshAuthState() {
    if (!State.supabase) return;
    const { data } = await State.supabase.auth.getSession();
    const session = data && data.session;
    State.isLoggedIn = !!session;
    State.adminEmail = session && session.user ? session.user.email : '';
    State.nickname = '';
    if (session && session.user) {
      const nm = (session.user.user_metadata || {}).nickname;
      State.nickname = (nm && String(nm).trim()) || (session.user.email || '').split('@')[0] || '';
    }
    applyAuthState();
    if (session) {
      const { data: uData, error: uErr } = await State.supabase.auth.getUser();
      if (!uErr && uData && uData.user) {
        const meta = uData.user.app_metadata || {};
        State.isAdmin = meta.is_admin === 'true' || meta.is_admin === true;
        const nm2 = (uData.user.user_metadata || {}).nickname;
        if (nm2 && String(nm2).trim()) State.nickname = String(nm2).trim();
        if (!nm2 && State.adminEmail) State.nickname = State.adminEmail.split('@')[0] || State.nickname;
        applyAuthState();
      }
    }
  }

  // Đồng bộ giao diện theo trạng thái đăng nhập (nút header + composer)
  function applyAuthState() {
    updateLoginUI();
    updateAuthUI();
  }

  // Ẩn/hiện ô tên hiển thị + captcha trong composer theo trạng thái đăng nhập
  function updateAuthUI() {
    const loggedIn = State.isLoggedIn;
    const name = State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || 'Thành viên';
    ['comment', 'chat'].forEach((pfx) => {
      const authorEl = $('#' + pfx + 'Author');
      const captchaWrap = $('#' + pfx + 'CaptchaWrap');
      const authLine = $('#' + pfx + 'AuthName');
      const authVal = $('#' + pfx + 'AuthNameVal');
      if (authorEl) authorEl.classList.toggle('hidden', loggedIn);
      if (captchaWrap) captchaWrap.classList.toggle('hidden', loggedIn);
      if (authLine) authLine.classList.toggle('hidden', !loggedIn);
      if (authVal) authVal.textContent = name;
    });
  }

  async function loadAnimes() {
    if (!State.supabase) return;
    const grid = $('#animeGrid');
    $('#animeLoading').classList.remove('hidden');
    $('#animeEmpty').classList.add('hidden');
    const { data, error } = await State.supabase
      .from('animes')
      .select('*')
      .order('created_at', { ascending: false });
    $('#animeLoading').classList.add('hidden');
    if (error) {
      console.error('Lỗi đọc animes:', error);
      toast('Không tải được danh sách anime: ' + error.message, 'error', 5000);
      return;
    }
    State.animes = data || [];
    renderAnimeGrid();
  }

  async function loadSongs() {
    if (!State.supabase) return;
    const list = $('#songList');
    $('#songLoading').classList.remove('hidden');
    $('#songEmpty').classList.add('hidden');
    const { data, error } = await State.supabase
      .from('songs')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    $('#songLoading').classList.add('hidden');
    if (error) {
      console.error('Lỗi đọc songs:', error);
      toast('Không tải được danh sách nhạc: ' + error.message, 'error', 5000);
      return;
    }
    State.songs = data || [];
    renderSongList();
  }


  /* ──────────────────────────────────────────────────────
     5. GITHUB: TỰ ĐỘNG LẤY DANH SÁCH FILE .ass
     ────────────────────────────────────────────────────── */
  async function fetchSubsFiles() {
    if (!State.config) return;
    const statusEl = $('#assStatus');
    try {
      statusEl.textContent = 'Đang kết nối Github...';
      const res = await fetch(State.config.GITHUB_SUBS_LIST_URL, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const files = Array.isArray(data) ? data : [];
      State.subsFiles = files
        .filter((f) => f.type === 'file' && /\.ass$/i.test(f.name))
        .map((f) => ({
          name: f.name,
          path: f.path,
          download_url: f.download_url,
          size: f.size
        }));
      renderAssStatus();
    } catch (err) {
      console.warn('Không lấy được danh sách .ass từ GitHub:', err.message);
      State.subsFiles = [];
      if (statusEl) {
        statusEl.textContent = '⚠️ Không tải được kho phụ đề GitHub (kiểm tra internet / rate limit).';
      }
    }
  }

  function renderAssStatus() {
    const statusEl = $('#assStatus');
    const list = $('#assFileList');
    if (!statusEl) return;
    if (State.subsFiles.length === 0) {
      statusEl.textContent = 'Không có file .ass nào trong kho.';
      if (list) list.innerHTML = '';
      return;
    }
    statusEl.textContent = 'Tìm thấy ' + State.subsFiles.length + ' file .ass sẵn sàng.';
    if (list) {
      list.innerHTML = State.subsFiles.slice(0, 6).map((f) =>
        '<div class="ass-file-item"><span class="dot"></span>' + esc(f.name) + '</div>'
      ).join('');
      if (State.subsFiles.length > 6) {
        list.innerHTML += '<div class="ass-file-item">… và ' + (State.subsFiles.length - 6) + ' file khác</div>';
      }
    }
  }

  // Khớp file .ass cho 1 bài hát: theo ass_file, hoặc theo youtube_id trong tên file
  function matchSubtitleFor(song) {
    if (!song || State.subsFiles.length === 0) return null;
    const yid = song.youtube_id;
    // 1) khớp theo ass_file đã chỉ định
    if (song.ass_file) {
      const exact = State.subsFiles.find((f) => f.name === song.ass_file);
      if (exact) return exact;
    }
    if (!yid) return null;
    // 2) khớp theo youtube_id đứng đầu tên file (pattern: {videoId} {title}.ass)
    const yidMatch = State.subsFiles.find((f) => {
      const base = f.name.replace(/\.ass$/i, '').trim();
      return base === yid || base.startsWith(yid + ' ') || base.startsWith(yid + '_');
    });
    return yidMatch || null;
  }

  /* ──────────────────────────────────────────────────────
     6. ASS PARSER → Mảng phụ đề
     Chỉ giữ Style "vietsub" (đã có sẵn tiếng Việt trong
     file Kull-Vietsub) + thêm dòng romaji nếu cùng khung giờ.
     ────────────────────────────────────────────────────── */
  function parseAss(content) {
    const subtitles = [];
    const cues = []; // {start, end, romaji, vietsub, style, text}
    const lines = String(content || '').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('Dialogue:')) continue;
      // Cắt bỏ "Dialogue:" rồi tách theo dấu phẩy nhưng giữ phần Text còn lại
      const rest = line.slice('Dialogue:'.length).trim();
      const parts = rest.split(',');
      if (parts.length < 10) continue;
      const startStr = parts[1].trim();
      const endStr = parts[2].trim();
      const style = parts[3].trim();
      // Text có thể chứa dấu phẩy -> nối lại từ phần tử 9
      const text = parts.slice(9).join(',').trim();
      const start = parseAssTime(startStr);
      const end = parseAssTime(endStr);
      if (start == null || end == null || !text) continue;
      cues.push({ start, end, style, text });
    }
    // Gom nhóm theo từng style
    for (const cue of cues) {
      if (/vietsub/i.test(cue.style)) {
        const vietsub = cleanAssText(cue.text);
        // Tìm romaji cùng khung giờ
        const romajiCue = cues.find((c) =>
          /romaji/i.test(c.style) &&
          Math.abs(c.start - cue.start) < 0.35
        );
        const romaji = romajiCue ? cleanAssText(romajiCue.text) : '';
        subtitles.push({ start: cue.start, end: cue.end, romaji, vietsub });
      }
    }
    // fallback: nếu không có vietsub, dùng romaji/engsub
    if (subtitles.length === 0) {
      for (const cue of cues) {
        const text = cleanAssText(cue.text);
        if (!text) continue;
        const existing = subtitles.find((s) => s.start === cue.start);
        if (existing) {
          if (/romaji/i.test(cue.style)) existing.romaji = text;
          if (/engsub/i.test(cue.style) && !existing.vietsub) existing.vietsub = text;
        } else {
          subtitles.push({
            start: cue.start,
            end: cue.end,
            romaji: /romaji/i.test(cue.style) ? text : '',
            vietsub: /engsub/i.test(cue.style) ? text : ''
          });
        }
      }
    }
    // Sắp xếp theo thời gian
    subtitles.sort((a, b) => a.start - b.start);
    return subtitles;
  }

  // "h:mm:ss.cc" -> seconds (float)
  function parseAssTime(str) {
    const m = String(str).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.:](\d{1,3})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseInt(m[3], 10);
    const cs = parseInt(m[4].padEnd(3, '0').slice(0, 3), 10);
    return h * 3600 + min * 60 + sec + cs / 1000;
  }

  // Loại bỏ tag ASS {\\...} và {\\k...}
  function cleanAssText(text) {
    return String(text || '')
      .replace(/\{[^}]*\}/g, '')   // bỏ mọi tag {\\...}
      .replace(/\{\\/g, '')         // dự phòng
      .replace(/\s+/g, ' ')
      .trim();
  }


  /* ──────────────────────────────────────────────────────
     7. YOUTUBE IFrame PLAYER
     ────────────────────────────────────────────────────── */
  // Được gọi bởi YouTube IFrame API khi sẵn sàng
  window.onYouTubeIframeAPIReady = function () {
    State.youtubeReady = true;
    // Không tự tạo player ở đây; tạo khi người dùng chọn bài
  };

  function ensureYtPlayer() {
    if (!State.youtubeReady || typeof YT === 'undefined' || !YT.Player) return false;
    if (State.ytPlayer) return true;
    try {
      State.ytPlayer = new YT.Player('ytPlayer', {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          controls: 1,
          enablejsapi: 1
        },
        events: {
          onReady: () => { startSubtitleTicker(); },
          onStateChange: onPlayerStateChange,
          onError: () => { toast('Không thể phát video này.', 'error'); }
        }
      });
      return true;
    } catch (e) {
      console.error('Lỗi tạo YT player:', e);
      return false;
    }
  }

  function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.PLAYING) {
      startSubtitleTicker();
    } else if (e.data === YT.PlayerState.ENDED) {
      hideSubtitleOverlay();
      // Tự phát bài kế tiếp
      const idx = State.songs.findIndex((s) => s.id === (State.currentSong && State.currentSong.id));
      if (idx !== -1 && idx < State.songs.length - 1) {
        setTimeout(() => playSong(State.songs[idx + 1]), 1200);
      }
    } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.BUFFERING) {
      hideSubtitleOverlay();
    }
  }

  async function playSong(song) {
    if (!song) return;
    State.currentSong = song;
    State.subtitles = [];
    hideSubtitleOverlay();

    // Cập nhật UI now-playing
    $('#npTitle').textContent = song.title || 'Không tên';
    $('#npMeta').textContent = [song.artist, song.anime, song.song_type].filter(Boolean).join(' · ') || '—';
    const thumb = $('#npThumb');
    if (song.cover_url) {
      thumb.innerHTML = '<img src="' + esc(song.cover_url) + '" alt="" loading="lazy" onerror="this.remove()" />';
    } else {
      thumb.innerHTML = '<span class="np-thumb-ph">🎜</span>';
    }

    // Highlight trong danh sách
    $$('.song-item').forEach((el) => el.classList.remove('active'));
    const activeEl = $('.song-item[data-id="' + song.id + '"]');
    if (activeEl) activeEl.classList.add('active');

    // Khởi tạo player nếu cần
    if (!ensureYtPlayer()) {
      toast('YouTube player chưa sẵn sàng, thử lại sau giây lát...', 'warning');
      return;
    }

    // Tải & nạp phụ đề .ass
    const subFile = matchSubtitleFor(song);
    if (subFile) {
      try {
        const res = await fetch(subFile.download_url);
        if (res.ok) {
          const text = await res.text();
          State.subtitles = parseAss(text);
        }
      } catch (e) {
        console.warn('Lỗi tải .ass:', e);
        State.subtitles = [];
      }
    }
    updateSubsToggleUI();

    // Phát video
    try {
      State.ytPlayer.loadVideoById({ videoId: song.youtube_id, suggestedQuality: 'default' });
      $('#playerPlaceholder').classList.add('hidden');
      toast('Đang phát: ' + (song.title || ''), 'info', 1600);
    } catch (e) {
      console.error('Lỗi phát video:', e);
      toast('Không thể phát video ' + (song.title || ''), 'error');
    }
  }

  /* ---- Phụ đề ticker (đồng bộ theo thời gian phát) ---- */
  function startSubtitleTicker() {
    if (State.subsTick) clearInterval(State.subsTick);
    State.subsTick = setInterval(updateCurrentSubtitle, 100);
  }
  function stopSubtitleTicker() {
    if (State.subsTick) { clearInterval(State.subsTick); State.subsTick = null; }
  }
  function updateCurrentSubtitle() {
    const overlay = $('#subtitleOverlay');
    if (!overlay || !State.ytPlayer || !State.youtubeReady) return;
    let current;
    try { current = State.ytPlayer.getCurrentTime(); } catch (_e) { return; }
    const active = State.subtitles.filter((s) => current >= s.start && current <= s.end);
    if (!State.subsEnabled || active.length === 0) {
      hideSubtitleOverlay();
      return;
    }
    // Gom các dòng cùng hiển thị
    const lines = active.map((s) => {
      let html = '';
      if (s.romaji) html += '<span class="sub-line sub-romaji">' + esc(s.romaji) + '</span>';
      if (s.vietsub) html += '<span class="sub-line sub-vietsub">' + esc(s.vietsub) + '</span>';
      return html;
    });
    overlay.innerHTML = lines.join('');
    overlay.classList.add('show');
  }
  function hideSubtitleOverlay() {
    const overlay = $('#subtitleOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  function updateSubsToggleUI() {
    const label = $('#subsToggleLabel');
    const icon = $('#subsToggleIcon');
    const hasSubs = State.subtitles.length > 0;
    $('#subsToggle').disabled = !hasSubs;
    if (!hasSubs) {
      State.subsEnabled = false;
      label.textContent = 'Không có phụ đề';
      icon.textContent = '🚫';
      return;
    }
    icon.textContent = State.subsEnabled ? '💬' : '🔇';
    label.textContent = State.subsEnabled ? 'Phụ đề: Bật' : 'Phụ đề: Tắt';
  }


  /* ──────────────────────────────────────────────────────
     8. RENDER ANIME GRID + FILTER
     ────────────────────────────────────────────────────── */
  function renderAnimeGrid() {
    const grid = $('#animeGrid');
    const empty = $('#animeEmpty');
    const search = $('#animeSearch').value.trim().toLowerCase();
    const status = $('#statusFilter').value;
    const sort = $('#sortFilter').value;
    syncGenreFilter();

    let list = State.animes.slice();

    // Lọc trạng thái (tình trạng phát hành của anime)
    if (status !== 'all') {
      list = list.filter((a) => String(a.status || '').toLowerCase() === String(status).toLowerCase());
    }
    // Lọc thể loại — danh sách tự liệt kê toàn bộ thể loại đã lưu
    const genre = $('#genreFilter').value;
    if (genre !== 'all') {
      list = list.filter((a) => {
        const gs = Array.isArray(a.genres) ? a.genres : String(a.genres || '').split(',').map((s) => s.trim()).filter(Boolean);
        return gs.some((g) => String(g).toLowerCase() === String(genre).toLowerCase());
      });
    }
    // Lọc theo trạng thái xem của tôi (Đã xem / Đang xem / Muốn xem / Chưa xem)
    const myStatus = $('#myStatusFilter').value;
    if (myStatus !== 'all') {
      list = list.filter((a) => myStatusMeta(a.my_status).label === myStatus);
    }
    // Lọc theo từ khóa (tên, studio, thể loại)
    if (search) {
      list = list.filter((a) => {
        const genres = Array.isArray(a.genres) ? a.genres.join(' ') : String(a.genres || '');
        const haystack = [a.title, a.studio, genres, (a.seiyuu || []).map((s) => s.name).join(' ')]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }
    // Sắp xếp
    if (sort === 'rating') {
      list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    } else if (sort === 'title') {
      list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'vi'));
    } else { // newest
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    if (list.length === 0) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      updateLoadMore('#animeLoadMoreWrap', 0);
      return;
    }
    empty.classList.add('hidden');
    // Phân trang: chỉ hiển thị animeVisible phần tử đầu
    const visible = list.slice(0, State.animeVisible);
    grid.innerHTML = visible.map((a) => animeCardHTML(a)).join('');
    updateLoadMore('#animeLoadMoreWrap', list.length - State.animeVisible);
  }

  // Helper: hiện/ẩn nút "Xem thêm" và cập nhật số còn lại
  function updateLoadMore(wrapSel, remaining) {
    const wrap = $(wrapSel);
    if (!wrap) return;
    if (remaining > 0) {
      wrap.classList.remove('hidden');
      const btn = wrap.querySelector('.load-more-btn');
      if (btn) {
        const base = btn.dataset.label || 'Xem thêm ▼';
        btn.textContent = base + ' (' + remaining + ' còn)';
      }
    } else {
      wrap.classList.add('hidden');
    }
  }

  // Đổ danh sách thể loại vào select lọc — tự động liệt kê mọi thể loại đã lưu
  function syncGenreFilter() {
    const sel = $('#genreFilter');
    if (!sel) return;
    const set = new Set();
    State.animes.forEach((a) => {
      const gs = Array.isArray(a.genres) ? a.genres : String(a.genres || '').split(',').map((s) => s.trim()).filter(Boolean);
      gs.forEach((g) => { const v = String(g || '').trim(); if (v) set.add(v); });
    });
    const genres = Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
    const sig = genres.join('|');
    if (sel.dataset.sig === sig) return;
    sel.dataset.sig = sig;
    const cur = sel.value;
    sel.innerHTML =
      '<option value="all">Tất cả thể loại</option>' +
      genres.map((g) => '<option value="' + esc(g) + '">' + esc(g) + '</option>').join('');
    if (cur !== 'all' && genres.includes(cur)) sel.value = cur;
    else sel.value = 'all';
  }

  // Helper: metadata cho trạng thái xem cá nhân (của chủ web)
  function myStatusMeta(s) {
    s = String(s || '').trim();
    if (/đã xem|xem r/i.test(s)) return { label: 'Đã xem', icon: '✅', cls: 'my-watched' };
    if (/đang xem|đang/i.test(s)) return { label: 'Đang xem', icon: '⏳', cls: 'my-watching' };
    if (/ý định|định xem|muốn xem|dự định/i.test(s)) return { label: 'Muốn xem', icon: '➕', cls: 'my-planned' };
    return { label: 'Chưa xem', icon: '⬜', cls: 'my-unwatched' };
  }

  function animeCardHTML(a) {
    const rating = Number(a.rating) || 0;
    const mySt = myStatusMeta(a.my_status);
    const myRating = Math.round(Number(a.my_rating) || 0);
    const totalEp = Number(a.total_episodes) || 0;
    const img = a.poster_url
      ? '<img src="' + esc(a.poster_url) + '" alt="' + esc(a.title) + '" loading="lazy" data-title="' + esc(a.title) + '" onerror="window.__posterFallback(this, this.dataset.title)" />'
      : posterFallback(a);

    // Nút 🌸 (góc trên-phải) mở menu trạng thái — LUÔN hiển thị để sửa trạng thái nhanh + badge trạng thái (góc dưới-phải)
    let badgeText;
    if (mySt.cls === 'my-watching') {
      const we = Number(a.watched_episodes) || 0;
      badgeText = '🔥 Đang xem' + ((we > 0 || totalEp > 0) ? ' ' + we + '/' + (totalEp || '?') + ' tập' : '');
    } else if (mySt.cls === 'my-watched') badgeText = '✅ Đã xem';
    else if (mySt.cls === 'my-planned') badgeText = '➕ Muốn xem';
    else badgeText = '⬜ Chưa xem';
    const statusUI =
      '<button type="button" class="card-sakura" data-quick="menu" title="Đặt trạng thái xem">🌸</button>' +
      '<span class="card-status-badge ' + mySt.cls + '">' + esc(badgeText) + '</span>';

    // Hàng 10 trái tim ♥ chấm điểm (một hàng giữa card) — ẩn sẵn, bấm nút "7♥" ở meta để hiện & chấm điểm
    const heartRow =
      '<div class="card-heart-row hidden">' +
        '<button type="button" class="card-heart-opt clear' + (myRating === 0 ? ' on' : '') + '" data-val="0" title="Xoá điểm ♥">✕</button>' +
        Array.from({ length: 10 }, (_, i) => {
          const v = i + 1;
          return '<button type="button" class="card-heart-opt' + (v <= myRating ? ' on' : '') + '" data-val="' + v + '" title="Chấm ' + v + '/10 ♥">' + (v <= myRating ? '♥' : '♡') + '</button>';
        }).join('') +
      '</div>';

    // Meta: ★ điểm cộng đồng (AniDB) | nút điểm của tôi (bấm để chấm lại) | tổng số tập đã phát hành
    const metaRight =
      '<span class="card-meta-right">' +
        '<button type="button" class="card-heart-btn" title="Điểm của tôi — bấm để chấm ♥">' + (myRating > 0 ? myRating + '♥' : '♥') + '</button>' +
        '<span class="card-progress">' + (totalEp ? totalEp + '/' + totalEp : '?/?') + '</span>' +
      '</span>';

    return (
      '<article class="anime-card" data-id="' + esc(a.id) + '" role="button" tabindex="0" aria-label="Xem chi tiết ' + esc(a.title) + '">' +
        '<div class="card-poster">' + img +
          '<span class="card-status ' + statusClass(a.status) + '">' + esc(a.status || '') + '</span>' +
          statusUI +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + esc(a.title || '') + '</h3>' +
          heartRow +
          '<div class="card-meta">' +
            '<span class="card-rating">★ ' + rating.toFixed(1) + '</span>' +
            metaRight +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  /* ──────────────────────────────────────────────────────
     9. RENDER SONG LIST
     ────────────────────────────────────────────────────── */
  function renderSongList() {
    const list = $('#songList');
    const empty = $('#songEmpty');
    $('#songCount').textContent = State.songs.length + ' bài';
    if (State.songs.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      updateLoadMore('#songLoadMoreWrap', 0);
      return;
    }
    empty.classList.add('hidden');
    const visible = State.songs.slice(0, State.songVisible);
    list.innerHTML = visible.map((s) => {
      const hasSub = !!matchSubtitleFor(s);
      const thumb = s.cover_url
        ? '<div class="song-thumb"><img src="' + esc(s.cover_url) + '" alt="" loading="lazy" onerror="this.remove()" /></div>'
        : '<div class="song-thumb">🎜</div>';
      return (
        '<div class="song-item' + (State.currentSong && State.currentSong.id === s.id ? ' active' : '') + '" data-id="' + esc(s.id) + '" tabindex="0" role="button">' +
          thumb +
          '<div class="song-info">' +
            '<p class="song-title">' + esc(s.title || 'Không tên') + '</p>' +
            '<p class="song-sub">' + esc([s.artist, s.anime].filter(Boolean).join(' · ') || '—') + '</p>' +
          '</div>' +
          '<span class="song-badge ' + (hasSub ? 'song-has-sub' : '') + '">' + (hasSub ? '💬 .ass' : esc(s.song_type || 'OST')) + '</span>' +
        '</div>'
      );
    }).join('');
    updateLoadMore('#songLoadMoreWrap', State.songs.length - State.songVisible);
  }

  // Event delegation: click bài hát
  $('#songList').addEventListener('click', (e) => {
    const item = e.target.closest('.song-item');
    if (!item) return;
    const song = State.songs.find((s) => s.id === item.dataset.id);
    if (song) playSong(song);
  });


  /* ──────────────────────────────────────────────────────
     10. ANIME DETAIL MODAL
     ────────────────────────────────────────────────────── */
  function openAnimeDetail(anime) {
    State.currentAnime = anime;
    renderAnimeDetail(anime);
    openModal('animeModal');
    loadComments(anime.id);
    newCaptcha();
  }

  function renderAnimeDetail(a) {
    const el = $('#animeDetail');
    const genres = Array.isArray(a.genres) ? a.genres : [];
    const seiyuu = Array.isArray(a.seiyuu) ? a.seiyuu : [];
    const rating = Number(a.rating) || 0;
    const total = a.total_episodes || 0;
    const watched = a.watched_episodes || 0;
    const pct = total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0;

    // Trạng thái xem + điểm đánh giá của riêng chủ web
    const mySt = myStatusMeta(a.my_status);
    const myRating = Number(a.my_rating) || 0;
    const myIcons = State.isAdmin ? watchIconsHTML(a) : '';

    const poster = a.poster_url
      ? '<img src="' + esc(a.poster_url) + '" alt="' + esc(a.title) + '" loading="lazy" data-title="' + esc(a.title) + '" onerror="window.__posterFallback(this, this.dataset.title)" />'
      : '<div class="poster-fallback">🎞</div>';

    // Làm sạch synopsis: gộp dòng trống liên tiếp, cắt khoảng trắng 2 đầu để căn đều mượt hơn
    const synopsis =
      String(a.synopsis || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() || 'Chưa có mô tả.';

    // ══ Phần trái: poster + thông tin nhanh ══
    const sideRows = [];
    if (a.status) {
      sideRows.push(
        '<div class="detail-side-row">' +
          '<span class="detail-side-label">Trạng thái</span>' +
          '<span class="detail-side-value">' + esc(a.status) + '</span>' +
        '</div>'
      );
    }
    sideRows.push(
      '<div class="detail-side-row">' +
        '<span class="detail-side-label">Điểm cộng đồng</span>' +
        '<span class="detail-side-value detail-rating">★ ' + rating.toFixed(1) + '/10</span>' +
      '</div>'
    );
    sideRows.push(
      '<div class="detail-side-row detail-side-progress">' +
        '<span class="detail-side-label">Tiến độ</span>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="detail-progress-text">' + watched + ' / ' + (total || '?') + ' tập · ' + pct + '%</span>' +
      '</div>'
    );

    // ══ Phần phải: thể loại (5 cái + nút mở rộng) + chips + synopsis + seiyuu ══
    const chips = [];
    const maxGenres = 5;
    const genreBtns = genres.map((g) =>
      '<button type="button" class="chip chip-btn" data-search="' + esc(g) + '" title="Tìm anime theo thể loại">' + esc(g) + '</button>'
    ).join('');
    const genreMore = genres.length > maxGenres
      ? '<button type="button" class="chip chip-more" data-genre-more title="Xem toàn bộ thể loại"><span data-more-caret>▾</span> <span data-more-label>' + (genres.length - maxGenres) + ' thể loại</span></button>'
      : '';
    chips.push('<div class="genre-chips' + (genres.length > maxGenres ? ' has-more' : '') + '">' + genreBtns + genreMore + '</div>');
    chips.push('<span class="chip">📺 ' + (total || '?') + ' tập</span>');
    chips.push('<span class="chip my-status-chip ' + mySt.cls + '">' + mySt.icon + ' ' + esc(mySt.label) + '</span>');
    if (myRating > 0) chips.push('<span class="chip chip-mine">♥ ' + myRating + '/10</span>');

    const seiyuuSection = seiyuu.length
      ? '<details class="detail-section detail-collapse">' +
          '<summary class="detail-collapse-head">' +
            '<h3 class="detail-section-title">🎤 Dàn diễn viên lồng tiếng (Seiyuu)</h3>' +
            '<span class="detail-collapse-caret">▾</span>' +
          '</summary>' +
          '<div class="seiyuu-grid">' +
            seiyuu.map((s) => {
              // Ảnh chính = ảnh nhân vật (character art), ảnh nhỏ = seiyuu
              const vaImg = s.image ? '<img src="' + esc(s.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />' : '';
              const charImg = s.charImage
                ? '<img class="seiyuu-char-img" src="' + esc(s.charImage) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />'
                : '';
              const main = charImg || vaImg || '<span>🎙</span>';
              const badge = s.charImage && vaImg ? '<span class="seiyuu-va-badge">' + vaImg + '</span>' : '';
              return (
                '<div class="seiyuu-card">' +
                  '<div class="seiyuu-avatar">' + main + badge + '</div>' +
                  '<div class="seiyuu-info">' +
                    '<button type="button" class="seiyuu-name seiyuu-link" data-search="' + esc(s.name || '') + '" title="Tìm anime theo diễn viên">' + esc(s.name || '') + '</button>' +
                    '<div class="seiyuu-char">' + esc(s.character || '') + '</div>' +
                  '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>' +
        '</details>'
      : '';

    el.innerHTML =
      '<div class="anime-detail">' +
        '<aside class="detail-side">' +
          '<figure class="anime-detail-poster">' + poster + '</figure>' +
          myIcons +
          '<div class="detail-side-meta">' + sideRows.join('') + '</div>' +
        '</aside>' +
        '<div class="detail-main">' +
          '<header class="detail-header">' +
            '<h2 class="detail-title">' + esc(a.title || '') + '</h2>' +
            '<p class="detail-subtitle">' + esc([a.studio, a.year].filter(Boolean).join(' · ') || '—') + '</p>' +
          '</header>' +
          '<div class="detail-chips">' + chips.join('') + '</div>' +
          '<section class="detail-section">' +
            '<h3 class="detail-section-title">📖 Tóm tắt (Synopsis)</h3>' +
            '<div class="detail-synopsis-scroll"><p class="detail-synopsis">' + esc(synopsis) + '</p></div>' +
          '</section>' +
          seiyuuSection +
        '</div>' +
      '</div>';
  }

  // Dãy icon trạng thái xem + điểm của tôi (chỉ admin) — đặt ngay dưới ảnh bìa, bấm là lưu liền
  function watchIconsHTML(a) {
    const cur = myStatusMeta(a.my_status);
    const myRating = Math.round(Number(a.my_rating) || 0);
    const opts = [
      { value: 'Đã xem', icon: '✅', cls: 'my-watched' },
      { value: 'Đang xem', icon: '⏳', cls: 'my-watching' },
      { value: 'Muốn xem', icon: '➕', cls: 'my-planned' },
      { value: 'Chưa xem', icon: '⬜', cls: 'my-unwatched' }
    ];
    const icoBtn = (o) =>
      '<button type="button" class="watch-ico ' + o.cls + (o.value === cur.label ? ' on' : '') +
      '" data-status="' + esc(o.value) + '" title="' + (o.value === 'Đang xem' ? 'Đang xem — bấm để chọn tập đã xem' : o.value) + '">' + o.icon + '</button>';
    return (
      '<div class="detail-watch-icons" id="myTracker" data-anime="' + esc(a.id) + '">' +
        icoBtn(opts[0]) + icoBtn(opts[1]) + icoBtn(opts[2]) + icoBtn(opts[3]) +
        '<span class="watch-ico-sep" aria-hidden="true"></span>' +
        '<button type="button" class="watch-ico heart' + (myRating > 0 ? ' on' : '') + '" id="myRatingBtn" title="Điểm của tôi ' + (myRating > 0 ? myRating + '/10' : '(chưa chấm)') + ' — bấm để chấm ♥">♥' + (myRating > 0 ? '<b>' + myRating + '</b>' : '') + '</button>' +
      '</div>'
    );
  }

  // Lưu nhanh một/nhiều trường “của tôi” (my_status / my_rating / watched_episodes)
  async function saveMyTracker(animeId, patch) {
    if (!State.isAdmin) { toast('Bạn không có quyền.', 'error'); return false; }
    const { error } = await State.supabase.from('animes').update(patch).eq('id', animeId);
    if (error) { toast('Lưu thất bại: ' + error.message, 'error', 5000); return false; }
    const idx = State.animes.findIndex((x) => String(x.id) === String(animeId));
    if (idx > -1) {
      Object.assign(State.animes[idx], patch);
      if (State.currentAnime && String(State.currentAnime.id) === String(animeId)) {
        State.currentAnime = State.animes[idx];
      }
    }
    renderAnimeGrid();
    if (State.currentAnime && String(State.currentAnime.id) === String(animeId)) {
      renderAnimeDetail(State.currentAnime);
    }
    return true;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Popup mini: chọn tập đã xem / chấm điểm ♥ ──
  function closeMiniPop() {
    const a = $('#epPop'); if (a) a.classList.add('hidden');
    const b = $('#heartPop'); if (b) b.classList.add('hidden');
    const c = $('#statusPop'); if (c) c.classList.add('hidden');
  }
  function openMiniPop(pop, anchor) {
    closeMiniPop();
    pop.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  // Popup chọn tập đã xem (1 → tổng tập), lưu watched_episodes + trạng thái
  function openEpisodePop(anchor, id) {
    const a = State.animes.find((x) => String(x.id) === String(id));
    if (!a) return;
    const total = Number(a.total_episodes) || 0;
    const cur = Number(a.watched_episodes) || 0;
    const max = total > 0 ? total : Math.max(cur * 2, 12);
    let opts = '';
    for (let i = 1; i <= max; i++) {
      opts += '<button type="button" class="ep-opt' + (i === cur ? ' cur' : '') + '" data-ep="' + i + '">' + i + '</button>';
    }
    const pop = $('#epPop');
    if (!pop) return;
    pop.dataset.anime = String(a.id);
    pop.style.minWidth = '190px';
    pop.innerHTML = '<div class="mini-pop-title">🎬 Đã xem đến tập...</div><div class="mini-pop-grid">' + opts + '</div>';
    openMiniPop(pop, anchor);
  }

  // Popup chấm điểm ♥ (10 ♥ + nút xoá)
  function openHeartPop(anchor, id) {
    const a = State.animes.find((x) => String(x.id) === String(id));
    if (!a) return;
    const cur = Math.max(0, Math.min(10, Math.round(Number(a.my_rating) || 0)));
    let hearts = '<button type="button" class="heart-opt heart-clear" data-val="0" title="Xoá điểm">✕</button>';
    for (let i = 1; i <= 10; i++) {
      hearts += '<button type="button" class="heart-opt' + (i <= cur ? ' on' : '') + '" data-val="' + i + '" title="' + i + '/10">' + (i <= cur ? '♥' : '♡') + '</button>';
    }
    const pop = $('#heartPop');
    if (!pop) return;
    pop.dataset.anime = String(a.id);
    pop.style.minWidth = '';
    pop.innerHTML = '<div class="mini-pop-title">♥ Chấm điểm (0–10) — bấm 1 cái là lưu</div><div class="mini-pop-hearts">' + hearts + '</div>';
    openMiniPop(pop, anchor);
  }

  // Menu trạng thái nhanh trên card: 4 lựa chọn (bấm 🌸 → chọn 1, lưu liền; "Đang xem" mở popup chọn tập)
  function openStatusMenu(anchor, id) {
    const a = State.animes.find((x) => String(x.id) === String(id));
    if (!a) return;
    const cur = myStatusMeta(a.my_status).label;
    const items = [
      { label: 'Muốn xem', icon: '➕', hint: '' },
      { label: 'Đã xem', icon: '✅', hint: '' },
      { label: 'Chưa xem', icon: '⬜', hint: '' },
      { label: 'Đang xem', icon: '⏳', hint: 'chọn tập đã xem' }
    ];
    const btns = items.map((it) =>
      '<button type="button" class="status-opt' + (it.label === cur ? ' cur' : '') + '" data-status="' + it.label + '">' +
        '<span class="status-opt-ico">' + it.icon + '</span>' +
        '<span class="status-opt-txt">' + it.label + (it.hint ? ' <small>(' + it.hint + ')</small>' : '') + '</span>' +
      '</button>'
    ).join('');
    const pop = $('#statusPop');
    if (!pop) return;
    pop.dataset.anime = String(a.id);
    pop.style.minWidth = '180px';
    pop.innerHTML = '<div class="mini-pop-title">🌸 Đặt trạng thái xem</div><div class="mini-pop-statuses">' + btns + '</div>';
    openMiniPop(pop, anchor);
  }
  async function pickEpisode(id, ep) {
    const a = State.animes.find((x) => String(x.id) === String(id));
    if (!a) return;
    const total = Number(a.total_episodes) || 0;
    const val = Math.max(1, Math.min(Number(ep) || 1, total > 0 ? total : Infinity));
    closeMiniPop();
    const my_status = total > 0 && val >= total ? 'Đã xem' : 'Đang xem';
    await saveMyTracker(id, { my_status, watched_episodes: val });
    toast('Đã cập nhật: xem đến tập ' + val + '/' + (total || '?') + (my_status === 'Đã xem' ? ' ✅' : ''), 'success');
  }

  async function pickHeart(id, val) {
    closeMiniPop();
    const v = Math.max(0, Math.min(10, Number(val) || 0));
    await saveMyTracker(id, { my_rating: v });
    toast(v > 0 ? 'Đã chấm ' + v + '/10 ♥' : 'Đã xoá điểm ♥', 'success');
  }

  // Nút 🌸 trên card: mở menu trạng thái (chọn 1 trong 4; "Đang xem" mở tiếp popup chọn tập)
  function handleCardQuick(ev, kind, id, btn) {
    if (kind === 'menu') {
      ev.__popOpened = true;
      openStatusMenu(btn, id);
    }
  }

  /* ──────────────────────────────────────────────────────
     11. BÌNH LUẬN (comment section)
     ────────────────────────────────────────────────────── */
  async function loadComments(animeId) {
    const list = $('#commentList');
    const empty = $('#commentEmpty');
    $('#commentLoading').classList.remove('hidden');
    list.classList.add('hidden');
    empty.classList.add('hidden');
    const { data, error } = await State.supabase
      .from('comments')
      .select('*')
      .eq('anime_id', animeId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    $('#commentLoading').classList.add('hidden');
    if (error) {
      console.error('Lỗi đọc bình luận:', error);
      list.innerHTML = '<p class="empty-desc">Không tải được bình luận.</p>';
      list.classList.remove('hidden');
      return;
    }
    const comments = data || [];
    State.commentAll = comments;
    State.commentVisible = 20;
    renderCommentList();
  }

  function renderCommentList() {
    const list = $('#commentList');
    const empty = $('#commentEmpty');
    const comments = State.commentAll || [];
    if (comments.length === 0) {
      list.innerHTML = '';
      list.classList.add('hidden');
      empty.classList.remove('hidden');
      updateLoadMore('#commentLoadMoreWrap', 0);
      return;
    }
    empty.classList.add('hidden');
    list.classList.remove('hidden');
    const visible = comments.slice(0, State.commentVisible);
    list.innerHTML = visible.map((c) => commentHTML(c)).join('');
    updateLoadMore('#commentLoadMoreWrap', comments.length - State.commentVisible);
  }

  function commentHTML(c) {
    const isPinned = !!c.is_pinned;
    let actions = '';
    if (State.isAdmin) {
      actions =
        '<div class="comment-actions">' +
          '<button class="comment-action-btn" data-act="pin" data-id="' + esc(c.id) + '" title="' + (isPinned ? 'Bỏ ghim' : 'Ghim') + '">' + (isPinned ? '📌 Ghim' : '📍 Ghim') + '</button>' +
          '<button class="comment-action-btn danger" data-act="del" data-id="' + esc(c.id) + '" title="Xóa">🗑</button>' +
        '</div>';
    }
    return (
      '<div class="comment-item' + (isPinned ? ' pinned' : '') + '" data-id="' + esc(c.id) + '">' +
        '<div class="comment-head">' +
          '<span class="comment-author">' + esc(c.author_name || 'Ẩn danh') + '</span>' +
          (isPinned ? '<span class="pin-badge">📌 Đã ghim</span>' : '') +
          '<span class="comment-time">' + timeAgo(c.created_at) + '</span>' +
          actions +
        '</div>' +
        '<div class="comment-body">' + renderRichText(c.content) + '</div>' +
      '</div>'
    );
  }

  // Tải toàn bộ chat chung (anime_id = null + tất cả bình luận trong phim, kèm tên anime)
  async function loadGlobalChat() {
    if (!State.supabase) return;
    const { data, error } = await State.supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Lỗi đọc chat chung:', error);
      return;
    }
    const comments = data || [];
    const animeMap = {};
    State.animes.forEach((a) => { animeMap[String(a.id)] = a; });
    State.chatAll = comments;
    State.chatMap = animeMap;
    renderGlobalChat();
  }

  // Render chat chung: preview (3 tin) khi thu gọn; list đầy đủ khi mở rộng
  function renderGlobalChat() {
    const comments = State.chatAll || [];
    const map = State.chatMap || {};

    // Badge trên nút bong bóng: tổng số tin hiện có
    const badge = $('#chatFabBadge');
    const fab = $('#chatFab');
    if (badge) {
      badge.textContent = comments.length > 0 ? String(comments.length) : '';
      badge.hidden = comments.length === 0;
    }
    if (fab) {
      fab.setAttribute('aria-label', comments.length > 0
        ? 'Mở chat chung (' + comments.length + ' tin)'
        : 'Mở chat chung');
    }

    // List đầy đủ
    const list = $('#chatList');
    const empty = $('#chatEmpty');
    if (comments.length === 0) {
      if (list) list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      updateLoadMore('#chatLoadMoreWrap', 0);
      return;
    }
    if (empty) empty.classList.add('hidden');
    const visible = comments.slice(0, State.chatVisible);
    if (list) {
      list.classList.remove('hidden');
      list.innerHTML = visible.map((c) => chatHTML(c, map)).join('');
    }
    updateLoadMore('#chatLoadMoreWrap', comments.length - State.chatVisible);
  }

  // Render 1 tin chat chung dạng bong bóng; nếu có anime_id → thêm nhãn phim
  function chatHTML(c, animeMap) {
    const anime = animeMap[String(c.anime_id)] || null;
    const isPinned = !!c.is_pinned;
    const author = c.author_name || 'Ẩn danh';
    // Bong bóng của mình (trùng tên đang nhập ở ô chat) sẽ căn phải
    const ownAuthor = ($('#chatAuthor') && $('#chatAuthor').value.trim().toLowerCase()) || '';
    const isOwn = !!ownAuthor && String(author).trim().toLowerCase() === ownAuthor;
    let actions = '';
    if (State.isAdmin) {
      actions =
        '<div class="comment-actions">' +
          '<button class="comment-action-btn" data-cact2="pin" data-id="' + esc(c.id) + '" title="' + (isPinned ? 'Bỏ ghim' : 'Ghim') + '">' + (isPinned ? '📌 Ghim' : '📍 Ghim') + '</button>' +
          '<button class="comment-action-btn danger" data-cact2="del" data-id="' + esc(c.id) + '" title="Xóa">🗑</button>' +
        '</div>';
    }
    const tag = anime
      ? '<a href="#" class="chat-anime-tag" data-anime-id="' + esc(anime.id) + '" title="Mở chi tiết ' + esc(anime.title) + '">🎬 ' + esc(anime.title) + '</a>'
      : '<span class="chat-anime-tag chat-general">💬 Chat chung</span>';
    return (
      '<div class="chat-bubble-row' + (isOwn ? ' own' : '') + '" data-id="' + esc(c.id) + '">' +
        '<div class="chat-bubble' + (isPinned ? ' pinned' : '') + '">' +
          '<div class="chat-bubble-head">' +
            '<span class="chat-bubble-author">' + esc(author) + '</span>' +
            tag +
            (isPinned ? '<span class="pin-badge">📌 Đã ghim</span>' : '') +
            '<span class="chat-bubble-time">' + timeAgo(c.created_at) + '</span>' +
            actions +
          '</div>' +
          '<div class="comment-body chat-bubble-body">' + renderRichText(c.content) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // Rate limiting: chặn gửi liên tục trong 45s (dùng chung cho cả bình luận & chat)
  function enforceRateLimit() {
    const now = Date.now();
    const diff = now - State.lastCommentAt;
    if (diff < 45000) {
      const remain = Math.ceil((45000 - diff) / 1000);
      $('#rateHint').textContent = '⏳ Chờ ' + remain + 's nữa để gửi tiếp.';
      return false;
    }
    $('#rateHint').textContent = '';
    return true;
  }

  function newCaptcha() {
    const a = 1 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * 9);
    State.captcha = { a, b, result: a + b };
    $('#captchaQ').textContent = a + ' + ' + b + ' = ?';
    $('#captchaInput').value = '';
  }

  function newChatCaptcha() {
    const a = 1 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * 9);
    State.chatCaptcha = { a, b, result: a + b };
    $('#chatCaptchaQ').textContent = a + ' + ' + b + ' = ?';
    $('#chatCaptchaInput').value = '';
  }

  async function submitComment() {
    const anime = State.currentAnime;
    if (!anime) return;
    if (!State.supabase) { toast('Hệ thống chưa sẵn sàng.', 'error'); return; }
    const loggedIn = State.isLoggedIn;
    const author = loggedIn
      ? (State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || 'Thành viên')
      : $('#commentAuthor').value.trim();
    const content = $('#commentBox').value.trim();
    if (loggedIn && !State.nickname && !State.adminEmail) {
      toast('Không xác định được tên tài khoản. Vui lòng đăng nhập lại.', 'warning'); return;
    }
    if (!author) { toast('Vui lòng nhập tên hiển thị.', 'warning'); return; }
    if (!content) { toast('Vui lòng nhập nội dung bình luận.', 'warning'); return; }
    if (!enforceRateLimit()) return;
    if (!loggedIn) {
      const captchaVal = parseInt($('#captchaInput').value, 10);
      if (isNaN(captchaVal) || captchaVal !== State.captcha.result) {
        toast('Sai kết quả captcha. Thử lại.', 'error');
        newCaptcha();
        return;
      }
    }
    const btn = $('#submitCommentBtn');
    btn.disabled = true;
    const safeContent = filterBadWords(content).slice(0, 5000);
    const { error } = await State.supabase
      .from('comments')
      .insert({ anime_id: anime.id, author_name: author.slice(0, 60), content: safeContent, is_pinned: false });
    btn.disabled = false;
    if (error) {
      toast('Không gửi được bình luận: ' + error.message, 'error', 5000);
      return;
    }
    State.lastCommentAt = Date.now();
    $('#commentBox').value = '';
    newCaptcha();
    toast('Đã gửi bình luận ✅', 'success');
    loadComments(anime.id);
  }

  // Gửi tin nhắn chat chung (anime_id = null)
  function enforceChatRateLimit() {
    const now = Date.now();
    const diff = now - State.lastChatAt;
    if (diff < 45000) {
      const remain = Math.ceil((45000 - diff) / 1000);
      $('#chatRateHint').textContent = '⏳ Chờ ' + remain + 's nữa để gửi tiếp.';
      return false;
    }
    $('#chatRateHint').textContent = '';
    return true;
  }

  async function submitChat() {
    if (!State.supabase) { toast('Hệ thống chưa sẵn sàng.', 'error'); return; }
    const loggedIn = State.isLoggedIn;
    const author = loggedIn
      ? (State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || 'Thành viên')
      : $('#chatAuthor').value.trim();
    const content = $('#chatBox').value.trim();
    if (loggedIn && !State.nickname && !State.adminEmail) {
      toast('Không xác định được tên tài khoản. Vui lòng đăng nhập lại.', 'warning'); return;
    }
    if (!author) { toast('Vui lòng nhập tên hiển thị.', 'warning'); return; }
    if (!content) { toast('Vui lòng nhập nội dung chat.', 'warning'); return; }
    if (!enforceChatRateLimit()) return;
    if (!loggedIn) {
      const captchaVal = parseInt($('#chatCaptchaInput').value, 10);
      if (isNaN(captchaVal) || captchaVal !== State.chatCaptcha.result) {
        toast('Sai kết quả captcha. Thử lại.', 'error');
        newChatCaptcha();
        return;
      }
    }
    const btn = $('#chatSendBtn');
    btn.disabled = true;
    const safeContent = filterBadWords(content).slice(0, 5000);
    const { error } = await State.supabase
      .from('comments')
      .insert({ anime_id: null, author_name: author.slice(0, 60), content: safeContent, is_pinned: false });
    btn.disabled = false;
    if (error) {
      toast('Không gửi được tin nhắn: ' + error.message, 'error', 5000);
      return;
    }
    State.lastChatAt = Date.now();
    $('#chatBox').value = '';
    newChatCaptcha();
    toast('Đã gửi tin nhắn 💬', 'success');
    loadGlobalChat();
  }

  // Xử lý pin/delete (admin)
  async function handleCommentAction(act, id) {
    if (!State.isAdmin) return;
    if (act === 'del') {
      if (!confirm('Xóa bình luận này?')) return;
      const { error } = await State.supabase.from('comments').delete().eq('id', id);
      if (error) { toast('Xóa thất bại: ' + error.message, 'error'); return; }
      toast('Đã xóa bình luận.', 'success');
    } else if (act === 'pin') {
      const item = document.querySelector('.comment-item[data-id="' + id + '"]');
      const isPinnedNow = item ? item.classList.contains('pinned') : false;
      const { error } = await State.supabase.from('comments').update({ is_pinned: !isPinnedNow }).eq('id', id);
      if (error) { toast('Ghim thất bại: ' + error.message, 'error'); return; }
      toast(isPinnedNow ? 'Đã bỏ ghim.' : 'Đã ghim 📌', 'success');
    }
    if (State.currentAnime) loadComments(State.currentAnime.id);
  }

  // Xử lý pin/delete trong chat chung (admin)
  async function handleChatAdminAction(act, id) {
    if (!State.isAdmin) return;
    if (act === 'del') {
      if (!confirm('Xóa tin nhắn này?')) return;
      const { error } = await State.supabase.from('comments').delete().eq('id', id);
      if (error) { toast('Xóa thất bại: ' + error.message, 'error'); return; }
      toast('Đã xóa tin nhắn.', 'success');
      loadGlobalChat();
      if (State.currentAnime) loadComments(State.currentAnime.id);
    } else if (act === 'pin') {
      const row = document.querySelector('.chat-bubble-row[data-id="' + id + '"]');
      const bubble = row ? row.querySelector('.chat-bubble') : null;
      const isPinnedNow = bubble ? bubble.classList.contains('pinned') : false;
      const { error } = await State.supabase.from('comments').update({ is_pinned: !isPinnedNow }).eq('id', id);
      if (error) { toast('Ghim thất bại: ' + error.message, 'error'); return; }
      toast(isPinnedNow ? 'Đã bỏ ghim.' : 'Đã ghim 📌', 'success');
      loadGlobalChat();
      if (State.currentAnime) loadComments(State.currentAnime.id);
    }
  }

  /* ──────────────────────────────────────────────────────
     12. CLOUDINARY UNSIGNED UPLOAD (ảnh bình luận)
     ────────────────────────────────────────────────────── */
  async function uploadImageToCloudinary(file) {
    // Kiểm tra loại file
    if (!file.type || !file.type.startsWith('image/')) {
      throw new Error('Chỉ chấp nhận file ảnh (image/*).');
    }
    // Kiểm tra dung lượng <= 10MB
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Ảnh tối đa 10MB.');
    }
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', State.config.CLOUDINARY_UPLOAD_PRESET);
    form.append('cloud_name', State.config.CLOUDINARY_CLOUD_NAME);
    const res = await fetch(State.config.CLOUDINARY_UPLOAD_URL, { method: 'POST', body: form });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error('Upload Cloudinary thất bại (' + res.status + ') ' + txt.slice(0, 120));
    }
    const data = await res.json();
    return data; // chứa secure_url, etc.
  }

  async function handleImageUpload() {
    const input = $('#uploadImgInput');
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const result = await uploadImageToCloudinary(file);
      const url = result.secure_url || result.url;
      if (!url) throw new Error('Không lấy được URL ảnh.');
      insertAtCursor($('#commentBox'), '![' + esc(file.name || 'ảnh') + '](' + esc(url) + ')');
      toast('Đã tải ảnh lên Cloudinary ✅', 'success');
    } catch (err) {
      toast('Lỗi tải ảnh: ' + err.message, 'error', 5000);
    }
    input.value = '';
  }

  // Toolbar soạn thảo: chèn BBCode/Markdown vào textarea
  function applyFormat(fmt) {
    applyFormatTo($('#commentBox'), fmt);
  }

  function applyFormatTo(box, fmt) {
    if (!box) return;
    const start = box.selectionStart != null ? box.selectionStart : box.value.length;
    const end = box.selectionEnd != null ? box.selectionEnd : start;
    const selected = box.value.slice(start, end) || 'văn bản';
    let insert;
    let pos = start;
    switch (fmt) {
      case 'bold': insert = '**' + selected + '**'; break;
      case 'italic': insert = '*' + selected + '*'; break;
      case 'underline': insert = '<u>' + selected + '</u>'; break;
      case 'strike': insert = '~~' + selected + '~~'; break;
      case 'quote': insert = '[quote]' + selected + '[/quote]'; break;
      case 'code': insert = '[code]' + selected + '[/code]'; break;
      case 'link': {
        const url = prompt('Nhập URL:', 'https://');
        if (!url) return;
        insert = '[' + selected + '](' + url + ')';
        break;
      }
      case 'image': {
        const url = prompt('Nhập URL ảnh:', 'https://');
        if (!url) return;
        insert = '![' + selected + '](' + url + ')';
        break;
      }
      default: return;
    }
    box.value = box.value.slice(0, start) + insert + box.value.slice(end);
    pos = start + insert.length;
    box.focus();
    box.setSelectionRange(pos, pos);
  }

  /* ──────────────────────────────────────────────────────
     PASTE THÔNG MINH: URL → link, URL ảnh → ảnh, file ảnh → upload
     ────────────────────────────────────────────────────── */
  // Chèn text vào vị trí con trỏ trong textarea
  function insertAtCursor(box, text) {
    if (!box) return;
    const start = box.selectionStart != null ? box.selectionStart : box.value.length;
    const end = box.selectionEnd != null ? box.selectionEnd : start;
    box.value = box.value.slice(0, start) + text + box.value.slice(end);
    const pos = start + text.length;
    box.focus();
    box.setSelectionRange(pos, pos);
  }

  function isLikelyUrl(s) {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_e) { return false; }
  }

  const IMG_URL_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)(\?[^\s]*)?$/i;

  // Xử lý khi người dùng paste vào ô nhập (cả bình luận lẫn chat)
  function onSmartPaste(e, box) {
    const cd = e.clipboardData;
    if (!cd) return;
    // 1) Paste file ảnh từ clipboard (vd: chụp màn hình, sao chép ảnh) → tự upload
    const items = Array.from(cd.items || []);
    const imageFile = items
      .map((it) => (it.kind === 'file' ? it.getAsFile() : null))
      .find((f) => f && f.type && f.type.startsWith('image/'));
    if (imageFile) {
      e.preventDefault();
      smartUploadImage(imageFile, box);
      return;
    }
    // 2) Paste text: nếu là URL → tự chuyển thành link / ảnh
    const text = (cd.getData('text/plain') || '').trim();
    if (!text) return;
    if (isLikelyUrl(text)) {
      e.preventDefault();
      const isImg = IMG_URL_RE.test(text);
      const md = isImg ? '![' + text + '](' + text + ')' : '[' + text + '](' + text + ')';
      insertAtCursor(box, md);
      toast(isImg ? 'Đã chèn ảnh từ link ✅' : 'Đã chèn link ✅', 'success');
    }
  }

  // Tự upload ảnh dán (paste) lên Cloudinary rồi chèn markdown ảnh
  async function smartUploadImage(file, box) {
    try {
      const result = await uploadImageToCloudinary(file);
      const url = result.secure_url || result.url;
      if (!url) throw new Error('Không lấy được URL ảnh.');
      const md = '![' + esc(file.name || 'ảnh') + '](' + esc(url) + ')';
      insertAtCursor(box, md);
      toast('Đã tải ảnh lên Cloudinary ✅', 'success');
    } catch (err) {
      toast('Lỗi tải ảnh: ' + err.message, 'error', 5000);
    }
  }

  /* ──────────────────────────────────────────────────────
     13. AUTH — ĐĂNG NHẬP/ĐĂNG XUẤT ADMIN
     ────────────────────────────────────────────────────── */
  function updateLoginUI() {
    const icon = $('#loginBtnIcon');
    const label = $('#loginBtnLabel');
    const adminBtn = $('#adminBtn');
    if (State.isLoggedIn) {
      icon.textContent = State.isAdmin ? '🔑' : '👤';
      label.textContent = State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || (State.isAdmin ? 'Admin' : 'Thành viên');
      adminBtn.classList.toggle('hidden', !State.isAdmin);
    } else {
      icon.textContent = '👤';
      label.textContent = 'Đăng nhập';
      adminBtn.classList.add('hidden');
    }
  }

  $('#loginBtn').addEventListener('click', () => {
    if (State.isLoggedIn) {
      // Thoát đăng nhập
      if (confirm('Đăng xuất khỏi tài khoản?')) handleLogout();
    } else {
      openModal('loginModal');
    }
  });

  async function handleLogin(e) {
    e.preventDefault();
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    const errEl = $('#loginError');
    errEl.classList.add('hidden');
    if (!email || !password) {
      errEl.textContent = 'Vui lòng nhập đầy đủ email và mật khẩu.';
      errEl.classList.remove('hidden');
      return;
    }
    const btn = $('#loginSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập...';
    const { data, error } = await State.supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = 'Đăng nhập';
    if (error) {
      errEl.textContent = 'Sai email/mật khẩu hoặc tài khoản không tồn tại.';
      errEl.classList.remove('hidden');
      return;
    }
    const user = data && data.user;
    const meta = (user && user.app_metadata) || {};
    State.isLoggedIn = true;
    State.adminEmail = user.email;
    State.isAdmin = meta.is_admin === 'true' || meta.is_admin === true;
    const nm = (user.user_metadata || {}).nickname;
    State.nickname = (nm && String(nm).trim()) || (user.email || '').split('@')[0] || '';
    closeModal('loginModal');
    applyAuthState();
    if (State.isAdmin) {
      toast('Đăng nhập Admin thành công 🎉', 'success');
      renderAdminAnimeList();
      renderAdminSongList();
      renderAdminCommentList();
    } else {
      toast('Đăng nhập thành công 🎉', 'success');
    }
  }

  async function handleLogout(silent) {
    if (State.supabase) await State.supabase.auth.signOut();
    State.isAdmin = false;
    State.isLoggedIn = false;
    State.adminEmail = '';
    State.nickname = '';
    applyAuthState();
    if (!silent) toast('Đã đăng xuất.', 'info');
    closeModal('loginModal');
    closeModal('adminModal');
  }

  // Đổi tên hiển thị (nickname) của tài khoản đã đăng nhập
  async function changeNickname() {
    if (!State.supabase || !State.isLoggedIn) return;
    const current = State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || '';
    const name = prompt('Nhập tên hiển thị mới (nickname) cho tài khoản:', current);
    if (name == null) return; // người dùng bấm Hủy
    const trimmed = name.trim();
    if (!trimmed) { toast('Tên hiển thị không được để trống.', 'warning'); return; }
    if (trimmed.length > 60) { toast('Tên hiển thị tối đa 60 ký tự.', 'warning'); return; }
    const btn = event && event.currentTarget;
    if (btn) btn.disabled = true;
    const { error } = await State.supabase.auth.updateUser({ data: { nickname: trimmed } });
    if (btn) btn.disabled = false;
    if (error) { toast('Không đổi được tên hiển thị: ' + error.message, 'error', 5000); return; }
    State.nickname = trimmed;
    applyAuthState();
    toast('Đã đổi tên hiển thị thành "' + trimmed + '" ✅', 'success');
  }
  $('#commentRenameBtn').addEventListener('click', changeNickname);
  $('#chatRenameBtn').addEventListener('click', changeNickname);

  // Xóa các container admin khi đăng xuất
  function clearAdminLists() {
    $('#adminAnimeList').innerHTML = '';
    $('#adminSongList').innerHTML = '';
    $('#adminCommentList').innerHTML = '';
  }

  /* ──────────────────────────────────────────────────────
     14. ADMIN PANEL — CRUD ANIME
     ────────────────────────────────────────────────────── */
  function renderAdminAnimeList() {
    const list = $('#adminAnimeList');
    if (!State.isAdmin) { list.innerHTML = ''; return; }
    if (State.animes.length === 0) {
      list.innerHTML = '<p class="empty-desc">Chưa có anime nào.</p>';
      return;
    }
    list.innerHTML = State.animes.map((a) =>
      '<div class="admin-row" data-id="' + esc(a.id) + '">' +
        '<div class="admin-row-thumb">' + (a.poster_url ? '<img src="' + esc(a.poster_url) + '" alt="" onerror="this.remove()" />' : '🎞') + '</div>' +
        '<div class="admin-row-info">' +
          '<div class="admin-row-title">' + esc(a.title) + '</div>' +
          '<div class="admin-row-sub">' + esc(a.status || '') + ' · ★ ' + (Number(a.rating) || 0).toFixed(1) + '</div>' +
        '</div>' +
        '<div class="admin-row-actions">' +
          '<button class="mini-btn primary" data-apact="edit" data-id="' + esc(a.id) + '">✏️ Sửa</button>' +
          '<button class="mini-btn danger" data-apact="del" data-id="' + esc(a.id) + '">🗑 Xóa</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  function openAddAnimeForm() {
    resetAnimeForm();
    $('#animeFormTitle').textContent = '＋ Thêm anime';
    $('#af_id').value = '';
    openModal('animeFormModal');
  }

  function openEditAnimeForm(animeId) {
    const a = State.animes.find((x) => x.id === animeId);
    if (!a) return;
    resetAnimeForm();
    $('#animeFormTitle').textContent = '✏️ Sửa anime';
    $('#af_id').value = a.id;
    $('#af_title').value = a.title || '';
    $('#af_status').value = a.status || 'Đang chiếu';
    $('#af_rating').value = a.rating != null ? a.rating : 0;
    $('#af_year').value = a.year != null ? a.year : '';
    $('#af_studio').value = a.studio || '';
    $('#af_total_ep').value = a.total_episodes || 0;
    $('#af_watched_ep').value = a.watched_episodes || 0;
    $('#af_poster').value = a.poster_url || '';
    $('#af_genres').value = (Array.isArray(a.genres) ? a.genres : []).join(', ');
    $('#af_synopsis').value = a.synopsis || '';
    renderSeiyuuEditors(Array.isArray(a.seiyuu) ? a.seiyuu : []);
    updatePosterPreview();
    openModal('animeFormModal');
  }

  function resetAnimeForm() {
    ['af_title', 'af_year', 'af_studio', 'af_poster', 'af_genres', 'af_synopsis'].forEach((id) => {
      $('#' + id).value = '';
    });
    $('#af_rating').value = 0;
    $('#af_total_ep').value = 0;
    $('#af_watched_ep').value = 0;
    $('#af_status').value = 'Đang chiếu';
    renderSeiyuuEditors([]);
    hi('jikanResults');
    $('#af_posterPreview').innerHTML = '';
  }

  function hi(sel) {
    const el = $('#' + sel);
    if (el) el.classList.add('hidden');
  }
  function show(sel) {
    const el = $('#' + sel);
    if (el) el.classList.remove('hidden');
  }

  function renderSeiyuuEditors(seiyuu) {
    const wrap = $('#afSeiyuuList');
    wrap.innerHTML = '';
    const arr = Array.isArray(seiyuu) && seiyuu.length ? seiyuu : [{ name: '', character: '', image: '', charImage: '' }];
    arr.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'seiyuu-editor-row';
      row.innerHTML =
        '<input type="text" class="input" data-seiyuu="name" value="' + esc(s.name || '') + '" placeholder="Tên Seiyuu" />' +
        '<input type="text" class="input" data-seiyuu="character" value="' + esc(s.character || '') + '" placeholder="Nhân vật" />' +
        '<input type="text" class="input" data-seiyuu="image" value="' + esc(s.image || '') + '" placeholder="Ảnh Seiyuu URL" />' +
        '<input type="text" class="input" data-seiyuu="charImage" value="' + esc(s.charImage || '') + '" placeholder="Ảnh nhân vật URL" />' +
        '<button type="button" class="seiyuu-remove" title="Xóa" aria-label="Xóa seiyuu">✕</button>';
      row.querySelector('.seiyuu-remove').addEventListener('click', () => row.remove());
      wrap.appendChild(row);
    });
  }

  function collectSeiyuuFromEditors() {
    const out = [];
    $$('#afSeiyuuList .seiyuu-editor-row').forEach((row) => {
      const name = row.querySelector('[data-seiyuu="name"]').value.trim();
      const character = row.querySelector('[data-seiyuu="character"]').value.trim();
      const image = row.querySelector('[data-seiyuu="image"]').value.trim();
      const charImage = row.querySelector('[data-seiyuu="charImage"]').value.trim();
      if (name) out.push({ name, character, image, charImage });
    });
    return out;
  }

  function updatePosterPreview() {
    const url = $('#af_poster').value.trim();
    const prev = $('#af_posterPreview');
    if (!prev) return;
    prev.innerHTML = url ? '<img src="' + esc(url) + '" alt="Xem trước poster" onerror="this.remove()" />' : '';
  }

  function animFormPayload() {
    return {
      title: $('#af_title').value.trim(),
      synopsis: $('#af_synopsis').value.trim(),
      poster_url: $('#af_poster').value.trim(),
      status: $('#af_status').value,
      rating: parseFloat($('#af_rating').value) || 0,
      genres: $('#af_genres').value.split(',').map((g) => g.trim()).filter(Boolean),
      studio: $('#af_studio').value.trim(),
      year: $('#af_year').value ? parseInt($('#af_year').value, 10) : null,
      total_episodes: parseInt($('#af_total_ep').value, 10) || 0,
      watched_episodes: parseInt($('#af_watched_ep').value, 10) || 0,
      seiyuu: collectSeiyuuFromEditors()
    };
  }

  async function saveAnime(e) {
    e.preventDefault();
    if (!State.isAdmin) { toast('Bạn không có quyền.', 'error'); return; }
    const title = $('#af_title').value.trim();
    if (!title) { toast('Vui lòng nhập tên anime.', 'warning'); return; }
    const payload = animFormPayload();
    const id = $('#af_id').value;
    const btn = $('#saveAnimeBtn');
    btn.disabled = true;
    let error;
    if (id) {
      const r = await State.supabase.from('animes').update(payload).eq('id', id);
      error = r.error;
    } else {
      const r = await State.supabase.from('animes').insert(payload);
      error = r.error;
    }
    btn.disabled = false;
    if (error) {
      toast('Lưu thất bại: ' + error.message, 'error', 5000);
      return;
    }
    toast('Đã lưu anime ✅', 'success');
    closeModal('animeFormModal');
    await loadAnimes();
    renderAdminAnimeList();
  }

  async function deleteAnime(id) {
    if (!State.isAdmin) return;
    const a = State.animes.find((x) => x.id === id);
    if (!confirm('Xóa anime "' + (a ? a.title : '') + '"?')) return;
    const { error } = await State.supabase.from('animes').delete().eq('id', id);
    if (error) { toast('Xóa thất bại: ' + error.message, 'error'); return; }
    toast('Đã xóa anime.', 'success');
    await loadAnimes();
    renderAdminAnimeList();
  }

  /* ──────────────────────────────────────────────────────
     15. ADMIN PANEL — CRUD SONGS
     ────────────────────────────────────────────────────── */
  function renderAdminSongList() {
    const list = $('#adminSongList');
    if (!State.isAdmin) { list.innerHTML = ''; return; }
    if (State.songs.length === 0) {
      list.innerHTML = '<p class="empty-desc">Chưa có bài hát nào.</p>';
      return;
    }
    list.innerHTML = State.songs.map((s) =>
      '<div class="admin-row" data-id="' + esc(s.id) + '">' +
        '<div class="admin-row-thumb">' + (s.cover_url ? '<img src="' + esc(s.cover_url) + '" alt="" onerror="this.remove()" />' : '🎜') + '</div>' +
        '<div class="admin-row-info">' +
          '<div class="admin-row-title">' + esc(s.title || 'Không tên') + '</div>' +
          '<div class="admin-row-sub">' + esc([s.artist, s.anime, s.song_type].filter(Boolean).join(' · ') || '—') + '</div>' +
        '</div>' +
        '<div class="admin-row-actions">' +
          '<button class="mini-btn primary" data-spact="edit" data-id="' + esc(s.id) + '">✏️</button>' +
          '<button class="mini-btn danger" data-spact="del" data-id="' + esc(s.id) + '">🗑</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  function openSongForm(song) {
    $('#songFormTitle').textContent = song ? '✏️ Sửa bài hát' : '＋ Thêm bài hát';
    $('#sf_id').value = song ? song.id : '';
    $('#sf_title').value = song ? song.title || '' : '';
    $('#sf_artist').value = song ? song.artist || '' : '';
    $('#sf_youtube').value = song ? song.youtube_id || '' : '';
    $('#sf_anime').value = song ? song.anime || '' : '';
    $('#sf_type').value = song ? song.song_type || 'OST' : 'OST';
    $('#sf_cover').value = song ? song.cover_url || '' : '';
    openModal('songFormModal');
  }

  async function saveSong(e) {
    e.preventDefault();
    if (!State.isAdmin) { toast('Bạn không có quyền.', 'error'); return; }
    const title = $('#sf_title').value.trim();
    const yid = parseYoutubeId($('#sf_youtube').value);
    if (!title) { toast('Vui lòng nhập tên bài hát.', 'warning'); return; }
    if (!yid) { toast('YouTube ID không hợp lệ.', 'warning'); return; }
    const payload = {
      title,
      artist: $('#sf_artist').value.trim(),
      youtube_id: yid,
      anime: $('#sf_anime').value.trim(),
      song_type: $('#sf_type').value,
      cover_url: $('#sf_cover').value.trim()
    };
    const id = $('#sf_id').value;
    const btn = $('#saveSongBtn');
    btn.disabled = true;
    let error;
    if (id) {
      const r = await State.supabase.from('songs').update(payload).eq('id', id);
      error = r.error;
    } else {
      const r = await State.supabase.from('songs').insert(payload);
      error = r.error;
    }
    btn.disabled = false;
    if (error) { toast('Lưu thất bại: ' + error.message, 'error', 5000); return; }
    toast('Đã lưu bài hát ✅', 'success');
    closeModal('songFormModal');
    await loadSongs();
    renderAdminSongList();
  }

  async function deleteSong(id) {
    if (!State.isAdmin) return;
    if (!confirm('Xóa bài hát này?')) return;
    const { error } = await State.supabase.from('songs').delete().eq('id', id);
    if (error) { toast('Xóa thất bại: ' + error.message, 'error'); return; }
    toast('Đã xóa bài hát.', 'success');
    await loadSongs();
    renderAdminSongList();
  }

  /* ──────────────────────────────────────────────────────
     16. ADMIN PANEL — QUẢN LÝ BÌNH LUẬN
     ────────────────────────────────────────────────────── */
  async function renderAdminCommentList() {
    const list = $('#adminCommentList');
    if (!State.isAdmin) { list.innerHTML = ''; return; }
    const { data, error } = await State.supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { list.innerHTML = '<p class="empty-desc">Lỗi tải bình luận.</p>'; return; }
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="empty-desc">Không có bình luận nào.</p>';
      return;
    }
    list.innerHTML = data.map((c) => {
      const animeName = c.anime_id == null
        ? '💬 Chat chung'
        : ((State.animes.find((a) => a.id === c.anime_id) || {}).title || '—');
      return (
        '<div class="admin-row" data-id="' + esc(c.id) + '">' +
          '<div class="admin-row-info">' +
            '<div class="admin-row-title">' + esc((c.author_name || 'Ẩn danh') + (c.is_pinned ? ' 📌' : '')) + '</div>' +
            '<div class="admin-row-sub">' + esc((animeName || '—') + ' · ' + timeAgo(c.created_at)) + '</div>' +
          '</div>' +
          '<div class="admin-row-actions">' +
            '<button class="mini-btn primary" data-cact="pin" data-id="' + esc(c.id) + '">' + (c.is_pinned ? 'Bỏ ghim' : 'Ghim') + '</button>' +
            '<button class="mini-btn danger" data-cact="del" data-id="' + esc(c.id) + '">🗑</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  async function adminCommentAction(act, id) {
    if (!State.isAdmin) return;
    if (act === 'del') {
      if (!confirm('Xóa bình luận này?')) return;
      const { error } = await State.supabase.from('comments').delete().eq('id', id);
      if (error) { toast('Lỗi: ' + error.message, 'error'); return; }
      toast('Đã xóa.', 'success');
    } else if (act === 'pin') {
      const row = document.querySelector('#adminCommentList .admin-row[data-id="' + id + '"]');
      const isPinned = row ? (row.querySelector('.admin-row-title').textContent.includes('📌')) : false;
      const { error } = await State.supabase.from('comments').update({ is_pinned: !isPinned }).eq('id', id);
      if (error) { toast('Lỗi: ' + error.message, 'error'); return; }
      toast(isPinned ? 'Đã bỏ ghim.' : 'Đã ghim 📌', 'success');
    }
    await renderAdminCommentList();
    if (State.currentAnime) loadComments(State.currentAnime.id);
  }

  /* ──────────────────────────────────────────────────────
     17. ANILIST API — AUTO-FILL FORM
     (Thay thế Jikan/MAL — AniList GraphQL miễn phí, không cần
     key, ổn định hơn nhiều so với Jikan hay bị quá tải 504)
     ────────────────────────────────────────────────────── */
  async function anilistSearch(query) {
    if (State.jikanAbort) State.jikanAbort.abort();
    State.jikanAbort = new AbortController();
    const results = $('#jikanResults');
    results.innerHTML = '<p class="empty-desc">Đang tra cứu trên AniList...</p>';
    show('jikanResults');
    try {
      const gql = 'query ($search: String) { Page(page: 1, perPage: 6) { media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { id title { romaji english } coverImage { extraLarge large } description status averageScore seasonYear studios(isMain: true) { nodes { name } } episodes genres } } }';
      let data = null;
      let lastErr = null;
      // Thử lại tối đa 3 lần nếu gặp lỗi tạm thời (429/503/504)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(State.config.ANILIST_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query: gql, variables: { search: query } }),
            signal: State.jikanAbort.signal
          });
          if (res.ok) { data = await res.json(); break; }
          lastErr = new Error('HTTP ' + res.status);
          if (res.status !== 429 && res.status !== 503 && res.status !== 504) break;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          lastErr = e;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 700 * attempt));
      }
      if (!data) throw lastErr || new Error('Không có phản hồi từ AniList.');
      const items = (data && data.data && data.data.Page && data.data.Page.media) || [];
      if (items.length === 0) {
        results.innerHTML = '<p class="empty-desc">Không tìm thấy anime nào. Thử tên khác hoặc điền thủ công bên dưới.</p>';
        return;
      }
      results.innerHTML = items.map((it) => {
        const thumb = (it.coverImage && (it.coverImage.extraLarge || it.coverImage.large)) || '';
        const subParts = [];
        subParts.push(it.episodes != null ? it.episodes + ' tập' : 'Chưa rõ số tập');
        if (it.seasonYear) subParts.push(String(it.seasonYear));
        if (it.averageScore != null && it.averageScore > 0) subParts.push(Math.round(it.averageScore / 10) + '/10 điểm');
        return (
          '<div class="jikan-result-item" data-json="' + esc(JSON.stringify(it)).replace(/"/g, '&quot;') + '">' +
            '<div class="jikan-result-thumb">' + (thumb ? '<img src="' + esc(thumb) + '" alt="" loading="lazy" onerror="this.remove()" />' : '') + '</div>' +
            '<div class="jikan-result-info">' +
              '<div class="jikan-result-title">' + esc((it.title && (it.title.romaji || it.title.english)) || '') + '</div>' +
              '<div class="jikan-result-sub">' + esc(subParts.join(' · ')) + '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        results.innerHTML = '<p class="empty-desc">Lỗi tra cứu AniList: ' + esc(err.message) + '. Có thể thử lại hoặc điền thủ công bên dưới.</p>';
      }
    }
  }

  // Gọi AniList GraphQL đơn giản (không retry)
  async function anilistGraphQL(query, variables) {
    const res = await fetch(State.config.ANILIST_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    return res.ok ? await res.json() : null;
  }

  // Fetch dàn diễn viên lồng tiếng + ẢNH NHÂN VẬT theo id AniList
  async function anilistFetchCast(id) {
    const gql = 'query ($id: Int) { Media(id: $id) { characters(sort: ROLE, perPage: 25) { edges { node { name { full } image { large } } voiceActors(language: JAPANESE) { name { full } image { large } } } } } }';
    const data = await anilistGraphQL(gql, { id });
    const edges = (data && data.data && data.data.Media && data.data.Media.characters && data.data.Media.characters.edges) || [];
    const voices = [];
    for (const edge of edges) {
      const va = edge.voiceActors && edge.voiceActors[0];
      if (va) {
        voices.push({
          name: (va.name && va.name.full) || '',
          character: (edge.node && edge.node.name && edge.node.name.full) || '',
          image: (va.image && va.image.large) || '',
          charImage: (edge.node && edge.node.image && edge.node.image.large) || ''
        });
      }
    }
    return voices;
  }

  // Tìm id AniList theo tên anime (dùng cho backfill ảnh nhân vật)
  async function anilistFindIdByTitle(title) {
    const gql = 'query ($search: String) { Page(page: 1, perPage: 1) { media(search: $search, type: ANIME, isAdult: false) { id title { romaji english } } } }';
    const data = await anilistGraphQL(gql, { search: title });
    const m = data && data.data && data.data.Page && data.data.Page.media;
    return (m && m[0] && m[0].id) || null;
  }

  // Nút "Lấy ảnh nhân vật": bổ sung ảnh nhân vật (character art) cho anime cũ theo tên từ AniList
  async function backfillCharacterImages() {
    if (!State.isAdmin) { toast('Bạn không có quyền.', 'error'); return; }
    const btn = $('#backfillCharsBtn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const list = State.animes.slice();
    let updated = 0;
    let skipped = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const seiyuu = Array.isArray(a.seiyuu) ? a.seiyuu : [];
      if (!seiyuu.some((s) => !s.charImage && s.character)) { skipped++; continue; }
      toast('Lấy ảnh nhân vật: ' + (i + 1) + '/' + list.length + ' — ' + (a.title || ''), 'info');
      try {
        const id = await anilistFindIdByTitle(a.title);
        if (!id) { await sleep(350); continue; }
        const cast = await anilistFetchCast(id);
        const keyed = new Map();
        cast.forEach((c) => { if (c.character) keyed.set(c.character.trim().toLowerCase(), c); });
        let changed = false;
        const next = seiyuu.map((s) => {
          if (s.charImage || !s.character) return s;
          const c = keyed.get(String(s.character).trim().toLowerCase());
          if (c && c.charImage) { changed = true; return { ...s, charImage: c.charImage }; }
          return s;
        });
        if (changed) {
          const { error } = await State.supabase.from('animes').update({ seiyuu: next }).eq('id', a.id);
          if (!error) { a.seiyuu = next; updated++; }
        }
      } catch (err) {
        console.warn('Lỗi backfill ảnh nhân vật cho', a.title, err);
      }
      await sleep(600);
    }
    btn.disabled = false;
    renderAnimeGrid();
    toast('Xong! Đã bổ sung ảnh nhân vật cho ' + updated + ' anime' + (skipped ? ' (bỏ qua ' + skipped + ' đã có/không có nhân vật)' : '') + '.', 'success', 6000);
  }

  // Điền dữ liệu AniList vào form + fetch seiyuu + ảnh nhân vật
  async function applyAnilistToForm(it) {
    if (!it) return;
    $('#af_title').value = (it.title && (it.title.english || it.title.romaji)) || '';
    $('#af_poster').value = (it.coverImage && (it.coverImage.extraLarge || it.coverImage.large)) || '';
    $('#af_synopsis').value = stripHtml(it.description || '');
    $('#af_status').value = mapAnilistStatus(it.status);
    $('#af_rating').value = it.averageScore != null ? Math.round((it.averageScore / 10) * 10) / 10 : 0;
    $('#af_year').value = it.seasonYear || '';
    $('#af_studio').value = (it.studios && it.studios.nodes && it.studios.nodes[0] && it.studios.nodes[0].name) || '';
    $('#af_total_ep').value = it.episodes != null ? it.episodes : 0;
    $('#af_genres').value = (it.genres || []).join(', ');

    updatePosterPreview();

    // Fetch seiyuu + ảnh nhân vật từ AniList characters
    toast('Đang tải dàn Seiyuu + ảnh nhân vật...', 'info', 1200);
    try {
      const voices = await anilistFetchCast(it.id);
      if (voices.length) renderSeiyuuEditors(voices);
    } catch (_e) { /* bỏ qua lỗi seiyuu */ }
  }

  // Xoá thẻ HTML (AniList trả description dạng rich text)
  function stripHtml(html) {
    const t = document.createElement('textarea');
    t.innerHTML = String(html || '');
    return t.value;
  }

  function mapAnilistStatus(s) {
    const map = {
      'RELEASING': 'Đang chiếu',
      'FINISHED': 'Hoàn thành',
      'NOT_YET_RELEASED': 'Sắp chiếu',
      'CANCELLED': 'Tạm ngưng',
      'HIATUS': 'Tạm ngưng'
    };
    return map[s] || 'Đang chiếu';
  }

  /* ──────────────────────────────────────────────────────
     18. BACKUP — EXPORT JSON
     ────────────────────────────────────────────────────── */
  async function exportBackup() {
    if (!State.isAdmin) return;
    const btn = $('#exportBackupBtn');
    btn.disabled = true;
    btn.textContent = 'Đang xuất...';
    try {
      const [aR, sR, cR] = await Promise.all([
        State.supabase.from('animes').select('*'),
        State.supabase.from('songs').select('*'),
        State.supabase.from('comments').select('*')
      ]);
      const backup = {
        app: 'KullAnime',
        version: 1,
        exported_at: new Date().toISOString(),
        animes: aR.data || [],
        songs: sR.data || [],
        comments: cR.data || []
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kullanime-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Đã xuất backup ✅', 'success');
    } catch (err) {
      toast('Xuất backup thất bại: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📥 Export Backup JSON';
    }
  }

  /* ──────────────────────────────────────────────────────
     19. EVENT BINDINGS (delegated handlers)
     ────────────────────────────────────────────────────── */
  function bindEvents() {
    // Brand: cuộn về đầu trang
    const brandBtn = $('#brandBtn');
    if (brandBtn) brandBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Tab Section (Anime / Music) — work với .main-nav có [data-tab]
    $('.main-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) switchTab(btn.dataset.tab);
    });

    // Mở modal anime khi click card + nút trạng thái nhanh (admin)
    $('#animeGrid').addEventListener('click', (e) => {
      const card = e.target.closest('.anime-card');
      if (!card || !card.dataset.id) return;

      // Nút điểm ♥ ở meta: bấm để hiện/ẩn hàng 10 trái tim chấm điểm (không mở modal)
      const hBtn = e.target.closest('.card-heart-btn');
      if (hBtn) {
        const row = card.querySelector('.card-heart-row');
        if (row) row.classList.toggle('hidden');
        return;
      }

      // 10 trái tim ♥ trên card (hàng chấm điểm): bấm 1 cái là chấm điểm liền
      const hOpt = e.target.closest('.card-heart-opt');
      if (hOpt) {
        const v = Number(hOpt.dataset.val) || 0;
        saveMyTracker(card.dataset.id, { my_rating: v }).then((ok) => {
          if (ok) toast(v > 0 ? 'Đã chấm ' + v + '/10 ♥' : 'Đã xoá điểm ♥', 'success');
        });
        return;
      }

      const q = e.target.closest('[data-quick]');
      if (q) {
        handleCardQuick(e, q.dataset.quick, card.dataset.id, q);
        return;
      }
      const a = State.animes.find((x) => String(x.id) === String(card.dataset.id));
      if (a) openAnimeDetail(a);
    });

    // Click thể loại / diễn viên trong modal anime → tìm anime theo từ đó
    const detailEl = $('#animeDetail');
    if (detailEl) {
      detailEl.addEventListener('click', (e) => {
        const target = e.target.closest('[data-search]');
        if (!target) return;
        const term = (target.dataset.search || '').trim();
        if (!term) return;
        closeModal('animeModal');
        switchTab('anime');
        const as = $('#animeSearch');
        if (as) as.value = term;
        const stf = $('#statusFilter');
        if (stf) stf.value = 'all';
        const srt = $('#sortFilter');
        if (srt) srt.value = 'newest';
        State.animeVisible = 10;
        renderAnimeGrid();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Lọc & sắp xếp anime đã render sẵn qua renderAnimeGrid()
    const as = $('#animeSearch');
    if (as) as.addEventListener('input', renderAnimeGrid);
    const stf = $('#statusFilter');
    if (stf) stf.addEventListener('change', renderAnimeGrid);
    const srt = $('#sortFilter');
    if (srt) srt.addEventListener('change', renderAnimeGrid);
    const gFil = $('#genreFilter');
    if (gFil) gFil.addEventListener('change', renderAnimeGrid);
    const mSf = $('#myStatusFilter');
    if (mSf) mSf.addEventListener('change', renderAnimeGrid);
    const animeLoadMore = $('#animeLoadMoreBtn');
    if (animeLoadMore) animeLoadMore.addEventListener('click', () => {
      State.animeVisible += 10;
      renderAnimeGrid();
    });
    const songLoadMore = $('#songLoadMoreBtn');
    if (songLoadMore) songLoadMore.addEventListener('click', () => {
      State.songVisible += 15;
      renderSongList();
    });

    // Bình luận: gửi & captcha & toolbar (bold/italic/.../) + paste tự xử lý link/ảnh
    $('#submitCommentBtn').addEventListener('click', submitComment);
    $('#captchaRefresh').addEventListener('click', newCaptcha);
    $$('#composer .tb-btn[data-fmt]').forEach((btn) => {
      btn.addEventListener('click', () => applyFormat(btn.dataset.fmt));
    });
    const commentBox = $('#commentBox');
    if (commentBox) commentBox.addEventListener('paste', (e) => onSmartPaste(e, commentBox));
    $('#uploadImgInput').addEventListener('change', handleImageUpload);
    $('#commentLoadMoreBtn').addEventListener('click', () => {
      State.commentVisible += 20;
      renderCommentList();
    });

    // Chat chung (sticky dock): gửi & captcha & toolbar & paste & click nhãn anime & mở rộng
    $('#chatSendBtn').addEventListener('click', submitChat);
    $('#chatCaptchaRefresh').addEventListener('click', newChatCaptcha);
    $$('#chatComposer [data-fmt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const box = $('#chatBox');
        applyFormatTo(box, btn.dataset.fmt);
      });
    });
    const chatBox = $('#chatBox');
    if (chatBox) chatBox.addEventListener('paste', (e) => onSmartPaste(e, chatBox));
    $('#chatUploadImgInput').addEventListener('change', handleChatImageUpload);
    $('#chatLoadMoreBtn').addEventListener('click', () => {
      State.chatVisible += 20;
      renderGlobalChat();
    });
    // Bật/tắt panel chat từ nút bong bóng (FAB)
    const chatFab = $('#chatFab');
    const chatClose = $('#chatCloseBtn');
    const toggleChatPanel = () => {
      State.chatExpanded = !State.chatExpanded;
      const panel = $('#chatDock');
      if (panel) panel.classList.toggle('hidden', !State.chatExpanded);
      if (chatFab) chatFab.setAttribute('aria-expanded', String(State.chatExpanded));
      if (State.chatExpanded) {
        renderGlobalChat();
        newChatCaptcha();
        const box = $('#chatBox');
        if (box) box.focus();
      }
    };
    if (chatFab) {
      chatFab.addEventListener('click', toggleChatPanel);
      chatFab.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChatPanel(); }
      });
    }
    if (chatClose) chatClose.addEventListener('click', () => {
      if (State.chatExpanded) toggleChatPanel();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && State.chatExpanded) toggleChatPanel();
    });
    $('#chatDock').addEventListener('click', (e) => {
      // Click nhãn anime trong chat (cả preview lẫn list) → mở modal chi tiết
      const tag = e.target.closest('[data-anime-id]');
      if (tag) {
        e.preventDefault();
        const a = State.animes.find((x) => String(x.id) === String(tag.dataset.animeId));
        if (a) openAnimeDetail(a);
        return;
      }
      // Admin actions trong chat
      const btn = e.target.closest('[data-cact2]');
      if (btn) handleChatAdminAction(btn.dataset.cact2, btn.dataset.id);
    });

    // Admin: mở panel
    $('#adminBtn').addEventListener('click', () => {
      openModal('adminModal');
      renderAdminAnimeList();
      renderAdminSongList();
      renderAdminCommentList();
    });
    // Admin tab
    $$('#adminModal [data-atab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('#adminModal [data-atab]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        $$('#adminModal [data-apane]').forEach((p) => p.classList.remove('active'));
        const panel = $('#adminModal [data-apane="' + btn.dataset.atab + '"]');
        if (panel) panel.classList.add('active');
      });
    });

    // Admin anime list actions (delegate)
    $('#adminAnimeList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-apact]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.apact === 'edit') openEditAnimeForm(id);
      else if (btn.dataset.apact === 'del') deleteAnime(id);
    });

    // Admin song list actions (delegate)
    $('#adminSongList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-spact]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.spact === 'edit') {
        const s = State.songs.find((x) => String(x.id) === String(id));
        openSongForm(s);
      } else if (btn.dataset.spact === 'del') deleteSong(id);
    });

    // Admin comment list actions (delegate)
    $('#adminCommentList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cact]');
      if (!btn) return;
      adminCommentAction(btn.dataset.cact, btn.dataset.id);
    });

    // Nút thêm anime, bài hát
    $('#addAnimeBtn').addEventListener('click', openAddAnimeForm);
    $('#addSongBtn').addEventListener('click', () => openSongForm(null));

    // Forms
    $('#loginForm').addEventListener('submit', handleLogin);
    $('#animeForm').addEventListener('submit', saveAnime);
    $('#songForm').addEventListener('submit', saveSong);

    // Seiyuu thêm dòng
    $('#addSeiyuuBtn').addEventListener('click', () => {
      const wrap = $('#afSeiyuuList');
      const row = document.createElement('div');
      row.className = 'seiyuu-editor-row';
      row.innerHTML =
        '<input type="text" class="input" data-seiyuu="name" placeholder="Tên Seiyuu" />' +
        '<input type="text" class="input" data-seiyuu="character" placeholder="Nhân vật" />' +
        '<input type="text" class="input" data-seiyuu="image" placeholder="Ảnh Seiyuu URL" />' +
        '<input type="text" class="input" data-seiyuu="charImage" placeholder="Ảnh nhân vật URL" />' +
        '<button type="button" class="seiyuu-remove" title="Xóa">✕</button>';
      row.querySelector('.seiyuu-remove').addEventListener('click', () => row.remove());
      wrap.appendChild(row);
    });

    // AniList tìm kiếm (input id = jikanQuery)
    $('#jikanSearchBtn').addEventListener('click', () => {
      const q = $('#jikanQuery').value.trim();
      if (q) anilistSearch(q);
    });
    $('#jikanQuery').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = $('#jikanQuery').value.trim();
        if (q) anilistSearch(q);
      }
    });
    $('#jikanResults').addEventListener('click', (e) => {
      const item = e.target.closest('[data-json]');
      if (!item) return;
      try {
        const it = JSON.parse(decodeEntities(item.dataset.json));
        $('#jikanQuery').value = (it.title && (it.title.english || it.title.romaji)) || '';
        applyAnilistToForm(it);
        hi('jikanResults');
        toast('Đã điền dữ liệu từ AniList ✅', 'success');
      } catch (err) {
        toast('Lỗi phân tích dữ liệu.', 'error');
      }
    });

    // Poster preview + upload
    $('#af_poster').addEventListener('input', updatePosterPreview);
    $('#af_posterUpload').addEventListener('click', () => $('#af_avatarInput').click());
    $('#af_avatarInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const res = await uploadImageToCloudinary(file);
        $('#af_poster').value = res.secure_url || res.url || '';
        updatePosterPreview();
        toast('Đã tải poster lên ✅', 'success');
      } catch (err) {
        toast('Lỗi tải ảnh: ' + err.message, 'error', 5000);
      }
      e.target.value = '';
    });

    // Export backup
    $('#exportBackupBtn').addEventListener('click', exportBackup);

    // Lấy ảnh nhân vật cho toàn bộ anime cũ (admin)
    $('#backfillCharsBtn').addEventListener('click', () => backfillCharacterImages());

    // Comment actions trong modal anime (delegate)
    $('#animeModal').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) handleCommentAction(btn.dataset.act, btn.dataset.id);
      // Thể loại: nút ">" mở/đóng toàn bộ
      const gmore = e.target.closest('[data-genre-more]');
      if (gmore) {
        const wrap = gmore.closest('.genre-chips');
        if (wrap) {
          const open = wrap.classList.toggle('open');
          const caret = wrap.querySelector('[data-more-caret]');
          const label = wrap.querySelector('[data-more-label]');
          if (caret) caret.textContent = open ? '▴' : '▾';
          if (label) {
            label.textContent = open ? 'Thu gọn' : (wrap.querySelectorAll('.chip-btn').length - 5) + ' thể loại';
          }
        }
        return;
      }
      // Icon trạng thái xem của tôi — bấm là lưu liền (⏳ lưu "Đang xem" + mở popup chọn tập)
      const watchIco = e.target.closest('.watch-ico');
      if (watchIco && watchIco.dataset.status) {
        const tracker = $('#myTracker');
        if (tracker && tracker.dataset.anime) {
          if (watchIco.dataset.status === 'Đang xem') {
            e.__popOpened = true;
            openEpisodePop(watchIco, tracker.dataset.anime);
            saveMyTracker(tracker.dataset.anime, { my_status: 'Đang xem' });
          } else {
            saveMyTracker(tracker.dataset.anime, { my_status: watchIco.dataset.status });
          }
        }
        return;
      }
      // Nút ♥ trong tracker mở popup chấm điểm
      const rateBtn = e.target.closest('#myRatingBtn');
      if (rateBtn) {
        const tracker = $('#myTracker');
        if (tracker && tracker.dataset.anime) {
          e.__popOpened = true;
          openHeartPop(rateBtn, tracker.dataset.anime);
        }
        return;
      }
    });

    // Popup mini (chọn tập / chấm ♥): xử lý chọn + đóng khi bấm bên ngoài
    document.addEventListener('click', (e) => {
      // Menu trạng thái (🌸 trên card): chọn 1 — "Đang xem" mở tiếp popup chọn tập
      const st = e.target.closest('#statusPop .status-opt');
      if (st) {
        const pop = $('#statusPop');
        const id = pop && pop.dataset.anime;
        if (id) {
          const lbl = String(st.dataset.status || '');
          if (lbl === 'Đang xem') {
            e.__popOpened = true;
            const r = st.getBoundingClientRect();
            closeMiniPop();
            openEpisodePop(st, id);
            const epP = $('#epPop');
            if (epP && r) {
              const pw = epP.offsetWidth;
              const ph = epP.offsetHeight;
              let left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
              let top = r.bottom + 6;
              if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
              epP.style.left = left + 'px';
              epP.style.top = top + 'px';
            }
            const a = State.animes.find((x) => String(x.id) === String(id));
            if (a && myStatusMeta(a.my_status).cls !== 'my-watching') saveMyTracker(id, { my_status: 'Đang xem' });
          } else {
            closeMiniPop();
            saveMyTracker(id, { my_status: lbl }).then((ok) => {
              if (ok) toast('Đã đặt trạng thái: ' + lbl, 'success');
            });
          }
        }
        return;
      }
      const ep = e.target.closest('#epPop .ep-opt');
      if (ep) {
        const pop = $('#epPop');
        if (pop && pop.dataset.anime) pickEpisode(pop.dataset.anime, ep.dataset.ep);
        return;
      }
      const ht = e.target.closest('#heartPop .heart-opt');
      if (ht) {
        const pop = $('#heartPop');
        if (pop && pop.dataset.anime) pickHeart(pop.dataset.anime, ht.dataset.val);
        return;
      }
      if (!e.target.closest('#heartPop, #epPop, #statusPop') && !e.__popOpened) closeMiniPop();
    });
  }

  /* ──────────────────────────────────────────────────────
     20. SWITCH TAB (Anime / Music / Chat chung)
     ────────────────────────────────────────────────────── */
  // Tự làm mới chat chung mỗi 30s (chat luôn trực quan trong sticky bar)
  function refreshChat() {
    loadGlobalChat();
    if (State.chatTimer) clearInterval(State.chatTimer);
    State.chatTimer = setInterval(() => {
      loadGlobalChat();
    }, 30000);
  }

  // Upload ảnh trong chat chung
  async function handleChatImageUpload() {
    const input = $('#chatUploadImgInput');
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const result = await uploadImageToCloudinary(file);
      const url = result.secure_url || result.url;
      if (!url) throw new Error('Không lấy được URL ảnh.');
      const box = $('#chatBox');
      const imgMd = '![' + esc(file.name || 'ảnh') + '](' + esc(url) + ')';
      box.value = (box.value || '') + (box.value ? '\n' : '') + imgMd;
      toast('Đã tải ảnh lên ✅', 'success');
    } catch (err) {
      toast('Lỗi tải ảnh: ' + err.message, 'error', 5000);
    }
    input.value = '';
  }

  function switchTab(tabName) {
    if (tabName !== 'anime' && tabName !== 'music') return;
    $$('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.dataset.panel === tabName);
    });
    $$('.nav-tab[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });
    // Đổi brand theo tab: KullAnime hoặc KullSong
    const brand = $('#brandName');
    if (brand) {
      brand.innerHTML = tabName === 'anime' ? 'Kull<em>Anime</em>' : 'Kull<em>Song</em>';
    }
  }

  function closeAllModals() {
    $$('.modal-overlay.open').forEach((m) => {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  function decodeEntities(str) {
    const txt = document.createElement('textarea');
    txt.innerHTML = String(str || '');
    return txt.value;
  }

  /* ──────────────────────────────────────────────────────
     21. KHỞI TẠO APP
     ────────────────────────────────────────────────────── */
  async function init() {
    await initSupabase();
    bindEvents();
    // Khôi phục tab đang active (mặc định anime)
    switchTab('anime');
    // Tải dữ liệu công khai
    await Promise.all([loadAnimes(), loadSongs()]);
    fetchSubsFiles();
    updateLoginUI();
    refreshAuthState();
    // Khởi động chat chung (sticky bar) + captcha chat
    newChatCaptcha();
    refreshChat();
    // Tự làm mới dữ liệu công khai mỗi phút
    setInterval(() => { loadAnimes(); loadSongs(); }, REFRESH_MS);
  }

  // Bắt đầu khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


