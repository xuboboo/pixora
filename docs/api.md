# Pixora 图像内核 API

`assets/js/pixora-lib.js` 是 Pixora 的图像能力内核。首页的「图片工具箱」和 `editor/`
的「在线修图」都由它供血，你也可以在自己的工具里直接调用。

设计约束只有一条：**内核不碰 DOM**。所有函数只吃普通对象和数字，所以它既能在浏览器里
跑，也能在 Node 里跑。需要 canvas 的那一层（把 ImageData 拆成 `{w, h, data}`、把结果
画回画布）由调用方负责 —— 内核不该知道宿主是谁。

版本：与站点同步，`Pixora.version` 可读。

---

## 引入

### 浏览器（`<script>`）

```html
<!-- 必须在 main.js / editor.js 之前：defer 按文档顺序执行 -->
<script src="assets/js/pixora-lib.js" defer></script>
```

之后全局有 `window.Pixora`。

### Node / CommonJS

```js
const Pixora = require("./assets/js/pixora-lib.js");
```

### ESM

库本身是 UMD，不提供 `export`。要用 `import` 就套一层：

```js
// my-tool.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Pixora = require("./assets/js/pixora-lib.js");
```

---

## 函数一览

| 命名空间 | 函数 | 作用 |
| --- | --- | --- |
| — | `clamp(v, lo, hi)` / `clamp255(v)` | 数值夹取 |
| — | `humanSize(n)` / `pad2(n)` / `stamp()` | 体积格式化、时间戳 |
| `resize` | `ladder(sw, sh, maxOut)` | 降采样中间尺寸阶梯 |
| `encode` | `bmp({w, h, data})` | 24 位 BMP 编码 |
| `zip` | `build(entries)` / `crc32(bytes)` | ZIP 打包 / CRC32 |
| `sr` | `starts(total)` / `tiles(w, h)` | 超分分块表 |
| `pixels` | `adjust(px, w, h, a)` | 完整调整链 |
| `pixels` | `blur` / `sharpen` / `vignette` / `buildLUT` | 单独效果 |

---

## 1. 降采样阶梯

```js
Pixora.resize.ladder(4000, 3000, 400)
// → [{w:2000,h:1500}, {w:1000,h:750}, {w:500,h:375}]
```

一次从 4000 直接缩到 400 会严重混叠。这个函数给出「中间该经过哪些尺寸」，每级约为上级
的一半，缩到接近目标的两倍以内就停。返回**不含起点也不含终点** —— 终点由你指定。

`maxOut` 传目标的最长边（`Math.max(dw, dh)`）。目标比源大时返回空数组。

## 2. BMP 编码

```js
const imgData = ctx.getImageData(0, 0, w, h);
const buf = Pixora.encode.bmp({ w, h, data: imgData.data });   // ArrayBuffer
```

24 位 BGR、行底向上、每行补齐到 4 字节。Canvas 没有 BMP 编码器，所以这个是手写的。
返回 `ArrayBuffer`，要 `Blob` 自己包：`new Blob([buf], { type: "image/bmp" })`。

注意 BMP 没有 alpha，第四通道会被丢掉。

## 3. ZIP 打包

```js
const blob = await Pixora.zip.build([
  { name: "a.png", data: pngBytes },     // Uint8Array 或 ArrayBuffer
  { name: "b.jpg", data: jpgBytes }
]);
```

自动在「不压缩」和「deflate-raw」之间选：压完更小才压。已经压过的 PNG 再压一遍只会变大，
所以它多数条目会走 store。压缩走 `CompressionStream`，浏览器和 Node 18+ 都有，零依赖。

时间戳固定为 2000-01-01 —— 同样的输入产出同样的 ZIP 字节，便于比对和缓存。

`crc32(bytes)` 单独导出，便于校验。

## 4. 超分分块表

Real-ESRGAN general x4v3 导出时输入边长固定 336，所以推理必须分块。

```js
const SR = Pixora.sr;      // { CORE: 256, MARGIN: 40, CTX: 336, SCALE: 4, MAX_IN: 1500000 }

Pixora.sr.starts(600)      // → [0, 256, 344]
Pixora.sr.tiles(512, 512)  // → { x: [0, 256], y: [0, 256], count: 4 }
```

