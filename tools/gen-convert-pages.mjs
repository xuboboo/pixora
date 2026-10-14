/* ============================================================================
   Pixora — format-conversion landing page generator
   ----------------------------------------------------------------------------
   Writes /convert/<from>-to-<to>/index.html for every input format the browser
   can decode crossed with every format Pixora can actually encode, plus a hub
   at /convert/.

   Why generate instead of hand-write: the reverse-engineering pass over
   convertio.co showed its real moat is a long-tail matrix of per-format
   landing pages (116 of them), not its converter. The matrix is the SEO play;
   the pages themselves must stay honest — every pair listed here is one the
   engine genuinely performs in the browser.

   Each page embeds the real tool, preconfigured via <html data-convert-to>,
   so it is a working converter rather than a doorway page.
   ============================================================================ */

import fs from "node:fs";
import path from "node:path";

const ROOT = "E:\\ps\\pixora";
const SITE = "https://xuboboo.github.io/pixora";
const OUT = path.join(ROOT, "convert");

/* Site-root-absolute prefix, e.g. "/pixora/". Only 404.html needs it: GitHub
   Pages serves that file for any unmatched path while leaving the address bar
   on the *requested* URL, so a relative prefix there resolves against a
   directory that may not even exist. A <base> tag would fix the assets but
   silently repoint the `#main` skip link at the homepage, so an explicit
   absolute prefix is the safer of the two. */
const BASE = new URL(SITE + "/").pathname;

/* ---------------------------------------------------------------- metadata */

const F = {
  png:  { name: "PNG",  label: "PNG",  ext: ".png",  alpha: true,  lossy: false,
          role: "无损压缩，保留透明通道，截图与需要反复编辑的素材首选" },
  jpg:  { name: "JPG",  label: "JPG",  ext: ".jpg",  alpha: false, lossy: true,
          role: "有损压缩，体积最小、兼容性最广，照片类图片的通用选择" },
  webp: { name: "WEBP", label: "WEBP", ext: ".webp", alpha: true,  lossy: true,
          role: "同为有损，体积通常比 JPG 再小约 25%，同时支持透明通道" },
  gif:  { name: "GIF",  label: "GIF",  ext: ".gif",  alpha: true,  lossy: false,
          role: "最多 256 色的索引色格式，常用于动图与简单图形" },
  bmp:  { name: "BMP",  label: "BMP",  ext: ".bmp",  alpha: false, lossy: false,
          role: "无压缩位图，任何软件都能打开，代价是体积明显偏大" },
  avif: { name: "AVIF", label: "AVIF", ext: ".avif", alpha: true,  lossy: true,
          role: "新一代格式，同画质下体积最小，同时支持透明通道" },
  svg:  { name: "SVG",  label: "SVG",  ext: ".svg",  alpha: true,  lossy: false,
          role: "矢量图形格式，由路径与形状描述，缩放不损失清晰度" },
  ico:  { name: "ICO",  label: "ICO",  ext: ".ico",  alpha: true,  lossy: false,
          role: "Windows 图标格式，最长边限制 256px，支持透明" },
};

/* Inputs = everything a browser can decode. Outputs = everything Pixora can
   genuinely encode on the client (AVIF is omitted: almost no browser ships an
   AVIF encoder, so a dedicated landing page would promise what we cannot do). */
const INPUTS  = ["png", "jpg", "webp", "gif", "bmp", "avif", "svg", "ico"];
const OUTPUTS = ["png", "jpg", "webp", "bmp", "ico"];

/* How many (input, output) pairs actually exist: every input crossed with every
   output, minus the ones where the two are the same format. Derived from the
   lists rather than written as a number, because a hand-computed version was
   wrong here once (8 × 4 = 32 instead of 5 × 7 = 35) and shipped a headline
   that contradicted the 35 links directly beneath it. */
const PAIR_COUNT = OUTPUTS.reduce((n, to) => n + INPUTS.filter((f) => f !== to).length, 0);

/* Which canvas encoder produces each output. */
const ENCODER = {
  png:  "由浏览器 Canvas 原生编码",
  jpg:  "由浏览器 Canvas 原生编码",
  webp: "由浏览器 Canvas 原生编码",
  bmp:  "由 Pixora 页面内手写编码器生成（24-bit BGR）",
  ico:  "由 Pixora 页面内手写编码器生成（PNG-in-ICO）",
};

/* Slug-facing names vs. the ids the engine actually uses. The FORMATS registry
   keys JPG as "jpeg" (its MIME family), so data-convert-to must say "jpeg" or
   the preconfigured format is silently dropped. */
