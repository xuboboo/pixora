# Convertio 图片格式转换器 — REA 逆向分析报告

- **目标站点**：https://convertio.co/zh/image-converter/
- **分析工具**：REA MCP `capture_browser_scenario`（受控 Chromium 154.0.8037.98，headless，viewport 1440×1200，locale zh-CN，timezone Asia/Shanghai，reduced-motion）
- **抓取结果**：`completeness.status = complete`，`missing_sections = []`，`truncated_sections = []`，`equality_eligible = true`，`duration_ms = 16961`
- **抓取产物**：DOM 255,772 字符（原始抓取快照，未纳入版本库）
- **分析日期**：2026-10-13
- **用途**：Pixora 1.1.0 格式转换能力的竞品参考。本报告只做**公开页面的结构性观察**，不涉及任何私有接口或绕过手段。

> 说明：首屏被 Clickio CMP 的同意弹窗覆盖（该弹窗渲染在 iframe 内，REA 的 role 定位器无法穿透 iframe，点击动作 8000ms 超时）。弹窗仅为覆盖层，不影响 DOM 完整性 —— 以下所有结论均基于完整 DOM 解析。

---

## 一、结论速览

| 维度 | Convertio 的做法 | Pixora 的应对 |
|---|---|---|
| 转换位置 | **服务端**（上传到云，24h 后删除） | **纯客户端**，零上传 |
| 格式覆盖 | 108+ 图片格式，11331 种转换组合 | 输入跟随浏览器解码能力，输出覆盖主流 6 种 |
| SEO 引擎 | **116 个格式长尾落地页** + 12 语言 hreflang | 可复刻为格式落地页矩阵 |
| 结构化数据 | 仅 `Product` + `AggregateRating` | 已有 7 类型 `@graph`，**领先** |
| 页面有 FAQ | 有 6 组问答 | 有 `FAQPage` schema，**领先** |
| 第三方脚本 | 10 个（GTM + AdSense + CMP + Google API） | 0 个 |

**核心判断**：Convertio 的护城河不在技术，在**长尾关键词矩阵**与**格式覆盖广度**；其代价是隐私让渡（必须上传）。Pixora 的差异化恰恰是「同等的格式转换能力，零上传」。

---

## 二、技术架构

### 2.1 前后端分工

- **转换在服务端完成**。页面原文：「Convertio 是基于云的解决方案，这意味着转换是在我们这边完成的，而且此工具不会降低您的操作系统的速度。」
- 文件保留策略：「我们保存您的文件的时间不会超过 24 小时，之后我们将从服务器中永久删除它们。」
- 前端只负责：上传、轮询状态、下载。**没有任何客户端编码逻辑**。

### 2.2 前端资源

| 资源 | 地址 |
|---|---|
| 主应用 | `static.convertio.co/js/app.js` |
| 语言包（按语言拆分） | `static.convertio.co/js/locale/zh.js` |
| 样式 | 2 个外链 stylesheet |

**第三方脚本（10 个）**：

| 用途 | 域名 |
|---|---|
| 用户行为分析 | `www.googletagmanager.com`（GA4 `G-2XCYCNYNYB` + 旧版 UA-55374714-1） |
| 广告投放 | `securepubads.g.doubleclick.net/tag/js/gpt.js`（Google Ad Manager） |
| 同意管理（CMP） | `clickiocmp.com`、`s.clickiocdn.com`（Clickio） |
| 云盘集成 | `apis.google.com`（Google Picker） |

> 首屏加载了 GTM、AdSense、CMP 三套追踪脚本。这是「免费 + 广告变现」模式的必然结果，也是**隐私敏感用户流失的根源**。

### 2.3 上传控件

```html
<input type="file" id="pc-upload-add" name="pc-upload">   <!-- 无 accept，接受任意文件 -->
<input type="text"  name="url[]">                          <!-- 支持粘贴网址 -->
<input type="checkbox" id="applyToAll">                    <!-- 把当前设置应用到所有文件 -->
<button class="btn btn-sm btn-outline-light btn-add-more">再添加一个网址</button>
```

**四种输入方式**：本地上传 / Google Drive / Dropbox / 粘贴 URL。单文件上限 **1 GB**。

---

## 三、功能矩阵

### 3.1 转换能力

- 宣称支持 **108+ 图片格式**、**11331 种转换组合**
- 输入源：本地、Google Drive、Dropbox、URL
- 输出设置：目标格式 + **分辨率** + **压缩率**
- 批量：多文件上传 + `applyToAll`（一处设置，全量套用）
- 拖放区文案：「放置文件在这里. 1 GB 最大文件大小」

### 3.2 页面结构（标题层级）

```
H1  在线图片格式转换器
H2  在线免费转换图片 — 支持 JPG、PNG、WEBP、GIF 等格式
  H3  快速转换 / 在线使用 / 支持任何格式 / 使用方便
  H3  如何转换 / 安全转换器
H2  如何在线转换图片文件
H2  经常问的问题
H2  支持的格式
  H4  图像转换质量评分
```

