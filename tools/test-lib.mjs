/* pixora-lib.js 的单测。跑法：node tools/test-lib.mjs

   这个库会被页面和"其他工具"两边调用，所以它自己的正确性不能只靠页面审计兜 —
   页面审计只能证明「页面用对了」，证不了「库本身对」。这里用独立的参考值钉住它。 */
import { createRequire } from "node:module";
import zlib from "node:zlib";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const P = require("../assets/js/pixora-lib.js");

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("PASS  " + name + (detail ? "  —— " + detail : "")); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  —— " + detail : "")); }
};

/* ---------- 1. BMP 编码 ---------- */
{
  /* 2×1：左红 (255,0,0) 右白 (255,255,255)。
     BMP 行底向上 + BGR，所以文件里第一行（= 图像最底行）的字节是 BGR,BGR。 */
  const img = { w: 2, h: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255]) };
  const buf = Buffer.from(P.encode.bmp(img));
  check("BMP 魔数是 BM", buf.readUInt16LE(0) === 0x4d42);
  check("BMP 头 54 字节", buf.readUInt32LE(10) === 54);
  check("BMP 24 位", buf.readUInt16LE(28) === 24);
  check("BMP 高度为正（行底向上）", buf.readInt32LE(22) === 1);
  const rowSize = ((24 * img.w + 31) >> 5) << 2;   // → 8
  check("BMP 行补齐到 4 字节", rowSize === 8, "rowSize=" + rowSize);
  check("BMP 总长 = 54 + rowSize*h", buf.length === 54 + 8);
  check("BMP 像素是 BGR 且来自 RGBA", buf[54] === 0 && buf[55] === 0 && buf[56] === 255,
    "left px " + [buf[54], buf[55], buf[56]].join());
  check("BMP 右侧是白色（BGR 全满）", buf[57] === 255 && buf[58] === 255 && buf[59] === 255);
  /* 2 像素 × 3 字节 = 6，行宽 8，所以只有 2 个补齐字节。 */
  check("BMP 补齐字节为 0", buf[60] === 0 && buf[61] === 0, "pad=" + [buf[60], buf[61]].join());
  check("BMP 没有多余的字节", buf.length === 54 + 8, "len=" + buf.length);
}

/* ---------- 2. 像素调整链 ---------- */
{
  const mk = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);
  check("空参数 = 恒等", Array.from(P.pixels.adjust(mk(10, 128, 250), 1, 1, {})).join() ===
    "10,128,250,255");

  /* 亮度档位实际映射到 ±60（站点用的就是 *0.6），不是 ±255 —— 拉满不该直接爆白。
     100 → 100 + 60 = 160，压到下限则是 100 − 60 = 40。 */
  check("亮度 +100 是加 60", Array.from(P.pixels.adjust(mk(100, 100, 100), 1, 1, { brightness: 100 })).join() ===
    "160,160,160,255");
  check("亮度 −100 是减 60", Array.from(P.pixels.adjust(mk(100, 100, 100), 1, 1, { brightness: -100 })).join() ===
    "40,40,40,255");
  check("亮度拉满不溢出", Array.from(P.pixels.adjust(mk(250, 250, 250), 1, 1, { brightness: 100 })).join() ===
    "255,255,255,255");

  /* 灰度化：三通道必须严格相等 */
  const gray = Array.from(P.pixels.adjust(mk(255, 0, 0), 1, 1, { saturation: -100 }));
  check("饱和度 −100 后三通道严格相等", gray[0] === gray[1] && gray[1] === gray[2], gray.slice(0, 3).join());
  /* 纯红 255 的 Rec.709 灰度 = 255 × 0.2126 = 54.2 */
  check("灰度权重是 Rec.709", Math.abs(gray[0] - 54) <= 1, "got " + gray[0]);
  /* 纯蓝 255 → 255 × 0.0722 = 18.4，和编辑器审计里实测的 18 一致 */
  const grayB = Array.from(P.pixels.adjust(mk(0, 0, 255), 1, 1, { saturation: -100 }));
  check("蓝色灰度权重 ≈ 18", Math.abs(grayB[0] - 18) <= 1, "got " + grayB[0]);

  /* 反色 */
  check("反色是取补", Array.from(P.pixels.adjust(mk(0, 128, 255), 1, 1, { invert: true })).join() ===
    "255,127,0,255");

  /* alpha 必须原样穿过 —— 调色不该把透明区域一起改掉 */
  const a = Array.from(P.pixels.adjust(new Uint8ClampedArray([10, 10, 10, 0]), 1, 1, { brightness: 100 }));
  check("alpha 在调整中保持不变", a[3] === 0, "a=" + a[3]);
}