`starts(total)` 给出这一边上每块**核心**的起点。末块一定「回退对齐」到 `total - CORE`
而不是截断 —— 截断会让补齐后的边长不等于 `CTX`，而模型只吃固定边长。回退那一块与上一块
重叠，算的是同一个函数，所以结果等价。

`MARGIN = 40` 不是拍的：用扰动法实测感受野半径 33.8 输入像素（把输入左上角 8×8 换成噪声，
输出到第 163 像素才不再变化，163/4 − 7 ≈ 33.75）。40 覆盖得住，实测分块与整图一次推理在
内部逐位相同；降到 24 就开始出现 1/255 的接缝。

标定全过程见 [`ai-upscale.md`](./ai-upscale.md)。

`MAX_IN` 是单张输入像素上限（150 万）。超过它不是「等一会儿」而是「等很久」，应当先拦下。

## 5. 像素调整链

```js
const px = ctx.getImageData(0, 0, w, h).data;   // Uint8ClampedArray
Pixora.pixels.adjust(px, w, h, {
  brightness: 20,     // −100..100，实际映射到 ±60
  contrast:   -15,    // −100..100
  saturation: 30,     // −100..100，−100 即灰度
  temp:       10,     // −100..100，正偏暖
  blur:        0,     // 0..100
  sharpen:    25,     // 0..100
  vignette:    0,     // 0..100
  sepia:       0,     // 0..100
  invert:    false
});
```

原地修改并返回同一个数组。缺的字段按中性处理，不会因为少写一个键就把整张图变成 NaN。

几个值得知道的行为：

- **alpha 不被调整链改变**（除了模糊/blur，它把 alpha 当第四个通道一起模糊 —— 这是对的，
  真实的模糊就该影响透明边缘）。
- **`Uint8ClampedArray` 的赋值语义是「四舍五入，逢半取偶」**，与 Python 的 `np.rint` 一致。
  所以链里到处直接写浮点值即可，不需要 `Math.round`。
- 灰度权重用 Rec.709：红 255 → 54，蓝 255 → 18。
- 亮度档位映射到 ±60 而不是 ±255 —— 拉满不该直接爆白。

单项效果也可以单独用：

```js
Pixora.pixels.blur(px, w, h, 4)        // 半径（像素），< 1 时无操作
Pixora.pixels.sharpen(px, w, h, 0.5)   // 强度 0..1，<= 0 时无操作
Pixora.pixels.vignette(px, w, h, 0.6)  // 强度 0..1，0 时无操作
```

### 性能

调整是 O(像素数)，滑杆实时预览时每帧全量重算。一张 2000×2000 约 10–30ms，可以跟上鼠标；
再大建议按 `change`（松手）而不是 `input`（拖动）触发。

模糊用可分离盒式（水平一遍 + 垂直一遍），比 2D 卷积快一个量级。半径上限 40 或边长/8。

---

## 基准向量

`tools/test-lib.mjs` 用独立的期望值钉住以上行为（BMP 字节布局、灰度权重、模糊均值、
分块表覆盖性、ZIP 魔数与 CRC）。改动内核先跑它，改期望值前先确认是内核错了：

```
node tools/test-lib.mjs
```

页面级的端到端回归（编辑器 65 项、AI 放大 23 项，后者含与 Python 原生 ONNX Runtime
的逐像素比对）在**仓库同级的 `_audit/` 目录**，没有纳入版本库 —— 它写死了开发机上的
绝对路径，还要读取 Python 侧导出的参考输出。要跑它需要一个根目录为仓库上级的静态服务
（站点挂在 `/pixora/` 子路径下，与 GitHub Pages 的真实部署形态一致）：

```
node _audit/editor.mjs        # 编辑器 65 项
node _audit/ai-upscale.mjs    # AI 放大 23 项，含与 Python 原生 ORT 的逐像素比对
```

内核改坏了，`test-lib.mjs` 一定红；`_audit` 红了不一定是内核的问题，
它同时覆盖页面接线、模型加载与执行提供方回落。
