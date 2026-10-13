/* ==========================================================================
   站点共享外壳：页头、页脚、图标、主题引导脚本、导航下拉里的 35 条转换链接。
   项目文档页（许可证 / 贡献指南 / 行为准则 / 安全政策 / 更新日志）和在线修图页
   都从这儿取，免得同一块标记被抄成好几份然后各自漂移。
   ========================================================================== */
export const SITE = "https://xuboboo.github.io/pixora/";

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* 页面深度。根目录的页（index / 四个项目文档页 / 更新日志）传 "./"，
   深一层的 editor/ 传 "../"。
   过来的版本把 assets/、convert/、页脚链接全写死成根相对，editor/index.html
   于是在 /pixora/editor/assets/... 下一连串 404，导航里 35 条转换链接也全指到
   /pixora/editor/convert/... 这个不存在的路径上。 */
export function navCols(rel) {
  const R = rel || "./";
  return [
  ["转 PNG", [["JPG 转 PNG", "convert/jpg-to-png/"], ["WEBP 转 PNG", "convert/webp-to-png/"], ["GIF 转 PNG", "convert/gif-to-png/"], ["BMP 转 PNG", "convert/bmp-to-png/"], ["AVIF 转 PNG", "convert/avif-to-png/"], ["SVG 转 PNG", "convert/svg-to-png/"], ["ICO 转 PNG", "convert/ico-to-png/"]]],
  ["转 JPG", [["PNG 转 JPG", "convert/png-to-jpg/"], ["WEBP 转 JPG", "convert/webp-to-jpg/"], ["GIF 转 JPG", "convert/gif-to-jpg/"], ["BMP 转 JPG", "convert/bmp-to-jpg/"], ["AVIF 转 JPG", "convert/avif-to-jpg/"], ["SVG 转 JPG", "convert/svg-to-jpg/"], ["ICO 转 JPG", "convert/ico-to-jpg/"]]],
  ["转 WEBP", [["PNG 转 WEBP", "convert/png-to-webp/"], ["JPG 转 WEBP", "convert/jpg-to-webp/"], ["GIF 转 WEBP", "convert/gif-to-webp/"], ["BMP 转 WEBP", "convert/bmp-to-webp/"], ["AVIF 转 WEBP", "convert/avif-to-webp/"], ["SVG 转 WEBP", "convert/svg-to-webp/"], ["ICO 转 WEBP", "convert/ico-to-webp/"]]],
  ["转 BMP", [["PNG 转 BMP", "convert/png-to-bmp/"], ["JPG 转 BMP", "convert/jpg-to-bmp/"], ["WEBP 转 BMP", "convert/webp-to-bmp/"], ["GIF 转 BMP", "convert/gif-to-bmp/"], ["AVIF 转 BMP", "convert/avif-to-bmp/"], ["SVG 转 BMP", "convert/svg-to-bmp/"], ["ICO 转 BMP", "convert/ico-to-bmp/"]]],
  ["转 ICO", [["PNG 转 ICO", "convert/png-to-ico/"], ["JPG 转 ICO", "convert/jpg-to-ico/"], ["WEBP 转 ICO", "convert/webp-to-ico/"], ["GIF 转 ICO", "convert/gif-to-ico/"], ["BMP 转 ICO", "convert/bmp-to-ico/"], ["AVIF 转 ICO", "convert/avif-to-ico/"], ["SVG 转 ICO", "convert/svg-to-ico/"]]]
].map(([title, items]) => `<div class="nav-col">
              <span class="nav-col-title">${title}</span>
              <ul>
${items.map(([t, h]) => `                <li><a href="${R}${h}">${t}</a></li>`).join("\n")}
      </ul>
    </div>`).join("\n");
}

export function icons(rel) {
  const R = rel || "./";
  return `<link rel="icon" href="${R}assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${R}assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${R}assets/img/apple-touch-icon.png">
<link rel="manifest" href="${R}site.webmanifest">`;
}

export const THEME_BOOT = `<script>
(function(){try{var t=localStorage.getItem("pixora-theme");if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();
</script>`;

