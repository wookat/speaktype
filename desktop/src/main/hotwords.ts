import { pinyin } from "pinyin-pro";

/**
 * 词典热词本地纠错：把转写里与热词同音/近音的片段替换成热词本身。
 * 近音按普通话常见混淆归并：平翘舌（z/zh、c/ch、s/sh）、n/l/r、f/h、前后鼻音（in/ing、an/ang、en/eng、ian/iang、uan/uang）。
 * 只处理两字及以上的纯中文热词，避免单字误替换。
 */
const CJK = /^[\u4e00-\u9fff]+$/;

function normalize(syllable: string): string {
  return syllable
    .replace(/^zh/, "z")
    .replace(/^ch/, "c")
    .replace(/^sh/, "s")
    .replace(/^r/, "l")
    .replace(/^l/, "n")
    .replace(/^h/, "f")
    .replace(/ing$/, "in")
    .replace(/iang$/, "ian")
    .replace(/uang$/, "uan")
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

/** 英文/数字热词（可含空格或连字符），如 "SpeakType"、"GPT-4" */
const ASCII_WORD = /^[A-Za-z][A-Za-z0-9]*(?:[ -][A-Za-z0-9]+)*$/;

/**
 * 英文热词：大小写与空格/连字符不敏感的整词替换。
 * "speak type"/"speaktype"/"Speaktype" → "SpeakType"。只处理去分隔后 ≥4 字符的词，避免短词误替换。
 */
function correctAsciiHotword(text: string, word: string): string {
  const key = word.replace(/[ -]/g, "").toLowerCase();
  if (key.length < 4) return text;
  const tokens = [...text.matchAll(/[A-Za-z0-9]+/g)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    text: m[0],
  }));
  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i];
    if (!first) break;
    let joined = "";
    let end = first.start;
    for (let j = i; j < tokens.length && joined.length < key.length; j++) {
      const tk = tokens[j];
      if (!tk) break;
      // 相邻 token 之间只允许空格/连字符，不跨标点
      if (j > i && !/^[ -]+$/.test(text.slice(end, tk.start))) break;
      joined += tk.text.toLowerCase();
      end = tk.end;
      if (joined === key) {
        const seg = text.slice(first.start, end);
        if (seg === word) break;
        return text.slice(0, first.start) + word + correctAsciiHotword(text.slice(end), word);
      }
    }
  }
  return text;
}

export function correctHotwords(text: string, hotwords: string[]): string {
  if (!text || !hotwords.length) return text;
  let out = text;
  for (const word of hotwords) {
    const trimmed = word.trim();
    if (ASCII_WORD.test(trimmed)) {
      out = correctAsciiHotword(out, trimmed);
      continue;
    }
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
