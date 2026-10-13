/* ==========================================================================
   生成项目文档页：许可证 / 贡献指南 / 行为准则 / 安全政策 / 更新日志。

   页脚原来直接外链 GitHub，访客点一下就被带离站点，而且 GitHub 的 blob 页是给
   仓库读者看的渲染，不是给站点读者看的版式。现在改为本地渲染，内容仍以仓库根
   目录的 md / LICENSE / CHANGELOG.md 为唯一来源 —— 手抄一份 HTML 必然和源文件
   漂移，所以这里用一个够用的 markdown 子集做转换。
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, esc, icons, THEME_BOOT, header, footer } from "./shell.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* 链接引用定义（`[1.2.4]: https://...`）。先由 mdToHtml() 从源文件里收集，
   inline() 再把正文里的裸 `[label]` 还原成链接。 */
let REFS = new Map();

function link(u, t) {
  return /^https?:/.test(u)
    ? '<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>"
    : '<a href="' + u + '">' + t + "</a>";
}

/* 裸引用只改标签之外的文本节点 —— 否则会把 <code> 和 <a> 里的内容也链掉。 */
function linkifyRefs(html) {
  if (!REFS.size) return html;
  return html.split(/(<[^>]+>)/).map((seg) =>
    seg.startsWith("<")
      ? seg
      : seg.replace(/\[([^\]\n]+)\]/g, (m, t) => (REFS.has(t) ? link(REFS.get(t), t) : m))
  ).join("");
}

function inline(s) {
  return linkifyRefs(
    esc(s)
      .replace(/`([^`]+)`/g, (m, c) => "<code>" + c + "</code>")
      .replace(/\*\*([^*]+)\*\*/g, (m, c) => "<strong>" + c + "</strong>")
      /* <https://...> 自动链接。esc() 已经把 < > 变成实体，所以匹配的是实体的形式。 */
      .replace(/&lt;(https?:[^<&\s]+)&gt;/g, (m, u) => link(u, u))
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => link(u, t))
  );
}

function slugId(s) {
  return String(s).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sec";
}

const BLOCK_START = /^(#{1,6}\s|```|\||>|[-*+]\s|\d+\.\s)/;

/* 入口：先把引用定义从正文里摘出来（否则那段 `[1.3.0]: https://...` 会被当成
   一个普通段落输出，长 URL 在窄屏下换不了行，直接把整页撑出横向滚动），
   再进块级解析。 */
function mdToHtml(md) {
  const refs = new Map();
  const body = [];
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const r = /^\[([^\]]+)\]:\s+(https?:\S+)\s*$/.exec(line);
    if (r) { refs.set(r[1], r[2]); continue; }
    body.push(line);
  }
  const saved = REFS;
  REFS = refs;
  try {
    return mdToHtmlBody(body.join("\n"));
  } finally {
    REFS = saved;
  }
}

