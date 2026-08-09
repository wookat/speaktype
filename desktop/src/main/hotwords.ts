import { pinyin } from "pinyin-pro";

/**
 * 词典热词本地纠错：把转写里与热词同音/近音的片段替换成热词本身。
 * 近音按普通话常见混淆归并：平翘舌（z/zh、c/ch、s/sh）、n/l、f/h、前后鼻音（in/ing、an/ang、en/eng）。
 * 只处理两字及以上的纯中文热词，避免单字误替换。
 */
const CJK = /^[\u4e00-\u9fff]+$/;

function normalize(syllable: string): string {
  return syllable
    .replace(/^zh/, "z")
    .replace(/^ch/, "c")
    .replace(/^sh/, "s")
    .replace(/^l/, "n")
    .replace(/^h/, "f")
    .replace(/ing$/, "in")
    .replace(/ang$/, "an")
    .replace(/eng$/, "en");
}

function readings(text: string): string[][] {
  const chars = Array.from(text);
  return chars.map((ch) => {
    const multi = pinyin(ch, { toneType: "none", multiple: true, type: "array" });
    return [...new Set(multi.map(normalize))];
  });
}

function matches(segReadings: string[][], wordReadings: string[][]): boolean {
  return wordReadings.every((wr, i) => segReadings[i]?.some((sr) => wr.includes(sr)));
}

export function correctHotwords(text: string, hotwords: string[]): string {
  if (!text || !hotwords.length) return text;
  let out = text;
  for (const word of hotwords) {
    const trimmed = word.trim();
    if (trimmed.length < 2 || !CJK.test(trimmed) || out.includes(trimmed)) continue;
    const wordReadings = readings(trimmed);
    const n = trimmed.length;
    const chars = Array.from(out);
    let changed = false;
    for (let i = 0; i + n <= chars.length; i++) {
      const seg = chars.slice(i, i + n).join("");
      if (seg === trimmed || !CJK.test(seg)) continue;
      if (matches(readings(seg), wordReadings)) {
        chars.splice(i, n, ...Array.from(trimmed));
        changed = true;
        i += n - 1;
      }
    }
    if (changed) out = chars.join("");
  }
  return out;
}
