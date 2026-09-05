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

const KANA_HANGUL_RE = /[\u3040-\u30ff\u31f0-\u31ff\u1100-\u11ff\uac00-\ud7af]/;

/** 「强制简体」是否对当前识别语言有意义：只有中文/粤语或自动检测时才可能出繁体中文 */
export function simplifyApplies(language: string): boolean {
  return language === "zh" || language === "yue" || language === "auto" || !language;
}

/**
 * whisper 本地通道的繁→简：日文汉字与繁体中文共用大量码位（東/園/図…），t2cn 全表会把日文改成简体中文，
 * 所以只在识别语言为中文/粤语时转换；自动检测下含假名/谚文的文本视为非中文不转。
 */
export function simplifyWhisperOutput(text: string, language: string, enabled: boolean): string {
  if (!enabled || !simplifyApplies(language)) return text;
  if ((language === "auto" || !language) && KANA_HANGUL_RE.test(text)) return text;
  return toSimplified(text);
}