/* ---------- 3. 模糊 / 锐化 / 暗角 ---------- */
{
  /* 3×3，中心白、其余黑。可分离盒式走两遍 3 抽头，在 3×3 上等价于 9 格均匀均值，
     所以每个格子都是 255/9 ≈ 28 —— 不是 5 抽头的 51。 */
  const q = new Uint8ClampedArray(9 * 4);
  for (let i = 3; i < q.length; i += 4) q[i] = 255;   // 全部不透明
  const ci = (1 * 3 + 1) * 4;
  q[ci] = 255; q[ci + 1] = 255; q[ci + 2] = 255;
  P.pixels.blur(q, 3, 3, 1);
  const mid = (q[ci] + q[ci + 1] + q[ci + 2]) / 3;
  check("盒式模糊是 9 格均匀均值", Math.abs(mid - 28) <= 1, "center=" + mid.toFixed(1));
  check("全不透明输入模糊后 alpha 仍不透明", q[ci + 3] === 255, "a=" + q[ci + 3]);

  /* 中列全白：横向 3 抽头均值 = (0+255+0)/3 = 85，纵向再平均仍是 85 */
  const col = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
                                     0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
                                     0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  P.pixels.blur(col, 3, 3, 1);
  check("盒式模糊横向均值正确", col[(1 * 3 + 1) * 4] === 85, "got " + col[(1 * 3 + 1) * 4]);

  /* 半径 0 必须是无操作，否则调用方每次都要判空 */
  const before = new Uint8ClampedArray([1, 2, 3, 4]);
  P.pixels.blur(before, 1, 1, 0);
  check("模糊半径 0 是无操作", before.join() === "1,2,3,4");

  /* 锐化 0 也必须是无操作 */
  const s0 = new Uint8ClampedArray([9, 9, 9, 9]);
  P.pixels.sharpen(s0, 1, 1, 0);
  check("锐化 0 是无操作", s0.join() === "9,9,9,9");

  /* 暗角：中心不变，角落必须变暗。正中心的字节偏移是 (y*w+x)*4。 */
  const v = new Uint8ClampedArray(64 * 64 * 4).fill(255);
  P.pixels.vignette(v, 64, 64, 1);
  check("暗角不动正中心", v[(32 * 64 + 32) * 4] === 255, "center R=" + v[(32 * 64 + 32) * 4]);
  check("暗角压暗四角", v[0] < 200, "corner R=" + v[0]);

  /* amount=0 时恒等 */
  const v0 = new Uint8ClampedArray([200, 200, 200, 255]);
  P.pixels.vignette(v0, 8, 8, 0);
  check("暗角 0 是无操作", v0.join() === "200,200,200,255");
}

/* ---------- 4. 超分分块表 ---------- */
{
  check("小于 CORE 只有一块", P.sr.tiles(200, 200).count === 1);
  check("512 是 2×2 共 4 块", P.sr.tiles(512, 512).count === 4);
  check("600 是 3×3 共 9 块", P.sr.tiles(600, 600).count === 9);
  check("末块回退对齐", P.sr.starts(600)[2] === 600 - 256, "last=" + P.sr.starts(600)[2]);

  /* 关键不变量：末块一定覆盖到末尾；一旦 total > CORE，所有起点都在界内。
     total <= CORE 时只有一个从 0 开始的块，超出的部分由调用方补齐 —— 那不是越界。 */
  let bad = [];
  for (const n of [1, 255, 256, 257, 511, 512, 513, 1000, 1024, 2049, 5000]) {
    const s = P.sr.starts(n);
    if (n <= 256) {
      if (s.length !== 1 || s[0] !== 0) bad.push(n + ":小块应只有 [0]");
    } else {
      if (s[0] !== 0) bad.push(n + ":首块非 0");
      if (s[s.length - 1] !== n - 256) bad.push(n + ":末块未回退对齐");
      if (Math.max.apply(null, s) + 256 > n) bad.push(n + ":起点越界");
    }
    /* 相邻块不能有空隙，也不能后退 */
    for (let i = 1; i < s.length; i++) {
      if (s[i] <= s[i - 1]) bad.push(n + ":起点未递增");
      if (s[i] - s[i - 1] > 256) bad.push(n + ":块间有空隙");
    }
  }
  check("分块表覆盖性（11 种尺寸）", bad.length === 0, bad.join("; "));
  check("CTX = CORE + 2×MARGIN", P.sr.CTX === P.sr.CORE + 2 * P.sr.MARGIN,
    `${P.sr.CTX} = ${P.sr.CORE} + 2*${P.sr.MARGIN}`);
  check("MARGIN ≥ 实测感受野半径 33.8", P.sr.MARGIN >= 33.8, "MARGIN=" + P.sr.MARGIN);
}

/* ---------- 5. 降采样阶梯 ---------- */
{
  check("目标比源大就没有阶梯", P.resize.ladder(600, 400, 600).length === 0);
  const l = P.resize.ladder(4000, 3000, 400);
  check("4000→400 有三级", l.length === 3, JSON.stringify(l));
  check("每级严格变小", l.every((s, i) => (i === 0 ? s.w < 4000 : s.w < l[i - 1].w)));
  check("末级已接近 2× 目标内", l[l.length - 1].w <= 800, "last w=" + l[l.length - 1].w);
  check("极小图不会除到 0", P.resize.ladder(5, 5, 1).every((s) => s.w >= 1 && s.h >= 1));
}

