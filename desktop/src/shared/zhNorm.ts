import { Converter } from "opencc-js/t2cn";

/**
 * 繁→简字级归一（OpenCC TSCharacters 全表，主进程强制简体与渲染层搜索/词典匹配共用一套口径）。
 * 只做单字映射不做词组转换：搜索两侧同一函数归一后再比对，字数不变才能逐字对齐。
 */
let t2cn: ((text: string) => string) | null = null;

export function toSimplified(text: string): string {
  if (!t2cn) t2cn = Converter({ from: "t", to: "cn" });
  return t2cn(text);
}
