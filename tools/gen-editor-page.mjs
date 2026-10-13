/* ==========================================================================
   生成在线修图页 /editor/。
   页面外壳（页头/页脚/主题引导）来自 tools/shell.mjs，和文档页共用一份，
   免得同一块标记被抄成两份然后各自漂移。
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, esc, icons, navCols, THEME_BOOT, header, footer } from "./shell.mjs";

/* editor/ 比站点根深一层，所有相对资源都要退一级。 */
const REL = "../";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BODY = `
  <section class="section editor-page" aria-labelledby="editor-title">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">在线修图</span>
        <h1 id="editor-title">浏览器里的图片编辑器</h1>
        <p>裁切、旋转、调色、加字、画画，一次做完。和工具箱一样：图片全程留在本机，不上传、不注册、不限次数。</p>
      </div>

      <div class="editor" id="editor">
        <div class="editor-bar">
          <button class="btn btn-ghost btn-sm" id="ed-open" type="button">打开图片</button>
          <input type="file" id="ed-file" accept="image/*" hidden>
          <span class="editor-bar-sep" aria-hidden="true"></span>
          <button class="icon-btn" id="ed-undo" type="button" aria-label="撤销" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7L3 9"/></svg>
          </button>
          <button class="icon-btn" id="ed-redo" type="button" aria-label="重做" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7l3 3"/></svg>
          </button>
          <button class="icon-btn" id="ed-reset" type="button" aria-label="重置为原图" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <p class="editor-info" id="ed-info">尚未打开图片</p>
          <span class="editor-bar-spacer"></span>
          <button class="icon-btn" id="ed-zoom-out" type="button" aria-label="缩小">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>
          </button>
          <span class="editor-zoom-val" id="ed-zoom">100%</span>
          <button class="icon-btn" id="ed-zoom-in" type="button" aria-label="放大">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="btn btn-ghost btn-sm" id="ed-fit" type="button">适配</button>
          <button class="btn btn-ghost btn-sm" id="ed-export-open" type="button" disabled>导出</button>
        </div>

        <div class="editor-body">
          <div class="editor-rail" role="toolbar" aria-label="编辑工具">
            <button class="ed-tool on" type="button" data-tool="move" aria-pressed="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>
              <span>移动</span>
            </button>
            <button class="ed-tool" type="button" data-tool="crop" aria-pressed="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
              <span>裁剪</span>
            </button>
            <button class="ed-tool" type="button" data-tool="brush" aria-pressed="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
              <span>画笔</span>
            </button>
            <button class="ed-tool" type="button" data-tool="eraser" aria-pressed="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 21h10"/><path d="M5 15l4 4M9 11l6 6"/><path d="M14.5 4.5 20 10l-8 8H6l-2-2 8-8 2.5-3.5z"/></svg>
              <span>橡皮</span>
            </button>
            <button class="ed-tool" type="button" data-tool="shapes" aria-pressed="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="9" height="9" rx="1"/><circle cx="17" cy="17" r="4"/></svg>
              <span>形状</span>
            </button>
            <button class="ed-tool" type="button" data-tool="text" aria-pressed="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7V5h16v2M9 19h6M12 5v14"/></svg>
              <span>文字</span>
            </button>
            <button class="ed-tool" type="button" data-tool="pick" aria-pressed="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 22 1-5 12-12 4 4L7 21l-5 1z"/><path d="m15 5 4 4"/><path d="M17.5 2.5a2.12 2.12 0 0 1 3 3L19 7l-4-4 2.5-2.5z"/></svg>
              <span>取色</span>
            </button>
          </div>

          <div class="editor-stage" id="ed-stage">
            <canvas id="ed-view" aria-label="图片画布"></canvas>
            <div class="editor-empty" id="ed-empty">
              <div class="big" aria-hidden="true">🖌️</div>
              <h3>把图片拖到这里</h3>
              <small>或点「打开图片」，也可以 Ctrl + V 粘贴 · 全程本地处理</small>
            </div>
            <p class="editor-hint" id="ed-hint" hidden></p>
          </div>

          <aside class="editor-side" aria-label="编辑选项">
            <section class="panel" id="ed-tool-panel" hidden>
              <h2 id="ed-tool-title">工具</h2>
              <div class="panel-body" id="ed-tool-body"></div>
            </section>

            <section class="panel" id="ed-adjust-panel" hidden>
              <h2>调整</h2>
              <p class="panel-note">滑块是实时预览，点「应用」才落进历史、才会被撤销覆盖。</p>
              <div class="sliders" id="ed-adjust"></div>
              <div class="panel-actions">
                <button class="btn btn-ghost btn-sm" id="ed-adj-reset" type="button">还原</button>
                <button class="btn btn-primary btn-sm" id="ed-adj-apply" type="button" disabled>应用</button>
              </div>
            </section>

            <section class="panel" id="ed-filter-panel" hidden>
              <h2>滤镜</h2>
              <p class="panel-note">立即生效，可在历史里撤销。</p>
              <div class="chips" id="ed-filters" role="group" aria-label="滤镜预设"></div>
            </section>

            <section class="panel" id="ed-canvas-panel" hidden>
              <h2>画布</h2>
              <div class="panel-grid">
                <label>宽 (px)<input type="number" id="ed-cw" min="1" max="8000" step="1"></label>
                <label>高 (px)<input type="number" id="ed-ch" min="1" max="8000" step="1"></label>
              </div>
              <div class="panel-actions">
                <button class="btn btn-ghost btn-sm" id="ed-rotate-l" type="button">左转 90°</button>
                <button class="btn btn-ghost btn-sm" id="ed-rotate-r" type="button">右转 90°</button>
              </div>
              <div class="panel-actions">
                <button class="btn btn-ghost btn-sm" id="ed-flip-h" type="button">水平翻转</button>
                <button class="btn btn-ghost btn-sm" id="ed-flip-v" type="button">垂直翻转</button>
              </div>
            </section>
          </aside>
        </div>

        <div class="editor-export" id="ed-export-bar" hidden>
          <div class="editor-export-row">
            <label>格式
              <select id="ed-format">
                <option value="png">PNG</option>
                <option value="jpeg">JPG</option>
                <option value="webp">WEBP</option>
              </select>
            </label>
            <label id="ed-q-wrap">质量 <output id="ed-qv">92</output>%
              <input type="range" id="ed-q" min="50" max="100" value="92">
            </label>
            <button class="btn btn-primary btn-sm" id="ed-download" type="button">下载图片</button>
            <button class="btn btn-ghost btn-sm" id="ed-export-close" type="button">收起</button>
          </div>
          <p class="editor-export-note" id="ed-export-note"></p>
        </div>
      </div>
    </div>
  </section>
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<title>在线修图 — 浏览器里裁切、调色、加文字的图片编辑器 | Pixora</title>
<meta name="description" content="免费在线修图：裁切、旋转翻转、亮度对比度饱和度调整、滤镜、画笔、形状、文字与取色，全部在浏览器本地完成，图片不上传、无需注册、没有次数限制。">
<meta name="author" content="Pixora contributors">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#080c16" media="(prefers-color-scheme: dark)">

<link rel="canonical" href="${SITE}editor/">
<link rel="alternate" hreflang="zh-CN" href="${SITE}editor/">
${icons(REL)}

<meta property="og:type" content="website">
<meta property="og:site_name" content="Pixora">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="在线修图 — 浏览器里的图片编辑器 | Pixora">
<meta property="og:description" content="裁切、旋转、调色、滤镜、画笔、文字，全部在本地完成。图片不上传，无需注册。">
<meta property="og:url" content="${SITE}editor/">
<meta property="og:image" content="${SITE}assets/img/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

${THEME_BOOT}

<link rel="stylesheet" href="../assets/css/style.css">
</head>
<body>
<a class="skip-link" href="#ed-stage">跳到画布</a>

${header(REL)}

<main id="main">
${BODY}
</main>

${footer(REL)}

<script src="../assets/js/pixora-lib.js" defer></script>
<script src="../assets/js/main.js" defer></script>
<script src="../assets/js/editor.js" defer></script>
</body>
</html>
`;

fs.mkdirSync(path.join(ROOT, "editor"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "editor", "index.html"), html);
console.log("写出 editor/index.html", html.length, "字节");
