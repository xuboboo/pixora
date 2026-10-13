<div align="center">

<img src="assets/img/og.png" alt="Pixora — 浏览器里的免费图片工具箱" width="820">

# Pixora

**浏览器里的免费图片工具箱。按宽度等比缩放，一键导出 PNG。**

无需注册 · 无使用限制 · 图片绝不上传 · MIT 开源

[![Live Demo](https://img.shields.io/badge/demo-online-4d6bfe?style=flat-square)](https://xuboboo.github.io/pixora/)
[![License: MIT](https://img.shields.io/badge/license-MIT-16a34a?style=flat-square)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-8b5cf6?style=flat-square)](#技术栈)
[![Lighthouse](https://img.shields.io/badge/lighthouse-100%2F100-16a34a?style=flat-square)](#性能与-seo)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-4d6bfe?style=flat-square)](CONTRIBUTING.md)

[在线体验](https://xuboboo.github.io/pixora/) · [功能](#功能特性) · [技术栈](#技术栈) · [SEO 策略](#性能与-seo) · [本地运行](#本地运行) · [贡献](#参与贡献)

</div>

---

## 这是什么

Pixora 把「打开在线 PS → 上传图片 → 文件 → 导出为 PNG → 手动填宽度 → 保存」这一串操作，压缩成**一次拖拽**。

你只需要拖入图片、选一个宽度（比如 400 或 600），高度会**自动按原图比例**换算，然后直接下载无损 PNG。整个过程在浏览器内完成，**图片不会上传到任何服务器**。

它不做臃肿的全能编辑器 —— 只把最高频的「改尺寸 + 转格式 + 导出」做到一步到位。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| **按宽度等比缩放** | 指定宽度（400 / 600 / 自定义），高度自动按原图比例计算，永不变形 |
| **批量处理** | 一次拖入多张图片，统一套用设置，逐张输出结果与下载链接 |
| **格式自由** | 导出 PNG（无损）/ JPG / WEBP，非 PNG 可调质量滑块 |
| **三种缩放模式** | 等比适应（不变形）、拉伸填满、等比填充（居中裁剪） |
| **隐私优先** | 解码 / 缩放 / 编码全部在本地完成，无上传、无存储、无追踪 |
| **零依赖** | 纯手写 HTML / CSS / JavaScript，无框架、无构建、无第三方库 |
| **专业级画质** | 分步降采样 + 高质量重采样，大幅缩小时依旧锐利 |
| **离线可用** | 页面加载后断网也能继续处理 |
| **明暗双主题** | 跟随系统偏好，也可手动切换并记忆 |
| **粘贴即用** | 支持 `Ctrl` + `V` 直接粘贴剪贴板截图 |

## 截图

<div align="center">
<img src="assets/img/og.png" alt="Pixora 首页与在线工具" width="760">
</div>

## 技术栈

Pixora 刻意保持极简 —— **没有 `package.json`，没有构建步骤，没有依赖**。

- **标记**：语义化 HTML5（`header` / `nav` / `main` / `section` / `article` / `footer`）
- **样式**：原生 CSS3 —— 自定义属性（Design Tokens）、`color-mix()`、Grid、`clamp()` 流体排版、`prefers-color-scheme` / `prefers-reduced-motion`
- **脚本**：原生 ES2017+（`async/await`、`createImageBitmap`、`IntersectionObserver`），无任何运行时依赖
- **图像引擎**：`createImageBitmap` → `OffscreenCanvas`/`Canvas` → 分步降采样 → `toBlob` 编码
- **托管**：GitHub Pages（静态，无需服务器）

```
pixora/
├── index.html                     # 单页官网 + 在线工具
├── assets/
│   ├── css/style.css              # 设计系统（Design Tokens + 组件）
│   ├── js/main.js                 # 主题、导航、动效、图像引擎
│   └── img/
│       ├── logo.svg               # 主标志
│       ├── logo-mono.svg          # 单色标志
│       ├── logo-lockup.svg        # 标志组合（含字标）
│       ├── favicon.svg            # 矢量站点图标
│       ├── favicon-32.png         # 位图回退
│       ├── apple-touch-icon.png   # iOS 主屏图标
│       ├── icon-192.png           # PWA 图标
│       ├── icon-512.png           # PWA 图标
│       ├── icon-maskable-512.png  # PWA 自适应图标
│       └── og.png                 # 1200×630 社交分享图
├── robots.txt                     # 抓取策略（含 AI 爬虫显式放行）
├── sitemap.xml                    # 站点地图（含 image / hreflang 命名空间）
├── site.webmanifest               # PWA 清单
├── feed.xml                       # RSS 2.0 订阅
├── llms.txt                       # 面向大模型的可读站点摘要
├── humans.txt                     # 站点与作者信息
├── 8f3a1c9e7b2d4f60a5c8e1b93d7f2046.txt  # IndexNow 密钥
├── .well-known/security.txt       # 安全联系信息
├── .nojekyll                      # 关闭 GitHub Pages 的 Jekyll 处理
├── LICENSE                        # MIT 许可证
├── CONTRIBUTING.md                # 贡献指南
├── CODE_OF_CONDUCT.md             # 贡献者公约 · 行为准则
├── SECURITY.md                    # 安全政策与漏洞报告流程
└── CHANGELOG.md                   # 更新日志
```

## 性能与 SEO

Pixora 的 SEO 不是「加几个 meta 标签」，而是**从渲染路径到结构化数据全链路设计**。

### 1. 抓取与索引

- `robots.txt`：全站放行，**显式放行 AI 爬虫**（GPTBot、ClaudeBot、PerplexityBot、Google-Extended、Applebot-Extended 等）
- `sitemap.xml`：包含 `image` / `xhtml` 命名空间，标注 `lastmod` / `changefreq` / `priority`
- `<link rel="canonical">` + `hreflang`（`zh-CN` / `x-default`）
- `max-image-preview:large` + `max-snippet:-1` —— 允许富媒体摘要与完整摘要
- **IndexNow** 密钥文件 —— 支持 Bing / Yandex 即时索引
- **`llms.txt`** —— 新兴的 AI 可读站点摘要标准，让大模型准确引用

### 2. 结构化数据（JSON-LD `@graph`）

单个 `@graph` 中互相引用，语义完整、无重复：

- `WebSite` → `Organization` → `WebPage` → `SoftwareApplication`
- `ImageObject`（OG 图，含 `width`/`height`/`caption`）
- `HowTo`（三步工作流，可直接竞争富结果）
- `FAQPage`（问答富结果）

> 刻意**不写** `aggregateRating`：没有真实评价就不编造评分，避免被判定为垃圾结构化数据。

### 3. 社交与分享

- Open Graph 完整字段（`og:image:width` / `height` / `alt`、`og:locale`、`og:site_name`）
- Twitter / X `summary_large_image`
- 自绘 1200×630 OG 图

### 4. 前沿技术

- **Speculation Rules API** —— 声明式预渲染 / 预取，让站内跳转接近瞬时
- **PWA** —— `site.webmanifest` + 普通图标 + `maskable` 自适应图标 + 快捷方式
- **`.well-known/security.txt`** —— 安全研究者联系规范
- **流体排版 `clamp()`**、`content-visibility` 友好结构、无渲染阻塞资源

### 5. 性能预算

| 指标 | 目标 | 实现方式 |
| --- | --- | --- |
| 第三方请求 | **0** | 无 CDN、无字体服务、无分析脚本 |
| 阻塞渲染资源 | **1**（同源 CSS） | 脚本全部 `defer`，无内联大脚本 |
| 布局偏移（CLS） | **≈ 0** | 图片均带 `width`/`height`，无动态注入的广告位 |
| 首屏图片 | 预加载 | `<link rel="preload">` + `fetchpriority="high"` |
| 动效 | 尊重偏好 | `prefers-reduced-motion` 全量降级 |

## 本地运行

无需安装任何东西 —— 这是一个纯静态站点。

```bash
# 方式一：直接打开
# 双击 index.html 即可（部分浏览器对本地 file:// 的剪贴板有限制）

# 方式二：起一个静态服务器（推荐）
python -m http.server 8080
# 然后访问 http://localhost:8080

# 或者
npx serve .
```

## 部署

站点托管在 **GitHub Pages**，从 `main` 分支根目录直接发布：

- 线上地址：<https://xuboboo.github.io/pixora/>
- 仓库设置：`Settings → Pages → Source: Deploy from a branch → main / (root)`

`.nojekyll` 用于关闭 Jekyll 处理，保证 `.well-known/` 等目录被原样发布。

## 浏览器支持

| 浏览器 | 版本 |
| --- | --- |
| Chrome / Edge | 90+ |
| Firefox | 90+ |
| Safari | 15+ |
| 移动端 Chrome / Safari | 15+ |

核心依赖 `createImageBitmap`、`Canvas 2D`、`toBlob`、CSS 自定义属性。

## 参与贡献

欢迎任何形式的贡献 —— 见 [CONTRIBUTING.md](CONTRIBUTING.md)。特别欢迎：

- 新的图片处理能力（裁剪、旋转、水印、压缩）
- 无障碍与国际化改进
- 性能与算法优化

参与本项目即表示你同意遵守 [行为准则](CODE_OF_CONDUCT.md)。
发现安全问题时，请按 [安全政策](SECURITY.md) 私下报告，不要开公开 Issue。

## 许可证

[MIT](LICENSE) © Pixora contributors

---

<div align="center">
<sub>Pixora 与 Adobe Photoshop®、Photopea、LogoSC 无任何关联。所有商标归其各自所有者。</sub>
</div>
