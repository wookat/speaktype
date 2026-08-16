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
 * ASCII 热词容错：≥6 字符时允许一处替换或漏字（ASR 轻微漏音），
 * 不允许多出字符——复数等合法变体（speaktypes）不能被吸走。
 */
function nearKey(joined: string, key: string): boolean {
  if (joined === key) return true;
  if (key.length < 6) return false;
  if (joined.length === key.length) {
    let diff = 0;
    for (let i = 0; i < key.length; i++) if (joined[i] !== key[i]) diff++;
    return diff === 1;
  }
  if (joined.length === key.length - 1) {
    let i = 0;
    while (i < joined.length && joined[i] === key[i]) i++;
    return joined.slice(i) === key.slice(i + 1);
  }
  return false;
}

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
    let nearEnd = -1;
    for (let j = i; j < tokens.length; j++) {
      const tk = tokens[j];
      if (!tk) break;
      // 相邻 token 之间只允许空格/连字符，不跨标点
      if (j > i && !/^[ -]+$/.test(text.slice(end, tk.start))) break;
      joined += tk.text.toLowerCase();
      end = tk.end;
      if (joined === key) {
        const seg = text.slice(first.start, end);
        if (seg === word) {
          nearEnd = -1;
          break;
        }
        return text.slice(0, first.start) + word + correctAsciiHotword(text.slice(end), word);
      }
      // 容错命中先记下，继续找精确命中（devop + s 拼成整词时以精确为准）
      if (nearEnd < 0 && nearKey(joined, key)) nearEnd = end;
      if (joined.length >= key.length) break;
    }
    if (nearEnd >= 0) {
      const seg = text.slice(first.start, nearEnd);
      if (seg !== word)
        return text.slice(0, first.start) + word + correctAsciiHotword(text.slice(nearEnd), word);
    }
  }
  return text;
}

export function correctHotwords(text: string, hotwords: string[]): string {
  if (!text || !hotwords.length) return text;
  const dict = new Set(hotwords.map((w) => w.trim()));
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
      // 同音词典词互噬保护：输出本身就是另一条词典词时不替换（张京/张静共存）
      if (dict.has(seg)) continue;
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
