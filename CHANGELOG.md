# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，
变更记录参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [1.0.0] — 2026-10-13

首个正式版本。Pixora 从一个「减少在线 PS 导出步骤」的实际需求出发，被重新设计为一个
零依赖、隐私优先、SEO 完备的浏览器端图片工具站点。

### 新增

- **图像引擎**
  - 按宽度等比缩放：高度自动按原图比例计算（等价于 Photoshop「存储为 Web」的锁定比例）
  - 三种缩放模式：等比适应（不变形）、拉伸填满、等比填充（居中裁剪）
  - 分步降采样算法（逐级减半），大幅缩小时保持锐利
  - 支持导出 PNG（无损）/ JPG / WEBP，非 PNG 可调质量
  - 自动处理 EXIF 方向（`imageOrientation: "from-image"`）
  - 输出文件名自动带上尺寸，如 `驱动发布图_400x300.png`

- **交互**
  - 拖放、点击选择、`Ctrl` + `V` 粘贴截图三种输入方式
  - 批量处理：一次拖入多张，统一设置、逐张输出
  - 宽度预设 400 / 600 / 800 / 1200 / 1920，可自定义
  - 设置持久化到 `localStorage`
  - 可选「拖入即自动下载」（默认关闭）

- **站点**
  - DeepSeek 风格的 SaaS 级官网首页：Hero、在线工具、功能网格、数据带、工作流、对比表、FAQ、CTA、多列页脚
  - 明暗双主题，跟随系统并可手动切换
  - 滚动进场动画（`IntersectionObserver`），尊重 `prefers-reduced-motion`
  - 响应式布局，适配移动端（含抽屉式导航）

- **品牌视觉**
  - 全新 logo：渐变圆角方块 + 三级递进方块（隐喻「缩放 / 变换」）
  - 完整图标体系：SVG 站点图标、PNG 回退、iOS 主屏图标、PWA 192/512、maskable 自适应图标
  - 1200×630 OG 社交分享图

- **SEO 与可发现性**
  - JSON-LD `@graph`：`WebSite` / `Organization` / `WebPage` / `ImageObject` / `SoftwareApplication` / `HowTo` / `FAQPage`
  - Open Graph + Twitter Card 完整字段
  - `canonical` 与 `hreflang`（`zh-CN` / `x-default`）
  - `robots.txt`（显式放行 AI 爬虫）、`sitemap.xml`（含 image / xhtml 命名空间）
  - **Speculation Rules API** 声明式预渲染 / 预取
  - PWA 清单、`llms.txt`、`feed.xml`（RSS 2.0）、`humans.txt`、`.well-known/security.txt`
  - IndexNow 密钥文件，支持 Bing / Yandex 即时索引
  - 零第三方请求，无渲染阻塞脚本

### 说明

- 首个版本不包含图层级编辑能力。若需要精细修图，建议搭配 Photopea 等完整编辑器使用。
- 结构化数据刻意不含 `aggregateRating`，以避免标注虚假评价。

[1.0.0]: https://github.com/xuboboo/pixora/releases/tag/v1.0.0
