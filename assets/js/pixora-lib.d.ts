/**
 * Pixora 图像内核的类型声明。
 * 实现只有一份：./pixora-lib.js（UMD）。这里与之一一对应，改内核请同步改这里。
 * tools/test-lib.mjs 只断言导出一致、不断言类型，所以类型漂移只能靠 review 兜。
 *
 * Blob 的类型来自 lib.dom.d.ts 或 @types/node(>=18)，两者任一即可。
 */

/** 0..100 是这几个效果的量纲；brightness / contrast / saturation / temp 可取 -100..100 */
export interface AdjustOptions {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temp?: number;
  /** 0..100。内核会按图幅换算成像素半径，上限 40 —— 不是直接传像素 */
  blur?: number;
  /** 0..100 */
  sharpen?: number;
  /** 0..100 */
  vignette?: number;
  /** 0..100 */
  sepia?: number;
  invert?: boolean;
}

/** buildLUT 只吃这三项，量纲 -100..100 */
export interface LutOptions {
  brightness: number;
  contrast: number;
  temp: number;
}

/** encode.bmp 的入参。data 是 RGBA，每像素 4 字节（比如 ImageData.data） */
export interface BMPImage {
  w: number;
  h: number;
  data: ArrayLike<number>;
}

export interface LadderStep {
  w: number;
  h: number;
}

export interface ZipEntry {
  name: string;
  data: ArrayLike<number> | ArrayBuffer;
}

export interface SrTiles {
  x: number[];
  y: number[];
  count: number;
}

export interface PixoraApi {
  readonly version: string;

  clamp(v: number, lo: number, hi: number): number;
  clamp255(v: number): number;
  humanSize(n: number): string;
  pad2(n: number): string;
  /** 形如 20261013-220900 */
  stamp(): string;

  resize: {
    /**
     * 降采样中间尺寸阶梯。每级约为上级的一半，缩到接近目标的两倍以内就停。
     * 返回**不含起点也不含终点** —— 终点由调用方指定（通常是最后一次 drawImage）。
     * @param sw 源宽 @param sh 源高 @param target 目标的最长边，如 Math.max(dw, dh)
     */
    ladder(sw: number, sh: number, target: number): LadderStep[];
  };

  encode: {
    /** 24 位 BMP：行底向上、BGR、4 字节行对齐。返回 ArrayBuffer，不是 Blob */
    bmp(img: BMPImage): ArrayBuffer;
  };

  zip: {
    /** 优先 CompressionStream("deflate-raw")，不可用时降级为 store。返回 Promise<Blob> */
    build(entries: ZipEntry[]): Promise<Blob>;
    crc32(bytes: ArrayLike<number>): number;
  };

  /** Real-ESRGAN general x4v3 的分块表。常量由感受野扰动法实测标定，不是拍的 */
  sr: {
    readonly CORE: number;
    readonly MARGIN: number;
    readonly CTX: number;
    readonly SCALE: number;
    /** 输入像素上限，超过应拒绝 */
    readonly MAX_IN: number;
    /** 末块回退对齐而非截断 —— 模型只吃固定边长。core 省略时取 SR.CORE */
    starts(total: number, core?: number): number[];
    tiles(w: number, h: number): SrTiles;
  };

  pixels: {
    /** 返回 [R, G, B] 三条各 256 项的查找表 */
    buildLUT(a: LutOptions): Float32Array[];
    /** 完整调整链：LUT → 饱和度 → sepia → 反色 → 模糊 → 锐化 → 暗角。就地改 px 并返回同一引用 */
    adjust(px: Uint8ClampedArray, w: number, h: number, a?: AdjustOptions): Uint8ClampedArray;
    /** radius 是像素半径，不是百分比。radius < 1 时原样返回 */
    blur(px: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray;
    /** amount 是 0..1，不是百分比（1 是中心权重，-1/4 是四邻）。amount <= 0 时原样返回 */
    sharpen(px: Uint8ClampedArray, w: number, h: number, amount: number): Uint8ClampedArray;
    vignette(px: Uint8ClampedArray, w: number, h: number, amount: number): Uint8ClampedArray;
  };
}

declare const Pixora: PixoraApi;
export default Pixora;

export const version: string;
export const clamp: PixoraApi["clamp"];
export const clamp255: PixoraApi["clamp255"];
export const humanSize: PixoraApi["humanSize"];
export const pad2: PixoraApi["pad2"];
export const stamp: PixoraApi["stamp"];
export const resize: PixoraApi["resize"];
export const encode: PixoraApi["encode"];
export const zip: PixoraApi["zip"];
export const sr: PixoraApi["sr"];
export const pixels: PixoraApi["pixels"];
