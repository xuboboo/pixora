/* ==========================================================================
   Pixora — 在线修图编辑器
   Zero dependencies. Everything runs in the visitor's browser; no image ever
   leaves the device.

   Document model
   --------------
   doc      offscreen canvas + 2D context — the committed truth. Every
            history entry, crop, rotate and export reads from here.
   stroke   offscreen layer the same size as doc — brush / eraser / shape /
            text accumulate here while a pointer is down, and get composited
            into doc once on pointerup. Keeping it separate is what makes an
            interrupted drag cheap to throw away.
   view     the visible <canvas>. Draws doc (or the adjust preview) plus the
            interactive overlay: crop rect + handles, in-flight shape, the
            text ghost and the brush cursor ring.

   Coordinates
   -----------
   Everything the pointer produces is converted to *image* space immediately
   (see toImg), so the drawing math never has to care about zoom or DPR.
   Image space is mapped into view space by vp = { scale, ox, oy }, where
   (ox, oy) is the image origin in CSS pixels. render() applies that as a
   transform on top of the DPR scale, and nothing else.

   The adjust pipeline is deliberately hand-written instead of using
   ctx.filter: a declarative chain makes the preview, the commit and the
   tests share one code path, and it keeps working on browsers whose filter
   support is incomplete.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var FONT_STACK = 'Inter, "Segoe UI", system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var ZOOM_MIN = 0.05, ZOOM_MAX = 16;
  /* Uint8ClampedArray 赋值是「四舍五入，逢半取偶」，和 Python 侧 np.rint 一致，
     所以像素链里到处直接写浮点值即可，不需要 Math.round。clamp255 已经搬进内核，
     这里只留 clamp 给几何计算用。 */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function mkCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function ctxOf(c) { return c.getContext("2d"); }

  /* humanSize / pad2 / stamp 也来自 pixora-lib.js —— 两边共用一个时间戳格式，
     导出的文件名才不会工具箱一套、编辑器一套。 */
  function humanSize(n) { return Pixora.humanSize(n); }
  function pad2(n) { return Pixora.pad2(n); }
  function stamp() { return Pixora.stamp(); }

  /* ---------- 元素 ---------- */
  var el = {};
  ["ed-open", "ed-file", "ed-undo", "ed-redo", "ed-reset", "ed-info",
   "ed-zoom-out", "ed-zoom", "ed-zoom-in", "ed-fit", "ed-export-open",
   "ed-stage", "ed-view", "ed-empty", "ed-hint",
   "ed-tool-panel", "ed-tool-title", "ed-tool-body",
   "ed-adjust-panel", "ed-adjust", "ed-adj-reset", "ed-adj-apply",
   "ed-filter-panel", "ed-filters",
   "ed-canvas-panel", "ed-cw", "ed-ch",
   "ed-rotate-l", "ed-rotate-r", "ed-flip-h", "ed-flip-v",
   "ed-export-bar", "ed-format", "ed-q", "ed-qv", "ed-download",
   "ed-export-close", "ed-export-note"].forEach(function (id) { el[id] = $("#" + id); });

  var view = el["ed-view"], vctx = ctxOf(view);
  var stage = el["ed-stage"];
  var toolBtns = $$(".editor-rail [data-tool]");

  /* ---------- 文档与视口状态 ---------- */
  var doc = { canvas: null, ctx: null, w: 0, h: 0 };
  var original = null;            /* 重置用的原图快照 */
  var stroke = { canvas: null, ctx: null, live: false, dirty: false, erase: false, shape: false, c: null };
  var preview = { canvas: null, ctx: null, on: false };
  var vp = { scale: 1, ox: 0, oy: 0 };

  var hist = [], redo = [];
  var HIST_MAX = 12;

  var state = {
    tool: "move",
    color: "#4d6bfe",
    size: 14,
    opacity: 100,
    fill: false,
    shape: "rect",
    text: "Pixora",
    textSize: 48,
    textBold: true,
    cropRatio: 0
  };

  var adj = { brightness: 0, contrast: 0, saturation: 0, temp: 0, blur: 0, sharpen: 0, vignette: 0, invert: false, sepia: 0 };
  var adjDirty = false;

  var crop = null;      /* { x0,y0,x1,y1, handle } 图像坐标 */
  var ghostText = null; /* { x, y } */
  var drag = null;      /* 进行中的指针手势 */
  var rafId = 0;

  /* ======================================================================
     1. 文档维护 / 历史
     ====================================================================== */

  function setDocFromCanvas(c) {
    doc.canvas = c;
    doc.ctx = ctxOf(c);
    doc.w = c.width;
    doc.h = c.height;
    stroke.canvas = mkCanvas(doc.w, doc.h);
    stroke.ctx = ctxOf(stroke.canvas);
    stroke.live = false;
    stroke.dirty = false;
    preview.canvas = mkCanvas(doc.w, doc.h);
    preview.ctx = ctxOf(preview.canvas);
    preview.on = false;
    /* 大图的 ImageData 快照很贵：400 万像素一份就是 16MB。按面积收窄历史深度，
       免得一张 6000×4000 的照片直接把标签页吃爆。 */
    HIST_MAX = doc.w * doc.h > 4e6 ? 4 : 12;
    hist = []; redo = [];
    syncChrome();
  }

  function snap() { return doc.ctx.getImageData(0, 0, doc.w, doc.h); }

  function pushHistory() {
    hist.push(snap());
    if (hist.length > HIST_MAX) hist.shift();
    redo.length = 0;
    syncChrome();
  }

  function restore(im) {
    var c = mkCanvas(im.width, im.height);
    ctxOf(c).putImageData(im, 0, 0);
    /* setDocFrom 会清空历史，所以这里只换画布、不动栈。 */
    var keep = hist, keepRedo = redo, keepMax = HIST_MAX;
    setDocFromCanvas(c);
    hist = keep; redo = keepRedo; HIST_MAX = keepMax;
    syncChrome();
  }

  function undo() {
    if (!hist.length || !doc.canvas) return;
    redo.push(snap());
    restore(hist.pop());
  }

  function redoIt() {
    if (!redo.length || !doc.canvas) return;
    hist.push(snap());
    restore(redo.pop());
  }

  function resetDoc() {
    if (!original) return;
    pushHistory();
    restore(original);
  }

  /* ======================================================================
     2. 视口：缩放 / 平移 / 适配
     ====================================================================== */

  function stageBox() {
    var pad = 16;
    return {
      w: Math.max(1, stage.clientWidth - pad * 2),
      h: Math.max(1, stage.clientHeight - pad * 2)
    };
  }

  function fitView() {
    if (!doc.canvas) return;
    var b = stageBox();
    var s = Math.min(b.w / doc.w, b.h / doc.h);
    /* 适配是把整张图塞进可视区，所以永远不该超过 100%。 */
    vp.scale = clamp(Math.min(s, 1), ZOOM_MIN, ZOOM_MAX);
    vp.ox = (b.w - doc.w * vp.scale) / 2 + 16;
    vp.oy = (b.h - doc.h * vp.scale) / 2 + 16;
    syncZoom();
  }

  function zoomAt(factor, cx, cy) {
    if (!doc.canvas) return;
    var before = { x: (cx - vp.ox) / vp.scale, y: (cy - vp.oy) / vp.scale };
    vp.scale = clamp(vp.scale * factor, ZOOM_MIN, ZOOM_MAX);
    vp.ox = cx - before.x * vp.scale;
    vp.oy = cy - before.y * vp.scale;
    syncZoom();
    schedule();
  }

  function zoomCentered(factor) {
    var b = stageBox();
    zoomAt(factor, b.w / 2 + 16, b.h / 2 + 16);
  }

  function syncZoom() {
    if (el["ed-zoom"]) el["ed-zoom"].textContent = Math.round(vp.scale * 100) + "%";
  }

  function toImg(clientX, clientY) {
    var r = view.getBoundingClientRect();
    return {
      x: (clientX - r.left - vp.ox) / vp.scale,
      y: (clientY - r.top - vp.oy) / vp.scale
    };
  }

  /* 反过来：图像坐标 → 视口坐标。审计脚本要靠它把「点画布上第 100 个像素」
     翻译成鼠标该去哪儿，不然测试只能在大致位置乱点。 */
  function toScreen(ix, iy) {
    var r = view.getBoundingClientRect();
    return { x: r.left + vp.ox + ix * vp.scale, y: r.top + vp.oy + iy * vp.scale };
  }

  /* ======================================================================
     3. 渲染
     ====================================================================== */

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; render(); });
  }

  function render() {
    var cw = stage.clientWidth, ch = stage.clientHeight;
    if (cw < 2 || ch < 2) return;
    var bw = Math.round(cw * DPR), bh = Math.round(ch * DPR);
    if (view.width !== bw || view.height !== bh) { view.width = bw; view.height = bh; }

    vctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    vctx.clearRect(0, 0, cw, ch);
    if (!doc.canvas) return;

    /* 透明底给棋盘格，否则透明区域和白底页面糊成一片，看不出有没有 alpha。 */
    var c0 = { x: vp.ox, y: vp.oy };
    var c1 = { x: vp.ox + doc.w * vp.scale, y: vp.oy + doc.h * vp.scale };
    if (c1.x > c0.x && c1.y > c0.y) {
      vctx.save();
      vctx.beginPath();
      vctx.rect(c0.x, c0.y, c1.x - c0.x, c1.y - c0.y);
      vctx.clip();
      var cell = 10;
      vctx.fillStyle = "rgba(127,127,127,.14)";
      for (var gy = Math.floor(c0.y / cell); gy * cell < c1.y; gy++) {
        for (var gx = Math.floor(c0.x / cell); gx * cell < c1.x; gx++) {
          if (((gx + gy) & 1) === 0) vctx.fillRect(gx * cell, gy * cell, cell, cell);
        }
      }
      vctx.restore();
    }

    vctx.save();
    vctx.translate(vp.ox, vp.oy);
    vctx.scale(vp.scale, vp.scale);
    vctx.imageSmoothingEnabled = vp.scale < 1;
    vctx.imageSmoothingQuality = "low";
    vctx.drawImage(preview.on && preview.canvas ? preview.canvas : doc.canvas, 0, 0);
    if (stroke.dirty) vctx.drawImage(stroke.canvas, 0, 0);
    vctx.restore();

    drawOverlay(cw, ch);
  }

  /* 互动层画在 CSS 像素空间，不跟着 vp 变换走，否则线宽会被缩放一起吃进去。 */
  function drawOverlay(cw, ch) {
    if (crop && crop.x1 > crop.x0) {
      var x = vp.ox + crop.x0 * vp.scale, y = vp.oy + crop.y0 * vp.scale;
      var w = (crop.x1 - crop.x0) * vp.scale, h = (crop.y1 - crop.y0) * vp.scale;
      vctx.save();
      vctx.fillStyle = "rgba(8,12,22,.55)";
      vctx.beginPath();
      vctx.rect(0, 0, cw, ch);
      vctx.rect(x + w, y, -w, h);
      vctx.fill("evenodd");
      vctx.strokeStyle = "#4d6bfe";
      vctx.lineWidth = 1;
      vctx.strokeRect(x + .5, y + .5, w, h);
      /* 三分线 */
      vctx.strokeStyle = "rgba(255,255,255,.5)";
      vctx.beginPath();
      for (var i = 1; i < 3; i++) {
        vctx.moveTo(x + w * i / 3, y); vctx.lineTo(x + w * i / 3, y + h);
        vctx.moveTo(x, y + h * i / 3); vctx.lineTo(x + w, y + h * i / 3);
      }
      vctx.stroke();
      /* 角把手 */
      vctx.fillStyle = "#fff";
      vctx.strokeStyle = "#4d6bfe";
      vctx.lineWidth = 1.5;
      var hs = 4;
      var pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
      for (var p = 0; p < 4; p++) {
        vctx.beginPath();
        vctx.rect(pts[p][0] - hs, pts[p][1] - hs, hs * 2, hs * 2);
        vctx.fill(); vctx.stroke();
      }
      vctx.restore();
    }

    /* 形状与画笔的实时预览都画在 stroke 层上，render() 已经合成过了 ——
       这里再描一遍就是双重渲染。所以只留裁剪框、取色光标和文字虚影。 */
    if (ghostText && state.tool === "text" && state.text) {
      vctx.save();
      vctx.font = (state.textBold ? "700 " : "400 ") + state.textSize + "px " + FONT_STACK;
      vctx.textBaseline = "middle";
      vctx.fillStyle = state.color;
      vctx.fillText(state.text, vp.ox + ghostText.x * vp.scale, vp.oy + ghostText.y * vp.scale);
      vctx.restore();
    }

    if ((state.tool === "brush" || state.tool === "eraser") && drag && drag.preview === "brush") {
      vctx.save();
      vctx.strokeStyle = state.tool === "eraser" ? "#fff" : state.color;
      vctx.lineWidth = 1.5;
      vctx.setLineDash([4, 4]);
      vctx.beginPath();
      vctx.arc(drag.cur.vx, drag.cur.vy, Math.max(2, state.size * vp.scale / 2), 0, 6.2832);
      vctx.stroke();
      vctx.restore();
    }
  }

  /* ======================================================================
     4. 像素调整链 —— 实现在 pixora-lib.js
     ====================================================================== */
  var ADJ_KEYS = ["brightness", "contrast", "saturation", "temp", "blur", "sharpen", "vignette"];
  function adjActive() {
    for (var i = 0; i < ADJ_KEYS.length; i++) if (adj[ADJ_KEYS[i]]) return true;
    return adj.invert || adj.sepia > 0;
  }

  /* 亮度/对比度/饱和度/色温的 LUT、可分离盒式模糊、3×3 反锐化、椭圆暗角，
     全在 pixora-lib.js 里。编辑器原来手写了第二份 —— 工具箱调色温系数时改了一边，
     另一边不知道，这正是当初把它们收进内核要解决的问题。 */
  function applyChain(src, w, h, a) {
    return Pixora.pixels.adjust(src, w, h, a);
  }

  function refreshPreview() {
    if (!doc.canvas) return;
    if (!adjActive()) {
      preview.on = false;
      el["ed-adj-apply"].disabled = true;
      adjDirty = false;
      schedule();
      return;
    }
    preview.on = true;
    var src = doc.ctx.getImageData(0, 0, doc.w, doc.h);
    var out = applyChain(src.data, doc.w, doc.h, adj);
    var im = doc.ctx.createImageData(doc.w, doc.h);
    im.data.set(out);
    preview.ctx.putImageData(im, 0, 0);
    el["ed-adj-apply"].disabled = false;
    adjDirty = false;
    schedule();
  }

  function commitAdjust() {
    if (!doc.canvas || !adjActive()) return;
    pushHistory();
    var im = doc.ctx.createImageData(doc.w, doc.h);
    im.data.set(applyChain(snap().data, doc.w, doc.h, adj));
    doc.ctx.putImageData(im, 0, 0);
    ADJ_KEYS.forEach(function (k) { adj[k] = 0; });
    adj.invert = false; adj.sepia = 0;
    buildAdjustPanel();
    refreshPreview();
  }

  /* ======================================================================
     5. 滤镜预设
     ====================================================================== */

  var FILTERS = [
    { id: "gray",     name: "黑白",   a: { saturation: -100 } },
    { id: "sepia",    name: "复古",   a: { sepia: 80 } },
    { id: "cool",     name: "冷调",   a: { temp: -34, saturation: 12 } },
    { id: "warm",     name: "暖调",   a: { temp: 34, saturation: 12 } },
    { id: "punch",    name: "浓烈",   a: { contrast: 34, saturation: 26 } },
    { id: "soft",     name: "柔和",   a: { blur: 20, brightness: 7, saturation: -10 } },
    { id: "sharp",    name: "清晰",   a: { sharpen: 50 } },
    { id: "dark",     name: "暗角",   a: { vignette: 48, contrast: 8 } },
    { id: "invert",   name: "反色",   a: { invert: true } }
  ];

  function applyFilter(f) {
    if (!doc.canvas) return;
    pushHistory();
    ADJ_KEYS.forEach(function (k) { adj[k] = 0; });
    adj.invert = false; adj.sepia = 0;
    Object.keys(f.a).forEach(function (k) { adj[k] = f.a[k]; });
    var im = doc.ctx.createImageData(doc.w, doc.h);
    im.data.set(applyChain(snap().data, doc.w, doc.h, adj));
    doc.ctx.putImageData(im, 0, 0);
    ADJ_KEYS.forEach(function (k) { adj[k] = 0; });
    adj.invert = false; adj.sepia = 0;
    preview.on = false;
    buildAdjustPanel();
    hint("已应用滤镜：" + f.name);
    schedule();
  }

  /* ======================================================================
     6. 绘制：画笔 / 橡皮 / 形状 / 文字 / 取色
     ====================================================================== */

  function traceShape(c, from, to) {
    var x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
    var w = Math.abs(to.x - from.x), h = Math.abs(to.y - from.y);
    if (state.shape === "rect") c.rect(x, y, w, h);
    else if (state.shape === "ellipse") c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 6.2832);
    else { c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); }
  }

  /* 图层策略。
     画笔 / 形状 / 文字画在 stroke 这一层，抬手时一次性合成进 doc —— 拖到一半
     放弃不会在文档上留痕。
     橡皮相反：它必须直接作用在 doc.ctx 上，用 destination-out。
     早先的写法是把橡皮也画到 stroke 层（那层于是变成透明），再以 source-over
     合成回 doc —— 透明的像素叠上去什么都不会发生，橡皮整个是失效的。 */
  function beginStroke() {
    stroke.erase = state.tool === "eraser";
    stroke.shape = state.tool === "shapes";
    stroke.dirty = false;
    stroke.ctx.setTransform(1, 0, 0, 1, 0, 0);
    stroke.ctx.clearRect(0, 0, doc.w, doc.h);
    var c = stroke.erase ? doc.ctx : stroke.ctx;
    stroke.c = c;
    c.save();
    c.beginPath();
    c.rect(0, 0, doc.w, doc.h);
    c.clip();
    if (stroke.erase) {
      c.globalCompositeOperation = "destination-out";
      c.globalAlpha = state.opacity / 100;
      c.strokeStyle = "rgba(0,0,0,1)";
      c.fillStyle = "rgba(0,0,0,1)";
      c.lineWidth = state.size;
      c.lineCap = "round"; c.lineJoin = "round";
    } else {
      paintConfig(c);
    }
  }

  function paintConfig(c) {
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = state.size;
    c.strokeStyle = state.color;
    c.fillStyle = state.color;
    c.globalAlpha = state.opacity / 100;
    c.globalCompositeOperation = "source-over";
  }

  function strokeSegment(from, to) {
    var c = stroke.c;
    if (!c) return;
    if (!stroke.erase) paintConfig(c);
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
    stroke.dirty = true;
  }

  /* 形状是「替换」而不是「累加」：每一帧清掉重画，拖出来的预览才是最终形态。
     累加版会把拖动轨迹全描一遍。 */
  function redrawShape(from, to) {
    if (stroke.erase) return;
    var c = stroke.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, doc.w, doc.h);
    paintConfig(c);
    c.beginPath();
    traceShape(c, from, to);
    if (state.fill && state.shape !== "line") c.fill(); else c.stroke();
    stroke.dirty = true;
  }

  function stampDot(p) {
    var c = stroke.c;
    if (!c) return;
    if (!stroke.erase) paintConfig(c);
    c.beginPath();
    c.arc(p.x, p.y, state.size / 2, 0, 6.2832);
    c.fill();
    stroke.dirty = true;
  }

  function commitStroke() {
    var c = stroke.c;
    if (!c) return;
    c.restore();
    if (!stroke.erase && stroke.dirty) doc.ctx.drawImage(stroke.canvas, 0, 0);
    stroke.c = null;
    stroke.dirty = false;
    stroke.ctx.setTransform(1, 0, 0, 1, 0, 0);
    stroke.ctx.clearRect(0, 0, doc.w, doc.h);
    schedule();
  }

  /* ---------- 裁剪 ---------- */

  function normCrop() {
    if (!crop) return null;
    return {
      x: Math.min(crop.x0, crop.x1), y: Math.min(crop.y0, crop.y1),
      w: Math.abs(crop.x1 - crop.x0), h: Math.abs(crop.y1 - crop.y0)
    };
  }

  function setCropFull() {
    crop = { x0: 0, y0: 0, x1: doc.w, y1: doc.h };
  }

  function hitCropHandle(p) {
    if (!crop) return null;
    var tol = 10 / vp.scale;
    var n = normCrop();
    var pts = {
      nw: [n.x, n.y], ne: [n.x + n.w, n.y],
      sw: [n.x, n.y + n.h], se: [n.x + n.w, n.y + n.h]
    };
    var keys = Object.keys(pts);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (Math.abs(p.x - pts[k][0]) <= tol && Math.abs(p.y - pts[k][1]) <= tol) return k;
    }
    return null;
  }

  function applyRatio(r, anchor, px, py) {
    /* 比例约束下以 anchor 为固定角，另一边由当前指针推出来。 */
    var w = Math.abs(px - anchor.x), h = Math.abs(py - anchor.y);
    var useW = w / r > h ? h * r : w;
    var nh = useW / r;
    var sx = px < anchor.x ? -1 : 1, sy = py < anchor.y ? -1 : 1;
    return {
      x0: anchor.x, y0: anchor.y,
      x1: anchor.x + sx * useW, y1: anchor.y + sy * nh
    };
  }

  function applyCrop() {
    if (!doc.canvas || !crop) return;
    var n = normCrop();
    var cw = Math.round(n.w), ch = Math.round(n.h);
    if (cw < 1 || ch < 1) return;
    pushHistory();
    var c = mkCanvas(cw, ch);
    ctxOf(c).drawImage(doc.canvas, Math.round(n.x), Math.round(n.y), cw, ch, 0, 0, cw, ch);
    setDocFromCanvas(c);
    crop = null;
    syncCanvasPanel();
    fitView();
    schedule();
    hint("已裁剪为 " + cw + " × " + ch);
  }

  /* ---------- 变换 ---------- */

  function rotate90(ccw) {
    if (!doc.canvas) return;
    pushHistory();
    var c = mkCanvas(doc.h, doc.w);
    var x = ctxOf(c);
    x.translate(ccw ? 0 : doc.h, ccw ? doc.w : 0);
    x.rotate(ccw ? -Math.PI / 2 : Math.PI / 2);
    x.drawImage(doc.canvas, 0, 0);
    setDocFromCanvas(c);
    syncCanvasPanel();
    fitView();
    schedule();
  }

  function flip(horizontal) {
    if (!doc.canvas) return;
    pushHistory();
    var c = mkCanvas(doc.w, doc.h);
    var x = ctxOf(c);
    x.translate(horizontal ? doc.w : 0, horizontal ? 0 : doc.h);
    x.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
    x.drawImage(doc.canvas, 0, 0);
    setDocFromCanvas(c);
    schedule();
  }

  function resizeCanvas(w, h) {
    if (!doc.canvas) return;
    w = clamp(Math.round(w), 1, 8000);
    h = clamp(Math.round(h), 1, 8000);
    if (w === doc.w && h === doc.h) return;
    pushHistory();
    var c = mkCanvas(w, h);
    /* 内容居中留白，和裁剪工具的手感一致：改画布是「加纸」，不是「拉伸」。 */
    ctxOf(c).drawImage(doc.canvas, Math.round((w - doc.w) / 2), Math.round((h - doc.h) / 2));
    setDocFromCanvas(c);
    syncCanvasPanel();
    fitView();
    schedule();
  }

  /* ======================================================================
     7. 侧栏面板
     ====================================================================== */

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 滑杆统一走 get/set：调整面板写 adj，工具面板写 state。
     早年这里按 key 名往 adj 上贴，结果「画笔粗细」被记成了 adj.brushsize，
     滑块看着能动，实际什么都没改。 */
  function sliderRow(label, min, max, get, set, suffix) {
    var wrap = node("div", "slider-row");
    var head = node("div", "slider-head");
    head.appendChild(node("label", null, label));
    var out = node("output", null, get() + (suffix || ""));
    head.appendChild(out);
    wrap.appendChild(head);
    var inp = document.createElement("input");
    inp.type = "range";
    inp.min = String(min); inp.max = String(max);
    inp.value = String(get());
    inp.step = "1";
    inp.setAttribute("aria-label", label);
    inp.addEventListener("input", function () {
      var v = Number(inp.value);
      set(v);
      out.textContent = v + (suffix || "");
      adjDirty = true;
      schedulePreview();
    });
    wrap.appendChild(inp);
    return wrap;
  }

  var previewTimer = 0;
  /* 全分辨率重算一帧调整在大图上要几十毫秒，滑块拖动时会密到没有节流余地。
     这里用 60ms 的合并窗口：手一停就出结果，拖动过程中不死等。 */
  function schedulePreview() {
    if (previewTimer) return;
    previewTimer = setTimeout(function () {
      previewTimer = 0;
      if (adjDirty) refreshPreview();
    }, 60);
  }

  var TOOL_PANELS = {
    move: {
      title: "移动",
      body: function () {
        var p = node("p", "panel-note", "在画布上拖动可以平移画面；滚轮以光标为中心缩放，工具栏的「适配」一键回到整图。");
        return [p];
      }
    },
    crop: {
      title: "裁剪",
      body: function () {
        var frag = [];
        var lab = node("div", "panel-label", "比例");
        frag.push(lab);
        var chips = node("div", "chips");
        var ratios = [["自由", 0], ["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["16:9", 16 / 9], ["9:16", 9 / 16]];
        ratios.forEach(function (r) {
          var b = node("button", "chip" + (state.cropRatio === r[1] ? " on" : ""), r[0]);
          b.type = "button";
          b.setAttribute("aria-pressed", String(state.cropRatio === r[1]));
          b.addEventListener("click", function () {
            state.cropRatio = r[1];
            if (r[1] && crop) {
              var n = normCrop();
              var anchor = { x: n.x, y: n.y };
              var t = applyRatio(r[1], anchor, n.x + n.w, n.y + n.h);
              crop.x0 = t.x0; crop.y0 = t.y0; crop.x1 = t.x1; crop.y1 = t.y1;
            }
            buildToolPanel(); schedule();
          });
          chips.appendChild(b);
        });
        frag.push(chips);
        var note = node("p", "panel-note", "在画布上拖出一个选区，四角可以单独拖动；确定后点「应用裁剪」。");
        frag.push(note);
        var acts = node("div", "panel-actions");
        var ok = node("button", "btn btn-sm", "应用裁剪");
        ok.type = "button";
        ok.id = "ed-crop-apply";
        ok.addEventListener("click", applyCrop);
        var no = node("button", "btn btn-ghost btn-sm", "取消");
        no.type = "button";
        no.addEventListener("click", function () { crop = null; buildToolPanel(); schedule(); });
        acts.appendChild(ok); acts.appendChild(no);
        frag.push(acts);
        return frag;
      }
    },
    brush: {
      title: "画笔",
      body: function () { return brushPanel(false); }
    },
    eraser: {
      title: "橡皮",
      body: function () { return brushPanel(true); }
    },
    shapes: {
      title: "形状",
      body: function () {
        var frag = [];
        var chips = node("div", "chips");
        [["rect", "矩形"], ["ellipse", "椭圆"], ["line", "直线"]].forEach(function (s) {
          var b = node("button", "chip" + (state.shape === s[0] ? " on" : ""), s[1]);
          b.type = "button";
          b.setAttribute("aria-pressed", String(state.shape === s[0]));
          b.addEventListener("click", function () { state.shape = s[0]; buildToolPanel(); });
          chips.appendChild(b);
        });
        frag.push(chips);
        frag.push(toggleRow("填充", function () { return state.fill; }, function (v) { state.fill = v; schedule(); }));
        frag.push(sliderRow("粗细", 1, 80,
          function () { return state.size; },
          function (v) { state.size = v; }, " px"));
        frag.push(colorRow());
        frag.push(sliderRow("不透明度", 10, 100,
          function () { return state.opacity; },
          function (v) { state.opacity = v; }, "%"));
        return frag;
      }
    },
    text: {
      title: "文字",
      body: function () {
        var frag = [];
        var lab = node("label", "panel-field", "文字内容");
        var inp = document.createElement("input");
        inp.type = "text";
        inp.value = state.text;
        inp.id = "ed-text-input";
        inp.maxLength = 120;
        inp.addEventListener("input", function () {
          state.text = inp.value;
          schedule();
        });
        lab.appendChild(inp);
        frag.push(lab);
        frag.push(sliderRow("字号", 8, 240,
          function () { return state.textSize; },
          function (v) { state.textSize = v; }, " px"));
        frag.push(colorRow());
        frag.push(toggleRow("加粗", function () { return state.textBold; }, function (v) { state.textBold = v; schedule(); }));
        var p = node("p", "panel-note", "在画布上点击即落字；移动时会有预览跟随光标，确认位置再点。");
        frag.push(p);
        return frag;
      }
    },
    pick: {
      title: "取色",
      body: function () {
        var p = node("p", "panel-note", "在画布上点一下取色，结果会写进画笔 / 形状 / 文字的当前颜色。");
        var sw = node("div", "swatch-row");
        var box = node("span", "swatch");
        box.id = "ed-swatch";
        box.style.background = state.color;
        var val = node("code", null, state.color.toUpperCase());
        val.id = "ed-swatch-val";
        sw.appendChild(box); sw.appendChild(val);
        return [p, sw];
      }
    }
  };

  function brushPanel(isEraser) {
    var frag = [];
    frag.push(sliderRow("粗细", 1, 80,
      function () { return state.size; },
      function (v) { state.size = v; }, " px"));
    frag.push(sliderRow("不透明度", 10, 100,
      function () { return state.opacity; },
      function (v) { state.opacity = v; }, "%"));
    if (isEraser) {
      frag.push(node("p", "panel-note", "橡皮擦到透明。导出 JPG 时会自动铺上白底，因为该格式没有 alpha 通道。"));
    } else {
      frag.push(colorRow());
    }
    return frag;
  }

  function colorRow() {
    var lab = node("label", "panel-field", "颜色");
    var inp = document.createElement("input");
    inp.type = "color";
    inp.value = state.color;
    inp.id = "ed-color";
    inp.addEventListener("input", function () { state.color = inp.value; schedule(); });
    lab.appendChild(inp);
    return lab;
  }

  function toggleRow(label, get, set) {
    var l = document.createElement("label");
    l.className = "switch-row";
    var s = document.createElement("span");
    s.className = "switch";
    var i = document.createElement("input");
    i.type = "checkbox";
    i.checked = get();
    var t = node("span", "track");
    s.appendChild(i); s.appendChild(t);
    l.appendChild(s);
    l.appendChild(node("span", null, label));
    i.addEventListener("change", function () { set(i.checked); syncChrome(); });
    return l;
  }

  function buildToolPanel() {
    var def = TOOL_PANELS[state.tool];
    if (!def) return;
    el["ed-tool-title"].textContent = def.title;
    var body = el["ed-tool-body"];
    body.innerHTML = "";
    def.body().forEach(function (n) { body.appendChild(n); });
    el["ed-tool-panel"].hidden = !doc.canvas;
  }

  var ADJ_SLIDERS = [
    ["brightness", "亮度", -100, 100],
    ["contrast", "对比度", -100, 100],
    ["saturation", "饱和度", -100, 100],
    ["temp", "色温", -100, 100],
    ["blur", "模糊", 0, 100],
    ["sharpen", "锐化", 0, 100],
    ["vignette", "暗角", 0, 100]
  ];

  function buildAdjustPanel() {
    var box = el["ed-adjust"];
    if (!box) return;
    box.innerHTML = "";
    ADJ_SLIDERS.forEach(function (s) {
      box.appendChild(sliderRow(s[1], s[2], s[3],
        function () { return adj[s[0]]; },
        function (v) { adj[s[0]] = v; }));
    });
    el["ed-adj-apply"].disabled = !adjActive();
  }

  /* ======================================================================
     8. 状态同步 / 导入 / 指针 / 导出 / 启动
     ====================================================================== */

  function syncChrome() {
    var has = !!doc.canvas;
    el["ed-undo"].disabled = !hist.length;
    el["ed-redo"].disabled = !redo.length;
    el["ed-reset"].disabled = !original;
    el["ed-export-open"].disabled = !has;
    el["ed-empty"].hidden = has;
    el["ed-tool-panel"].hidden = !has;
    el["ed-adjust-panel"].hidden = !has;
    el["ed-filter-panel"].hidden = !has;
    el["ed-canvas-panel"].hidden = !has;
    el["ed-info"].textContent = has
      ? doc.w + " × " + doc.h + " px"
      : "尚未打开图片";
    if (has) buildToolPanel();
  }

  function syncCanvasPanel() {
    if (!doc.canvas) return;
    el["ed-cw"].value = String(doc.w);
    el["ed-ch"].value = String(doc.h);
  }

  function hint(t) {
    el["ed-hint"].textContent = t;
    el["ed-hint"].hidden = false;
    clearTimeout(hint._t);
    hint._t = setTimeout(function () { el["ed-hint"].hidden = true; }, 4000);
  }

  /* ---------- 导入 ---------- */

  function loadFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { hint("这个文件不是图片：" + (file.type || "未知类型")); return; }
    var done = function (src) {
      var c = mkCanvas(src.width, src.height);
      ctxOf(c).drawImage(src, 0, 0);
      setDocFromCanvas(c);
      original = snap();
      crop = null; ghostText = null;
      syncCanvasPanel();
      fitView();
      schedule();
      hint("已打开 " + doc.w + " × " + doc.h + " · " + humanSize(file.size));
    };
    if (window.createImageBitmap) {
      window.createImageBitmap(file).then(done).catch(function () {
        hint("这张图片浏览器解不开，换一张试试");
      });
    } else {
      var url = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); done(im); };
      im.onerror = function () { URL.revokeObjectURL(url); hint("这张图片浏览器解不开，换一张试试"); };
      im.src = url;
    }
  }

  /* ---------- 指针 ---------- */

  function pointerTool() { return state.tool; }

  function onDown(e) {
    if (!doc.canvas) return;
    if (e.button === 1 || e.button === 2) return;
    var p = toImg(e.clientX, e.clientY);
    /* 捕获指针让拖到画布外也能收到 move/up。取不到就退化成不捕获 ——
       某些环境里 pointerId 对不上会直接抛，那样整段交互就废了。 */
    try { view.setPointerCapture(e.pointerId); } catch (err) {}
    var t = pointerTool();

    if (t === "move") {
      drag = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: vp.ox, oy: vp.oy };
      stage.classList.add("panning");
    } else if (t === "crop") {
      var h = hitCropHandle(p);
      if (h) {
        var n = normCrop();
        var fixed = { nw: [n.x + n.w, n.y + n.h], ne: [n.x, n.y + n.h], sw: [n.x + n.w, n.y], se: [n.x, n.y] }[h];
        drag = { kind: "handle", h: h, ax: fixed[0], ay: fixed[1] };
      } else if (p.x >= 0 && p.y >= 0 && p.x < doc.w && p.y < doc.h &&
                 crop && p.x > crop.x0 && p.x < crop.x1 && p.y > crop.y0 && p.y < crop.y1) {
        drag = { kind: "cropmove", sx: p.x, sy: p.y, cx0: crop.x0, cy0: crop.y0, cx1: crop.x1, cy1: crop.y1 };
      } else {
        crop = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        drag = { kind: "newcrop" };
      }
      buildToolPanel();
    } else if (t === "brush" || t === "eraser") {
      /* 一笔一历史，快照在落笔前拍 —— 撤销要退回到没画之前。
         放在抬手处的话，橡皮这种直接改 doc 的工具会把已经擦掉的状态
         当成「前一步」存进栈，撤销一步什么都不会发生。 */
      pushHistory();
      beginStroke();
      stampDot(p);
      drag = { kind: "paint", preview: "brush", from: p, to: p,
               cur: { vx: e.clientX - view.getBoundingClientRect().left,
                      vy: e.clientY - view.getBoundingClientRect().top } };
    } else if (t === "shapes") {
      beginStroke();
      /* anchor 是按下时那个点，整段拖动都以它为固定角。
         复用 drag.from 的话，它每帧都被改写成上一帧的位置，形状就退化成
         一串零面积的碎片，最后什么都没留下。 */
      drag = { kind: "paint", preview: "shape", anchor: p, from: p, to: p };
    } else if (t === "text") {
      /* 空字符串点下去不该占一个撤销位。 */
      if (!state.text) { drag = null; schedule(); e.preventDefault(); return; }
      pushHistory();
      beginStroke();
      stroke.dirty = true;
      var c = stroke.c;
      c.font = (state.textBold ? "700 " : "400 ") + state.textSize + "px " + FONT_STACK;
      c.textBaseline = "middle";
      c.fillText(state.text, p.x, p.y);
      commitStroke();
      hint("已添加文字「" + state.text + "」");
    } else if (t === "pick") {
      var ix = Math.floor(p.x), iy = Math.floor(p.y);
      if (ix >= 0 && iy >= 0 && ix < doc.w && iy < doc.h) {
        var d = doc.ctx.getImageData(ix, iy, 1, 1).data;
        var hex = "#" + [d[0], d[1], d[2]].map(function (v) {
          return ("0" + v.toString(16)).slice(-2);
        }).join("");
        state.color = hex;
        var sw = $("#ed-swatch"), sv = $("#ed-swatch-val");
        if (sw) sw.style.background = hex;
        if (sv) sv.textContent = hex.toUpperCase();
        hint("已取色 " + hex.toUpperCase() + "（透明度 " + d[3] + "）");
        syncChrome();
      }
    }
    schedule();
    e.preventDefault();
  }

  function onMove(e) {
    if (!doc.canvas) return;
    var r = view.getBoundingClientRect();
    var vx = e.clientX - r.left, vy = e.clientY - r.top;

    if (state.tool === "text" && !drag) {
      ghostText = toImg(e.clientX, e.clientY);
      schedule();
      return;
    }
    if (!drag) return;
    var p = toImg(e.clientX, e.clientY);

    if (drag.kind === "pan") {
      vp.ox = drag.ox + (e.clientX - drag.sx);
      vp.oy = drag.oy + (e.clientY - drag.sy);
    } else if (drag.kind === "newcrop") {
      crop.x1 = p.x; crop.y1 = p.y;
    } else if (drag.kind === "handle") {
      var q = applyRatioFreeOrFixed(drag, p);
      crop.x0 = q.x0; crop.y0 = q.y0; crop.x1 = q.x1; crop.y1 = q.y1;
    } else if (drag.kind === "cropmove") {
      var dx = p.x - drag.sx, dy = p.y - drag.sy;
      crop.x0 = drag.cx0 + dx; crop.x1 = drag.cx1 + dx;
      crop.y0 = drag.cy0 + dy; crop.y1 = drag.cy1 + dy;
    } else if (drag.kind === "paint") {
      if (drag.preview === "brush") drag.cur = { vx: vx, vy: vy };
      drag.to = p;
      if (drag.preview === "shape") redrawShape(drag.anchor, p);
      else strokeSegment(drag.from, p);
      drag.from = p;
    }
    schedule();
  }

  function applyRatioFreeOrFixed(dragObj, p) {
    if (state.cropRatio > 0) {
      return applyRatio(state.cropRatio, { x: dragObj.ax, y: dragObj.ay }, p.x, p.y);
    }
    return { x0: dragObj.ax, y0: dragObj.ay, x1: p.x, y1: p.y };
  }

  function onUp() {
    if (!drag) return;
    var kind = drag.kind;
    if (kind === "newcrop") {
      /* 拖出来是个不到 2px 的点，那只是手抖：当没拖过，并把按下时入栈的
         那条历史弹掉，免得撤销一步什么都没发生。 */
      var n = normCrop();
      if (!n || n.w < 2 || n.h < 2) {
        crop = null;
        if (hist.length) hist.pop();
        syncChrome();
      }
    } else if (kind === "paint") {
      /* 抬起来才发现这一下什么都没画（比如形状点了个零面积），
         就把落笔时入栈的那条弹掉 —— 否则撤销一步会是空操作。 */
      if (!stroke.dirty && hist.length) hist.pop();
      commitStroke();
      syncChrome();
    }
    drag = null;
    stage.classList.remove("panning");
    schedule();
  }

  /* ---------- 导出 ---------- */

  function doExport() {
    if (!doc.canvas) return;
    var fmt = el["ed-format"].value;
    var q = Number(el["ed-q"].value) / 100;
    var mime = "image/" + fmt;
    var src = doc.canvas;
    if (fmt === "jpeg") {
      /* JPEG 没有 alpha，透明区域会变黑。按 Home 工具箱同一套规矩铺白底。 */
      src = mkCanvas(doc.w, doc.h);
      var x = ctxOf(src);
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, doc.w, doc.h);
      x.drawImage(doc.canvas, 0, 0);
    }
    var note = el["ed-export-note"];
    if (src.toBlob) {
      src.toBlob(function (blob) {
        if (!blob) { note.textContent = "这个格式当前浏览器写不出来，换 PNG 或 JPG 试试"; return; }
        var name = "pixora-" + doc.w + "x" + doc.h + "-" + stamp() + "." + (fmt === "jpeg" ? "jpg" : fmt);
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        note.textContent = fmt.toUpperCase() + (fmt === "png" ? " · 无损" : " · 质量 " + Math.round(q * 100) + "%") +
          " · " + doc.w + " × " + doc.h + " · " + humanSize(blob.size);
      }, mime, fmt === "png" ? undefined : q);
    } else {
      note.textContent = "当前浏览器不支持导出，请改用最新版 Chrome / Edge / Firefox";
    }
  }

  /* ======================================================================
     9. 接线与启动
     ====================================================================== */

  function setTool(name) {
    state.tool = name;
    /* 光标形状交给 CSS 决定，这里只把档位写到舞台上。 */
    if (stage) stage.setAttribute("data-tool", name);
    toolBtns.forEach(function (b) {
      var on = b.dataset.tool === name;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    ghostText = null;
    if (name !== "crop") {
      crop = null;
    } else if (doc.canvas) {
      /* 切到裁剪先给一个整图选区：四角把手一上来就可见，用户是「收拢」
         而不是「从零拉」。 */
      setCropFull();
    }
    buildToolPanel();
    schedule();
  }

  toolBtns.forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.dataset.tool); });
  });

  if (el["ed-open"]) {
    el["ed-open"].addEventListener("click", function () { el["ed-file"].click(); });
  }
  if (el["ed-file"]) {
    el["ed-file"].addEventListener("change", function () {
      var f = el["ed-file"].files && el["ed-file"].files[0];
      /* 清空 value，否则连续选同一个文件不会再触发 change。 */
      el["ed-file"].value = "";
      if (f) loadFile(f);
    });
  }

  el["ed-undo"].addEventListener("click", undo);
  el["ed-redo"].addEventListener("click", redoIt);
  el["ed-reset"].addEventListener("click", function () {
    resetDoc();
    hint("已还原为原图");
  });

  el["ed-zoom-in"].addEventListener("click", function () { zoomCentered(1.25); });
  el["ed-zoom-out"].addEventListener("click", function () { zoomCentered(1 / 1.25); });
  el["ed-fit"].addEventListener("click", function () { fitView(); schedule(); });

  if (el["ed-export-open"]) {
    el["ed-export-open"].addEventListener("click", function () {
      el["ed-export-bar"].hidden = !el["ed-export-bar"].hidden;
    });
  }
  if (el["ed-export-close"]) {
    el["ed-export-close"].addEventListener("click", function () {
      el["ed-export-bar"].hidden = true;
    });
  }
  if (el["ed-download"]) el["ed-download"].addEventListener("click", doExport);
  if (el["ed-q"]) {
    el["ed-q"].addEventListener("input", function () {
      el["ed-qv"].textContent = el["ed-q"].value;
    });
  }
  if (el["ed-format"]) {
    el["ed-format"].addEventListener("change", function () {
      var png = el["ed-format"].value === "png";
      $("#ed-q-wrap").hidden = png;
    });
  }

  el["ed-adj-reset"].addEventListener("click", function () {
    ADJ_KEYS.forEach(function (k) { adj[k] = 0; });
    adj.invert = false; adj.sepia = 0;
    buildAdjustPanel();
    refreshPreview();
  });
  el["ed-adj-apply"].addEventListener("click", commitAdjust);

  el["ed-filters"].addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".chip");
    if (!b) return;
    var f = FILTERS.filter(function (x) { return x.id === b.dataset.filter; })[0];
    if (f) applyFilter(f);
  });
  (function buildFilterChips() {
    FILTERS.forEach(function (f) {
      var b = node("button", "chip", f.name);
      b.type = "button";
      b.dataset.filter = f.id;
      b.setAttribute("aria-pressed", "false");
      el["ed-filters"].appendChild(b);
    });
  })();

  el["ed-rotate-l"].addEventListener("click", function () { rotate90(true); });
  el["ed-rotate-r"].addEventListener("click", function () { rotate90(false); });
  el["ed-flip-h"].addEventListener("click", function () { flip(true); });
  el["ed-flip-v"].addEventListener("click", function () { flip(false); });

  function onCanvasSize() {
    if (!doc.canvas) return;
    var w = Number(el["ed-cw"].value), h = Number(el["ed-ch"].value);
    if (!w || !h) return;
    resizeCanvas(w, h);
  }
  ["ed-cw", "ed-ch"].forEach(function (id) {
    el[id].addEventListener("change", onCanvasSize);
  });

  /* ---------- 画布上的指针 / 滚轮 / 拖放 / 粘贴 ---------- */

  view.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  view.addEventListener("wheel", function (e) {
    if (!doc.canvas) return;
    e.preventDefault();
    var r = view.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  ["dragenter", "dragover"].forEach(function (t) {
    stage.addEventListener(t, function (e) { e.preventDefault(); stage.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (t) {
    stage.addEventListener(t, function () { stage.classList.remove("over"); });
  });
  stage.addEventListener("drop", function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  window.addEventListener("paste", function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (/^image\//.test(items[i].type)) {
        loadFile(items[i].getAsFile());
        e.preventDefault();
        return;
      }
    }
  });

  window.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redoIt(); else undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redoIt();
    } else if (e.key === "Escape" && crop) {
      crop = null;
      buildToolPanel();
      schedule();
    }
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { fitView(); schedule(); }, 120);
  });

  /* ---------- 启动 ---------- */
  buildAdjustPanel();
  setTool("move");
  syncChrome();
  render();

  /* 审计用的一线观察口。只读为主，让 Playwright 能问到像素而不用截图比对。 */
  window.__ed = {
    get tool() { return state.tool; },
    get w() { return doc.w; },
    get h() { return doc.h; },
    get zoom() { return vp.scale; },
    get histDepth() { return hist.length; },
    get redoDepth() { return redo.length; },
    get hasDoc() { return !!doc.canvas; },
    get crop() { return crop ? normCrop() : null; },
    pixel: function (x, y) {
      if (!doc.canvas) return null;
      return Array.prototype.slice.call(doc.ctx.getImageData(x, y, 1, 1).data);
    },
    /* 一次读回一片。逐点 evaluate 扫描一块区域要跑几百个来回，
       一次 getImageData 就够，也让「这片有没有墨迹」这类断言变得可行。 */
    region: function (x, y, w, h) {
      if (!doc.canvas) return null;
      var im = doc.ctx.getImageData(x, y, w, h);
      return { w: im.width, h: im.height, data: Array.prototype.slice.call(im.data) };
    },
    toScreen: toScreen,
    setTool: setTool,
    undo: undo,
    redo: redoIt,
    openFile: function (f) { loadFile(f); }
  };
})();
