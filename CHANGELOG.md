# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，
变更记录参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [1.1.0] — 2026-10-13

格式转换版本。在原有「按宽度等比缩放」之上，加入一套**完全在浏览器内运行**的图片格式转换引擎，
并把官网文案、结构化数据、对比表与 FAQ 全部对齐到新能力。此版本的格式矩阵参考了对
[Convertio 图片转换器](https://convertio.co/zh/image-converter/) 的逆向分析结论（见 [`docs/convertio-逆向分析报告.md`](docs/convertio-逆向分析报告.md)），
但实现路径完全不同：Convertio 是服务端转换，Pixora 是端上转换。

### 新增

- **图片格式转换引擎**
  - 输出格式从 3 种扩展到 **6 种**：PNG / JPG / WEBP / AVIF / BMP / ICO
  - **运行时能力探测**：启动时用 Canvas 实际编码一遍并校验返回 blob 的 MIME，
    只有真正可编码的格式才会出现在下拉框里（因此 AVIF 只在支持的浏览器上出现）
  - **手写 BMP 编码器**：BITMAPFILEHEADER + BITMAPINFOHEADER + 24-bit BGR 自底向上像素数据，
    行按 4 字节对齐（`rowSize = ((24 × width + 31) >> 5) << 2`）
  - **手写 ICO 编码器**：22 字节 ICONDIR/ICONDIRENTRY + 内嵌 PNG，最长边超过 256px 时自动等比缩到 256
  - **手写 ZIP 打包**：Local File Header + Central Directory + EOCD 完整结构，
    CRC32 查表实现，优先使用 `CompressionStream("deflate-raw")` 压缩、不可用时降级为 store 模式
  - **透明背景处理**：目标格式不支持 alpha（JPG / BMP）时，自动弹出背景填充色选择器，
    把透明区域合成到指定底色，避免出现黑块
  - **体积变化提示**：每张结果卡片显示相对原图的体积变化（`↓29%` / `↑679%`）
  - **「用当前设置重转」**：改完设置不必重新拖图，直接对已有结果重跑
  - **「打包下载 ZIP」**：批量结果一键打包，文件名形如 `pixora-20261013.zip`
  - **ICO 专用预设**：选中 ICO 时，宽度预设自动切换为图标尺寸 `16 / 32 / 48 / 64 / 128 / 256`
  - **解码回退链**：`createImageBitmap` 失败时回退到 `<img>` 解码（覆盖 SVG 等场景）

- **官网**
  - 新增「支持的格式」区块（`#formats`）：6 张格式卡片 + 3 组说明
    （输入格式 / 为什么输出只有这几种 / 为什么有些格式不支持）
  - 对比表新增第 5 列「上传式在线转换器」，并补齐「图片是否离开设备」「文件保留策略」
    「输出格式数量」「透明背景」「批量 + 打包下载」「断网后仍可用」「第三方追踪脚本」等行，共 13 行
  - FAQ 从 4 条扩展到 7 条，新增「为什么不能转换 HEIC 或相机 RAW 文件？」
    「格式转换会降低画质吗？」「透明背景会怎么处理？」
    「Pixora 和 Convertio 这类在线转换器有什么区别？」
  - 导航新增「格式」入口
  - Hero / meta / OG / Twitter 文案全面扩写格式转换关键词

- **格式转换落地页矩阵（SEO）**
  - 复刻 Convertio 的核心 SEO 结构：按格式拆分的长尾落地页，但只列**真正能完成的组合**
  - 8 种可解码输入 × 5 种可编码输出，去掉 5 组同格式自转 → **35 个转换页 + 1 个总览页**
  - 每一页都内嵌完整转换器，通过 `<html data-convert-to>` 预配置输出格式 ——
    是能用的工具页，不是只有 CTA 的门页
  - 支持深链：`/?to=jpg&w=800` 会带着格式与宽度进入工具（`jpg` 与 `jpeg` 两种写法都接受）
  - 每页独立的 `title` / `description` / `canonical`，36 个页面全部唯一（脚本校验）
  - 每页带 `FAQPage` + `HowTo` + `BreadcrumbList`，且 schema 条目数与可见条目数一致
  - 相关转换区块按「同输入」「同输出」双向互链，任意两页最多两跳可达
  - 新增 `tools/gen-convert-pages.mjs`：一键生成全部落地页并重写 `sitemap.xml`（37 条）
  - 首页新增「常见格式转换」区块与页脚入口，保证爬虫可发现

- **SEO**
  - `SoftwareApplication.featureList` 扩展到 7 项，`softwareVersion` 升到 `1.1.0`
  - `HowTo` 步骤更新为「拖入图片 → 选择目标格式与宽度 → 下载或打包」
  - `FAQPage` 结构化数据同步到 7 条，与页面可见文案一一对应
  - `sitemap.xml` 从 1 条扩到 37 条

### 改进

- **全设备适配**：在 18 个断点（320 → 2560）上重做布局审计并修复
  - `.tool-controls` 默认两列、≥860px 四列，避免平板宽度出现「第四项独占一行」
  - 新增 860px 断点（品牌 + 6 个导航项 + 2 个操作按钮在 860px 以下排不下，改用抽屉导航）
  - 新增 420px 断点，收窄小屏留白
  - 移动端「目标高度」标签不再换行，四列标签高度统一为 21px，输入框对齐
  - 输出格式下拉的选项文案精简为纯格式名，避免窄屏被裁切
  - `.status` 在 420px 列布局下不再撑成空白盒（tool-bar 高度 181px → 36~60px）
- **触摸可用性**
  - `@media (pointer: coarse)` 下把所有交互目标提升到 ≥44px（图标按钮 44×44、按钮、预设 chip、开关行、页脚链接）
  - `@media (hover: none)` 下撤销卡片抬升与按钮位移，避免触屏上 hover 态卡住
  - 页脚链接、结果卡片下载按钮在小屏下补足可点击高度
- **可访问性**
  - `.container` 使用 `env(safe-area-inset-*)`，适配刘海屏横屏
  - 预设按钮补 `aria-pressed` 与 `role="group"`

### 说明

- AVIF **编码**支持度远低于**解码**支持度（多数浏览器能显示 AVIF 但无法导出 AVIF），
  因此本版本对 AVIF 采用运行时探测而非无条件列出。
- BMP 为无压缩位图，体积通常是原图的数十倍，仅建议用于特定兼容场景；
  结果卡片会用 `↑6944%` 这类标记提示体积膨胀。
- 转换仍是**端上**完成，不做任何上传。这也是与 Convertio 最本质的区别。

## [1.0.1] — 2026-10-13

细节打磨版本。修复「处理选项」开关渲染错位，并统一了一批对齐、对比度与可访问性问题。

### 修复

- **「处理选项」开关与文字重叠**（严重）
  - 根因是 CSS 优先级冲突：开关行本身是 `<label>`，被 `.field label { display: block }`（0,1,1）
    压过 `.switch-row { display: inline-flex }`（0,1,0）。行内布局塌陷为块级后，
    绝对定位的滑块失去 flex 盒，直接画在了自己的说明文字上。
  - 现以 `.field .switch-row` 提高优先级，并把字号 / 字重 / 颜色 / 间距从「字段标签」样式里还原。
- 开关在键盘聚焦时没有任何视觉反馈 —— 真实复选框被视觉隐藏，改为在滑块轨道上绘制聚焦环。
- 宽度预设按钮的选中态仅靠颜色表达，补齐 `aria-pressed` 与 `role="group"`。
- 锚点跳转（如 `#tool`）会被 64px 粘性页头遮住标题，补 `scroll-padding-top`。
- 暗色模式下，填充式品牌色块（主按钮、预设按钮、步骤徽标、CTA 横幅、选区）使用为深色背景
  调亮过的 `--brand`，白字对比度仅约 2.8:1；新增 `--brand-fill` / `--brand-fill-2` 令牌，
  让填充面在两种主题下都保持饱和色（白字对比度 ≥ 4.3:1）。
- 暗色模式下 CTA 横幅内的白色主按钮文字用了浅蓝 `--brand-ink`，对比度不足，改用 `--brand-fill`。

### 改进

- 消除主题闪烁：`<head>` 内联引导脚本在样式表之前确定主题，深色用户不再先看到白屏。
- 无脚本兜底：进场动画改为 `.js .reveal`，脚本不可用时内容正常可见，而不是整页空白。
- 打印时强制显示 `.reveal` 元素。
- `theme-color` 在手动切换主题后会移除 `media` 条件，浏览器 UI 颜色不再与页面主题脱节。
- 「常用宽度」与「处理选项」两列统一基线：预设行与开关组等高居中。

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

[1.1.0]: https://github.com/xuboboo/pixora/releases/tag/v1.1.0
[1.0.1]: https://github.com/xuboboo/pixora/releases/tag/v1.0.1
[1.0.0]: https://github.com/xuboboo/pixora/releases/tag/v1.0.0
