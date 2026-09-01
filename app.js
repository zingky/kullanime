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
    assQuery: '',          // từ khoá tìm kiếm file .ass
    currentAnime: null,    // anime đang xem trong modal
    currentSong: null,     // bài hát đang phát
    subtitles: [],         // mảng cue phụ đề ASS đã parse (engine)
    subsEnabled: false,
    subsTick: null,
    subSettings: null,     // cài đặt toàn cục phụ đề (fontSize, màu, karaoke...) -> lưu localStorage
    timeShiftMs: 0,        // dời phụ đề theo ms (Timeshift)
    subOverlayHeight: 0,   // chiều cao overlay phụ đề (dùng scaleH cho fontSize)
    // Dữ liệu engine phụ đề ASS (port từ YouTube-Aegisub-Loader)
    styleSettings: {},     // { styleName: {color1,color3,fontSize,outlineWidth,blur,spacing,fontName,align,posX,posY,...} }
    playResX: 384,
    playResY: 288,
    rawAssText: '',
    lastRenderTime: 0,
    isAdmin: false,
    isLoggedIn: false,   // đã đăng nhập (thành viên hoặc admin)
    adminEmail: '',
    nickname: '',        // tên hiển thị (nickname) của tài khoản đã đăng nhập
    youtubeReady: false,
    ytPlayer: null,
    ytReady: false,        // player da san sang (onReady da chay) - moi load video an toan
    pendingPlay: null,     // bai hat cho phat khi YT API san sang
    pendingVideoId: null,  // videoId cho nap khi player onReady
    autoNext: true,        // tự động chuyển bài kế tiếp khi bài hiện tại kết thúc
    shuffle: false,        // phát ngẫu nhiên khi kết thúc / bấm next
    repeat: false,         // lặp lại 1 bài: khi hết bài thì phát lại chính bài đó
    // Rate limit comment
    lastCommentAt: 0,
    lastChatAt: 0,
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

  // ── Inline Confirm: hiện bubbles xác nhận nhỏ ngay tại nút cần xác nhận ──
  // Dùng cho các hành động phá huỷ (Reset All, Reset video này).
  // Returns Promise<boolean> — true nếu người dùng xác nhận.
  function inlineConfirm(anchor, msg, confirmLabel) {
    confirmLabel = confirmLabel || 'Xác nhận';
    return new Promise(function (resolve) {
      // Xoá bubble cũ nếu có
      var old = document.querySelector('.ic-confirm-bubble');
      if (old) old.remove();
      var bubble = document.createElement('div');
      bubble.className = 'ic-confirm-bubble';
      bubble.innerHTML =
        '<span class="ic-msg">' + msg + '</span>' +
        '<button type="button" class="ic-yes">✓ ' + confirmLabel + '</button>' +
        '<button type="button" class="ic-no">✗</button>';
      document.body.appendChild(bubble);
      // Căn vị trí ngay dưới / cạnh anchor
      var rect = anchor.getBoundingClientRect();
      var bTop = rect.bottom + window.scrollY + 6;
      var bLeft = rect.left + window.scrollX;
      // Đảm bảo bubble không tràn phải màn hình
      if (bLeft + 260 > window.innerWidth + window.scrollX) bLeft = window.innerWidth + window.scrollX - 270;
      if (bLeft < window.scrollX + 4) bLeft = window.scrollX + 4;
      bubble.style.top = bTop + 'px';
      bubble.style.left = bLeft + 'px';
      var cleaned = false;
      var cleanup = function (result) {
        if (cleaned) return;
        cleaned = true;
        bubble.remove();
        resolve(result);
      };
      bubble.querySelector('.ic-yes').onclick = function (e) { e.stopPropagation(); cleanup(true); };
      bubble.querySelector('.ic-no').onclick = function (e) { e.stopPropagation(); cleanup(false); };
      // Đóng khi click ra ngoài
      var onDown = function (e) {
        if (!bubble.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
          document.removeEventListener('pointerdown', onDown);
          cleanup(false);
        }
      };
      setTimeout(function () { document.addEventListener('pointerdown', onDown); }, 20);
      var onEsc = function (e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onEsc); cleanup(false); }
      };
      document.addEventListener('keydown', onEsc);
      // Tự đóng sau 8 giây
      setTimeout(function () { cleanup(false); }, 8000);
    });
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
    const loading = $('#songLoading');
    if (loading) loading.classList.remove('hidden');
    const empty = $('#songEmpty');
    if (empty) empty.classList.add('hidden');
    const { data, error } = await State.supabase
      .from('songs')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (loading) loading.classList.add('hidden');
    if (error) {
      console.error('Lỗi đọc songs:', error);
      toast('Không tải được danh sách nhạc: ' + error.message, 'error', 5000);
      return;
    }
    State.songs = data || [];
    renderSongList();
  }


  /* ──────────────────────────────────────────────────────
     5. GITHUB: TỰ ĐỘNG LẤY DANH SÁCH FILE .ass (NHIỀU REPO + CACHE)
     ────────────────────────────────────────────────────── */
  const ASS_REPOS_KEY = 'kullanime_ass_repos_v1';

  function readAssRepos() {
    try {
      const raw = localStorage.getItem(ASS_REPOS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_e) { return []; }
  }
  function writeAssRepos(list) {
    try { localStorage.setItem(ASS_REPOS_KEY, JSON.stringify(list)); } catch (_e) { /* quota */ }
  }
  function parseAssRepo(url) {
    let owner = '', repo = '', branch = 'main', path = 'subs';
    try {
      const m = String(url || '').match(/github\.com\/([^/]+)\/([^/\s?#]+)/i);
      if (m) { owner = m[1]; repo = m[2].replace(/\.git$/, ''); }
      const treeM = String(url || '').match(/\/tree\/([^/\s?#]+)(\/[\s\S]*)?$/);
      if (treeM) {
        branch = treeM[1];
        if (treeM[2]) path = treeM[2].replace(/^\/+|\/+$/g, '') || path;
      }
    } catch (_e) { /* ignore */ }
    return { owner: owner, repo: repo, branch: branch, path: path };
  }
  function listUrlFor(repo) {
    return 'https://api.github.com/repos/' + repo.owner + '/' + repo.repo +
      '/contents/' + repo.path + '?ref=' + repo.branch;
  }
  function getAssRepoList() {
    const list = [];
    if (State.config && State.config.GITHUB_SUBS_OWNER) {
      list.push({ owner: State.config.GITHUB_SUBS_OWNER, repo: State.config.GITHUB_SUBS_REPO, branch: State.config.GITHUB_SUBS_BRANCH, path: State.config.GITHUB_SUBS_PATH });
    }
    readAssRepos().forEach((r) => {
      const p = parseAssRepo(typeof r === 'string' ? r : r.url);
      if (p.owner && p.repo) list.push(p);
    });
    return list;
  }
  async function fetchRepoAssFiles(repo) {
    const res = await fetch(listUrlFor(repo), { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' (' + repo.owner + '/' + repo.repo + ')');
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .filter((f) => f.type === 'file' && /\.ass$/i.test(f.name))
      .map((f) => ({ name: f.name, path: f.path, download_url: f.download_url, size: f.size }));
  }
  async function fetchSubsFiles() {
    if (!State.config) return;
    const statusEl = $('#assStatus');
    const repos = getAssRepoList();
    try {
      statusEl.textContent = 'Đang kết nối Github (' + repos.length + ' repo)...';
      const results = await Promise.allSettled(repos.map(fetchRepoAssFiles));
      let list = [];
      results.forEach((r) => { if (r.status === 'fulfilled') list = list.concat(r.value); });
      const seen = {};
      State.subsFiles = list.filter((f) => {
        if (seen[f.name]) return false;
        seen[f.name] = true;
        return true;
      });
      mergeAssCacheIntoSubs();
      renderAssCacheList();
      renderAssStatus();
    } catch (err) {
      console.warn('Lỗi fetch subs:', err.message);
      State.subsFiles = [];
      mergeAssCacheIntoSubs();
      renderAssCacheList();
      if (statusEl) statusEl.textContent = '⚠️ Không tải được kho phụ đề GitHub.';
      renderAssStatus();
    }
  }
  function renderAssRepoList() {
    const listEl = $('#assRepoList');
    if (!listEl) return;
    const repos = readAssRepos();
    if (repos.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-faint);font-size:12px">Chưa có repo phụ thêm. Repo mặc định (config) luôn được nạp.</p>';
      return;
    }
    listEl.innerHTML = repos.map((r, i) => {
      const url = typeof r === 'string' ? r : (r.url || '');
      const p = parseAssRepo(url);
      const display = p.owner && p.repo ? (p.owner + '/' + p.repo) : url;
      return (
        '<div class="repo-item" data-idx="' + i + '">' +
          '<span class="repo-url" title="' + esc(url) + '">' + esc(display) + '</span>' +
          '<span class="repo-meta">' + esc(p.branch || '') + (p.path ? '/' + esc(p.path) : '') + '</span>' +
          '<button class="mini-btn danger" data-rp="del" data-idx="' + i + '">🗑</button>' +
        '</div>'
      );
    }).join('');
  }

  function renderAssCacheList(query) {
    const list = $('#assCacheList');
    if (!list) return;
    const cache = readAssCache();
    const q = (query || '').trim().toLowerCase();
    let names = Object.keys(cache).sort((a, b) => (cache[a].addedAt || 0) - (cache[b].addedAt || 0));
    if (q) names = names.filter((n) => n.toLowerCase().includes(q));
    if (names.length === 0) {
      list.innerHTML = '<div class="ass-cache-empty">Chưa có file .ass nào trong cache. Hãy tải file lên ở trên.</div>';
      return;
    }
    list.innerHTML = names.map((name) => {
      const yid = parseAssYoutubeId(name);
      const title = stripAssTitle(name);
      const isActive = State.currentSong && String(State.currentSong.id) === 'ass:' + name;
      const cls = 'ass-cache-row' + (isActive ? ' active' : '');
      const thumb = yid
        ? '<span class="ass-file-thumb"><img src="https://i.ytimg.com/vi/' + yid + '/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest(\'.ass-file-thumb\').classList.add(\'no-img\')" /><span class="ass-thumb-dur">▶</span></span>'
        : '';
      return (
        '<div class="' + cls + '" data-cache-ass="' + esc(name) + '">' +
          thumb +
          '<span class="ass-file-name" title="' + esc(name) + '">' + esc(title || name) + '</span>' +
          '<span class="ass-cache-actions">' +
            '<button class="cc-play" title="Phát video này" data-cact="play">▶</button>' +
            '<button class="cc-dl" title="Tải ngược file .ass về máy">⬇</button>' +
            '<button class="danger" data-cact="del" title="Xóa khỏi cache">🗑</button>' +
          '</span>' +
        '</div>'
      );
    }).join('');
  }

  // Tải ngược file .ass về máy với đúng tên "youtubeID_tiêu đề.ass"
  function downloadCachedAss(name) {
    const entry = readAssCache()[name];
    if (!entry || !entry.text) return;
    const blob = new Blob([entry.text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    toast('Đã tải về: ' + name, 'success', 2400);
  }

  // Lưu file .ass vừa chọn vào cache (đặt tên theo link YT + tiêu đề tự nhận)
  function addAssFileToCache(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const ytEl = $('#assCacheYt'), idEl = $('#assCacheId'), titleEl = $('#assCacheTitle');
      const name = buildAssCacheFileName(
        (ytEl && ytEl.value) || (idEl && idEl.value),
        (titleEl && titleEl.value) || (ytEl && ytEl.value)
      );
      const cache = readAssCache();
      cache[name] = { name: name, text: text, addedAt: Date.now() };
      writeAssCache(cache);
      toast('Đã lưu "💾 ' + name + '" vào Phụ đề Cache.', 'success', 2600);
      renderAssCacheList();
      mergeAssCacheIntoSubs();
      renderAssStatus();
      if (ytEl) ytEl.value = '';
      if (idEl) idEl.value = '';
      if (titleEl) titleEl.value = '';
    };
    reader.onerror = () => toast('Không đọc được file.', 'error');
    reader.readAsText(file);
  }

  function deleteAssCache(name) {
    if (!confirm('Xóa "💾 ' + name + '" khỏi Phụ đề Cache?')) return;
    const cache = readAssCache();
    delete cache[name];
    writeAssCache(cache);
    renderAssCacheList();
    State.subsFiles = (State.subsFiles || []).filter((f) => !(f.cached && f.name === name));
    renderAssStatus();
    toast('Đã xóa khỏi cache.', 'success');
  }

  // Phát 1 file .ass trong cache: tạo song rồi bơm text trực tiếp (không cần fetch)
  async function playCachedAss(name) {
    const entry = readAssCache()[name];
    if (!entry || !entry.text) return;
    const file = { name: name, cached: true, text: entry.text, download_url: null };
    const song = buildAssSong(file);
    if (!song) {
      toast('ID sai — tên file phải bắt đầu bằng YouTube ID hợp lệ.', 'error', 4000);
      return;
    }
    await playSong(song);
    renderAssCacheList();
    renderAssStatus();
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
    // Lọc theo từ khoá tìm kiếm
    const q = (State.assQuery || '').trim().toLowerCase();
    const filtered = q
      ? State.subsFiles.filter((f) => f.name.toLowerCase().includes(q))
      : State.subsFiles;
    statusEl.textContent = q
      ? 'Tìm thấy ' + filtered.length + '/' + State.subsFiles.length + ' file .ass.'
      : 'Tìm thấy ' + State.subsFiles.length + ' file .ass — bấm để phát.';
    if (list) {
      if (filtered.length === 0) {
        list.innerHTML = '<div class="ass-file-item"><span class="dot"></span>Không có file khớp.</div>';
        return;
      }
      list.innerHTML = filtered.map((f) => {
        const yid = parseAssYoutubeId(f.name);
        const title = stripAssTitle(f.name);
        const isActive = State.currentSong && State.currentSong.id === 'ass:' + f.name;
        const cls = 'ass-file-item' + (yid ? ' clickable' : '') + (isActive ? ' active' : '');
        const badge = yid
          ? '<span class="ass-file-play-btn">▶</span>'
          : '<span class="ass-file-bad" title="File này không có YouTube ID hợp lệ">ID sai</span>';
        const thumb = yid
          ? '<span class="ass-file-thumb"><img src="https://i.ytimg.com/vi/' + yid + '/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest(\'.ass-file-thumb\').classList.add(\'no-img\')" /><span class="ass-thumb-dur">▶</span></span>'
          : '';
        return (
          '<div class="' + cls
          + '" data-ass="' + esc(f.name) + '" tabindex="0" role="button" aria-label="Mở video ' + esc(title) + '">'
          + thumb
          + '<span class="ass-file-name">' + esc(title) + '</span>'
          + badge
          + '</div>'
        );
      }).join('');
    }
  }

  // Lấy YouTube ID từ tên file .ass theo định dạng "youtubeID_tiêu đề.ass"
  function parseAssYoutubeId(name) {
    const base = String(name || '').replace(/\.ass$/i, '').trim();
    // YouTube ID thường là 11 ký tự [A-Za-z0-9_-], nằm đầu tên file, theo sau bởi "_" hoặc " "
    const m = base.match(/^([A-Za-z0-9_-]{11})(?=(\s|_)|$)/);
    return m ? m[1] : '';
  }

  // Bỏ tiền tố YouTube ID khỏi tên file để hiển thị tiêu đề video
  function stripAssTitle(name) {
    return String(name || '')
      .replace(/\.ass$/i, '')
      .replace(/^[A-Za-z0-9_-]{11}[\s_]+/, '')
      .trim() || String(name || '').replace(/\.ass$/i, '').trim();
  }

  // Dựng đối tượng bài hát từ 1 file .ass (dùng chung cho playAssSub & tiến/lùi bài)
  function buildAssSong(file) {
    const yid = parseAssYoutubeId(file.name);
    if (!yid) return null;
    return {
      id: 'ass:' + file.name,
      youtube_id: yid,
      ass_file: file.name,
      title: stripAssTitle(file.name),
      artist: '',
      anime: 'Phụ đề .ass',
      song_type: 'ASS'
    };
  }

  // Danh sách file .ass có YouTube ID hợp lệ (dùng làm playlist khi bấm tiến/lùi bài)
  function getAssPlaylist() {
    return (State.subsFiles || []).filter((f) => !!parseAssYoutubeId(f.name));
  }

  /* ──────────────────────────────────────────────────────
     5.1 PHỤ ĐỀ CACHE — file .ass lưu trên máy người dùng
     (localStorage, KHÔNG đồng bộ server). Dùng chung định dạng
     tên "youtubeID_tiêu đề.ass" để khớp video + playlist.
     ────────────────────────────────────────────────────── */
  const ASS_CACHE_KEY = 'kullanime_ass_cache_v1';

  function readAssCache() {
    try {
      const raw = localStorage.getItem(ASS_CACHE_KEY);
      if (!raw) return {};
      const c = JSON.parse(raw);
      return (c && typeof c === 'object') ? c : {};
    } catch (_e) { return {}; }
  }
  function writeAssCache(cache) {
    try { localStorage.setItem(ASS_CACHE_KEY, JSON.stringify(cache)); } catch (_e) {
      toast('Dung lượng Phụ đề Cache đã đầy — hãy xóa bớt file cũ.', 'warning', 4000);
    }
  }
  // Làm sạch tên: chỉ giữ ký tự an toàn, thay chuỗi trắng bằng '_'
  function sanitizeAssTitle(str) {
    return String(str || '')
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 120);
  }
  // Dựng tên file "youtubeID_tiêu đề.ass" từ link/ID YouTube + tiêu đề (tuỳ chọn)
  function buildAssCacheFileName(ytInput, titleInput) {
    const yid = parseYoutubeId(ytInput);
    const base = sanitizeAssTitle(titleInput);
    let name;
    if (yid) {
      name = base ? (yid + '_' + base) : yid;
    } else {
      name = base || 'untitled';
    }
    return name.replace(/\.ass$/i, '') + '.ass';
  }
  // Gộp file trong cache vào State.subsFiles (đánh dấu cached + giữ text)
  function mergeAssCacheIntoSubs() {
    const cache = readAssCache();
    const names = Object.keys(cache);
    if (!names.length) return;
    names.forEach((name) => {
      const entry = cache[name];
      if (!entry || !entry.text) return;
      // tránh trùng tên với file từ GitHub
      if (State.subsFiles.some((f) => f.name === name)) return;
      State.subsFiles.push({
        name: name,
        path: 'cache:' + name,
        download_url: null,
        size: (entry.text || '').length,
        cached: true,
        text: entry.text,
        addedAt: entry.addedAt || 0
      });
    });
  }

  // Kiểm tra bài hát hiện tại có phải là file .ass từ kho GitHub không
  function isAssSongId(id) {
    return typeof id === 'string' && id.indexOf('ass:') === 0;
  }

  // Mở video YouTube theo file .ass (click vào kết quả tìm kiếm)
  async function playAssSub(file) {
    if (!file) return;
    const song = buildAssSong(file);
    if (!song) {
      toast('ID sai — file "' + file.name + '" không có YouTube ID hợp lệ.', 'error', 4000);
      return;
    }
    await playSong(song);
    renderAssStatus();
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
     6. ASS ENGINE — PARSER + RENDERER
     Port nguyên lý render phụ đề ASS từ
     YouTube-Aegisub-Loader (parser.js + engine-css.js + globals.js):
     parseAssEngine() + assembleCue() + renderAssSubtitle() dưới đây thay
     thế parseAss() cũ — hỗ trợ Style, {\pos}, {\an}, karaoke {\k},
     màu/outline/shadow, xuống dòng {\N}.
     ────────────────────────────────────────────────────── */
  // (parseAss() cũ đã được thay bằng parseAssEngine() — xem bên dưới)
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
  // seconds (float) -> "h:mm:ss.cc" (3 chữ số phần trăm giây, clamp không âm)
  function formatAssTimestamp(sec) {
    sec = Math.max(0, Number(sec) || 0);
    const h = Math.floor(sec / 3600);
    const min = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec - Math.floor(sec)) * 1000);
    return h + ':' + String(min).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(3, '0');
  }
  // Shift toàn bộ timestamp trong text ASS bởi offsetMs (âm/không âm đều được).
  // Chỉ tác động các cặp timestamp "h:mm:ss.cc,h:mm:ss.cc" trong dòng Dialogue.
  function shiftAssTimestamps(text, offsetMs) {
    if (!text || !offsetMs) return text;
    const offsetSec = offsetMs / 1000;
    return String(text).replace(/(\d+:\d{1,2}:\d{1,2}[.:]\d{1,3}),(\d+:\d{1,2}:\d{1,2}[.:]\d{1,3})/g, (m, a, b) => {
      const ta = parseAssTime(a), tb = parseAssTime(b);
      if (ta == null || tb == null) return m;
      return formatAssTimestamp(ta + offsetSec) + ',' + formatAssTimestamp(tb + offsetSec);
    });
  }

  // &HAABBGGRR (ASS) -> #RRGGBB (CSS)
  function assToHex(assStr) {
    let clean = String(assStr || '').replace(/&H|&/gi, '');
    if (clean.length > 6) clean = clean.substring(2); // bỏ alpha
    while (clean.length < 6) clean = '0' + clean;
    return '#' + clean.substring(4, 6) + clean.substring(2, 4) + clean.substring(0, 2);
  }

  // #RRGGBB + alpha -> rgba()
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // Aegisub-style outline: vòng 8 hướng text-shadow + blur.
  function buildShadow(ow, bl, oc, useStroke) {
    const ow2 = Math.max(0, Number(ow) || 0);
    const bl2 = Math.max(0, Number(bl) || 0);
    if (ow2 <= 0 && bl2 <= 0) return 'none';
    if (useStroke) {
      // text-stroke lo viền sắc nét; shadow chỉ còn blur-glow (ow làm nở rộng)
      if (bl2 <= 0) return 'none';
      return '0 0 ' + Math.max(bl2 + ow2, 1) + 'px ' + oc;
    }
    const shadows = [];
    const ring = Math.max(1, Math.ceil(ow2));
    for (let x = -ring; x <= ring; x++) {
      for (let y = -ring; y <= ring; y++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= ow2 + 0.01) shadows.push(x + 'px ' + y + 'px 0 ' + oc);
      }
    }
    for (let i = 1; i <= Math.max(1, Math.ceil(bl2)); i++) {
      shadows.push('0 0 ' + (i * 2) + 'px ' + oc);
    }
    return shadows.length ? shadows.join(',') : 'none';
  }

  // Deep glow: nhiều lớp text-shadow chồng nhau (port từ globals.js)
  function buildDeepGlow(ow, bl, oc, useStroke) {
    const ow2 = Math.max(0, Number(ow) || 0);
    const bl2 = Math.max(0, Number(bl) || 0);
    if (ow2 <= 0 && bl2 <= 0) return 'none';
    const layers = [];
    if (useStroke) {
      for (let i = 1; i <= 4; i++) {
        const blur = (bl2 + ow2) * i * 1.2;
        layers.push('0 0 ' + Math.max(blur, 1) + 'px ' + oc);
      }
      return layers.join(', ');
    }
    for (let i = 1; i <= 4; i++) {
      const spread = ow2 * i * 1.2;
      const blur = bl2 * i * 1.2;
      layers.push(spread + 'px ' + spread + 'px ' + blur + 'px ' + oc + ', -' + spread + 'px -' + spread + 'px ' + blur + 'px ' + oc);
    }
    layers.push('0 0 ' + bl2 + 'px ' + oc);
    return layers.join(', ');
  }

  /* ──────────────────────────────────────────────────────
     HIỆU ỨNG ĐẶC BIỆT (SPECIAL EFFECT)
     Port từ extension engine-css.js. Các hàm render* nhận 1 spanWrap
     rồi lấp đầy nó bằng nội dung + style hiệu ứng. Dùng State.subsFrame
     (tăng mỗi tick updateCurrentSubtitle) thay cho _animFrameCount của
     extension; *0.016 để ước lượng thời gian giây (khớp cách extension dùng).
     ────────────────────────────────────────────────────── */

  // Lấy tốc độ riêng của từng hiệu ứng (mặc định theo từng effect)
  function effSpeed(key, fallback) {
    const sp = (State.subSettings && State.subSettings.effectSpeed) || {};
    const v = sp[key];
    return (v != null && !isNaN(Number(v))) ? Number(v) : fallback;
  }
  // Đồng hồ hiệu ứng (giây ước lượng, y như extension _animFrameCount*0.016)
  function effT() { return (State.subsFrame || 0) * 0.016; }
  // Shadow helper theo deepGlow setting hiện tại
  function effShadow(ow, bl, oc, useStroke) {
    const deepGlow = !!(State.subSettings && State.subSettings.deepGlow);
    return deepGlow ? buildDeepGlow(ow, bl, oc, useStroke) : buildShadow(ow, bl, oc, useStroke);
  }

  function renderRainbowOutline(spanWrap, lineText, ow, bl) {
    spanWrap.style.color = '#ffffff';
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = 'none';
    spanWrap.style.filter = '';
    spanWrap.style.position = 'relative';
    const textSpan = document.createElement('span');
    textSpan.textContent = lineText;
    textSpan.style.color = '#ffffff';
    textSpan.style.position = 'relative';
    textSpan.style.zIndex = '2';
    const shadowLayer = document.createElement('span');
    shadowLayer.textContent = lineText;
    shadowLayer.style.position = 'absolute';
    shadowLayer.style.left = '0';
    shadowLayer.style.top = '0';
    shadowLayer.style.color = 'transparent';
    shadowLayer.style.zIndex = '1';
    const speedMul = effSpeed('rainbow_outline', 1) * 0.8;
    const hueDeg = ((State.subsFrame || 0) * speedMul) % 360;
    if (ow > 0) {
      shadowLayer.style.textShadow = buildShadow(ow, bl, '#ff0000');
      shadowLayer.style.filter = 'hue-rotate(' + hueDeg + 'deg)';
    }
    shadowLayer.style.pointerEvents = 'none';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.appendChild(textSpan);
    spanWrap.appendChild(shadowLayer);
  }

  function renderRainbowOutlineRgb(spanWrap, lineText, ow, bl) {
    spanWrap.style.color = '#ffffff';
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = 'none';
    spanWrap.style.filter = '';
    spanWrap.style.position = 'relative';
    const speedMul = effSpeed('rainbow_outline_rgb', 1) * 1.2;
    const bgShift = 200 - (((State.subsFrame || 0) * speedMul) % 200);
    const textSpan = document.createElement('span');
    textSpan.textContent = lineText;
    textSpan.style.color = '#ffffff';
    textSpan.style.position = 'relative';
    textSpan.style.zIndex = '2';
    const shadowLayer = document.createElement('span');
    shadowLayer.textContent = lineText;
    shadowLayer.style.position = 'absolute';
    shadowLayer.style.left = '0';
    shadowLayer.style.top = '0';
    shadowLayer.style.zIndex = '1';
    shadowLayer.style.color = 'transparent';
    shadowLayer.style.webkitTextStroke = 'none';
    shadowLayer.style.pointerEvents = 'none';
    if (ow > 0) {
      shadowLayer.style.background = 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3, #ff0000)';
      shadowLayer.style.backgroundSize = '200% auto';
      shadowLayer.style.backgroundPosition = bgShift + '% 50%';
      shadowLayer.style.webkitBackgroundClip = 'text';
      shadowLayer.style.backgroundClip = 'text';
      shadowLayer.style.color = 'transparent';
      shadowLayer.style.textShadow = buildShadow(ow, bl, 'transparent');
      shadowLayer.style.webkitTextStroke = (ow * 2) + 'px transparent';
      shadowLayer.style.paintOrder = 'stroke fill';
    }
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.appendChild(textSpan);
    spanWrap.appendChild(shadowLayer);
  }

  function renderRainbowText(spanWrap, lineText, ow, bl, oc) {
    const speedMul = effSpeed('rainbow_text', 1) * 1.2;
    const bgShift = 200 - (((State.subsFrame || 0) * speedMul) % 200);
    const gradientColors = '#ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3, #ff0000';
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.textShadow = 'none';
    if (ow > 0) {
      const shadowLayer = document.createElement('span');
      shadowLayer.textContent = lineText;
      shadowLayer.style.cssText = 'position: absolute; left: 0; top: 0; color: transparent; z-index: 1; pointer-events: none; text-shadow: ' + buildShadow(ow, bl, oc) + ';';
      spanWrap.appendChild(shadowLayer);
    }
    const inner = document.createElement('span');
    inner.style.cssText =
      'background: linear-gradient(90deg, ' + gradientColors + ');' +
      'background-size: 200% auto;' +
      'background-position: ' + bgShift + '% 50%;' +
      '-webkit-background-clip: text; background-clip: text;' +
      'color: transparent; -webkit-text-fill-color: transparent;' +
      'text-shadow: none; -webkit-text-stroke: none;' +
      'position: relative; z-index: 2;';
    inner.textContent = lineText;
    spanWrap.appendChild(inner);
  }

  function renderShineSweep(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = 'transparent';
    const speed = effSpeed('shine_sweep', 4) * 0.08;
    const pos = (((State.subsFrame || 0) * speed * 100) % 200) - 50;
    const base = document.createElement('span');
    base.textContent = lineText;
    base.style.cssText = 'position:absolute;left:0;top:0;white-space:pre;color:' + c1 + ';text-shadow:' + effShadow(ow, bl, oc) + ';';
    spanWrap.appendChild(base);
    const shine = document.createElement('span');
    shine.textContent = lineText;
    shine.style.cssText = 'position:relative;color:transparent;white-space:pre;background:linear-gradient(90deg, rgba(255,255,255,0) 25%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 75%);background-size:200% auto;background-position:' + pos + '% 50%;-webkit-background-clip:text;background-clip:text;';
    spanWrap.appendChild(shine);
  }

  function renderSplitColor(spanWrap, lineText, ow, bl, oc) {
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = 'transparent';
    const outl = document.createElement('span');
    outl.textContent = lineText;
    outl.style.cssText = 'position:absolute;left:0;top:0;white-space:pre;color:transparent;text-shadow:' + effShadow(ow, bl, oc) + ';';
    spanWrap.appendChild(outl);
    const txt = document.createElement('span');
    txt.textContent = lineText;
    txt.style.cssText = 'position:relative;white-space:pre;color:transparent;background:linear-gradient(180deg, #ffffff 0%, #ffffff 50%, #4488ff 50%, #4488ff 100%);-webkit-background-clip:text;background-clip:text;';
    spanWrap.appendChild(txt);
  }

  function renderRetro80s(spanWrap, lineText, bl) {
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = '#ff44ff';
    spanWrap.style.textShadow = [
      '2px 2px 0 #00ffff', '4px 4px 0 #00ffff', '6px 6px 0 #00ffff',
      '8px 8px 0 #00ffff', '10px 10px 0 #00ffff',
      '0 0 ' + Math.max(bl, 2) + 'px #ff44ff',
      '0 0 ' + Math.max(bl + 4, 4) + 'px #ff44ff'
    ].join(',');
    spanWrap.style.fontWeight = 'bold';
    spanWrap.innerText = lineText;
  }

  function renderGolden(spanWrap, lineText, ow, bl) {
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = 'transparent';
    const outl = document.createElement('span');
    outl.textContent = lineText;
    outl.style.cssText = 'position:absolute;left:0;top:0;white-space:pre;color:transparent;text-shadow:' + effShadow(ow, bl, '#8b6914') + ';';
    spanWrap.appendChild(outl);
    const txt = document.createElement('span');
    txt.textContent = lineText;
    txt.style.cssText = 'position:relative;white-space:pre;color:transparent;background:linear-gradient(180deg, #d4a017 0%, #fff8dc 30%, #d4a017 50%, #b8860b 70%, #d4a017 100%);-webkit-background-clip:text;background-clip:text;';
    spanWrap.appendChild(txt);
  }

  function renderFloatHover(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = c1;
    spanWrap.style.textShadow = effShadow(ow, bl, oc);
    spanWrap.style.webkitTextStroke = 'none';
    const speed = effSpeed('float_hover', 5) * 0.1;
    const yOff = Math.sin(effT() * speed) * 8;
    spanWrap.style.transform = 'translateY(' + yOff + 'px)';
    spanWrap.innerText = lineText;
  }

  // Sine Wave: ký tự riêng rẽ nhấp nhô theo pha.
  function renderSineWave(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.innerHTML = '';
    spanWrap.style.color = c1;
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = effShadow(ow, bl, oc);
    const amp = (State.subSettings && State.subSettings.sineWaveAmplitude != null)
      ? Number(State.subSettings.sineWaveAmplitude) : 2;
    const speed = effSpeed('sine_wave', 8) * 0.3;
    const tSec = effT();
    String(lineText).split('').forEach((ch, chIdx) => {
      const cSpan = document.createElement('span');
      cSpan.style.display = 'inline-block';
      cSpan.style.whiteSpace = 'pre';
      const yOff = Math.sin(tSec * speed + chIdx * 0.5) * -amp;
      cSpan.style.transform = 'translateY(' + yOff + 'px)';
      cSpan.textContent = ch === ' ' ? '\u00A0' : ch;
      spanWrap.appendChild(cSpan);
    });
  }

  function renderGlowPulse(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = c1;
    spanWrap.style.webkitTextStroke = 'none';
    const speed = effSpeed('glow_pulse', 5) * 0.08;
    const breathe = 0.5 + Math.sin(effT() * speed) * 0.5;
    const pulseBlur = Math.max(0, bl * breathe);
    const pulseOw = Math.max(0, ow * (0.5 + breathe * 0.5));
    spanWrap.style.textShadow = effShadow(pulseOw, pulseBlur, oc);
    spanWrap.innerText = lineText;
  }

  // ============ Bổ sung đủ toàn bộ hiệu ứng từ extension engine-css.js ============

  // Breathe / Zoom Pulse
  function renderBreathe(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = c1;
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = effShadow(ow, bl, oc);
    const speed = effSpeed('breathe', 3) * 0.06;
    const scale = 1 + Math.sin(effT() * speed) * 0.05;
    spanWrap.style.transform = 'scale(' + scale + ')';
    spanWrap.innerText = lineText;
  }

  // Jello (nhún nhảy khi xuất hiện rồi ổn định)
  function renderJello(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = c1;
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = effShadow(ow, bl, oc);
    const speed = effSpeed('jello', 6) * 0.2;
    const age = (State.subsFrame || 0) % 60;
    let scaleX = 1, scaleY = 1;
    if (age < 12) {
      const t = age / 12;
      scaleX = 1 - Math.sin(t * Math.PI * 2) * 0.15 * (1 - t);
      scaleY = 1 + Math.sin(t * Math.PI * 2) * 0.1 * (1 - t);
    } else {
      const t = effT() * speed;
      scaleX = 1 + Math.sin(t * 2) * 0.01;
      scaleY = 1 - Math.sin(t * 2) * 0.005;
    }
    spanWrap.style.transform = 'scale(' + scaleX + ', ' + scaleY + ')';
    spanWrap.innerText = lineText;
  }

  // Typewriter: 1 lần duy nhất theo thời gian dòng đã hiển thị (không lặp)
  function renderTypewriter(spanWrap, lineText, ow, bl, oc, c1, elapsedMs) {
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = c1;
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = effShadow(ow, bl, oc);
    spanWrap.style.overflow = 'hidden';
    spanWrap.style.whiteSpace = 'nowrap';
    const speed = effSpeed('typewriter', 10) * 0.03;
    const timeElapsedMs = Math.max(0, Number(elapsedMs) || 0);
    const charCount = Math.min(Math.floor(timeElapsedMs / (200 / speed)), lineText.length);
    spanWrap.innerText = lineText.slice(0, charCount) || '';
  }

  // Pulse / Heartbeat (nhịp đập đôi)
  function renderPulse(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = c1;
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = effShadow(ow, bl, oc);
    const speed = effSpeed('pulse', 6) * 0.15;
    const t = effT() * speed;
    const phase = t % (Math.PI * 2);
    let scale = 1;
    if (phase < 0.15) scale = 1 + 0.08;
    else if (phase < 0.3) scale = 1 - 0.02;
    else if (phase < 0.45) scale = 1 + 0.05;
    spanWrap.style.transform = 'scale(' + scale + ')';
    spanWrap.innerText = lineText;
  }

  // Shake / Quake (rung ngẫu nhiên)
  function renderShake(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = c1;
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = effShadow(ow, bl, oc);
    const intensity = effSpeed('shake', 8) * 0.15;
    const dx = (Math.random() - 0.5) * intensity * 2;
    const dy = (Math.random() - 0.5) * intensity * 2;
    spanWrap.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    spanWrap.innerText = lineText;
  }

  // Glitch (lỗi hình ảnh đỏ/xanh lục chớp chớp)
  function renderGlitch(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    const speed = effSpeed('glitch', 5) * 0.05;
    const glitchFrame = Math.sin(effT() * speed);
    const isGlitch = Math.abs(glitchFrame) > 0.85;
    const mainSpan = document.createElement('span');
    mainSpan.textContent = lineText;
    mainSpan.style.cssText = 'color:' + c1 + ';text-shadow:' + effShadow(ow, bl, oc) + ';position:relative;z-index:2;';
    spanWrap.appendChild(mainSpan);
    if (isGlitch) {
      const glitchRange = glitchFrame * 6;
      const red = document.createElement('span');
      red.textContent = lineText;
      red.style.cssText = 'position:absolute;left:' + glitchRange + 'px;top:0;color:#ff0000;opacity:0.7;z-index:1;text-shadow:none;';
      spanWrap.appendChild(red);
      const green = document.createElement('span');
      green.textContent = lineText;
      green.style.cssText = 'position:absolute;left:' + (-glitchRange) + 'px;top:0;color:#00ff00;opacity:0.7;z-index:1;text-shadow:none;';
      spanWrap.appendChild(green);
    }
  }

  // Ghosting / Drunk (đi kèm bóng ma lệch)
  function renderGhosting(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    const mainSpan = document.createElement('span');
    mainSpan.textContent = lineText;
    mainSpan.style.cssText = 'color:' + c1 + ';text-shadow:' + effShadow(ow, bl, oc) + ';position:relative;z-index:3;';
    spanWrap.appendChild(mainSpan);
    const speed = effSpeed('ghosting', 3) * 0.08;
    const t = effT() * speed;
    const offX = Math.sin(t) * 15;
    const offY = Math.cos(t * 0.7) * 8;
    const g1 = document.createElement('span');
    g1.textContent = lineText;
    g1.style.cssText = 'position:absolute;left:' + offX + 'px;top:' + offY + 'px;color:' + c1 + ';opacity:0.2;z-index:1;text-shadow:none;filter:blur(3px);';
    spanWrap.appendChild(g1);
    const g2 = document.createElement('span');
    g2.textContent = lineText;
    g2.style.cssText = 'position:absolute;left:' + (-offX * 0.6) + 'px;top:' + (-offY * 0.6) + 'px;color:' + c1 + ';opacity:0.15;z-index:2;text-shadow:none;filter:blur(5px);';
    spanWrap.appendChild(g2);
  }

  // Water Reflection (chữ + bóng phản chiếu lộn ngược mờ)
  function renderWaterReflection(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    const mainSpan = document.createElement('span');
    mainSpan.textContent = lineText;
    mainSpan.style.cssText = 'color:' + c1 + ';text-shadow:' + effShadow(ow, bl, oc) + ';display:block;';
    spanWrap.appendChild(mainSpan);
    const ref = document.createElement('span');
    ref.textContent = lineText;
    ref.style.cssText = 'display:block;color:' + c1 + ';text-shadow:' + effShadow(ow, bl, oc) + ';transform:scaleY(-1);opacity:0.35;filter:blur(2px);margin-top:4px;';
    spanWrap.appendChild(ref);
  }

  // 3D Block (viền khối cứng 4 lớp)
  function render3DBlock(spanWrap, lineText, ow, bl, oc, c1) {
    spanWrap.innerHTML = '';
    spanWrap.style.display = 'inline-block';
    spanWrap.style.position = 'relative';
    spanWrap.style.color = c1;
    spanWrap.style.webkitTextStroke = 'none';
    spanWrap.style.textShadow = [
      '1px 1px 0 ' + oc,
      '2px 2px 0 ' + oc,
      '3px 3px 0 ' + oc,
      '4px 4px 0 ' + oc
    ].join(',');
    spanWrap.innerText = lineText;
  }

  // Dispatcher hiệu ứng cho 1 dòng không-karaoke. Nhận spanWrap rỗng rồi đổ nội dung.
  function renderAssEffect(spanWrap, eff, lineText, ow, bl, oc, c1, elapsedMs) {
    if (!eff || eff === 'none') { spanWrap.innerText = lineText; return; }
    if (eff === 'rainbow_outline') renderRainbowOutline(spanWrap, lineText, ow, bl);
    else if (eff === 'rainbow_outline_rgb') renderRainbowOutlineRgb(spanWrap, lineText, ow, bl);
    else if (eff === 'rainbow_text') renderRainbowText(spanWrap, lineText, ow, bl, oc);
    else if (eff === 'sine_wave') renderSineWave(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'shine_sweep') renderShineSweep(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'split_color') renderSplitColor(spanWrap, lineText, ow, bl, oc);
    else if (eff === 'retro_80s') renderRetro80s(spanWrap, lineText, bl);
    else if (eff === 'golden') renderGolden(spanWrap, lineText, ow, bl);
    else if (eff === 'float_hover') renderFloatHover(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'glow_pulse') renderGlowPulse(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'breathe') renderBreathe(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'jello') renderJello(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'typewriter') renderTypewriter(spanWrap, lineText, ow, bl, oc, c1, elapsedMs);
    else if (eff === 'pulse') renderPulse(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'shake') renderShake(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'glitch') renderGlitch(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'ghosting') renderGhosting(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'water_reflection') renderWaterReflection(spanWrap, lineText, ow, bl, oc, c1);
    else if (eff === 'd3d_block') render3DBlock(spanWrap, lineText, ow, bl, oc, c1);
    else { spanWrap.style.color = c1; spanWrap.style.textShadow = effShadow(ow, bl, oc); spanWrap.innerText = lineText; }
  }

  // Hệ số co font: canvas đo ascent/descent -> customResize (~0.7-0.9)
  const _fontResizeCache = {};

  function getFontResize(fontFamily) {
    const key = String(fontFamily || '');
    if (_fontResizeCache[key] !== undefined) return _fontResizeCache[key];
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      const usedFontSize = 2048;
      ctx.font = usedFontSize + 'px "' + key + '"';
      const metrics = ctx.measureText('MgÀ');
      const ascent = metrics.actualBoundingBoxAscent || usedFontSize * 0.7;
      const descent = metrics.actualBoundingBoxDescent || usedFontSize * 0.3;
      const total = ascent + descent;
      const resize = total > 0 ? usedFontSize / total : 1;
      _fontResizeCache[key] = resize;
      return resize;
    } catch (_e) { return 1; }
  }

  // Aegisub 1-9 -> {h,v}
  function alignToHV(a) {
    a = Number(a) || 2;
    const h = (a % 3 === 1) ? 'left' : (a % 3 === 0) ? 'right' : 'center';
    let v;
    if (a >= 7) v = 'top';
    else if (a >= 4) v = 'mid';
    else v = 'bottom';
    return { h, v };
  }

  // ── Toạ độ anchor (điểm neo) trong hệ PlayRes — mô phỏng chính xác Aegisub ──
  // X: lề trái/ phải là khoảng cách thực từ mép; khi căn giữa thì lấy tâm giữa
  //     vùng còn lại sau khi trừ cả MarginL lẫn MarginR (giống libass).
  // Y (điểm neo): top → cách mép trên đúng MarginV; bottom → cách mép dưới đúng
  //     MarginV; mid → giữa khung. Trình render sẽ dùng translate để áp neo này.
  function assAnchorX(align, mL, mR, playResX) {
    const hv = alignToHV(align);
    if (hv.h === 'left') return mL;
    if (hv.h === 'right') return playResX - mR;
    return mL + (playResX - mL - mR) / 2;
  }
  function assAnchorY(align, mV, playResY) {
    const hv = alignToHV(align);
    if (hv.v === 'top') return mV;
    if (hv.v === 'bottom') return playResY - mV;
    return playResY / 2;
  }

  // Tách chuỗi ASS thành mảng đoạn karaoke: [{text,time}], time=ms từ đầu dòng.
  function splitAssKaraoke(rawText) {
    const segments = [];
    let leadingTime = 0;
    let current = '';
    let pendingTime = null;
    const flush = () => {
      if (current) { segments.push({ text: current, time: pendingTime }); current = ''; pendingTime = null; }
    };
    for (let i = 0; i < rawText.length; i++) {
      const ch = rawText[i];
      if (ch === '{') {
        flush();
        const end = rawText.indexOf('}', i);
        const tag = end === -1 ? rawText.slice(i) : rawText.slice(i, end + 1);
        const km = tag.match(/\\([kKf])([\d.]+)/);
        if (km) {
          pendingTime = leadingTime;
          leadingTime += (parseFloat(km[2]) || 0) * 10; // centiseconds -> ms
        }
        i = end === -1 ? rawText.length - 1 : end;
        continue;
      }
      current += ch;
    }
    flush();
    return { segments, totalMs: leadingTime };
  }

  // Parse toàn bộ .ass -> { subtitles, styleSettings, playResX, playResY }
  function parseAssEngine(content) {
    const subtitles = [];
    const styleSettings = {};
    let playResX = 384, playResY = 288;
    const mx = String(content).match(/PlayResX:\s*(\d+)/i);
    const my = String(content).match(/PlayResY:\s*(\d+)/i);
    if (mx) playResX = parseInt(mx[1], 10);
    if (my) playResY = parseInt(my[1], 10);

    const lines = String(content || '').split(/\r?\n/);
    let section = '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(';') || line.startsWith('!')) continue;
      if (line.startsWith('[')) { section = line.toLowerCase(); continue; }
      if (section.includes('styles') && line.startsWith('Style:')) {
        const p = line.substring(6).split(',');
        if (p.length < 10) continue;
        const name = (p[0] || '').trim();
        if (!name) continue;
        const marginL = p[19] ? (parseInt(p[19].trim(), 10) || 10) : 10;
        const marginR = p[20] ? (parseInt(p[20].trim(), 10) || 10) : 10;
        const marginV = p[21] ? (parseInt(p[21].trim(), 10) || 10) : 10;
        const align = p[18] ? (parseInt(p[18].trim(), 10) || 2) : 2;
        const hv = alignToHV(align);
        // Toạ độ gốc giống Aegisub: lề Margin chính là khoảng cách thực từ mép khung
        // (không cộng thêm offset ảo +20). X định tâm theo cả 2 lề L/R.
        const anX = assAnchorX(align, marginL, marginR, playResX);
        const anY = assAnchorY(align, marginV, playResY);
        styleSettings[name] = {
          color1: assToHex(p[3]), color2: assToHex(p[4]), color3: assToHex(p[5]),
          origColor1: assToHex(p[3]), origColor2: assToHex(p[4]), origColor3: assToHex(p[5]),
          fontSize: p[2] ? (parseFloat(p[2].trim()) || 20) : 20,
          origFontSize: p[2] ? (parseFloat(p[2].trim()) || 20) : 20,
          outlineWidth: p[16] ? (parseFloat(p[16].trim()) || 2) : 2,
          origOutlineWidth: p[16] ? (parseFloat(p[16].trim()) || 2) : 2,
          shadow: p[17] ? (parseFloat(p[17].trim()) || 0) : 0,
          spacing: p[13] ? (parseFloat(p[13].trim()) || 0) : 0,
          origSpacing: p[13] ? (parseFloat(p[13].trim()) || 0) : 0,
          fontName: (p[1] || '').trim(),
          align: align, marginL: marginL, marginR: marginR, marginV: marginV,
          origAlign: align, origMarginL: marginL, origMarginR: marginR, origMarginV: marginV,
          posX: anX, posY: anY, blur: 2, posOverridden: false,
          override: !(State.subSettings && State.subSettings.useGlobalStyles),
          visible: true
        };
        continue;
      }
      if (section.includes('events') && line.startsWith('Dialogue:')) {
        const p = line.substring(9).split(',');
        if (p.length < 10) continue;
        const start = parseAssTime((p[1] || '').trim());
        const end = parseAssTime((p[2] || '').trim());
        if (start == null || end == null) continue;
        const style = (p[3] || '').trim();
        const rawText = p.slice(9).join(',').trim().replace(/\\h/g, ' ');
        if (!rawText) continue;
        subtitles.push(assembleCue(rawText, style, styleSettings, playResX, playResY, start, end));
      }
    }
    subtitles.sort((a, b) => a.start - b.start);
    return { subtitles, styleSettings, playResX, playResY };
  }
  // Ghép 1 dialogue thành đối tượng cue cấu trúc cho renderer.
  function assembleCue(rawText, style, styleSettings, playResX, playResY, start, end) {
    const st = styleSettings[style] || {
      color1: '#ffffff', color3: '#000000',
      fontSize: 20, outlineWidth: 2, shadow: 0, spacing: 0,
      fontName: '', align: 2, marginL: 10, marginR: 10, marginV: 10,
      posX: playResX / 2, posY: playResY - 30, blur: 2
    };
    // ---- Parse các override chính ----
    let pos = null, an = null, a = null, ovFs = null, ovC1 = null, ovC3 = null;
    let ovBord = null, ovBlur = null, ovSpacing = null, ovBold = null, ovItalic = null;
    let ovScaleX = 100, ovScaleY = 100;
    const tagRe = /\{([^}]*)\}/g;
    let m;
    while ((m = tagRe.exec(rawText)) !== null) {
      const inner = m[1];
      const pm = inner.match(/\\pos\s*\(([^,)]+),([^)]+)\)/i);
      if (pm) { pos = { x: parseFloat(pm[1]), y: parseFloat(pm[2]) }; continue; }
      const anm = inner.match(/\\an(\d)/i);
      if (anm) { an = parseInt(anm[1], 10); continue; }
      const am = inner.match(/\\a(\d)/i);
      if (am) { a = parseInt(am[1], 10); continue; }
      const fsm = inner.match(/\\fs(-?[\d.]+)/i);
      if (fsm) { ovFs = parseFloat(fsm[1]); continue; }
      const c1m = inner.match(/\\1c&?H?([0-9A-Fa-f]{6})/i);
      if (c1m) { ovC1 = assToHex(c1m[1]); continue; }
      const c3m = inner.match(/\\3c&?H?([0-9A-Fa-f]{6})/i);
      if (c3m) { ovC3 = assToHex(c3m[1]); continue; }
      const bm = inner.match(/\\bord([\d.]+)/i);
      if (bm) { ovBord = parseFloat(bm[1]); continue; }
      const blm = inner.match(/\\blur([\d.]+)/i);
      if (blm) { ovBlur = parseFloat(blm[1]); continue; }
      const spm = inner.match(/\\fsp([\d.]+)/i);
      if (spm) { ovSpacing = parseFloat(spm[1]); continue; }
      const bxm = inner.match(/\\fscx([\d.]+)/i);
      if (bxm) { ovScaleX = parseFloat(bxm[1]); continue; }
      const bym = inner.match(/\\fscy([\d.]+)/i);
      if (bym) { ovScaleY = parseFloat(bym[1]); continue; }
      const b1m = inner.match(/\\bi?\s*(\d)/i);
      if (b1m && /\\b/.test(inner)) { ovBold = b1m[1] === '1'; continue; }
      const i1m = inner.match(/\\i\s*(\d)/i);
      if (i1m) { ovItalic = i1m[1] === '1'; continue; }
    }
    // ---- Alignment & vị trí hiệu lực ----
    let effAlign = st.align;
    if (an) effAlign = an;
    else if (a) effAlign = a;
    const hv = alignToHV(effAlign);
    // Lề hiệu lực: ưu tiên lề style (hoặc override từng dòng — đơn giản hoá ở đây).
    const effMarginL = (st.marginL != null) ? st.marginL : 10;
    const effMarginR = (st.marginR != null) ? st.marginR : 10;
    const effMarginV = (st.marginV != null) ? st.marginV : 10;
    // Vị trí mặc định theo Aegisub (điểm neo theo Alignment + lề).
    let posX = assAnchorX(effAlign, effMarginL, effMarginR, playResX);
    let posY = assAnchorY(effAlign, effMarginV, playResY);
    const hasPos = !!pos;
    if (pos) { posX = pos.x; posY = pos.y; }
    // ---- Dòng + văn bản sạch ----
    const rawLines = rawText.split(/\\N/gi);
    const hasKara = /\\[kKf][\d.]+/i.test(rawText);
    const idx = rawText.indexOf('\u0000');
    let cleanText = String(rawText).replace(/\{[^}]*\}/g, ' ').replace(/\\[Nn]/g, ' ');
    if (idx !== -1) cleanText = cleanText.substring(0, idx);
    return {
      start, end, style,
      cleanText: cleanText.replace(/\s+/g, ' ').trim(),
      rawLines: rawLines,
      align: effAlign, posX, posY, hasKara: hasKara,
      marginL: effMarginL, marginR: effMarginR, marginV: effMarginV,
      hasPos: hasPos, anchorV: hv.v,
      ovFs, ovC1, ovC3, ovBord, ovBlur, ovSpacing, ovBold, ovItalic,
      ovScaleX, ovScaleY
    };
  }
  /* ---- RENDER ASS CUE (engine) ----
     Chuyển 1 cue (đã parse bởi assembleCue) thành phần tử DOM với đúng
     style/vị trí/màu/viền/glow + karaoke {\\k} + xuống dòng {\\N}.          */
  // Parse karaoke của 1 cue: trả về [{line, syllables:[{text,start,dur}]}], ms tính từ đầu cue.
  function parseKaraokeCue(rawLines) {
    const groups = [];
    let cumulative = 0;
    (rawLines || []).forEach((rawPart) => {
      const re = /\{(?:\\[kKf]o?)(\d+)\}([^{]*)/g;
      const syls = [];
      let lineDur = 0;
      let m;
      while ((m = re.exec(String(rawPart))) !== null) {
        const d = (parseInt(m[1], 10) || 0) * 10; // centiseconds -> ms
        syls.push({ text: m[2], start: cumulative + lineDur, dur: d });
        lineDur += d;
      }
      cumulative += lineDur;
      groups.push({ line: String(rawPart).replace(/\{[^}]*\}/g, ''), syllables: syls });
    });
    return groups;
  }

  // Xây 1 div chứa toàn bộ cue với style/vị trí + karaoke.
  function renderAssCue(cue) {
    const gs = State.subSettings || {};
    const st = (State.styleSettings && State.styleSettings[cue.style]) || {};
    // Bỏ qua style đã ẩn bởi nút 👁️ trong tab "Cài đặt từng style"
    if (st.visible === false) return document.createDocumentFragment();
    const pX = State.playResX || 384;
    const pY = State.playResY || 288;
    const align = cue.align || 2;
    const hv = alignToHV(align);
    // Chế độ hiển thị: dùng trực tiếp useGlobalStyles để tránh bất đồng bộ với st.override.
    // - useGlobalStyles=true  (tab "🌍 Cài đặt chung"): format dùng gs.* (chung), vị trí vẫn lấy per-style.
    // - useGlobalStyles=false (tab "🎨 Cài đặt từng style"): mỗi style dùng st.* riêng của nó.
    const useGlobal = !!(State.subSettings && State.subSettings.useGlobalStyles);
    const isO = useGlobal ? false : (st.override !== false);

    // ---- Scale theo chiều cao vùng video (y như extension engine-css.js) ----
    // scaleH = chiều cao khung video / PlayResY. KHÔNG đặt floor cao vì sẽ phá vỡ
    // tỷ lệ: muốn chữ co/giãn đúng tỷ lệ với khung video (cả fullscreen lẫn không).
    let scaleH = (State.subOverlayHeight > 0 && pY > 0)
      ? (State.subOverlayHeight / pY) : 1;
    // Chỉ giữ floor rất thấp chống trường hợp overlay chưa đo được (~0) lúc vừa phát
    if (scaleH < 0.1) scaleH = 0.1;
    const customResize = getFontResize(isO ? (st.fontName || gs.fontFamily || '') : (gs.fontFamily || '')) || 1;
    const textZoom = (gs.textZoom > 0 && gs.textZoom <= 3) ? gs.textZoom : 0.9;

    // ---- Font size hiệu dụng (base * scaleH * customResize * textZoom) ----
    // Use Global (isO=false): dùng gs.fontSize (thanh trượt Cỡ chữ trong tab common).
    // Use Style  (isO=true) : dùng st.fontSize (cỡ chữ riêng từng style trong file .ass),
    //   chỉnh bằng ô S trong danh sách style — độc lập với gs.fontSize.
    const masterFs = (gs.fontSize && gs.fontSize > 0) ? gs.fontSize : 70;
    let baseFs = isO ? (st.fontSize || st.origFontSize || masterFs) : masterFs;
    if (cue.ovFs != null) baseFs = cue.ovFs;
    baseFs = baseFs * ((cue.ovScaleY || 100) / 100);
    // Cỡ chữ tỷ lệ với khung video. Nếu file .ass là 4K (PlayResY=2160) thì scaleH
    // rất nhỏ trên khung nhỏ → chữ bé xíu. floor TỶ LỆ (xem bên dưới) khắc phục.
    const fsRaw = baseFs * scaleH * customResize * textZoom * ((gs.fontScale != null ? gs.fontScale : 100) / 100);
    // Dùng floor TỶ LỆ theo chiều cao khung video (~2.5%) thay vì floor px cố định:
    // giữ proportional giữa fullscreen/non-fullscreen (chữ co/giãn đều) mà vẫn đảm bảo
    // đọc được. Nếu fsRaw tự nhiên đã to hơn ngưỡng thì giữ nguyên (không phình).
    const minFs = Math.max(6, (State.subOverlayHeight || 0) * 0.025);
    const fs = Math.max(minFs, fsRaw);

    // DEBUG (tạm): in giá trị thực tế để kiểm tra tỷ lệ chữ so với khung video
    if (typeof console !== 'undefined') {
      if (Date.now() - (State._dbgT || 0) > 1000) {
        State._dbgT = Date.now();
        console.log('[ass] scaleH=%s masterFs=%s baseFs=%s textZoom=%s customResize=%s → fs=%s (raw=%s,min=%s) subH=%s pY=%s',
          scaleH.toFixed(3), masterFs, baseFs.toFixed(1), textZoom, customResize, fs.toFixed(1), fsRaw.toFixed(1), minFs.toFixed(1), State.subOverlayHeight, pY);
      }
    }

    // ---- Màu / viền / glow (style override hoặc global setting) ----
    let c1 = isO ? (st.color1 || '#ffffff') : (gs.color1 || '#ffffff');
    let c3 = isO ? (st.color3 || '#000000') : (gs.color3 || '#000000');
    if (cue.ovC1) c1 = cue.ovC1;
    if (cue.ovC3) c3 = cue.ovC3;
    let ow = isO
      ? (st.outlineWidth != null ? st.outlineWidth : (gs.outlineWidth || 0))
      : (gs.outlineWidth || 0);
    if (cue.ovBord != null) ow = cue.ovBord;
    ow = Math.max(0, ow * ((cue.ovScaleX || 100) / 100)) * scaleH;
    let bl = isO
      ? (st.blur != null ? st.blur : (gs.blur || 0))
      : (gs.blur || 0);
    if (cue.ovBlur != null) bl = cue.ovBlur;
    bl = Math.max(0, bl) * scaleH;
    const spacing = cue.ovSpacing != null ? cue.ovSpacing : (st.spacing || gs.letterSpacing || 0);
    const bold = cue.ovBold != null ? cue.ovBold : (gs.isBold !== false);
    const italic = cue.ovItalic != null ? cue.ovItalic : !!gs.isItalic;
    const useStroke = !!gs.useTextStroke;
    const deepGlow = !!gs.deepGlow;
    const useBox = !!gs.useBox;
    const boxColor = gs.boxColor || '#000000';
    const boxOpacity = (gs.boxOpacity != null ? gs.boxOpacity : 0.5);
    const boxBlur = (gs.boxBlur != null ? Number(gs.boxBlur) : 0);
    const letterSpacing = gs.letterSpacing || 0;

    // ---- Font family (style font hoặc global) ----
    let fontName = (st.fontName || '').replace(/["']/g, '');
    if (!isO || !fontName) fontName = (gs.fontFamily || '').replace(/["']/g, '');
    const shadow = deepGlow
      ? buildDeepGlow(ow, bl, c3, useStroke)
      : buildShadow(ow, bl, c3, useStroke);
    const strokeCss = (useStroke && ow > 0)
      ? ('-webkit-text-stroke:' + Math.max(ow, 1) + 'px ' + c3 + '; paint-order:stroke fill;')
      : '';

    const div = document.createElement('div');
    div.className = 'ass-cue';
    const useFont = fontName ? '\'' + fontName + '\', sans-serif' : 'inherit';

    // ---- Vị trí theo tỷ lệ PlayRes (giống Aegisub: Alignment + Margin) ----
    // Ưu tiên: (1) dòng có \pos → dùng toạ độ cố định; (2) style được người dùng
    // kéo X/Y trong tab "từng style" (posOverridden) → dùng toạ độ thủ công;
    // (3) mặc định → tính lại điểm neo từ Alignment + MarginL/R/V mỗi lần render
    //     để khớp chính xác với Aegisub (không bị "đóng băng" từ lúc parse).
    let anchorX, anchorY, anchorV = cue.anchorV || hv.v;
    let anchorH = hv.h;
    if (cue.hasPos) {
      anchorX = cue.posX; anchorY = cue.posY;
    } else if (st && st.posOverridden && st.posX != null && st.posY != null) {
      anchorX = st.posX; anchorY = st.posY;
    } else {
      const mL = (cue.marginL != null) ? cue.marginL : 10;
      const mR = (cue.marginR != null) ? cue.marginR : 10;
      const mV = (cue.marginV != null) ? cue.marginV : 10;
      anchorX = assAnchorX(cue.align || 2, mL, mR, pX);
      anchorY = assAnchorY(cue.align || 2, mV, pY);
    }
    const leftPct = (anchorX / pX * 100);
    const topPct = (anchorY / pY * 100);
    let tx = '-50%', ty = '-50%';
    if (anchorH === 'left') tx = '0%';
    else if (anchorH === 'right') tx = '-100%';
    if (anchorV === 'top') ty = '0%';
    else if (anchorV === 'mid') ty = '-50%';
    else ty = '-100%';
    const textAlign = anchorH === 'left' ? 'left' : anchorH === 'right' ? 'right' : 'center';

    // Lưu dữ liệu cho bước tách chồng lấn (collision resolution): vector dịch dọc.
    div.dataset.v = anchorV;         // 'top' | 'bottom' | 'mid'
    div.dataset.tx = tx;             // translate ngang
    div.dataset.ty = ty;             // translate dọc gốc
    div.dataset.off = '0';           // pixel dịch thêm do chồng lấn

    div.style.cssText =
      'position:absolute; left:' + leftPct + '%; top:' + topPct + '%;' +
      'transform:translate(' + tx + ',' + ty + ');' +
      'font-size:' + fs + 'px;' +
      'font-family:' + useFont + ';' +
      'font-weight:' + (bold ? '700' : '400') + ';' +
      'font-style:' + (italic ? 'italic' : 'normal') + ';' +
      'text-decoration:' + (gs.isUnderline ? 'underline' : 'none') + ';' +
      (gs.isStrike ? 'text-decoration-line:line-through;' : '') +
      'letter-spacing:' + (letterSpacing || spacing) + 'px;' +
      'text-align:' + textAlign + ';' +
      'color:' + c1 + ';' +
      'text-shadow:' + shadow + ';' +
      strokeCss +
      'white-space:nowrap; pointer-events:none; z-index:20;';

    const applyBox = (el) => {
      if (useBox) {
        el.style.backgroundColor = hexToRgba(boxColor, boxOpacity);
        el.style.padding = '4px 10px';
        el.style.borderRadius = '6px';
        el.style.display = 'inline-block';
        if (boxBlur > 0) {
          el.style.backdropFilter = 'blur(' + boxBlur + 'px)';
          el.style.webkitBackdropFilter = 'blur(' + boxBlur + 'px)';
        }
      }
    };

    // ---- Hiển thị từng dòng (hỗ trợ \\N + karaoke) ----
    const groups = cue.hasKara ? parseKaraokeCue(cue.rawLines) : null;
    const nowMs = (State.lastRenderTime - cue.start) * 1000;
    // ---- Fade In / Out: áp dụng opacity theo fadIn (ms) / fadOut (ms) ----
    const fadInMs = gs.fadIn || 0;
    const fadOutMs = gs.fadOut || 0;
    const cueDurMs = (cue.end - cue.start) * 1000;
    if (fadInMs > 0 || fadOutMs > 0) {
      let opacity = 1;
      if (fadInMs > 0 && nowMs >= 0 && nowMs < fadInMs) {
        opacity = Math.min(opacity, nowMs / fadInMs);
      }
      if (fadOutMs > 0 && nowMs > cueDurMs - fadOutMs && nowMs <= cueDurMs) {
        opacity = Math.min(opacity, Math.max(0, (cueDurMs - nowMs) / fadOutMs));
      }
      if (opacity < 1) div.style.opacity = Math.max(0, Math.min(1, opacity));
    }
    // Khoảng cách giữa các dòng: hệ số nhân theo cỡ chữ (100 = cách đúng 1 hàng chữ).
    const lsMult = (gs.lineSpacing != null && gs.lineSpacing > 0) ? gs.lineSpacing : 135;
    const lineSpacing = fs * (lsMult / 100);
    const totalLines = groups ? groups.length : (cue.rawLines || []).length;
    const baseY = hv.v === 'top' ? 0 : hv.v === 'mid'
      ? -((totalLines - 1) * lineSpacing) / 2
      : -((totalLines - 1) * lineSpacing);

    const makeLineDiv = (top) => {
      const d = document.createElement('div');
      d.style.cssText = 'position:relative; top:' + top + 'px; white-space:nowrap;';
      div.appendChild(d);
      return d;
    };

    const kTab = (key) => (gs[key] || { c1: '#ffffff', c3: '#000000', fs: 90, outl: 3, blur: 6, zoom: 1.0, zDur: 100 });

    const applySylStyle = (span, useC1, useC3, useOutl, useBl, useZoom, useFs) => {
      span.style.color = useC1;
      span.style.fontSize = useFs + 'px';
      span.style.transform = 'scale(' + useZoom + ')';
      span.style.textShadow = deepGlow
        ? buildDeepGlow(useOutl, useBl, useC3, useStroke)
        : buildShadow(useOutl, useBl, useC3, useStroke);
      if (useStroke && useOutl > 0) {
        span.style.webkitTextStroke = Math.max(useOutl, 1) + 'px ' + useC3;
        span.style.paintOrder = 'stroke fill';
      }
    };

    // Cỡ chữ hiệu dụng CHUNG cho cả 3 tab karaoke (luôn dùng gs.fontSize vì đã gộp về cỡ chữ chung)
    const karaFs = (k, fallback) => {
      const raw = (gs.fontSize != null && gs.fontSize > 0) ? gs.fontSize : (fallback || 70);
      // Cùng floor TỶ LỆ theo chiều cao khung video như fs chính (xem renderAssCue) để
      // chữ karaoke proportional + đọc được với .ass 4K (không bé xíu, không phình).
      const minFs = Math.max(6, (State.subOverlayHeight || 0) * 0.025);
      return Math.max(minFs, raw * scaleH * customResize * textZoom * ((gs.fontScale != null ? gs.fontScale : 100) / 100));
    };
    const karaOutl = (k, fallback) => Math.max(0, ((k && k.outl != null) ? Number(k.outl) : fallback)) * scaleH;
    // Khi ở tab "Use Style": karaoke lấy cỡ chữ theo từng style trong file (baseFs = st.fontSize),
    // độc lập với gs.fontSize. Khi ở tab "Use Global": dùng gs.fontSize.
    const useStyleKaraFs = (k, fallback) => {
      // isO → dùng baseFs (đã được set = st.fontSize ở dòng 1610),
      // ngược lại dùng gs.fontSize (bảng karaoke tabs bên Use Global).
      const raw = isO ? (baseFs || masterFs) : ((gs.fontSize != null && gs.fontSize > 0) ? gs.fontSize : (fallback || 70));
      const minFs = Math.max(6, (State.subOverlayHeight || 0) * 0.025);
      return Math.max(minFs, raw * scaleH * customResize * textZoom * ((gs.fontScale != null ? gs.fontScale : 100) / 100));
    };
    // Giá trị màu/viền của style trong file (.ass) — dùng cho karaoke ở tab "Use Style".
    const stC1 = (isO && st.color1) || c1;
    const stC2 = (isO && st.color2) || stC1;
    const stC3 = (isO && st.color3) || c3;
    const stOutl = (st.outlineWidth != null ? Number(st.outlineWidth) : 0) * scaleH;
    const stBlur = ((st.blur != null ? Number(st.blur) : 0) || 2) * scaleH;
    const kActiveC1 = (gs.kActive && gs.kActive.c1) || '#ffffff';
    const kActiveC3 = (gs.kActive && gs.kActive.c3) || '#ff2d55';
    const kActiveOutl = karaOutl(gs.kActive, 3);
    const kActiveBlur = ((gs.kActive && gs.kActive.blur != null) ? Number(gs.kActive.blur) : 6) * scaleH;
    const kActiveZoom = (gs.kActive && gs.kActive.zoom != null) ? Number(gs.kActive.zoom) : 1.1;

    // ===== KARAOKE + HIỆU ỨNG (ưu tiên effect trước) =====
    const karaEff = (gs.specialEffect && gs.specialEffect !== 'none') ? gs.specialEffect : null;
    let _karaCharIdx = 0;

    // Áp hiệu ứng per-âm-tiết lên span (giữ zoom + thời điểm hát). Mirror extension addChar.
    const applyEffToKaraSyl = (span, eff, txt, useC1, useC3, useOutl, useBl, useZoom) => {
      const txt2 = txt || '';
      span.style.transform = 'scale(' + useZoom + ')';
      if (eff === 'rainbow_outline') {
        const speedMul = effSpeed('rainbow_outline', 1) * 0.8;
        const hue = ((State.subsFrame * speedMul) + (_karaCharIdx * 15)) % 360;
        span.style.color = '#ffffff';
        if (useOutl > 0) { span.style.textShadow = effShadow(useOutl, useBl, '#ff0000'); span.style.filter = 'hue-rotate(' + hue + 'deg)'; }
      } else if (eff === 'rainbow_outline_rgb') {
        span.style.color = '#ffffff';
        span.style.webkitTextStroke = 'none';
        const speedMul = effSpeed('rainbow_outline_rgb', 1) * 1.2;
        const charShift = (200 - ((State.subsFrame * speedMul) % 200) + _karaCharIdx * 5) % 200;
        if (useOutl > 0) {
          span.style.background = 'linear-gradient(90deg,#ff0000,#ff7f00,#ffff00,#00ff00,#0000ff,#4b0082,#9400d3,#ff0000)';
          span.style.backgroundSize = '200% auto';
          span.style.backgroundPosition = charShift + '% 50%';
          span.style.webkitBackgroundClip = 'text'; span.style.backgroundClip = 'text';
          span.style.color = 'transparent';
          span.style.webkitTextStroke = Math.max(useOutl, 1) * 2 + 'px transparent';
          span.style.paintOrder = 'stroke fill';
          span.style.textShadow = effShadow(useOutl, useBl, 'transparent');
        }
      } else if (eff === 'rainbow_text') {
        const speedMul = effSpeed('rainbow_text', 1) * 1.2;
        const lineShift = 200 - ((State.subsFrame * speedMul) % 200);
        if (useOutl > 0) span.style.textShadow = effShadow(useOutl, useBl, useC3);
        span.style.background = 'linear-gradient(90deg,#ff0000,#ff7f00,#ffff00,#00ff00,#0000ff,#4b0082,#9400d3,#ff0000)';
        span.style.backgroundSize = '200% auto';
        span.style.backgroundPosition = lineShift + '% 50%';
        span.style.webkitBackgroundClip = 'text'; span.style.backgroundClip = 'text';
        span.style.color = 'transparent';
        span.style.webkitTextFillColor = 'transparent';
      } else if (eff === 'sine_wave') {
        span.style.color = useC1;
        span.style.textShadow = effShadow(useOutl, useBl, useC3);
        const amp = (gs.sineWaveAmplitude != null ? gs.sineWaveAmplitude : 2);
        const speed = effSpeed('sine_wave', 8) * 0.3;
        const yOff = Math.sin(effT() * speed + _karaCharIdx * 0.5) * -amp;
        span.style.transform = 'scale(' + useZoom + ') translateY(' + yOff + 'px)';
      } else if (eff === 'shine_sweep' || eff === 'water_reflection' || eff === 'typewriter' ||
                 eff === 'float_hover' || eff === 'breathe' || eff === 'jello' || eff === 'pulse' || eff === 'shake') {
        span.style.color = useC1;
        span.style.textShadow = effShadow(useOutl, useBl, useC3);
      } else if (eff === 'split_color') {
        span.style.color = 'transparent';
        span.style.textShadow = effShadow(useOutl, useBl, useC3);
        span.style.background = 'linear-gradient(180deg, #ffffff 0%, #ffffff 50%, #4488ff 50%, #4488ff 100%)';
        span.style.webkitBackgroundClip = 'text'; span.style.backgroundClip = 'text';
      } else if (eff === 'retro_80s') {
        span.style.color = '#ff44ff';
        span.style.textShadow = ['2px 2px 0 #00ffff','4px 4px 0 #00ffff','6px 6px 0 #00ffff','8px 8px 0 #00ffff','10px 10px 0 #00ffff', '0 0 ' + Math.max(useBl, 2) + 'px #ff44ff'].join(',');
        span.style.fontWeight = 'bold';
      } else if (eff === 'golden') {
        span.style.color = 'transparent';
        span.style.textShadow = effShadow(useOutl, useBl, '#8b6914');
        span.style.background = 'linear-gradient(180deg, #d4a017 0%, #fff8dc 30%, #d4a017 50%, #b8860b 70%, #d4a017 100%)';
        span.style.webkitBackgroundClip = 'text'; span.style.backgroundClip = 'text';
      } else if (eff === 'd3d_block') {
        const shadows = [];
        for (let i = 1; i <= 4; i++) shadows.push(i + 'px ' + i + 'px 0 ' + useC3);
        span.style.color = useC1;
        span.style.textShadow = shadows.join(',');
      } else if (eff === 'glow_pulse') {
        const speed = effSpeed('glow_pulse', 5) * 0.08;
        const breathe = 0.5 + Math.sin(effT() * speed) * 0.5;
        const pulseBlur = Math.max(0, useBl * breathe);
        const pulseOw = Math.max(0, useOutl * (0.5 + breathe * 0.5));
        span.style.color = useC1;
        span.style.textShadow = effShadow(pulseOw, pulseBlur, useC3);
      } else {
        span.style.color = useC1;
        span.style.textShadow = effShadow(useOutl, useBl, useC3);
      }
      _karaCharIdx += txt2.length;
    };

    const karaEffText = (s) => (s === ' ' ? '\u00A0' : s);

    // Áp hiệu ứng mức cả dòng lên lineDiv (đã chứa các span âm tiết).
    const applyKaraLineEffect = (lineDiv, eff, lineText) => {
      if (!eff) return;
      if (eff === 'shine_sweep') {
        const wrapper = document.createElement('span');
        wrapper.style.cssText = 'display:inline-block;position:relative;white-space:pre;';
        while (lineDiv.firstChild) wrapper.appendChild(lineDiv.firstChild);
        lineDiv.appendChild(wrapper);
        const speed = effSpeed('shine_sweep', 4) * 0.08;
        const pos = ((State.subsFrame * speed * 100) % 200) - 50;
        const shine = document.createElement('div');
        shine.textContent = lineText;
        shine.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;color:#fff;pointer-events:none;white-space:pre;z-index:10;text-shadow:none;-webkit-mask-image:linear-gradient(90deg,transparent 28%,#000 48%,#000 52%,transparent 72%);-webkit-mask-size:200% auto;-webkit-mask-position:' + pos + '% 50%;mask-image:linear-gradient(90deg,transparent 28%,#000 48%,#000 52%,transparent 72%);mask-size:200% auto;mask-position:' + pos + '% 50%;';
        wrapper.appendChild(shine);
      } else if (eff === 'float_hover') {
        const speed = effSpeed('float_hover', 5) * 0.1;
        const yOff = Math.sin(effT() * speed) * 8;
        lineDiv.style.transform = 'translateY(' + yOff + 'px)';
      } else if (eff === 'breathe') {
        const speed = effSpeed('breathe', 3) * 0.06;
        const scale = 1 + Math.sin(effT() * speed) * 0.05;
        lineDiv.style.transform = 'scale(' + scale + ')';
      } else if (eff === 'jello') {
        const age = (State.subsFrame || 0) % 60;
        let scaleX = 1, scaleY = 1;
        if (age < 12) { const t = age / 12; scaleX = 1 - Math.sin(t * Math.PI * 2) * 0.15 * (1 - t); scaleY = 1 + Math.sin(t * Math.PI * 2) * 0.1 * (1 - t); }
        else { const t = effT(); scaleX = 1 + Math.sin(t * 2) * 0.01; scaleY = 1 - Math.sin(t * 2) * 0.005; }
        lineDiv.style.transform = 'scale(' + scaleX + ', ' + scaleY + ')';
      } else if (eff === 'pulse') {
        const t = effT();
        const phase = t % (Math.PI * 2);
        let scale = 1;
        if (phase < 0.15) scale = 1 + 0.08;
        else if (phase < 0.3) scale = 1 - 0.02;
        else if (phase < 0.45) scale = 1 + 0.05;
        lineDiv.style.transform = 'scale(' + scale + ')';
      } else if (eff === 'shake') {
        const intensity = effSpeed('shake', 8) * 0.15;
        const dx = (Math.random() - 0.5) * intensity * 2;
        const dy = (Math.random() - 0.5) * intensity * 2;
        lineDiv.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      } else if (eff === 'glitch') {
        const speed = effSpeed('glitch', 5) * 0.05;
        const glitchFrame = Math.sin(effT() * speed);
        const isGlitch = Math.abs(glitchFrame) > 0.85;
        if (isGlitch) {
          const glitchRange = glitchFrame * 6;
          const rDiv = document.createElement('div');
          rDiv.style.cssText = 'position:absolute;left:' + glitchRange + 'px;top:0;color:#ff0000;opacity:0.6;z-index:1;pointer-events:none;white-space:pre;';
          rDiv.textContent = lineText;
          lineDiv.appendChild(rDiv);
          const gDiv = document.createElement('div');
          gDiv.style.cssText = 'position:absolute;left:' + (-glitchRange) + 'px;top:0;color:#00ff00;opacity:0.6;z-index:1;pointer-events:none;white-space:pre;';
          gDiv.textContent = lineText;
          lineDiv.appendChild(gDiv);
        }
      } else if (eff === 'ghosting') {
        lineDiv.style.position = 'relative';
        const speed = effSpeed('ghosting', 3) * 0.08;
        const t = effT() * speed;
        const offX = Math.sin(t) * 15;
        const offY = Math.cos(t * 0.7) * 8;
        const g1 = document.createElement('div');
        g1.style.cssText = 'position:absolute;left:' + offX + 'px;top:' + offY + 'px;color:' + c1 + ';opacity:0.2;z-index:1;filter:blur(3px);pointer-events:none;white-space:pre;';
        g1.textContent = lineText;
        lineDiv.appendChild(g1);
        const g2 = document.createElement('div');
        g2.style.cssText = 'position:absolute;left:' + (-offX * 0.6) + 'px;top:' + (-offY * 0.6) + 'px;color:' + c1 + ';opacity:0.15;z-index:1;filter:blur(5px);pointer-events:none;white-space:pre;';
        g2.textContent = lineText;
        lineDiv.appendChild(g2);
      } else if (eff === 'water_reflection') {
        const ref = document.createElement('div');
        ref.textContent = lineText;
        ref.style.cssText = 'color:' + c1 + ';text-shadow:' + effShadow(ow, bl, c3) + ';transform:scaleY(-1);opacity:0.35;filter:blur(2px);margin-top:4px;pointer-events:none;white-space:pre;';
        lineDiv.appendChild(ref);
      } else if (eff === 'typewriter') {
        const speed = effSpeed('typewriter', 10) * 0.03;
        const timeElapsedMs = Math.max(0, nowMs);
        const charCount = Math.min(Math.floor(timeElapsedMs / (200 / speed)), lineText.length);
        let shown = 0;
        Array.from(lineDiv.children).forEach((child) => {
          const tl = child.textContent || '';
          if (shown >= charCount) { child.style.display = 'none'; return; }
          shown += tl.length;
        });
      }
    };

    if (groups) {
      _karaCharIdx = 0;
      groups.forEach((g, li) => {
        const lineDiv = makeLineDiv(baseY + li * lineSpacing);
        applyBox(lineDiv);
        if (g.syllables && g.syllables.length) {
          g.syllables.forEach((syl) => {
            const span = document.createElement('span');
            span.textContent = syl.text;
            span.style.whiteSpace = 'nowrap';
            span.style.display = 'inline-block';
            if (letterSpacing > 0) span.style.marginRight = letterSpacing + 'px';
            let useC1, useC3, useOutl, useBl, useFs = fs, useZoom = 1;
            const active = nowMs >= syl.start && nowMs < syl.start + syl.dur;
            if (active) {
              // Âm tiết đang hát -> tab kActive
              if (isO) {
                // Use Style: màu chữ, màu viền + độ zoom theo tab Active bên Use Global;
                // cỡ chữ vẫn theo style trong file.
                useC1 = kActiveC1;
                useC3 = kActiveC3;
                useOutl = kActiveOutl;
                useBl = kActiveBlur;
                useFs = useStyleKaraFs(null, baseFs);
                const sEl = nowMs - syl.start;
                const sRem = (syl.start + syl.dur) - nowMs;
                const zDur = Number((gs.kActive && gs.kActive.zDur) || 100);
                const zoomMax = kActiveZoom;
                if (sEl < zDur) useZoom = 1 + (zoomMax - 1) * (sEl / zDur);
                else if (sRem < zDur) useZoom = 1 + (zoomMax - 1) * (sRem / zDur);
                else useZoom = zoomMax;
              } else {
                const k = kTab('kActive');
                useC1 = k.c1 || '#ffffff';
                useC3 = k.c3 || '#ff2d55';
                useOutl = karaOutl(k, 3);
                useBl = (Number(k.blur) != null ? Number(k.blur) : 6) * scaleH;
                useFs = karaFs(k, baseFs);
                const sEl = nowMs - syl.start;
                const sRem = (syl.start + syl.dur) - nowMs;
                const zDur = Number(k.zDur) || 100;
                const zoomMax = Number(k.zoom) || 1.1;
                if (sEl < zDur) useZoom = 1 + (zoomMax - 1) * (sEl / zDur);
                else if (sRem < zDur) useZoom = 1 + (zoomMax - 1) * (sRem / zDur);
                else useZoom = zoomMax;
              }
            } else if (nowMs >= syl.start + syl.dur) {
              // Đã hát xong -> kPost (mờ dần)
              if (isO) {
                // Use Style: màu chữ/viền + cỡ chữ lấy theo style trong file
                useC1 = stC1;
                useC3 = stC3;
                useOutl = stOutl;
                useBl = stBlur;
                useFs = useStyleKaraFs(null, baseFs);
                useZoom = 0.92;
              } else {
                const k = kTab('kPost');
                useC1 = k.c1 || c1;
                useC3 = k.c3 || c3;
                useOutl = karaOutl(k, ow);
                useBl = (Number(k.blur) != null ? Number(k.blur) : 6) * scaleH;
                useFs = karaFs(k, baseFs);
                const zoomPost = Number(k.zoom) || 1.0;
                useZoom = zoomPost < 1 ? zoomPost : 0.92;
              }
            } else {
              // Chưa hát -> kPre: Use Style dùng màu thứ cấp 2c của style (karaoke chưa hát)
              if (isO) {
                useC1 = stC2;
                useC3 = stC3;
                useOutl = stOutl;
                useBl = stBlur;
                useFs = useStyleKaraFs(null, baseFs);
                useZoom = 1.0;
              } else {
                const k = kTab('kPre');
                useC1 = k.c1 || c1;
                useC3 = k.c3 || c3;
                useOutl = karaOutl(k, ow);
                useBl = (Number(k.blur) != null ? Number(k.blur) : 6) * scaleH;
                useFs = karaFs(k, baseFs);
                useZoom = Number(k.zoom) || 1.0;
              }
            }
            if (karaEff) {
              span.textContent = karaEffText(syl.text);
              applyEffToKaraSyl(span, karaEff, syl.text, useC1, useC3, useOutl, useBl, useZoom);
            } else {
              span.textContent = syl.text;
              applySylStyle(span, useC1, useC3, useOutl, useBl, useZoom, useFs);
            }
            lineDiv.appendChild(span);
          });
          // Hiệu ứng mức cả dòng (transform / overlay) — ưu tiên effect trước.
          if (karaEff) applyKaraLineEffect(lineDiv, karaEff, g.line);
        } else {
          lineDiv.textContent = g.line;
          if (karaEff) applyKaraLineEffect(lineDiv, karaEff, g.line);
        }
      });
    } else {
      // ---- Non-karaoke: áp dụng kPre style nếu Use Global; hoặc hiệu ứng đặc biệt nếu bật ----
      const kPre = useGlobal ? kTab('kPre') : null;
      const eff = (gs.specialEffect && gs.specialEffect !== 'none') ? gs.specialEffect : null;
      (cue.rawLines || []).forEach((ln, li) => {
        const lineDiv = makeLineDiv(baseY + li * lineSpacing);
        applyBox(lineDiv);
        const plain = String(ln).replace(/\{[^}]*\}/g, ' ').replace(/\\h/g, ' ');

        if (eff) {
          // Hiệu ứng đặc biệt: lineDiv giữ vị trí/cỡ chữ, nội dung nằm trong spanWrap.
          if (eff === 'sine_wave') lineDiv.style.whiteSpace = 'pre';
          const spanWrap = document.createElement('span');
          spanWrap.style.display = 'inline-block';
          spanWrap.style.fontSize = fs + 'px';
          renderAssEffect(spanWrap, eff, plain, ow, bl, c3, c1, nowMs);
          lineDiv.appendChild(spanWrap);
          return;
        }

        lineDiv.textContent = plain;
        // Khi Use Global, kPre là "trạng thái chữ" mặc định — áp dụng màu/viền/blur/cỡ
        if (kPre) {
          const kC1 = kPre.c1 || c1;
          const kC3 = kPre.c3 || c3;
          const kOutl = karaOutl(kPre, ow);
          const kBl = (Number(kPre.blur) != null ? Number(kPre.blur) : bl / scaleH) * scaleH;
          const kFs = karaFs(kPre, baseFs);
          if (kFs !== fs) lineDiv.style.fontSize = kFs + 'px';
          lineDiv.style.color = kC1;
          lineDiv.style.textShadow = deepGlow
            ? buildDeepGlow(kOutl, kBl, kC3, useStroke)
            : buildShadow(kOutl, kBl, kC3, useStroke);
          if (useStroke && kOutl > 0) {
            lineDiv.style.webkitTextStroke = Math.max(kOutl, 1) + 'px ' + kC3;
            lineDiv.style.paintOrder = 'stroke fill';
          }
        }
      });
    }
    return div;
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
    _ytApiLoading = false;
    // Tao player ngay khi API san sang de khong phai cho khi nguoi dung bam phat
    ensureYtPlayer();
    // Không tự tạo player ở đây; tạo khi người dùng chọn bài
  };

  // Bị chặn hoặc API chưa nạp -> tự động chèn lại script iframe_api
  let _ytApiLoading = false;
  function loadYouTubeApi() {
    if ((window.YT && YT.Player) || _ytApiLoading) return;
    _ytApiLoading = true;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  }

  // Player YT đã sẵn sàng -> mở khóa này để an toàn gọi loadVideoById
  function onYtPlayerReady() {
    State.ytReady = true;
    startSubtitleTicker();
    try { State.ytPlayer.unloadModule('captions'); } catch (_e) { /* nếu module không có sẵn thì bỏ qua */ }
    // Nếu đang có bài hát chờ -> phát lại đầy đủ (kèm .ass) khi player sẵn sàng
    if (State.pendingPlay) {
      const song = State.pendingPlay;
      State.pendingPlay = null;
      State.pendingVideoId = null;
      playSong(song);
    } else if (State.pendingVideoId) {
      const vid = State.pendingVideoId;
      State.pendingVideoId = null;
      try {
        State.ytPlayer.loadVideoById({ videoId: vid, suggestedQuality: 'default' });
        const ph = $('#playerPlaceholder'); if (ph) ph.classList.add('hidden');
      } catch (_e) { /* ignore */ }
    }
  }

  // Nạp & phát video chỉ khi player đã onReady; ngược lại thì queue để phát sau
  function loadCurrentVideo(ytid) {
    if (State.ytPlayer && State.ytReady) {
      try {
        State.ytPlayer.loadVideoById({ videoId: ytid, suggestedQuality: 'default' });
        const ph = $('#playerPlaceholder'); if (ph) ph.classList.add('hidden');
        return true;
      } catch (_e) { return false; }
    }
    State.pendingVideoId = ytid;
    return false;
  }

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
          enablejsapi: 1,
          fs: 0, // ẩn nút fullscreen của YouTube; dùng nút fullscreen riêng của app
          cc_load_policy: 0, // luôn mặc định tắt phụ đề CC gốc của YouTube (dùng engine ASS riêng)
          cc_lang_pref: 'vi'
        },
        events: {
          onReady: () => {
            startSubtitleTicker();
            // Tắt hẳn module captions của YouTube để không bao giờ hiện CC gốc chồng lên phụ đề ASS
            try { State.ytPlayer.unloadModule('captions'); } catch (_e) { /* nếu module không có sẵn thì bỏ qua */ }
          },
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

  // Nút phóng to video full màn hình (dùng Fullscreen API trên khung video-wrap)
  // Trên điện thoại: cố gắng khoá màn hình theo chiều ngang (landscape) để video
  // phóng to ngang màn hình thay vì dọc (dùng Screen Orientation API, iOS 16.4+/Android).
  function toggleVideoFullscreen() {
    const wrap = $('.video-wrap');
    if (!wrap) return;
    if (!document.fullscreenElement) {
      const doEnter = () => {
        if (wrap.requestFullscreen) wrap.requestFullscreen();
        else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen(); // Safari
        else toast('Trình duyệt không hỗ trợ fullscreen.', 'warning');
      };
      // Khoá hướng landscape trước khi vào fullscreen
      const so = screen.orientation || (screen.mozOrientation) || (window.screen && window.screen.orientation);
      let lockPromise = Promise.resolve();
      if (so && typeof so.lock === 'function') {
        try {
          // landscape-primary/landscape-secondary — thử từng loại, ưu tiên primary
          if (so.type && so.type.indexOf('landscape') === 0) {
            doEnter(); // đã ở landscape rồi
          } else {
            lockPromise = so.lock('landscape').catch(() => { /* trình duyệt có thể không cho phép lock */ });
          }
        } catch (_e) { /* fallthrough */ }
      }
      Promise.resolve(lockPromise).then(() => doEnter()).catch(() => doEnter());
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      // Thử mở khoá hướng (về tự do) khi thoát fullscreen
      try {
        const so = screen.orientation || (window.screen && window.screen.orientation);
        if (so && typeof so.unlock === 'function') so.unlock();
      } catch (_e) { /* ignore */ }
    }
  }

  function updateVideoFsIcon() {
    const fsBtn = $('#videoFullscreenBtn');
    if (!fsBtn) return;
    const fs = !!document.fullscreenElement;
    fsBtn.classList.toggle('active', fs);
    fsBtn.setAttribute('aria-label', fs ? 'Thoát toàn màn hình' : 'Phóng to video');
    fsBtn.setAttribute('title', fs ? 'Thoát toàn màn hình (Esc)' : 'Phóng to video');
    const enterSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    const exitSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
    fsBtn.innerHTML = fs ? exitSvg : enterSvg;
  }

  // ── Nút fullscreen tự ẩn (cả trong lẫn ngoài fullscreen) ──
  // Chỉ hiện khi rê chuột/chạm gần góc trên khung video hoặc hover lên nút; tự ẩn
  // sau ~2.5s nhàn rỗi. CSS giao diện: vùng .fs-hover-zone có pointer-events:none
  // (để KHÔNG che/muốt click chuột của nút YouTube bên dưới) — JS theo dõi toàn
  // viewport bằng window pointermove để hiện nút khi con trỏ lướt tới vùng trên
  // (không cần zone nhận pointer event) + lắng nghe trên cả khung video cho touch.
  function initVideoFsAutohide() {
    const wrap = $('.video-wrap');
    const btn = $('#videoFullscreenBtn');
    const zone = wrap ? wrap.querySelector('.fs-hover-zone') : null;
    if (!wrap || !btn) return;
    let hideTimer = null;
    const HIDE_MS = 2500;
    const scheduleHide = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!btn.matches(':hover')) {
          btn.classList.remove('revealed');
          btn.classList.add('hiding');
          setTimeout(() => btn.classList.remove('hiding'), 300);
        }
      }, HIDE_MS);
    };
    const reveal = () => {
      if (hideTimer) clearTimeout(hideTimer);
      btn.classList.remove('hiding');
      btn.classList.add('revealed');
      scheduleHide();
    };
    // Vùng trên: rê/chạm vào khung video → hiện nút (bao gồm touch trên điện thoại).
    wrap.addEventListener('pointermove', reveal, { passive: true });
    wrap.addEventListener('pointerenter', reveal);
    wrap.addEventListener('pointerdown', reveal, { passive: true });
    // Giữ nút hiển thị khi rê đang nằm trên nút.
    btn.addEventListener('pointerenter', reveal);
    btn.addEventListener('pointerleave', scheduleHide);
    // Dự phòng: theo dõi toàn viewport để bắt trường hợp con trỏ lướt tới vùng trên
    // (vì iframe YouTube "nuốt" con trỏ nên wrap không luôn nhận được sự kiện).
    window.addEventListener('pointermove', (e) => {
      if (!zone) return;
      const r = zone.getBoundingClientRect();
      if (r.height > 0 && e.clientY >= r.top && e.clientY <= r.bottom &&
          e.clientX >= r.left && e.clientX <= r.right) reveal();
    }, { passive: true });
    // Bất kỳ lúc vào/ra fullscreen đều ẩn nút (không bật mãi khi fullscreen).
    const hideNow = () => {
      btn.classList.remove('revealed', 'hiding');
      if (hideTimer) clearTimeout(hideTimer);
    };
    document.addEventListener('fullscreenchange', hideNow);
    document.addEventListener('webkitfullscreenchange', hideNow);
  }

  function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.PLAYING) {
      startSubtitleTicker();
      updatePlayerControlsUI();
    } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.BUFFERING) {
      updatePlayerControlsUI();
      if (e.data === YT.PlayerState.PAUSED) hideSubtitleOverlay();
    } else if (e.data === YT.PlayerState.ENDED) {
      hideSubtitleOverlay();
      // Lặp lại 1 bài: phát lại chính bài đang phát
      if (State.repeat && State.currentSong) {
        setTimeout(() => playSong(State.currentSong), 600);
        return;
      }
      // Tự phát bài kế tiếp (nếu bật) — ngẫu nhiên nếu bật shuffle
      if (State.autoNext) {
        const next = pickNextSong();
        if (next) setTimeout(() => playSong(next), 1200);
      }
    } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.BUFFERING) {
      hideSubtitleOverlay();
    }
  }

  // Chọn bài kế tiếp — tôn trọng chế độ ngẫu nhiên (shuffle)
  function pickNextSong() {
    const curId = State.currentSong && State.currentSong.id;
    // Đang phát file .ass từ kho GitHub → tiến theo danh sách phụ đề .ass
    if (isAssSongId(curId)) {
      const list = getAssPlaylist();
      if (list.length === 0) return null;
      if (State.shuffle) {
        if (list.length === 1) return buildAssSong(list[0]);
        const curName = curId.slice(4);
        let file;
        let guard = 0;
        do { file = list[Math.floor(Math.random() * list.length)]; guard++; } while (file.name === curName && guard < 50);
        return buildAssSong(file);
      }
      const curName = curId.slice(4);
      const idx = list.findIndex((f) => f.name === curName);
      if (idx !== -1 && idx < list.length - 1) return buildAssSong(list[idx + 1]);
      return null; // hết danh sách (không vòng lại)
    }
    const songs = State.songs;
    if (!songs || songs.length === 0) return null;
    const idx = songs.findIndex((s) => s.id === curId);
    if (State.shuffle) {
      // ngẫu nhiên trong danh sách, tránh lặp lại bài đang phát nếu có > 1 bài
      if (songs.length === 1) return songs[0];
      let pick;
      do { pick = songs[Math.floor(Math.random() * songs.length)]; } while (pick.id === curId);
      return pick;
    }
    if (idx !== -1 && idx < songs.length - 1) return songs[idx + 1];
    return null; // hết danh sách (không vòng lại)
  }

  // Lùi về bài trước (vòng lại cuối danh sách nếu đang ở bài đầu)
  function playPrevSong() {
    const curId = State.currentSong && State.currentSong.id;
    // Đang phát file .ass từ kho GitHub → lùi theo danh sách phụ đề .ass
    if (isAssSongId(curId)) {
      const list = getAssPlaylist();
      if (list.length === 0) return;
      const curName = curId.slice(4);
      const idx = list.findIndex((f) => f.name === curName);
      const target = idx > 0 ? list[idx - 1] : list[list.length - 1];
      playAssSub(target);
      return;
    }
    const songs = State.songs;
    if (!songs || songs.length === 0) return;
    const idx = songs.findIndex((s) => s.id === curId);
    if (idx > 0) playSong(songs[idx - 1]);
    else if (idx === 0) playSong(songs[songs.length - 1]);
    else playSong(songs[0]);
  }

  // Sang bài kế tiếp (vòng lại đầu danh sách nếu ở bài cuối) — shuffle thì ngẫu nhiên
  function playNextSong() {
    const curId = State.currentSong && State.currentSong.id;
    // Đang phát file .ass từ kho GitHub → tiến theo danh sách phụ đề .ass
    if (isAssSongId(curId)) {
      const list = getAssPlaylist();
      if (list.length === 0) return;
      if (State.shuffle) { const n = pickNextSong(); if (n) playSong(n); return; }
      const curName = curId.slice(4);
      const idx = list.findIndex((f) => f.name === curName);
      const target = (idx !== -1 && idx < list.length - 1) ? list[idx + 1] : list[0];
      playAssSub(target);
      return;
    }
    const songs = State.songs;
    if (!songs || songs.length === 0) return;
    if (State.shuffle) { const n = pickNextSong(); if (n) playSong(n); return; }
    const idx = songs.findIndex((s) => s.id === curId);
    if (idx !== -1 && idx < songs.length - 1) playSong(songs[idx + 1]);
    else playSong(songs[0]);
  }

  // Bật / tạm dừng (chỉ khi có player và đang phát một video)
  function togglePlay() {
    if (!State.ytPlayer || !State.youtubeReady || !State.currentSong) return;
    try {
      const st = State.ytPlayer.getPlayerState();
      if (st === YT.PlayerState.PLAYING) { State.ytPlayer.pauseVideo(); hideSubtitleOverlay(); }
      else State.ytPlayer.playVideo();
      updatePlayerControlsUI();
    } catch (_e) { /* ignore */ }
  }

  const PC_AR_ICON_AUTO = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  const PC_AR_ICON_REPEAT = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><line x1="13" y1="16" x2="13" y2="16"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>';

  function updatePlayerControlsUI() {
    const arBtn = $('#pcAutoRepeat');
    if (arBtn) {
      if (State.repeat) {
        arBtn.classList.add('active');
        arBtn.title = 'Lặp lại bài hiện tại (đang bật)';
        arBtn.setAttribute('aria-label', 'Lặp lại bài hiện tại (đang bật). Bấm để chuyển sang tự động chuyển bài');
        arBtn.innerHTML = PC_AR_ICON_REPEAT;
      } else if (State.autoNext) {
        arBtn.classList.add('active');
        arBtn.title = 'Tự động chuyển bài (đang bật)';
        arBtn.setAttribute('aria-label', 'Tự động chuyển bài (đang bật). Bấm để tắt');
        arBtn.innerHTML = PC_AR_ICON_AUTO;
      } else {
        arBtn.classList.remove('active');
        arBtn.title = 'Lặp lại / Tự động chuyển bài (đang tắt)';
        arBtn.setAttribute('aria-label', 'Lặp lại hoặc tự động chuyển bài. Bấm để bật lặp 1 video');
        arBtn.innerHTML = PC_AR_ICON_AUTO;
      }
    }
    const shfBtn = $('#pcShuffle');
    if (shfBtn) shfBtn.classList.toggle('active', !!State.shuffle);
    const playIcon = $('#pcPlayIcon');
    if (playIcon && State.ytPlayer && State.youtubeReady) {
      let playing = false;
      try { playing = State.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING; } catch (_e) {}
      playIcon.innerHTML = playing
        ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
        : '<path d="M8 5v14l11-7z"/>';
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

    // Phát video NGAY (không chờ tải phụ đề) — nút tiến/lùi phản hồi tức thì
    try {
      State.ytPlayer.loadVideoById({ videoId: song.youtube_id, suggestedQuality: 'default' });
      $('#playerPlaceholder').classList.add('hidden');
      toast('Đang phát: ' + (song.title || ''), 'info', 1600);
    } catch (e) {
      console.error('Lỗi phát video:', e);
      toast('Không thể phát video ' + (song.title || ''), 'error');
      return;
    }

    // Tải & nạp phụ đề .ass ở nền (song song với việc phát video)
    const subFile = matchSubtitleFor(song);
    if (subFile) {
      const applyText = (text) => {
        if (State.currentSong && State.currentSong.id !== song.id) return; // đã chuyển bài khác
        State.rawAssText = text;
        try {
          const parsed = parseAssEngine(text);
          State.subtitles = parsed.subtitles;
          State.styleSettings = parsed.styleSettings;
          State.playResX = parsed.playResX;
          State.playResY = parsed.playResY;
          State.subsEnabled = parsed.subtitles.length > 0; // tự bật phụ đề khi có file .ass
        } catch (_e) { State.subtitles = []; }
        applySubContextChanges(song);
      };
      if (subFile.cached && subFile.text) {
        // file từ Phụ đề Cache (đã có sẵn text trên máy)
        applyText(subFile.text);
      } else {
        fetch(subFile.download_url)
          .then((res) => (res.ok ? res.text() : Promise.reject(new Error('HTTP ' + res.status))))
          .then(applyText)
          .catch((e) => {
            console.warn('Lỗi tải .ass:', e);
            State.subtitles = [];
            applySubContextChanges(song);
          });
      }
    } else {
      applySubContextChanges(song);
    }
  }
  // Áp cài đặt phụ đề đã lưu riêng cho video / file .ass này (chỉ khi vẫn đang phát đúng bài đó)
  function applySubContextChanges(song) {
    if (!song) return;
    if (State.currentSong && State.currentSong.id !== song.id) return;
    activateSubContext();
    updateSubsToggleUI();
    if (State.subsEnabled) updateCurrentSubtitle();
  }
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
    // Áp dụng timeshift (ms) + lưu chiều cao vùng hiển thị video để tính scaleH.
    // Đo từ .video-wrap (khung 16:9 thật) — giống extension đo layer khớp video
    // (engine-css.js: layerRect.height / playResY). Overlay span toàn khung nên
    // scaleH = kích thước khung video / PlayResY, đồng nhất fullscreen & non-fullscreen.
    const shiftSec = (State.timeShiftMs || 0) / 1000;
    const t = current + shiftSec;
    State.lastRenderTime = t;
    // Đồng hồ hiệu ứng: tick 100ms → cộng 6 (≈60fps) để khớp thang _animFrameCount*0.016 giây.
    State.subsFrame = (State.subsFrame || 0) + 6;
    const videoFrame = overlay.closest('.video-wrap') || overlay.parentElement;
    const frameH = videoFrame
      ? (videoFrame.clientHeight || videoFrame.offsetHeight || overlay.clientHeight || 0)
      : 0;
    State.subOverlayHeight = frameH;
    const active = State.subtitles.filter((s) => t >= s.start && t <= s.end);
    if (!State.subsEnabled || active.length === 0) {
      hideSubtitleOverlay();
      return;
    }
    // Render từng cue ASS (engine) — style/vị trí/karaoke
    overlay.innerHTML = '';
    let rendered = 0;
    active.forEach((cue) => {
      const frag = renderAssCue(cue);
      if (frag && frag.childNodes && frag.childNodes.length) {
        overlay.appendChild(frag);
        rendered++;
      }
    });
    if (rendered === 0) { hideSubtitleOverlay(); return; }
    overlay.classList.add('show');
    // Tách chồng lấn: nếu nhiều cue hoạt động cùng lúc đè lên nhau, dịch dọc tách ra.
    resolveSubtitleCollisions(overlay);
  }

  // ── Tách chồng lấn giữa các phụ đề đang hiển thị ──
  // Hai cue coi là "đè" nhau khi khung ngoài của chúng trùng nhau theo cả chiều
  // ngang lẫn chiều dọc. Khi đó dịch cue phía dưới/trên tách ra theo hướng phù
  // hợp với kiểu neo (bottom → đẩy lên trên để giữ sát mép dưới; top → đẩy xuống;
  // giữa → đẩy nhau xa tâm). Lặp vài vòng cho tới khi hết đè hoặc hết lượt.
  function resolveSubtitleCollisions(overlay) {
    const cues = Array.from(overlay.querySelectorAll('.ass-cue'));
    if (cues.length < 2) return;
    const r = overlay.getBoundingClientRect();
    const ovH = r.height || 1;
    const GAP = Math.max(3, ovH * 0.012);         // khoảng trống tối thiểu giữa 2 dòng
    const readBox = (el) => {
      const b = el.getBoundingClientRect();
      return {
        el, v: el.dataset.v || 'bottom',
        top: b.top - r.top, bottom: b.bottom - r.top,
        left: b.left - r.left, right: b.right - r.left
      };
    };
    const apply = (bx, off) => {
      const el = bx.el;
      const cur = parseFloat(el.dataset.off || 0);
      if (cur === off) return;
      el.dataset.off = String(off);
      el.style.transform = 'translate(' + el.dataset.tx + ',' + el.dataset.ty + ') translateY(' + off + 'px)';
    };
    let boxes = cues.map(readBox);
    // Giới hạn vòng lặp để không treo; mỗi vòng chỉ cần 1 cặp đè đầu tiên được xử lý.
    for (let iter = 0; iter < 20; iter++) {
      let progressed = false;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          // Trùng ngang: khung ngoài 2 cue chồng nhau theo trục X
          const hOverlap = a.left < b.right - 1 && a.right > b.left + 1;
          if (!hOverlap) continue;
          // Trùng dọc: chồng nhau theo trục Y (bỏ qua khoảng trống GAP)
          const vOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (vOverlap <= GAP) continue;
          // Xác định cue trên (top nhỏ hơn) và dưới
          const upper = a.top <= b.top ? a : b;
          const lower = upper === a ? b : a;
          const shift = vOverlap + GAP;
          if (a.v === 'top' || b.v === 'top') {
            // Neo trên → đẩy cue dưới xuống thêm (giữ cue trên sát mép trên)
            apply(lower, parseFloat(lower.el.dataset.off || 0) + shift);
          } else {
            // Neo dưới / giữa → đẩy cue trên lên (giữ cue dưới sát mép dưới)
            apply(upper, parseFloat(upper.el.dataset.off || 0) - shift);
          }
          // Cập nhật toạ độ sau khi dịch rồi tiếp tục vòng ngoài (đơn giản, ổn định)
          boxes = cues.map(readBox);
          progressed = true;
          break;
        }
        if (progressed) break;
      }
      if (!progressed) break;
    }
  }
  function hideSubtitleOverlay() {
    const overlay = $('#subtitleOverlay');
    if (overlay) {
      overlay.classList.remove('show');
      if (overlay.firstChild) overlay.innerHTML = '';
    }
  }

  function updateSubsToggleUI() {
    const label = $('#subsToggleLabel');
    const icon = $('#subsToggleIcon');
    const hasSubs = State.subtitles.length > 0;
    const btn = $('#subsToggle');
    if (btn) btn.disabled = !hasSubs;
    if (!hasSubs) {
      State.subsEnabled = false;
      if (label) label.textContent = 'Không có phụ đề';
      if (icon) icon.textContent = '🚫';
      hideSubtitleOverlay();
      return;
    }
    if (icon) icon.textContent = State.subsEnabled ? '💬' : '🔇';
    if (label) label.textContent = State.subsEnabled ? 'Phụ đề: Bật' : 'Phụ đề: Tắt';
    if (State.subsEnabled) updateCurrentSubtitle();
    else hideSubtitleOverlay();
  }