const ENGINE_ID = { png: "png", jpg: "jpeg", webp: "webp", bmp: "bmp", ico: "ico" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------- per-pair narrative */

function qualityLine(from, to) {
  const s = F[from], t = F[to];
  if (!t.lossy && !s.lossy) return "两个格式都是无损的，这次转换全程不引入压缩损失，像素数据保持原样。";
  if (!t.lossy && s.lossy) return `从有损的 ${s.label} 转到无损的 ${t.label} 不会恢复已经丢失的细节，但也不会再损失一次。代价是体积通常会变大。`;
  if (t.lossy && !s.lossy) return `从无损的 ${s.label} 转到有损的 ${t.label} 会引入压缩损失，可以用页面上的质量滑块控制取舍 —— 拉到 100% 时肉眼几乎无法分辨。`;
  return `两个格式都是有损的，转换会再压缩一次。建议把质量滑块调到 90% 以上，避免多次压缩叠加导致画质明显下降。`;
}

function alphaLine(from, to) {
  const s = F[from], t = F[to];
  if (!s.alpha) return `${s.label} 本身不携带透明通道，因此不涉及透明区域的处理。`;
  if (t.alpha) return `${s.label} 的透明通道会原样保留到 ${t.label} 里。`;
  return `${t.label} 不支持透明。转换时 ${s.label} 的透明区域会被填充为你指定的底色（默认白色），页面上的「背景填充色」可以改。`;
}

function specialNotes(from, to) {
  const out = [];
  if (from === "svg") out.push("SVG 是矢量图，转成位图时按图形自身声明的尺寸栅格化。需要指定输出像素尺寸的话，去完整工具箱切到「调整尺寸」。");
  if (from === "gif") out.push("GIF 常常是动图。Pixora 取第一帧进行转换，因此动态效果不会被保留 —— 这一点在转换前就应当明确。");
  if (from === "ico") out.push("ICO 里可能打包了多个尺寸。Pixora 读取其中分辨率最高的一帧作为源图。");
  if (to === "ico") out.push("ICO 的最长边被限制为 256px。超出时 Pixora 会按比例缩到 256px，这是格式本身的规定，不是缩放设置。");
  if (to === "bmp") out.push("BMP 不做压缩，体积通常是原图的几十倍。结果卡片会用 ↑ 标记提示膨胀幅度，确认后再下载。");
  if (to === "jpg") out.push("JPG 不支持透明通道，也不适合线条锐利的截图 —— 它会对边缘做有损压缩，产生轻微噪点。");
  if (to === "webp") out.push("WEBP 需要 Chrome 32+ / Firefox 96+ / Safari 16+ 才能编码。更老的浏览器上这个选项不会出现，因为页面会先做一次能力探测。");
  if (from === "avif") out.push("AVIF 的解码需要 Chrome 85+ / Firefox 93+ / Safari 16.4+。更老的浏览器无法读取源文件。");
  if (from === "jpg" && to === "png") out.push("把照片从 JPG 转成 PNG 是常见做法，但要清楚它只解决「需要无损容器」的问题，不会让照片变清晰。");
  if (from === "png" && to === "jpg") out.push("这是最高频的一对转换：PNG 截图往往体积很大，转成 JPG 后通常能小一个数量级，代价是失去透明与部分边缘细节。");
  return out;
}

function faqFor(from, to) {
  const s = F[from], t = F[to];
  const items = [
    {
      q: `${s.label} 转 ${t.label} 需要把图片上传到服务器吗？`,
      a: `不需要。Pixora 的解码、缩放与编码全部在你的浏览器里通过 Canvas 完成，文件不会经过任何服务器，也不存在「上传后多久删除」的问题 —— 因为根本没有上传这一步。`,
    },
    {
      q: `${s.label} 转 ${t.label} 会损失画质吗？`,
      a: qualityLine(from, to),
    },
    {
      q: `透明背景在 ${s.label} 转 ${t.label} 时会怎么处理？`,
      a: alphaLine(from, to),
    },
    {
      q: `可以一次把多张 ${s.label} 批量转成 ${t.label} 吗？`,
      a: `可以。一次拖入多张图片即可按同一套设置处理，每张单独输出结果与下载链接；结果超过两张时还能一键打包成 ZIP 下载。改完设置想重来，点「用当前设置重转」即可，不必重新拖入。`,
    },
    {
      q: `${s.label} 转 ${t.label} 在手机上能做吗？`,
      a: `可以。Pixora 的界面适配了 320px 到 2560px 的全部常见屏幕，手机上同样支持拖放、选择文件与批量处理，触摸目标按无障碍标准放大到了 44px 以上。`,
    },
  ];
  return items;
}

/* --------------------------------------------------------------- HTML parts */

/* Parameterised by the page's root prefix. It used to be a constant hard-coded
   to "../../", which was correct for /convert/<slug>/ but wrong for the hub at
   /convert/ — there the favicon, apple-touch-icon and web manifest all pointed
   one level above the site root and 404'd. Nothing caught it because the link
   audit only walked <a href>, never <link href>. */
const headIcons = (p) => `
<link rel="icon" href="${p}assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${p}assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${p}assets/img/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="${p}site.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Pixora">
<meta name="application-name" content="Pixora">`;

const THEME_BOOT = `<script>
(function () {
  var d = document.documentElement;
  d.classList.add("js");
  try {
    var t = localStorage.getItem("pixora-theme");
    if (t !== "dark" && t !== "light") {
      t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    }
    d.setAttribute("data-theme", t);
  } catch (e) {}
})();
</script>`;

/* ------------------------------------------------------------ shared header
   The header nav lives in one place because it is duplicated across index.html
   and all 36 generated pages. Reverse-engineering iloveimg and convertio showed
   both keep the whole format matrix one interaction away from the header
   (iloveimg: direct tool links plus a categorised "more tools" panel;
   convertio: a "转换" dropdown of format families). Pixora had a flat anchor
   list with no route to the landing pages at all — which is exactly why they
   were undiscoverable. <details> keeps the panel native, keyboard-operable and
   visible to crawlers. */
/* Where a page sits relative to the site root. Two prefixes are needed, because
   a page's distance from the root and its distance from /convert/ are not the
   same thing: the hub lives in /convert/ yet links to its siblings by bare slug.
   Collapsing both into a single "depth" number is exactly what produced a page
   of dead links on the hub (nav emitted `convert/png-to-jpg/`, which resolved to
   /convert/convert/png-to-jpg/). */
const LOC = {
  root: { up: "", conv: "convert/" },              // /index.html
  hub:  { up: "../", conv: "./" },                 // /convert/index.html
  slug: { up: "../../", conv: "../../convert/" },  // /convert/<slug>/index.html
  abs:  { up: BASE, conv: BASE + "convert/" },     // /404.html — served at any path
};

function nav(loc, current) {
  const { up: p, conv: c } = LOC[loc];
  const cols = OUTPUTS.map((to) => {
    const items = INPUTS.filter((f) => f !== to)
      .map((f) => {
        const slug = `${f}-to-${to}`;
        const cur = slug === current ? ' aria-current="page"' : "";
        return indent(`<li><a href="${c}${slug}/"${cur}>${F[f].label} 转 ${F[to].label}</a></li>`, 4);
      })
      .join("\n");
    return `<div class="nav-col">
  <span class="nav-col-title">转 ${F[to].label}</span>
  <ul>
${items}
  </ul>
</div>`;
  }).join("\n");

  return `<nav class="nav" id="nav" aria-label="主导航">
  <a href="${p}#tool">在线工具</a>
  <details class="nav-drop" data-href="${c}">
    <summary>
      <span>格式转换</span>
      <svg class="nav-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </summary>
    <div class="nav-panel">
      <div class="nav-panel-head">
        <strong>按目标格式转换</strong>
        <a href="${c}">全部 35 种组合 →</a>
      </div>
      <div class="nav-panel-cols">
${indent(cols, 8)}
      </div>
    </div>
  </details>
  <a href="${p}#formats">支持的格式</a>
  <a href="${p}#how">工作流</a>
  <a href="${p}#compare">对比</a>
  <a href="${p}#faq">常见问题</a>
</nav>`;
}

/* The homepage format index. Same reasoning as nav(): index.html carries a
   hand-written section head, but the 35 links themselves must be generated or
   they will drift from the pages that actually exist. */
function formatIndex(prefix = "convert/") {
  return `<div class="fmt-index">
${OUTPUTS.map((to) => {
  const items = INPUTS.filter((f) => f !== to)
    .map((f) => indent(`<li><a href="${prefix}${f}-to-${to}/">${F[f].label} 转 ${F[to].label}</a></li>`, 6))
    .join("\n");
  return `  <div class="fmt-index-col">
    <h3>转 ${F[to].label}<span>${INPUTS.length - 1} 种</span></h3>
    <ul>
${items}
    </ul>
  </div>`;
}).join("\n")}
</div>`;
}

/* Indent a multi-line HTML fragment as a block. Template-literal interpolation
   only indents the first line, so every nested fragment has to be re-indented
   explicitly or the output drifts a level deeper per nesting step. */
function indent(html, n) {
  const pad = " ".repeat(n);
  return String(html)
    .split("\n")
    .map((l) => (l.trim() ? pad + l : l))
    .join("\n");
}

function header(loc, current) {
  const p = LOC[loc].up;
  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${p}" aria-label="Pixora 首页">
      <img src="${p}assets/img/logo.svg" width="32" height="32" alt="Pixora logo" fetchpriority="high">
      <span>Pixora</span>
    </a>

${indent(nav(loc, current), 4)}

    <div class="header-actions">
      <button class="icon-btn" data-theme-toggle type="button" aria-label="切换主题" aria-pressed="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <a class="btn btn-ghost btn-sm" href="https://github.com/xuboboo/pixora" target="_blank" rel="noopener" aria-label="GitHub 仓库">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.74 1.27 3.4.97.11-.76.41-1.28.74-1.57-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>
        <span>GitHub</span>
      </a>
      <button class="icon-btn nav-toggle" type="button" aria-label="打开菜单" aria-expanded="false" aria-controls="nav">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>
  </div>
</header>`;
}

const TOOL = (from, to, loc) => `      <div class="tool reveal">
        <div class="tool-head">
          <span class="dot" aria-hidden="true"></span>
          <strong>Pixora ${F[from].label} 转 ${F[to].label}</strong>
          <span class="tag">本地运行</span>
        </div>

        <div class="drop" id="drop" role="button" tabindex="0" aria-label="拖入或点击选择图片">
          <div class="big" aria-hidden="true">🖼️</div>
          <h3>把 ${F[from].label} 图片拖到这里</h3>
          <small>也可以点击选择文件，或直接按 Ctrl + V 粘贴截图 · 输出格式已预设为 ${F[to].label} · 图片尺寸保持原样 · 可多张批量</small>
          <input type="file" id="file" accept="image/*" multiple hidden>
        </div>

        <div class="tool-controls">
          <div class="field" data-resize-only>
            <label for="w">目标宽度 (px)</label>
            <input type="number" id="w" min="1" step="1" value="400" inputmode="numeric">
          </div>

          <div class="field" data-resize-only>
            <label for="h">目标高度 (px)</label>
            <input type="number" id="h" min="1" step="1" placeholder="自动">
          </div>

          <div class="field" data-resize-only>
            <label for="mode">缩放方式</label>
            <select id="mode">
              <option value="contain" selected>等比适应</option>
              <option value="stretch">拉伸填满</option>
              <option value="cover">等比填充</option>
            </select>
            <p class="field-hint" id="modehint">等比缩放 · 多余部分留白 · 永不变形</p>
          </div>

          <div class="field">
            <label for="format">输出格式</label>
            <select id="format">
              <option value="png"${to === "png" ? " selected" : ""}>PNG</option>
              <option value="jpeg"${to === "jpg" ? " selected" : ""}>JPG</option>
              <option value="webp"${to === "webp" ? " selected" : ""}>WEBP</option>
            </select>
            <p class="field-hint" id="fmthint"></p>
          </div>
        </div>

        <!-- 这个页面只做格式转换，尺寸控件整块不出现（由 [data-tool-mode="convert"]
             上的 CSS 隐藏，而不是从 DOM 里删掉 —— syncUI 依赖这些元素存在）。 -->
        <p class="tool-note" data-convert-note>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="10"/></svg>
          <span>这个页面只换格式，<b>图片尺寸保持原样</b>，不会被缩小。需要同时调整宽高？<a href="${LOC[loc].up}#tool">用完整工具箱</a>。</span>
        </p>

        <div class="field tool-row" id="qwrap" hidden>
          <label for="q">质量 <span id="qv">92</span>%</label>
          <input type="range" id="q" min="50" max="100" value="92">
        </div>

        <div class="field tool-row" id="bgrow" hidden>
          <label for="bgcolor">背景填充色 · 目标格式不支持透明，透明区域将填为此色</label>
          <div class="bg-picker">
            <input type="color" id="bgcolor" value="#ffffff" aria-describedby="bgval">
            <output id="bgval">#FFFFFF</output>
          </div>
        </div>

        <!-- 量化只在 PNG 输出时出现，这不是懒，是诚实：BMP 无压缩，收敛颜色只会降画质、
             不会缩体积；JPG/WEBP/AVIF 本身有损，先量化再编码是双重劣化。 -->
        <div class="field tool-row" id="palwrap" hidden>
          <label for="palcolors">调色板量化 · 把颜色收敛到指定数量再编码</label>
          <select id="palcolors">
            <option value="0" selected>关闭（保留全部颜色）</option>
            <option value="256">256 色</option>
            <option value="128">128 色</option>
            <option value="64">64 色</option>
            <option value="32">32 色</option>
            <option value="16">16 色</option>
            <option value="8">8 色</option>
            <option value="4">4 色</option>
            <option value="2">2 色</option>
          </select>
          <p class="field-hint">median cut 调色板 · 输出索引色 PNG，位深按色数自适应 · 透明与颜色一同量化 · 只作用于 PNG · 结果反而更大时自动放弃</p>
        </div>

        <div class="tool-options">
          <div class="field" data-resize-only>
            <label id="wpresets-label">常用宽度</label>
            <div class="presets" id="wpresets" role="group" aria-labelledby="wpresets-label">
              <button class="chip on" type="button" data-w="400" aria-pressed="true">400</button>
              <button class="chip" type="button" data-w="600" aria-pressed="false">600</button>
              <button class="chip" type="button" data-w="800" aria-pressed="false">800</button>
              <button class="chip" type="button" data-w="1200" aria-pressed="false">1200</button>
              <button class="chip" type="button" data-w="1920" aria-pressed="false">1920</button>
            </div>
          </div>
          <div class="field" data-resize-only>
            <label id="spresets-label">按原图比例</label>
            <div class="presets" id="spresets" role="group" aria-labelledby="spresets-label">
              <button class="chip" type="button" data-scale="0.25" aria-pressed="false">25%</button>
              <button class="chip" type="button" data-scale="0.5" aria-pressed="false">50%</button>
              <button class="chip" type="button" data-scale="0.75" aria-pressed="false">75%</button>
              <button class="chip" type="button" data-scale="1" aria-pressed="false">100%</button>
            </div>
          </div>
          <div class="field" data-resize-only>
            <label id="switches-label">缩放选项</label>
            <div class="switch-stack" role="group" aria-labelledby="switches-label">
              <label class="switch-row">
                <span class="switch"><input type="checkbox" id="lock" checked><span class="track"></span></span>
                锁定宽高比
              </label>
              <label class="switch-row">
                <span class="switch"><input type="checkbox" id="noup"><span class="track"></span></span>
                不放大
              </label>
            </div>
          </div>
          <div class="field">
            <label id="misc-label">其他</label>
            <div class="switch-stack" role="group" aria-labelledby="misc-label">
              <label class="switch-row">
                <span class="switch"><input type="checkbox" id="auto"><span class="track"></span></span>
                拖入即自动下载
              </label>
              <label class="switch-row">
                <span class="switch"><input type="checkbox" id="cmp"><span class="track"></span></span>
                对比各格式体积
              </label>
            </div>
          </div>
        </div>

        <div class="tool-bar">
          <div class="status" id="status" role="status" aria-live="polite">已就绪 · 拖入图片即可</div>
          <div class="tool-bar-actions">
            <button class="btn btn-ghost btn-sm" id="again" type="button" hidden>用当前设置重转</button>
            <button class="btn btn-ghost btn-sm" id="zip" type="button" hidden>打包下载 ZIP</button>
            <button class="btn btn-ghost btn-sm" id="clear" type="button">清空结果</button>
          </div>
        </div>

        <p class="tool-stat" id="stat" hidden></p>

        <div class="results" id="results"></div>
      </div>`;

function footer(loc) {
  const p = LOC[loc].up;
  return `<footer class="site-footer" aria-labelledby="footer-title">
  <div class="container">
    <h2 id="footer-title" class="visually-hidden">页脚导航</h2>
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="brand" href="${p}" aria-label="Pixora 首页">
          <img src="${p}assets/img/logo.svg" width="32" height="32" alt="Pixora logo" loading="lazy">
          <span>Pixora</span>
        </a>
        <p style="margin-top:12px">浏览器里的免费图片工具：格式转换、缩放、AI 放大与在线修图。PNG / JPG / WEBP / AVIF / BMP / ICO 互转，批量打包下载，图片全程本地处理、绝不上传。</p>
        <div class="footer-social">
          <a class="icon-btn" href="https://github.com/xuboboo/pixora" target="_blank" rel="noopener" aria-label="GitHub 仓库">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.74 1.27 3.4.97.11-.76.41-1.28.74-1.57-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>
          </a>
          <a class="icon-btn" href="https://github.com/xuboboo/pixora/issues" target="_blank" rel="noopener" aria-label="反馈问题">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </a>
        </div>
      </div>

      <nav class="footer-col" aria-label="产品">
        <h4>产品</h4>
        <ul>
          <li><a href="${p}#tool">图片工具箱</a></li>
          <li><a href="${p}editor/">在线修图</a></li>
          <li><a href="${p}#features">功能特性</a></li>
          <li><a href="${p}#formats">支持的格式</a></li>
          <li><a href="${p}convert/">全部格式转换</a></li>
          <li><a href="${p}#compare">方案对比</a></li>
          <li><a href="${p}#faq">常见问题</a></li>
        </ul>
      </nav>

      <nav class="footer-col" aria-label="资源">
        <h4>资源</h4>
        <ul>
          <li><a href="https://github.com/xuboboo/pixora" target="_blank" rel="noopener">GitHub 仓库</a></li>
          <li><a href="https://github.com/xuboboo/pixora/blob/main/README.md" target="_blank" rel="noopener">项目文档</a></li>
          <li><a href="${p}changelog.html">更新日志</a></li>
          <li><a href="${p}feed.xml" type="application/rss+xml">RSS 订阅</a></li>
          <li><a href="${p}llms.txt">llms.txt</a></li>
        </ul>
      </nav>

      <nav class="footer-col" aria-label="关于">
        <h4>关于</h4>
        <ul>
          <li><a href="${p}license.html">MIT 许可证</a></li>
          <li><a href="${p}contributing.html">贡献指南</a></li>
          <li><a href="${p}code-of-conduct.html">行为准则</a></li>
          <li><a href="${p}security.html">安全政策</a></li>
          <li><a href="https://github.com/xuboboo/pixora/issues" target="_blank" rel="noopener">问题反馈</a></li>
          <li><a href="${p}humans.txt">humans.txt</a></li>
        </ul>
      </nav>
    </div>

    <div class="footer-bottom">
      <span>© <span data-year>2026</span> Pixora · 基于 MIT 许可证开源</span>
      <nav aria-label="法律与元信息">
        <a href="${p}sitemap.xml">站点地图</a>
        <a href="${p}robots.txt">robots.txt</a>
        <a href="${p}.well-known/security.txt">security.txt</a>
        <a href="https://github.com/xuboboo/pixora" target="_blank" rel="noopener">源码</a>
      </nav>
    </div>
  </div>
</footer>`;
}

/* ------------------------------------------------------------ pair page */

function page(from, to) {
  const s = F[from], t = F[to];
  const slug = `${from}-to-${to}`;
  const url = `${SITE}/convert/${slug}/`;
  const title = `${s.label} 转 ${t.label} — 免费在线转换，无需上传图片 | Pixora`;
  const description = `免费把 ${s.label} 转成 ${t.label}：拖入图片即可完成，支持按宽度等比缩放与批量处理，全部在浏览器本地完成，图片不上传服务器、无需注册、无使用限制。`;
  const keywords = `${s.label}转${t.label},${s.label} 转 ${t.label},${s.label}${t.label}转换,在线${s.label}转${t.label},免费${s.label}转${t.label},图片格式转换,批量格式转换,不上传图片`;

  const faq = faqFor(from, to);
  const notes = specialNotes(from, to);

  /* Internal linking: siblings by source and by target keep every page within
     a couple of hops of the rest of the matrix. */
  const relOut = OUTPUTS.filter((x) => x !== from && x !== to).slice(0, 4);
  const relIn = INPUTS.filter((x) => x !== to && x !== from).slice(0, 4);
  const related = [
    ...relOut.map((x) => ({ href: `../${from}-to-${x}/`, label: `${s.label} 转 ${F[x].label}`, sub: `同为 ${s.label} 输入，换成 ${F[x].label} 输出` })),
    ...relIn.map((x) => ({ href: `../${x}-to-${to}/`, label: `${F[x].label} 转 ${t.label}`, sub: `同为 ${t.label} 输出，从 ${F[x].label} 输入` })),
  ];

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: `${s.label} 转 ${t.label}`,
        description,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#software` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        inLanguage: "zh-CN",
        primaryImageOfPage: { "@id": `${SITE}/#ogimage` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pixora", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "格式转换", item: `${SITE}/convert/` },
          { "@type": "ListItem", position: 3, name: `${s.label} 转 ${t.label}`, item: url },
        ],
      },
      {
        "@type": "HowTo",
        "@id": `${url}#howto`,
        name: `如何把 ${s.label} 转成 ${t.label}`,
        description: `在浏览器里把 ${s.label} 图片转换成 ${t.label}，图片不上传服务器。`,
        totalTime: "PT1M",
        tool: [{ "@type": "HowToTool", name: "Pixora 在线图片工具箱" }],
        step: [
          { "@type": "HowToStep", position: 1, name: `拖入 ${s.label} 图片`, text: `把 ${s.label} 图片拖入投放区，或点击选择文件、按 Ctrl + V 粘贴截图，支持一次多张。`, url: `${url}#tool` },
          { "@type": "HowToStep", position: 2, name: `确认输出为 ${t.label}`, text: `输出格式已预设为 ${t.label}，无需再选。图片尺寸保持原样，本页不做缩放。`, url: `${url}#tool` },
          { "@type": "HowToStep", position: 3, name: "下载或打包", text: "结果卡片会显示转换后的格式、尺寸与体积变化，可逐张下载，也可一键打包成 ZIP。", url: `${url}#tool` },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light" data-tool-mode="convert" data-resize="off" data-convert-from="${from}" data-convert-to="${ENGINE_ID[to]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(keywords)}">
<meta name="author" content="Pixora contributors">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="googlebot" content="index, follow, max-image-preview:large">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#080c16" media="(prefers-color-scheme: dark)">
<meta name="format-detection" content="telephone=no">
<meta name="generator" content="Handcrafted HTML, CSS and JavaScript — no build step">

<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="zh-CN" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
${headIcons(LOC.slug.up)}

<meta property="og:type" content="website">
<meta property="og:site_name" content="Pixora">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${esc(`${s.label} 转 ${t.label} — 免费在线转换，无需上传`)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/img/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`Pixora ${s.label} 转 ${t.label} 在线转换工具`)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(`${s.label} 转 ${t.label} — 免费在线转换，无需上传`)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/assets/img/og.png">
<meta name="twitter:image:alt" content="${esc(`Pixora ${s.label} 转 ${t.label} 在线转换工具`)}">

${THEME_BOOT}

<link rel="preload" href="${LOC.slug.up}assets/img/logo.svg" as="image" type="image/svg+xml">
<link rel="stylesheet" href="${LOC.slug.up}assets/css/style.css">

<script type="speculationrules">
{
  "prerender": [{ "where": { "href_matches": "/*" }, "eagerness": "moderate" }],
  "prefetch": [{ "where": { "href_matches": "/*" }, "eagerness": "conservative" }]
}
</script>

<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>

${header("slug", slug)}

<main id="main">

  <section class="section" id="tool" aria-labelledby="page-title">
    <div class="container">
      <nav class="breadcrumb" aria-label="面包屑导航">
        <a href="../../">Pixora</a>
        <span aria-hidden="true">/</span>
        <a href="../">格式转换</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">${s.label} 转 ${t.label}</span>
      </nav>

      <div class="section-head">
        <span class="eyebrow">免费 · 无需上传</span>
        <h1 id="page-title">${s.label} 转 ${t.label}</h1>
        <p>把 ${s.label} 图片拖进来，直接得到 ${t.label}。可按宽度等比缩放、可批量、可打包下载 —— 全部在浏览器里完成，<strong>图片不会上传到任何服务器</strong>，也不需要注册。</p>
      </div>

${TOOL(from, to, "slug")}
    </div>
  </section>

  <section class="section section--soft" id="about-pair" aria-labelledby="pair-title">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">转换说明</span>
        <h2 id="pair-title">${s.label} 与 ${t.label} 之间发生了什么</h2>
      </div>

      <div class="grid grid-3">
        <article class="card reveal">
          <div class="fmt-head"><span class="fmt-tag">${s.label}</span><span class="fmt-badge">源格式</span></div>
          <p>${esc(s.role)}。</p>
          <ul class="fmt-meta">
            <li>扩展名：${s.ext}</li>
            <li>透明通道：${s.alpha ? "支持" : "不支持"}</li>
            <li>压缩方式：${s.lossy ? "有损" : "无损"}</li>
          </ul>
        </article>

        <article class="card reveal">
          <div class="fmt-head"><span class="fmt-tag">${t.label}</span><span class="fmt-badge">目标格式</span></div>
          <p>${esc(t.role)}。</p>
          <ul class="fmt-meta">
            <li>扩展名：${t.ext}</li>
            <li>透明通道：${t.alpha ? "支持" : "不支持"}</li>
            <li>压缩方式：${t.lossy ? "有损" : "无损"}</li>
          </ul>
        </article>

        <article class="card reveal">
          <div class="fmt-head"><span class="fmt-tag">画质</span><span class="fmt-badge">${t.lossy ? "有损" : "无损"}</span></div>
          <p>${esc(qualityLine(from, to))}</p>
          <ul class="fmt-meta">
            <li>编码方式：${esc(ENCODER[to])}</li>
            <li>透明处理：${s.alpha ? (t.alpha ? "原样保留" : "填充底色") : "不涉及"}</li>
          </ul>
        </article>
      </div>

      ${notes.length ? `<div class="fmt-notes reveal">
        <div>
          <h3>转换前值得知道的几件事</h3>
          <ul class="fmt-meta">
            ${notes.map((n) => `<li>${esc(n)}</li>`).join("\n            ")}
          </ul>
        </div>
      </div>` : ""}
    </div>
  </section>

  <section class="section" id="pair-faq" aria-labelledby="pair-faq-title">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">常见问题</span>
        <h2 id="pair-faq-title">关于 ${s.label} 转 ${t.label}</h2>
      </div>

      <div class="faq">
        ${faq.map((f, i) => `<details${i === 0 ? " open" : ""}>
          <summary>${esc(f.q)}</summary>
          <div class="answer"><p>${esc(f.a)}</p></div>
        </details>`).join("\n        ")}
      </div>
    </div>
  </section>

  <section class="section section--soft" aria-labelledby="related-title">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">相关转换</span>
        <h2 id="related-title">你可能还要转这些</h2>
      </div>

      <div class="grid grid-3">
        ${related.map((r) => `<a class="card reveal" href="${r.href}">
          <div class="fmt-head"><span class="fmt-tag">${esc(r.label)}</span></div>
          <p>${esc(r.sub)}。</p>
        </a>`).join("\n        ")}
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="cta-title">
    <div class="container">
      <div class="cta-band reveal">
        <h2 id="cta-title">回到完整工具箱</h2>
        <p>Pixora 支持 PNG / JPG / WEBP / BMP / ICO 输出，可按宽度等比缩放、批量打包下载，图片始终只属于你。</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:8px">
          <a class="btn btn-primary" href="../../#tool">打开完整工具</a>
          <a class="btn btn-ghost" href="../">查看全部格式转换</a>
        </div>
      </div>
    </div>
  </section>

</main>

${footer("slug")}

<script src="${LOC.slug.up}assets/js/pixora-lib.js" defer></script>
<script src="${LOC.slug.up}assets/js/main.js" defer></script>
</body>
</html>
`;
}

/* -------------------------------------------------------------- hub page */

function hub() {
  const url = `${SITE}/convert/`;
  const title = "全部图片格式转换 — PNG / JPG / WEBP / BMP / ICO 互转 | Pixora";
  const description = "Pixora 支持的全部图片格式转换组合一览：PNG、JPG、WEBP、GIF、BMP、AVIF、SVG、ICO 输入，输出 PNG、JPG、WEBP、BMP、ICO。全部在浏览器本地完成，图片不上传。";

  const groups = INPUTS.map((from) => {
    const targets = OUTPUTS.filter((x) => x !== from);
    return `<div class="card reveal">
      <div class="fmt-head"><span class="fmt-tag">${F[from].label}</span><span class="fmt-badge">源格式</span></div>
      <p>${esc(F[from].role)}。</p>
      <ul class="fmt-meta">
        ${targets.map((x) => `<li><a href="${from}-to-${x}/">${F[from].label} 转 ${F[x].label}</a></li>`).join("\n        ")}
      </ul>
    </div>`;
  }).join("\n      ");

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: "全部图片格式转换",
        description,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#software` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        inLanguage: "zh-CN",
        hasPart: INPUTS.flatMap((from) =>
          OUTPUTS.filter((x) => x !== from).map((to) => ({
            "@type": "WebPage",
            name: `${F[from].label} 转 ${F[to].label}`,
            url: `${SITE}/convert/${from}-to-${to}/`,
          }))
        ),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pixora", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "格式转换", item: url },
        ],
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="图片格式转换,PNG转JPG,JPG转PNG,WEBP转换,BMP转换,ICO生成,SVG转PNG,GIF转PNG,AVIF转换,在线图片转换,批量图片转换,免费图片转换">
<meta name="author" content="Pixora contributors">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="googlebot" content="index, follow, max-image-preview:large">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#080c16" media="(prefers-color-scheme: dark)">
<meta name="format-detection" content="telephone=no">
<meta name="generator" content="Handcrafted HTML, CSS and JavaScript — no build step">

<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="zh-CN" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
${headIcons(LOC.hub.up)}

<meta property="og:type" content="website">
<meta property="og:site_name" content="Pixora">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/img/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Pixora 支持的图片格式转换组合">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/assets/img/og.png">
<meta name="twitter:image:alt" content="Pixora 支持的图片格式转换组合">

${THEME_BOOT}

<link rel="preload" href="${LOC.hub.up}assets/img/logo.svg" as="image" type="image/svg+xml">
<link rel="stylesheet" href="${LOC.hub.up}assets/css/style.css">

<script type="speculationrules">
{
  "prerender": [{ "where": { "href_matches": "/*" }, "eagerness": "moderate" }],
  "prefetch": [{ "where": { "href_matches": "/*" }, "eagerness": "conservative" }]
}
</script>

<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>

${header("hub", null)}

<main id="main">

  <section class="section" aria-labelledby="page-title">
    <div class="container">
      <nav class="breadcrumb" aria-label="面包屑导航">
        <a href="../">Pixora</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">格式转换</span>
      </nav>

      <div class="section-head">
        <span class="eyebrow">全部组合</span>
        <h1 id="page-title">全部图片格式转换</h1>
        <p>下面是 Pixora 真正能做的全部转换组合 —— 每一条都对应一个可直接使用的页面，不是用来凑数的空链接。全部在浏览器里完成，图片不上传。</p>
      </div>

      <div class="grid grid-3">
      ${groups}
      </div>

      <div class="fmt-notes reveal">
        <div>
          <h3>输入格式为什么是这些</h3>
          <p>输入侧覆盖浏览器能解码的全部常见格式：PNG、JPG、WEBP、GIF、BMP、AVIF、SVG、ICO。凡是浏览器打不开的格式，Pixora 也打不开 —— 这一点不会靠服务器绕过去。</p>
        </div>
        <div>
          <h3>输出格式为什么只有五种</h3>
          <p>输出侧只保留浏览器能真正编码的格式：PNG、JPG、WEBP 由 Canvas 原生编码，BMP 与 ICO 由页面内手写编码器生成。AVIF 编码在主流浏览器上尚不可用，因此只在探测通过时才会出现在工具里。</p>
        </div>
        <div>
          <h3>为什么没有 HEIC / RAW / PSD</h3>
          <p>这些格式都需要服务端解码器。把它们交给我们，就意味着必须先把图片上传到别人的服务器 —— 这与 Pixora「零上传」的前提相冲突，所以宁可明确不支持。</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--soft" aria-labelledby="cta-title">
    <div class="container">
      <div class="cta-band reveal">
        <h2 id="cta-title">直接打开完整工具箱</h2>
        <p>不想先挑格式？把图片拖进工具箱，输出格式在页面里随时可换。</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:8px">
          <a class="btn btn-primary" href="../#tool">打开完整工具</a>
          <a class="btn btn-ghost" href="https://github.com/xuboboo/pixora" target="_blank" rel="noopener">给个 Star</a>
        </div>
      </div>
    </div>
  </section>

</main>

${footer("hub")}

<script src="${LOC.hub.up}assets/js/pixora-lib.js" defer></script>
<script src="${LOC.hub.up}assets/js/main.js" defer></script>
</body>
</html>
`;
}

/* --------------------------------------------------------------- 404 page
   GitHub Pages serves this file for every unmatched path, so it is the last
   thing a lost visitor sees. The whole point of the v1.2.0 work was that
   people could not find the conversion they wanted, so a dead end here would
   undo it: the page therefore carries the same 35-link format index as the
   homepage, plus the eight pairs people actually look for.

   Paths are site-root-absolute (LOC.abs) rather than relative, because the
   address bar keeps the *requested* URL — a relative `assets/…` would resolve
   against a directory that may not exist. It is noindex,follow: the page
   itself must never rank, but its links should still be crawled. */
function notFound() {
  const url = `${SITE}/404.html`;
  const title = "页面不存在（404）— Pixora 在线图片工具箱";
  const description =
    "这个地址在 Pixora 上不存在。下面是全部 35 种图片格式转换组合的入口，以及最常用的几个转换，找到你要的那一个即可。";

  const popular = [
    ["png", "jpg"], ["jpg", "png"], ["png", "webp"], ["webp", "png"],
    ["png", "ico"], ["jpg", "webp"], ["svg", "png"], ["gif", "png"],
  ];

  const popularHtml = popular
    .map(([f, t]) => `        <li><a href="${BASE}convert/${f}-to-${t}/">${F[f].label} 转 ${F[t].label}</a></li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Pixora contributors">
<meta name="robots" content="noindex, follow">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#080c16" media="(prefers-color-scheme: dark)">
<meta name="format-detection" content="telephone=no">
<meta name="generator" content="Handcrafted HTML, CSS and JavaScript — no build step">
${headIcons(BASE)}

<meta property="og:type" content="website">
<meta property="og:site_name" content="Pixora">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/img/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/assets/img/og.png">

${THEME_BOOT}

<link rel="stylesheet" href="${BASE}assets/css/style.css">

<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "页面不存在",
    description,
    isPartOf: { "@id": `${SITE}/#website` },
    inLanguage: "zh-CN",
  },
  null,
  2
)}
</script>
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>

