/* ==========================================================================
   Pixora — site + toolkit runtime
   Zero dependencies. Everything runs in the visitor's browser; no image ever
   leaves the device.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Theme ---------- */
  var THEME_KEY = "pixora-theme";
  var root = document.documentElement;
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    var m = $('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t === "dark" ? "#080c16" : "#ffffff");
    $$("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-label", t === "dark" ? "切换到浅色模式" : "切换到深色模式");
      b.setAttribute("aria-pressed", String(t === "dark"));
    });
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
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
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    $$(".nav a").forEach(function (a) {
      a.addEventListener("click", function () { nav.classList.remove("open"); navToggle.setAttribute("aria-expanded", "false"); });
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
     Image toolkit — decode → proportional resize → encode → download
     ====================================================================== */
  var drop = $("#drop");
  if (!drop) return;

  var fileInput = $("#file"), results = $("#results"), statusEl = $("#status");
  var wEl = $("#w"), hEl = $("#h"), lockEl = $("#lock"), modeEl = $("#mode");
  var fmtEl = $("#format"), qEl = $("#q"), qvEl = $("#qv"), qwrap = $("#qwrap"), autoEl = $("#auto");

  var LS = "pixora-tool-v1";
  var state = { width: 400, height: null, lock: true, mode: "contain", format: "png", quality: 92, auto: false };

  function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS) || "{}");
      Object.keys(state).forEach(function (k) { if (s[k] !== undefined) state[k] = s[k]; });
    } catch (e) {}
  }

  function syncUI() {
    if (!wEl) return;
    wEl.value = state.width;
    hEl.value = state.height == null ? "" : state.height;
    hEl.disabled = state.lock;
    hEl.placeholder = state.lock ? "自动" : "高度";
    lockEl.checked = state.lock;
    modeEl.value = state.mode;
    fmtEl.value = state.format;
    qEl.value = state.quality; qvEl.textContent = state.quality;
    autoEl.checked = state.auto;
    qwrap.style.display = state.format === "png" ? "none" : "block";
    $$("#wpresets .chip").forEach(function (b) {
      b.classList.toggle("on", Number(b.dataset.w) === Number(state.width));
    });
  }

  function computeSize(sw, sh) {
    var w = state.width || sw;
    var h = (state.lock || state.height == null) ? Math.round(w * sh / sw) : state.height;
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  }

  function render(bmp, tw, th, mode, fmt) {
    var sw = bmp.width, sh = bmp.height;
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
    bc.drawImage(bmp, sx, sy, cw, ch, 0, 0, cw, ch);

    var cur = base, maxOut = Math.max(dw, dh);
    while (Math.max(cur.width, cur.height) > Math.max(2 * maxOut, 4) && Math.max(cur.width, cur.height) > 4) {
      var nw = Math.max(1, Math.floor(cur.width / 2));
      var nh = Math.max(1, Math.floor(cur.height / 2));
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
    if (fmt !== "png") { oc.fillStyle = "#ffffff"; oc.fillRect(0, 0, tw, th); }
    oc.drawImage(cur, dx, dy, dw, dh);
    return out;
  }

  function toBlob(canvas, fmt, quality) {
    var type = "image/" + (fmt === "jpg" ? "jpeg" : fmt);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("编码失败")); },
        type, fmt === "png" ? undefined : (quality / 100));
    });
  }

  function outName(name, w, h, fmt) {
    return name.replace(/\.[^.]+$/, "") + "_" + w + "x" + h + "." + (fmt === "jpg" ? "jpg" : fmt);
  }

  function download(url, filename) {
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); }, 0);
  }

  function addCard(name) {
    var el = document.createElement("div");
    el.className = "result";
    el.innerHTML = '<div class="thumb"><span style="color:var(--muted);font-size:.78rem">处理中…</span></div>' +
      '<div class="meta"><div class="nm"></div><div class="sz"></div></div>';
    $(".nm", el).textContent = name;
    results.prepend(el);
    return el;
  }
  function finishCard(el, url, blob, tw, th, filename) {
    $(".thumb", el).innerHTML = '<img src="' + url + '" alt="处理结果预览">';
    var kb = blob.size >= 1048576 ? (blob.size / 1048576).toFixed(2) + " MB" : Math.round(blob.size / 1024) + " KB";
    $(".sz", el).innerHTML = tw + " × " + th + " · " + kb + ' <span class="badge-ok">完成</span><br>' +
      '<a class="dl" download="' + filename + '" href="' + url + '">下载 ' + filename.split(".").pop().toUpperCase() + "</a>";
  }
  function failCard(el, msg) {
    $(".thumb", el).innerHTML = '<span class="badge-err" style="font-size:.8rem">失败</span>';
    $(".sz", el).innerHTML = '<span class="badge-err">' + msg + "</span>";
  }

  var busy = false;
  async function handleFiles(files) {
    var imgs = Array.prototype.filter.call(files, function (f) { return f && /^image\//.test(f.type); });
    if (!imgs.length) { statusEl.textContent = "没有识别到图片文件"; return; }
    if (busy) { statusEl.textContent = "正在处理，请稍候…"; return; }
    busy = true;
    var done = 0;
    for (var i = 0; i < imgs.length; i++) {
      var f = imgs[i];
      statusEl.textContent = "正在处理 " + (i + 1) + " / " + imgs.length + "：" + f.name;
      var card = addCard(f.name);
      try {
        var bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
        var size = computeSize(bmp.width, bmp.height);
        var canvas = render(bmp, size.w, size.h, state.mode, state.format);
        var blob = await toBlob(canvas, state.format, state.quality);
        var url = URL.createObjectURL(blob);
        var filename = outName(f.name, size.w, size.h, state.format);
        finishCard(card, url, blob, size.w, size.h, filename);
        if (state.auto) download(url, filename);
        done++;
        if (bmp.close) bmp.close();
      } catch (err) {
        failCard(card, "无法处理：" + (err && err.message ? err.message : err));
      }
    }
    busy = false;
    statusEl.textContent = "完成 " + done + " / " + imgs.length + " 张" + (state.auto ? "，已自动下载" : "，点结果下方链接下载");
  }

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

  wEl.addEventListener("input", function () {
    state.width = Math.max(1, parseInt(wEl.value || "0", 10) || 0);
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
  modeEl.addEventListener("change", function () { state.mode = modeEl.value; save(); });
  fmtEl.addEventListener("change", function () { state.format = fmtEl.value; syncUI(); save(); });
  qEl.addEventListener("input", function () { state.quality = parseInt(qEl.value, 10); qvEl.textContent = state.quality; save(); });
  autoEl.addEventListener("change", function () { state.auto = autoEl.checked; save(); });
  $("#wpresets").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    state.width = Number(b.dataset.w);
    if (state.lock) state.height = null;
    syncUI(); save();
  });
  $("#clear").addEventListener("click", function () { results.innerHTML = ""; statusEl.textContent = "已清空"; });

  load(); syncUI();
  statusEl.textContent = "已就绪 · 拖入图片即可，全部在本地完成";
})();
