/* 打包层面的冒烟测试：以一个「别的工具」的身份消费这个包。
   node tools/test-lib.mjs 证明库本身对；本文件证明**封装本身对** ——
   三种引入方式（CJS require / ESM import / 深路径）都真能跑，而不只是 load 进来。
   任何一条通了另一条不通，就是封装漏了，而那种漏在页面上完全看不出来
   （页面走 window.Pixora，绕过了 package.json 的 exports）。

   自建沙箱：在系统临时目录造一个 node_modules，用 junction 把本仓库链进去，
   再从沙箱里 require("pixora")。junction 在 Windows 上不需要管理员权限。
   跑完只删 junction 本身，绝不碰仓库。 */
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("PASS  " + name + (detail ? "  —— " + detail : "")); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  —— " + detail : "")); }
};

/* ---------- 沙箱 ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pixora-pkg-"));
const nm = path.join(tmp, "node_modules");
const link = path.join(nm, "pixora");
fs.mkdirSync(nm, { recursive: true });
fs.symlinkSync(REPO, link, "junction");
const req = createRequire(path.join(nm, "consumer.cjs"));

try {
  /* ---------- 路径一：CJS require("pixora") ---------- */
  const A = req("pixora");
  /* ---------- 路径二：ESM import from "pixora" ---------- */
  const B = await import(pathToFileURL(path.join(link, "assets/js/pixora-lib.mjs")).href);
  /* ---------- 路径三：深路径 require("pixora/pixora-lib.js") ---------- */
  const C = req("pixora/pixora-lib.js");

  console.log("=== 三条引入路径 ===");
  check("require(\"pixora\") 经 exports 解析到内核", !!A && !!A.pixels);
  check("ESM default 与 CJS 是同一份实现", B.default === A);
  check("ESM 具名 pixels 与 CJS 同一引用", B.pixels === A.pixels);
  check("require(\"pixora/pixora-lib.js\") 同一份", C === A);
  check("三者 version 一致", A.version === B.default.version && B.version === C.version, A.version);

  console.log("\n=== 真实操作 ===");
  {
    const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const out = A.pixels.adjust(px, 4, 1, { invert: true });
    check("adjust 就地改并返回同一引用", out === px);
    check("反色：红→青", out[0] === 0 && out[1] === 255 && out[2] === 255, `rgb(${out.slice(0, 3)})`);
    check("alpha 不被碰", out[3] === 255 && out[15] === 255);
    const p2 = new Uint8ClampedArray([100, 100, 100, 255]);
    A.pixels.adjust(p2, 1, 1, { brightness: 100 });
    check("亮度 +100 映射到 +60", p2[0] === 160, `got ${p2[0]}`);
  }
  {
    const img = { w: 2, h: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) };
    const buf = A.encode.bmp(img);
    check("encode.bmp 返回 ArrayBuffer（不是 Blob）", buf instanceof ArrayBuffer);
    const b = Buffer.from(buf);
    check("BMP 魔数与字节数自洽",
      b.readUInt16LE(0) === 0x4d42 && b.readUInt32LE(2) === b.length && b.length === 62,
      `${b.length} 字节`);
    check("BGR + 行底向上：首像素纯红", b[54] === 0 && b[55] === 0 && b[56] === 255);
  }
  {
    const big = new Uint8Array(4096).fill(7), small = new Uint8Array([1, 2, 3]);
    const blob = await A.zip.build([{ name: "big.bin", data: big }, { name: "small.bin", data: small }]);
    const b = Buffer.from(await blob.arrayBuffer());
    check("ZIP 魔数与 EOCD", b.readUInt32LE(0) === 0x04034b50 && b.readUInt32LE(b.length - 22) === 0x06054b50);
    /* 用 Node 自己的解压把第一条解回来 —— 证明别的工具真能读 */
    const nameLen = b.readUInt16LE(26), extraLen = b.readUInt16LE(28);
    const csize = b.readUInt32LE(18), dataAt = 30 + nameLen + extraLen;
    check("大条目走 deflate（method 8）", b.readUInt16LE(8) === 8);
    const back = zlib.inflateRawSync(b.subarray(dataAt, dataAt + csize));
    check("Node 能解开且逐字节一致", back.length === big.length && back.every((v, i) => v === big[i]),
      `${back.length} 字节`);
    check("crc32 与 Node zlib 一致", A.zip.crc32(big) === (zlib.crc32(Buffer.from(big)) >>> 0));
  }
  {
    /* ladder 的契约：逐级减半到接近目标的两倍以内就停，不含起点也不含终点。
       这里把 docs/api.md 里的示例原样钉住，免得哪天改小了让人以为最后一跳也包了。 */
    const ex = A.resize.ladder(4000, 3000, 400);
    check("ladder(4000,3000,400) 与文档示例逐级相同",
      JSON.stringify(ex) === JSON.stringify([{ w: 2000, h: 1500 }, { w: 1000, h: 750 }, { w: 500, h: 375 }]),
      JSON.stringify(ex));
    const one = A.resize.ladder(4000, 3000, 1200);
    check("ladder 末级在目标两倍以内（最后一跳归调用方）",
      one.length === 1 && Math.max(one[0].w, one[0].h) <= 2400, JSON.stringify(one));
    check("目标比源大时返回空数组", A.resize.ladder(100, 100, 200).length === 0);
  }
  {
    const t = A.sr.tiles(600, 600);
    check("sr.tiles 覆盖 600 需 3×3 且末块对齐", t.count === 9 && t.x[2] === 344, JSON.stringify(t.x));
    check("sr 常量与感受野标定一致",
      A.sr.CTX === 336 && A.sr.MARGIN === 40 && A.sr.CORE === 256 && A.sr.SCALE === 4);
  }
  console.log("\n=== ESM 具名导入 ===");
  {
    check("humanSize", B.humanSize(1048576) === "1.00 MB");
    check("sr.starts 省略 core 不炸", B.sr.starts(600).length === 3);
    check("encode 具名可用", B.encode.bmp({ w: 1, h: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) }).byteLength === 58);
    check("zip 具名可用", (await B.zip.build([{ name: "x", data: new Uint8Array([1]) }]).then((z) => z.arrayBuffer())).byteLength > 22);
    check("resize 具名可用", B.resize.ladder(100, 100, 10).length > 0);
    check("pixels 具名可用", B.pixels.adjust(new Uint8ClampedArray([10, 20, 30, 255]), 1, 1, { invert: true })[0] === 245);
    check("clamp255 是顶层导出而非 pixels 的", B.clamp255(999) === 255 && B.clamp255 === A.clamp255);
  }
} finally {
  /* 只删 junction 本体，绝不顺着它删仓库 */
  fs.unlinkSync(link);
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
}

console.log(`\n${pass} / ${pass + fail} 通过`);
if (fail) process.exitCode = 1;