${header("abs", null)}

<main id="main">

  <section class="section" aria-labelledby="page-title">
    <div class="container">
      <div class="nf-hero">
        <p class="nf-code" aria-hidden="true">404</p>
        <div class="section-head">
          <span class="eyebrow">地址不存在</span>
          <h1 id="page-title">这个页面不存在</h1>
          <p>你要找的地址在 Pixora 上找不到 —— 可能是链接过期，也可能是拼写有出入。<b id="nf-path" class="nf-path" hidden></b></p>
        </div>
        <div class="nf-actions">
          <a class="btn btn-primary" href="${BASE}#tool">打开图片工具箱</a>
          <a class="btn btn-ghost" href="${BASE}">回到首页</a>
          <a class="btn btn-ghost" href="${BASE}convert/">全部格式转换</a>
        </div>
      </div>

      <div class="nf-block reveal">
        <h2 class="nf-h2">最常用的几个转换</h2>
        <ul class="nf-popular">
${popularHtml}
        </ul>
      </div>

      <div class="nf-block reveal">
        <h2 class="nf-h2">全部 ${PAIR_COUNT} 种转换组合</h2>
        <p class="nf-note">按输出格式分成五组，每一条点进去都是一个已经预设好输出格式的转换页，不需要再选一次。</p>