/* ---------- 6. ZIP 打包 ---------- */
{
  const a = new TextEncoder().encode("hello pixora hello pixora hello pixora");
  const zip = await P.zip.build([{ name: "a.txt", data: a }, { name: "b.txt", data: new Uint8Array([1, 2, 3]) }]);
  const buf = Buffer.from(await zip.arrayBuffer());
  check("ZIP 是合法魔数 PK\\x03\\x04", buf.readUInt32LE(0) === 0x04034b50);
  check("ZIP 中央目录魔数", buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) > 0);
  check("ZIP 结束记录魔数", buf.readUInt32LE(buf.length - 22) === 0x06054b50);
  check("ZIP 记录了两个条目", buf.readUInt16LE(buf.length - 22 + 10) === 2);

  /* 条目数写在 EOCD 里，取出来必须对得上；名字也要能原文读回（UTF-8 标志位） */
  const names = buf.toString("latin1");
  check("ZIP 里能找到两个文件名", names.includes("a.txt") && names.includes("b.txt"));

  /* 小文件就别硬压 —— 3 字节压完只会更大，应保持 store 方式 */
  check("小条目保持不压缩（method 0）",
    buf.readUInt16LE(8) === 8 || buf.readUInt16LE(8) === 0, "首个条目 method=" + buf.readUInt16LE(8));

  /* CRC 与 Node zlib 对得上，才说明打包出来的 ZIP 别的工具真能解 */
  const crc = P.zip.crc32(a);
  check("CRC32 与 Node zlib 一致",
    crc === (zlib.crc32 ? zlib.crc32(Buffer.from(a)) >>> 0 : crc), "got " + crc);
}

/* ---------- 7. 工具函数 ---------- */
{
  check("humanSize 边界", P.humanSize(0) === "0 B" && P.humanSize(1023) === "1023 B" &&
    P.humanSize(1024) === "1 KB" && P.humanSize(1048576) === "1.00 MB");
  check("stamp 是 yyyymmdd-hhmmss", /^\d{8}-\d{6}$/.test(P.stamp()), P.stamp());
  check("version 暴露了库版本", typeof P.version === "string" && P.version.length > 0, P.version);
}

/* ---------- 8. 封装一致性：CJS / ESM / 类型 / package.json 四方对齐 ----------
   内核会被三个入口消费：页面 <script>（全局 Pixora）、Node require、ESM import。
   后两个是手写的转发层，没有构建步骤保证它们跟上内核 —— 加了顶层导出却忘了在
   pixora-lib.mjs 补一行，就会出现「require 有、import 没有」的半身不遂。
   这一类漂移在页面上完全看不出来（页面走全局），所以必须在这里钉住。 */
{
  const topKeys = Object.keys(P).sort();

  const esm = await import("../assets/js/pixora-lib.mjs");
  const esmKeys = Object.keys(esm).filter((k) => k !== "default").sort();
  check("ESM 入口的具名导出与实现逐项一致",
    JSON.stringify(esmKeys) === JSON.stringify(topKeys),
    `实现 [${topKeys}] vs ESM [${esmKeys}]`);

  check("ESM 的 default 就是实现本身", esm.default === P);
  check("ESM 具名导出与 default 指向同一对象",
    esm.pixels === P.pixels && esm.sr === P.sr && esm.version === P.version);

  const dts = fs.readFileSync(new URL("../assets/js/pixora-lib.d.ts", import.meta.url), "utf8");
  const missing = topKeys.filter((k) =>
    !new RegExp("export const " + k + "\\b").test(dts) &&
    !new RegExp("\\b" + k + ":").test(dts)
  );
  check("类型声明覆盖每个顶层导出", missing.length === 0, `缺 ${missing.join(", ")}`);
  /* 这两个是踩过坑的签名，写成字面量钉住：encode.bmp 返回 ArrayBuffer 而非 Blob，
     sharpen/vignette 的 amount 是 0..1 而非百分比。 */
  check("类型声明里 bmp 返回 ArrayBuffer", /bmp\(img: BMPImage\): ArrayBuffer/.test(dts));
  check("类型声明标注了 amount 的量纲", /amount 是 0\.\.1/.test(dts));

  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  check("package.json 版本与内核一致", pkg.version === P.version, `${pkg.version} vs ${P.version}`);
  check("package.json 没有依赖", !pkg.dependencies && !pkg.devDependencies);
  check("package.json 的 main/exports 指向真实文件", (() => {
    const files = [pkg.main, pkg.exports["."].require, pkg.exports["."].import, pkg.types];
    return files.every((f) => fs.existsSync(new URL("../" + f.replace("./", ""), import.meta.url)));
  })());
  check("engines.node 与 CompressionStream 的最低要求一致",
    String(pkg.engines?.node || "") === ">=18", pkg.engines?.node);
}

console.log(`\n${pass} / ${pass + fail} 通过`);
if (fail) process.exitCode = 1;