export function header(rel) {
  const R = rel || "./";
  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${R}" aria-label="Pixora 首页">
      <img src="${R}assets/img/logo.svg" width="32" height="32" alt="Pixora logo" fetchpriority="high">
      <span>Pixora</span>
    </a>

    <nav class="nav" id="nav" aria-label="主导航">
      <a href="${R}#tool">在线工具</a>
      <details class="nav-drop" data-href="${R}convert/">
        <summary>
          <span>格式转换</span>
          <svg class="nav-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </summary>
        <div class="nav-panel">
          <div class="nav-panel-head">
            <strong>按目标格式转换</strong>
            <a href="${R}convert/">全部 35 种组合 →</a>
          </div>
          <div class="nav-panel-cols">${navCols(R)}</div>
        </div>
      </details>
      <a href="${R}#formats">支持的格式</a>
      <a href="${R}#how">工作流</a>
      <a href="${R}#compare">对比</a>
      <a href="${R}#faq">常见问题</a>
    </nav>

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

export function footer(rel) {
  const R = rel || "./";
  return `<footer class="site-footer" aria-labelledby="footer-title">
  <div class="container">
    <h2 id="footer-title" class="visually-hidden">页脚导航</h2>
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="brand" href="${R}" aria-label="Pixora 首页">
          <img src="${R}assets/img/logo.svg" width="32" height="32" alt="Pixora logo" loading="lazy">
          <span>Pixora</span>
        </a>
        <p style="margin-top:12px">浏览器里的免费图片工具：格式转换、缩放、AI 放大与在线修图。全程本地处理，图片不上传，无需注册，没有次数限制。</p>
        <div class="footer-social">
          <a class="icon-btn" href="https://github.com/xuboboo/pixora" target="_blank" rel="noopener" aria-label="GitHub 仓库">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.74 1.27 3.4.97.11-.76.41-1.28.74-1.57-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>
          </a>
          <a class="icon-btn" href="https://github.com/xuboboo/pixora/issues" target="_blank" rel="noopener" aria-label="反馈问题">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2-2z"/></svg>
          </a>
        </div>
      </div>

      <nav class="footer-col" aria-label="产品">
        <h4>产品</h4>
        <ul>
          <li><a href="${R}#tool">图片工具箱</a></li>
          <li><a href="${R}editor/">在线修图</a></li>
          <li><a href="${R}#features">功能特性</a></li>
          <li><a href="${R}#formats">支持的格式</a></li>
          <li><a href="${R}convert/">全部格式转换</a></li>
          <li><a href="${R}#faq">常见问题</a></li>
        </ul>
      </nav>

      <nav class="footer-col" aria-label="资源">
        <h4>资源</h4>
        <ul>
          <li><a href="https://github.com/xuboboo/pixora" target="_blank" rel="noopener">GitHub 仓库</a></li>
          <li><a href="https://github.com/xuboboo/pixora/blob/main/README.md" target="_blank" rel="noopener">项目文档</a></li>
          <li><a href="${R}changelog.html">更新日志</a></li>
          <li><a href="${R}feed.xml" type="application/rss+xml">RSS 订阅</a></li>
          <li><a href="${R}llms.txt">llms.txt</a></li>
        </ul>
      </nav>

      <nav class="footer-col" aria-label="关于">
        <h4>关于</h4>
        <ul>
          <li><a href="${R}license.html">MIT 许可证</a></li>
          <li><a href="${R}contributing.html">贡献指南</a></li>
          <li><a href="${R}code-of-conduct.html">行为准则</a></li>
          <li><a href="${R}security.html">安全政策</a></li>
          <li><a href="https://github.com/xuboboo/pixora/issues" target="_blank" rel="noopener">问题反馈</a></li>
          <li><a href="${R}humans.txt">humans.txt</a></li>
        </ul>
      </nav>
    </div>

    <div class="footer-bottom">
      <span>© <span data-year>2026</span> Pixora · 基于 MIT 许可证开源</span>
      <nav aria-label="法律与元信息">
        <a href="${R}sitemap.xml">站点地图</a>
        <a href="${R}robots.txt">robots.txt</a>
        <a href="${R}.well-known/security.txt">security.txt</a>
        <a href="https://github.com/xuboboo/pixora" target="_blank" rel="noopener">源码</a>
      </nav>
    </div>
  </div>
</footer>`;
}
