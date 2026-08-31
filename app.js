/* ============================================================
   app.js â€” ToĂ n bá»™ logic KullAnime (Vanilla JS, ES6+ modular)
   ------------------------------------------------------------
   Gá»“m: Supabase Client, Cloudinary Upload, YouTube Player,
   Auto-fetch GitHub .ass, AniList API Auto-fill, Rich Text Parser
   (BBCode + Markdown), DOMPurify (chá»‘ng XSS), Admin Panel,
   Rate limiting & Captcha chá»‘ng spam.
   ============================================================ */

(function () {
  'use strict';

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     1. KHá»I Táº O TOĂ€N Cá»¤C
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
    subsFiles: [],         // danh sĂ¡ch file .ass tá»« GitHub
    assQuery: '',          // tá»« khoĂ¡ tĂ¬m kiáº¿m file .ass
    currentAnime: null,    // anime Ä‘ang xem trong modal
    currentSong: null,     // bĂ i hĂ¡t Ä‘ang phĂ¡t
    subtitles: [],         // máº£ng cue phá»¥ Ä‘á» ASS Ä‘Ă£ parse (engine)
    subsEnabled: false,
    subsTick: null,
    subSettings: null,     // cĂ i Ä‘áº·t toĂ n cá»¥c phá»¥ Ä‘á» (fontSize, mĂ u, karaoke...) -> lÆ°u localStorage
    timeShiftMs: 0,        // dá»i phá»¥ Ä‘á» theo ms (Timeshift)
    subOverlayHeight: 0,   // chiá»u cao overlay phá»¥ Ä‘á» (dĂ¹ng scaleH cho fontSize)
    // Dá»¯ liá»‡u engine phá»¥ Ä‘á» ASS (port tá»« YouTube-Aegisub-Loader)
    styleSettings: {},     // { styleName: {color1,color3,fontSize,outlineWidth,blur,spacing,fontName,align,posX,posY,...} }
    playResX: 384,
    playResY: 288,
    rawAssText: '',
    lastRenderTime: 0,
    isAdmin: false,
    isLoggedIn: false,   // Ä‘Ă£ Ä‘Äƒng nháº­p (thĂ nh viĂªn hoáº·c admin)
    adminEmail: '',
    nickname: '',        // tĂªn hiá»ƒn thá»‹ (nickname) cá»§a tĂ i khoáº£n Ä‘Ă£ Ä‘Äƒng nháº­p
    youtubeReady: false,
    ytPlayer: null,
    ytReady: false,        // player da san sang (onReady da chay) - moi load video an toan
    pendingPlay: null,     // bai hat cho phat khi YT API san sang
    pendingVideoId: null,  // videoId cho nap khi player onReady
    autoNext: true,        // tá»± Ä‘á»™ng chuyá»ƒn bĂ i káº¿ tiáº¿p khi bĂ i hiá»‡n táº¡i káº¿t thĂºc
    shuffle: false,        // phĂ¡t ngáº«u nhiĂªn khi káº¿t thĂºc / báº¥m next
    // Rate limit comment
    lastCommentAt: 0,
    lastChatAt: 0,
    // Captcha hiá»‡n táº¡i
    captcha: { a: 0, b: 0, result: 0 },
    chatCaptcha: { a: 0, b: 0, result: 0 },
    // AniList (search auto-fill abort)
    jikanAbort: null,
    // PhĂ¢n trang hiá»ƒn thá»‹ trĂªn 1 trang
    animeVisible: 10,      // sá»‘ anime render má»—i lÆ°á»£t
    songVisible: 15,       // sá»‘ bĂ i hĂ¡t render má»—i lÆ°á»£t
    commentAll: [],        // toĂ n bá»™ bĂ¬nh luáº­n cá»§a anime Ä‘ang má»Ÿ
    commentVisible: 20,    // sá»‘ bĂ¬nh luáº­n anime hiá»ƒn thá»‹ hiá»‡n táº¡i
    chatAll: [],           // toĂ n bá»™ tin chat chung
    chatVisible: 3,        // sá»‘ tin chat hiá»ƒn thá»‹ (thu gá»n = 3)
    chatExpanded: false    // tráº¡ng thĂ¡i má»Ÿ rá»™ng sticky chat
  };

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     2. TIá»†N ĂCH (helpers)
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
    if (secs < 60) return 'vá»«a xong';
    if (secs < 3600) return Math.floor(secs / 60) + ' phĂºt trÆ°á»›c';
    if (secs < 86400) return Math.floor(secs / 3600) + ' giá» trÆ°á»›c';
    if (secs < 604800) return Math.floor(secs / 86400) + ' ngĂ y trÆ°á»›c';
    return formatDate(iso);
  }

  function parseYoutubeId(input) {
    if (!input) return '';
    const s = String(input).trim();
    // ID thuáº§n 11 kĂ½ tá»±
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
    return '<div class="poster-fallback" aria-label="KhĂ´ng cĂ³ poster">' + esc(initial || 'đŸ') + '</div>';
  }
  // Fallback poster: thay <img> há»ng báº±ng khá»‘i poster-fallback â€” dĂ¹ng hĂ m toĂ n cá»¥c
  // thay vĂ¬ nhĂºng HTML thĂ´ vĂ o onerror="..." (trĂ¡nh dáº¥u " cáº¯t cá»¥t attribute gĂ¢y kĂ½ tá»± " /> dÆ°)
  window.__posterFallback = function (img, title) {
    if (!img || !img.parentNode) return;
    const initial = String(title || '?').trim().charAt(0).toUpperCase() || 'đŸ';
    const div = document.createElement('div');
    div.className = 'poster-fallback';
    div.setAttribute('aria-label', 'KhĂ´ng cĂ³ poster');
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

  // Cháº·n cuá»™n ná»n khi má»Ÿ modal
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
    if (/hoĂ n|finish|completed/i.test(s)) return 'finish';
    if (/sáº¯p|upcoming|tba/i.test(s)) return 'upcoming';
    return '';
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     3. RICH TEXT PARSER (BBCode + Markdown) + DOMPurify
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  // Chuyá»ƒn BBCode ([b]...[/b]) thĂ nh Markdown trÆ°á»›c khi Ä‘Æ°a qua marked.js
  function bbcodeToMarkdown(input) {
    let s = String(input || '');
    // Quote â€” giá»¯ cáº¥u trĂºc
    s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, (m, inner) => {
      return '\n> ' + inner.trim().split('\n').map((l) => l.trim()).join('\n> ') + '\n';
    });
    // CĂ¡c tháº» inline
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

  // Fallback sanitizer khi DOMPurify CDN khĂ´ng táº£i Ä‘Æ°á»£c.
  // Chá»‰ cho phĂ©p má»™t táº­p tag/attr an toĂ n, loáº¡i bá» má»i script/event/iframe.
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
    // KhĂ´ng cĂ³ DOMPurify (CDN lá»—i) â†’ tá»± lĂ m sáº¡ch qua DOM (váº«n an toĂ n XSS)
    const doc = new DOMParser().parseFromString('<div id="__root">' + html + '</div>', 'text/html');
    const root = doc.getElementById('__root');
    function walk(node) {
      // Xá»­ lĂ½ text node: yĂªn tĂ¢m giá»¯ nguyĂªn
      Array.from(node.children || []).forEach((el) => {
        const tag = (el.tagName || '').toLowerCase();
        if (!SAFE_TAGS.has(tag) || /script|style|iframe|form|input|button|object|embed|link|meta/i.test(tag)) {
          // Thay tháº¿ element nguy hiá»ƒm báº±ng text thuáº§n (máº¥t tag nhÆ°ng an toĂ n)
          const txt = document.createTextNode(el.textContent || '');
          el.replaceWith(txt);
          return;
        }
        // Lá»c attribute: chá»‰ giá»¯ attr an toĂ n, vĂ  chá»‰ trĂªn <a>/<img>
        Array.from(el.attributes || []).forEach((attr) => {
          const name = attr.name.toLowerCase();
          const isHref = name === 'href' && (tag === 'a');
          const isImg = (name === 'src' || name === 'alt') && tag === 'img';
          const isSafeCommon = ['title', 'alt'].includes(name);
          const isTargetRel = name === 'target' || name === 'rel';
          if (!(isHref || isImg || isSafeCommon || isTargetRel)) {
            el.removeAttribute(attr.name);
          }
          // Chá»‰ cho href/src báº¯t Ä‘áº§u báº±ng http(s) hoáº·c # , cháº·n javascript:
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

  // Sanitize XSS. KHĂ”NG BAO GIá»œ render HTML chÆ°a qua Ä‘Ă¢y.
  function renderRichText(raw) {
    const md = bbcodeToMarkdown(raw || '');
    let html;
    try {
      html = marked.parse(md, { breaks: true, gfm: true });
    } catch (_e) {
      html = esc(md);
    }
    // DOMPurify triá»‡t háº¡ 100% script/event handler/iframe Ä‘á»™c háº¡i;
    // náº¿u CDN DOMPurify lá»—i (khĂ´ng táº£i Ä‘Æ°á»£c) thĂ¬ dĂ¹ng fallback an toĂ n thay vĂ¬ crash.
    return sanitizeHTMLFallback(html);
  }

  // Bá»™ lá»c tá»« cáº¥m cÆ¡ báº£n (biáº¿n thĂ nh ***)
  const BAD_WORDS = ['fuck', 'shit', 'bitch', 'Ä‘mm', 'clmm', 'cmm', 'clgt', 'Ä‘á»¥', 'Ä‘á»‹t', 'lá»“n', 'cáº·c', 'buá»“i'];
  function filterBadWords(str) {
    let s = String(str || '');
    for (const w of BAD_WORDS) {
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      s = s.replace(re, '***');
    }
    return s;
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     4. SUPABASE KHá»I Táº O & Äá»ŒC Dá»® LIá»†U
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function initSupabase() {
    State.config = await AppConfig.load();
    // Táº¡o client Supabase tá»« CDN (window.supabase)
    const sb = window.supabase && window.supabase.createClient
      ? window.supabase.createClient(State.config.SUPABASE_URL, State.config.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        })
      : null;
    if (!sb) {
      toast('KhĂ´ng táº£i Ä‘Æ°á»£c Supabase client. Kiá»ƒm tra káº¿t ná»‘i CDN.', 'error', 5000);
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

  // Äá»“ng bá»™ giao diá»‡n theo tráº¡ng thĂ¡i Ä‘Äƒng nháº­p (nĂºt header + composer)
  function applyAuthState() {
    updateLoginUI();
    updateAuthUI();
  }

  // áº¨n/hiá»‡n Ă´ tĂªn hiá»ƒn thá»‹ + captcha trong composer theo tráº¡ng thĂ¡i Ä‘Äƒng nháº­p
  function updateAuthUI() {
    const loggedIn = State.isLoggedIn;
    const name = State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || 'ThĂ nh viĂªn';
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
      console.error('Lá»—i Ä‘á»c animes:', error);
      toast('KhĂ´ng táº£i Ä‘Æ°á»£c danh sĂ¡ch anime: ' + error.message, 'error', 5000);
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
      console.error('Lá»—i Ä‘á»c songs:', error);
      toast('KhĂ´ng táº£i Ä‘Æ°á»£c danh sĂ¡ch nháº¡c: ' + error.message, 'error', 5000);
      return;
    }
    State.songs = data || [];
    renderSongList();
  }


  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     5. GITHUB: Tá»° Äá»˜NG Láº¤Y DANH SĂCH FILE .ass
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function fetchSubsFiles() {
    if (!State.config) return;
    const statusEl = $('#assStatus');
    try {
      statusEl.textContent = 'Äang káº¿t ná»‘i Github...';
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
      console.warn('KhĂ´ng láº¥y Ä‘Æ°á»£c danh sĂ¡ch .ass tá»« GitHub:', err.message);
      State.subsFiles = [];
      if (statusEl) {
        statusEl.textContent = 'â ï¸ KhĂ´ng táº£i Ä‘Æ°á»£c kho phá»¥ Ä‘á» GitHub (kiá»ƒm tra internet / rate limit).';
      }
    }
  }

  function renderAssStatus() {
    const statusEl = $('#assStatus');
    const list = $('#assFileList');
    if (!statusEl) return;
    if (State.subsFiles.length === 0) {
      statusEl.textContent = 'KhĂ´ng cĂ³ file .ass nĂ o trong kho.';
      if (list) list.innerHTML = '';
      return;
    }
    // Lá»c theo tá»« khoĂ¡ tĂ¬m kiáº¿m
    const q = (State.assQuery || '').trim().toLowerCase();
    const filtered = q
      ? State.subsFiles.filter((f) => f.name.toLowerCase().includes(q))
      : State.subsFiles;
    statusEl.textContent = q
      ? 'TĂ¬m tháº¥y ' + filtered.length + '/' + State.subsFiles.length + ' file .ass.'
      : 'TĂ¬m tháº¥y ' + State.subsFiles.length + ' file .ass â€” báº¥m Ä‘á»ƒ phĂ¡t.';
    if (list) {
      if (filtered.length === 0) {
        list.innerHTML = '<div class="ass-file-item"><span class="dot"></span>KhĂ´ng cĂ³ file khá»›p.</div>';
        return;
      }
      list.innerHTML = filtered.map((f) => {
        const yid = parseAssYoutubeId(f.name);
        const title = stripAssTitle(f.name);
        const isActive = State.currentSong && State.currentSong.id === 'ass:' + f.name;
        const cls = 'ass-file-item' + (yid ? ' clickable' : '') + (isActive ? ' active' : '');
        const badge = yid
          ? '<span class="ass-file-play-btn">â–¶</span>'
          : '<span class="ass-file-bad" title="File nĂ y khĂ´ng cĂ³ YouTube ID há»£p lá»‡">ID sai</span>';
        return (
          '<div class="' + cls
          + '" data-ass="' + esc(f.name) + '" tabindex="0" role="button" aria-label="Má»Ÿ video ' + esc(title) + '">'
          + '<span class="dot"></span>'
          + '<span class="ass-file-name">' + esc(title) + '</span>'
          + badge
          + '</div>'
        );
      }).join('');
    }
  }

  // Láº¥y YouTube ID tá»« tĂªn file .ass theo Ä‘á»‹nh dáº¡ng "youtubeID_tiĂªu Ä‘á».ass"
  function parseAssYoutubeId(name) {
    const base = String(name || '').replace(/\.ass$/i, '').trim();
    // YouTube ID thÆ°á»ng lĂ  11 kĂ½ tá»± [A-Za-z0-9_-], náº±m Ä‘áº§u tĂªn file, theo sau bá»Ÿi "_" hoáº·c " "
    const m = base.match(/^([A-Za-z0-9_-]{11})(?=(\s|_)|$)/);
    return m ? m[1] : '';
  }

  // Bá» tiá»n tá»‘ YouTube ID khá»i tĂªn file Ä‘á»ƒ hiá»ƒn thá»‹ tiĂªu Ä‘á» video
  function stripAssTitle(name) {
    return String(name || '')
      .replace(/\.ass$/i, '')
      .replace(/^[A-Za-z0-9_-]{11}[\s_]+/, '')
      .trim() || String(name || '').replace(/\.ass$/i, '').trim();
  }

  // Má»Ÿ video YouTube theo file .ass (click vĂ o káº¿t quáº£ tĂ¬m kiáº¿m)
  async function playAssSub(file) {
    if (!file) return;
    const yid = parseAssYoutubeId(file.name);
    if (!yid) {
      toast('ID sai â€” file "' + file.name + '" khĂ´ng cĂ³ YouTube ID há»£p lá»‡.', 'error', 4000);
      return;
    }
    const title = stripAssTitle(file.name);
    const song = {
      id: 'ass:' + file.name,
      youtube_id: yid,
      ass_file: file.name,
      title: title,
      artist: '',
      anime: 'Phá»¥ Ä‘á» .ass',
      song_type: 'ASS'
    };
    await playSong(song);
    renderAssStatus();
  }

  // Khá»›p file .ass cho 1 bĂ i hĂ¡t: theo ass_file, hoáº·c theo youtube_id trong tĂªn file
  function matchSubtitleFor(song) {
    if (!song || State.subsFiles.length === 0) return null;
    const yid = song.youtube_id;
    // 1) khá»›p theo ass_file Ä‘Ă£ chá»‰ Ä‘á»‹nh
    if (song.ass_file) {
      const exact = State.subsFiles.find((f) => f.name === song.ass_file);
      if (exact) return exact;
    }
    if (!yid) return null;
    // 2) khá»›p theo youtube_id Ä‘á»©ng Ä‘áº§u tĂªn file (pattern: {videoId} {title}.ass)
    const yidMatch = State.subsFiles.find((f) => {
      const base = f.name.replace(/\.ass$/i, '').trim();
      return base === yid || base.startsWith(yid + ' ') || base.startsWith(yid + '_');
    });
    return yidMatch || null;
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     6. ASS ENGINE â€” PARSER + RENDERER
     Port nguyĂªn lĂ½ render phá»¥ Ä‘á» ASS tá»«
     YouTube-Aegisub-Loader (parser.js + engine-css.js + globals.js):
     parseAssEngine() + assembleCue() + renderAssSubtitle() dÆ°á»›i Ä‘Ă¢y thay
     tháº¿ parseAss() cÅ© â€” há»— trá»£ Style, {\pos}, {\an}, karaoke {\k},
     mĂ u/outline/shadow, xuá»‘ng dĂ²ng {\N}.
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  // (parseAss() cÅ© Ä‘Ă£ Ä‘Æ°á»£c thay báº±ng parseAssEngine() â€” xem bĂªn dÆ°á»›i)
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

  // &HAABBGGRR (ASS) -> #RRGGBB (CSS)
  function assToHex(assStr) {
    let clean = String(assStr || '').replace(/&H|&/gi, '');
    if (clean.length > 6) clean = clean.substring(2); // bá» alpha
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

  // Aegisub-style outline: vĂ²ng 8 hÆ°á»›ng text-shadow + blur.
  function buildShadow(ow, bl, oc, useStroke) {
    const ow2 = Math.max(0, Number(ow) || 0);
    const bl2 = Math.max(0, Number(bl) || 0);
    if (ow2 <= 0 && bl2 <= 0) return 'none';
    if (useStroke) {
      // text-stroke lo viá»n sáº¯c nĂ©t; shadow chá»‰ cĂ²n blur-glow (ow lĂ m ná»Ÿ rá»™ng)
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

  // Deep glow: nhiá»u lá»›p text-shadow chá»“ng nhau (port tá»« globals.js)
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

  // Há»‡ sá»‘ co font: canvas Ä‘o ascent/descent -> customResize (~0.7-0.9)
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
      const metrics = ctx.measureText('MgĂ€');
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

  // TĂ¡ch chuá»—i ASS thĂ nh máº£ng Ä‘oáº¡n karaoke: [{text,time}], time=ms tá»« Ä‘áº§u dĂ²ng.
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

  // Parse toĂ n bá»™ .ass -> { subtitles, styleSettings, playResX, playResY }
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
        let defX = playResX / 2, defY = playResY - marginV - 20;
        if (hv.h === 'left') defX = marginL + 20;
        else if (hv.h === 'right') defX = playResX - marginR - 20;
        if (hv.v === 'top') defY = marginV + 20;
        else if (hv.v === 'mid') defY = playResY / 2;
        styleSettings[name] = {
          color1: assToHex(p[3]), color3: assToHex(p[5]),
          origColor1: assToHex(p[3]), origColor3: assToHex(p[5]),
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
          posX: defX, posY: defY, blur: 2,
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
        const rawText = p.slice(9).join(',').trim();
        if (!rawText) continue;
        subtitles.push(assembleCue(rawText, style, styleSettings, playResX, playResY, start, end));
      }
    }
    subtitles.sort((a, b) => a.start - b.start);
    return { subtitles, styleSettings, playResX, playResY };
  }
  // GhĂ©p 1 dialogue thĂ nh Ä‘á»‘i tÆ°á»£ng cue cáº¥u trĂºc cho renderer.
  function assembleCue(rawText, style, styleSettings, playResX, playResY, start, end) {
    const st = styleSettings[style] || {
      color1: '#ffffff', color3: '#000000',
      fontSize: 20, outlineWidth: 2, shadow: 0, spacing: 0,
      fontName: '', align: 2, marginL: 10, marginR: 10, marginV: 10,
      posX: playResX / 2, posY: playResY - 30, blur: 2
    };
    // ---- Parse cĂ¡c override chĂ­nh ----
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
    // ---- Alignment & vá»‹ trĂ­ hiá»‡u lá»±c ----
    let effAlign = st.align;
    if (an) effAlign = an;
    else if (a) effAlign = a;
    const hv = alignToHV(effAlign);
    let posX = st.posX, posY = st.posY;
    if (pos) { posX = pos.x; posY = pos.y; }
    else if (an || a) {
      if (hv.h === 'left') posX = st.marginL + 20;
      else if (hv.h === 'right') posX = playResX - st.marginR - 20;
      else posX = playResX / 2;
      if (hv.v === 'top') posY = st.marginV + 20;
      else if (hv.v === 'mid') posY = playResY / 2;
      else posY = playResY - st.marginV - 20;
    }
    // ---- DĂ²ng + vÄƒn báº£n sáº¡ch ----
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
      ovFs, ovC1, ovC3, ovBord, ovBlur, ovSpacing, ovBold, ovItalic,
      ovScaleX, ovScaleY
    };
  }
  /* ---- RENDER ASS CUE (engine) ----
     Chuyá»ƒn 1 cue (Ä‘Ă£ parse bá»Ÿi assembleCue) thĂ nh pháº§n tá»­ DOM vá»›i Ä‘Ăºng
     style/vá»‹ trĂ­/mĂ u/viá»n/glow + karaoke {\\k} + xuá»‘ng dĂ²ng {\\N}.          */
  // Parse karaoke cá»§a 1 cue: tráº£ vá» [{line, syllables:[{text,start,dur}]}], ms tĂ­nh tá»« Ä‘áº§u cue.
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

  // XĂ¢y 1 div chá»©a toĂ n bá»™ cue vá»›i style/vá»‹ trĂ­ + karaoke.
  function renderAssCue(cue) {
    const gs = State.subSettings || {};
    const st = (State.styleSettings && State.styleSettings[cue.style]) || {};
    const pX = State.playResX || 384;
    const pY = State.playResY || 288;
    const align = cue.align || 2;
    const hv = alignToHV(align);
    const isO = st.override !== false; // style cĂ³ "override" (khĂ´ng dĂ¹ng global) ?

    // ---- Scale theo chiá»u cao overlay (y nhÆ° extension engine-css.js) ----
    const scaleH = (State.subOverlayHeight > 0 && pY > 0)
      ? (State.subOverlayHeight / pY) : 1;
    const customResize = getFontResize(gs.fontFamily || '') || 1;
    const textZoom = (gs.textZoom > 0 && gs.textZoom <= 3) ? gs.textZoom : 0.9;

    // ---- Font size hiá»‡u dá»¥ng (base * scaleH * customResize * textZoom) ----
    let baseFs = isO
      ? (st.fontSize || 25)
      : (gs.fontSize || 70);
    if (cue.ovFs != null) baseFs = cue.ovFs;
    baseFs = baseFs * ((cue.ovScaleY || 100) / 100);
    const fs = Math.max(6, baseFs * scaleH * customResize * textZoom);

    // ---- MĂ u / viá»n / glow (style override hoáº·c global setting) ----
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
    const letterSpacing = gs.letterSpacing || 0;

    // ---- Font family (style font hoáº·c global) ----
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

    // ---- Vá»‹ trĂ­ theo tá»· lá»‡ PlayRes ----
    const leftPct = (cue.posX / pX * 100);
    const topPct = (cue.posY / pY * 100);
    let tx = '-50%', ty = '-50%';
    if (hv.h === 'left') tx = '0%';
    else if (hv.h === 'right') tx = '-100%';
    if (hv.v === 'top') ty = '0%';
    else if (hv.v === 'mid') ty = '-50%';
    else ty = '-100%';
    const textAlign = hv.h === 'left' ? 'left' : hv.h === 'right' ? 'right' : 'center';

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
      }
    };

    // ---- Hiá»ƒn thá»‹ tá»«ng dĂ²ng (há»— trá»£ \\N + karaoke) ----
    const groups = cue.hasKara ? parseKaraokeCue(cue.rawLines) : null;
    const nowMs = (State.lastRenderTime - cue.start) * 1000;
    const lineSpacing = fs * 1.35;
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

    const kTab = (key) => (gs[key] || { c1: '#ffffff', c3: '#000000', outl: 3, blur: 6, zoom: 1.0, zIn: 100, zOut: 100 });

    const applySylStyle = (span, useC1, useC3, useOutl, useBl, useZoom) => {
      span.style.color = useC1;
      span.style.transform = 'scale(' + useZoom + ')';
      span.style.textShadow = deepGlow
        ? buildDeepGlow(useOutl, useBl, useC3, useStroke)
        : buildShadow(useOutl, useBl, useC3, useStroke);
      if (useStroke && useOutl > 0) {
        span.style.webkitTextStroke = Math.max(useOutl, 1) + 'px ' + useC3;
        span.style.paintOrder = 'stroke fill';
      }
    };

    if (groups) {
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
            let useC1, useC3, useOutl, useBl, useZoom = 1;
            const active = nowMs >= syl.start && nowMs < syl.start + syl.dur;
            if (active) {
              // Ă‚m tiáº¿t Ä‘ang hĂ¡t -> tab kActive
              const k = kTab('kActive');
              useC1 = k.c1 || '#ffffff';
              useC3 = k.c3 || '#ff2d55';
              useOutl = (Number(k.outl) != null ? Number(k.outl) : 3) * scaleH;
              useBl = (Number(k.blur) != null ? Number(k.blur) : 6) * scaleH;
              const sEl = nowMs - syl.start;
              const sRem = (syl.start + syl.dur) - nowMs;
              const zIn = Number(k.zIn) || 100;
              const zOut = Number(k.zOut) || 100;
              const zoomMax = Number(k.zoom) || 1.1;
              if (sEl < zIn) useZoom = 1 + (zoomMax - 1) * (sEl / zIn);
              else if (sRem < zOut) useZoom = 1 + (zoomMax - 1) * (sRem / zOut);
              else useZoom = zoomMax;
            } else if (nowMs >= syl.start + syl.dur) {
              // ÄĂ£ hĂ¡t xong -> tab kPost (má» dáº§n)
              const k = kTab('kPost');
              useC1 = isO ? (st.color1 || k.c1 || c1) : (k.c1 || '#ffffff');
              useC3 = isO ? (st.color3 || k.c3 || c3) : (k.c3 || '#000000');
              useOutl = ow;
              useBl = (Number(k.blur) != null ? Number(k.blur) : 6) * scaleH;
              const zoomPost = Number(k.zoom) || 1.0;
              useZoom = zoomPost < 1 ? zoomPost : 0.92;
            } else {
              // ChÆ°a hĂ¡t -> tab kPre (mĂ u bĂ¬nh thÆ°á»ng)
              const k = kTab('kPre');
              useC1 = isO ? (st.color1 || k.c1 || c1) : (k.c1 || '#ffffff');
              useC3 = isO ? (st.color3 || k.c3 || c3) : (k.c3 || '#000000');
              useOutl = ow;
              useBl = (Number(k.blur) != null ? Number(k.blur) : 6) * scaleH;
              useZoom = Number(k.zoom) || 1.0;
            }
            applySylStyle(span, useC1, useC3, useOutl, useBl, useZoom);
            lineDiv.appendChild(span);
          });
        } else {
          lineDiv.textContent = g.line;
        }
      });
    } else {
      (cue.rawLines || []).forEach((ln, li) => {
        const lineDiv = makeLineDiv(baseY + li * lineSpacing);
        applyBox(lineDiv);
        lineDiv.textContent = String(ln).replace(/\{[^}]*\}/g, '');
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

  // Loáº¡i bá» tag ASS {\\...} vĂ  {\\k...}
  function cleanAssText(text) {
    return String(text || '')
      .replace(/\{[^}]*\}/g, '')   // bá» má»i tag {\\...}
      .replace(/\{\\/g, '')         // dá»± phĂ²ng
      .replace(/\s+/g, ' ')
      .trim();
  }


  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     7. YOUTUBE IFrame PLAYER
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  // ÄÆ°á»£c gá»i bá»Ÿi YouTube IFrame API khi sáºµn sĂ ng
  window.onYouTubeIframeAPIReady = function () {
    State.youtubeReady = true;
    _ytApiLoading = false;
    // Tao player ngay khi API san sang de khong phai cho khi nguoi dung bam phat
    ensureYtPlayer();
    // KhĂ´ng tá»± táº¡o player á»Ÿ Ä‘Ă¢y; táº¡o khi ngÆ°á»i dĂ¹ng chá»n bĂ i
  };

  // Bá»‹ cháº·n hoáº·c API chÆ°a náº¡p -> tá»± Ä‘á»™ng chĂ¨n láº¡i script iframe_api
  let _ytApiLoading = false;
  function loadYouTubeApi() {
    if ((window.YT && YT.Player) || _ytApiLoading) return;
    _ytApiLoading = true;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  }

  // Player YT Ä‘Ă£ sáºµn sĂ ng -> má»Ÿ khĂ³a nĂ y Ä‘á»ƒ an toĂ n gá»i loadVideoById
  function onYtPlayerReady() {
    State.ytReady = true;
    startSubtitleTicker();
    try { State.ytPlayer.unloadModule('captions'); } catch (_e) { /* náº¿u module khĂ´ng cĂ³ sáºµn thĂ¬ bá» qua */ }
    // Náº¿u Ä‘ang cĂ³ bĂ i hĂ¡t chá» -> phĂ¡t láº¡i Ä‘áº§y Ä‘á»§ (kĂ¨m .ass) khi player sáºµn sĂ ng
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

  // Náº¡p & phĂ¡t video chá»‰ khi player Ä‘Ă£ onReady; ngÆ°á»£c láº¡i thĂ¬ queue Ä‘á»ƒ phĂ¡t sau
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
          fs: 0, // áº©n nĂºt fullscreen cá»§a YouTube; dĂ¹ng nĂºt fullscreen riĂªng cá»§a app
          cc_load_policy: 0, // luĂ´n máº·c Ä‘á»‹nh táº¯t phá»¥ Ä‘á» CC gá»‘c cá»§a YouTube (dĂ¹ng engine ASS riĂªng)
          cc_lang_pref: 'vi'
        },
        events: {
          onReady: () => {
            startSubtitleTicker();
            // Táº¯t háº³n module captions cá»§a YouTube Ä‘á»ƒ khĂ´ng bao giá» hiá»‡n CC gá»‘c chá»“ng lĂªn phá»¥ Ä‘á» ASS
            try { State.ytPlayer.unloadModule('captions'); } catch (_e) { /* náº¿u module khĂ´ng cĂ³ sáºµn thĂ¬ bá» qua */ }
          },
          onStateChange: onPlayerStateChange,
          onError: () => { toast('KhĂ´ng thá»ƒ phĂ¡t video nĂ y.', 'error'); }
        }
      });
      return true;
    } catch (e) {
      console.error('Lá»—i táº¡o YT player:', e);
      return false;
    }
  }

  // NĂºt phĂ³ng to video full mĂ n hĂ¬nh (dĂ¹ng Fullscreen API trĂªn khung video-wrap)
  // TrĂªn Ä‘iá»‡n thoáº¡i: cá»‘ gáº¯ng khoĂ¡ mĂ n hĂ¬nh theo chiá»u ngang (landscape) Ä‘á»ƒ video
  // phĂ³ng to ngang mĂ n hĂ¬nh thay vĂ¬ dá»c (dĂ¹ng Screen Orientation API, iOS 16.4+/Android).
  function toggleVideoFullscreen() {
    const wrap = $('.video-wrap');
    if (!wrap) return;
    if (!document.fullscreenElement) {
      const doEnter = () => {
        if (wrap.requestFullscreen) wrap.requestFullscreen();
        else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen(); // Safari
        else toast('TrĂ¬nh duyá»‡t khĂ´ng há»— trá»£ fullscreen.', 'warning');
      };
      // KhoĂ¡ hÆ°á»›ng landscape trÆ°á»›c khi vĂ o fullscreen
      const so = screen.orientation || (screen.mozOrientation) || (window.screen && window.screen.orientation);
      let lockPromise = Promise.resolve();
      if (so && typeof so.lock === 'function') {
        try {
          // landscape-primary/landscape-secondary â€” thá»­ tá»«ng loáº¡i, Æ°u tiĂªn primary
          if (so.type && so.type.indexOf('landscape') === 0) {
            doEnter(); // Ä‘Ă£ á»Ÿ landscape rá»“i
          } else {
            lockPromise = so.lock('landscape').catch(() => { /* trĂ¬nh duyá»‡t cĂ³ thá»ƒ khĂ´ng cho phĂ©p lock */ });
          }
        } catch (_e) { /* fallthrough */ }
      }
      Promise.resolve(lockPromise).then(() => doEnter()).catch(() => doEnter());
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      // Thá»­ má»Ÿ khoĂ¡ hÆ°á»›ng (vá» tá»± do) khi thoĂ¡t fullscreen
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
    fsBtn.setAttribute('aria-label', fs ? 'ThoĂ¡t toĂ n mĂ n hĂ¬nh' : 'PhĂ³ng to video');
    fsBtn.setAttribute('title', fs ? 'ThoĂ¡t toĂ n mĂ n hĂ¬nh (Esc)' : 'PhĂ³ng to video');
    const enterSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    const exitSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
    fsBtn.innerHTML = fs ? exitSvg : enterSvg;
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
      // Tá»± phĂ¡t bĂ i káº¿ tiáº¿p (náº¿u báº­t) â€” ngáº«u nhiĂªn náº¿u báº­t shuffle
      if (State.autoNext) {
        const next = pickNextSong();
        if (next) setTimeout(() => playSong(next), 1200);
      }
    } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.BUFFERING) {
      hideSubtitleOverlay();
    }
  }

  // Chá»n bĂ i káº¿ tiáº¿p â€” tĂ´n trá»ng cháº¿ Ä‘á»™ ngáº«u nhiĂªn (shuffle)
  function pickNextSong() {
    const songs = State.songs;
    if (!songs || songs.length === 0) return null;
    const curId = State.currentSong && State.currentSong.id;
    const idx = songs.findIndex((s) => s.id === curId);
    if (State.shuffle) {
      // ngáº«u nhiĂªn trong danh sĂ¡ch, trĂ¡nh láº·p láº¡i bĂ i Ä‘ang phĂ¡t náº¿u cĂ³ > 1 bĂ i
      if (songs.length === 1) return songs[0];
      let pick;
      do { pick = songs[Math.floor(Math.random() * songs.length)]; } while (pick.id === curId);
      return pick;
    }
    if (idx !== -1 && idx < songs.length - 1) return songs[idx + 1];
    return null; // háº¿t danh sĂ¡ch (khĂ´ng vĂ²ng láº¡i)
  }

  // LĂ¹i vá» bĂ i trÆ°á»›c (vĂ²ng láº¡i cuá»‘i danh sĂ¡ch náº¿u Ä‘ang á»Ÿ bĂ i Ä‘áº§u)
  function playPrevSong() {
    const songs = State.songs;
    if (!songs || songs.length === 0) return;
    const curId = State.currentSong && State.currentSong.id;
    const idx = songs.findIndex((s) => s.id === curId);
    if (idx > 0) playSong(songs[idx - 1]);
    else if (idx === 0) playSong(songs[songs.length - 1]);
    else playSong(songs[0]);
  }

  // Sang bĂ i káº¿ tiáº¿p (vĂ²ng láº¡i Ä‘áº§u danh sĂ¡ch náº¿u á»Ÿ bĂ i cuá»‘i) â€” shuffle thĂ¬ ngáº«u nhiĂªn
  function playNextSong() {
    const songs = State.songs;
    if (!songs || songs.length === 0) return;
    if (State.shuffle) { const n = pickNextSong(); if (n) playSong(n); return; }
    const curId = State.currentSong && State.currentSong.id;
    const idx = songs.findIndex((s) => s.id === curId);
    if (idx !== -1 && idx < songs.length - 1) playSong(songs[idx + 1]);
    else playSong(songs[0]);
  }

  // Báº­t / táº¡m dá»«ng (chá»‰ khi cĂ³ player vĂ  Ä‘ang phĂ¡t má»™t video)
  function togglePlay() {
    if (!State.ytPlayer || !State.youtubeReady || !State.currentSong) return;
    try {
      const st = State.ytPlayer.getPlayerState();
      if (st === YT.PlayerState.PLAYING) { State.ytPlayer.pauseVideo(); hideSubtitleOverlay(); }
      else State.ytPlayer.playVideo();
      updatePlayerControlsUI();
    } catch (_e) { /* ignore */ }
  }

  function updatePlayerControlsUI() {
    const autoBtn = $('#pcAuto');
    if (autoBtn) autoBtn.classList.toggle('active', !!State.autoNext);
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

    // Cáº­p nháº­t UI now-playing
    $('#npTitle').textContent = song.title || 'KhĂ´ng tĂªn';
    $('#npMeta').textContent = [song.artist, song.anime, song.song_type].filter(Boolean).join(' Â· ') || 'â€”';
    const thumb = $('#npThumb');
    if (song.cover_url) {
      thumb.innerHTML = '<img src="' + esc(song.cover_url) + '" alt="" loading="lazy" onerror="this.remove()" />';
    } else {
      thumb.innerHTML = '<span class="np-thumb-ph">đŸœ</span>';
    }

    // Highlight trong danh sĂ¡ch
    $$('.song-item').forEach((el) => el.classList.remove('active'));
    const activeEl = $('.song-item[data-id="' + song.id + '"]');
    if (activeEl) activeEl.classList.add('active');

    // Khá»Ÿi táº¡o player náº¿u cáº§n
    if (!ensureYtPlayer()) {
      toast('YouTube player chÆ°a sáºµn sĂ ng, thá»­ láº¡i sau giĂ¢y lĂ¡t...', 'warning');
      return;
    }

    // Táº£i & náº¡p phá»¥ Ä‘á» .ass
    const subFile = matchSubtitleFor(song);
    if (subFile) {
      try {
        const res = await fetch(subFile.download_url);
        if (res.ok) {
          const text = await res.text();
          State.rawAssText = text;
          const parsed = parseAssEngine(text);
          State.subtitles = parsed.subtitles;
          State.styleSettings = parsed.styleSettings;
          State.playResX = parsed.playResX;
          State.playResY = parsed.playResY;
          State.subsEnabled = parsed.subtitles.length > 0; // tá»± báº­t phá»¥ Ä‘á» khi cĂ³ file .ass
        }
      } catch (e) {
        console.warn('Lá»—i táº£i .ass:', e);
        State.subtitles = [];
      }
    }
    // Ăp cĂ i Ä‘áº·t phá»¥ Ä‘á» Ä‘Ă£ lÆ°u riĂªng cho video / file .ass nĂ y (mĂ u, karaoke, per-style override, báº­t/táº¯t)
    activateSubContext();
    updateSubsToggleUI();

    // PhĂ¡t video
    try {
      State.ytPlayer.loadVideoById({ videoId: song.youtube_id, suggestedQuality: 'default' });
      $('#playerPlaceholder').classList.add('hidden');
      toast('Äang phĂ¡t: ' + (song.title || ''), 'info', 1600);
    } catch (e) {
      console.error('Lá»—i phĂ¡t video:', e);
      toast('KhĂ´ng thá»ƒ phĂ¡t video ' + (song.title || ''), 'error');
    }
  }

  /* ---- Phá»¥ Ä‘á» ticker (Ä‘á»“ng bá»™ theo thá»i gian phĂ¡t) ---- */
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
    // Ăp dá»¥ng timeshift (ms) + lÆ°u chiá»u cao overlay Ä‘á»ƒ tĂ­nh scaleH
    const shiftSec = (State.timeShiftMs || 0) / 1000;
    const t = current + shiftSec;
    State.lastRenderTime = t;
    State.subOverlayHeight = overlay.clientHeight || overlay.offsetHeight || 0;
    const active = State.subtitles.filter((s) => t >= s.start && t <= s.end);
    if (!State.subsEnabled || active.length === 0) {
      hideSubtitleOverlay();
      return;
    }
    // Render tá»«ng cue ASS (engine) â€” style/vá»‹ trĂ­/karaoke
    overlay.innerHTML = '';
    active.forEach((cue) => overlay.appendChild(renderAssCue(cue)));
    overlay.classList.add('show');
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
      if (label) label.textContent = 'KhĂ´ng cĂ³ phá»¥ Ä‘á»';
      if (icon) icon.textContent = 'đŸ«';
      hideSubtitleOverlay();
      return;
    }
    if (icon) icon.textContent = State.subsEnabled ? 'đŸ’¬' : 'đŸ”‡';
    if (label) label.textContent = State.subsEnabled ? 'Phá»¥ Ä‘á»: Báº­t' : 'Phá»¥ Ä‘á»: Táº¯t';
    if (State.subsEnabled) updateCurrentSubtitle();
    else hideSubtitleOverlay();
  }

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     7.6 CĂ€I Äáº¶T PHá»¤ Äá»€ â€” POPUP MENU (port YouTube-Aegisub-Loader)
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const SUB_SETTINGS_KEY = 'kullanime_sub_settings_v1';
  const SUB_STORE_KEY = 'kullanime_sub_store_v2';     // lÆ°u cĂ i Ä‘áº·t theo tá»«ng video / file .ass
  const SUB_SETTINGS_DEFAULTS = {
    fontSize: 90, outlineWidth: 3, blur: 6, color1: '#ffffff', color3: '#000000',
    spacing: 0, letterSpacing: 0, textZoom: 1.4,
    useBox: false, deepGlow: false, boxColor: '#000000', boxOpacity: 0.5, fontFamily: 'VNF-Comic Sans',
    fadIn: 200, fadOut: 200, popupOpacity: 0.95, popupZoom: 1.0,
    posX: 350, posY: 100, width: 820, height: 600,
    isBold: true, isItalic: false, isUnderline: false, isStrike: false,
    kPre:    { c1: '#ffffff', c3: '#000000', outl: 3, blur: 6, zoom: 1.0 },
    kActive: { c1: '#ffffff', c3: '#ff2d55', outl: 4, blur: 8, zoom: 1.1, zIn: 100, zOut: 100 },
    kPost:   { c1: '#ffffff', c3: '#000000', outl: 3, blur: 6, zoom: 1.0 },
    closeOnClickOutside: true,
    useGlobalStyles: false,
    useTextStroke: false
  };
  let _subPopupEl = null;
  let _subPopupDragging = false;
  let _subPopupDragOff = [0, 0];
  let _lastUsedSubSettings = null; // cĂ i Ä‘áº·t cá»§a context gáº§n nháº¥t (Ä‘á»ƒ "káº¿ thá»«a" sang video má»›i khi chÆ°a cĂ³ riĂªng)
  const _subFontOptions = ['VNF-Comic Sans', 'Arial', 'Tahoma', 'Verdana', 'Segoe UI', 'Times New Roman'];

  // --------------------- LÆ¯U CĂ€I Äáº¶T THEO Tá»ªNG VIDEO / FILE .ASS ---------------------
  // Store: { [contextKey]: { subSettings, styleSettings, subsEnabled } } lÆ°u á»Ÿ localStorage.
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
  // Chuá»—i Ä‘á»‹nh danh cho video / file .ass Ä‘ang phĂ¡t
  function currentSubContext() {
    const s = State.currentSong;
    if (!s) return '__global__';
    if (s.ass_file) return 'ass:' + s.ass_file;
    if (s.youtube_id) return 'vid:' + s.youtube_id;
    return '__global__';
  }
  // Náº¡p cĂ i Ä‘áº·t máº·c Ä‘á»‹nh (cho lĂºc chÆ°a phĂ¡t bĂ i nĂ o)
  function loadSubSettings() {
    try {
      const raw = localStorage.getItem(SUB_SETTINGS_KEY); // nĂ¢ng cáº¥p tá»« v1 náº¿u cĂ³
      if (!raw) return JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS));
      return Object.assign({}, JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS)), JSON.parse(raw));
    } catch (_e) {
      return JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS));
    }
  }
  // LÆ°u cĂ i Ä‘áº·t hiá»‡n táº¡i (subSettings + per-style override) theo Ä‘Ăºng context Ä‘ang phĂ¡t
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
  // ÄÆ°á»£c gá»i trong playSong sau khi parse .ass: Ă¡p dá»¥ng cĂ i Ä‘áº·t + per-style override Ä‘Ă£ lÆ°u cho context nĂ y
  function activateSubContext() {
    const store = readSubStore();
    const ctx = currentSubContext();
    const entry = store[ctx];
    if (entry && entry.subSettings) {
      State.subSettings = Object.assign({}, JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS)), entry.subSettings);
    } else {
      // chÆ°a cĂ³ riĂªng cho video nĂ y â†’ káº¿ thá»«a cĂ i Ä‘áº·t cá»§a context gáº§n nháº¥t (hoáº·c máº·c Ä‘á»‹nh)
      State.subSettings = Object.assign({}, JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS)), State.subSettings || {});
    }
    // Ăp per-style override Ä‘Ă£ lÆ°u lĂªn styleSettings vá»«a parse
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
    return '<div class="g-row" style="background: rgba(255,255,255,0.05); padding: 3px 5px; border-radius: 4px;">' +
      '<div style="display:flex; align-items:center; gap:4px; flex:1;">1c <input type="color" data-k="' + key + '" data-type="c1" value="' + (obj.c1 || '#ffffff') + '"></div>' +
      '<div style="display:flex; align-items:center; gap:4px; flex:1; justify-content:flex-end;">3c <input type="color" data-k="' + key + '" data-type="c3" value="' + (obj.c3 || '#000000') + '"></div>' +
      '</div>' +
      '<div class="g-row"><label>Outline</label><input type="range" data-k="' + key + '" data-type="outl" min="0" max="20" step="0.1" value="' + (obj.outl || 0) + '"><input type="number" data-k="' + key + '" data-type="outl" value="' + (obj.outl || 0) + '" class="num-in" step="0.1"></div>' +
      '<div class="g-row"><label>Blur</label><input type="range" data-k="' + key + '" data-type="blur" min="0" max="100" step="0.1" value="' + (obj.blur || 0) + '"><input type="number" data-k="' + key + '" data-type="blur" value="' + (obj.blur || 0) + '" class="num-in" step="0.1"></div>' +
      '<div class="g-row"><label>Zoom</label><input type="range" data-k="' + key + '" data-type="zoom" min="0.5" max="2.0" step="0.05" value="' + (obj.zoom || 1.0) + '"><input type="number" data-k="' + key + '" data-type="zoom" value="' + (obj.zoom || 1.0) + '" class="num-in" step="0.05"></div>' +
      (isAct ? '<div class="one-line" style="border-top:1px dashed #444; padding-top:5px; margin-top:5px;">Z-In:<input type="number" data-k="' + key + '" data-type="zIn" value="' + (obj.zIn || 100) + '" class="num-in" step="10"> Z-Out:<input type="number" data-k="' + key + '" data-type="zOut" value="' + (obj.zOut || 100) + '" class="num-in" step="10"></div>' : '');
  }
  const PLAYER_PREFS_KEY = 'kullanime_player_prefs_v1';
  function loadPlayerPrefs() {
    try {
      const raw = localStorage.getItem(PLAYER_PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.autoNext === 'boolean') State.autoNext = p.autoNext;
      if (typeof p.shuffle === 'boolean') State.shuffle = p.shuffle;
    } catch (_e) { /* ignore */ }
  }
  function savePlayerPrefs() {
    try { localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ autoNext: State.autoNext, shuffle: State.shuffle })); } catch (_e) { /* ignore */ }
  }

  // Tạo HTML popup cài đặt phụ đề — responsive (desktop 2 cột / mobile 1 cột bottom sheet).
  // Giữ nguyên mọi ID/class mà setupSubPopupEvents + renderSubStyleItems dựa vào.
  function buildSubPopupHTML(gs, ctxLabel) {
    const safeCtx = String(ctxLabel || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return '' +
      '<div id="sub-settings-header">' +
        '<b class="sub-hd-title">⚙️ SUB Settings</b>' +
        '<span class="sub-hd-ctx" id="sub-ctx-name" title="Cài đặt này được lưu riêng cho video / file .ass đang phát">' + safeCtx + '</span>' +
        '<span class="sub-hd-spacer"></span>' +
        '<button id="sub-settings-reset" title="Khôi phục về cài đặt gốc">Reset↺</button>' +
        '<span id="sub-settings-close" title="Đóng (Esc)">&times;</span>' +
      '</div>' +
      '<div id="sub-settings-inner">' +
        '<div id="sub-settings-left">' +
          '<div class="sub-tool-row">' +
            '<b>Font:</b>' + getSubFontOptionsHTML() +
          '</div>' +
          '<div class="sub-tool-row">' +
            '<button class="format-btn ' + (gs.isBold ? 'active' : '') + '" id="sub-btn-isBold">B</button>' +
            '<button class="format-btn ' + (gs.isItalic ? 'active' : '') + '" id="sub-btn-isItalic">I</button>' +
            '<button class="format-btn ' + (gs.isUnderline ? 'active' : '') + '" id="sub-btn-isUnderline">U</button>' +
            '<button class="format-btn ' + (gs.isStrike ? 'active' : '') + '" id="sub-btn-isStrike">S</button>' +
            '<span class="sub-hd-spacer"></span>' +
            '<b class="sub-ts-lab">⏱ms</b>' +
            '<button id="sub-ts-dec">-100</button>' +
            '<input type="text" id="sub-ts-input" value="' + (State.timeShiftMs || 0) + '">' +
            '<button id="sub-ts-inc">+100</button>' +
          '</div>' +
          '<div class="pill-tabs">' +
            '<div class="pill-tab active" data-pill="settings">⚙️ Settings</div>' +
            '<div class="pill-tab" data-pill="karaoke">🎤 Karaoke</div>' +
            '<div class="pill-tab" data-pill="advanced">🛠️ Advanced</div>' +
          '</div>' +
          '<div class="pill-panel open" data-pill="settings">' +
            renderSubGlobalRow('Size', 'fontSize', 20, 300, 1) +
            renderSubGlobalRow('Outline', 'outlineWidth', 0, 30, 0.1) +
            renderSubGlobalRow('Blur', 'blur', 0, 100, 0.1) +
            '<div class="g-row sub-color-row">' +
              '<div>Text(1c) <input type="color" id="g-color1" value="' + (gs.color1 || '#ffffff') + '"></div>' +
              '<div>Outline(3c) <input type="color" id="g-color3" value="' + (gs.color3 || '#000000') + '"></div>' +
            '</div>' +
            '<div class="g-row"><label>Fade</label><input type="number" id="g-fadIn" value="' + (gs.fadIn || 200) + '" class="num-in"><span class="sub-fade-arr">→</span><input type="number" id="g-fadOut" value="' + (gs.fadOut || 200) + '" class="num-in"></div>' +
            '<div class="sub-box-row">' +
              '<input type="checkbox" id="g-useBox" ' + (gs.useBox ? 'checked' : '') + '> <b>Box</b>' +
              '<input type="color" id="g-boxColor" value="' + (gs.boxColor || '#000000') + '">' +
              '<input type="range" id="g-boxOpacity" min="0" max="1" step="0.1" value="' + (gs.boxOpacity || 0.5) + '">' +
            '</div>' +
          '</div>' +
          '<div class="pill-panel" data-pill="karaoke">' +
            '<div class="k-tabs">' +
              '<button class="k-tab-btn active" data-tab="pre">Pre</button>' +
              '<button class="k-tab-btn" data-tab="active">Active</button>' +
              '<button class="k-tab-btn" data-tab="post">Post</button>' +
            '</div>' +
            '<div class="k-tab-panels">' +
              '<div id="sub-k-pre-panel" class="k-tab-content" style="display:block;">' + renderSubKTab('kPre') + '</div>' +
              '<div id="sub-k-active-panel" class="k-tab-content" style="display:none;">' + renderSubKTab('kActive') + '</div>' +
              '<div id="sub-k-post-panel" class="k-tab-content" style="display:none;">' + renderSubKTab('kPost') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="pill-panel" data-pill="advanced">' +
            '<div class="g-row">' +
              '<label style="white-space:nowrap;">Text Zoom</label>' +
              '<input type="number" id="g-textZoom" value="' + Math.round((gs.textZoom || 0.8) * 100) + '" class="num-in" step="5" min="10" max="300"><span class="sub-pct">%</span>' +
              '<label style="white-space:nowrap; margin-left:4px;">Letter Spacing</label>' +
              '<input type="number" id="g-letterSpacing" value="' + (gs.letterSpacing || 0) + '" class="num-in" step="0.5" min="0" max="30">' +
            '</div>' +
            '<div class="g-row sub-check-row">' +
              '<input type="checkbox" id="g-useTextStroke" ' + (gs.useTextStroke ? 'checked' : '') + '> <b>text-stroke</b>' +
              '<span class="sub-sep">|</span>' +
              '<input type="checkbox" id="g-deepGlow" ' + (gs.deepGlow ? 'checked' : '') + '> <b>Deep Glow</b>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div id="sub-settings-divider"></div>' +
        '<div id="sub-style-list">' +
          '<div class="sub-style-head">' +
            '<span class="sub-styles-title">STYLES <em class="sub-filter-hint">(tự lọc style không có dòng)</em></span>' +
            '<div class="sub-style-tools">' +
              '<span id="sub-reset-all-styles" title="Reset tất cả style">↺ ALL</span>' +
              '<label class="sub-global-lab"><input type="checkbox" id="sub-use-global-settings" ' + (gs.useGlobalStyles ? 'checked' : '') + '> Global</label>' +
            '</div>' +
          '</div>' +
          '<div id="sub-style-items"></div>' +
        '</div>' +
      '</div>' +
      '<div id="sub-settings-footer">' +
        '<label class="sub-foot-lab"><input type="checkbox" id="sub-close-outside" ' + (gs.closeOnClickOutside ? 'checked' : '') + '> Đóng khi bấm ngoài</label>' +
        '<div class="sub-foot-actions">' +
          '<button type="button" id="sub-backup" title="Tải cài đặt phụ đề của máy này về máy (JSON)">💾 Backup</button>' +
          '<button type="button" id="sub-restore" title="Khôi phục cài đặt phụ đề từ file JSON">📥 Restore</button>' +
        '</div>' +
        '<span class="sub-foot-brand">AEGISUB by Kull</span>' +
      '</div>';
  }

function createSubPopup() {
    if (_subPopupEl && document.body.contains(_subPopupEl)) return _subPopupEl;
    const gs = ensureSubSettings();
    const popup = document.createElement('div');
    popup.id = 'sub-settings-popup';
    Object.assign(popup.style, {
      position: 'fixed', width: 'min(' + (gs.width || 860) + 'px, 96vw)',
      height: 'auto', maxHeight: '92vh',
      background: 'rgba(15,15,15,' + (gs.popupOpacity || 0.95) + ')',
      backdropFilter: 'blur(15px)', color: '#fff', zIndex: '2147483647',
      borderRadius: '14px', border: '1px solid #444', display: 'none',
      flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
    });
    // Äáº·t popup ngay cáº¡nh nĂºt SUB (gĂ³c dÆ°á»›i-pháº£i), khĂ´ng Ä‘Ă¨ lĂªn khung video.
    // On mobile: full-width bottom sheet.
    const fabRect = $('#subsSettingsBtn') ? $('#subsSettingsBtn').getBoundingClientRect() : null;
    const isMobile = window.innerWidth <= 640;
    if (isMobile) {
      popup.style.left = '8px'; popup.style.right = '8px'; popup.style.bottom = (window.innerHeight - (fabRect ? fabRect.top : window.innerHeight)) + 74 + 'px';
      popup.style.top = 'auto';
    } else {
      const vw = window.innerWidth;
      const pw = Math.min((gs.width || 860), vw * 0.96);
      const right = fabRect ? Math.max(8, window.innerWidth - fabRect.right + 4) : 24;
      popup.style.right = right + 'px';
      popup.style.left = 'auto';
      const bottom = fabRect ? (window.innerHeight - fabRect.top) + 74 : 24;
      popup.style.bottom = Math.max(8, bottom) + 'px';
      popup.style.top = 'auto';
      popup.style.width = pw + 'px';
    }
    // Context hiá»‡n Ä‘ang chá»‰nh (video / file .ass)
    const ctxLabel = (State.currentSong && (State.currentSong.ass_file || State.currentSong.title)) || 'Máº·c Ä‘á»‹nh';
    popup.innerHTML = buildSubPopupHTML(gs, ctxLabel);
    document.body.appendChild(popup);
    setupSubPopupEvents();
    _subPopupEl = popup;
    return popup;
  }
function toggleSubPopup() {
    const p = createSubPopup();
    const show = p.style.display === 'none' || p.style.display === '';
    p.style.display = show ? 'flex' : 'none';
    const fab = $('#subsSettingsBtn');
    if (fab) fab.setAttribute('aria-expanded', String(show));
    if (show) {
      renderSubStyleItems();
      if (State.subsEnabled) updateCurrentSubtitle();
    }
  }

  // Render danh sĂ¡ch style + nĂºt Ä‘iá»u chá»‰nh tá»«ng style (port engine-css.js renderStyles)
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
      item.innerHTML = '<div class="style-head"><span title="Font: ' + (s.fontName || 'default') + '">' + sName + '</span>' +
        '<div style="display:flex; align-items:center; gap:6px;">' +
          '<span class="sub-reset-style" data-style="' + sName + '" style="cursor:pointer;font-size:10px;color:#ffaa00;">âŸ³</span>' +
          '<span class="sub-eye" data-style="' + sName + '" style="cursor:pointer;opacity:' + (s.visible ? 1 : 0.3) + '">' + (s.visible ? 'đŸ‘ï¸' : 'đŸ«') + '</span>' +
          '<label style="display:flex; align-items:center;height:16px;"><input type="checkbox" data-style="' + sName + '" data-type="override" ' + (s.override ? 'checked' : '') + ' style="margin:0;height:12px;"> <span style="font-size:12px;display:flex;align-items:center;">â™ï¸</span></label>' +
          '<span>â–¼</span>' +
        '</div></div>' +
        '<div class="sub-style-meta" style="display:flex; flex-wrap:wrap; gap:3px 8px; padding:4px 10px; font-size:9px; color:#9aa; border-top:1px dashed rgba(255,255,255,0.07);">' +
          '<span>XY:' + (s.posX || 0) + ',' + (s.posY || 0) + '</span>' +
          '<span>1c ' + (s.color1 || '') + '</span>' +
          '<span>3c ' + (s.color3 || '') + '</span>' +
          '<span>S:' + (s.fontSize || 25) + '</span>' +
          '<span>O:' + (s.outlineWidth || 2) + '</span>' +
          '<span>Blur:' + (s.blur != null ? s.blur : 2) + '</span>' +
        '</div>' +
        '<div class="style-body" style="display:none;">' +
          '<div class="g-row" style="margin-bottom:2px;">X <input type="range" data-style="' + sName + '" data-type="posX" min="0" max="' + (State.playResX * 2) + '" value="' + s.posX + '"> <input type="number" value="' + s.posX + '" class="num-in" data-style="' + sName + '" data-type="posX"></div>' +
          '<div class="g-row" style="margin-bottom:2px;">Y <input type="range" data-style="' + sName + '" data-type="posY" min="0" max="' + (State.playResY * 2) + '" value="' + s.posY + '"> <input type="number" value="' + s.posY + '" class="num-in" data-style="' + sName + '" data-type="posY"></div>' +
          '<div class="sub-adv-style" style="display:' + (s.override ? 'block' : 'none') + ';">' +
            '<div class="g-row" style="margin-bottom:0px;">' +
              '<span style="width:18px;color:#aaa;font-weight:bold;font-size:.75em;">1c</span><input type="color" data-style="' + sName + '" data-type="color1" value="' + (s.color1 || '#ffffff') + '" style="width:27px;height:23px;">' +
              '<span style="width:18px;color:#aaa;font-weight:bold;font-size:.75em;text-align:center;">3c</span><input type="color" data-style="' + sName + '" data-type="color3" value="' + (s.color3 || '#000000') + '" style="width:27px;height:23px;">' +
              '<span style="width:10px;color:#aaa;font-weight:bold;font-size:.75em;text-align:center;">S</span><input type="number" data-style="' + sName + '" data-type="fontSize" value="' + (s.fontSize || 25) + '" class="num-in" style="width:35px;max-width:35px;" step="1">' +
              '<span style="width:10px;color:#aaa;font-weight:bold;font-size:.75em;text-align:center;">O</span><input type="number" data-style="' + sName + '" data-type="outlineWidth" value="' + (s.outlineWidth || 2) + '" class="num-in" style="width:35px;max-width:35px;" step="0.1">' +
            '</div>' +
          '</div>' +
        '</div>';
      item.querySelector('.sub-reset-style').onclick = (e) => {
        e.stopPropagation();
        const a = s.origAlign || s.align || 2;
        const mL = (s.origMarginL !== undefined && s.origMarginL !== null) ? s.origMarginL : (s.marginL || 10);
        const mR = (s.origMarginR !== undefined && s.origMarginR !== null) ? s.origMarginR : (s.marginR || 10);
        const mV = (s.origMarginV !== undefined && s.origMarginV !== null) ? s.origMarginV : (s.marginV || 10);
        if (a % 3 === 1) s.posX = mL + 10;
        else if (a % 3 === 0) s.posX = State.playResX - mR - 10;
        else s.posX = State.playResX / 2;
        if (a >= 7) s.posY = mV + 10;
        else if (a >= 4) s.posY = State.playResY / 2;
        else s.posY = State.playResY - mV - 10;
        s.color1 = s.origColor1 || '#ffffff';
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
        e.target.innerText = s.visible ? 'đŸ‘ï¸' : 'đŸ«';
        e.target.style.opacity = s.visible ? 1 : 0.3;
        saveSubSettings();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
      item.querySelector('.style-head').onclick = (e) => {
        if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('sub-eye') && !e.target.closest('label')) {
          const b = item.querySelector('.style-body');
          b.style.display = b.style.display === 'none' ? 'block' : 'none';
        }
      };
      container.appendChild(item);
    });
  }