${indent(formatIndex(BASE + "convert/"), 8)}
      </div>
    </div>
  </section>

</main>

${footer("abs")}

<script src="${BASE}assets/js/pixora-lib.js" defer></script>
<script src="${BASE}assets/js/main.js" defer></script>
<script>
/* Show what was actually requested. Runs after main.js so it can stay a plain
   inline enhancement — the page reads fine without it. */
(function () {
  var el = document.getElementById("nf-path");
  if (!el) return;
  var p = location.pathname + location.search;
  if (p.length > 120) p = p.slice(0, 117) + "…";
  el.textContent = p;
  el.hidden = false;
})();
</script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------- build */

let count = 0;
const pairs = [];
for (const from of INPUTS) {
  for (const to of OUTPUTS) {
    if (from === to) continue;
    pairs.push([from, to]);
  }
}
if (pairs.length !== PAIR_COUNT) {
  throw new Error(`PAIR_COUNT (${PAIR_COUNT}) 与实际生成的组合数 (${pairs.length}) 不一致`);
}

for (const [from, to] of pairs) {
  const dir = path.join(OUT, `${from}-to-${to}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page(from, to), "utf8");
  count++;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), hub(), "utf8");
fs.writeFileSync(path.join(ROOT, "404.html"), notFound(), "utf8");

/* ------------------------------------------------------------- sitemap.xml */

const today = "2026-10-13";
/* 除了转换矩阵，站点还有产品页与项目文档页。它们此前整段漏在 sitemap 外 ——
   一致性审计只拿 index + convert 去比，所以看起来"完全一致"，其实是个窄名单造成的假象。 */
const urls = [
  { loc: `${SITE}/`, priority: "1.0", freq: "weekly" },
  { loc: `${SITE}/editor/`, priority: "0.9", freq: "weekly" },
  { loc: `${SITE}/convert/`, priority: "0.9", freq: "weekly" },
  ...pairs.map(([f, t]) => ({ loc: `${SITE}/convert/${f}-to-${t}/`, priority: "0.8", freq: "monthly" })),
  { loc: `${SITE}/changelog.html`, priority: "0.4", freq: "weekly" },
  { loc: `${SITE}/license.html`, priority: "0.3", freq: "yearly" },
  { loc: `${SITE}/contributing.html`, priority: "0.3", freq: "monthly" },
  { loc: `${SITE}/code-of-conduct.html`, priority: "0.3", freq: "yearly" },
  { loc: `${SITE}/security.html`, priority: "0.3", freq: "yearly" },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${u.loc}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${u.loc}"/>
  </url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap, "utf8");

/* --------------------------------------------------- index.html sync blocks */
/* index.html is hand-written apart from two generated blocks: the header nav
   and the 35-link format index. Both are the same data the landing pages are
   built from, and without this sync they would drift the moment either copy is
   edited — drift is how the landing pages became unreachable in the first place. */
const indexPath = path.join(ROOT, "index.html");
let indexHtml = fs.readFileSync(indexPath, "utf8");
const syncBlocks = [
  { label: "导航", start: "<!-- NAV:START", end: "<!-- NAV:END -->", indent: 4, html: nav("root", null) },
  { label: "格式索引", start: "<!-- FMTINDEX:START", end: "<!-- FMTINDEX:END -->", indent: 6, html: formatIndex() },
];

for (const b of syncBlocks) {
  const iStart = indexHtml.indexOf(b.start);
  const iEnd = indexHtml.indexOf(b.end);
  if (iStart < 0 || iEnd < 0) {
    throw new Error(`index.html 缺少 ${b.start} / ${b.end} 标记，无法同步${b.label}`);
  }
  const bodyStart = indexHtml.indexOf("\n", iStart) + 1;
  const block = indent(b.html, b.indent);
  indexHtml = indexHtml.slice(0, bodyStart) + block + "\n" + " ".repeat(b.indent) + indexHtml.slice(iEnd);
}
fs.writeFileSync(indexPath, indexHtml, "utf8");

console.log(`生成落地页 ${count} 个 + 汇总页 1 个`);
console.log(`sitemap.xml 条目 ${urls.length} 条`);
console.log(`index.html 导航与格式索引已同步`);
console.log(`输出目录 ${OUT}`);
