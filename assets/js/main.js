/* ==========================================================================
   Pixora — site + toolkit runtime
   Zero dependencies. Everything runs in the visitor's browser; no image ever
   leaves the device.

   Toolkit pipeline: decode → proportional resize → flatten (optional)
                     → encode → download / zip
   Encoders: PNG, JPEG and WEBP come from the Canvas encoder; AVIF is used
   only when the browser actually supports writing it; BMP and ICO are encoded
   right here (see encodeBMP / encodeICO) so the format list does not depend on
   what the platform happens to ship.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* main.js 自己的 URL。AI 放大要按它反推 assets/ort 与 assets/models 的位置 ——
     页面有的在根目录、有的在 convert/xxx-to-yyy/ 下面，用相对路径写死必然有一处错。
     document.currentScript 只在脚本同步执行期间有效，所以必须在这里就取下来。 */
  var SELF = (document.currentScript && document.currentScript.src) ||
    (function () { var s = $('script[src*="assets/js/main.js"]'); return s && s.src; })() || null;

  /* ---------- Theme ---------- */
  var THEME_KEY = "pixora-theme";
  var root = document.documentElement;
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    /* The two <meta name="theme-color"> tags are media-scoped for the
       no-JS/first-paint case; once JS knows the real theme it owns the value,
       so drop the media condition — otherwise a manual toggle away from the
       OS preference leaves the browser chrome on the wrong colour. */
    $$('meta[name="theme-color"]').forEach(function (m) {
      m.removeAttribute("media");
      m.setAttribute("content", t === "dark" ? "#080c16" : "#ffffff");
    });
    $$("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-label", t === "dark" ? "切换到浅色模式" : "切换到深色模式");
      b.setAttribute("aria-pressed", String(t === "dark"));
    });
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    /* Same validation the inline bootstrap uses, so a corrupted localStorage
       entry can never leave the page on an unknown theme. */
    applyTheme(saved === "dark" || saved === "light" ? saved : (prefersDark ? "dark" : "light"));
  }
  $$("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    });
  });
  initTheme();

  /* ---------- Header + nav ---------- */
  var header = $(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-stuck", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  var navToggle = $(".nav-toggle"), nav = $(".nav");
  function closeNav() {
    if (!nav || !navToggle) return;
    nav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    $$(".nav a").forEach(function (a) { a.addEventListener("click", closeNav); });
    /* The drawer overlays the page on small screens, so it has to be
       dismissable the way a dialog is: Escape, a tap outside, or a jump. */
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNav(); });
    document.addEventListener("click", function (e) {
      if (!nav.classList.contains("open")) return;
      if (nav.contains(e.target) || navToggle.contains(e.target)) return;
      closeNav();
    });
  }

  /* ---------- Nav mega-menu ----------
     <details> gives us open/close, keyboard support and Escape for free. What
     it does not give is hover-to-open on a mouse, or closing when you click
     somewhere else — those are the two behaviours a desktop nav needs, so they
     are added here. On a coarse pointer the panel stays click-only, which is
     what a tap expects. */
  var navDrop = $(".nav-drop");
  if (navDrop) {
    var hoverOpen = window.matchMedia && window.matchMedia("(hover: hover) and (min-width: 901px)");
    var closeTimer = null;
    var openDrop = function () {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      navDrop.open = true;
    };
    var closeDrop = function () {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      navDrop.open = false;
    };
    /* The panel hangs from the header's bottom edge, so the trigger's own box
       ends a few pixels above it. Without a grace period the pointer crossing
       that sliver lands on .nav — outside <details> — and fires mouseleave
       mid-travel, snapping the panel shut exactly as the pointer reaches it.
       Wait a beat; re-entering cancels the close. */
    var scheduleClose = function () {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(function () { closeTimer = null; navDrop.open = false; }, 200);
    };
    if (hoverOpen && hoverOpen.matches) {
      navDrop.addEventListener("mouseenter", openDrop);
      navDrop.addEventListener("mouseleave", scheduleClose);
      /* Hover already opens the panel, so a pointer click on the trigger should
         do the useful thing rather than re-toggle it shut: follow the item to the
         conversion page it stands for. Keyboard activation reports detail === 0
         and keeps the native toggle, so the panel stays reachable without a
         pointer. */
      navDrop.querySelector("summary").addEventListener("click", function (e) {
        if (e.detail > 0) {
          e.preventDefault();
          var href = navDrop.getAttribute("data-href");
          if (href) location.assign(href);
        }
      });
    }
    document.addEventListener("click", function (e) {
      if (navDrop.open && !navDrop.contains(e.target)) closeDrop();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && navDrop.open) { closeDrop(); navDrop.querySelector("summary").focus(); }
    });
    /* Following a link should not leave the panel hanging open behind it. */
    navDrop.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) closeDrop();
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealables = $$(".reveal");
  if ("IntersectionObserver" in window && revealables.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- FAQ: keep a single panel open ---------- */
  var faqItems = $$(".faq details");
  faqItems.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (d.open) faqItems.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });

  /* ---------- Footer year ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ======================================================================
     Image toolkit
     ====================================================================== */
  var drop = $("#drop");
  if (!drop) return;

  var fileInput = $("#file"), results = $("#results"), statusEl = $("#status");
  var wEl = $("#w"), hEl = $("#h"), lockEl = $("#lock"), modeEl = $("#mode");
  var fmtEl = $("#format"), qEl = $("#q"), qvEl = $("#qv"), qwrap = $("#qwrap"), autoEl = $("#auto");
  var bgEl = $("#bgcolor"), bgVal = $("#bgval"), bgRow = $("#bgrow"), fmtHint = $("#fmthint");
  var modeHint = $("#modehint");
  var spresets = $("#spresets"), noupEl = $("#noup"), statEl = $("#stat");
  var zipBtn = $("#zip"), againBtn = $("#again"), clearBtn = $("#clear");
  var modeTabs = $("#toolmodes"), modeHint2 = $("#modehint2");
  var aiGate = $("#aigate"), aiRow = $("#airow"), aiEnable = $("#aienable");
  var aiProg = $("#aiprog"), aiBar = $("#aibar"), aiProgText = $("#aiprogtext");
  var aiCancel = $("#aicancel");

  /* ---------- Tool mode ----------
     Two genuinely different jobs were sharing one set of controls, and the
     resize controls won by default: a landing page advertised "PNG 转 JPG" and
     then quietly shrank a 1200x800 photo to 400x267, because state.width
     defaulted to 400. Converting a format and resizing an image are separate
     intentions, so they are separate modes now.

       "convert" — the 35 landing pages and the hub. Format only, dimensions
                   untouched. The resize controls are never shown.
       "full"    — the homepage toolbox. Both modes, chosen explicitly, and
                   converting is the default because it is the non-destructive
                   one: nothing changes that the user did not ask to change. */
  var TOOL_MODE = document.documentElement.getAttribute("data-tool-mode") || "full";
  var CAN_RESIZE = TOOL_MODE === "full";
  /* AI 放大同理：35 张格式落地页的契约是「只换格式」，往那儿塞一个要先下载 25MB
     模型的功能，既跑不动也不是访客来的目的。它只在首页工具箱里出现。 */
  var CAN_AI = TOOL_MODE === "full";

  /* Whether resizing is actually in effect *here*. Deliberately does not write
     back to state.resize: a landing page forcing the mode off must not leak into
     localStorage, or a later visit to the toolbox would forget the mode the user
     picked there. (applyParams() saves on every landing-page load, so mutating
     state.resize here would persist the forced value.) */
  function aiOn() { return CAN_AI && !!state.ai; }
  /* 三个模式互斥，靠切换处写死；这里再兜一次底，免得 localStorage 里两个标志
     同时为真时出现「既放大又缩放」的自相矛盾状态。 */
  function resizeOn() { return CAN_RESIZE && !!state.resize && !aiOn(); }


  /* ---------- Format registry ----------
     alpha:  whether the container can carry transparency
     quality: whether a lossy quality knob applies
     native: false means this file encodes it instead of the Canvas encoder */
  var FORMATS = {
    png:  { label: "PNG",  mime: "image/png",    ext: "png",  alpha: true,  quality: false,
            hint: "无损压缩 · 支持透明 · 适合截图与图标" },
    jpeg: { label: "JPG",  mime: "image/jpeg",   ext: "jpg",  alpha: false, quality: true,
            hint: "有损压缩 · 体积小 · 兼容性最好，不支持透明" },
    webp: { label: "WEBP", mime: "image/webp",   ext: "webp", alpha: true,  quality: true,
            hint: "比 JPG 再小约 25% · 支持透明 · 现代浏览器全支持" },
    avif: { label: "AVIF", mime: "image/avif",   ext: "avif", alpha: true,  quality: true,
            hint: "新一代格式 · 同画质体积最小 · 编码较慢" },
    bmp:  { label: "BMP",  mime: "image/bmp",    ext: "bmp",  alpha: false, quality: false,
            hint: "无压缩位图 · 体积大 · 由本机直接编码" },
    ico:  { label: "ICO",  mime: "image/x-icon", ext: "ico",  alpha: true,  quality: false,
            hint: "网站图标 · 最长边自动限制为 256px · 支持透明" }
  };
  var FORMAT_ORDER = ["png", "jpeg", "webp", "avif", "bmp", "ico"];
  var available = ["png", "jpeg", "bmp", "ico"];

  /* ---------- Resize-mode registry ----------
     The option labels stay bare ("等比适应") because the field is only ~150px
     wide on a 390px phone and the parenthetical was being clipped by the
     native select box. The explanation lives in #modehint underneath. */
  var MODES = {
    contain: "等比缩放 · 多余部分留白 · 永不变形",
    stretch: "直接拉伸到目标尺寸 · 比例可能失真",
    cover:   "等比缩放 · 超出部分居中裁剪 · 无留白"
  };

  /* Ask the encoder, do not assume: Safari and Firefox differ on WEBP and
     AVIF *encoding*, and the returned blob's type is the only honest answer. */
  function detectFormats() {
    var c = document.createElement("canvas");
    c.width = c.height = 2;
    c.getContext("2d").fillRect(0, 0, 2, 2);
    var tests = [["webp", "image/webp"], ["avif", "image/avif"]];
    var jobs = tests.map(function (t) {
      return new Promise(function (resolve) {
        var settled = false;
        var done = function (v) { if (!settled) { settled = true; resolve(v); } };
        try {
          c.toBlob(function (b) { done(b && b.type === t[1] ? t[0] : null); }, t[1]);
        } catch (e) { done(null); }
        setTimeout(function () { done(null); }, 2000);
      });
    });
    return Promise.all(jobs).then(function (found) {
      found.forEach(function (id) { if (id && available.indexOf(id) < 0) available.push(id); });
      available = FORMAT_ORDER.filter(function (id) { return available.indexOf(id) >= 0; });
      return available;
    });
  }

  function buildFormatSelect() {
    if (!fmtEl) return;
    var keep = state.format;
    fmtEl.innerHTML = "";
    available.forEach(function (id) {
      var o = document.createElement("option");
      o.value = id;
      /* Bare label: the narrowest field is ~150px on a 390px phone and
         "PNG（支持透明）" gets clipped by the native select box. The
         transparency note lives in #fmthint right underneath instead. */
      o.textContent = FORMATS[id].label;
      fmtEl.appendChild(o);
    });
    state.format = available.indexOf(keep) >= 0 ? keep : available[0];
    fmtEl.value = state.format;
  }

  /* ---------- State ---------- */
  var LS = "pixora-tool-v2";
  var state = {
    /* resize: false means "只换格式" — computeSize returns the source dimensions
       untouched. Only the homepage can turn it on; landing pages force it off. */
    resize: false,
    width: 400, height: null, lock: true, mode: "contain",
    format: "png", quality: 92, background: "#ffffff", auto: false,
    /* scale: null means "use 目标宽度"; a fraction means "scale every image from
       its own pixel size". A batch can mix dimensions, so a percentage has to be
       resolved per image rather than baked into one width up front.
       noUpscale: never enlarge past the source, which is what iloveimg offers as
       "如果像素较小则不放大" and what stops a thumbnail being blown up to mush. */
    scale: null, noUpscale: false,
    /* ai/aiScale: the third mode. The model is natively 4x; 2x is that result
       downsampled, which costs the same compute but halves the output — the only
       reason to pick it is the smaller file, so the UI says so. */
    ai: false, aiScale: 4
  };

  function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS) || "{}");
      Object.keys(state).forEach(function (k) { if (s[k] !== undefined) state[k] = s[k]; });
    } catch (e) {}
  }

  function def() { return FORMATS[state.format] || FORMATS.png; }

  /* ---------- Deep links ----------
     The format landing pages (/convert/png-to-jpg/ and friends) link here as
     ?to=jpg&w=800 so a visitor lands with the output format already chosen.
     Without this the landing pages would be SEO decoration pointing at a
     generic tool; with it they are a real entry point into the same engine. */
  function readParams() {
    var q = {};
    try {
      new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; });
    } catch (e) { /* very old browsers: no deep links, everything else works */ }
    return q;
  }

  /* "jpg" is what people type in a URL; "jpeg" is the MIME-family id the
     engine and the FORMATS registry use. Accept both. */
  function normFormat(v) {
    if (!v) return null;
    v = String(v).toLowerCase();
    if (v === "jpg" || v === "jpe") return "jpeg";
    return v;
  }

  function applyParams() {
    var q = readParams(), touched = false, n;
    /* The format landing pages declare their target on <html> so the embedded
       tool arrives preconfigured without needing a query string (which would
       make the canonical URL and the real URL disagree). */
    var pageTo = normFormat(document.documentElement.getAttribute("data-convert-to"));
    var want = normFormat(q.to);
    if (!want || available.indexOf(want) < 0) want = pageTo;
    if (want && available.indexOf(want) >= 0) { state.format = want; touched = true; }
    if (q.mode && MODES[q.mode]) { state.mode = q.mode; touched = true; }
    /* 尺寸参数只作用于完整工具箱。落地页的契约是「只换格式」，在那儿尊重 ?w=
       等于给同一页两种互相矛盾的含义。带上它们同时也意味着进入缩放模式 ——
       问宽度就是在要求缩放。
       这里必须顺手清掉 state.ai：三个模式互斥而 AI 优先（见 resizeOn()），
       若访客上次开着 AI 放大，只置 state.resize 会被 ai 压住，链接的一半意图
       就被静默吃掉了。带参链接是明确请求，应当赢过 localStorage 的遗留状态。 */
    if (CAN_RESIZE) {
      n = parseInt(q.w, 10);
      if (n > 0) { state.width = n; state.resize = true; state.ai = false; touched = true; }
      n = parseInt(q.scale, 10);
      if (n > 0 && n <= 400) { state.scale = n / 100; state.resize = true; state.ai = false; touched = true; }
    }
    n = parseInt(q.q, 10);
    if (n >= 50 && n <= 100) { state.quality = n; touched = true; }
    if (touched) save();
    return touched;
  }

  /* ICO tops out at 256px, so offering "1920" there would be a lie. Swap the
     preset row for icon-sized steps when that format is selected. */
  var PRESETS = { normal: [400, 600, 800, 1200, 1920], ico: [16, 32, 48, 64, 128, 256] };
  var presetKind = "normal";
  function buildPresets() {
    var kind = state.format === "ico" ? "ico" : "normal";
    if (kind === presetKind) return;
    presetKind = kind;
    var box = $("#wpresets");
    if (!box) return;
    box.innerHTML = "";
    PRESETS[kind].forEach(function (w) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.w = String(w);
      b.setAttribute("aria-pressed", "false");
      b.textContent = String(w);
      box.appendChild(b);
    });
    var lab = $("#wpresets-label");
    if (lab) lab.textContent = kind === "ico" ? "图标尺寸" : "常用宽度";
  }

  /* Reflect the mode into the DOM. CSS does the hiding (the elements stay in
     the tree so syncUI keeps working); this only keeps the attribute and the
     tab state honest. */
  function applyMode() {
    var on = resizeOn(), ai = aiOn();
    document.documentElement.setAttribute("data-resize", on ? "on" : "off");
    document.documentElement.setAttribute("data-ai", ai ? "on" : "off");
    if (modeTabs) {
      $$(".seg-btn", modeTabs).forEach(function (b) {
        var m = b.dataset.mode;
        var sel = m === "ai" ? ai : (m === "resize" ? on : (!on && !ai));
        b.classList.toggle("on", sel);
        b.setAttribute("aria-selected", String(sel));
      });
    }
    /* 模型没就绪时，AI 档位下露出的是一块说明 + 启用按钮，不是设置项。 */
    if (aiGate) aiGate.hidden = !(ai && !srReady());
    if (aiRow) aiRow.hidden = !(ai && srReady());
    if (modeHint2) {
      modeHint2.textContent = ai
        ? "超分放大在本机推理 · 图片不上传，也不受次数限制"
        : on ? "可改宽高：按宽度、按原图比例，或锁定宽高比"
             : "只换格式，图片尺寸保持原样";
    }
  }

  function syncUI() {
    applyMode();
    if (!wEl) return;
    var d = def();
    buildPresets();
    /* Percentage mode resolves per image, so a single pixel number would be a
       lie. Blank the inputs and say why instead of showing a stale value. */
    if (state.scale) {
      wEl.value = ""; wEl.placeholder = "按原图";
      hEl.value = ""; hEl.placeholder = "自动";
    } else {
      wEl.value = state.width;
      wEl.placeholder = "";
      hEl.value = state.height == null ? "" : state.height;
      hEl.placeholder = state.lock ? "自动" : "高度";
    }
    wEl.disabled = !!state.scale;
    hEl.disabled = state.lock || !!state.scale;
    lockEl.checked = state.lock;
    modeEl.value = state.mode;
    if (fmtEl) fmtEl.value = state.format;
    qEl.value = state.quality; qvEl.textContent = state.quality;
    autoEl.checked = state.auto;
    if (noupEl) noupEl.checked = state.noUpscale;
    if (qwrap) qwrap.hidden = !d.quality;
    if (bgEl) bgEl.value = state.background;
    if (bgVal) bgVal.textContent = String(state.background).toUpperCase();
    /* The background swatch only means something when the target cannot keep
       alpha — otherwise it would be a control that silently does nothing. */
    if (bgRow) bgRow.hidden = d.alpha;
    if (fmtHint) fmtHint.textContent = d.hint;
    if (modeHint) modeHint.textContent = MODES[state.mode] || MODES.contain;
    $$("#wpresets .chip").forEach(function (b) {
      var on = !state.scale && Number(b.dataset.w) === Number(state.width);
      b.classList.toggle("on", on);
      /* The active preset is visual only otherwise — mirror it for AT. */
      b.setAttribute("aria-pressed", String(on));
    });
    if (spresets) {
      $$(".chip", spresets).forEach(function (b) {
        var on = state.scale !== null && Number(b.dataset.scale) === Number(state.scale);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
    if (aiRow) {
      $$(".chip", aiRow).forEach(function (b) {
        var on = Number(b.dataset.scale) === Number(state.aiScale);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
  }

  function computeSize(sw, sh) {
    /* AI 放大：倍数由模型决定，宽高比不动，尺寸不能手改。 */
    if (aiOn()) {
      var k = state.aiScale === 2 ? 2 : SR.SCALE;
      return { w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
    }
    /* 格式转换模式：尺寸原样透传。下面 ICO 的 256px 上限仍然适用，因为那是
       格式本身的定义，不是用户的缩放意图。 */
    var w = sw, h = sh;
    if (resizeOn()) {
      if (state.scale) {
        w = sw * state.scale;
        h = sh * state.scale;
      } else {
        w = state.width || sw;
        h = (state.lock || state.height == null) ? Math.round(w * sh / sw) : state.height;
      }
      w = Math.max(1, Math.round(w));
      h = Math.max(1, Math.round(h));
      /* Clamp per axis rather than by area: with the ratio locked both axes exceed
         together, and in stretch mode each one is judged on its own. */
      if (state.noUpscale) {
        if (w > sw) w = sw;
        if (h > sh) h = sh;
      }
    }
    /* ICO entries top out at 256px per side by definition. */
    if (state.format === "ico") {
      var longest = Math.max(w, h);
      if (longest > 256) {
        var k = 256 / longest;
        w = Math.max(1, Math.round(w * k));
        h = Math.max(1, Math.round(h * k));
      }
    }
    return { w: w, h: h };
  }

  /* ---------- Decode ----------
     createImageBitmap is faster and honours EXIF orientation, but it refuses
     SVG in several browsers; the <img> path covers those. */
  function decodeImage(file) {
    return createImageBitmap(file, { imageOrientation: "from-image" })
      .catch(function () {
        return new Promise(function (resolve, reject) {
          var url = URL.createObjectURL(file);
          var img = new Image();
          img.onload = function () {
            img.__revoke = url;
            if (!img.naturalWidth || !img.naturalHeight) {
              URL.revokeObjectURL(url);
              reject(new Error("图片尺寸无效"));
              return;
            }
            resolve(img);
          };
          img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error("浏览器无法解码该格式（HEIC/RAW 等需要专用解码器）"));
          };
          img.src = url;
        });
      });
  }

  function render(src, tw, th, mode, flatten, background) {
    var sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    var sx = 0, sy = 0, cw = sw, ch = sh, dx = 0, dy = 0, dw = tw, dh = th;
    if (mode === "contain") {
      var s = Math.min(tw / sw, th / sh);
      dw = Math.max(1, Math.round(sw * s)); dh = Math.max(1, Math.round(sh * s));
      dx = Math.round((tw - dw) / 2); dy = Math.round((th - dh) / 2);
    } else if (mode === "cover") {
      var s2 = Math.max(tw / sw, th / sh);
      cw = Math.max(1, Math.round(tw / s2)); ch = Math.max(1, Math.round(th / s2));
      sx = Math.round((sw - cw) / 2); sy = Math.round((sh - ch) / 2);
    }
    var base = document.createElement("canvas");
    base.width = cw; base.height = ch;
    var bc = base.getContext("2d");
    bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = "high";
    bc.drawImage(src, sx, sy, cw, ch, 0, 0, cw, ch);

    /* Step-halving downsample: a single big jump aliases badly, so walk the
       size down by factors of two before the final draw. 中间那些尺寸由内核算，
       这里只负责把每一级画出来。 */
    var cur = base;
    var ladder = Pixora.resize.ladder(cw, ch, Math.max(dw, dh));
    for (var li = 0; li < ladder.length; li++) {
      var nw = ladder[li].w, nh = ladder[li].h;
      var t = document.createElement("canvas"); t.width = nw; t.height = nh;
      var tc = t.getContext("2d");
      tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = "high";
      tc.drawImage(cur, 0, 0, cur.width, cur.height, 0, 0, nw, nh);
      cur = t;
    }
    var out = document.createElement("canvas");
    out.width = tw; out.height = th;
    var oc = out.getContext("2d");
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = "high";
    if (flatten) { oc.fillStyle = background || "#ffffff"; oc.fillRect(0, 0, tw, th); }
    oc.drawImage(cur, dx, dy, dw, dh);
    return out;
  }

  /* ---------- Encoders ---------- */
  /* 底层编解码/分块/像素链都在 pixora-lib.js 里，页面只负责 canvas <-> ImageData
     这一层。之前这里各抄了一份 encodeBMP 和 buildZip，编辑器又抄了第三份像素链，
     三处随时会漂移。 */
  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("编码失败")); },
        mime, quality);
    });
  }

  /* BMP: 24-bit BGR, bottom-up rows, each row padded to a 4-byte boundary.
     Canvas 没有 BMP 编码器，所以走内核里手写的那一个。 */
  function encodeBMP(canvas) {
    var w = canvas.width, h = canvas.height;
    var img = canvas.getContext("2d").getImageData(0, 0, w, h);
    var buf = Pixora.encode.bmp({ w: w, h: h, data: img.data });
    return Promise.resolve(new Blob([buf], { type: "image/bmp" }));
  }

  /* ICO: an ICONDIR header plus one PNG-compressed entry. PNG-in-ICO is
     understood by every browser and Windows Vista and later. */
  function encodeICO(canvas) {
    return canvasToBlob(canvas, "image/png").then(function (pngBlob) {
      return pngBlob.arrayBuffer().then(function (ab) {
        var png = new Uint8Array(ab);
        var head = new ArrayBuffer(22);
        var dv = new DataView(head);
        dv.setUint16(0, 0, true);                       // reserved
        dv.setUint16(2, 1, true);                       // type: icon
        dv.setUint16(4, 1, true);                       // image count
        dv.setUint8(6, canvas.width >= 256 ? 0 : canvas.width);   // 0 means 256
        dv.setUint8(7, canvas.height >= 256 ? 0 : canvas.height);
        dv.setUint8(8, 0);                              // palette size
        dv.setUint8(9, 0);                              // reserved
        dv.setUint16(10, 1, true);                      // colour planes
        dv.setUint16(12, 32, true);                     // bits per pixel
        dv.setUint32(14, png.length, true);
        dv.setUint32(18, 22, true);                     // offset of image data
        return new Blob([head, png], { type: "image/x-icon" });
      });
    });
  }

  function encode(canvas, fmt, quality) {
    if (fmt === "bmp") return encodeBMP(canvas);
    if (fmt === "ico") return encodeICO(canvas);
    return canvasToBlob(canvas, FORMATS[fmt].mime, FORMATS[fmt].quality ? quality / 100 : undefined);
  }

  /* ======================================================================
     AI 放大 —— Real-ESRGAN general x4v3，跑在访客自己的设备上

     和上面那套 canvas 重采样是两回事：那些只是把已有像素搬来搬去，这个是真的用
     卷积网络把丢失的细节猜回来。代价也真实 —— 算力来自访客的 GPU/CPU 而不是服务
     器集群，所以慢，所以有单张尺寸上限，所以第一次要下模型。

     网络是全卷积的，但输入边长固定 336，于是推理必须分块：每块喂 336×336，出
     1344×1344，只取正中 256×256 那块（放大后 1024×1024）。外围那 40 像素是「上下文
     余量」—— 卷积核看得见邻域，块与块之间不给足余量，拼起来就有接缝。

     余量为什么取 40：用扰动法实测感受野半径 33.8 输入像素（把输入左上角 8×8 换成
     噪声，输出到第 163 像素才不再变化）。40 覆盖得住，实测分块结果与整图一次推理在
     内部逐位相同；降到 24 就开始出现 1/255 的接缝。标定过程见 docs/ai-upscale.md。
     ====================================================================== */
  /* 分块参数与分块表都在 pixora-lib.js 里。编辑器与工具箱共用一份，
     就不会出现「一边改了感受野、另一边不知道」这种事故。 */
  var SR = Pixora.sr;
  var sr = { ort: null, session: null, loading: null, ep: "", error: null };
  var srPerTile = 2200;   // 每块耗时估计，首块实测后替换，只用于进度条的剩余时间
  function srReady() { return !!sr.session; }

  /* 资源位置从 main.js 自身反推。页面有的在根目录，有的在 convert/xxx-to-yyy/ 两层
     深处，写死相对路径必然有一处错。 */
  function srUrls() {
    if (!SELF) return null;
    var assets = new URL("../", SELF);
    return {
      ort: new URL("ort/ort.webgpu.min.mjs", assets).href,
      /* wasmPaths 必须是绝对 URL：写成相对路径时 ORT 会拿它再拼一次模块自身的
         位置，变成 /ort/ort/ort-wasm-simd-threaded.jsep.mjs 而 404。 */
      wasm: new URL("ort/", assets).href,
      model: new URL("models/realesr-general-x4v3-t336.onnx", assets).href
    };
  }

  function srProviders() {
    if (!navigator.gpu || !navigator.gpu.requestAdapter) return Promise.resolve(["wasm"]);
    return navigator.gpu.requestAdapter().then(function (ad) {
      return ad ? ["webgpu", "wasm"] : ["wasm"];
    }).catch(function () { return ["wasm"]; });
  }

  /* 懒加载：只有访客真的选了 AI 放大并按下「启用」，才去下那 25MB。 */
  function srEnsure(onStatus) {
    if (sr.session) return Promise.resolve(sr.session);
    if (sr.loading) return sr.loading;
    var u = srUrls();
    if (!u) return Promise.reject(new Error("找不到 AI 模型资源路径"));
    var say = function (t) { if (onStatus) onStatus(t); };
    sr.loading = import(u.ort).then(function (ort) {
      ort.env.logLevel = "error";
      /* GitHub Pages 不发 COOP/COEP，多线程 wasm 起不来；显式钉成单线程，免得
         ORT 先尝试 spawn 线程池再静默退回。 */
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = u.wasm;
      sr.ort = ort;
      say("正在检测图形加速…");
      return srProviders().then(function (eps) {
        sr.ep = eps[0];
        say("正在加载模型…");
        return ort.InferenceSession.create(u.model, {
          executionProviders: eps,
          graphOptimizationLevel: "all"
        });
      });
    }).then(function (s) {
      sr.session = s;
      sr.loading = null;
      return s;
    }).catch(function (e) {
      sr.loading = null;
      sr.error = e;
      throw e;
    });
    return sr.loading;
  }

  /* 核心窗口的起点。末块回退对齐而不是截断 —— 截断会让补齐后的边长不等于 CTX，而
     模型只吃固定边长。回退只是让末块与前一权重叠，两者算的是同一个函数，结果相同。 */

  async function srUpscale(src, onProgress, token) {
    var W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
    var OW = W * SR.SCALE, OH = H * SR.SCALE;
    var flat = document.createElement("canvas");
    flat.width = W; flat.height = H;
    flat.getContext("2d").drawImage(src, 0, 0, W, H);
    var sd = flat.getContext("2d").getImageData(0, 0, W, H).data;

    var out = new Uint8ClampedArray(OW * OH * 4);
    var T = SR.CTX, T2 = T * T;
    var plane = new Float32Array(3 * T2);
    var OS = T * SR.SCALE, OT2 = OS * OS, crop = SR.MARGIN * SR.SCALE;
    var ys = Pixora.sr.starts(H, SR.CORE), xs = Pixora.sr.starts(W, SR.CORE);
    var total = ys.length * xs.length, n = 0;

    for (var iy = 0; iy < ys.length; iy++) {
      for (var ix = 0; ix < xs.length; ix++) {
        if (token && token.cancelled) throw new Error("已取消");
        var y0 = ys[iy], x0 = xs[ix];
        var ch = Math.min(SR.CORE, H - y0), cw = Math.min(SR.CORE, W - x0);
        /* 补齐：核心外面垫 MARGIN 像素，出界处用边缘像素复制。索引直接钳到
           [0, W-1] 就同时完成了「取真像素」和「贴边复制」两件事。 */
        for (var py = 0; py < T; py++) {
          var sy = y0 - SR.MARGIN + py;
          if (sy < 0) sy = 0; else if (sy >= H) sy = H - 1;
          var row = sy * W, prow = py * T;
          for (var px = 0; px < T; px++) {
            var sx = x0 - SR.MARGIN + px;
            if (sx < 0) sx = 0; else if (sx >= W) sx = W - 1;
            var si = (row + sx) * 4, di = prow + px;
            plane[di] = sd[si] / 255;
            plane[T2 + di] = sd[si + 1] / 255;
            plane[2 * T2 + di] = sd[si + 2] / 255;
          }
        }
        var t0 = performance.now();
        var feeds = {};
        feeds[sr.session.inputNames[0]] = new sr.ort.Tensor("float32", plane, [1, 3, T, T]);
        var res = await sr.session.run(feeds);
        if (n === 0) srPerTile = Math.max(120, performance.now() - t0);
        var o = res[sr.session.outputNames[0]].data;
        /* Uint8ClampedArray 的赋值规则是「四舍五入，逢半取偶」，与 Python 侧
           np.rint 完全一致，所以这里直接写浮点值即可，不需要 Math.round。 */
        for (var y = 0; y < ch * SR.SCALE; y++) {
          var drow = ((y0 * SR.SCALE + y) * OW + x0 * SR.SCALE) * 4;
          var srow = (crop + y) * OS + crop;
          for (var x = 0; x < cw * SR.SCALE; x++) {
            var d2 = drow + x * 4, s2 = srow + x;
            out[d2] = o[s2] * 255;
            out[d2 + 1] = o[OT2 + s2] * 255;
            out[d2 + 2] = o[2 * OT2 + s2] * 255;
            out[d2 + 3] = 255;
          }
        }
        n++;
        if (onProgress) onProgress(n, total);
        /* 让出主线程：一是让进度条真的画得出来，二是让「取消」点得到。 */
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    }

    var canvas = document.createElement("canvas");
    canvas.width = OW; canvas.height = OH;
    canvas.getContext("2d").putImageData(new ImageData(out, OW, OH), 0, 0);
    return canvas;
  }

  /* ---------- ZIP (store or deflate, no dependencies) ---------- */
  /* ZIP 打包同样交给内核。条目从 blob 换成裸字节 —— 内核不认识 Blob。 */
  function buildZip(entries) {
    return Pixora.zip.build(entries.map(function (e) {
      return { name: e.name, data: e.blob };
    })).then(function (blob) { return blob; });
  }


  function humanSize(n) { return Pixora.humanSize(n); }

  function srcExt(file) {
    var m = /\.([a-z0-9]+)$/i.exec(file.name || "");
    if (m) return m[1].toUpperCase();
    var t = (file.type || "").replace("image/", "");
    return t ? t.toUpperCase() : "图片";
  }
  function outName(name, w, h, fmt) {
    var base = String(name).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
    /* Only stamp the dimensions when they actually changed. In convert mode the
       numbers would just echo the source size and read as though the image had
       been resized, which is the confusion this whole change is about. */
    var tag = aiOn() ? "_" + (state.aiScale === 2 ? "2x" : "4x")
            : resizeOn() ? "_" + w + "x" + h : "";
    return (base || "image") + tag + "." + FORMATS[fmt].ext;
  }
  function download(url, filename) {
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); }, 0);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- Result cards ---------- */
  var made = [];          // { name, url, blob } for the current batch
  var lastFiles = null;   // so settings can be re-applied without re-dropping

  /* Session totals. convertio advertises a global counter ("我们已转换 34.8 亿
     个文件"), which a tool that never sees a server cannot honestly claim. The
     numbers Pixora does have are real, and they are the ones that matter here:
     how much this batch actually saved. */
  var session = { count: 0, src: 0, out: 0 };
  function renderStat() {
    if (!statEl) return;
    if (!session.count) { statEl.hidden = true; statEl.textContent = ""; return; }
    var saved = session.src - session.out;
    var pct = session.src > 0 ? Math.round((saved / session.src) * 100) : 0;
    statEl.hidden = false;
    statEl.innerHTML = "本次已处理 <b>" + session.count + "</b> 张 · 原始 <b>" +
      humanSize(session.src) + "</b> → 输出 <b>" + humanSize(session.out) + "</b>" +
      (saved > 0 ? ' · 减少 <b class="ok">' + pct + "%</b>" : "");
  }
  function resetSession() {
    session = { count: 0, src: 0, out: 0 };
    renderStat();
  }

  function addCard(name, from) {
    var el = document.createElement("div");
    el.className = "result";
    el.innerHTML = '<div class="thumb"><span class="spin">转换中…</span></div>' +
      '<div class="meta"><div class="nm"></div><div class="sz"></div></div>';
    $(".nm", el).textContent = name;
    $(".sz", el).textContent = from;
    results.prepend(el);
    return el;
  }
  function finishCard(el, url, blob, tw, th, filename, fromLabel, srcBytes) {
    $(".thumb", el).innerHTML = '<img src="' + url + '" alt="转换结果预览" loading="lazy" decoding="async">';
    var delta = "";
    if (srcBytes && srcBytes > 0) {
      var pct = Math.round((1 - blob.size / srcBytes) * 100);
      delta = pct > 0
        ? ' <span class="delta down">↓' + pct + "%</span>"
        : (pct < 0 ? ' <span class="delta up">↑' + Math.abs(pct) + '%</span>' : ' <span class="delta">±0%</span>');
    }
    $(".sz", el).innerHTML = fromLabel + " → <b>" + def().label + "</b> · " +
      tw + " × " + th + " · " + humanSize(blob.size) + delta +
      ' <span class="badge-ok">完成</span>' +
      '<br><a class="dl" download="' + esc(filename) + '" href="' + url + '">下载 ' +
      esc(filename.split(".").pop().toUpperCase()) + "</a>";
  }
  function failCard(el, msg) {
    $(".thumb", el).innerHTML = '<span class="badge-err">失败</span>';
    $(".sz", el).innerHTML = '<span class="badge-err">' + esc(msg) + "</span>";
  }

  function syncActions() {
    if (zipBtn) zipBtn.hidden = made.length < 2;
    if (againBtn) againBtn.hidden = !lastFiles;
    if (clearBtn) clearBtn.hidden = !made.length && !results.children.length;
  }

  /* ---------- Batch processing ---------- */
  var busy = false;
  var aiToken = null;

  /* 一条产线：普通模式是 canvas 重采样；AI 模式先分块超分出 4 倍，再按需降采样
     并铺底色。两者出口都是 canvas，后面的编码、结果卡、打包完全共用。 */
  function produce(bmp, sw, sh, size, mode, flatten, background, onProgress, token) {
    if (!aiOn()) return Promise.resolve(render(bmp, size.w, size.h, mode, flatten, background));
    if (sw * sh > SR.MAX_IN) {
      return Promise.reject(new Error("超过 AI 放大上限 " +
        Math.round(SR.MAX_IN / 10000) + " 万像素（当前 " + sw + "×" + sh +
        "），请先裁切或缩小"));
    }
    return srUpscale(bmp, onProgress, token).then(function (big) {
      /* 4 倍且不需要铺底时，big 就是要的东西，别再整张拷一遍。 */
      if (!flatten && size.w === big.width && size.h === big.height) return big;
      return render(big, size.w, size.h, "stretch", flatten, background);
    });
  }

  function handleFiles(files, isRerun) {
    var imgs = Array.prototype.filter.call(files, function (f) { return f && /^image\//.test(f.type); });
    if (!imgs.length) { statusEl.textContent = "没有识别到图片文件"; return Promise.resolve(); }
    if (busy) { statusEl.textContent = "正在处理，请稍候…"; return Promise.resolve(); }
    if (aiOn() && !srReady()) { statusEl.textContent = "AI 模型还没启用，请先点上面的「启用 AI 放大」"; return Promise.resolve(); }
    busy = true;
    lastFiles = imgs;

    var d = def();
    var flatten = !d.alpha;
    var background = state.background;
    var fmt = state.format, quality = state.quality, mode = state.mode, auto = state.auto;
    var done = 0, failed = 0;
    var ai = aiOn();
    aiToken = ai ? { cancelled: false } : null;
    if (ai && aiProg) { aiProg.hidden = false; showAiProgress(0, 0, 0); }
    if (aiCancel) aiCancel.hidden = !ai;

    if (isRerun) {
      made.forEach(function (m) { URL.revokeObjectURL(m.url); });
      made = [];
      results.innerHTML = "";
      resetSession();
    }

    var chain = Promise.resolve();
    imgs.forEach(function (f, i) {
      chain = chain.then(function () {
        statusEl.textContent = "正在" + (ai ? "放大" : "转换") + " " + (i + 1) + " / " + imgs.length + "：" + f.name;
        var card = addCard(f.name, srcExt(f) + " · " + humanSize(f.size));
        return decodeImage(f).then(function (bmp) {
          var sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
          var size = computeSize(sw, sh);
          return produce(bmp, sw, sh, size, mode, flatten, background,
            ai ? aiProgress : null, aiToken).then(function (canvas) {
            return encode(canvas, fmt, quality).then(function (blob) {
              var url = URL.createObjectURL(blob);
              var filename = outName(f.name, size.w, size.h, fmt);
              finishCard(card, url, blob, size.w, size.h, filename,
                ai ? srcExt(f) + " " + sw + "×" + sh : srcExt(f), f.size);
              made.push({ name: filename, url: url, blob: blob });
              session.count++; session.src += f.size; session.out += blob.size;
              if (auto) download(url, filename);
              done++;
              if (bmp.close) bmp.close();
              if (bmp.__revoke) URL.revokeObjectURL(bmp.__revoke);
            });
          });
        }).catch(function (err) {
          failed++;
          var cancelled = aiToken && aiToken.cancelled;
          failCard(card, cancelled ? "已取消" : "无法" + (ai ? "放大" : "转换") + "：" +
            (err && err.message ? err.message : err));
        });
      });
    });

    return chain.then(function () {
      busy = false;
      aiToken = null;
      if (aiProg) aiProg.hidden = true;
      if (aiCancel) { aiCancel.hidden = true; aiCancel.disabled = false; }
      syncActions();
      renderStat();
      statusEl.textContent = "完成 " + done + " / " + imgs.length + " 张" +
        (failed ? "，失败 " + failed + " 张" : "") +
        (auto ? "，已自动下载" : "，点结果下方链接下载");
    });
  }

  /* ---------- Input wiring ---------- */
  drop.addEventListener("click", function () { fileInput.click(); });
  drop.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function (e) { handleFiles(e.target.files); fileInput.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  });
  document.addEventListener("paste", function (e) {
    if (!e.clipboardData || !results) return;
    var items = e.clipboardData.items, files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "file") { var f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (files.length) { e.preventDefault(); handleFiles(files); }
  });

  /* ---------- Settings wiring ---------- */
  wEl.addEventListener("input", function () {
    state.width = Math.max(1, parseInt(wEl.value || "0", 10) || 0);
    /* Typing a pixel width is an explicit exit from percentage mode; the two
       controls would otherwise disagree about which one is in charge. */
    state.scale = null;
    if (state.lock) state.height = null;
    syncUI(); save();
  });
  hEl.addEventListener("input", function () {
    state.height = Math.max(1, parseInt(hEl.value || "0", 10) || 0) || null;
    syncUI(); save();
  });
  lockEl.addEventListener("change", function () {
    state.lock = lockEl.checked;
    if (state.lock) state.height = null;
    syncUI(); save();
  });
  modeEl.addEventListener("change", function () { state.mode = modeEl.value; syncUI(); save(); });
  fmtEl.addEventListener("change", function () { state.format = fmtEl.value; syncUI(); save(); });
  qEl.addEventListener("input", function () { state.quality = parseInt(qEl.value, 10); qvEl.textContent = state.quality; save(); });
  if (bgEl) bgEl.addEventListener("input", function () { state.background = bgEl.value; syncUI(); save(); });
  autoEl.addEventListener("change", function () { state.auto = autoEl.checked; save(); });
  if (noupEl) noupEl.addEventListener("change", function () { state.noUpscale = noupEl.checked; save(); });
  if (modeTabs) {
    modeTabs.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".seg-btn");
      if (!b) return;
      var m = b.dataset.mode;
      /* 三个档位互斥，在这里一次写死，别处只读 aiOn()/resizeOn()。 */
      var wantAi = m === "ai", wantResize = m === "resize";
      if (wantAi === aiOn() && wantResize === resizeOn()) return;
      state.ai = wantAi;
      state.resize = wantResize;
      /* Coming back into resize mode with the ratio locked, drop any height left
         over from a previous stretch so the field reads "自动" again. */
      if (state.resize && state.lock) state.height = null;
      syncUI(); save();
      setIdle();
    });
  }

  /* ---------- AI 放大 wiring ----------
     模型 25MB，不该因为有人点了一下标签就偷偷下走。所以先给一块说明，按了
     「启用」才真的开始加载，加载进度直接显示在按钮旁边。 */
  function showAiProgress(n, total, pct) {
    if (aiBar) aiBar.style.width = pct + "%";
    if (aiProg) aiProg.setAttribute("aria-valuenow", String(pct));
    if (aiProgText) {
      if (!total) aiProgText.textContent = n || "";
      else {
        var left = Math.max(0, Math.round((srPerTile * (total - n)) / 1000));
        aiProgText.textContent = "已处理 " + n + " / " + total + " 块 · " +
          (n >= total ? "即将完成" : "约剩 " + left + " 秒");
      }
    }
  }
  function aiProgress(n, total) { showAiProgress(n, total, Math.round((n / total) * 100)); }
  function setAiStatus(text) {
    if (aiProgText) aiProgText.textContent = text;
  }

  if (aiEnable) {
    aiEnable.addEventListener("click", function () {
      if (sr.loading) return;
      aiEnable.disabled = true;
      if (aiProg) aiProg.hidden = false;
      if (aiBar) aiBar.style.width = "0%";
      setAiStatus("准备中…");
      srEnsure(function (t) { setAiStatus(t); }).then(function () {
        aiEnable.disabled = false;
        if (aiProg) aiProg.hidden = true;
        syncUI();
        setIdle("AI 模型已就绪（" + (sr.ep === "webgpu" ? "GPU 加速" : "CPU 计算") +
          "）· 拖入图片即可");
      }).catch(function (e) {
        aiEnable.disabled = false;
        if (aiBar) aiBar.style.width = "0%";
        setAiStatus("加载失败：" + (e && e.message ? e.message : e) +
          " · 请检查网络后重试");
      });
    });
  }

  if (aiRow) {
    aiRow.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".chip");
      if (!b) return;
      state.aiScale = Number(b.dataset.scale) === 2 ? 2 : 4;
      syncUI(); save();
    });
  }

  if (aiCancel) {
    aiCancel.addEventListener("click", function () {
      if (!aiToken) return;
      aiToken.cancelled = true;
      aiCancel.disabled = true;
      statusEl.textContent = "正在取消…";
    });
  }

  /* 文档页 / 404 / 编辑器页没有工具箱，这块得跟着一起缺。少了这个判断，
     main.js 会在那些页面抛 TypeError，把后面整段 Boot 全带掉。 */
  var wpresetsBox = $("#wpresets");
  if (wpresetsBox) {
    wpresetsBox.addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      state.width = Number(b.dataset.w);
      state.scale = null;
      if (state.lock) state.height = null;
      syncUI(); save();
    });
  }
  if (spresets) spresets.addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    var s = Number(b.dataset.scale);
    /* Tapping the active percentage turns it off and hands control back to the
       width field — otherwise there would be no way out of percentage mode. */
    state.scale = (state.scale !== null && Number(state.scale) === s) ? null : s;
    if (state.scale) state.height = null;
    syncUI(); save();
  });

  if (clearBtn) clearBtn.addEventListener("click", function () {
    made.forEach(function (m) { URL.revokeObjectURL(m.url); });
    made = []; lastFiles = null;
    results.innerHTML = "";
    resetSession();
    syncActions();
    statusEl.textContent = "已清空";
  });

  if (againBtn) againBtn.addEventListener("click", function () {
    if (lastFiles) handleFiles(lastFiles, true);
  });

  if (zipBtn) zipBtn.addEventListener("click", function () {
    if (made.length < 2) return;
    var prev = statusEl.textContent;
    statusEl.textContent = "正在打包 " + made.length + " 个文件…";
    zipBtn.disabled = true;
    buildZip(made).then(function (blob) {
      var d = new Date();
      var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
      download(URL.createObjectURL(blob), "pixora-" + stamp + ".zip");
      statusEl.textContent = "已打包 " + made.length + " 个文件（" + humanSize(blob.size) + "）";
    }).catch(function () {
      statusEl.textContent = "打包失败，请逐个下载";
    }).then(function () {
      zipBtn.disabled = false;
      setTimeout(function () { statusEl.textContent = prev; }, 4000);
    });
  });

  /* ---------- Boot ---------- */
  /* The idle status names the active mode, so it must be recomputed whenever the
     mode changes — otherwise switching to 调整尺寸 would leave the status bar
     still claiming the image size is being left alone. */
  var idleBase = "已就绪 · 拖入图片即可";
  function statusTail() {
    if (aiOn()) return "，全部在本地完成 · AI 超分，图片不上传";
    return "，全部在本地完成" + (resizeOn() ? "" : " · 尺寸保持原样");
  }
  function setIdle(base) {
    if (base) idleBase = base;
    if (!busy) statusEl.textContent = idleBase + statusTail();
  }

  load();
  syncUI();
  syncActions();
  setIdle();

  detectFormats().then(function () {
    buildFormatSelect();
    var linked = applyParams();
    syncUI();
    var from = (document.documentElement.getAttribute("data-convert-from") || "").toUpperCase();
    if (linked && from && FORMATS[state.format]) {
      setIdle("已预设输出为 " + FORMATS[state.format].label + " · 拖入 " + from + " 图片即可");
    } else {
      setIdle(linked ? "已按链接预设输出格式 · 拖入图片即可" : "已就绪 · 拖入图片即可");
    }
  });
})();