**要点**：H1 唯一且含核心词；H2 覆盖「功能 / 教程 / FAQ / 格式清单」四类搜索意图；H3 用四张卖点卡承接长尾。

### 3.3 卖点文案（可直接对标的表述）

- 快速转换：「只需点击一下即可转换所需的文件」
- 在线使用：「无需在设备上下载或安装任何程序」
- 支持任何格式：「可转换任何现代图像格式，例如 JPEG, PNG, TIFF, BMP。总共支持 11331 种图像转换」
- 使用方便：「界面的直观设计对任何用户来说使用都很方便」
- 安全：「我们保存您的文件的时间不会超过 24 小时，之后我们将从服务器中永久删除它们」

> ⚠️ 「安全」话术是**被动防御**（承诺会删）；Pixora 是**主动免疫**（根本不上传）。这是可强化的攻击点，也是可强化的卖点。

---

## 四、SEO 策略拆解（最有价值的部分）

### 4.1 格式长尾落地页矩阵 —— 116 个页面

从页面内链提取到的格式转换器落地页，共 **116 个**：

```
3FR ARW AVIF BMP CR2 CRW CUR DCM DCR DDS DNG ERF EXR FAX FTS G3 G4 GIF GV
HDR HEIC HEIF HRZ ICO IIQ IPL JBG JBIG JFI JFIF JIF JNX JP2 JPE JPEG JPG JPS
K25 KDC MAC MAP MEF MNG MRW MTV NEF NRW ORF OTB PAL PALM PAM PBM PCD PCT PCX
PDB PEF PES PFM PGM PGX PICON PICT PIX PLASMA PNG PNM PPM PSD PWP RAF RAS RGB
RGBA RGBO RGF RLA RLE RW2 SCT SFW SGI SIX SIXEL SR2 SRF SUN SVG TGA TIFF TIM
TM2 UYVY VIFF VIPS WBMP WEBP WMZ WPG X3F XBM XC XCF XPM XV XWD YUV
```

加上 7 个品类页（IMAGE / AUDIO / VIDEO / DOCUMENT / ARCHIVE / PRESENTATION / FONT / EBOOK），构成 **URL 模板**：

```
https://convertio.co/zh/{format}-converter/
```

**这是 Convertio 真正的流量引擎**：每个冷门格式（如 `x3f`、`six`、`picon`）都是一个竞争极低的搜索词，而每个落地页都能从主页拿到内链权重。116 个页面 × 12 种语言 = **1392 个索引页**。

### 4.2 多语言 hreflang 矩阵

12 种语言，每个都配 `hreflang` 与独立语言包：

```
id / de / en / es / fr / it / nl / pl / pt / vi / tr / ru   （+ zh 主语言）
```

注意细节：`pt` 对应的是越南语路径 `/vn/`、`vi` 对应 `/vn/` —— 其 hreflang 标注与路径存在错配，是**可被超越的细节缺陷**。

### 4.3 标题 / 描述模板

```
title : 图片格式转换器 — Convertio
desc  : 使用 Convertio 在线免费转换 JPG、PNG、WEBP、GIF、BMP、TIFF、SVG 等 108 多种图片格式
        — 快速、简单，无需安装任何软件。
```

模板规律：`{核心词} — {品牌}` / `{动作} + {格式枚举} + {数量背书} + {三点利益}`。

### 4.4 结构化数据 —— 明显的短板

```json
{
  "@context": "http://schema.org",
  "@type": "Product",
  "name": "Image Converter",
  "category": "Productivity",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.6",
    "ratingCount": "15473226",
    "worstRating": "1", "bestRating": "5"
  }
}
```

**三个问题**：

1. 页面明明有 **6 组 FAQ**，却**没有 `FAQPage` schema** → 错失富媒体摘要
2. 有清晰的「如何转换」教程，却**没有 `HowTo` schema**
3. 是网页工具，却用 `Product` 而非 `SoftwareApplication` → 类型语义偏差
4. 使用 `http://schema.org`（非 https），且缺 `@graph` 跨类型引用

> Pixora 现有 `@graph` 已包含 `WebSite / Organization / WebPage / ImageObject / SoftwareApplication / HowTo / FAQPage` 七类，**在这一维度上明显领先**。

---

## 五、对 Pixora 的可落地启示

### 5.1 直接复刻（客户端可实现）