function mdToHtmlBody(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const blank = (l) => !l.trim();

  while (i < lines.length) {
    const l = lines[i];
    if (blank(l)) { i++; continue; }

    if (/^```/.test(l)) {                                   // 围栏代码块
      const lang = l.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      /* data-lang 给 CSS 贴右上角语言标；class="language-x" 保留惯例，
         方便将来接语法高亮或外部工具识别。 */
      out.push("<pre" + (lang ? ' data-lang="' + esc(lang) + '"' : "") +
        "><code" + (lang ? ' class="language-' + esc(lang) + '"' : "") +
        ">" + esc(buf.join("\n")) + "</code></pre>");
      continue;
    }

    if (/^\|/.test(l) && i + 1 < lines.length &&
        /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {          // 表格
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(l);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) body.push(cells(lines[i++]));
      out.push('<div class="table-wrap"><table><thead><tr>' +
        head.map((c) => "<th>" + inline(c) + "</th>").join("") +
        "</tr></thead><tbody>" +
        body.map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table></div>");
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(l);                  // 标题
    if (h) {
      /* h1 让给页面主标题，正文里的最高从 h2 起 */
      const lv = Math.max(2, Math.min(h[1].length, 4));
      out.push("<h" + lv + ' id="' + slugId(h[2]) + '">' + inline(h[2]) + "</h" + lv + ">");
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }

    if (/^>\s?/.test(l)) {                                  // 引用
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      /* 块内递归直接调 Body，别重新收集引用 —— 外层的 REFS 还得用。 */
      out.push("<blockquote>" + mdToHtmlBody(buf.join("\n")) + "</blockquote>");
      continue;
    }

    if (/^\s*[-*+]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) { // 列表
      const ordered = /^\s*\d+\.\s+/.test(l);
      const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      const items = [];
      while (i < lines.length && !blank(lines[i])) {
        const m = re.exec(lines[i]);
        if (!m) break;
        items.push("<li>" + inline(m[1]) + "</li>");
        i++;
      }
      out.push("<" + (ordered ? "ol" : "ul") + ">" + items.join("") +
        "</" + (ordered ? "ol" : "ul") + ">");
      continue;
    }

    const para = [l];                                       // 段落
    i++;
    while (i < lines.length && !blank(lines[i]) && !BLOCK_START.test(lines[i])) para.push(lines[i++]);
    out.push("<p>" + inline(para.join(" ")) + "</p>");
  }
  return out.join("\n");
}
/* ------------------------------------------------------------------- driver */

const PAGES = [
  { file: "license.html", source: "LICENSE", crumb: "MIT 许可证",
    title: "MIT 许可证 — Pixora",
    description: "Pixora 基于 MIT 许可证开源：任何人可以免费使用、复制、修改、合并、发布、分发本软件，只需保留版权声明与许可声明。",
    lead: "MIT 许可证是一个宽松的短许可证：想怎么用都行，唯一的要求是保留版权与许可声明。" },
  { file: "contributing.html", source: "CONTRIBUTING.md", crumb: "贡献指南",
    title: "贡献指南 — Pixora",
    description: "如何参与 Pixora 开发：项目的设计原则（零依赖、隐私不可妥协、不臃肿）、开发流程、代码规范、提交信息约定与审计测试。",
    lead: "在动手之前请先读一遍设计原则。Pixora 的取舍都写在那几条底线里。" },
  { file: "code-of-conduct.html", source: "CODE_OF_CONDUCT.md", crumb: "行为准则",
    title: "行为准则 — Pixora",
    description: "Pixora 社区行为准则：我们鼓励与反对的行为、执行方式，以及举报渠道。",
    lead: "我们希望社区对每个人都有用、友善、且不必先证明自己。" },
  { file: "security.html", source: "SECURITY.md", crumb: "安全政策",
    title: "安全政策 — Pixora",
    description: "Pixora 的安全政策：支持的版本、如何私密报告漏洞、期望的响应时间，以及本站为什么天然不涉及图片上传带来的隐私风险。",
    lead: "发现问题请走私密渠道，不要开公开 Issue。" },
  { file: "changelog.html", source: "CHANGELOG.md", crumb: "更新日志",
    title: "更新日志 — Pixora",
    description: "Pixora 的完整版本记录：每个版本改了什么、为什么改、如何验证。",
    lead: "每一次改动的动机与验证方式都记在这里。" }
];

function page({ file, title, description, crumb, lead, source }) {
  const url = SITE + file;
  const md = fs.readFileSync(path.join(ROOT, source), "utf8")
    .replace(/^#\s+.*$/m, "")            // 源文件的 h1 由页面主标题承担
    .replace(/^\s*\n/, "");
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Pixora contributors">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#080c16" media="(prefers-color-scheme: dark)">

<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="zh-CN" href="${url}">
${icons()}

<meta property="og:type" content="article">
<meta property="og:site_name" content="Pixora">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}assets/img/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

${THEME_BOOT}

<link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>

${header()}

<main id="main">
  <section class="section doc-page" aria-labelledby="doc-title">
    <div class="container">
      <nav class="breadcrumb" aria-label="面包屑导航">
        <a href="./">Pixora</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">${esc(crumb)}</span>
      </nav>

      <div class="section-head">
        <span class="eyebrow">项目文档</span>
        <h1 id="doc-title">${esc(crumb)}</h1>
        <p>${esc(lead)}</p>
      </div>

      <article class="prose reveal">
${mdToHtml(md)}
      </article>

      <p class="doc-src">本篇内容同时维护在仓库的 <code>${esc(source)}</code> 中，
        由 <code>tools/gen-doc-pages.mjs</code> 转换生成，改动请改源文件而不是这一页。</p>
    </div>
  </section>
</main>

${footer()}

<script src="assets/js/main.js" defer></script>
</body>
</html>
`;
}

let written = 0;
for (const p of PAGES) {
  fs.writeFileSync(path.join(ROOT, p.file), page(p));
  written++;
  console.log("写出", p.file);
}
console.log(`完成：${written} 个文档页`);