function setupSubPopupEvents() {
    const popup = _subPopupEl;
    if (!popup) return;

    // KĂ©o popup báº±ng header
    const header = popup.querySelector('#sub-settings-header');
    header.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      _subPopupDragging = true;
      _subPopupDragOff = [popup.offsetLeft - e.clientX, popup.offsetTop - e.clientY];
      e.preventDefault();
    };
    document.addEventListener('mousemove', (e) => {
      if (!_subPopupDragging) return;
      popup.style.right = 'auto';
      popup.style.bottom = 'auto';
      popup.style.left = (e.clientX + _subPopupDragOff[0]) + 'px';
      popup.style.top = (e.clientY + _subPopupDragOff[1]) + 'px';
    });
    document.addEventListener('mouseup', () => { _subPopupDragging = false; });

    // Chia kĂ©o divider (left/styles)
    const divider = popup.querySelector('#sub-settings-divider');
    let isResizing = false;
    if (divider) {
      divider.addEventListener('mousedown', (e) => { isResizing = true; document.body.style.cursor = 'col-resize'; e.preventDefault(); });
      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const container = popup.querySelector('#sub-settings-inner');
        const left = popup.querySelector('#sub-settings-left');
        const right = popup.querySelector('#sub-style-list');
        const cRect = container.getBoundingClientRect();
        let leftW = e.clientX - cRect.left - (divider.offsetWidth / 2);
        leftW = Math.max(150, Math.min(leftW, cRect.width - 150 - divider.offsetWidth));
        left.style.flex = 'none';
        left.style.width = leftW + 'px';
        right.style.flex = '1';
      });
      document.addEventListener('mouseup', () => { if (isResizing) { isResizing = false; document.body.style.cursor = ''; } });
    }

    // ÄĂ³ng popup khi báº¥m bĂªn ngoĂ i
    document.addEventListener('mousedown', function __subCloseOutside(e) {
      const p = _subPopupEl;
      const btn = $('#subsSettingsBtn');
      if (p && p.style.display !== 'none' && !p.contains(e.target) && !(btn && btn.contains(e.target)) &&
          State.subSettings && State.subSettings.closeOnClickOutside) {
        p.style.display = 'none';
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });

    // Pill tabs (Settings / Karaoke / Advanced)
    popup.querySelectorAll('.pill-tab').forEach((t) => {
      t.onclick = () => {
        popup.querySelectorAll('.pill-tab').forEach((x) => x.classList.remove('active'));
        popup.querySelectorAll('.pill-panel').forEach((x) => x.classList.remove('open'));
        t.classList.add('active');
        const panel = popup.querySelector('.pill-panel[data-pill="' + t.dataset.pill + '"]');
        if (panel) panel.classList.add('open');
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

    // ÄĂ³ng + Reset toĂ n bá»™
    popup.querySelector('#sub-settings-close').onclick = () => { popup.style.display = 'none'; };
    popup.querySelector('#sub-settings-reset').onclick = () => {
      State.subSettings = JSON.parse(JSON.stringify(SUB_SETTINGS_DEFAULTS));
      State.timeShiftMs = 0;
      saveSubSettings();
      // náº¡p láº¡i style gá»‘c tá»« .ass hiá»‡n táº¡i
      if (State.subtitles.length && State.rawAssText) {
        try {
          const parsed = parseAssEngine(State.rawAssText);
          State.subtitles = parsed.subtitles;
          State.styleSettings = parsed.styleSettings;
        } catch (_e) { }
      }
      // dá»±ng láº¡i popup vá»›i giĂ¡ trá»‹ má»›i
      if (_subPopupEl) { _subPopupEl.remove(); _subPopupEl = null; }
      const fp = createSubPopup();
      fp.style.display = 'flex';
      renderSubStyleItems();
      if (State.subsEnabled) updateCurrentSubtitle();
      toast('ÄĂ£ reset cĂ i Ä‘áº·t phá»¥ Ä‘á».', 'info', 1800);
    };
// Reset all styles
    const resetAll = popup.querySelector('#sub-reset-all-styles');
    if (resetAll) {
      resetAll.onclick = () => {
        Object.keys(State.styleSettings || {}).forEach((sName) => {
          const s = State.styleSettings[sName];
          const a = s.origAlign || s.align || 2;
          const mL = (s.origMarginL !== undefined && s.origMarginL !== null) ? s.origMarginL : (s.marginL || 10);
          const mR = (s.origMarginR !== undefined && s.origMarginR !== null) ? s.origMarginR : (s.marginR || 10);
          const mV = (s.origMarginV !== undefined && s.origMarginV !== null) ? s.origMarginV : (s.marginV || 10);
          if (a % 3 === 1) s.posX = mL + 10;
          else if (a % 3 === 0) s.posX = State.playResX - mR - 10;
          else s.posX = State.playResX / 2;
          if (a >= 7) s.posY = mV + 10;
          else if (a >= 4) s.posY = State.playResY / 2;
          else s.posY = State.playResY - mV - 10;
          s.color1 = s.origColor1 || '#ffffff';
          s.color3 = s.origColor3 || '#000000';
          s.fontSize = s.origFontSize || s.fontSize || 25;
          s.outlineWidth = s.origOutlineWidth || s.outlineWidth || 2;
        });
        saveSubSettings();
        renderSubStyleItems();
        if (State.subsEnabled) updateCurrentSubtitle();
      };
    }

    // Use Global Setting checkbox
    const gChk = popup.querySelector('#sub-use-global-settings');
    if (gChk) {
      gChk.addEventListener('change', () => {
        State.subSettings.useGlobalStyles = gChk.checked;
        Object.keys(State.styleSettings || {}).forEach((name) => {
          State.styleSettings[name].override = !gChk.checked;
        });
        saveSubSettings();
        renderSubStyleItems();
        if (State.subsEnabled) updateCurrentSubtitle();
      });
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

    // Timeshift
    const tsInput = popup.querySelector('#sub-ts-input');
    if (tsInput) {
      popup.querySelector('#sub-ts-dec').onclick = () => {
        State.timeShiftMs = (parseInt(tsInput.value, 10) || 0) - 100;
        tsInput.value = State.timeShiftMs;
        if (State.subsEnabled) updateCurrentSubtitle();
      };
      popup.querySelector('#sub-ts-inc').onclick = () => {
        State.timeShiftMs = (parseInt(tsInput.value, 10) || 0) + 100;
        tsInput.value = State.timeShiftMs;
        if (State.subsEnabled) updateCurrentSubtitle();
      };
      tsInput.addEventListener('change', () => {
        State.timeShiftMs = parseInt(tsInput.value, 10) || 0;
        if (State.subsEnabled) updateCurrentSubtitle();
      });
    }

    // Font select
    const fontSel = popup.querySelector('#sub-fontSelect');
    if (fontSel) {
      fontSel.addEventListener('change', () => {
        if (fontSel.value === 'custom') {
          const pick = prompt('Nháº­p tĂªn font Ä‘Ă£ cĂ i trĂªn mĂ¡y:', State.subSettings.fontFamily);
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

    // Input chĂ­nh: global g-*, karaoke data-k, style data-style
    popup.addEventListener('input', (e) => {
      const t = e.target;
      const id = t.id, style = t.getAttribute('data-style'), type = t.getAttribute('data-type'), kTab = t.getAttribute('data-k');
      const val = t.type === 'checkbox' ? t.checked : t.value;
      if (kTab) {
        if (!State.subSettings[kTab]) State.subSettings[kTab] = Object.assign({}, SUB_SETTINGS_DEFAULTS[kTab]);
        State.subSettings[kTab][type] = (t.type === 'number' || t.type === 'range') ? parseFloat(val) : val;
        const row = t.closest('.g-row');
        if (row) {
          const pair = row.querySelector('input[data-k="' + kTab + '"][data-type="' + type + '"][type="' + (t.type === 'range' ? 'number' : 'range') + '"]');
          if (pair) pair.value = val;
        }
      } else if (style) {
        const s = State.styleSettings[style];
        if (!s) return;
        s[type] = (t.type === 'number' || t.type === 'range') ? parseFloat(val) : val;
        if (type === 'posX' || type === 'posY') {
          const row = t.closest('.g-row');
          if (row) {
            const sibling = row.querySelector('input[data-type="' + type + '"][type="' + (t.type === 'range' ? 'number' : 'range') + '"]');
            if (sibling) sibling.value = val;
          }
        }
        if (type === 'override') {
          const adv = t.closest('.style-item').querySelector('.sub-adv-style');
          if (adv) adv.style.display = val ? 'block' : 'none';
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

    // Backup cài đặt phụ đề của máy này → tải về file JSON
    const bkpBtn = popup.querySelector('#sub-backup');
    if (bkpBtn) {
      bkpBtn.addEventListener('click', () => {
        try {
          const store = readSubStore();
          const data = JSON.stringify({ app: 'kullanime', type: 'sub-settings-backup', exported: new Date().toISOString(), store: store }, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'kullanime-sub-settings-backup.json';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
          toast('Đã xuất file backup cài đặt phụ đề (toàn bộ video/file .ass của máy).', 'success', 2600);
        } catch (_e) { toast('Không thể tạo file backup.', 'error'); }
      });
    }
    // Restore cài đặt phụ đề từ file JSON (nạp lại toàn bộ store)
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
            const newStore = (data && data.store && typeof data.store === 'object') ? data.store : {};
            if (Object.keys(newStore).length === 0) throw new Error('File backup trống');
            writeSubStore(newStore);
            // Nạp lại cài đặt context hiện tại
            State.subSettings = loadSubSettings();
            activateSubContext();
            if (_subPopupEl) { _subPopupEl.remove(); _subPopupEl = null; }
            const fp = createSubPopup();
            fp.style.display = 'flex';
            renderSubStyleItems();
            updateSubsToggleUI();
            if (State.subsEnabled) updateCurrentSubtitle();
            toast('Đã khôi phục cài đặt phụ đề từ backup ✅', 'success', 2600);
          } catch (err) {
            toast('File backup không hợp lệ: ' + (err.message || 'lỗi'), 'error', 4000);
          }
        };
        input.click();
      });
    }
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     8. RENDER ANIME GRID + FILTER
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function renderAnimeGrid() {
    const grid = $('#animeGrid');
    const empty = $('#animeEmpty');
    const search = $('#animeSearch').value.trim().toLowerCase();
    const status = $('#statusFilter').value;
    const sort = $('#sortFilter').value;
    syncGenreFilter();

    let list = State.animes.slice();

    // Lá»c tráº¡ng thĂ¡i (tĂ¬nh tráº¡ng phĂ¡t hĂ nh cá»§a anime)
    if (status !== 'all') {
      list = list.filter((a) => String(a.status || '').toLowerCase() === String(status).toLowerCase());
    }
    // Lá»c thá»ƒ loáº¡i â€” danh sĂ¡ch tá»± liá»‡t kĂª toĂ n bá»™ thá»ƒ loáº¡i Ä‘Ă£ lÆ°u
    const genre = $('#genreFilter').value;
    if (genre !== 'all') {
      list = list.filter((a) => {
        const gs = Array.isArray(a.genres) ? a.genres : String(a.genres || '').split(',').map((s) => s.trim()).filter(Boolean);
        return gs.some((g) => String(g).toLowerCase() === String(genre).toLowerCase());
      });
    }
    // Lá»c theo tráº¡ng thĂ¡i xem cá»§a tĂ´i (ÄĂ£ xem / Äang xem / Muá»‘n xem / ChÆ°a xem)
    const myStatus = $('#myStatusFilter').value;
    if (myStatus !== 'all') {
      list = list.filter((a) => myStatusMeta(a.my_status).label === myStatus);
    }
    // Lá»c theo tá»« khĂ³a (tĂªn, studio, thá»ƒ loáº¡i)
    if (search) {
      list = list.filter((a) => {
        const genres = Array.isArray(a.genres) ? a.genres.join(' ') : String(a.genres || '');
        const haystack = [a.title, a.studio, genres, (a.seiyuu || []).map((s) => s.name).join(' ')]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }
    // Sáº¯p xáº¿p
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
    // PhĂ¢n trang: chá»‰ hiá»ƒn thá»‹ animeVisible pháº§n tá»­ Ä‘áº§u
    const visible = list.slice(0, State.animeVisible);
    grid.innerHTML = visible.map((a) => animeCardHTML(a)).join('');
    updateLoadMore('#animeLoadMoreWrap', list.length - State.animeVisible);
  }

  // Helper: hiá»‡n/áº©n nĂºt "Xem thĂªm" vĂ  cáº­p nháº­t sá»‘ cĂ²n láº¡i
  function updateLoadMore(wrapSel, remaining) {
    const wrap = $(wrapSel);
    if (!wrap) return;
    if (remaining > 0) {
      wrap.classList.remove('hidden');
      const btn = wrap.querySelector('.load-more-btn');
      if (btn) {
        const base = btn.dataset.label || 'Xem thĂªm â–¼';
        btn.textContent = base + ' (' + remaining + ' cĂ²n)';
      }
    } else {
      wrap.classList.add('hidden');
    }
  }

  // Äá»• danh sĂ¡ch thá»ƒ loáº¡i vĂ o select lá»c â€” tá»± Ä‘á»™ng liá»‡t kĂª má»i thá»ƒ loáº¡i Ä‘Ă£ lÆ°u
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
      '<option value="all">Táº¥t cáº£ thá»ƒ loáº¡i</option>' +
      genres.map((g) => '<option value="' + esc(g) + '">' + esc(g) + '</option>').join('');
    if (cur !== 'all' && genres.includes(cur)) sel.value = cur;
    else sel.value = 'all';
  }

  // Helper: metadata cho tráº¡ng thĂ¡i xem cĂ¡ nhĂ¢n (cá»§a chá»§ web)
  function myStatusMeta(s) {
    s = String(s || '').trim();
    if (/Ä‘Ă£ xem|xem r/i.test(s)) return { label: 'ÄĂ£ xem', icon: 'âœ…', cls: 'my-watched' };
    if (/Ä‘ang xem|Ä‘ang/i.test(s)) return { label: 'Äang xem', icon: 'â³', cls: 'my-watching' };
    if (/Ă½ Ä‘á»‹nh|Ä‘á»‹nh xem|muá»‘n xem|dá»± Ä‘á»‹nh/i.test(s)) return { label: 'Muá»‘n xem', icon: 'â•', cls: 'my-planned' };
    return { label: 'ChÆ°a xem', icon: 'â¬œ', cls: 'my-unwatched' };
  }

  function animeCardHTML(a) {
    const rating = Number(a.rating) || 0;
    const mySt = myStatusMeta(a.my_status);
    const myRating = Math.round(Number(a.my_rating) || 0);
    const totalEp = Number(a.total_episodes) || 0;
    const img = a.poster_url
      ? '<img src="' + esc(a.poster_url) + '" alt="' + esc(a.title) + '" loading="lazy" data-title="' + esc(a.title) + '" onerror="window.__posterFallback(this, this.dataset.title)" />'
      : posterFallback(a);

    // NĂºt đŸŒ¸ (gĂ³c trĂªn-pháº£i) má»Ÿ menu tráº¡ng thĂ¡i â€” LUĂ”N hiá»ƒn thá»‹ Ä‘á»ƒ sá»­a tráº¡ng thĂ¡i nhanh + badge tráº¡ng thĂ¡i (gĂ³c dÆ°á»›i-pháº£i)
    let badgeText;
    if (mySt.cls === 'my-watching') {
      const we = Number(a.watched_episodes) || 0;
      badgeText = 'đŸ”¥ Äang xem' + ((we > 0 || totalEp > 0) ? ' ' + we + '/' + (totalEp || '?') + ' táº­p' : '');
    } else if (mySt.cls === 'my-watched') badgeText = 'âœ… ÄĂ£ xem';
    else if (mySt.cls === 'my-planned') badgeText = 'â• Muá»‘n xem';
    else badgeText = 'â¬œ ChÆ°a xem';
    const statusUI =
      '<button type="button" class="card-sakura" data-quick="menu" title="Äáº·t tráº¡ng thĂ¡i xem">đŸŒ¸</button>' +
      '<span class="card-status-badge ' + mySt.cls + '">' + esc(badgeText) + '</span>';

    // Meta: â˜… Ä‘iá»ƒm cá»™ng Ä‘á»“ng (AniDB) | nĂºt Ä‘iá»ƒm cá»§a tĂ´i (báº¥m Ä‘á»ƒ má»Ÿ popup cháº¥m â™¥; hiá»ƒn thá»‹ trĂ¡i tim trÆ°á»›c, sá»‘ sau) | tá»•ng sá»‘ táº­p Ä‘Ă£ phĂ¡t hĂ nh
    const metaRight =
      '<span class="card-meta-right">' +
        '<button type="button" class="card-heart-btn" data-heart-menu="1" title="Äiá»ƒm cá»§a tĂ´i â€” báº¥m Ä‘á»ƒ cháº¥m â™¥">â™¥' + (myRating > 0 ? ' ' + myRating : '') + '</button>' +
        '<span class="card-progress">' + (totalEp ? totalEp + '/' + totalEp : '?/?') + '</span>' +
      '</span>';

    return (
      '<article class="anime-card" data-id="' + esc(a.id) + '" role="button" tabindex="0" aria-label="Xem chi tiáº¿t ' + esc(a.title) + '">' +
        '<div class="card-poster">' + img +
          '<span class="card-status ' + statusClass(a.status) + '">' + esc(a.status || '') + '</span>' +
          statusUI +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + esc(a.title || '') + '</h3>' +
          '<div class="card-meta">' +
            '<span class="card-rating">â˜… ' + rating.toFixed(1) + '</span>' +
            metaRight +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     9. RENDER SONG LIST
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function renderSongList() {
    const list = $('#songList');
    const empty = $('#songEmpty');
    const count = $('#songCount');
    if (!list || !empty || !count) return; // Danh sĂ¡ch phĂ¡t Ä‘Ă£ bá»‹ gá»¡ khá»i giao diá»‡n
    count.textContent = State.songs.length + ' bĂ i';
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
        : '<div class="song-thumb">đŸœ</div>';
      return (
        '<div class="song-item' + (State.currentSong && State.currentSong.id === s.id ? ' active' : '') + '" data-id="' + esc(s.id) + '" tabindex="0" role="button">' +
          thumb +
          '<div class="song-info">' +
            '<p class="song-title">' + esc(s.title || 'KhĂ´ng tĂªn') + '</p>' +
            '<p class="song-sub">' + esc([s.artist, s.anime].filter(Boolean).join(' Â· ') || 'â€”') + '</p>' +
          '</div>' +
          '<span class="song-badge ' + (hasSub ? 'song-has-sub' : '') + '">' + (hasSub ? 'đŸ’¬ .ass' : esc(s.song_type || 'OST')) + '</span>' +
        '</div>'
      );
    }).join('');
    updateLoadMore('#songLoadMoreWrap', State.songs.length - State.songVisible);
  }

  // Event delegation: click bĂ i hĂ¡t
  const songListEl = $('#songList');
  if (songListEl) {
    songListEl.addEventListener('click', (e) => {
      const item = e.target.closest('.song-item');
      if (!item) return;
      const song = State.songs.find((s) => s.id === item.dataset.id);
      if (song) playSong(song);
    });
  }


  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     10. ANIME DETAIL MODAL
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    // Tráº¡ng thĂ¡i xem + Ä‘iá»ƒm Ä‘Ă¡nh giĂ¡ cá»§a riĂªng chá»§ web
    const mySt = myStatusMeta(a.my_status);
    const myRating = Number(a.my_rating) || 0;
    const myIcons = State.isAdmin ? watchIconsHTML(a) : '';

    const poster = a.poster_url
      ? '<img src="' + esc(a.poster_url) + '" alt="' + esc(a.title) + '" loading="lazy" data-title="' + esc(a.title) + '" onerror="window.__posterFallback(this, this.dataset.title)" />'
      : '<div class="poster-fallback">đŸ</div>';

    // LĂ m sáº¡ch synopsis: chuyá»ƒn <br> thĂ nh xuá»‘ng dĂ²ng, gá»™p dĂ²ng trá»‘ng liĂªn tiáº¿p, cáº¯t khoáº£ng tráº¯ng 2 Ä‘áº§u Ä‘á»ƒ cÄƒn Ä‘á»u mÆ°á»£t hÆ¡n
    const synopsis =
      String(a.synopsis || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() || 'ChÆ°a cĂ³ mĂ´ táº£.';

    // â•â• Pháº§n trĂ¡i: poster + thĂ´ng tin nhanh â•â•
    const sideRows = [];
    if (a.status) {
      sideRows.push(
        '<div class="detail-side-row">' +
          '<span class="detail-side-label">Tráº¡ng thĂ¡i</span>' +
          '<span class="detail-side-value">' + esc(a.status) + '</span>' +
        '</div>'
      );
    }
    sideRows.push(
      '<div class="detail-side-row">' +
        '<span class="detail-side-label">Äiá»ƒm cá»™ng Ä‘á»“ng</span>' +
        '<span class="detail-side-value detail-rating">â˜… ' + rating.toFixed(1) + '/10</span>' +
      '</div>'
    );
    sideRows.push(
      '<div class="detail-side-row detail-side-progress">' +
        '<span class="detail-side-label">Tiáº¿n Ä‘á»™</span>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="detail-progress-text">' + watched + ' / ' + (total || '?') + ' táº­p Â· ' + pct + '%</span>' +
      '</div>'
    );

    // â•â• Pháº§n pháº£i: thá»ƒ loáº¡i (5 cĂ¡i + nĂºt má»Ÿ rá»™ng) + chips + synopsis + seiyuu â•â•
    const chips = [];
    const maxGenres = 5;
    const genreBtns = genres.map((g) =>
      '<button type="button" class="chip chip-btn" data-search="' + esc(g) + '" title="TĂ¬m anime theo thá»ƒ loáº¡i">' + esc(g) + '</button>'
    ).join('');
    const genreMore = genres.length > maxGenres
      ? '<button type="button" class="chip chip-more" data-genre-more title="Xem toĂ n bá»™ thá»ƒ loáº¡i"><span data-more-caret>â–¾</span> <span data-more-label>' + (genres.length - maxGenres) + ' thá»ƒ loáº¡i</span></button>'
      : '';
    chips.push('<div class="genre-chips' + (genres.length > maxGenres ? ' has-more' : '') + '">' + genreBtns + genreMore + '</div>');
    chips.push('<span class="chip">đŸ“º ' + (total || '?') + ' táº­p</span>');
    chips.push('<span class="chip my-status-chip ' + mySt.cls + '">' + mySt.icon + ' ' + esc(mySt.label) + '</span>');
    if (myRating > 0) chips.push('<span class="chip chip-mine">â™¥ ' + myRating + '/10</span>');

    const seiyuuSection = seiyuu.length
      ? '<details class="detail-section detail-collapse">' +
          '<summary class="detail-collapse-head">' +
            '<h3 class="detail-section-title">đŸ¤ DĂ n diá»…n viĂªn lá»“ng tiáº¿ng (Seiyuu)</h3>' +
            '<span class="detail-collapse-caret">â–¾</span>' +
          '</summary>' +
          '<div class="seiyuu-grid">' +
            seiyuu.map((s) => {
              // áº¢nh chĂ­nh = áº£nh nhĂ¢n váº­t (character art), áº£nh nhá» = seiyuu
              const vaImg = s.image ? '<img src="' + esc(s.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />' : '';
              const charImg = s.charImage
                ? '<img class="seiyuu-char-img" src="' + esc(s.charImage) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />'
                : '';
              const main = charImg || vaImg || '<span>đŸ™</span>';
              const badge = s.charImage && vaImg ? '<span class="seiyuu-va-badge">' + vaImg + '</span>' : '';
              return (
                '<div class="seiyuu-card">' +
                  '<div class="seiyuu-avatar">' + main + badge + '</div>' +
                  '<div class="seiyuu-info">' +
                    '<button type="button" class="seiyuu-name seiyuu-link" data-search="' + esc(s.name || '') + '" title="TĂ¬m anime theo diá»…n viĂªn">' + esc(s.name || '') + '</button>' +
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
            '<p class="detail-subtitle">' + esc([a.studio, a.year].filter(Boolean).join(' Â· ') || 'â€”') + '</p>' +
          '</header>' +
          '<div class="detail-chips">' + chips.join('') + '</div>' +
          '<section class="detail-section">' +
            '<h3 class="detail-section-title">đŸ“– TĂ³m táº¯t (Synopsis)</h3>' +
            '<div class="detail-synopsis-scroll"><p class="detail-synopsis">' + esc(synopsis) + '</p></div>' +
          '</section>' +
          seiyuuSection +
        '</div>' +
      '</div>';
  }

  // DĂ£y icon tráº¡ng thĂ¡i xem + Ä‘iá»ƒm cá»§a tĂ´i (chá»‰ admin) â€” Ä‘áº·t ngay dÆ°á»›i áº£nh bĂ¬a, báº¥m lĂ  lÆ°u liá»n
  function watchIconsHTML(a) {
    const cur = myStatusMeta(a.my_status);
    const myRating = Math.round(Number(a.my_rating) || 0);
    const opts = [
      { value: 'ÄĂ£ xem', icon: 'âœ…', cls: 'my-watched' },
      { value: 'Äang xem', icon: 'â³', cls: 'my-watching' },
      { value: 'Muá»‘n xem', icon: 'â•', cls: 'my-planned' },
      { value: 'ChÆ°a xem', icon: 'â¬œ', cls: 'my-unwatched' }
    ];
    const icoBtn = (o) =>
      '<button type="button" class="watch-ico ' + o.cls + (o.value === cur.label ? ' on' : '') +
      '" data-status="' + esc(o.value) + '" title="' + (o.value === 'Äang xem' ? 'Äang xem â€” báº¥m Ä‘á»ƒ chá»n táº­p Ä‘Ă£ xem' : o.value) + '">' + o.icon + '</button>';
    return (
      '<div class="detail-watch-icons" id="myTracker" data-anime="' + esc(a.id) + '">' +
        icoBtn(opts[0]) + icoBtn(opts[1]) + icoBtn(opts[2]) + icoBtn(opts[3]) +
        '<span class="watch-ico-sep" aria-hidden="true"></span>' +
        '<button type="button" class="watch-ico heart' + (myRating > 0 ? ' on' : '') + '" id="myRatingBtn" title="Äiá»ƒm cá»§a tĂ´i ' + (myRating > 0 ? myRating + '/10' : '(chÆ°a cháº¥m)') + ' â€” báº¥m Ä‘á»ƒ cháº¥m â™¥">â™¥' + (myRating > 0 ? '<b>' + myRating + '</b>' : '') + '</button>' +
      '</div>'
    );
  }

  // LÆ°u nhanh má»™t/nhiá»u trÆ°á»ng â€œcá»§a tĂ´iâ€ (my_status / my_rating / watched_episodes)
  async function saveMyTracker(animeId, patch) {
    if (!State.isAdmin) { toast('Báº¡n khĂ´ng cĂ³ quyá»n.', 'error'); return false; }
    const { error } = await State.supabase.from('animes').update(patch).eq('id', animeId);
    if (error) { toast('LÆ°u tháº¥t báº¡i: ' + error.message, 'error', 5000); return false; }
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

  // â”€â”€ Popup mini: chá»n táº­p Ä‘Ă£ xem / cháº¥m Ä‘iá»ƒm â™¥ â”€â”€
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

  // Popup chá»n táº­p Ä‘Ă£ xem (1 â†’ tá»•ng táº­p), lÆ°u watched_episodes + tráº¡ng thĂ¡i
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
    pop.innerHTML = '<div class="mini-pop-title">đŸ¬ ÄĂ£ xem Ä‘áº¿n táº­p...</div><div class="mini-pop-grid">' + opts + '</div>';
    openMiniPop(pop, anchor);
  }

  // Popup cháº¥m Ä‘iá»ƒm â™¥ (10 â™¥ + nĂºt xoĂ¡)
  function openHeartPop(anchor, id) {
    const a = State.animes.find((x) => String(x.id) === String(id));
    if (!a) return;
    const cur = Math.max(0, Math.min(10, Math.round(Number(a.my_rating) || 0)));
    let hearts = '<button type="button" class="heart-opt heart-clear" data-val="0" title="XoĂ¡ Ä‘iá»ƒm">âœ•</button>';
    for (let i = 1; i <= 10; i++) {
      hearts += '<button type="button" class="heart-opt' + (i <= cur ? ' on' : '') + '" data-val="' + i + '" title="' + i + '/10">' + (i <= cur ? 'â™¥' : 'â™¡') + '</button>';
    }
    const pop = $('#heartPop');
    if (!pop) return;
    pop.dataset.anime = String(a.id);
    pop.style.minWidth = '';
    pop.innerHTML = '<div class="mini-pop-title">â™¥ Cháº¥m Ä‘iá»ƒm (0â€“10) â€” báº¥m 1 cĂ¡i lĂ  lÆ°u</div><div class="mini-pop-hearts">' + hearts + '</div>';
    openMiniPop(pop, anchor);
  }

  // Menu tráº¡ng thĂ¡i nhanh trĂªn card: 4 lá»±a chá»n (báº¥m đŸŒ¸ â†’ chá»n 1, lÆ°u liá»n; "Äang xem" má»Ÿ popup chá»n táº­p)
  function openStatusMenu(anchor, id) {
    const a = State.animes.find((x) => String(x.id) === String(id));
    if (!a) return;
    const cur = myStatusMeta(a.my_status).label;
    const items = [
      { label: 'Muá»‘n xem', icon: 'â•', hint: '' },
      { label: 'ÄĂ£ xem', icon: 'âœ…', hint: '' },
      { label: 'ChÆ°a xem', icon: 'â¬œ', hint: '' },
      { label: 'Äang xem', icon: 'â³', hint: 'chá»n táº­p Ä‘Ă£ xem' }
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
    pop.innerHTML = '<div class="mini-pop-title">đŸŒ¸ Äáº·t tráº¡ng thĂ¡i xem</div><div class="mini-pop-statuses">' + btns + '</div>';
    openMiniPop(pop, anchor);
  }
  async function pickEpisode(id, ep) {
    const a = State.animes.find((x) => String(x.id) === String(id));
    if (!a) return;
    const total = Number(a.total_episodes) || 0;
    const val = Math.max(1, Math.min(Number(ep) || 1, total > 0 ? total : Infinity));
    closeMiniPop();
    const my_status = total > 0 && val >= total ? 'ÄĂ£ xem' : 'Äang xem';
    await saveMyTracker(id, { my_status, watched_episodes: val });
    toast('ÄĂ£ cáº­p nháº­t: xem Ä‘áº¿n táº­p ' + val + '/' + (total || '?') + (my_status === 'ÄĂ£ xem' ? ' âœ…' : ''), 'success');
  }

  async function pickHeart(id, val) {
    closeMiniPop();
    const v = Math.max(0, Math.min(10, Number(val) || 0));
    await saveMyTracker(id, { my_rating: v });
    toast(v > 0 ? 'ÄĂ£ cháº¥m ' + v + '/10 â™¥' : 'ÄĂ£ xoĂ¡ Ä‘iá»ƒm â™¥', 'success');
  }

  // NĂºt đŸŒ¸ trĂªn card: má»Ÿ menu tráº¡ng thĂ¡i (chá»n 1 trong 4; "Äang xem" má»Ÿ tiáº¿p popup chá»n táº­p)
  function handleCardQuick(ev, kind, id, btn) {
    if (kind === 'menu') {
      ev.__popOpened = true;
      openStatusMenu(btn, id);
    }
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     11. BĂŒNH LUáº¬N (comment section)
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
      console.error('Lá»—i Ä‘á»c bĂ¬nh luáº­n:', error);
      list.innerHTML = '<p class="empty-desc">KhĂ´ng táº£i Ä‘Æ°á»£c bĂ¬nh luáº­n.</p>';
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
    const author = c.author_name || 'áº¨n danh';
    let actions =
      '<div class="comment-actions">' +
        '<button class="comment-action-btn" data-quote-src="' + esc(c.content) + '" data-quote-author="' + esc(author) + '" title="Tráº£ lá»i báº±ng trĂ­ch dáº«n">â Tráº£ lá»i</button>';
    if (State.isAdmin) {
      actions +=
          '<button class="comment-action-btn" data-act="pin" data-id="' + esc(c.id) + '" title="' + (isPinned ? 'Bá» ghim' : 'Ghim') + '">' + (isPinned ? 'đŸ“Œ Ghim' : 'đŸ“ Ghim') + '</button>' +
          '<button class="comment-action-btn danger" data-act="del" data-id="' + esc(c.id) + '" title="XĂ³a">đŸ—‘</button>';
    }
    actions += '</div>';
    // Ná»™i dung dĂ i > 400 kĂ½ tá»± â†’ thu gá»n + nĂºt xem thĂªm / thu gá»n láº¡i
    const bodyHtml = renderRichText(c.content);
    const bodyInner = '<div class="comment-body long-text-body">' + bodyHtml + '</div>';
    const body = String(c.content || '').length > 400
      ? '<div class="long-text" data-expanded="false">' + bodyInner + '<button type="button" class="long-text-toggle">Xem thĂªm â–¾</button></div>'
      : bodyInner;
    return (
      '<div class="comment-item' + (isPinned ? ' pinned' : '') + '" data-id="' + esc(c.id) + '">' +
        '<div class="comment-head">' +
          '<span class="comment-author">' + esc(author) + '</span>' +
          (isPinned ? '<span class="pin-badge">đŸ“Œ ÄĂ£ ghim</span>' : '') +
          '<span class="comment-time">' + timeAgo(c.created_at) + '</span>' +
          actions +
        '</div>' +
        body +
      '</div>'
    );
  }

  // Táº£i toĂ n bá»™ chat chung (anime_id = null + táº¥t cáº£ bĂ¬nh luáº­n trong phim, kĂ¨m tĂªn anime)
  async function loadGlobalChat() {
    if (!State.supabase) return;
    const { data, error } = await State.supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Lá»—i Ä‘á»c chat chung:', error);
      return;
    }
    const comments = data || [];
    const animeMap = {};
    State.animes.forEach((a) => { animeMap[String(a.id)] = a; });
    State.chatAll = comments;
    State.chatMap = animeMap;
    renderGlobalChat();
  }

  // Render chat chung: preview (3 tin) khi thu gá»n; list Ä‘áº§y Ä‘á»§ khi má»Ÿ rá»™ng
  function renderGlobalChat() {
    const comments = State.chatAll || [];
    const map = State.chatMap || {};

    // Badge trĂªn nĂºt bong bĂ³ng: tá»•ng sá»‘ tin hiá»‡n cĂ³
    const badge = $('#chatFabBadge');
    const fab = $('#chatFab');
    if (badge) {
      badge.textContent = comments.length > 0 ? String(comments.length) : '';
      badge.hidden = comments.length === 0;
    }
    if (fab) {
      fab.setAttribute('aria-label', comments.length > 0
        ? 'Má»Ÿ Chat All (' + comments.length + ' tin)'
        : 'Má»Ÿ Chat All');
    }

    // List Ä‘áº§y Ä‘á»§
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
      // Discord style: tin má»›i nháº¥t á»Ÿ dÆ°á»›i cĂ¹ng, tin cÅ© hÆ¡n á»Ÿ phĂ­a trĂªn
      list.innerHTML = visible.slice().reverse().map((c) => chatHTML(c, map)).join('');
    }
    updateLoadMore('#chatLoadMoreWrap', comments.length - State.chatVisible);
  }

  // Cuá»™n vĂ¹ng tin chat xuá»‘ng dÆ°á»›i cĂ¹ng (hiá»ƒn thá»‹ tin má»›i nháº¥t)
  function scrollChatToBottom() {
    const wrap = $('#chatMessages') || $('#chatDockBody');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  // Bá» [quote]...[/quote] cÅ© trong ná»™i dung (trĂ¡nh quote lá»“ng nhau há»ng cáº¥u trĂºc)
  function stripQuotes(src) {
    return String(src || '').replace(/\[quote\][\s\S]*?\[\/quote\]/gi, '').trim();
  }

  // NĂºt "â Tráº£ lá»i" trong Chat All: chĂ¨n trĂ­ch dáº«n vĂ o Ä‘áº§u Ă´ nháº­p chat
  function quoteIntoChat(author, src) {
    const box = $('#chatBox');
    if (!box) return;
    const quote = '[quote]' + (author ? author + ':\n' : '') + stripQuotes(src) + '[/quote]\n\n';
    box.value = quote + box.value;
    box.focus();
  }

  // NĂºt "â Tráº£ lá»i" trong bĂ¬nh luáº­n anime: chĂ¨n trĂ­ch dáº«n vĂ o Ä‘áº§u Ă´ nháº­p bĂ¬nh luáº­n
  function quoteIntoComment(author, src) {
    const box = $('#commentBox');
    if (!box) return;
    const quote = '[quote]' + (author ? author + ':\n' : '') + stripQuotes(src) + '[/quote]\n\n';
    box.value = quote + box.value;
    box.focus();
  }

  // Báº­t/táº¯t "Xem thĂªm / Thu gá»n" cho bĂ¬nh luáº­n & tin nháº¯n dĂ i
  function toggleLongText(btn) {
    const wrap = btn.closest('.long-text');
    if (!wrap) return;
    const expanded = wrap.getAttribute('data-expanded') === 'true';
    wrap.setAttribute('data-expanded', expanded ? 'false' : 'true');
    btn.textContent = expanded ? 'Xem thĂªm â–¾' : 'Thu gá»n â–´';
  }

  // Render 1 tin chat chung dáº¡ng bong bĂ³ng; náº¿u cĂ³ anime_id â†’ thĂªm nhĂ£n phim
  function chatHTML(c, animeMap) {
    const anime = animeMap[String(c.anime_id)] || null;
    const isPinned = !!c.is_pinned;
    const author = c.author_name || 'áº¨n danh';
    // Bong bĂ³ng cá»§a mĂ¬nh (trĂ¹ng tĂªn Ä‘ang nháº­p á»Ÿ Ă´ chat) sáº½ cÄƒn pháº£i
    const ownAuthor = ($('#chatAuthor') && $('#chatAuthor').value.trim().toLowerCase()) || '';
    const isOwn = !!ownAuthor && String(author).trim().toLowerCase() === ownAuthor;
    let actions =
      '<div class="comment-actions">' +
        '<button class="comment-action-btn" data-quote-src="' + esc(c.content) + '" data-quote-author="' + esc(author) + '" title="Tráº£ lá»i báº±ng trĂ­ch dáº«n">â Tráº£ lá»i</button>';
    if (State.isAdmin) {
      actions +=
          '<button class="comment-action-btn" data-cact2="pin" data-id="' + esc(c.id) + '" title="' + (isPinned ? 'Bá» ghim' : 'Ghim') + '">' + (isPinned ? 'đŸ“Œ Ghim' : 'đŸ“ Ghim') + '</button>' +
          '<button class="comment-action-btn danger" data-cact2="del" data-id="' + esc(c.id) + '" title="XĂ³a">đŸ—‘</button>';
    }
    actions += '</div>';
    const tag = anime
      ? '<a href="#" class="chat-anime-tag" data-anime-id="' + esc(anime.id) + '" title="Má»Ÿ chi tiáº¿t ' + esc(anime.title) + '">đŸ¬ ' + esc(anime.title) + '</a>'
      : '<span class="chat-anime-tag chat-general">đŸ’¬ Chat All</span>';
    // Ná»™i dung dĂ i > 400 kĂ½ tá»± â†’ thu gá»n + nĂºt xem thĂªm / thu gá»n láº¡i
    const bodyHtml = renderRichText(c.content);
    const bodyInner = '<div class="comment-body chat-bubble-body long-text-body">' + bodyHtml + '</div>';
    const body = String(c.content || '').length > 400
      ? '<div class="long-text" data-expanded="false">' + bodyInner + '<button type="button" class="long-text-toggle">Xem thĂªm â–¾</button></div>'
      : bodyInner;
    return (
      '<div class="chat-bubble-row' + (isOwn ? ' own' : '') + '" data-id="' + esc(c.id) + '">' +
        '<div class="chat-bubble' + (isPinned ? ' pinned' : '') + '">' +
          '<div class="chat-bubble-head">' +
            '<span class="chat-bubble-author">' + esc(author) + '</span>' +
            tag +
            (isPinned ? '<span class="pin-badge">đŸ“Œ ÄĂ£ ghim</span>' : '') +
            '<span class="chat-bubble-time">' + timeAgo(c.created_at) + '</span>' +
            actions +
          '</div>' +
          body +
        '</div>' +
      '</div>'
    );
  }

  // Rate limiting: cháº·n gá»­i liĂªn tá»¥c trong 45s (dĂ¹ng chung cho cáº£ bĂ¬nh luáº­n & chat)
  function enforceRateLimit() {
    const now = Date.now();
    const diff = now - State.lastCommentAt;
    if (diff < 45000) {
      const remain = Math.ceil((45000 - diff) / 1000);
      $('#rateHint').textContent = 'â³ Chá» ' + remain + 's ná»¯a Ä‘á»ƒ gá»­i tiáº¿p.';
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
    if (!State.supabase) { toast('Há»‡ thá»‘ng chÆ°a sáºµn sĂ ng.', 'error'); return; }
    const loggedIn = State.isLoggedIn;
    const author = loggedIn
      ? (State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || 'ThĂ nh viĂªn')
      : $('#commentAuthor').value.trim();
    const content = $('#commentBox').value.trim();
    if (loggedIn && !State.nickname && !State.adminEmail) {
      toast('KhĂ´ng xĂ¡c Ä‘á»‹nh Ä‘Æ°á»£c tĂªn tĂ i khoáº£n. Vui lĂ²ng Ä‘Äƒng nháº­p láº¡i.', 'warning'); return;
    }
    if (!author) { toast('Vui lĂ²ng nháº­p tĂªn hiá»ƒn thá»‹.', 'warning'); return; }
    if (!content) { toast('Vui lĂ²ng nháº­p ná»™i dung bĂ¬nh luáº­n.', 'warning'); return; }
    if (!enforceRateLimit()) return;
    if (!loggedIn) {
      const captchaVal = parseInt($('#captchaInput').value, 10);
      if (isNaN(captchaVal) || captchaVal !== State.captcha.result) {
        toast('Sai káº¿t quáº£ captcha. Thá»­ láº¡i.', 'error');
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
      toast('KhĂ´ng gá»­i Ä‘Æ°á»£c bĂ¬nh luáº­n: ' + error.message, 'error', 5000);
      return;
    }
    State.lastCommentAt = Date.now();
    $('#commentBox').value = '';
    newCaptcha();
    toast('ÄĂ£ gá»­i bĂ¬nh luáº­n âœ…', 'success');
    loadComments(anime.id);
  }

  // Gá»­i tin nháº¯n chat chung (anime_id = null)
  function enforceChatRateLimit() {
    const now = Date.now();
    const diff = now - State.lastChatAt;
    if (diff < 45000) {
      const remain = Math.ceil((45000 - diff) / 1000);
      $('#chatRateHint').textContent = 'â³ Chá» ' + remain + 's ná»¯a Ä‘á»ƒ gá»­i tiáº¿p.';
      return false;
    }
    $('#chatRateHint').textContent = '';
    return true;
  }

  async function submitChat() {
    if (!State.supabase) { toast('Há»‡ thá»‘ng chÆ°a sáºµn sĂ ng.', 'error'); return; }
    const loggedIn = State.isLoggedIn;
    const author = loggedIn
      ? (State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || 'ThĂ nh viĂªn')
      : $('#chatAuthor').value.trim();
    const content = $('#chatBox').value.trim();
    if (loggedIn && !State.nickname && !State.adminEmail) {
      toast('KhĂ´ng xĂ¡c Ä‘á»‹nh Ä‘Æ°á»£c tĂªn tĂ i khoáº£n. Vui lĂ²ng Ä‘Äƒng nháº­p láº¡i.', 'warning'); return;
    }
    if (!author) { toast('Vui lĂ²ng nháº­p tĂªn hiá»ƒn thá»‹.', 'warning'); return; }
    if (!content) { toast('Vui lĂ²ng nháº­p ná»™i dung chat.', 'warning'); return; }
    if (!enforceChatRateLimit()) return;
    if (!loggedIn) {
      const captchaVal = parseInt($('#chatCaptchaInput').value, 10);
      if (isNaN(captchaVal) || captchaVal !== State.chatCaptcha.result) {
        toast('Sai káº¿t quáº£ captcha. Thá»­ láº¡i.', 'error');
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
      toast('KhĂ´ng gá»­i Ä‘Æ°á»£c tin nháº¯n: ' + error.message, 'error', 5000);
      return;
    }
    State.lastChatAt = Date.now();
    $('#chatBox').value = '';
    newChatCaptcha();
    toast('ÄĂ£ gá»­i tin nháº¯n đŸ’¬', 'success');
    loadGlobalChat();
    scrollChatToBottom();
  }

  // Xá»­ lĂ½ pin/delete (admin)
  async function handleCommentAction(act, id) {
    if (!State.isAdmin) return;
    if (act === 'del') {
      if (!confirm('XĂ³a bĂ¬nh luáº­n nĂ y?')) return;
      const { error } = await State.supabase.from('comments').delete().eq('id', id);
      if (error) { toast('XĂ³a tháº¥t báº¡i: ' + error.message, 'error'); return; }
      toast('ÄĂ£ xĂ³a bĂ¬nh luáº­n.', 'success');
    } else if (act === 'pin') {
      const item = document.querySelector('.comment-item[data-id="' + id + '"]');
      const isPinnedNow = item ? item.classList.contains('pinned') : false;
      const { error } = await State.supabase.from('comments').update({ is_pinned: !isPinnedNow }).eq('id', id);
      if (error) { toast('Ghim tháº¥t báº¡i: ' + error.message, 'error'); return; }
      toast(isPinnedNow ? 'ÄĂ£ bá» ghim.' : 'ÄĂ£ ghim đŸ“Œ', 'success');
    }
    if (State.currentAnime) loadComments(State.currentAnime.id);
  }

  // Xá»­ lĂ½ pin/delete trong chat chung (admin)
  async function handleChatAdminAction(act, id) {
    if (!State.isAdmin) return;
    if (act === 'del') {
      if (!confirm('XĂ³a tin nháº¯n nĂ y?')) return;
      const { error } = await State.supabase.from('comments').delete().eq('id', id);
      if (error) { toast('XĂ³a tháº¥t báº¡i: ' + error.message, 'error'); return; }
      toast('ÄĂ£ xĂ³a tin nháº¯n.', 'success');
      loadGlobalChat();
      if (State.currentAnime) loadComments(State.currentAnime.id);
    } else if (act === 'pin') {
      const row = document.querySelector('.chat-bubble-row[data-id="' + id + '"]');
      const bubble = row ? row.querySelector('.chat-bubble') : null;
      const isPinnedNow = bubble ? bubble.classList.contains('pinned') : false;
      const { error } = await State.supabase.from('comments').update({ is_pinned: !isPinnedNow }).eq('id', id);
      if (error) { toast('Ghim tháº¥t báº¡i: ' + error.message, 'error'); return; }
      toast(isPinnedNow ? 'ÄĂ£ bá» ghim.' : 'ÄĂ£ ghim đŸ“Œ', 'success');
      loadGlobalChat();
      if (State.currentAnime) loadComments(State.currentAnime.id);
    }
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     12. CLOUDINARY UNSIGNED UPLOAD (áº£nh bĂ¬nh luáº­n)
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function uploadImageToCloudinary(file) {
    // Kiá»ƒm tra loáº¡i file
    if (!file.type || !file.type.startsWith('image/')) {
      throw new Error('Chá»‰ cháº¥p nháº­n file áº£nh (image/*).');
    }
    // Kiá»ƒm tra dung lÆ°á»£ng <= 10MB
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('áº¢nh tá»‘i Ä‘a 10MB.');
    }
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', State.config.CLOUDINARY_UPLOAD_PRESET);
    form.append('cloud_name', State.config.CLOUDINARY_CLOUD_NAME);
    const res = await fetch(State.config.CLOUDINARY_UPLOAD_URL, { method: 'POST', body: form });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error('Upload Cloudinary tháº¥t báº¡i (' + res.status + ') ' + txt.slice(0, 120));
    }
    const data = await res.json();
    return data; // chá»©a secure_url, etc.
  }

  async function handleImageUpload() {
    const input = $('#uploadImgInput');
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const result = await uploadImageToCloudinary(file);
      const url = result.secure_url || result.url;
      if (!url) throw new Error('KhĂ´ng láº¥y Ä‘Æ°á»£c URL áº£nh.');
      insertAtCursor($('#commentBox'), '![' + esc(file.name || 'áº£nh') + '](' + esc(url) + ')');
      toast('ÄĂ£ táº£i áº£nh lĂªn Cloudinary âœ…', 'success');
    } catch (err) {
      toast('Lá»—i táº£i áº£nh: ' + err.message, 'error', 5000);
    }
    input.value = '';
  }

  // Toolbar soáº¡n tháº£o: chĂ¨n BBCode/Markdown vĂ o textarea
  function applyFormat(fmt) {
    applyFormatTo($('#commentBox'), fmt);
  }

  function applyFormatTo(box, fmt) {
    if (!box) return;
    const start = box.selectionStart != null ? box.selectionStart : box.value.length;
    const end = box.selectionEnd != null ? box.selectionEnd : start;
    const selected = box.value.slice(start, end) || 'vÄƒn báº£n';
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
        const url = prompt('Nháº­p URL:', 'https://');
        if (!url) return;
        insert = '[' + selected + '](' + url + ')';
        break;
      }
      case 'image': {
        const url = prompt('Nháº­p URL áº£nh:', 'https://');
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

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     PASTE THĂ”NG MINH: URL â†’ link, URL áº£nh â†’ áº£nh, file áº£nh â†’ upload
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  // ChĂ¨n text vĂ o vá»‹ trĂ­ con trá» trong textarea
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

  // Xá»­ lĂ½ khi ngÆ°á»i dĂ¹ng paste vĂ o Ă´ nháº­p (cáº£ bĂ¬nh luáº­n láº«n chat)
  function onSmartPaste(e, box) {
    const cd = e.clipboardData;
    if (!cd) return;
    // 1) Paste file áº£nh tá»« clipboard (vd: chá»¥p mĂ n hĂ¬nh, sao chĂ©p áº£nh) â†’ tá»± upload
    const items = Array.from(cd.items || []);
    const imageFile = items
      .map((it) => (it.kind === 'file' ? it.getAsFile() : null))
      .find((f) => f && f.type && f.type.startsWith('image/'));
    if (imageFile) {
      e.preventDefault();
      smartUploadImage(imageFile, box);
      return;
    }
    // 2) Paste text: náº¿u lĂ  URL â†’ tá»± chuyá»ƒn thĂ nh link / áº£nh
    const text = (cd.getData('text/plain') || '').trim();
    if (!text) return;
    if (isLikelyUrl(text)) {
      e.preventDefault();
      const isImg = IMG_URL_RE.test(text);
      const md = isImg ? '![' + text + '](' + text + ')' : '[' + text + '](' + text + ')';
      insertAtCursor(box, md);
      toast(isImg ? 'ÄĂ£ chĂ¨n áº£nh tá»« link âœ…' : 'ÄĂ£ chĂ¨n link âœ…', 'success');
    }
  }

  // Tá»± upload áº£nh dĂ¡n (paste) lĂªn Cloudinary rá»“i chĂ¨n markdown áº£nh
  async function smartUploadImage(file, box) {
    try {
      const result = await uploadImageToCloudinary(file);
      const url = result.secure_url || result.url;
      if (!url) throw new Error('KhĂ´ng láº¥y Ä‘Æ°á»£c URL áº£nh.');
      const md = '![' + esc(file.name || 'áº£nh') + '](' + esc(url) + ')';
      insertAtCursor(box, md);
      toast('ÄĂ£ táº£i áº£nh lĂªn Cloudinary âœ…', 'success');
    } catch (err) {
      toast('Lá»—i táº£i áº£nh: ' + err.message, 'error', 5000);
    }
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     13. AUTH â€” ÄÄ‚NG NHáº¬P/ÄÄ‚NG XUáº¤T ADMIN
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function updateLoginUI() {
    const icon = $('#loginBtnIcon');
    const label = $('#loginBtnLabel');
    const adminBtn = $('#adminBtn');
    if (State.isLoggedIn) {
      icon.textContent = State.isAdmin ? 'đŸ”‘' : 'đŸ‘¤';
      label.textContent = State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || (State.isAdmin ? 'Admin' : 'ThĂ nh viĂªn');
      adminBtn.classList.toggle('hidden', !State.isAdmin);
    } else {
      icon.textContent = 'đŸ‘¤';
      label.textContent = 'ÄÄƒng nháº­p';
      adminBtn.classList.add('hidden');
    }
  }

  $('#loginBtn').addEventListener('click', () => {
    if (State.isLoggedIn) {
      // ThoĂ¡t Ä‘Äƒng nháº­p
      if (confirm('ÄÄƒng xuáº¥t khá»i tĂ i khoáº£n?')) handleLogout();
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
      errEl.textContent = 'Vui lĂ²ng nháº­p Ä‘áº§y Ä‘á»§ email vĂ  máº­t kháº©u.';
      errEl.classList.remove('hidden');
      return;
    }
    const btn = $('#loginSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Äang Ä‘Äƒng nháº­p...';
    const { data, error } = await State.supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = 'ÄÄƒng nháº­p';
    if (error) {
      errEl.textContent = 'Sai email/máº­t kháº©u hoáº·c tĂ i khoáº£n khĂ´ng tá»“n táº¡i.';
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
      toast('ÄÄƒng nháº­p Admin thĂ nh cĂ´ng đŸ‰', 'success');
      renderAdminAnimeList();
      renderAdminSongList();
      renderAdminCommentList();
    } else {
      toast('ÄÄƒng nháº­p thĂ nh cĂ´ng đŸ‰', 'success');
    }
  }

  async function handleLogout(silent) {
    if (State.supabase) await State.supabase.auth.signOut();
    State.isAdmin = false;
    State.isLoggedIn = false;
    State.adminEmail = '';
    State.nickname = '';
    applyAuthState();
    if (!silent) toast('ÄĂ£ Ä‘Äƒng xuáº¥t.', 'info');
    closeModal('loginModal');
    closeModal('adminModal');
  }

  // Äá»•i tĂªn hiá»ƒn thá»‹ (nickname) cá»§a tĂ i khoáº£n Ä‘Ă£ Ä‘Äƒng nháº­p
  async function changeNickname() {
    if (!State.supabase || !State.isLoggedIn) return;
    const current = State.nickname || (State.adminEmail ? State.adminEmail.split('@')[0] : '') || '';
    const name = prompt('Nháº­p tĂªn hiá»ƒn thá»‹ má»›i (nickname) cho tĂ i khoáº£n:', current);
    if (name == null) return; // ngÆ°á»i dĂ¹ng báº¥m Há»§y
    const trimmed = name.trim();
    if (!trimmed) { toast('TĂªn hiá»ƒn thá»‹ khĂ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.', 'warning'); return; }
    if (trimmed.length > 60) { toast('TĂªn hiá»ƒn thá»‹ tá»‘i Ä‘a 60 kĂ½ tá»±.', 'warning'); return; }
    const btn = event && event.currentTarget;
    if (btn) btn.disabled = true;
    const { error } = await State.supabase.auth.updateUser({ data: { nickname: trimmed } });
    if (btn) btn.disabled = false;
    if (error) { toast('KhĂ´ng Ä‘á»•i Ä‘Æ°á»£c tĂªn hiá»ƒn thá»‹: ' + error.message, 'error', 5000); return; }
    State.nickname = trimmed;
    applyAuthState();
    toast('ÄĂ£ Ä‘á»•i tĂªn hiá»ƒn thá»‹ thĂ nh "' + trimmed + '" âœ…', 'success');
  }
  $('#commentRenameBtn').addEventListener('click', changeNickname);
  $('#chatRenameBtn').addEventListener('click', changeNickname);

  // XĂ³a cĂ¡c container admin khi Ä‘Äƒng xuáº¥t
  function clearAdminLists() {
    $('#adminAnimeList').innerHTML = '';
    $('#adminSongList').innerHTML = '';
    $('#adminCommentList').innerHTML = '';
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     14. ADMIN PANEL â€” CRUD ANIME
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function renderAdminAnimeList() {
    const list = $('#adminAnimeList');
    if (!State.isAdmin) { list.innerHTML = ''; return; }
    if (State.animes.length === 0) {
      list.innerHTML = '<p class="empty-desc">ChÆ°a cĂ³ anime nĂ o.</p>';
      return;
    }
    list.innerHTML = State.animes.map((a) =>
      '<div class="admin-row" data-id="' + esc(a.id) + '">' +
        '<div class="admin-row-thumb">' + (a.poster_url ? '<img src="' + esc(a.poster_url) + '" alt="" onerror="this.remove()" />' : 'đŸ') + '</div>' +
        '<div class="admin-row-info">' +
          '<div class="admin-row-title">' + esc(a.title) + '</div>' +
          '<div class="admin-row-sub">' + esc(a.status || '') + ' Â· â˜… ' + (Number(a.rating) || 0).toFixed(1) + '</div>' +
        '</div>' +
        '<div class="admin-row-actions">' +
          '<button class="mini-btn primary" data-apact="edit" data-id="' + esc(a.id) + '">âœï¸ Sá»­a</button>' +
          '<button class="mini-btn danger" data-apact="del" data-id="' + esc(a.id) + '">đŸ—‘ XĂ³a</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  function openAddAnimeForm() {
    resetAnimeForm();
    $('#animeFormTitle').textContent = 'ï¼‹ ThĂªm anime';
    $('#af_id').value = '';
    openModal('animeFormModal');
  }

  function openEditAnimeForm(animeId) {
    const a = State.animes.find((x) => x.id === animeId);
    if (!a) return;
    resetAnimeForm();
    $('#animeFormTitle').textContent = 'âœï¸ Sá»­a anime';
    $('#af_id').value = a.id;
    $('#af_title').value = a.title || '';
    $('#af_status').value = a.status || 'Äang chiáº¿u';
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
    $('#af_status').value = 'Äang chiáº¿u';
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
        '<input type="text" class="input" data-seiyuu="name" value="' + esc(s.name || '') + '" placeholder="TĂªn Seiyuu" />' +
        '<input type="text" class="input" data-seiyuu="character" value="' + esc(s.character || '') + '" placeholder="NhĂ¢n váº­t" />' +
        '<input type="text" class="input" data-seiyuu="image" value="' + esc(s.image || '') + '" placeholder="áº¢nh Seiyuu URL" />' +
        '<input type="text" class="input" data-seiyuu="charImage" value="' + esc(s.charImage || '') + '" placeholder="áº¢nh nhĂ¢n váº­t URL" />' +
        '<button type="button" class="seiyuu-remove" title="XĂ³a" aria-label="XĂ³a seiyuu">âœ•</button>';
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
    prev.innerHTML = url ? '<img src="' + esc(url) + '" alt="Xem trÆ°á»›c poster" onerror="this.remove()" />' : '';
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
    if (!State.isAdmin) { toast('Báº¡n khĂ´ng cĂ³ quyá»n.', 'error'); return; }
    const title = $('#af_title').value.trim();
    if (!title) { toast('Vui lĂ²ng nháº­p tĂªn anime.', 'warning'); return; }
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
      toast('LÆ°u tháº¥t báº¡i: ' + error.message, 'error', 5000);
      return;
    }
    toast('ÄĂ£ lÆ°u anime âœ…', 'success');
    closeModal('animeFormModal');
    await loadAnimes();
    renderAdminAnimeList();
  }

  async function deleteAnime(id) {
    if (!State.isAdmin) return;
    const a = State.animes.find((x) => x.id === id);
    if (!confirm('XĂ³a anime "' + (a ? a.title : '') + '"?')) return;
    const { error } = await State.supabase.from('animes').delete().eq('id', id);
    if (error) { toast('XĂ³a tháº¥t báº¡i: ' + error.message, 'error'); return; }
    toast('ÄĂ£ xĂ³a anime.', 'success');
    await loadAnimes();
    renderAdminAnimeList();
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     15. ADMIN PANEL â€” CRUD SONGS
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function renderAdminSongList() {
    const list = $('#adminSongList');
    if (!State.isAdmin) { list.innerHTML = ''; return; }
    if (State.songs.length === 0) {
      list.innerHTML = '<p class="empty-desc">ChÆ°a cĂ³ bĂ i hĂ¡t nĂ o.</p>';
      return;
    }
    list.innerHTML = State.songs.map((s) =>
      '<div class="admin-row" data-id="' + esc(s.id) + '">' +
        '<div class="admin-row-thumb">' + (s.cover_url ? '<img src="' + esc(s.cover_url) + '" alt="" onerror="this.remove()" />' : 'đŸœ') + '</div>' +
        '<div class="admin-row-info">' +
          '<div class="admin-row-title">' + esc(s.title || 'KhĂ´ng tĂªn') + '</div>' +
          '<div class="admin-row-sub">' + esc([s.artist, s.anime, s.song_type].filter(Boolean).join(' Â· ') || 'â€”') + '</div>' +
        '</div>' +
        '<div class="admin-row-actions">' +
          '<button class="mini-btn primary" data-spact="edit" data-id="' + esc(s.id) + '">âœï¸</button>' +
          '<button class="mini-btn danger" data-spact="del" data-id="' + esc(s.id) + '">đŸ—‘</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  function openSongForm(song) {
    $('#songFormTitle').textContent = song ? 'âœï¸ Sá»­a bĂ i hĂ¡t' : 'ï¼‹ ThĂªm bĂ i hĂ¡t';
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
    if (!State.isAdmin) { toast('Báº¡n khĂ´ng cĂ³ quyá»n.', 'error'); return; }
    const title = $('#sf_title').value.trim();
    const yid = parseYoutubeId($('#sf_youtube').value);
    if (!title) { toast('Vui lĂ²ng nháº­p tĂªn bĂ i hĂ¡t.', 'warning'); return; }
    if (!yid) { toast('YouTube ID khĂ´ng há»£p lá»‡.', 'warning'); return; }
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
    if (error) { toast('LÆ°u tháº¥t báº¡i: ' + error.message, 'error', 5000); return; }
    toast('ÄĂ£ lÆ°u bĂ i hĂ¡t âœ…', 'success');
    closeModal('songFormModal');
    await loadSongs();
    renderAdminSongList();
  }

  async function deleteSong(id) {
    if (!State.isAdmin) return;
    if (!confirm('XĂ³a bĂ i hĂ¡t nĂ y?')) return;
    const { error } = await State.supabase.from('songs').delete().eq('id', id);
    if (error) { toast('XĂ³a tháº¥t báº¡i: ' + error.message, 'error'); return; }
    toast('ÄĂ£ xĂ³a bĂ i hĂ¡t.', 'success');
    await loadSongs();
    renderAdminSongList();
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     16. ADMIN PANEL â€” QUáº¢N LĂ BĂŒNH LUáº¬N
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function renderAdminCommentList() {
    const list = $('#adminCommentList');
    if (!State.isAdmin) { list.innerHTML = ''; return; }
    const { data, error } = await State.supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { list.innerHTML = '<p class="empty-desc">Lá»—i táº£i bĂ¬nh luáº­n.</p>'; return; }
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="empty-desc">KhĂ´ng cĂ³ bĂ¬nh luáº­n nĂ o.</p>';
      return;
    }
    list.innerHTML = data.map((c) => {
      const animeName = c.anime_id == null
        ? 'đŸ’¬ Chat All'
        : ((State.animes.find((a) => a.id === c.anime_id) || {}).title || 'â€”');
      return (
        '<div class="admin-row" data-id="' + esc(c.id) + '">' +
          '<div class="admin-row-info">' +
            '<div class="admin-row-title">' + esc((c.author_name || 'áº¨n danh') + (c.is_pinned ? ' đŸ“Œ' : '')) + '</div>' +
            '<div class="admin-row-sub">' + esc((animeName || 'â€”') + ' Â· ' + timeAgo(c.created_at)) + '</div>' +
          '</div>' +
          '<div class="admin-row-actions">' +
            '<button class="mini-btn primary" data-cact="pin" data-id="' + esc(c.id) + '">' + (c.is_pinned ? 'Bá» ghim' : 'Ghim') + '</button>' +
            '<button class="mini-btn danger" data-cact="del" data-id="' + esc(c.id) + '">đŸ—‘</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  async function adminCommentAction(act, id) {
    if (!State.isAdmin) return;
    if (act === 'del') {
      if (!confirm('XĂ³a bĂ¬nh luáº­n nĂ y?')) return;
      const { error } = await State.supabase.from('comments').delete().eq('id', id);
      if (error) { toast('Lá»—i: ' + error.message, 'error'); return; }
      toast('ÄĂ£ xĂ³a.', 'success');
    } else if (act === 'pin') {
      const row = document.querySelector('#adminCommentList .admin-row[data-id="' + id + '"]');
      const isPinned = row ? (row.querySelector('.admin-row-title').textContent.includes('đŸ“Œ')) : false;
      const { error } = await State.supabase.from('comments').update({ is_pinned: !isPinned }).eq('id', id);
      if (error) { toast('Lá»—i: ' + error.message, 'error'); return; }
      toast(isPinned ? 'ÄĂ£ bá» ghim.' : 'ÄĂ£ ghim đŸ“Œ', 'success');
    }
    await renderAdminCommentList();
    if (State.currentAnime) loadComments(State.currentAnime.id);
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     17. ANILIST API â€” AUTO-FILL FORM
     (Thay tháº¿ Jikan/MAL â€” AniList GraphQL miá»…n phĂ­, khĂ´ng cáº§n
     key, á»•n Ä‘á»‹nh hÆ¡n nhiá»u so vá»›i Jikan hay bá»‹ quĂ¡ táº£i 504)
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function anilistSearch(query) {
    if (State.jikanAbort) State.jikanAbort.abort();
    State.jikanAbort = new AbortController();
    const results = $('#jikanResults');
    results.innerHTML = '<p class="empty-desc">Äang tra cá»©u trĂªn AniList...</p>';
    show('jikanResults');
    try {
      const gql = 'query ($search: String) { Page(page: 1, perPage: 6) { media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { id title { romaji english } coverImage { extraLarge large } description status averageScore seasonYear studios(isMain: true) { nodes { name } } episodes genres } } }';
      let data = null;
      let lastErr = null;
      // Thá»­ láº¡i tá»‘i Ä‘a 3 láº§n náº¿u gáº·p lá»—i táº¡m thá»i (429/503/504)
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
      if (!data) throw lastErr || new Error('KhĂ´ng cĂ³ pháº£n há»“i tá»« AniList.');
      const items = (data && data.data && data.data.Page && data.data.Page.media) || [];
      if (items.length === 0) {
        results.innerHTML = '<p class="empty-desc">KhĂ´ng tĂ¬m tháº¥y anime nĂ o. Thá»­ tĂªn khĂ¡c hoáº·c Ä‘iá»n thá»§ cĂ´ng bĂªn dÆ°á»›i.</p>';
        return;
      }
      results.innerHTML = items.map((it) => {
        const thumb = (it.coverImage && (it.coverImage.extraLarge || it.coverImage.large)) || '';
        const subParts = [];
        subParts.push(it.episodes != null ? it.episodes + ' táº­p' : 'ChÆ°a rĂµ sá»‘ táº­p');
        if (it.seasonYear) subParts.push(String(it.seasonYear));
        if (it.averageScore != null && it.averageScore > 0) subParts.push(Math.round(it.averageScore / 10) + '/10 Ä‘iá»ƒm');
        return (
          '<div class="jikan-result-item" data-json="' + esc(JSON.stringify(it)).replace(/"/g, '&quot;') + '">' +
            '<div class="jikan-result-thumb">' + (thumb ? '<img src="' + esc(thumb) + '" alt="" loading="lazy" onerror="this.remove()" />' : '') + '</div>' +
            '<div class="jikan-result-info">' +
              '<div class="jikan-result-title">' + esc((it.title && (it.title.romaji || it.title.english)) || '') + '</div>' +
              '<div class="jikan-result-sub">' + esc(subParts.join(' Â· ')) + '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        results.innerHTML = '<p class="empty-desc">Lá»—i tra cá»©u AniList: ' + esc(err.message) + '. CĂ³ thá»ƒ thá»­ láº¡i hoáº·c Ä‘iá»n thá»§ cĂ´ng bĂªn dÆ°á»›i.</p>';
      }
    }
  }

  // Gá»i AniList GraphQL Ä‘Æ¡n giáº£n (khĂ´ng retry)
  async function anilistGraphQL(query, variables) {
    const res = await fetch(State.config.ANILIST_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    return res.ok ? await res.json() : null;
  }

  // Fetch dĂ n diá»…n viĂªn lá»“ng tiáº¿ng + áº¢NH NHĂ‚N Váº¬T theo id AniList
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

  // TĂ¬m id AniList theo tĂªn anime (dĂ¹ng cho backfill áº£nh nhĂ¢n váº­t)
  async function anilistFindIdByTitle(title) {
    const gql = 'query ($search: String) { Page(page: 1, perPage: 1) { media(search: $search, type: ANIME, isAdult: false) { id title { romaji english } } } }';
    const data = await anilistGraphQL(gql, { search: title });
    const m = data && data.data && data.data.Page && data.data.Page.media;
    return (m && m[0] && m[0].id) || null;
  }

  // NĂºt "Láº¥y áº£nh nhĂ¢n váº­t": bá»• sung áº£nh nhĂ¢n váº­t (character art) cho anime cÅ© theo tĂªn tá»« AniList
  async function backfillCharacterImages() {
    if (!State.isAdmin) { toast('Báº¡n khĂ´ng cĂ³ quyá»n.', 'error'); return; }
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
      toast('Láº¥y áº£nh nhĂ¢n váº­t: ' + (i + 1) + '/' + list.length + ' â€” ' + (a.title || ''), 'info');
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
        console.warn('Lá»—i backfill áº£nh nhĂ¢n váº­t cho', a.title, err);
      }
      await sleep(600);
    }
    btn.disabled = false;
    renderAnimeGrid();
    toast('Xong! ÄĂ£ bá»• sung áº£nh nhĂ¢n váº­t cho ' + updated + ' anime' + (skipped ? ' (bá» qua ' + skipped + ' Ä‘Ă£ cĂ³/khĂ´ng cĂ³ nhĂ¢n váº­t)' : '') + '.', 'success', 6000);
  }

  // Äiá»n dá»¯ liá»‡u AniList vĂ o form + fetch seiyuu + áº£nh nhĂ¢n váº­t
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

    // Fetch seiyuu + áº£nh nhĂ¢n váº­t tá»« AniList characters
    toast('Äang táº£i dĂ n Seiyuu + áº£nh nhĂ¢n váº­t...', 'info', 1200);
    try {
      const voices = await anilistFetchCast(it.id);
      if (voices.length) renderSeiyuuEditors(voices);
    } catch (_e) { /* bá» qua lá»—i seiyuu */ }
  }

  // XoĂ¡ tháº» HTML (AniList tráº£ description dáº¡ng rich text)
  function stripHtml(html) {
    const t = document.createElement('textarea');
    t.innerHTML = String(html || '');
    return t.value;
  }

  function mapAnilistStatus(s) {
    const map = {
      'RELEASING': 'Äang chiáº¿u',
      'FINISHED': 'HoĂ n thĂ nh',
      'NOT_YET_RELEASED': 'Sáº¯p chiáº¿u',
      'CANCELLED': 'Táº¡m ngÆ°ng',
      'HIATUS': 'Táº¡m ngÆ°ng'
    };
    return map[s] || 'Äang chiáº¿u';
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     18. BACKUP â€” EXPORT JSON
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function exportBackup() {
    if (!State.isAdmin) return;
    const btn = $('#exportBackupBtn');
    btn.disabled = true;
    btn.textContent = 'Äang xuáº¥t...';
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
      toast('ÄĂ£ xuáº¥t backup âœ…', 'success');
    } catch (err) {
      toast('Xuáº¥t backup tháº¥t báº¡i: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'đŸ“¥ Export Backup JSON';
    }
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     19. EVENT BINDINGS (delegated handlers)
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function bindEvents() {
    // Brand: cuá»™n vá» Ä‘áº§u trang
    const brandBtn = $('#brandBtn');
    if (brandBtn) brandBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Tab Section (Anime / Music) â€” work vá»›i .main-nav cĂ³ [data-tab]
    $('.main-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) switchTab(btn.dataset.tab);
    });

    // Má»Ÿ modal anime khi click card + nĂºt tráº¡ng thĂ¡i nhanh (admin)
    $('#animeGrid').addEventListener('click', (e) => {
      const card = e.target.closest('.anime-card');
      if (!card || !card.dataset.id) return;

      // NĂºt Ä‘iá»ƒm â™¥ á»Ÿ meta: báº¥m Ä‘á»ƒ má»Ÿ popup cháº¥m Ä‘iá»ƒm â™¥ (menu 10 tim, khĂ´ng má»Ÿ modal)
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

    // Click thá»ƒ loáº¡i / diá»…n viĂªn trong modal anime â†’ tĂ¬m anime theo tá»« Ä‘Ă³
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

    // Lá»c & sáº¯p xáº¿p anime Ä‘Ă£ render sáºµn qua renderAnimeGrid()
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

    // Danh sĂ¡ch file .ass: tĂ¬m kiáº¿m + click Ä‘á»ƒ phĂ¡t theo YouTube ID
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

    // Báº­t/táº¯t phá»¥ Ä‘á» .ass
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

    // SUB â™ï¸ â€” má»Ÿ popup cĂ i Ä‘áº·t phá»¥ Ä‘á»
    const subsSettingsBtn = $('#subsSettingsBtn');
    if (subsSettingsBtn) {
      subsSettingsBtn.addEventListener('click', () => {
        toggleSubPopup();
      });
    }

    // NĂºt phĂ³ng to video full mĂ n hĂ¬nh + cáº­p nháº­t icon khi vĂ o/thoĂ¡t fullscreen
    const videoFsBtn = $('#videoFullscreenBtn');
    if (videoFsBtn) {
      videoFsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVideoFullscreen();
      });
    }
    document.addEventListener('fullscreenchange', updateVideoFsIcon);
    document.addEventListener('webkitfullscreenchange', updateVideoFsIcon); // Safari

    // Äiá»u khiá»ƒn player: lĂ¹i / phĂ¡t-táº¡m dá»«ng / káº¿ tiáº¿p / tá»± Ä‘á»™ng / ngáº«u nhiĂªn
    $('#pcPrev').addEventListener('click', playPrevSong);
    $('#pcPlay').addEventListener('click', togglePlay);
    $('#pcNext').addEventListener('click', playNextSong);
    const pcAuto = $('#pcAuto');
    if (pcAuto) pcAuto.addEventListener('click', () => { State.autoNext = !State.autoNext; savePlayerPrefs(); updatePlayerControlsUI(); });
    const pcShuffle = $('#pcShuffle');
    if (pcShuffle) pcShuffle.addEventListener('click', () => { State.shuffle = !State.shuffle; savePlayerPrefs(); updatePlayerControlsUI(); });

    // BĂ¬nh luáº­n: gá»­i & captcha & toolbar (bold/italic/.../) + paste tá»± xá»­ lĂ½ link/áº£nh
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

    // Chat chung (sticky dock): gá»­i & captcha & toolbar & paste & click nhĂ£n anime & má»Ÿ rá»™ng
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
    // Báº­t/táº¯t panel chat tá»« nĂºt bong bĂ³ng (FAB)
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
        // KHĂ”NG tá»± focus Ă´ nháº­p â†’ trĂ¡nh bĂ n phĂ­m áº£o tá»± báº­t trĂªn Ä‘iá»‡n thoáº¡i
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
      // Click nhĂ£n anime trong chat (cáº£ preview láº«n list) â†’ má»Ÿ modal chi tiáº¿t
      const tag = e.target.closest('[data-anime-id]');
      if (tag) {
        e.preventDefault();
        const a = State.animes.find((x) => String(x.id) === String(tag.dataset.animeId));
        if (a) openAnimeDetail(a);
        return;
      }
      // NĂºt tráº£ lá»i báº±ng trĂ­ch dáº«n (ai cÅ©ng dĂ¹ng Ä‘Æ°á»£c, ká»ƒ cáº£ chÆ°a Ä‘Äƒng nháº­p)
      const q = e.target.closest('[data-quote-src]');
      if (q) {
        e.preventDefault();
        quoteIntoChat(q.dataset.quoteAuthor, q.dataset.quoteSrc);
        return;
      }
      // NĂºt xem thĂªm / thu gá»n bĂ¬nh luáº­n dĂ i
      const tg = e.target.closest('.long-text-toggle');
      if (tg) { toggleLongText(tg); return; }
      // Admin actions trong chat
      const btn = e.target.closest('[data-cact2]');
      if (btn) handleChatAdminAction(btn.dataset.cact2, btn.dataset.id);
    });

    // Báº¥m bĂªn ngoĂ i khung chat â†’ áº©n khung chat (ná»™i dung Ä‘ang nháº­p váº«n giá»¯ láº¡i)
    document.addEventListener('click', (e) => {
      if (!State.chatExpanded) return;
      if (e.target.closest('#chatDock') || e.target.closest('#chatFab')) return;
      if (State.chatExpanded) toggleChatPanel();
    });

    // Admin: má»Ÿ panel
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

    // NĂºt thĂªm anime, bĂ i hĂ¡t
    $('#addAnimeBtn').addEventListener('click', openAddAnimeForm);
    $('#addSongBtn').addEventListener('click', () => openSongForm(null));

    // Forms
    $('#loginForm').addEventListener('submit', handleLogin);
    $('#animeForm').addEventListener('submit', saveAnime);
    $('#songForm').addEventListener('submit', saveSong);

    // Seiyuu thĂªm dĂ²ng
    $('#addSeiyuuBtn').addEventListener('click', () => {
      const wrap = $('#afSeiyuuList');
      const row = document.createElement('div');
      row.className = 'seiyuu-editor-row';
      row.innerHTML =
        '<input type="text" class="input" data-seiyuu="name" placeholder="TĂªn Seiyuu" />' +
        '<input type="text" class="input" data-seiyuu="character" placeholder="NhĂ¢n váº­t" />' +
        '<input type="text" class="input" data-seiyuu="image" placeholder="áº¢nh Seiyuu URL" />' +
        '<input type="text" class="input" data-seiyuu="charImage" placeholder="áº¢nh nhĂ¢n váº­t URL" />' +
        '<button type="button" class="seiyuu-remove" title="XĂ³a">âœ•</button>';
      row.querySelector('.seiyuu-remove').addEventListener('click', () => row.remove());
      wrap.appendChild(row);
    });

    // AniList tĂ¬m kiáº¿m (input id = jikanQuery)
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
        toast('ÄĂ£ Ä‘iá»n dá»¯ liá»‡u tá»« AniList âœ…', 'success');
      } catch (err) {
        toast('Lá»—i phĂ¢n tĂ­ch dá»¯ liá»‡u.', 'error');
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
        toast('ÄĂ£ táº£i poster lĂªn âœ…', 'success');
      } catch (err) {
        toast('Lá»—i táº£i áº£nh: ' + err.message, 'error', 5000);
      }
      e.target.value = '';
    });

    // Export backup
    $('#exportBackupBtn').addEventListener('click', exportBackup);

    // Láº¥y áº£nh nhĂ¢n váº­t cho toĂ n bá»™ anime cÅ© (admin)
    $('#backfillCharsBtn').addEventListener('click', () => backfillCharacterImages());

    // Comment actions trong modal anime (delegate)
    $('#animeModal').addEventListener('click', (e) => {
      // NĂºt tráº£ lá»i báº±ng trĂ­ch dáº«n (ai cÅ©ng dĂ¹ng Ä‘Æ°á»£c, ká»ƒ cáº£ chÆ°a Ä‘Äƒng nháº­p)
      const q = e.target.closest('[data-quote-src]');
      if (q) {
        e.preventDefault();
        quoteIntoComment(q.dataset.quoteAuthor, q.dataset.quoteSrc);
        return;
      }
      // NĂºt xem thĂªm / thu gá»n bĂ¬nh luáº­n dĂ i
      const tg = e.target.closest('.long-text-toggle');
      if (tg) { toggleLongText(tg); return; }
      const btn = e.target.closest('[data-act]');
      if (btn) handleCommentAction(btn.dataset.act, btn.dataset.id);
      // Thá»ƒ loáº¡i: nĂºt ">" má»Ÿ/Ä‘Ă³ng toĂ n bá»™
      const gmore = e.target.closest('[data-genre-more]');
      if (gmore) {
        const wrap = gmore.closest('.genre-chips');
        if (wrap) {
          const open = wrap.classList.toggle('open');
          const caret = wrap.querySelector('[data-more-caret]');
          const label = wrap.querySelector('[data-more-label]');
          if (caret) caret.textContent = open ? 'â–´' : 'â–¾';
          if (label) {
            label.textContent = open ? 'Thu gá»n' : (wrap.querySelectorAll('.chip-btn').length - 5) + ' thá»ƒ loáº¡i';
          }
        }
        return;
      }
      // Icon tráº¡ng thĂ¡i xem cá»§a tĂ´i â€” báº¥m lĂ  lÆ°u liá»n (â³ lÆ°u "Äang xem" + má»Ÿ popup chá»n táº­p)
      const watchIco = e.target.closest('.watch-ico');
      if (watchIco && watchIco.dataset.status) {
        const tracker = $('#myTracker');
        if (tracker && tracker.dataset.anime) {
          if (watchIco.dataset.status === 'Äang xem') {
            e.__popOpened = true;
            openEpisodePop(watchIco, tracker.dataset.anime);
            saveMyTracker(tracker.dataset.anime, { my_status: 'Äang xem' });
          } else {
            saveMyTracker(tracker.dataset.anime, { my_status: watchIco.dataset.status });
          }
        }
        return;
      }
      // NĂºt â™¥ trong tracker má»Ÿ popup cháº¥m Ä‘iá»ƒm
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

    // Popup mini (chá»n táº­p / cháº¥m â™¥): xá»­ lĂ½ chá»n + Ä‘Ă³ng khi báº¥m bĂªn ngoĂ i
    document.addEventListener('click', (e) => {
      // Menu tráº¡ng thĂ¡i (đŸŒ¸ trĂªn card): chá»n 1 â€” "Äang xem" má»Ÿ tiáº¿p popup chá»n táº­p
      const st = e.target.closest('#statusPop .status-opt');
      if (st) {
        const pop = $('#statusPop');
        const id = pop && pop.dataset.anime;
        if (id) {
          const lbl = String(st.dataset.status || '');
          if (lbl === 'Äang xem') {
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
            if (a && myStatusMeta(a.my_status).cls !== 'my-watching') saveMyTracker(id, { my_status: 'Äang xem' });
          } else {
            closeMiniPop();
            saveMyTracker(id, { my_status: lbl }).then((ok) => {
              if (ok) toast('ÄĂ£ Ä‘áº·t tráº¡ng thĂ¡i: ' + lbl, 'success');
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

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     20. SWITCH TAB (Anime / Music / Chat All)
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  // Táº£i chat 1 láº§n khi má»Ÿ web â€” khĂ´ng tá»± lĂ m má»›i Ä‘á»‹nh ká»³ (chá»‰ lĂ m má»›i khi táº£i láº¡i trang)
  function refreshChat() {
    loadGlobalChat();
  }

  // Upload áº£nh trong chat chung
  async function handleChatImageUpload() {
    const input = $('#chatUploadImgInput');
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const result = await uploadImageToCloudinary(file);
      const url = result.secure_url || result.url;
      if (!url) throw new Error('KhĂ´ng láº¥y Ä‘Æ°á»£c URL áº£nh.');
      const box = $('#chatBox');
      const imgMd = '![' + esc(file.name || 'áº£nh') + '](' + esc(url) + ')';
      box.value = (box.value || '') + (box.value ? '\n' : '') + imgMd;
      toast('ÄĂ£ táº£i áº£nh lĂªn âœ…', 'success');
    } catch (err) {
      toast('Lá»—i táº£i áº£nh: ' + err.message, 'error', 5000);
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
    // NĂºt SUB bong bĂ³ng cĂ i Ä‘áº·t phá»¥ Ä‘á»: chá»‰ hiá»‡n khi á»Ÿ tab Song (music)
    document.body.classList.toggle('is-song', tabName === 'music');
    // ÄĂ³ng popup cĂ i Ä‘áº·t phá»¥ Ä‘á» náº¿u Ä‘ang má»Ÿ khi rá»i tab Song
    if (tabName !== 'music') {
      const sp = _subPopupEl;
      const fab = $('#subsSettingsBtn');
      if (sp && sp.style.display !== 'none') {
        sp.style.display = 'none';
        if (fab) fab.setAttribute('aria-expanded', 'false');
      }
      // ThoĂ¡t fullscreen video náº¿u Ä‘ang báº­t
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    }
    // Äá»•i brand theo tab: KullAnime hoáº·c KullSong
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

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     21. KHá»I Táº O APP
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function init() {
    await initSupabase();
    ensureSubSettings(); // náº¡p cĂ i Ä‘áº·t phá»¥ Ä‘á» toĂ n cá»¥c tá»« localStorage
    loadPlayerPrefs();   // náº¡p tĂ¹y chá»n tá»± Ä‘á»™ng / ngáº«u nhiĂªn tá»« localStorage
    bindEvents();
    updatePlayerControlsUI();
    // KhĂ´i phá»¥c tab Ä‘ang active (máº·c Ä‘á»‹nh anime)
    switchTab('anime');
    // Táº£i dá»¯ liá»‡u cĂ´ng khai
    await Promise.all([loadAnimes(), loadSongs()]);
    fetchSubsFiles();
    updateLoginUI();
    refreshAuthState();
    // Khá»Ÿi Ä‘á»™ng chat chung (sticky bar) + captcha chat
    newChatCaptcha();
    refreshChat();
    // Dá»¯ liá»‡u cĂ´ng khai chá»‰ táº£i 1 láº§n khi má»Ÿ web â€” khĂ´ng tá»± lĂ m má»›i Ä‘á»‹nh ká»³
    // (trĂ¡nh "chá»›p" láº¡i giao diá»‡n khi trang má»Ÿ lĂ¢u). LĂ m má»›i khi táº£i láº¡i trang.
  }

  // Báº¯t Ä‘áº§u khi DOM sáºµn sĂ ng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