| 能力 | 实现方式 | 优先级 |
|---|---|---|
| 多格式输出（PNG/JPG/WEBP/AVIF） | Canvas `toBlob` + 运行时能力探测 | P0 |
| BMP 输出 | 手写 BMP 编码器（BITMAPFILEHEADER + 24bit BGR 自底向上） | P0 |
| ICO 输出 | 手写 ICO 封装（PNG-in-ICO，最长边 ≤256） | P1 |
| 质量/压缩率控制 | `toBlob(mime, quality)` | P0 |
| 分辨率控制 | 已有宽度/高度 + 等比锁定 | ✅ 已有 |
| 批量转换 | 已有多文件处理 | ✅ 已有 |
| 「应用到全部」 | 现有「统一设置」语义 | ✅ 已有 |
| 批量打包下载 | 手写 ZIP（`CompressionStream('deflate-raw')` + CRC32） | P1 |
| 更多输入格式 | `createImageBitmap` 失败时回退 `<img>` 解码（覆盖 SVG） | P1 |

### 5.2 无法复刻 / 不应复刻

| Convertio 能力 | 原因 |
|---|---|
| 108+ 冷门格式（X3F / IIQ / PEF…） | 需服务端解码器（ImageMagick 级），浏览器无法解析 |
| HEIC/HEIF 输入 | 仅 Safari 原生支持，Chrome/Firefox 无法解码 |
| 1 GB 文件 | 客户端内存约束，实际可用上限约 50–100 MP |
| Google Drive / Dropbox 集成 | 需 OAuth 与第三方 SDK，违背零依赖与零上传 |
| URL 粘贴输入 | 受 CORS 限制，跨域图片无法读取像素 |

> **诚实原则**：Pixora 应在页面上明确标注「支持哪些格式、为什么有些格式不支持」，而不是宣称「支持所有格式」。这是与 Convertio 的「108+ 格式」话术拉开差距的信任点。

### 5.3 可超越 Convertio 的点

1. **零上传**：隐私从「承诺删除」升级为「根本不接触」
2. **结构化数据**：补齐 `FAQPage` / `HowTo` / `SoftwareApplication`（对方全缺）
3. **格式长尾页**：以「客户端可用格式」为准生成落地页矩阵，内容更聚焦、更真实
4. **零第三方脚本**：对方首屏 10 个外链脚本，Pixora 为 0
5. **离线可用**：加载后断网仍能转换（对方必须联网）
6. **无使用限制**：对方免费额度受限、付费解锁更高额度

### 5.4 实施结果（Pixora 1.1.0）

以上 P0 / P1 项已在 1.1.0 全部落地，实测数据如下：

| 能力 | 状态 | 实测 |
|---|:--:|---|
| 多格式输出 + 运行时探测 | ✅ | Chrome 下探测结果为 `png, jpeg, webp, bmp, ico`（AVIF 编码不受支持，按预期不出现） |
| BMP 手写编码器 | ✅ | 600×400 → 703 KB，MIME `image/bmp` |
| ICO 手写编码器 | ✅ | 最长边自动缩至 256 → 256×171，MIME `image/x-icon` |
| ZIP 打包 | ✅ | 3 张结果 → `pixora-20261013.zip` 137,313 bytes |
| 质量 / 分辨率 / 批量 | ✅ | 沿用 1.0.0 引擎 |
| 透明背景填充 | ✅ | 目标格式不支持 alpha 时出现取色器 |
| 回退解码（SVG 等） | ✅ | `createImageBitmap` 失败时回退 `<img>` |

**格式长尾页矩阵**：以「客户端真正可用的格式」为准生成 —— 8 种输入 × 5 种输出，
去掉 5 组同格式自转，共 **35 个转换页 + 1 个总览页**，全部内嵌可直接使用的转换器
（通过 `<html data-convert-to>` 预配置），而非只有 CTA 的门页。

对比 Convertio 的 116 个格式页：数量少，但每一页都对应一个真实可完成的转换，
且每页都带 `FAQPage` + `HowTo` + `BreadcrumbList` 结构化数据 —— 对方这三项全缺。

---

## 六、抓取元数据

| 项目 | 值 |
|---|---|
| provider | `rea-playwright-browser-scenario` v1 |
| 浏览器 | Chromium 154.0.8037.98（process 隔离） |
| 场景动作 | `goto` → `click(role=button, name="Agree & Close")` → `wait_for_timeout(3500)` |
| 动作结果 | click **失败**（8000ms 超时，目标在 iframe 内）；DOM / 截图正常产出 |
| 完整性 | `complete`，无缺失、无截断 |
| 局限 | 未采集网络事件（`events` 未请求）；响应体未采集 |

**复现命令**（REA `capture_browser_scenario`）：

```json
{
  "browser": { "mode": "launch", "executable_path": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "headless": true },
  "start_url": { "url": "https://convertio.co/zh/image-converter/", "query": [] },
  "environment": { "viewport": { "width": 1440, "height": 1200, "device_scale_factor": 1 }, "locale": "zh-CN", "timezone": "Asia/Shanghai", "color_scheme": "light", "reduced_motion": "reduce", "service_workers": "allow" },
  "actions": [{ "step_id": "settle", "action": "wait_for_timeout", "duration_ms": 4000 }],
  "capture": { "after_each_step": [], "at_end": ["screenshot", "dom"], "events": [], "network": { "request_body": false, "response_body": false, "header_values": false } }
}
```
