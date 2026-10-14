/* ==========================================================================
   Pixora 图像内核 —— 可复用库
   ----------------------------------------------------------------------------
   站点上「图片工具箱」和「在线修图」两处能力，底层其实是同一套不依赖 DOM 的
   纯函数：降采样阶梯、BMP 编码、ZIP 打包、超分分块表、像素调整链。此前它们各自
   抄了一份，一处修了另一处不知道 —— 这个库就是那份唯一的真相。

   全部函数只吃普通对象（{w,h,data} / 数字 / Uint8Array），不碰 canvas、不碰
   document，所以浏览器里 `<script>` 挂 window.Pixora，Node 里 require 直接用。

   拿 canvas 的调用方（页面）负责把 ImageData 拆成 {w,h,data} 传进来；拿结果
   的一方负责把它包回 Blob / canvas。这是故意的：内核不该知道宿主是谁。

   用法与逐函数说明见 docs/api.md。
   ========================================================================== */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.Pixora = api;
  if (root && typeof root === "object") root.Pixora = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  /* ---------- 通用小工具 ---------- */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

  function humanSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return Math.round(n / 1024) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function stamp() {
    var d = new Date();
    return "" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      "-" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  /* ======================================================================
     1. 降采样阶梯
     ====================================================================== */

  /* 一次从 4000 直接缩到 400 会严重混叠，所以按 2 的因子逐级往下走，最后再落一次。
     返回的是「中间要经过哪些尺寸」，不含起点、也不含终点 —— 终点由调用方指定。
     stop = max(2*target, 4)：缩到接近目标的两倍以内就不必再折半了，再折只是浪费，
     最后那一跳交给调用方的 drawImage。target 传目标的最长边（Math.max(dw, dh)）；
     目标比源大时返回空数组。 */
  function resizeLadder(sw, sh, target) {
    var out = [];
    var w = sw, h = sh;
    var stop = Math.max(2 * target, 4);
    while (Math.max(w, h) > stop && Math.max(w, h) > 4) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      out.push({ w: w, h: h });
    }
    return out;
  }

  /* ======================================================================
     2. BMP 编码器（24 位 BGR，行底向上，每行补齐到 4 字节）
        Canvas 没有 BMP 编码器，所以手写。输入是 {w, h, data}，data 是 RGBA。
     ====================================================================== */
  function encodeBMP(img) {
    var w = img.w | 0, h = img.h | 0;
    var src = img.data;
    var rowSize = ((24 * w + 31) >> 5) << 2;
    var pixelBytes = rowSize * h;
    var buf = new ArrayBuffer(54 + pixelBytes);
    var dv = new DataView(buf);
    dv.setUint8(0, 0x42); dv.setUint8(1, 0x4D);            // "BM"
    dv.setUint32(2, 54 + pixelBytes, true);                 // 文件大小
    dv.setUint32(10, 54, true);                             // 像素数据偏移
    dv.setUint32(14, 40, true);                             // BITMAPINFOHEADER
    dv.setInt32(18, w, true);
    dv.setInt32(22, h, true);                               // 正数 → 行底向上
    dv.setUint16(26, 1, true);                              // 位面数
    dv.setUint16(28, 24, true);                             // 每像素位数
    dv.setUint32(30, 0, true);                              // BI_RGB，不压缩
    dv.setUint32(34, pixelBytes, true);
    dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);   // 72 DPI
    var out = new Uint8Array(buf);
    for (var y = 0; y < h; y++) {
      var srcRow = (h - 1 - y) * w * 4;
      var dstRow = 54 + y * rowSize;
      for (var x = 0; x < w; x++) {
        var si = srcRow + x * 4, di = dstRow + x * 3;
        out[di] = src[si + 2]; out[di + 1] = src[si + 1]; out[di + 2] = src[si];
      }
    }
    return buf;
  }

  /* ======================================================================
     3. ZIP 打包（store / deflate-raw 自动二选一）
        条目吃 { name, data }，data 是 Uint8Array 或 ArrayBuffer。
        压缩走 CompressionStream —— 浏览器和 Node 18+ 都有，不用引入 zlib 依赖。
     ====================================================================== */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function deflateRaw(bytes) {
    if (typeof CompressionStream !== "function") return Promise.resolve(null);
    try {
      var cs = new CompressionStream("deflate-raw");
      var writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();
      return new Response(cs.readable).arrayBuffer()
        .then(function (ab) { return new Uint8Array(ab); })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  /* 2000-01-01 00:00 的 MS-DOS 时间戳。固定值让同样的输入产出同样的 ZIP 字节。 */
  var DOS_DATE = 0x2821, DOS_TIME = 0x0000;

  function buildZip(entries) {
    var enc = new TextEncoder();
    var parts = [], central = [], offset = 0;
    var chain = Promise.resolve();
    entries.forEach(function (entry) {
      chain = chain.then(function () {
        var raw = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
        return deflateRaw(raw).then(function (packed) {
          var data = raw, method = 0;
          /* 只有真的更小才用压缩 —— 已经压过的 PNG 再压一遍只会变大。 */
          if (packed && packed.length < raw.length) { data = packed; method = 8; }
          var nameBytes = enc.encode(entry.name);
          var crc = crc32(raw);

          var lh = new DataView(new ArrayBuffer(30));
          lh.setUint32(0, 0x04034b50, true);
          lh.setUint16(4, 20, true);
          lh.setUint16(6, 0x0800, true);              // UTF-8 文件名
          lh.setUint16(8, method, true);
          lh.setUint16(10, DOS_TIME, true);
          lh.setUint16(12, DOS_DATE, true);
          lh.setUint32(14, crc, true);
          lh.setUint32(18, data.length, true);
          lh.setUint32(22, raw.length, true);
          lh.setUint16(26, nameBytes.length, true);
          lh.setUint16(28, 0, true);
          parts.push(new Uint8Array(lh.buffer), nameBytes, data);

          var ch = new DataView(new ArrayBuffer(46));
          ch.setUint32(0, 0x02014b50, true);
          ch.setUint16(4, 20, true);
          ch.setUint16(6, 20, true);
          ch.setUint16(8, 0x0800, true);
          ch.setUint16(10, method, true);
          ch.setUint16(12, DOS_TIME, true);
          ch.setUint16(14, DOS_DATE, true);
          ch.setUint32(16, crc, true);
          ch.setUint32(20, data.length, true);
          ch.setUint32(24, raw.length, true);
          ch.setUint16(28, nameBytes.length, true);
          ch.setUint32(42, offset, true);
          central.push(new Uint8Array(ch.buffer), nameBytes);

          offset += 30 + nameBytes.length + data.length;
        });
      });
    });
    return chain.then(function () {
      var cdSize = central.reduce(function (n, p) { return n + p.length; }, 0);
      var eo = new DataView(new ArrayBuffer(22));
      eo.setUint32(0, 0x06054b50, true);
      eo.setUint16(8, entries.length, true);
      eo.setUint16(10, entries.length, true);
      eo.setUint32(12, cdSize, true);
      eo.setUint32(16, offset, true);
      return new Blob(parts.concat(central, [new Uint8Array(eo.buffer)]), { type: "application/zip" });
    });
  }

  /* ======================================================================
     4. 超分分块表 —— Real-ESRGAN general x4v3

     网络是全卷积的，但导出时输入边长固定 336，所以推理必须分块：每块喂
     CTX×CTX，取正中 CORE×CORE 那部分（放大后 SCALE 倍）。外围 MARGIN 是「上下文
     余量」—— 卷积核看得见邻域，块间不给足余量，拼起来就有接缝。

     MARGIN = 40 的来路：用扰动法实测感受野半径 33.8 输入像素（把输入左上角
     8×8 换成噪声，输出到第 163 像素才不再变化，163/4 − 7 ≈ 33.75）。40 覆盖得住，
     实测分块与整图一次推理在内部逐位相同；降到 24 就开始出现 1/255 的接缝。

     末块必须「回退对齐」而不是截断：截断会让补齐后的边长不等于 CTX，而模型只吃
     固定边长。回退那一块与上一块重叠，算的是同一个函数，所以结果等价。
     ====================================================================== */
  var SR = {
    CORE: 256,
    MARGIN: 40,
    CTX: 336,
    SCALE: 4,
    MAX_IN: 1500000
  };

  /* total 这一边上每块核心的起点。total <= CORE 时只有一个从 0 开始的块。 */
  function srStarts(total, core) {
    core = core || SR.CORE;
    if (total <= core) return [0];
    var s = [];
    for (var i = 0; i + core <= total; i += core) s.push(i);
    if (s[s.length - 1] !== total - core) s.push(total - core);
    return s;
  }

  function srTiles(w, h) {
    var xs = srStarts(w), ys = srStarts(h);
    return { x: xs, y: ys, count: xs.length * ys.length };
  }

  /* ======================================================================
     5. 像素调整链

     亮度 / 对比度 / 色温都是逐通道重映射，先合成一张 256 项 LUT，主循环就只剩
     饱和度和滤镜两步；模糊用可分离盒式（两遍近高斯，比 2D 卷积快一个量级）；
     锐化是 3×3 反锐化；暗角是椭圆径向衰减，平方曲线 —— 线性会在中段就发灰。

     所有函数原地改 px 并返回它，方便链式调用。px 是 Uint8ClampedArray，
     赋值语义是「四舍五入，逢半取偶」，与 Python 的 np.rint 一致。
     ====================================================================== */
  function buildLUT(a) {
    var b = a.brightness * 0.6;
    var f = (100 + a.contrast) / 100;
    f = f * f;
    var tr = a.temp * 0.5, tb = -a.temp * 0.5;
    var lut = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
    for (var v = 0; v < 256; v++) {
      lut[0][v] = clamp255((v - 128) * f + 128 + b + tr);
      lut[1][v] = clamp255((v - 128) * f + 128 + b);
      lut[2][v] = clamp255((v - 128) * f + 128 + b + tb);
    }
    return lut;
  }

  /* 可分离盒式模糊的一趟（水平或垂直）。越界那侧用边缘值补 —— 和超分分块时的
     边缘复制是同一条规矩：接缝处不能引入本来不存在的暗边。 */
  function boxPass(px, tmp, w, h, r, horizontal) {
    var div = r + r + 1;
    var outer = horizontal ? h : w;
    var inner = horizontal ? w : h;
    for (var o = 0; o < outer; o++) {
      for (var c = 0; c < 4; c++) {
        var sum = 0, k;
        for (k = -r; k <= r; k++) {
          var i0 = k < 0 ? 0 : (k > inner - 1 ? inner - 1 : k);
          sum += px[(horizontal ? o * w + i0 : i0 * w + o) * 4 + c];
        }
        for (var i = 0; i < inner; i++) {
          tmp[(horizontal ? o * w + i : i * w + o) * 4 + c] = sum / div;
          var ai = i + r + 1; if (ai > inner - 1) ai = inner - 1;
          var ri = i - r;     if (ri < 0) ri = 0;
          sum += px[(horizontal ? o * w + ai : ai * w + o) * 4 + c] -
                 px[(horizontal ? o * w + ri : ri * w + o) * 4 + c];
        }
      }
    }
    for (var n = 0; n < px.length; n++) px[n] = tmp[n];
  }

  function blurRGBA(px, w, h, radius) {
    var r = Math.round(radius);
    if (r < 1) return px;
    var tmp = new Uint8ClampedArray(px.length);
    boxPass(px, tmp, w, h, r, true);
    boxPass(px, tmp, w, h, r, false);
    return px;
  }

  /* 3×3 反锐化：center = 1 + 4a，四邻 = -a。a = 0 时是恒等。 */
  function sharpenRGBA(px, w, h, amount) {
    var a = amount;
    if (a <= 0) return px;
    var src = new Uint8ClampedArray(px);
    var y0 = 1 + 4 * a, n0 = -a;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
        for (var c = 0; c < 3; c++) {
          var v = src[i + c] * y0 +
            (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c]) * n0;
          px[i + c] = v;
        }
      }
    }
    return px;
  }

  function vignetteRGBA(px, w, h, amount) {
    var a = amount;
    if (a <= 0) return px;
    var cx = w / 2, cy = h / 2;
    var maxR = Math.sqrt(cx * cx + cy * cy) || 1;
    for (var y = 0; y < h; y++) {
      var dy = y - cy;
      for (var x = 0; x < w; x++) {
        var dx = x - cx;
        var d = Math.sqrt(dx * dx + dy * dy) / maxR;
        var f = 1 - a * d * d;
        if (f >= 1) continue;
        var i = (y * w + x) * 4;
        px[i] *= f; px[i + 1] *= f; px[i + 2] *= f;
      }
    }
    return px;
  }

  /* 完整的调整链。a 的字段：
       brightness / contrast / saturation / temp  −100..100
       blur / sharpen / vignette                    0..100
       sepia                                         0..100
       invert                                        boolean
     原样传进来即可，缺的字段按中性处理 —— 不会因为少写一个键就 NaN 一整张图。 */
  function adjustRGBA(px, w, h, a) {
    a = a || {};
    var o = {
      brightness: a.brightness || 0, contrast: a.contrast || 0,
      saturation: a.saturation || 0, temp: a.temp || 0,
      blur: a.blur || 0, sharpen: a.sharpen || 0, vignette: a.vignette || 0,
      sepia: a.sepia || 0, invert: !!a.invert
    };
    var lut = buildLUT(o);
    var sat = 1 + o.saturation / 100;
    var sep = o.sepia / 100;
    var inv = o.invert;

    for (var i = 0; i < px.length; i += 4) {
      var r = lut[0][px[i]], g = lut[1][px[i + 1]], b2 = lut[2][px[i + 2]];
      if (sat !== 1) {
        var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b2;
        r = lum + (r - lum) * sat;
        g = lum + (g - lum) * sat;
        b2 = lum + (b2 - lum) * sat;
      }
      if (sep > 0) {
        var sr = 0.393 * r + 0.769 * g + 0.189 * b2;
        var sg = 0.349 * r + 0.686 * g + 0.168 * b2;
        var sb = 0.272 * r + 0.534 * g + 0.131 * b2;
        r += (sr - r) * sep; g += (sg - g) * sep; b2 += (sb - b2) * sep;
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b2;
      if (inv) { px[i] = 255 - px[i]; px[i + 1] = 255 - px[i + 1]; px[i + 2] = 255 - px[i + 2]; }
    }

    var maxDim = Math.max(w, h);
    if (o.blur > 0) blurRGBA(px, w, h, o.blur / 100 * Math.min(40, maxDim / 8));
    if (o.sharpen > 0) sharpenRGBA(px, w, h, o.sharpen / 100);
    if (o.vignette > 0) vignetteRGBA(px, w, h, o.vignette / 100);
    return px;
  }

  /* ======================================================================
     6. 调色板量化（median cut）—— Squoosh 的 Reduce palette 同款能力

     把图片压到 maxColors 色以内，主要收益在 PNG：扁平插画、截图、线稿这类图，
     PNG 的无损压缩对渐近色仍然逐个像素记账，砍到 256 色后体积常能腰斩。

     为什么先聚到 5bit 直方图再切：照片有上百万个不同颜色，直接对精确颜色做
     中位切分，箱子表和排序都撑不住。5bit/通道共 32768 桶，先合并桶内颜色，
     切分在桶上进行 —— 最大颜色偏差 ±4/255，肉眼不可见，复杂度从 O(颜色数)
     降到 O(32768)。

     alpha 一个字节都不动：透明形状是抠图 / 图标类图片的命门，量化只该动
     颜色、不该动透明度。原地改 px 并返回它，与本节其他函数一致。
     ====================================================================== */
  function quantizeRGBA(px, w, h, maxColors) {
    var n = Math.floor(maxColors);
    if (!(n >= 1)) n = 256;
    if (n > 256) n = 256;
    var len = w * h;
    if (!len || !px || px.length < len * 4) return px;

    var BINS = 32768;                    // 5bit × 3 通道
    var cnt = new Uint32Array(BINS);
    var sr = new Float64Array(BINS), sg = new Float64Array(BINS), sb = new Float64Array(BINS);
    var used = [];
    for (var i = 0; i < len; i++) {
      var o = i * 4;
      var key = ((px[o] >> 3) << 10) | ((px[o + 1] >> 3) << 5) | (px[o + 2] >> 3);
      if (cnt[key] === 0) used.push(key);
      cnt[key]++;
      sr[key] += px[o]; sg[key] += px[o + 1]; sb[key] += px[o + 2];
    }
    if (!used.length) return px;

    /* 箱子用通道区间表示，比维护成员列表省内存；切分时按最长轴排序成员。 */
    var box = { r0: 31, r1: 0, g0: 31, g1: 0, b0: 31, b1: 0, keys: used, count: len };
    for (var u = 0; u < used.length; u++) {
      var k = used[u];
      var kr = (k >> 10) & 31, kg = (k >> 5) & 31, kb = k & 31;
      if (kr < box.r0) box.r0 = kr; if (kr > box.r1) box.r1 = kr;
      if (kg < box.g0) box.g0 = kg; if (kg > box.g1) box.g1 = kg;
      if (kb < box.b0) box.b0 = kb; if (kb > box.b1) box.b1 = kb;
    }
    var boxes = [box];

    /* 每次把像素最多的箱子沿最长轴对半切 —— 经典 median cut。只有 1 个成员的
       箱子没得切，跳过；凑不齐 n 个箱子就停（图片本身就没那么多颜色）。 */
    while (boxes.length < n) {
      var bi = -1, best = 0;
      for (var bi2 = 0; bi2 < boxes.length; bi2++) {
        var bx = boxes[bi2];
        if (bx.keys.length < 2) continue;
        if (bx.count > best) { best = bx.count; bi = bi2; }
      }
      if (bi < 0) break;
      var b = boxes[bi];
      var dr = b.r1 - b.r0, dg = b.g1 - b.g0, db = b.b1 - b.b0;
      var axis = dr >= dg && dr >= db ? "r" : (dg >= db ? "g" : "b");
      var sh = axis === "r" ? 10 : (axis === "g" ? 5 : 0);
      b.keys.sort(function (x, y) { return ((x >> sh) & 31) - ((y >> sh) & 31); });
      var half = b.count / 2, acc = 0, cut = 0;
      for (var ki = 0; ki < b.keys.length - 1; ki++) {
        acc += cnt[b.keys[ki]];
        cut = ki + 1;
        if (acc >= half) break;
      }
      var lk = b.keys.slice(0, cut), rk = b.keys.slice(cut);
      var lb = { keys: lk }, rb = { keys: rk };
      [lb, rb].forEach(function (nb) {
        nb.count = 0;
        nb.r0 = nb.g0 = nb.b0 = 31; nb.r1 = nb.g1 = nb.b1 = 0;
        for (var q = 0; q < nb.keys.length; q++) {
          var key = nb.keys[q];
          nb.count += cnt[key];
          var r2 = (key >> 10) & 31, g2 = (key >> 5) & 31, b2 = key & 31;
          if (r2 < nb.r0) nb.r0 = r2; if (r2 > nb.r1) nb.r1 = r2;
          if (g2 < nb.g0) nb.g0 = g2; if (g2 > nb.g1) nb.g1 = g2;
          if (b2 < nb.b0) nb.b0 = b2; if (b2 > nb.b1) nb.b1 = b2;
        }
        boxes.push(nb);
      });
      boxes.splice(bi, 1);
    }

    /* 每个箱子一颗代表色（加权平均），再摊成 32768 项的查找表，主循环一次命中。 */
    var lut = new Uint8Array(BINS * 3);
    for (var bi3 = 0; bi3 < boxes.length; bi3++) {
      var bb = boxes[bi3];
      var R = 0, G = 0, B = 0;
      for (var kj = 0; kj < bb.keys.length; kj++) {
        var key2 = bb.keys[kj], c = cnt[key2];
        R += sr[key2]; G += sg[key2]; B += sb[key2];
      }
      var inv = bb.count ? 1 / bb.count : 0;
      var pr = clamp255(Math.round(R * inv)), pg = clamp255(Math.round(G * inv)), pb = clamp255(Math.round(B * inv));
      for (var kk = 0; kk < bb.keys.length; kk++) {
        var key3 = bb.keys[kk];
        lut[key3 * 3] = pr; lut[key3 * 3 + 1] = pg; lut[key3 * 3 + 2] = pb;
      }
    }

    for (var p = 0; p < len; p++) {
      var po = p * 4;
      var pk = ((px[po] >> 3) << 10) | ((px[po + 1] >> 3) << 5) | (px[po + 2] >> 3);
      px[po] = lut[pk * 3]; px[po + 1] = lut[pk * 3 + 1]; px[po + 2] = lut[pk * 3 + 2];
    }
    return px;
  }

  return {
    version: "1.4.0",
    clamp: clamp, clamp255: clamp255,
    humanSize: humanSize, pad2: pad2, stamp: stamp,

    resize: { ladder: resizeLadder },

    encode: { bmp: encodeBMP },

    zip: { build: buildZip, crc32: crc32 },

    sr: {
      CORE: SR.CORE, MARGIN: SR.MARGIN, CTX: SR.CTX, SCALE: SR.SCALE, MAX_IN: SR.MAX_IN,
      starts: srStarts, tiles: srTiles
    },

    pixels: {
      buildLUT: buildLUT,
      adjust: adjustRGBA,
      blur: blurRGBA,
      sharpen: sharpenRGBA,
      vignette: vignetteRGBA,
      quantize: quantizeRGBA
    }
  };
});
