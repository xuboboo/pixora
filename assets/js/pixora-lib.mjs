/* ESM 入口。真正的实现只有一份，就在同目录的 pixora-lib.js —— 它是 UMD，
   浏览器 <script> 和 Node require 都用那一份。这里只是把它重新导出成具名导出，
   让 `import { pixels } from "pixora"` 直接可用，不必再套 createRequire。

   这个文件是手写的，没有构建步骤。代价是：往内核里加了顶层导出，必须在这里补
   一行，否则 ESM 侧用不到而 CJS 侧正常 —— 那种半身不遂最难发现。
   tools/test-lib.mjs 会断言这里的导出与实现逐项一致，漂移会红。 */
import Pixora from "./pixora-lib.js";

export default Pixora;

export const version = Pixora.version;
export const clamp = Pixora.clamp;
export const clamp255 = Pixora.clamp255;
export const humanSize = Pixora.humanSize;
export const pad2 = Pixora.pad2;
export const stamp = Pixora.stamp;

export const resize = Pixora.resize;
export const encode = Pixora.encode;
export const zip = Pixora.zip;
export const sr = Pixora.sr;
export const pixels = Pixora.pixels;
