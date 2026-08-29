/* ============================================================
   app.js — Toàn bộ logic KullAnime (Vanilla JS, ES6+ modular)
   ------------------------------------------------------------
   Gồm: Supabase Client, Cloudinary Upload, YouTube Player,
   Auto-fetch GitHub .ass, Jikan API Auto-fill, Rich Text Parser
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
    adminEmail: '',
    youtubeReady: false,
    ytPlayer: null,
    // Rate limit comment
    lastCommentAt: 0,
    // Captcha hiện tại
    captcha: { a: 0, b: 0, result: 0 },
    // Jikan
    jikanAbort: null
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

  // Sanitize XSS bằng DOMPurify. KHÔNG BAO GIỜ render HTML chưa qua đây.
  function renderRichText(raw) {
    const md = bbcodeToMarkdown(raw || '');
    let html;
    try {
      html = marked.parse(md, { breaks: true, gfm: true });
    } catch (_e) {
      html = esc(md);
    }
    // DOMPurify triệt hạ 100% script/event handler/iframe độc hại
    const clean = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'script'],
      FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
      ADD_ATTR: ['target', 'rel', 'class']
    });
    return clean;
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
    State.isAdmin = !!(session && session.user);
    State.adminEmail = session ? session.user.email : '';
    updateLoginUI();
    if (session) {
      const { data: uData, error: uErr } = await State.supabase.auth.getUser();
      if (!uErr && uData && uData.user) {
        const meta = uData.user.app_metadata || {};
        if (meta.is_admin === 'true' || meta.is_admin === true) {
          State.isAdmin = true;
        } else {
          State.isAdmin = false;
        }
        updateLoginUI();
      }
    }
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

    let list = State.animes.slice();

    // Lọc trạng thái
    if (status !== 'all') {
      list = list.filter((a) => String(a.status || '').toLowerCase() === String(status).toLowerCase());
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
      return;
    }
    empty.classList.add('hidden');
    grid.innerHTML = list.map((a) => animeCardHTML(a)).join('');
  }

  function animeCardHTML(a) {
    const rating = Number(a.rating) || 0;
    const eps = (a.watched_episodes || 0) + ' / ' + (a.total_episodes || '?') + ' tập';
    const img = a.poster_url
      ? '<img src="' + esc(a.poster_url) + '" alt="' + esc(a.title) + '" loading="lazy" onerror="this.outerHTML=`' + posterFallback(a) + '`" />'
      : posterFallback(a);
    return (
      '<article class="anime-card" data-id="' + esc(a.id) + '" role="button" tabindex="0" aria-label="Xem chi tiết ' + esc(a.title) + '">' +
        '<div class="card-poster">' + img +
          '<span class="card-status ' + statusClass(a.status) + '">' + esc(a.status || '') + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + esc(a.title || '') + '</h3>' +
          '<div class="card-meta">' +
            '<span class="card-rating">★ ' + rating.toFixed(1) + '</span>' +
            '<span class="card-progress">' + eps + '</span>' +
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
      return;
    }
    empty.classList.add('hidden');
    list.innerHTML = State.songs.map((s) => {
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

    const poster = a.poster_url
      ? '<img src="' + esc(a.poster_url) + '" alt="' + esc(a.title) + '" onerror="this.remove()" />'
      : '<div class="poster-fallback">🎞</div>';

    el.innerHTML =
      '<div class="anime-detail">' +
        '<div class="anime-detail-poster">' + poster + '</div>' +
        '<div class="detail-info">' +
          '<h2 class="detail-title">' + esc(a.title || '') + '</h2>' +
          '<p class="detail-subtitle">' + esc([a.studio, a.year].filter(Boolean).join(' · ') || '—') + '</p>' +
          '<p class="detail-synopsis">' + esc(a.synopsis || 'Chưa có mô tả.') + '</p>' +
          '<div class="detail-chips">' +
            (genres.length ? genres.map((g) => '<span class="chip">' + esc(g) + '</span>').join('') : '') +
            '<span class="chip">★ ' + rating.toFixed(1) + '/10</span>' +
            '<span class="chip">' + esc(a.status || '') + '</span>' +
          '</div>' +
          '<div class="detail-progress">' +
            '<span>Tiến độ</span>' +
            '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
            '<span>' + watched + ' / ' + (total || '?') + ' tập (' + pct + '%)</span>' +
          '</div>' +
          (seiyuu.length
            ? '<h4 class="seiyuu-title">🎤 Dàn diễn viên lồng tiếng (Seiyuu)</h4>' +
              '<div class="seiyuu-grid">' +
                seiyuu.map((s) =>
                  '<div class="seiyuu-card">' +
                    (s.image
                      ? '<div class="seiyuu-avatar"><img src="' + esc(s.image) + '" alt="" onerror="this.remove()" /></div>'
                      : '<div class="seiyuu-avatar">🎙</div>') +
                    '<div class="seiyuu-info">' +
                      '<div class="seiyuu-name">' + esc(s.name || '') + '</div>' +
                      '<div class="seiyuu-char">' + esc(s.character || '') + '</div>' +
                    '</div>' +
                  '</div>'
                ).join('') +
              '</div>'
            : '') +
        '</div>' +
      '</div>';
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
      .limit(200);
    $('#commentLoading').classList.add('hidden');
    if (error) {
      console.error('Lỗi đọc bình luận:', error);
      list.innerHTML = '<p class="empty-desc">Không tải được bình luận.</p>';
      list.classList.remove('hidden');
      return;
    }
    const comments = data || [];
    if (comments.length === 0) {
      list.innerHTML = '';
      list.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    list.classList.remove('hidden');
    list.innerHTML = comments.map((c) => commentHTML(c)).join('');
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

  // Rate limiting: chặn gửi liên tục trong 45s
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

  async function submitComment() {
    const anime = State.currentAnime;
    if (!anime) return;
    if (!State.supabase) { toast('Hệ thống chưa sẵn sàng.', 'error'); return; }
    const author = $('#commentAuthor').value.trim();
    const content = $('#commentBox').value.trim();
    if (!author) { toast('Vui lòng nhập tên hiển thị.', 'warning'); return; }
    if (!content) { toast('Vui lòng nhập nội dung bình luận.', 'warning'); return; }
    if (!enforceRateLimit()) return;
    const captchaVal = parseInt($('#captchaInput').value, 10);
    if (isNaN(captchaVal) || captchaVal !== State.captcha.result) {
      toast('Sai kết quả captcha. Thử lại.', 'error');
      newCaptcha();
      return;
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
    const btn = $('#uploadImgBtn');
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      const result = await uploadImageToCloudinary(file);
      const url = result.secure_url || result.url;
      if (!url) throw new Error('Không lấy được URL ảnh.');
      const box = $('#commentBox');
      const imgMd = '![' + esc(file.name || 'ảnh') + '](' + esc(url) + ')';
      // Chèn vào vị trí con trỏ hoặc thêm vào cuối
      const start = box.selectionStart != null ? box.selectionStart : box.value.length;
      box.value = box.value.slice(0, start) + imgMd + box.value.slice(box.selectionEnd || start);
      toast('Đã tải ảnh lên Cloudinary ✅', 'success');
      // Xóa preview để cho chọn file mới
      input.value = '';
    } catch (err) {
      toast('Lỗi tải ảnh: ' + err.message, 'error', 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = '📤';
    }
  }

  // Toolbar soạn thảo: chèn BBCode/Markdown vào textarea
  function applyFormat(fmt) {
    const box = $('#commentBox');
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
     13. AUTH — ĐĂNG NHẬP/ĐĂNG XUẤT ADMIN
     ────────────────────────────────────────────────────── */
  function updateLoginUI() {
    const icon = $('#loginBtnIcon');
    const label = $('#loginBtnLabel');
    const adminBtn = $('#adminBtn');
    if (State.isAdmin) {
      icon.textContent = '🔑';
      label.textContent = State.adminEmail ? State.adminEmail : 'Admin';
      adminBtn.classList.remove('hidden');
      $('#loginBtnLabel').textContent = State.adminEmail || 'Admin';
    } else {
      icon.textContent = '👤';
      label.textContent = 'Đăng nhập';
      adminBtn.classList.add('hidden');
    }
  }

  $('#loginBtn').addEventListener('click', () => {
    if (State.isAdmin) {
      // Thoát đăng nhập
      if (confirm('Đăng xuất khỏi tài khoản admin?')) handleLogout();
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
    if (meta.is_admin === 'true' || meta.is_admin === true) {
      State.isAdmin = true;
      State.adminEmail = user.email;
      closeModal('loginModal');
      toast('Đăng nhập Admin thành công 🎉', 'success');
      updateLoginUI();
      renderAdminAnimeList();
      renderAdminSongList();
      renderAdminCommentList();
    } else {
      State.isAdmin = false;
      await handleLogout(true);
      toast('Tài khoản này không có quyền admin.', 'error', 5000);
    }
  }

  async function handleLogout(silent) {
    if (State.supabase) await State.supabase.auth.signOut();
    State.isAdmin = false;
    State.adminEmail = '';
    updateLoginUI();
    if (!silent) toast('Đã đăng xuất.', 'info');
    closeModal('loginModal');
    closeModal('adminModal');
  }

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
    const arr = Array.isArray(seiyuu) && seiyuu.length ? seiyuu : [{ name: '', character: '', image: '' }];
    arr.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'seiyuu-editor-row';
      row.innerHTML =
        '<input type="text" class="input" data-seiyuu="name" value="' + esc(s.name || '') + '" placeholder="Tên Seiyuu" />' +
        '<input type="text" class="input" data-seiyuu="character" value="' + esc(s.character || '') + '" placeholder="Nhân vật" />' +
        '<input type="text" class="input" data-seiyuu="image" value="' + esc(s.image || '') + '" placeholder="Ảnh avatar URL" />' +
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
      if (name) out.push({ name, character, image });
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
      const animeName = (State.animes.find((a) => a.id === c.anime_id) || {}).title || '';
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
     17. JIKAN API — AUTO-FILL FORM
     ────────────────────────────────────────────────────── */
  async function jikanSearch(query) {
    if (State.jikanAbort) State.jikanAbort.abort();
    State.jikanAbort = new AbortController();
    const results = $('#jikanResults');
    results.innerHTML = '<p class="empty-desc">Đang tra cứu...</p>';
    show('jikanResults');
    try {
      const url = State.config.JIKAN_API_URL + '/anime?q=' + encodeURIComponent(query) + '&limit=6&sfw=true';
      let data = null;
      // Jikan (API miễn phí của MAL) thường xuyên quá tải và trả 504.
      // Tự động thử lại tối đa 3 lần với khoảng chờ ngắn trước khi báo lỗi.
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url, { signal: State.jikanAbort.signal });
          if (res.ok) {
            data = await res.json();
            break;
          }
          lastErr = new Error('HTTP ' + res.status);
          // 504/429/503 là lỗi quá tải — có thể thử lại. Lỗi 4xx khác thì bỏ qua thử lại.
          if (res.status !== 504 && res.status !== 429 && res.status !== 503) break;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          lastErr = e;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
      if (!data) throw lastErr || new Error('Không có phản hồi từ Jikan.');
      const items = (data && data.data) || [];
      if (items.length === 0) {
        results.innerHTML = '<p class="empty-desc">Không tìm thấy anime nào.</p>';
        return;
      }
      results.innerHTML = items.map((it) => {
        const thumb = it.images && it.images.jpg ? it.images.jpg.image_url : '';
        return (
          '<div class="jikan-result-item" data-jid="' + esc(it.mal_id) + '" data-json="' + esc(JSON.stringify(it)).replace(/"/g, '&quot;') + '">' +
            '<div class="jikan-result-thumb">' + (thumb ? '<img src="' + esc(thumb) + '" alt="" loading="lazy" onerror="this.remove()" />' : '') + '</div>' +
            '<div class="jikan-result-info">' +
              '<div class="jikan-result-title">' + esc(it.title || '') + '</div>' +
              '<div class="jikan-result-sub">' + esc((it.type || '') + ' · ' + (it.year || '') + ' · ' + (it.episodes != null ? it.episodes + ' tập' : '')) + '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        const friendly = err.message === 'HTTP 504'
          ? 'Jikan (MyAnimeList) đang quá tải, chưa phản hồi được. Hãy thử lại sau ít phút — hoặc điền thông tin thủ công bên dưới.'
          : ('Lỗi tra cứu Jikan: ' + esc(err.message) + '. Có thể thử lại hoặc điền tay.');
        results.innerHTML = '<p class="empty-desc">' + friendly + '</p>';
      }
    }
  }

  // Điền dữ liệu Jikan vào form + fetch seiyuu/characters
  async function applyJikanToForm(it) {
    if (!it) return;
    $('#af_title').value = it.title || '';
    $('#af_poster').value = (it.images && it.images.jpg && it.images.jpg.large_image_url) || '';
    $('#af_synopsis').value = it.synopsis || '';
    $('#af_status').value = mapJikanStatus(it.status);
    $('#af_rating').value = it.score != null ? it.score : 0;
    $('#af_year').value = it.year || '';
    $('#af_studio').value = (it.studios && it.studios[0] && it.studios[0].name) || '';
    $('#af_total_ep').value = it.episodes != null ? it.episodes : 0;
    $('#af_genres').value = ((it.genres || []).map((g) => g.name)).join(', ');

    updatePosterPreview();

    // Fetch seiyuu từ /anime/{id}/characters
    toast('Đang tải dàn Seiyuu...', 'info', 1500);
    try {
      const url = State.config.JIKAN_API_URL + '/anime/' + it.mal_id + '/characters';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const chars = (data && data.data) || [];
        const voices = [];
        for (const ch of chars) {
          const person = ch.voice_actors && ch.voice_actors[0];
          if (person && person.person) {
            voices.push({
              name: person.person.name || '',
              character: ch.character ? ch.character.name : '',
              image: (person.person.images && person.person.images.jpg && person.person.images.jpg.image_url) || ''
            });
          }
        }
        renderSeiyuuEditors(voices.slice(0, 12));
      }
    } catch (_e) { /* bỏ qua lỗi seiyuu */ }
  }

  function mapJikanStatus(s) {
    const map = { 'Currently Airing': 'Đang chiếu', 'Finished Airing': 'Hoàn thành', 'Not yet aired': 'Sắp chiếu', 'TBA': 'Sắp chiếu' };
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

    // Mở modal anime khi click card
    $('#animeGrid').addEventListener('click', (e) => {
      const card = e.target.closest('.anime-card');
      if (card && card.dataset.id) {
        const a = State.animes.find((x) => String(x.id) === String(card.dataset.id));
        if (a) openAnimeDetail(a);
      }
    });

    // Lọc & sắp xếp anime đã render sẵn qua renderAnimeGrid()
    const as = $('#animeSearch');
    if (as) as.addEventListener('input', renderAnimeGrid);
    const stf = $('#statusFilter');
    if (stf) stf.addEventListener('change', renderAnimeGrid);
    const srt = $('#sortFilter');
    if (srt) srt.addEventListener('change', renderAnimeGrid);

    // Bình luận: gửi & captcha & toolbar
    $('#submitCommentBtn').addEventListener('click', submitComment);
    $('#captchaRefresh').addEventListener('click', newCaptcha);
    $$('.tl-btn[data-fmt]').forEach((btn) => {
      btn.addEventListener('click', () => applyFormat(btn.dataset.fmt));
    });
    $('#uploadImgBtn').addEventListener('click', () => $('#uploadImgInput').click());
    $('#uploadImgInput').addEventListener('change', handleImageUpload);

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
        '<input type="text" class="input" data-seiyuu="image" placeholder="Ảnh avatar URL" />' +
        '<button type="button" class="seiyuu-remove" title="Xóa">✕</button>';
      row.querySelector('.seiyuu-remove').addEventListener('click', () => row.remove());
      wrap.appendChild(row);
    });

    // Jikan tìm kiếm (input id = jikanQuery)
    $('#jikanSearchBtn').addEventListener('click', () => {
      const q = $('#jikanQuery').value.trim();
      if (q) jikanSearch(q);
    });
    $('#jikanQuery').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = $('#jikanQuery').value.trim();
        if (q) jikanSearch(q);
      }
    });
    $('#jikanResults').addEventListener('click', (e) => {
      const item = e.target.closest('[data-json]');
      if (!item) return;
      try {
        const it = JSON.parse(decodeEntities(item.dataset.json));
        $('#jikanQuery').value = it.title || '';
        applyJikanToForm(it);
        hi('jikanResults');
        toast('Đã điền dữ liệu từ Jikan ✅', 'success');
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

    // Comment actions trong modal anime (delegate)
    $('#animeModal').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) handleCommentAction(btn.dataset.act, btn.dataset.id);
    });
  }

  /* ──────────────────────────────────────────────────────
     20. SWITCH TAB (Anime / Music)
     ────────────────────────────────────────────────────── */
  function switchTab(tabName) {
    if (tabName !== 'anime' && tabName !== 'music') return;
    $$('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.dataset.panel === tabName);
    });
    $$('.nav-tab[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });
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