/* ──────────────────────────────────────────────────────
     7.6 CÀI ĐẶT PHỤ ĐỀ — POPUP MENU (port YouTube-Aegisub-Loader)
     ────────────────────────────────────────────────────── */
  const SUB_SETTINGS_KEY = 'kullanime_sub_settings_v1';
  const SUB_STORE_KEY = 'kullanime_sub_store_v2';     // lưu cài đặt theo từng video / file .ass
  const SUB_SETTINGS_DEFAULTS = {
    fontSize: 90, outlineWidth: 3, blur: 6, color1: '#ffffff', color3: '#000000',
    spacing: 0, letterSpacing: 0.9, textZoom: 1.0, fontScale: 100, lineSpacing: 135,
    useBox: false, deepGlow: false, boxColor: '#000000', boxOpacity: 0.5, boxBlur: 0, fontFamily: 'VNF-Comic Sans',
    fadIn: 200, fadOut: 200, popupOpacity: 0.95, popupZoom: 1.0,
    posX: 350, posY: 100, width: 820, height: 600,
    isBold: true, isItalic: false, isUnderline: false, isStrike: false,
    kPre:    { c1: '#ffffff', c3: '#000000', fs: 90, outl: 3, blur: 6, zoom: 1.0 },
    kActive: { c1: '#ffffff', c3: '#ff2d55', fs: 90, outl: 4, blur: 8, zoom: 1.1, zDur: 100 },
    kPost:   { c1: '#ffffff', c3: '#000000', fs: 90, outl: 3, blur: 6, zoom: 1.0 },
    closeOnClickOutside: true,
    useGlobalStyles: false,
    useTextStroke: false,
    // ---- Hiệu ứng đặc biệt (port từ extension engine-css.js) ----
    specialEffect: 'none',
    effectSpeed: {},
    sineWaveAmplitude: 2
  };
  let _subPopupEl = null;
  let _subPopupDragging = false;
  let _subPopupDragOff = [0, 0];
  let _lastUsedSubSettings = null; // cài đặt của context gần nhất (để "kế thừa" sang video mới khi chưa có riêng)
  const _subFontOptions = ['VNF-Comic Sans', 'Arial', 'Tahoma', 'Verdana', 'Segoe UI', 'Times New Roman'];

  // --------------------- LƯU CÀI ĐẶT THEO TỪNG VIDEO / FILE .ASS ---------------------
  // Store: { [contextKey]: { subSettings, styleSettings, subsEnabled } } lưu ở localStorage.
  function readSubStore() {
    try {
      const raw = localStorage.getItem(SUB_STORE_KEY);
      if (!raw) return {};
      const st = JSON.parse(raw);
      return (st && typeof st === 'object') ? st : {};
    } catch (_e) { return {}; }
  }
  function writeSubStore(store) {
    try { localStorage.setItem(SUB_STORE_KEY, JSON.stringify(store)); } catch (_e) { /* quota */ }
  }
  // Chuỗi định danh cho video / file .ass đang phát
  function currentSubContext() {
    const s = State.currentSong;
    if (!s) return '__global__';
    if (s.ass_file) return 'ass:' + s.ass_file;
    if (s.youtube_id) return 'vid:' + s.youtube_id;
    return '__global__';
  }
  // Nạp cài đặt mặc định (cho lúc chưa phát bài nào)
  function loadSubSettings() {
    try {
      const raw = localStorage.getItem(SUB_SETTINGS_KEY); // nâng cấp từ v1 nếu có
      if (!raw) return JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS));
      return Object.assign({}, JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS)), JSON.parse(raw));
    } catch (_e) {
      return JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS));
    }
  }
  // Lưu cài đặt hiện tại (subSettings + per-style override) theo đúng context đang phát
  function saveSubSettings() {
    try {
      const store = readSubStore();
      store[currentSubContext()] = {
        subSettings: State.subSettings || {},
        styleSettings: State.styleSettings || {},
        subsEnabled: State.subsEnabled
      };
      writeSubStore(store);
      _lastUsedSubSettings = State.subSettings;
    } catch (_e) { /* ignore */ }
  }
  function ensureSubSettings() {
    if (!State.subSettings) State.subSettings = loadSubSettings();
    return State.subSettings;
  }
  // Được gọi trong playSong sau khi parse .ass: áp dụng cài đặt + per-style override đã lưu cho context này
  function activateSubContext() {
    const store = readSubStore();
    const ctx = currentSubContext();
    const entry = store[ctx];
    // Mỗi video ID / file .ass có config riêng trong cache. Nếu chưa từng lưu cho video
    // này → dùng MẶC ĐỊNH, KHÔNG kế thừa cài đặt của video trước (không đem qua video khác).
    State.subSettings = Object.assign({}, JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS)),
      (entry && entry.subSettings) || {});
    // Áp per-style override đã lưu lên styleSettings vừa parse
    if (entry && entry.styleSettings) {
      const saved = entry.styleSettings;
      for (const k of Object.keys(saved)) {
        const st = State.styleSettings && State.styleSettings[k];
        if (st) Object.assign(st, saved[k]);
      }
    }
    if (entry && typeof entry.subsEnabled === 'boolean') State.subsEnabled = entry.subsEnabled;
    _lastUsedSubSettings = State.subSettings;
  }
  function getSubFontOptionsHTML() {
    const gs = ensureSubSettings();
    const opts = _subFontOptions.map((f) =>
      '<option value="' + f + '"' + (gs.fontFamily === f ? ' selected' : '') + '>' + f + '</option>'
    ).join('');
    return '<select id="sub-fontSelect">' + opts + '<option value="custom">-- Load --</option></select>';
  }
  // Danh sách hiệu ứng CÓ hàm render trong app.js (import từ engine-css.js engine-css.js port).
  const _effectOptions = [
    { v: 'none', l: 'None (tắt)' },
    { v: 'rainbow_outline', l: '🌈 Rainbow Outline' },
    { v: 'rainbow_outline_rgb', l: '🌈 RGB Outline' },
    { v: 'rainbow_text', l: '🌈 RGB Text' },
    { v: 'sine_wave', l: '〰️ Sine Wave' },
    { v: 'shine_sweep', l: '✨ Shine / Sweep' },
    { v: 'split_color', l: '🔲 Split Color' },
    { v: 'retro_80s', l: '🌴 80s Retro' },
    { v: 'golden', l: '🏆 Golden Text' },
    { v: 'float_hover', l: '🎈 Float / Hover' },
    { v: 'breathe', l: '🌬️ Breathe' },
    { v: 'jello', l: '🍮 Jello' },
    { v: 'typewriter', l: '⌨️ Typewriter' },
    { v: 'pulse', l: '💓 Pulse / Heartbeat' },
    { v: 'shake', l: '🌊 Shake' },
    { v: 'glitch', l: '👾 Glitch' },
    { v: 'ghosting', l: '👻 Ghosting' },
    { v: 'water_reflection', l: '🪞 Water Reflection' },
    { v: 'd3d_block', l: '🧊 3D Block' },
    { v: 'glow_pulse', l: '💫 Glow Pulse' }
  ];
  function getEffectOptionsHTML(current) {
    return _effectOptions.map((o) =>
      '<option value="' + o.v + '"' + (current === o.v ? ' selected' : '') + '>' + o.l + '</option>'
    ).join('');
  }
  function getEffectSpeedDisplay(gs) {
    const eff = (gs && gs.specialEffect) || 'none';
    const sp = (gs && gs.effectSpeed) || {};
    const v = sp[eff];
    return (v != null && !isNaN(Number(v))) ? Number(v) : 1;
  }
  function renderSubGlobalRow(l, k, min, max, s) {
    const gs = ensureSubSettings();
    return '<div class="g-row"><label>' + l + '</label>' +
      '<input type="range" id="g-' + k + '" min="' + min + '" max="' + max + '" step="' + s + '" value="' + (gs[k] != null ? gs[k] : 0) + '">' +
      '<input type="number" id="g-' + k + 'Val" value="' + (gs[k] != null ? gs[k] : 0) + '" step="' + s + '" class="num-in"></div>';
  }
  function renderSubKTab(key) {
    const gs = ensureSubSettings();
    const obj = gs[key] || {};
    const isAct = key === 'kActive';
    const outl = (obj.outl != null ? obj.outl : (gs.outlineWidth != null ? gs.outlineWidth : 3));
    const blur = (obj.blur != null ? obj.blur : (gs.blur != null ? gs.blur : 6));
    const zoomPct = (obj.zoom != null ? Math.round(obj.zoom * 100) : (isAct ? 110 : 100));
    return '' +
      '<div class="g-row"><label style="white-space:nowrap;">Viền</label>' +
        '<input type="range" data-k="' + key + '" data-type="outl" min="0" max="30" step="0.1" value="' + outl + '">' +
        '<input type="number" data-k="' + key + '" data-type="outl" value="' + outl + '" class="num-in" step="0.1">' +
      '</div>' +
      '<div class="g-row"><label style="white-space:nowrap;">Blur</label>' +
        '<input type="range" data-k="' + key + '" data-type="blur" min="0" max="100" step="0.1" value="' + blur + '">' +
        '<input type="number" data-k="' + key + '" data-type="blur" value="' + blur + '" class="num-in" step="0.1">' +
      '</div>' +
      '<div class="g-row k-colorzoom-row">' +
        '<span class="k-col"><i>1c</i><input type="color" data-k="' + key + '" data-type="c1" value="' + (obj.c1 || '#ffffff') + '"></span>' +
        '<span class="k-col"><i>3c</i><input type="color" data-k="' + key + '" data-type="c3" value="' + (obj.c3 || '#000000') + '"></span>' +
        '<label class="k-zoom-lab" style="white-space:nowrap;">Zoom</label>' +
        '<input type="number" data-k="' + key + '" data-type="zoom" value="' + zoomPct + '" class="num-in" step="5" min="20" max="300"><span class="sub-pct">%</span>' +
        (isAct ? '<span class="sub-foot-sep"></span>' +
          '<span class="k-inout-lab" style="white-space:nowrap;">In/Out</span>' +
          '<input type="number" data-k="' + key + '" data-type="zDur" value="' + (obj.zDur != null ? obj.zDur : 100) + '" class="num-in" step="10" min="0">' +
          '<span class="sub-pct">ms</span>' : '') +
      '</div>';
  }
  const PLAYER_PREFS_KEY = 'kullanime_player_prefs_v1';
  function loadPlayerPrefs() {
    try {
      const raw = localStorage.getItem(PLAYER_PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.autoNext === 'boolean') State.autoNext = p.autoNext;
      if (typeof p.shuffle === 'boolean') State.shuffle = p.shuffle;
      if (typeof p.repeat === 'boolean') State.repeat = p.repeat;
    } catch (_e) { /* ignore */ }
  }
  function savePlayerPrefs() {
    try { localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ autoNext: State.autoNext, shuffle: State.shuffle, repeat: State.repeat })); } catch (_e) { /* ignore */ }
  }

  // ===================== PANEL SUB SETTINGS (giống chat) =====================
  // Panel cố định (#subPanel) trong index.html, mở kiểu chat: header + nút ✕ đóng,
  // đóng bằng Esc / bấm ngoài / nút ✕. Nội dung 2 khối dọc cuộn liên tục:
  // "Cài đặt chung" + "Cài đặt từng style".
  // Giữ nguyên mọi ID/class mà setupSubPopupEvents + renderSubStyleItems dựa vào.
  function isSubPanelOpen() {
    return !!(_subPopupEl && !_subPopupEl.classList.contains('hidden') && !_subPopupEl.classList.contains('is-closing'));
  }
  function showSubPanel() {
    if (_subPopupEl) _subPopupEl.classList.remove('hidden', 'is-closing');
    const fab = $('#subsSettingsBtn');
    if (fab) fab.setAttribute('aria-expanded', 'true');
    if (fab) fab.classList.add('active');
    // Panel nằm in-flow ngay dưới thanh now-playing — chỉ cần bỏ lớp .hidden để sổ xuống.
  }
  function hideSubPanel() {
    if (_subPopupEl) _subPopupEl.classList.add('is-closing');
    setTimeout(() => { if (_subPopupEl) _subPopupEl.classList.add('hidden'); }, 160);
    const fab = $('#subsSettingsBtn');
    if (fab) fab.setAttribute('aria-expanded', 'false');
    if (fab) fab.classList.remove('active');
  }
  function createSubPopup() {
    if (_subPopupEl && document.body.contains(_subPopupEl) && ($('#subPanelBody') && $('#subPanelBody').children.length)) return _subPopupEl;
    const gs = ensureSubSettings();
    const panel = _subPopupEl || $('#subPanel');
    if (!panel) return null;
    const ctxLabel = (State.currentSong && (State.currentSong.ass_file || State.currentSong.title)) || 'Mặc định';
    panel.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'sub-panel-header';
    header.innerHTML =
      // 1 hàng: [🗑️ ALL reset] [tên file chạy marquee] [🔄 Reset video này] [✕]
      '<button type="button" class="sub-reset-all-btn" id="subResetAll" title="Xoá TOÀN BỘ config + cache của TẤT CẢ video">🗑️ ALL</button>' +
      '<em class="sub-panel-ctx" id="subPanelCtx" title="' + esc(ctxLabel) + '"><span class="sub-ctx-scroll"><span class="sub-ctx-text">' + esc(ctxLabel) + '</span><span class="sub-ctx-text">' + esc(ctxLabel) + '</span></span></em>' +
      '<div class="sub-header-actions">' +
        '<button type="button" class="sub-reset-ctx" id="subResetCtx" title="Reset tất cả cài đặt + cache của video này (xóa mọi cấu hình đã chọn)">🔄 Reset</button>' +
        '<button type="button" class="sub-panel-close" id="subPanelClose" aria-label="Đóng cài đặt phụ đề" title="Đóng (Esc)">✕</button>' +
      '</div>';
    const body = document.createElement('div');
    body.className = 'sub-panel-body';
    body.id = 'subPanelBody';
    body.innerHTML = buildSubPopupHTML(gs);
    panel.appendChild(header);
    panel.appendChild(body);
    _subPopupEl = panel;
    setupSubPopupEvents();
    return panel;
  }
  function toggleSubPopup() {
    createSubPopup();
    if (!_subPopupEl) return;
    if (isSubPanelOpen()) { hideSubPanel(); }
    else {
      showSubPanel();
      renderSubStyleItems();
      if (State.subsEnabled) updateCurrentSubtitle();
    }
  }

  // Re-render nội dung khối body của panel ngay tại chỗ (không gỡ aside khỏi DOM),
  // dùng khi reset / restore để làm mới toàn bộ giá trị cài đặt.
  function rerenderSubPanel() {
    const panel = _subPopupEl || $('#subPanel');
    if (!panel) return;
    const body = $('#subPanelBody');
    if (body) body.innerHTML = buildSubPopupHTML(ensureSubSettings());
    _subPopupEl = panel;
    setupSubPopupEvents();
  }

  // Tạo HTML nội dung panel body: thanh công cụ CHUNG (Font + B/I/U/S + %scale + reset)
  // luôn hiển thị trên hàng chọn Cài đặt chung / Cài đặt từng style, và hoạt động kể cả
  // khi đang ở Cài đặt từng style. Thanh Timeshift nằm ở header (createSubPopup).
  function buildSubPopupHTML(gs) {
    const useCommon = !!(gs.useGlobalStyles);
    const activeM = State._subActiveTab || (useCommon ? 'common' : 'styles');
    return '' +
      // ---------- Thanh công cụ CHUNG 1 dòng: Font + B/I/U/S + Cỡ chữ % + reset ----------
      '<div class="sub-global-toolbar">' +
        '<span class="sub-gtb-lab">Aa</span>' + getSubFontOptionsHTML() +
        '<div class="sub-gtb-fmt">' +
          '<button type="button" class="format-btn ' + (gs.isBold ? 'active' : '') + '" id="sub-btn-isBold" title="In đậm">B</button>' +
          '<button type="button" class="format-btn ' + (gs.isItalic ? 'active' : '') + '" id="sub-btn-isItalic" title="In nghiêng">I</button>' +
          '<button type="button" class="format-btn ' + (gs.isUnderline ? 'active' : '') + '" id="sub-btn-isUnderline" title="Gạch chân">U</button>' +
          '<button type="button" class="format-btn ' + (gs.isStrike ? 'active' : '') + '" id="sub-btn-isStrike" title="Gạch ngang">S</button>' +
        '</div>' +
        '<span class="sub-gtb-sep"></span>' +
        '<label class="sub-gtb-lab sub-gtb-lab-sm">A%</label>' +
        '<input type="range" id="g-fontScale" min="50" max="200" step="1" value="' + (gs.fontScale != null ? gs.fontScale : 100) + '">' +
        '<input type="number" id="g-fontScaleVal" value="' + (gs.fontScale != null ? gs.fontScale : 100) + '" step="1" min="50" max="200" class="num-in">' +
        '<button type="button" class="sub-gtb-reset" id="sub-gtb-reset" title="Về mặc định: cỡ 100%, bỏ chọn B/I/U/S, font mặc định">⟳</button>' +
      '</div>' +

      // ---------- 4 tab lớn: All / Global / Style / Effect ----------
      '<div class="sub-mtabs" role="tablist">' +
        '<span class="sub-mtab-ind" aria-hidden="true"></span>' +
        '<button type="button" class="sub-mtab' + (activeM === 'all' ? ' active' : '') + '" data-m="all" role="tab">🗂 All</button>' +
        '<button type="button" class="sub-mtab' + (activeM === 'common' ? ' active' : '') + (useCommon ? ' mode-on' : '') + '" data-m="common" role="tab">🌍 Global</button>' +
        '<button type="button" class="sub-mtab' + (activeM === 'styles' ? ' active' : '') + (!useCommon ? ' mode-on' : '') + '" data-m="styles" role="tab">🎨 Style</button>' +
        '<button type="button" class="sub-mtab' + (activeM === 'effect' ? ' active' : '') + '" data-m="effect" role="tab">✨ Effect</button>' +
      '</div>' +

      // ---------- Panel 0: All (Fade + Box + LetterSpacing + Timeshift + Reset + Actions) ----------
      '<div class="sub-mtab-panel" data-m="all" role="tabpanel" style="display:' + (activeM === 'all' ? 'block' : 'none') + ';">' +
        '<div class="sub-panel-footer">' +
          // ---- Hàng 1: Fade In/Out + Timeshift ----
          '<div class="sub-foot-row">' +
            '<label class="sub-fade-lab">Fade In:</label>' +
            '<input type="number" id="g-fadIn" value="' + (gs.fadIn || 200) + '" class="num-in sub-fade-in" min="0" max="2000">' +
            '<label class="sub-fade-out-lab">Out:</label>' +
            '<input type="number" id="g-fadOut" value="' + (gs.fadOut || 200) + '" class="num-in sub-fade-out" min="0" max="2000">' +
            '<span class="sub-foot-sep"></span>' +
            '<div class="sub-ts-bar">' +
              '<span class="sub-ts-ico" title="Timeshift">⏱</span>' +
              '<button type="button" id="sub-ts-dec" title="Lùi 100ms">−</button>' +
              '<input type="text" id="sub-ts-input" value="' + (State.timeShiftMs || 0) + '" inputmode="numeric" aria-label="Timeshift (ms)">' +
              '<span class="sub-ts-ms">ms</span>' +
              '<button type="button" id="sub-ts-inc" title="Tiến 100ms">+</button>' +
              '<button type="button" id="sub-ts-zero" title="Đặt lại về 0">⟳</button>' +
              '<button type="button" id="sub-ts-dl" title="Tải file .ass đã shift time" style="color:#5eead4">💾</button>' +
            '</div>' +
          '</div>' +
          // ---- Hàng 2: Hộp nền + Khoảng cách chữ ----
          '<div class="sub-foot-row">' +
            '<label class="sub-box-lab"><input type="checkbox" id="g-useBox" ' + (gs.useBox ? 'checked' : '') + '> Hộp</label>' +
            '<input type="color" id="g-boxColor" value="' + (gs.boxColor || '#000000') + '">' +
            '<input type="range" id="g-boxBlur" min="0" max="50" step="1" value="' + (gs.boxBlur != null ? gs.boxBlur : 0) + '" class="sub-box-blur">' +
            '<span class="sub-foot-sep"></span>' +
            '<label class="sub-lsp-lab">K/C chữ</label>' +
            '<input type="range" id="g-letterSpacing" min="-5" max="20" step="0.1" value="' + (gs.letterSpacing != null ? gs.letterSpacing : 0.9) + '" class="sub-letter-spacing">' +
            '<input type="number" id="g-letterSpacingVal" min="-5" max="20" step="0.1" value="' + (gs.letterSpacing != null ? gs.letterSpacing : 0.9) + '" class="num-in sub-lsp-val">' +
          '</div>' +
          // ---- Hàng 3: Reset Global + Actions ----
          '<div class="sub-foot-row sub-ts-row">' +
            '<button type="button" id="sub-settings-reset" class="sub-reset-global-btn" title="Reset cài đặt chung (Global) về mặc định">↺ Reset Global</button>' +
            '<span class="sub-foot-sep"></span>' +
            '<div class="sub-foot-actions">' +
              '<label class="sub-foot-lab"><input type="checkbox" id="sub-close-outside" ' + (gs.closeOnClickOutside ? 'checked' : '') + '> Đóng khi click ngoài</label>' +
              '<button type="button" id="sub-backup" title="Backup settings + cache">💾</button>' +
              '<button type="button" id="sub-restore" title="Restore từ file JSON">📥</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ---------- Panel 1: Global (chỉ 3 tab karaoke: Pre / Active / Post) ----------
      '<div class="sub-mtab-panel" data-m="common" role="tabpanel" style="display:' + (activeM === 'common' ? 'block' : 'none') + ';">' +

        // ---- Cỡ chữ CHUNG: dùng cho cả 3 trạng thái karaoke + style không karaoke ----
        // Nằm dưới hàng chọn "Cài đặt chung / Cài đặt từng style" và trên 3 tab karaoke (Pre/Active/Post).
        '<div class="g-row k-fs-row"><label style="white-space:nowrap;">Cỡ chữ</label>' +
          '<input type="range" data-k="fs" data-type="fs" min="20" max="300" step="1" value="' + (gs.fontSize != null ? gs.fontSize : 70) + '">' +
          '<input type="number" data-k="fs" data-type="fs" value="' + (gs.fontSize != null ? gs.fontSize : 70) + '" class="num-in" step="1">' +
        '</div>' +

        '<div class="pill-tabs">' +
          '<span class="pill-ind" aria-hidden="true"></span>' +
          '<div class="pill-tab active" data-pill="settings">🥽 Pre</div>' +
          '<div class="pill-tab" data-pill="karaoke">🎵 Active</div>' +
          '<div class="pill-tab" data-pill="advanced">📤 Post</div>' +
        '</div>' +

        '<div class="pill-panel open" data-pill="settings">' +
          renderSubKTab('kPre') +
        '</div>' +
        '<div class="pill-panel" data-pill="karaoke">' +
          renderSubKTab('kActive') +
        '</div>' +
        '<div class="pill-panel" data-pill="advanced">' +
          renderSubKTab('kPost') +
        '</div>' +
      '</div>' +

      // ---------- Panel 2: Style ----------
      '<div class="sub-mtab-panel" data-m="styles" role="tabpanel" style="display:' + (activeM === 'styles' ? 'block' : 'none') + ';">' +
        '<div class="sub-style-headbar">' +
          '<span class="sub-styles-title">🎨 Style <em class="sub-filter-hint">(tự lọc style không có dòng)</em></span>' +
          '<span id="sub-reset-all-styles" title="Reset tất cả style về vị trí/màu gốc">↺ ALL</span>' +
        '</div>' +
        '<div id="sub-style-items"></div>' +
      '</div>' +

      // ---------- Panel 3: Hiệu ứng đặc biệt (Special Effect) ----------
      '<div class="sub-mtab-panel" data-m="effect" role="tabpanel" style="display:' + (activeM === 'effect' ? 'block' : 'none') + ';">' +
        '<div class="sub-style-headbar">' +
          '<span class="sub-styles-title">✨ Hiệu ứng đặc biệt <em class="sub-filter-hint">(áp dụng cho dòng không-karaoke)</em></span>' +
          '<span id="sub-reset-effect" title="Bỏ hiệu ứng (về None)">⟳ None</span>' +
        '</div>' +
        '<div class="g-row" style="margin-top:4px;">' +
          '<label style="white-space:nowrap;width:auto;min-width:52px;">Hiệu ứng</label>' +
          '<select id="g-specialEffect" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18);color:#dbe4ff;font-size:11px;border-radius:7px;padding:5px 6px;min-width:0;">' +
            getEffectOptionsHTML(gs.specialEffect) +
          '</select>' +
        '</div>' +
        '<div class="g-row">' +
          '<label style="white-space:nowrap;">Tốc độ</label>' +
          '<input type="range" id="g-effectSpeed" min="1" max="40" step="1" value="' + getEffectSpeedDisplay(gs) + '">' +
          '<input type="number" id="g-effectSpeedVal" value="' + getEffectSpeedDisplay(gs) + '" class="num-in" step="1" min="1" max="40">' +
        '</div>' +
        '<div class="g-row" id="sine-amp-row" style="display:' + ((gs.specialEffect === 'sine_wave') ? 'flex' : 'none') + ';">' +
          '<label style="white-space:nowrap;">Biên độ</label>' +
          '<input type="range" id="g-sineWaveAmplitude" min="2" max="30" step="1" value="' + (gs.sineWaveAmplitude != null ? gs.sineWaveAmplitude : 2) + '">' +
          '<input type="number" id="g-sineWaveAmplitudeVal" value="' + (gs.sineWaveAmplitude != null ? gs.sineWaveAmplitude : 2) + '" class="num-in" step="1" min="2" max="30">' +
        '</div>' +
        '<div class="sub-effect-hint">Gợi ý: hiệu ứng dùng màu/viền/blur hiện tại; chỉnh ở tab <b>Global</b> hoặc <b>Style</b>.</div>' +
      '</div>';
  }

  // ── Liquid-glass tab indicator:滑动 gradient pill ──
  function moveTabIndicator(bar, btn) {
    if (!bar || !btn) return;
    const ind = bar.querySelector('.sub-mtab-ind, .pill-ind, .nav-ind');
    if (!ind) return;
    ind.style.width = btn.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
  }

  // Render danh sách style + nút điều chỉnh từng style (port engine-css.js renderStyles)
  function renderSubStyleItems() {
    const container = $('#sub-style-items');
    if (!container) return;
    container.innerHTML = '';
    const usedStyles = new Set();
    (State.subtitles || []).forEach((sub) => { if (sub.style) usedStyles.add(sub.style); });
    const priority = (n) => {
      n = String(n).toLowerCase();
      return n.includes('viet') ? 1 : n.includes('roma') ? 2 : n.includes('kanji') ? 3 : 99;
    };
    Object.keys(State.styleSettings || {}).sort((a, b) => priority(a) - priority(b)).forEach((sName) => {
      if (!usedStyles.has(sName)) return;
      const s = State.styleSettings[sName];
      const item = document.createElement('div');
      item.className = 'style-item';
      item.innerHTML = '<div class="style-head">' +
          '<span class="style-name" title="Font: ' + (s.fontName || 'default') + '">' + sName + '</span>' +
          '<div class="style-tools">' +
            '<span class="sub-reset-style" data-style="' + sName + '" title="Reset style này về gốc">⟳</span>' +
            '<span class="sub-eye" data-style="' + sName + '" title="Ẩn / hiện style này">' + (s.visible ? '👁️' : '🚫') + '</span>' +
            '<span class="style-chev">▼</span>' +
          '</div>' +
        '</div>' +
        (s.visible ? '' : '<div class="style-hidden-tag">Đang ẩn</div>') +
        '<div class="sub-style-meta">' +
          '<span>XY:' + (s.posX || 0) + ',' + (s.posY || 0) + '</span>' +
          '<span>1c ' + (s.color1 || '') + '</span>' +
          '<span>2c ' + (s.color2 || '') + '</span>' +
          '<span>3c ' + (s.color3 || '') + '</span>' +
          '<span>Cỡ:' + (s.fontSize || 25) + '</span>' +
          '<span>Viền:' + (s.outlineWidth || 2) + '</span>' +
          '<span>Blur:' + (s.blur != null ? s.blur : 2) + '</span>' +
        '</div>' +
        '<div class="style-body" style="display:none;">' +
          '<div class="pos-row"><span class="pos-lab">X</span>' +
            '<input type="range" data-style="' + sName + '" data-type="posX" min="0" max="' + (State.playResX * 2) + '" value="' + (s.posX || 0) + '">' +
            '<input type="number" value="' + (s.posX || 0) + '" class="num-in" data-style="' + sName + '" data-type="posX">' +
          '</div>' +
          '<div class="pos-row"><span class="pos-lab">Y</span>' +
            '<input type="range" data-style="' + sName + '" data-type="posY" min="0" max="' + (State.playResY * 2) + '" value="' + (s.posY || 0) + '">' +
            '<input type="number" value="' + (s.posY || 0) + '" class="num-in" data-style="' + sName + '" data-type="posY">' +
          '</div>' +
          '<div class="adv-grid">' +
            '<div class="adv-cell"><span class="adv-lab">1C</span><input type="color" data-style="' + sName + '" data-type="color1" value="' + (s.color1 || '#ffffff') + '"></div>' +
            '<div class="adv-cell"><span class="adv-lab">2C</span><input type="color" data-style="' + sName + '" data-type="color2" value="' + (s.color2 || '#ffffff') + '"></div>' +
            '<div class="adv-cell"><span class="adv-lab">3C</span><input type="color" data-style="' + sName + '" data-type="color3" value="' + (s.color3 || '#000000') + '"></div>' +
            '<div class="adv-cell"><span class="adv-lab">S</span><input type="number" data-style="' + sName + '" data-type="fontSize" min="10" max="200" step="1" value="' + (s.fontSize || s.origFontSize || 25) + '"></div>' +
            '<div class="adv-cell"><span class="adv-lab">O</span><input type="number" data-style="' + sName + '" data-type="outlineWidth" min="0" max="30" step="0.5" value="' + (s.outlineWidth || 2) + '"></div>' +
            '<div class="adv-cell"><span class="adv-lab">B</span><input type="number" data-style="' + sName + '" data-type="blur" min="0" max="50" step="0.5" value="' + (s.blur != null ? s.blur : 2) + '"></div>' +
          '</div>' +
        '</div>';
      item.querySelector('.sub-reset-style').onclick = (e) => {
        e.stopPropagation();
        const a = s.origAlign || s.align || 2;
        const mL = (s.origMarginL !== undefined && s.origMarginL !== null) ? s.origMarginL : (s.marginL || 10);
        const mR = (s.origMarginR !== undefined && s.origMarginR !== null) ? s.origMarginR : (s.marginR || 10);
        const mV = (s.origMarginV !== undefined && s.origMarginV !== null) ? s.origMarginV : (s.marginV || 10);
        s.posX = assAnchorX(a, mL, mR, State.playResX);
        s.posY = assAnchorY(a, mV, State.playResY);
        s.posOverridden = false;   // trả về toạ độ tự động theo Alignment + Margin
        s.color1 = s.origColor1 || '#ffffff';
        s.color2 = s.origColor2 || s.color1 || '#ffffff';
        s.color3 = s.origColor3 || '#000000';
        s.fontSize = s.origFontSize || s.fontSize || 25;
        s.outlineWidth = s.origOutlineWidth || s.outlineWidth || 2;
        saveSubSettings();
        renderSubStyleItems();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
      item.querySelector('.sub-eye').onclick = (e) => {
        e.stopPropagation();
        s.visible = !s.visible;
        e.target.innerText = s.visible ? '👁️' : '🚫';
        e.target.style.opacity = s.visible ? 1 : 0.3;
        saveSubSettings();
        renderSubStyleItems();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
      item.querySelector('.style-head').onclick = (e) => {
        if (e.target.classList.contains('sub-eye') || e.target.classList.contains('sub-reset-style')) return;
        const b = item.querySelector('.style-body');
        const chev = item.querySelector('.style-chev');
        const open = b.style.display !== 'block';
        b.style.display = open ? 'block' : 'none';
        if (chev) chev.classList.toggle('open', open);
      };
      container.appendChild(item);
    });
    // Không có style nào khả dụng → hướng dẫn người dùng
    if (!container.children.length) {
      container.innerHTML = '<div class="sub-no-style">Chưa có phụ đề / style nào để điều chỉnh. Hãy phát một bài có file .ass trước.</div>';
    }
  }
function setupSubPopupEvents() {
    const popup = _subPopupEl;
    if (!popup) return;

    // ── Khởi tạo liquid-glass indicator cho các tab bar ──
    const mtabs = popup.querySelector('.sub-mtabs');
    const activeM = popup.querySelector('.sub-mtab.active');
    if (mtabs && activeM) moveTabIndicator(mtabs, activeM);
    const ptabs = popup.querySelector('.pill-tabs');
    const activeP = popup.querySelector('.pill-tab.active');
    if (ptabs && activeP) moveTabIndicator(ptabs, activeP);

    // Panel co dinh kieu chat: khong keo. Dong bang X / Esc / bam ngoai.

    // Dong panel khi bam ben ngoai (dang ky 1 lan de tranh trung lap khi setupSubPopupEvents goi lai)
    if (!window.__subCloseOutBound) {
      window.__subCloseOutBound = true;
      document.addEventListener('mousedown', function __subCloseOutside(e) {
        if (!isSubPanelOpen()) return;
        const btn = $('#subsSettingsBtn');
        if (_subPopupEl.contains(e.target) || (btn && btn.contains(e.target))) return;
        if (!State.subSettings || !State.subSettings.closeOnClickOutside) return;
        hideSubPanel();
      });
    }

    // Dong panel khi bam phim Esc (dang ky 1 lan)
    if (!window.__subEscapeBound) {
      window.__subEscapeBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isSubPanelOpen()) hideSubPanel();
      });
    }

    // ===== 4 tab lớn: All / Global / Style / Effect =====
    popup.querySelectorAll('.sub-mtab').forEach((tab) => {
      tab.onclick = () => {
        const m = tab.dataset.m;
        State._subActiveTab = m;
        if (m === 'common' || m === 'styles') {
          const useCommon = (m === 'common');
          State.subSettings.useGlobalStyles = useCommon;
          Object.keys(State.styleSettings || {}).forEach((name) => {
            State.styleSettings[name].override = !useCommon;
          });
        }
        // Cập nhật active + mode-on cho tất cả tab
        popup.querySelectorAll('.sub-mtab').forEach((x) => {
          x.classList.toggle('active', x === tab);
          // mode-on: luôn highlight 1 trong 2 tab Global/Style
          const isModeTab = (x.dataset.m === 'common' || x.dataset.m === 'styles');
          if (isModeTab) {
            const isGlobalMode = !!State.subSettings.useGlobalStyles;
            x.classList.toggle('mode-on', (x.dataset.m === 'common') === isGlobalMode);
          }
        });
        popup.querySelectorAll('.sub-mtab-panel').forEach((p) => {
          p.style.display = (p.dataset.m === m) ? 'block' : 'none';
        });
        // Cuộn tab vào viewport nếu hẹp + di chuyển indicator
        const bar = popup.querySelector('.sub-mtabs');
        if (bar && tab.scrollIntoView) tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        moveTabIndicator(bar, tab);
        if (m === 'styles') renderSubStyleItems();
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
    });

    // ===== Hiệu ứng đặc biệt (tab Effect) =====
    const effSelect = popup.querySelector('#g-specialEffect');
    const ampRow = popup.querySelector('#sine-amp-row');
    const speedSlider = popup.querySelector('#g-effectSpeed');
    const speedVal = popup.querySelector('#g-effectSpeedVal');
    const ampSlider = popup.querySelector('#g-sineWaveAmplitude');
    const ampVal = popup.querySelector('#g-sineWaveAmplitudeVal');
    const syncEffUI = () => {
      const eff = (State.subSettings && State.subSettings.specialEffect) || 'none';
      if (ampRow) ampRow.style.display = (eff === 'sine_wave') ? 'flex' : 'none';
      const sp = getEffectSpeedDisplay(State.subSettings || {});
      if (speedSlider) speedSlider.value = sp;
      if (speedVal) speedVal.value = sp;
    };
    if (effSelect) {
      effSelect.onchange = () => {
        State.subSettings.specialEffect = effSelect.value;
        if (!State.subSettings.effectSpeed) State.subSettings.effectSpeed = {};
        syncEffUI();
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
    }
    const bindSpeed = () => {
      if (speedSlider) speedSlider.oninput = () => {
        const v = Number(speedSlider.value) || 1;
        if (!State.subSettings.effectSpeed) State.subSettings.effectSpeed = {};
        State.subSettings.effectSpeed[State.subSettings.specialEffect || 'none'] = v;
        if (speedVal) speedVal.value = v;
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
      if (speedVal) speedVal.onchange = () => {
        const v = Number(speedVal.value) || 1;
        if (!State.subSettings.effectSpeed) State.subSettings.effectSpeed = {};
        State.subSettings.effectSpeed[State.subSettings.specialEffect || 'none'] = v;
        if (speedSlider) speedSlider.value = v;
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
    };
    bindSpeed();
    const bindAmp = () => {
      if (ampSlider) ampSlider.oninput = () => {
        const v = Number(ampSlider.value) || 2;
        State.subSettings.sineWaveAmplitude = v;
        if (ampVal) ampVal.value = v;
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
      if (ampVal) ampVal.onchange = () => {
        const v = Number(ampVal.value) || 2;
        State.subSettings.sineWaveAmplitude = v;
        if (ampSlider) ampSlider.value = v;
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
    };
    bindAmp();
    const effReset = popup.querySelector('#sub-reset-effect');
    if (effReset) {
      effReset.onclick = () => {
        State.subSettings.specialEffect = 'none';
        if (!State.subSettings.effectSpeed) State.subSettings.effectSpeed = {};
        syncEffUI();
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
        toast('Đã bỏ hiệu ứng (None).', 'info', 1400);
      };
    }


    // Pill tabs (Pre / Active / Post) — karaoke
    popup.querySelectorAll('.pill-tab').forEach((t) => {
      t.onclick = () => {
        popup.querySelectorAll('.pill-tab').forEach((x) => x.classList.remove('active'));
        popup.querySelectorAll('.pill-panel').forEach((x) => x.classList.remove('open'));
        t.classList.add('active');
        const panel = popup.querySelector('.pill-panel[data-pill="' + t.dataset.pill + '"]');
        if (panel) panel.classList.add('open');
        // liquid glass indicator
        const bar = popup.querySelector('.pill-tabs');
        moveTabIndicator(bar, t);
      };
    });

    // Karaoke Pre/Active/Post tabs
    popup.querySelectorAll('.k-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        popup.querySelectorAll('.k-tab-btn').forEach((x) => x.classList.remove('active'));
        popup.querySelectorAll('.k-tab-content').forEach((x) => x.style.display = 'none');
        btn.classList.add('active');
        const map = { pre: $('#sub-k-pre-panel'), active: $('#sub-k-active-panel'), post: $('#sub-k-post-panel') };
        const t = map[btn.dataset.tab];
        if (t) t.style.display = 'block';
      };
    });

    // Đóng + Reset toàn bộ
    const closeBtn = popup.querySelector('#subPanelClose') || popup.querySelector('#sub-settings-close');
    if (closeBtn) closeBtn.onclick = () => hideSubPanel();
    // Nút Reset (gần ✕ trên header): xoá toàn bộ cài đặt + cache của video/file .ass hiện tại
    const resetCtxBtn = popup.querySelector('#subResetCtx');
    if (resetCtxBtn) resetCtxBtn.onclick = async () => {
      const ok = await inlineConfirm(resetCtxBtn, 'Xoá toàn bộ cài đặt + cache của video này? (không ảnh hưởng video khác)', 'Xoá');
      if (!ok) return;
      const store = readSubStore();
      const ctx = currentSubContext();
      delete store[ctx];
      writeSubStore(store);
      // Về mặc định
      State.subSettings = JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS));
      State.timeShiftMs = 0;
      const tsIn = popup.querySelector('#sub-ts-input');
      if (tsIn) tsIn.value = '0';
      // nạp lại style gốc từ .ass hiện tại
      if (State.subtitles.length && State.rawAssText) {
        try {
          const parsed = parseAssEngine(State.rawAssText);
          State.subtitles = parsed.subtitles;
          State.styleSettings = parsed.styleSettings;
        } catch (_e) { }
      }
      // dựng lại popup với giá trị mới
      rerenderSubPanel();
      showSubPanel();
      renderSubStyleItems();
      if (State.subsEnabled) updateCurrentSubtitle();
      toast('Đã xoá toàn bộ cài đặt video này.', 'info', 1800);
    };
    // Nút 🗑️ ALL (đầu header): xoá TOÀN BỘ config + cache cho TẤT CẢ video
    const resetAllBtn = popup.querySelector('#subResetAll');
    if (resetAllBtn) resetAllBtn.onclick = async () => {
      const ok = await inlineConfirm(resetAllBtn, 'Xoá TOÀN BỘ config + cache của TẤT CẢ video? Hành động này không thể hoàn tác!', 'Xoá tất cả');
      if (!ok) return;
      writeSubStore({});
      // Về mặc định cho video đang phát
      State.subSettings = JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS));
      State.timeShiftMs = 0;
      const tsIn = popup.querySelector('#sub-ts-input');
      if (tsIn) tsIn.value = '0';
      if (State.subtitles.length && State.rawAssText) {
        try {
          const parsed = parseAssEngine(State.rawAssText);
          State.subtitles = parsed.subtitles;
          State.styleSettings = parsed.styleSettings;
        } catch (_e) { }
      }
      rerenderSubPanel();
      showSubPanel();
      renderSubStyleItems();
      if (State.subsEnabled) updateCurrentSubtitle();
      toast('Đã xoá TOÀN BỘ cấu hình của tất cả video.', 'info', 1800);
    };
    const resetBtn = popup.querySelector('#sub-settings-reset');
    if (resetBtn) resetBtn.onclick = () => {
      State.subSettings = JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS));
      State.timeShiftMs = 0;
      const tsIn = popup.querySelector('#sub-ts-input');
      if (tsIn) tsIn.value = '0';
      saveSubSettings();
      // nạp lại style gốc từ .ass hiện tại
      if (State.subtitles.length && State.rawAssText) {
        try {
          const parsed = parseAssEngine(State.rawAssText);
          State.subtitles = parsed.subtitles;
          State.styleSettings = parsed.styleSettings;
        } catch (_e) { }
      }
      // dựng lại popup với giá trị mới
      rerenderSubPanel();
      showSubPanel();
      renderSubStyleItems();
      if (State.subsEnabled) updateCurrentSubtitle();
      toast('Đã reset cài đặt chung (Global).', 'info', 1800);
    };

    // Reset tất cả style về vị trí / màu gốc
    const resetAll = popup.querySelector('#sub-reset-all-styles');
    if (resetAll) {
      resetAll.onclick = () => {
        Object.keys(State.styleSettings || {}).forEach((sName) => {
          const s = State.styleSettings[sName];
          const a = s.origAlign || s.align || 2;
          const mL = (s.origMarginL !== undefined && s.origMarginL !== null) ? s.origMarginL : (s.marginL || 10);
          const mR = (s.origMarginR !== undefined && s.origMarginR !== null) ? s.origMarginR : (s.marginR || 10);
          const mV = (s.origMarginV !== undefined && s.origMarginV !== null) ? s.origMarginV : (s.marginV || 10);
          s.posX = assAnchorX(a, mL, mR, State.playResX);
          s.posY = assAnchorY(a, mV, State.playResY);
          s.posOverridden = false;
          s.color1 = s.origColor1 || '#ffffff';
          s.color2 = s.origColor2 || s.color1 || '#ffffff';
          s.color3 = s.origColor3 || '#000000';
          s.fontSize = s.origFontSize || s.fontSize || 25;
          s.outlineWidth = s.origOutlineWidth || s.outlineWidth || 2;
        });
        saveSubSettings();
        renderSubStyleItems();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
    }
    // Format B/I/U/S
    ['isBold', 'isItalic', 'isUnderline', 'isStrike'].forEach((key) => {
      const btn = popup.querySelector('#sub-btn-' + key);
      if (btn) btn.onclick = () => {
        State.subSettings[key] = !State.subSettings[key];
        btn.classList.toggle('active');
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
    });

    // Reset thanh công cụ chung: cỡ chữ về 100%, bỏ chọn B/I/U/S, font về mặc định
    const gtbReset = popup.querySelector('#sub-gtb-reset');
    if (gtbReset) gtbReset.onclick = () => {
      State.subSettings.fontScale = 100;
      State.subSettings.isBold = false;
      State.subSettings.isItalic = false;
      State.subSettings.isUnderline = false;
      State.subSettings.isStrike = false;
      State.subSettings.fontFamily = SUB_SETTINGS_DEFAULTS.fontFamily;
      // cập nhật giao diện
      const fsR = popup.querySelector('#g-fontScale');
      const fsV = popup.querySelector('#g-fontScaleVal');
      if (fsR) fsR.value = '100';
      if (fsV) fsV.value = '100';
      const fontSel = popup.querySelector('#sub-fontSelect');
      if (fontSel) fontSel.value = State.subSettings.fontFamily;
      ['isBold', 'isItalic', 'isUnderline', 'isStrike'].forEach((key) => {
        const btn = popup.querySelector('#sub-btn-' + key);
        if (btn) btn.classList.remove('active');
      });
      saveSubSettings();
      if (State.subsEnabled) updateCurrentSubtitle();
      toast('Đã reset thanh công cụ phụ đề (font / cỡ chữ / B I U S).', 'info', 1800);
    };

    // Timeshift: −100 / +100 / nhập trực tiếp / đặt lại 0
    const tsInput = popup.querySelector('#sub-ts-input');
    if (tsInput) {
      const setTs = (v) => {
        State.timeShiftMs = v;
        tsInput.value = v;
        if (State.subsEnabled) updateCurrentSubtitle();
      };
      const decBtn = popup.querySelector('#sub-ts-dec');
      if (decBtn) decBtn.onclick = () => setTs((parseInt(tsInput.value, 10) || 0) - 100);
      const incBtn = popup.querySelector('#sub-ts-inc');
      if (incBtn) incBtn.onclick = () => setTs((parseInt(tsInput.value, 10) || 0) + 100);
      const zeroBtn = popup.querySelector('#sub-ts-zero');
      if (zeroBtn) zeroBtn.onclick = () => setTs(0);
      tsInput.addEventListener('change', () => {
        setTs(parseInt(tsInput.value, 10) || 0);
      });
      // Tải file .ass đã shift time về máy với đúng tên "youtubeID_tiêu đề.ass"
      const dlBtn = popup.querySelector('#sub-ts-dl');
      if (dlBtn) dlBtn.onclick = () => {
        const offset = parseInt(tsInput.value, 10) || 0;
        if (!State.rawAssText) {
          toast('Chưa có file .ass nào đang load. Hãy mở một video có phụ đề .ass trước.', 'error', 4000);
          return;
        }
        const shifted = shiftAssTimestamps(State.rawAssText, offset);
        let fname = 'subtitle.ass';
        const s = State.currentSong;
        // Lấy youtube_id + tiêu đề từ tên file .ass (nếu đang phát ass) hoặc từ currentSong
        if (s && s.ass_file && parseAssYoutubeId(s.ass_file)) {
          const yid = parseAssYoutubeId(s.ass_file);
          const title = stripAssTitle(s.ass_file);
          fname = yid + (title ? '_' + sanitizeAssTitle(title) : '') + '.ass';
        } else if (s && s.youtube_id) {
          fname = s.youtube_id + (s.title ? '_' + sanitizeAssTitle(String(s.title)) : '') + '.ass';
        }
        const blob = new Blob([shifted], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
        toast('Đã tải về: ' + fname + (offset ? ' (shift ' + offset + 'ms)' : ''), 'success', 2600);
      };
    }

    // Font select
    const fontSel = popup.querySelector('#sub-fontSelect');
    if (fontSel) {
      fontSel.addEventListener('change', () => {
        if (fontSel.value === 'custom') {
          const pick = prompt('Nhập tên font đã cài trên máy:', State.subSettings.fontFamily);
          if (pick && pick.trim()) {
            fontSel.insertAdjacentHTML('beforeend', '<option value="' + pick.trim() + '">' + pick.trim() + '</option>');
            State.subSettings.fontFamily = pick.trim();
            fontSel.value = pick.trim();
          }
        } else {
          State.subSettings.fontFamily = fontSel.value;
        }
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      });
    }
    // Input chính: global g-*, karaoke data-k, per-style data-style
    popup.addEventListener('input', (e) => {
      const t = e.target;
      const id = t.id, style = t.getAttribute('data-style'), type = t.getAttribute('data-type'), kTab = t.getAttribute('data-k');
      const val = t.type === 'checkbox' ? t.checked : t.value;
      if (kTab) {
        if (kTab === 'fs') {
          // Cỡ chữ CHUNG: dùng cho cả 3 tab karaoke + style không karaoke
          State.subSettings.fontSize = (t.type === 'number' || t.type === 'range') ? parseFloat(val) : val;
          const row = t.closest('.g-row');
          if (row) {
            const pair = row.querySelector('input[data-k="fs"][data-type="fs"][type="' + (t.type === 'range' ? 'number' : 'range') + '"]');
            if (pair) pair.value = val;
          }
        } else {
        if (!State.subSettings[kTab]) State.subSettings[kTab] = Object.assign({}, SUB_SETTINGS_DEFAULTS[kTab]);
        let stored = val;
        if (type === 'zoom') {
          // Ô zoom hiển thị theo % nhưng engine lưu dạng tỷ lệ (1.0 / 1.1 ...)
          stored = (parseFloat(val) || 0) / 100;
        } else if (t.type === 'number' || t.type === 'range') {
          stored = parseFloat(val);
        }
        State.subSettings[kTab][type] = stored;
        const row = t.closest('.g-row');
        if (row) {
          const pair = row.querySelector('input[data-k="' + kTab + '"][data-type="' + type + '"][type="' + (t.type === 'range' ? 'number' : 'range') + '"]');
          if (pair) pair.value = val;
        }
        }
      } else if (style) {
        const s = State.styleSettings[style];
        if (!s) return;
        // Trong "Cài đặt từng style", mọi thay đổi đều là per-style override trực tiếp
        s[type] = (t.type === 'number' || t.type === 'range') ? parseFloat(val) : val;
        // Người dùng chủ động kéo X/Y → tạm ngừng dùng toạ độ tự động theo Margin/Alignment
        // để không bị renderer ghi đè mỗi lần vẽ (renderAssCue vẫn hoạt động trong tab "Chung").
        if (type === 'posX' || type === 'posY') s.posOverridden = true;
        const row = t.closest('.g-row, .pos-row');
        if (row) {
          const sibling = row.querySelector('input[data-type="' + type + '"][type="' + (t.type === 'range' ? 'number' : 'range') + '"]');
          if (sibling) sibling.value = val;
        }
      } else if (id) {
        let key = id.replace('g-', '').replace('Val', '');
        if (key === 'textZoom') {
          State.subSettings.textZoom = parseFloat(val) / 100;
        } else if (key === 'color1' || key === 'color3' || key === 'boxColor' || key === 'fontFamily') {
          State.subSettings[key] = val;
        } else if (t.type === 'checkbox') {
          State.subSettings[key] = t.checked;
        } else {
          State.subSettings[key] = parseFloat(val);
        }
        const pair = document.getElementById(id.includes('Val') ? id.replace('Val', '') : id + 'Val');
        if (pair && pair.id !== id) pair.value = val;
      }
      saveSubSettings();
      if (State.subsEnabled) updateCurrentSubtitle();
    });

    // Close on click outside checkbox
    const clo = popup.querySelector('#sub-close-outside');
    if (clo) {
      clo.addEventListener('change', () => {
        State.subSettings.closeOnClickOutside = clo.checked;
        saveSubSettings();
      });
    }
    // ── Backup GỘP: settings + cache → 1 file JSON ──
    const bkpBtn = popup.querySelector('#sub-backup');
    if (bkpBtn) {
      bkpBtn.addEventListener('click', () => {
        try {
          const store = readSubStore();
          const cache = readAssCache();
          const data = JSON.stringify({
            app: 'kullanime',
            type: 'full-backup',
            exported: new Date().toISOString(),
            store: store,
            cache: cache
          }, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'kullanime-backup.json';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
          toast('Đã xuất backup (settings + ' + Object.keys(cache).length + ' cached ASS) ✅', 'success', 2600);
        } catch (_e) { toast('Không thể tạo file backup.', 'error'); }
      });
    }
    // ── Restore GỘP: settings + cache từ 1 file JSON ──
    const rstBtn = popup.querySelector('#sub-restore');
    if (rstBtn) {
      rstBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            const newStore = (data && data.store && typeof data.store === 'object') ? data.store : null;
            const newCache = (data && data.cache && typeof data.cache === 'object') ? data.cache : null;
            if (!newStore && !newCache) throw new Error('File backup trống');

            let msg = 'Đã khôi phục ✅';
            // Restore settings
            if (newStore && Object.keys(newStore).length > 0) {
              writeSubStore(newStore);
              State.subSettings = loadSubSettings();
              activateSubContext();
              rerenderSubPanel();
              showSubPanel();
              renderSubStyleItems();
              updateSubsToggleUI();
              if (State.subsEnabled) updateCurrentSubtitle();
              msg = 'Settings đã khôi phục';
            }
            // Restore cache (hợp nhất)
            if (newCache && Object.keys(newCache).length > 0) {
              const existing = readAssCache();
              Object.assign(existing, newCache);
              writeAssCache(existing);
              mergeAssCacheIntoSubs();
              renderAssCacheList();
              renderAssStatus();
              msg += ' + Cache: ' + Object.keys(existing).length + ' file';
            }
            toast(msg + ' ✅', 'success', 2600);
          } catch (err) {
            toast('File backup không hợp lệ: ' + (err.message || 'lỗi'), 'error', 4000);
          }
        };
        input.click();
      });
    }
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

    // Meta: ★ điểm cộng đồng (AniDB) | nút điểm của tôi (bấm để mở popup chấm ♥; hiển thị trái tim trước, số sau) | tổng số tập đã phát hành
    const metaRight =
      '<span class="card-meta-right">' +
        '<button type="button" class="card-heart-btn" data-heart-menu="1" title="Điểm của tôi — bấm để chấm ♥">♥' + (myRating > 0 ? ' ' + myRating : '') + '</button>' +
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
    const count = $('#songCount');
    if (!list || !empty || !count) return; // Danh sách phát đã bị gỡ khỏi giao diện
    count.textContent = State.songs.length + ' bài';
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
  const songListEl = $('#songList');
  if (songListEl) {
    songListEl.addEventListener('click', (e) => {
      const item = e.target.closest('.song-item');
      if (!item) return;
      const song = State.songs.find((s) => s.id === item.dataset.id);
      if (song) playSong(song);
    });
  }


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

    // Làm sạch synopsis: chuyển <br> thành xuống dòng, gộp dòng trống liên tiếp, cắt khoảng trắng 2 đầu để căn đều mượt hơn
    const synopsis =
      String(a.synopsis || '')
        .replace(/<br\s*\/?>/gi, '\n')
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
    const author = c.author_name || 'Ẩn danh';
    let actions =
      '<div class="comment-actions">' +
        '<button class="comment-action-btn" data-quote-src="' + esc(c.content) + '" data-quote-author="' + esc(author) + '" title="Trả lời bằng trích dẫn">❝ Trả lời</button>';
    if (State.isAdmin) {
      actions +=
          '<button class="comment-action-btn" data-act="pin" data-id="' + esc(c.id) + '" title="' + (isPinned ? 'Bỏ ghim' : 'Ghim') + '">' + (isPinned ? '📌 Ghim' : '📍 Ghim') + '</button>' +
          '<button class="comment-action-btn danger" data-act="del" data-id="' + esc(c.id) + '" title="Xóa">🗑</button>';
    }
    actions += '</div>';
    // Nội dung dài > 400 ký tự → thu gọn + nút xem thêm / thu gọn lại
    const bodyHtml = renderRichText(c.content);
    const bodyInner = '<div class="comment-body long-text-body">' + bodyHtml + '</div>';
    const body = String(c.content || '').length > 400
      ? '<div class="long-text" data-expanded="false">' + bodyInner + '<button type="button" class="long-text-toggle">Xem thêm ▾</button></div>'
      : bodyInner;
    return (
      '<div class="comment-item' + (isPinned ? ' pinned' : '') + '" data-id="' + esc(c.id) + '">' +
        '<div class="comment-head">' +
          '<span class="comment-author">' + esc(author) + '</span>' +
          (isPinned ? '<span class="pin-badge">📌 Đã ghim</span>' : '') +
          '<span class="comment-time">' + timeAgo(c.created_at) + '</span>' +
          actions +
        '</div>' +
        body +
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
        ? 'Mở Chat All (' + comments.length + ' tin)'
        : 'Mở Chat All');
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
      // Discord style: tin mới nhất ở dưới cùng, tin cũ hơn ở phía trên
      list.innerHTML = visible.slice().reverse().map((c) => chatHTML(c, map)).join('');
    }
    updateLoadMore('#chatLoadMoreWrap', comments.length - State.chatVisible);
  }

  // Cuộn vùng tin chat xuống dưới cùng (hiển thị tin mới nhất)
  function scrollChatToBottom() {
    const wrap = $('#chatMessages') || $('#chatDockBody');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  // Bỏ [quote]...[/quote] cũ trong nội dung (tránh quote lồng nhau hỏng cấu trúc)
  function stripQuotes(src) {
    return String(src || '').replace(/\[quote\][\s\S]*?\[\/quote\]/gi, '').trim();
  }

  // Nút "❝ Trả lời" trong Chat All: chèn trích dẫn vào đầu ô nhập chat
  function quoteIntoChat(author, src) {
    const box = $('#chatBox');
    if (!box) return;
    const quote = '[quote]' + (author ? author + ':\n' : '') + stripQuotes(src) + '[/quote]\n\n';
    box.value = quote + box.value;
    box.focus();
  }

  // Nút "❝ Trả lời" trong bình luận anime: chèn trích dẫn vào đầu ô nhập bình luận
  function quoteIntoComment(author, src) {
    const box = $('#commentBox');
    if (!box) return;
    const quote = '[quote]' + (author ? author + ':\n' : '') + stripQuotes(src) + '[/quote]\n\n';
    box.value = quote + box.value;
    box.focus();
  }

  // Bật/tắt "Xem thêm / Thu gọn" cho bình luận & tin nhắn dài
  function toggleLongText(btn) {
    const wrap = btn.closest('.long-text');
    if (!wrap) return;
    const expanded = wrap.getAttribute('data-expanded') === 'true';
    wrap.setAttribute('data-expanded', expanded ? 'false' : 'true');
    btn.textContent = expanded ? 'Xem thêm ▾' : 'Thu gọn ▴';
  }

  // Render 1 tin chat chung dạng bong bóng; nếu có anime_id → thêm nhãn phim
  function chatHTML(c, animeMap) {
    const anime = animeMap[String(c.anime_id)] || null;
    const isPinned = !!c.is_pinned;
    const author = c.author_name || 'Ẩn danh';
    // Bong bóng của mình (trùng tên đang nhập ở ô chat) sẽ căn phải
    const ownAuthor = ($('#chatAuthor') && $('#chatAuthor').value.trim().toLowerCase()) || '';
    const isOwn = !!ownAuthor && String(author).trim().toLowerCase() === ownAuthor;
    let actions =
      '<div class="comment-actions">' +
        '<button class="comment-action-btn" data-quote-src="' + esc(c.content) + '" data-quote-author="' + esc(author) + '" title="Trả lời bằng trích dẫn">❝ Trả lời</button>';
    if (State.isAdmin) {
      actions +=
          '<button class="comment-action-btn" data-cact2="pin" data-id="' + esc(c.id) + '" title="' + (isPinned ? 'Bỏ ghim' : 'Ghim') + '">' + (isPinned ? '📌 Ghim' : '📍 Ghim') + '</button>' +
          '<button class="comment-action-btn danger" data-cact2="del" data-id="' + esc(c.id) + '" title="Xóa">🗑</button>';
    }
    actions += '</div>';
    const tag = anime
      ? '<a href="#" class="chat-anime-tag" data-anime-id="' + esc(anime.id) + '" title="Mở chi tiết ' + esc(anime.title) + '">🎬 ' + esc(anime.title) + '</a>'
      : '<span class="chat-anime-tag chat-general">💬 Chat All</span>';
    // Nội dung dài > 400 ký tự → thu gọn + nút xem thêm / thu gọn lại
    const bodyHtml = renderRichText(c.content);
    const bodyInner = '<div class="comment-body chat-bubble-body long-text-body">' + bodyHtml + '</div>';
    const body = String(c.content || '').length > 400
      ? '<div class="long-text" data-expanded="false">' + bodyInner + '<button type="button" class="long-text-toggle">Xem thêm ▾</button></div>'
      : bodyInner;
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
          body +
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
    const safeContent = filterBadWords(content).slice(0, 3000);
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
    const safeContent = filterBadWords(content).slice(0, 3000);
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
    scrollChatToBottom();
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
    // Lọc theo từ khoá tìm kiếm
    const q = ($('#adminAnimeSearch') ? $('#adminAnimeSearch').value : '').trim().toLowerCase();
    let items = q ? State.animes.filter((a) => (a.title || '').toLowerCase().includes(q)) : State.animes.slice();
    // Sắp xếp
    const sortVal = $('#adminAnimeSort') ? $('#adminAnimeSort').value : 'newest';
    items.sort((a, b) => {
      if (sortVal === 'oldest') return (a.year || 0) - (b.year || 0) || String(a.title || '').localeCompare(String(b.title || ''));
      if (sortVal === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
      // newest
      return (b.year || 0) - (a.year || 0) || String(b.title || '').localeCompare(String(a.title || ''));
    });
    if (items.length === 0) {
      list.innerHTML = '<p class="empty-desc">Không có anime khớp.</p>';
      return;
    }
    list.innerHTML = items.map((a) =>
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
    // Lần đầu hoặc gọi lại sau CRUD → nạp lại data
    if (!State._adminCommentsCache) {
      const { data, error } = await State.supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) { list.innerHTML = '<p class="empty-desc">Lỗi tải bình luận.</p>'; return; }
      State._adminCommentsCache = data || [];
    }
    let items = State._adminCommentsCache;
    if (items.length === 0) {
      list.innerHTML = '<p class="empty-desc">Không có bình luận nào.</p>';
      return;
    }
    // Lọc theo từ khoá
    const q = ($('#adminCommentSearch') ? $('#adminCommentSearch').value : '').trim().toLowerCase();
    if (q) {
      items = items.filter((c) => {
        const animeName = c.anime_id == null ? '' : ((State.animes.find((a) => a.id === c.anime_id) || {}).title || '');
        return (c.author_name || '').toLowerCase().includes(q)
          || (c.content || '').toLowerCase().includes(q)
          || animeName.toLowerCase().includes(q);
      });
    }
    // Sắp xếp
    const sortVal = $('#adminCommentSort') ? $('#adminCommentSort').value : 'newest';
    items = items.slice().sort((a, b) => {
      if (sortVal === 'oldest') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      if (sortVal === 'title') return String(a.author_name || '').localeCompare(String(b.author_name || ''), 'vi');
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    if (items.length === 0) {
      list.innerHTML = '<p class="empty-desc">Không có bình luận khớp.</p>';
      return;
    }
    list.innerHTML = items.map((c) => {
      const animeName = c.anime_id == null
        ? '💬 Chat All'
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
    State._adminCommentsCache = null; // xoá cache để nạp lại sau CRUD
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
    const mainNav = $('.main-nav');
    // inject liquid-glass indicator cho Anime/Song nếu chưa có
    if (mainNav && !mainNav.querySelector('.nav-ind')) {
      const ind = document.createElement('span');
      ind.className = 'nav-ind';
      ind.setAttribute('aria-hidden', 'true');
      mainNav.insertBefore(ind, mainNav.firstChild);
    }
    mainNav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) switchTab(btn.dataset.tab);
    });

    // Mở modal anime khi click card + nút trạng thái nhanh (admin)
    $('#animeGrid').addEventListener('click', (e) => {
      const card = e.target.closest('.anime-card');
      if (!card || !card.dataset.id) return;

      // Nút điểm ♥ ở meta: bấm để mở popup chấm điểm ♥ (menu 10 tim, không mở modal)
      const hBtn = e.target.closest('.card-heart-btn');
      if (hBtn) {
        e.__popOpened = true;
        openHeartPop(hBtn, card.dataset.id);
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

    // Danh sách file .ass: tìm kiếm + click để phát theo YouTube ID
    const assSearch = $('#assSearch');
    if (assSearch) assSearch.addEventListener('input', (e) => {
      State.assQuery = e.target.value;
      renderAssStatus();
    });
    const assList = $('#assFileList');
    if (assList) {
      assList.addEventListener('click', (e) => {
        const item = e.target.closest('.ass-file-item[data-ass]');
        if (!item) return;
        const file = State.subsFiles.find((f) => f.name === item.dataset.ass);
        if (file) playAssSub(file);
      });
      assList.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('.ass-file-item[data-ass]');
        if (!item) return;
        e.preventDefault();
        const file = State.subsFiles.find((f) => f.name === item.dataset.ass);
        if (file) playAssSub(file);
      });
    }

    // Bật/tắt phụ đề .ass
    const subsToggle = $('#subsToggle');
    if (subsToggle) {
      subsToggle.addEventListener('click', () => {
        if (State.subtitles.length === 0) return;
        State.subsEnabled = !State.subsEnabled;
        if (State.subsEnabled) startSubtitleTicker();
        else stopSubtitleTicker();
        updateSubsToggleUI();
      });
    }

    // SUB ⚙️ — mở popup cài đặt phụ đề
    const subsSettingsBtn = $('#subsSettingsBtn');
    if (subsSettingsBtn) {
      subsSettingsBtn.addEventListener('click', () => {
        toggleSubPopup();
      });
    }

    // Nút phóng to video full màn hình + cập nhật icon khi vào/thoát fullscreen
    const videoFsBtn = $('#videoFullscreenBtn');
    if (videoFsBtn) {
      videoFsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVideoFullscreen();
      });
    }
    document.addEventListener('fullscreenchange', updateVideoFsIcon);
    document.addEventListener('webkitfullscreenchange', updateVideoFsIcon); // Safari
    // Nút fullscreen: tự ẩn khi nhàn rỗi (cả trong/ngoài fullscreen) + hiện khi chạm/rê gần mép trên
    initVideoFsAutohide();

    // Điều khiển player: lùi / phát-tạm dừng / kế tiếp / tự động / ngẫu nhiên
    const pcPrev = $('#pcPrev');
    if (pcPrev) pcPrev.addEventListener('click', playPrevSong);
    const pcPlay = $('#pcPlay');
    if (pcPlay) pcPlay.addEventListener('click', togglePlay);
    const pcNext = $('#pcNext');
    if (pcNext) pcNext.addEventListener('click', playNextSong);
    const pcAutoRepeat = $('#pcAutoRepeat');
    if (pcAutoRepeat) pcAutoRepeat.addEventListener('click', () => {
      // Chu kỳ 3 trạng thái: Tắt → Chỉ lặp 1 → Chỉ tự động chuyển → Tắt
      if (State.repeat) { State.repeat = false; State.autoNext = true; }        // lặp 1 → tự động
      else if (State.autoNext) { State.autoNext = false; }                      // tự động → tắt
      else { State.repeat = true; State.autoNext = false; }                     // tắt → lặp 1
      savePlayerPrefs(); updatePlayerControlsUI();
    });
    const pcShuffle = $('#pcShuffle');
    if (pcShuffle) pcShuffle.addEventListener('click', () => { State.shuffle = !State.shuffle; savePlayerPrefs(); updatePlayerControlsUI(); });

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
        scrollChatToBottom();
        // KHÔNG tự focus ô nhập → tránh bàn phím ảo tự bật trên điện thoại
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
      // Nút trả lời bằng trích dẫn (ai cũng dùng được, kể cả chưa đăng nhập)
      const q = e.target.closest('[data-quote-src]');
      if (q) {
        e.preventDefault();
        quoteIntoChat(q.dataset.quoteAuthor, q.dataset.quoteSrc);
        return;
      }
      // Nút xem thêm / thu gọn bình luận dài
      const tg = e.target.closest('.long-text-toggle');
      if (tg) { toggleLongText(tg); return; }
      // Admin actions trong chat
      const btn = e.target.closest('[data-cact2]');
      if (btn) handleChatAdminAction(btn.dataset.cact2, btn.dataset.id);
    });

    // Bấm bên ngoài khung chat → ẩn khung chat (nội dung đang nhập vẫn giữ lại)
    document.addEventListener('click', (e) => {
      if (!State.chatExpanded) return;
      if (e.target.closest('#chatDock') || e.target.closest('#chatFab')) return;
      if (State.chatExpanded) toggleChatPanel();
    });

    // Admin: mở panel
    $('#adminBtn').addEventListener('click', () => {
      openModal('adminModal');
      renderAdminAnimeList();
      renderAdminSongList();
      State._adminCommentsCache = null; // nạp lại danh sách bình luận
      renderAdminCommentList();
      renderAssRepoList();
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

    // ── ASS Cache: upload file ──
    const assCacheFile = $('#assCacheFile');
    if (assCacheFile) {
      assCacheFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) addAssFileToCache(file);
        e.target.value = ''; // reset để chọn lại cùng 1 file cũng được
      });
    }
    // ── ASS Cache: autocomplete dropdown cho ô search file ──
    const cacheSearchInput = $('#assCacheSearch');
    const cacheDropdown = $('#assCacheDropdown');
    let acActiveIdx = -1;
    function getCacheAndRepoFiles() {
      const cache = readAssCache();
      const repoFiles = (State.subsFiles || []).map(f => f.name);
      const all = Object.keys(cache);
      // merge: cache first, then repo-only files
      repoFiles.forEach(n => { if (!all.includes(n)) all.push(n); });
      return { all, cache, repoFiles };
    }
    function renderDropdown(q) {
      if (!cacheDropdown) return;
      const { all, cache } = getCacheAndRepoFiles();
      const ql = (q || '').trim().toLowerCase();
      let items = ql ? all.filter(n => n.toLowerCase().includes(ql)) : all.slice(0, 30);
      acActiveIdx = -1;
      if (!items.length) { cacheDropdown.classList.add('hidden'); return; }
      cacheDropdown.innerHTML = items.map((name, i) => {
        const inCache = !!cache[name];
        let label = esc(name);
        if (ql) {
          const re = new RegExp('(' + ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
          label = esc(name).replace(re, '<span class="ac-match">$1</span>');
        }
        const src = inCache ? '<span class="ac-label">💾cache</span>' : '<span class="ac-label">📂repo</span>';
        return '<div class="ac-item" data-ac-name="' + esc(name) + '" title="' + esc(name) + '">' + label + src + '</div>';
      }).join('');
      cacheDropdown.classList.remove('hidden');
    }
    function selectAcItem(name) {
      if (cacheSearchInput) cacheSearchInput.value = name;
      if (cacheDropdown) cacheDropdown.classList.add('hidden');
    }
    function acNav(dir) {
      if (!cacheDropdown) return;
      const items = $$('.ac-item', cacheDropdown);
      if (!items.length) return;
      items.forEach(el => el.classList.remove('ac-active'));
      acActiveIdx = Math.max(-1, Math.min(items.length - 1, acActiveIdx + dir));
      if (acActiveIdx >= 0) {
        items[acActiveIdx].classList.add('ac-active');
        items[acActiveIdx].scrollIntoView({ block: 'nearest' });
        selectAcItem(items[acActiveIdx].dataset.acName);
      }
    }
    if (cacheSearchInput && cacheDropdown) {
      cacheSearchInput.addEventListener('input', () => {
        renderDropdown(cacheSearchInput.value);
        renderAssCacheList(cacheSearchInput.value);
      });
      cacheSearchInput.addEventListener('focus', () => renderDropdown(cacheSearchInput.value));
      cacheSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); acNav(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); acNav(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); acNav(1); }
        else if (e.key === 'Escape') { cacheDropdown.classList.add('hidden'); }
      });
      cacheDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.ac-item');
        if (item) selectAcItem(item.dataset.acName);
      });
      // Đóng dropdown khi click ra ngoài
      document.addEventListener('mousedown', (e) => {
        if (!cacheSearchInput.contains(e.target) && !cacheDropdown.contains(e.target)) {
          cacheDropdown.classList.add('hidden');
        }
      });
    }
    // ── ASS Cache: nút ▶ Apply → fetch metadata rồi phát video + load sub ──
    const assCacheApplyBtn = $('#assCacheApply');
    if (assCacheApplyBtn) {
      assCacheApplyBtn.addEventListener('click', async () => {
        const ytInput = $('#assCacheYt');
        const searchInput = $('#assCacheSearch');
        const ytRaw = (ytInput && ytInput.value) ? ytInput.value.trim() : '';
        const searchRaw = (searchInput && searchInput.value) ? searchInput.value.trim() : '';
        if (!ytRaw && !searchRaw) { toast('Paste link YouTube hoặc tìm file sub trước!', 'error', 2000); return; }
        const idEl = $('#assCacheId');
        const titleEl = $('#assCacheTitle');

        // ── Nếu có link YouTube → fetch metadata + phát video ──
        if (ytRaw) {
          const yid = parseYoutubeId(ytRaw);
          if (yid) {
            if (idEl) idEl.value = yid;
            assCacheApplyBtn.textContent = '⏳';
            try {
              const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + yid));
              const d = await r.json();
              if (d && d.title) {
                if (titleEl) titleEl.value = d.title;
              }
            } catch (err) {
              toast('Lỗi fetch metadata: ' + (err.message || ''), 'error', 3000);
            }
            // Phát video YouTube
            if (State.ytPlayer && typeof State.ytPlayer.loadVideoById === 'function') {
              State.ytPlayer.loadVideoById(yid);
              toast('▶ Đang phát video: ' + yid, 'success', 2000);
            }
            assCacheApplyBtn.textContent = '▶';
          }
        }

        // ── Load sub: ưu tiên file vừa chọn trong search, nếu không thì upload file ──
        const subName = searchRaw;
        if (subName) {
          const cache = readAssCache();
          const { repoFiles } = getCacheAndRepoFiles();
          if (cache[subName]) {
            playCachedAss(subName);
          } else if (repoFiles.includes(subName)) {
            const repoFile = (State.subsFiles || []).find(f => f.name === subName);
            if (repoFile) playAssSub(repoFile);
          } else {
            toast('Không tìm thấy file "' + subName + '" trong cache/kho.', 'error', 2000);
          }
        }
      });
    }
    // ── ASS Cache: click danh sách (play / download / delete) ──
    const assCacheList = $('#assCacheList');
    if (assCacheList) {
      assCacheList.addEventListener('click', (e) => {
        const row = e.target.closest('.ass-cache-row[data-cache-ass]');
        if (!row) return;
        const name = row.dataset.cacheAss;
        // File có thể đến từ cache máy hoặc từ kho GitHub (kết quả search)
        const isCached = !!readAssCache()[name];
        const actBtn = e.target.closest('[data-cact]');
        if (actBtn) {
          const act = actBtn.dataset.cact;
          if (act === 'play') {
            if (isCached) playCachedAss(name);
            else {
              const repoFile = (State.subsFiles || []).find((f) => f.name === name);
              if (repoFile) playAssSub(repoFile);
            }
          } else if (act === 'del') deleteAssCache(name);
        } else if (e.target.closest('.cc-dl')) {
          downloadCachedAss(name);
        } else {
          if (isCached) playCachedAss(name);
          else {
            const repoFile = (State.subsFiles || []).find((f) => f.name === name);
            if (repoFile) playAssSub(repoFile);
          }
        }
      });
    }

    // ── Admin: tìm kiếm + sắp xếp Anime ──
    const adminAnimeSearch = $('#adminAnimeSearch');
    if (adminAnimeSearch) {
      adminAnimeSearch.addEventListener('input', () => renderAdminAnimeList());
    }
    const adminAnimeSort = $('#adminAnimeSort');
    if (adminAnimeSort) {
      adminAnimeSort.addEventListener('change', () => renderAdminAnimeList());
    }
    // ── Admin: tìm kiếm + sắp xếp Comments ──
    const adminCommentSearch = $('#adminCommentSearch');
    if (adminCommentSearch) {
      adminCommentSearch.addEventListener('input', () => renderAdminCommentList());
    }
    const adminCommentSort = $('#adminCommentSort');
    if (adminCommentSort) {
      adminCommentSort.addEventListener('change', () => renderAdminCommentList());
    }

    // ── Admin: quản lý repo phụ đề (thêm / xóa) ──
    const addAssRepoBtn = $('#addAssRepoBtn');
    if (addAssRepoBtn) {
      addAssRepoBtn.addEventListener('click', () => {
        const input = $('#assRepoInput');
        if (!input) return;
        const url = input.value.trim();
        if (!url) { toast('Nhập link repo trước.', 'error'); return; }
        if (!/github\.com\/[^/]+\/[^/]+/i.test(url)) {
          toast('Link phải dạng https://github.com/user/repo', 'error', 3200);
          return;
        }
        const repos = readAssRepos();
        // Kiểm tra trùng
        const exists = repos.some((r) => {
          const u = typeof r === 'string' ? r : (r.url || '');
          return u.replace(/\/+$/, '') === url.replace(/\/+$/, '');
        });
        if (exists) { toast('Repo này đã được thêm rồi.', 'error'); return; }
        repos.push(url);
        writeAssRepos(repos);
        input.value = '';
        renderAssRepoList();
        toast('Đã thêm repo ✅', 'success');
      });
    }
    const assRepoList = $('#assRepoList');
    if (assRepoList) {
      assRepoList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-rp="del"]');
        if (!btn) return;
        const idx = parseInt(btn.dataset.idx, 10);
        if (isNaN(idx)) return;
        if (!confirm('Xóa repo phụ đề này?')) return;
        const repos = readAssRepos();
        repos.splice(idx, 1);
        writeAssRepos(repos);
        renderAssRepoList();
        toast('Đã xóa repo.', 'success');
      });
    }


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
      // Nút trả lời bằng trích dẫn (ai cũng dùng được, kể cả chưa đăng nhập)
      const q = e.target.closest('[data-quote-src]');
      if (q) {
        e.preventDefault();
        quoteIntoComment(q.dataset.quoteAuthor, q.dataset.quoteSrc);
        return;
      }
      // Nút xem thêm / thu gọn bình luận dài
      const tg = e.target.closest('.long-text-toggle');
      if (tg) { toggleLongText(tg); return; }
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
     20. SWITCH TAB (Anime / Music / Chat All)
     ────────────────────────────────────────────────────── */
  // Tải chat 1 lần khi mở web — không tự làm mới định kỳ (chỉ làm mới khi tải lại trang)
  function refreshChat() {
    loadGlobalChat();
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
    // Nút SUB bong bóng cài đặt phụ đề: chỉ hiện khi ở tab Song (music)
    document.body.classList.toggle('is-song', tabName === 'music');
    // Đóng popup cài đặt phụ đề nếu đang mở khi rời tab Song
    if (tabName !== 'music') {
      const sp = _subPopupEl;
      const fab = $('#subsSettingsBtn');
      if (sp && isSubPanelOpen()) {
        hideSubPanel();
        if (fab) fab.setAttribute('aria-expanded', 'false');
      }
      // Thoát fullscreen video nếu đang bật
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    }
    // Đổi brand theo tab: KullAnime hoặc KullSong
    const brand = $('#brandName');
    if (brand) {
      brand.innerHTML = tabName === 'anime' ? 'Kull<em>Anime</em>' : 'Kull<em>Song</em>';
    }
    // Di chuyển liquid-glass indicator theo tab đang mở
    const nav = $('.main-nav');
    const activeBtn = nav && nav.querySelector('.nav-tab[data-tab="' + tabName + '"]');
    moveTabIndicator(nav, activeBtn);
    // Lưu tab đang mở vào localStorage
    try { localStorage.setItem('kullanime_lastTab', tabName); } catch (_e) {}
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
    ensureSubSettings(); // nạp cài đặt phụ đề toàn cục từ localStorage
    loadPlayerPrefs();   // nạp tùy chọn tự động / ngẫu nhiên từ localStorage
    bindEvents();
    updatePlayerControlsUI();
    // Khôi phục tab đang active từ cache (mặc định anime)
    let lastTab = 'anime';
    try { lastTab = localStorage.getItem('kullanime_lastTab') || 'anime'; } catch (_e) {}
    switchTab(lastTab);
    // Tải dữ liệu công khai
    await Promise.all([loadAnimes(), loadSongs()]);
    fetchSubsFiles();
    updateLoginUI();
    refreshAuthState();
    // Khởi động chat chung (sticky bar) + captcha chat
    newChatCaptcha();
    refreshChat();
    // Dữ liệu công khai chỉ tải 1 lần khi mở web — không tự làm mới định kỳ
    // (tránh "chớp" lại giao diện khi trang mở lâu). Làm mới khi tải lại trang.
  }

  // Bắt đầu khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


