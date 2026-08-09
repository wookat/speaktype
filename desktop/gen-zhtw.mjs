import * as OpenCC from "opencc-js";
import { readFileSync, writeFileSync } from "fs";
const conv = OpenCC.Converter({ from: "cn", to: "twp" });
const src = readFileSync("src/shared/locales/zh-CN.ts", "utf8");
const m = src.match(/export const zhCN = \{([\s\S]*?)\n\};/);
const dict = eval("({" + m[1] + "})");
let out = 'import type { LocaleDict } from "./zh-CN";\n\n// 由 zh-CN 经 OpenCC (cn→twp) 生成，欢迎母语者润校\nexport const zhTW: LocaleDict = {\n';
for (const [k, v] of Object.entries(dict)) {
  out += "  " + JSON.stringify(k) + ": " + JSON.stringify(conv(v)) + ",\n";
}
out += "};\n";
writeFileSync("src/shared/locales/zh-TW.ts", out);
console.log("keys:", Object.keys(dict).length);
