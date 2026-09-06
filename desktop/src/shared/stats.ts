import type { Stats } from "./types";

export const EMPTY_STATS: Stats = { words: 0, durationMs: 0, sessions: 0, savedMs: 0 };

/** 手打 / 口述速率：CJK 按字/分，其余按词/分 */
const CJK_TYPE_PER_MIN = 60;
const CJK_SPEAK_PER_MIN = 200;
const LATIN_TYPE_PER_MIN = 40;
const LATIN_SPEAK_PER_MIN = 150;

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g;
const LATIN_RE = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

/** 统计口径：CJK 每字计 1 词，拉丁/数字按连续串计 1 词（混排相加），避免英文按字符计虚高 */
export function countWordsByScript(text: string): { cjk: number; latin: number } {
  return {
    cjk: (text.match(CJK_RE) ?? []).length,
    latin: (text.match(LATIN_RE) ?? []).length,
  };
}

export function countWords(text: string): number {
  const { cjk, latin } = countWordsByScript(text);
  return cjk + latin;
}

function savedMsAt(count: number, typePerMin: number, speakPerMin: number): number {
  return count * (1 / typePerMin - 1 / speakPerMin) * 60000;
}

/** 这句话相对手打省下的毫秒数：只看词数速率差，不减实际录音时长（录音含按键空白与停顿，短句会被算成 0） */
export function savedMsFor(text: string): number {
  const { cjk, latin } = countWordsByScript(text);
  return savedMsAt(cjk, CJK_TYPE_PER_MIN, CJK_SPEAK_PER_MIN) + savedMsAt(latin, LATIN_TYPE_PER_MIN, LATIN_SPEAK_PER_MIN);
}

/** 旧版统计没有 savedMs：按累计词数一次性折算，CJK 界面语言按字口径、其余按英文口径 */
export function legacySavedMs(words: number, uiLanguage: string): number {
  return /^(zh|ja|ko)/.test(uiLanguage)
    ? savedMsAt(words, CJK_TYPE_PER_MIN, CJK_SPEAK_PER_MIN)
    : savedMsAt(words, LATIN_TYPE_PER_MIN, LATIN_SPEAK_PER_MIN);
}
