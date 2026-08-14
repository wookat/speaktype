import type { Persona, Settings } from "../shared/types";
import { correctHotwords } from "./hotwords";
import { t } from "./i18n";

const FILLERS = [/嗯+/g, /呃+/g, /那个那个/g, /就是就是/g, /然后然后/g];

// 自我纠正：“A，不对／说错了／口误，(是/应该是/改成)B”只保留 B；只处理逗号分隔的保守模式
const SELF_CORRECTION =
  /([^，。！？,.!?]{1,15})[，,]\s*(?:不对|说错了|口误|我是说)[，,]?\s*(?:是|应该是|改成)?/g;

// 断句：这些连接词在口语里通常开启新分句，前面补标点（长词优先匹配）
const BREAK_WORDS = [
  "也就是说",
  "换句话说",
  "举个例子",
  "就是说",
  "比如说",
  "要不然",
  "然后",
  "但是",
  "不过",
  "所以",
  "因为",
  "如果",
  "还有",
  "另外",
  "其次",
  "最后",
  "首先",
  "或者",
  "其实",
  "而且",
  "接着",
  "总之",
];
const BREAK_RE = new RegExp(`(?<![，。！？；、,.!?;\\s])(${BREAK_WORDS.join("|")})`, "g");
const CJK_RE = /[\u4e00-\u9fff]/;
// 相邻两个标点之间超过这么多字就把逗号升级成句号，避免一逗到底
const SENTENCE_SPAN = 30;

// 英文断句：这些连接词在口语里通常开启新分句（SenseVoice 对英文基本不出句读）
const EN_BREAK_WORDS = ["but", "so", "because", "however", "then", "also", "otherwise", "meanwhile", "anyway"];
const EN_BREAK_SET = new Set(EN_BREAK_WORDS);
// 距上个标点超过这么多词就在连接词处补句号，否则补逗号
const EN_SENTENCE_WORDS = 12;
// 疑问句起始词：整句以它开头时句尾给 "?" 而不是 "."
const EN_QUESTION_SET = new Set([
  "can", "could", "would", "will", "should", "shall",
  "do", "does", "did", "is", "are", "was", "were",
  "what", "when", "where", "who", "why", "how", "which",
]);
// "I" 后面跟这些助动/常用动词时按新句句首处理（"…, I will…" 是极高频句界）
const EN_I_AUX_SET = new Set([
  "will", "would", "can", "could", "am", "was", "have", "had",
  "should", "shall", "did", "do", "think", "need", "want", "hope",
]);

// 前一词是连接词/介词/冠词/所有格时，后面的大写词几乎必然是句中专有名词或从句延续，不能断句
const EN_NO_BREAK_AFTER = new Set([
  "and", "but", "or", "so", "because", "that", "if", "when", "while", "as", "than",
  "to", "for", "with", "at", "in", "on", "of", "by", "from", "about", "into", "over",
  "the", "a", "an", "my", "your", "his", "her", "its", "our", "their",
]);

// 能当句首信号的常见大写起句词：开放词表的人名/专名（Peter、Alice…）永远枚举不完，
// 改用白名单：只有这些闭集起句词才允许触发断句
const EN_STARTER_SET = new Set([
  "we", "he", "she", "they", "it", "you",
  "this", "that", "these", "those", "there", "the",
  "let", "please", "now", "then", "also", "however", "meanwhile", "anyway",
  "today", "tomorrow", "yesterday",
  "what", "when", "where", "who", "why", "how", "which",
  "can", "could", "would", "will", "should", "do", "does", "did", "is", "are",
]);

/** 英文兜底断句：几乎无标点时按连接词补逗号/句号，并补首字母大写与句尾句号/问号 */
function addEnglishPunctuation(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 6) return text;
  // 只统计句末标点：ASR 常拿逗号占位句界，不能因逗号多就整体放弃
  const endPunct = (text.match(/[.!?]/g) ?? []).length;
  if (endPunct > words.length / 10) return text;
  const out: string[] = [];
  let sincePunct = 0;
  let capitalizeNext = true;
  let sentenceStart = 0;
  const closeSentence = (): void => {
    const first = out[sentenceStart]?.toLowerCase().replace(/[^a-z']/g, "") ?? "";
    const mark = EN_QUESTION_SET.has(first) ? "?" : ".";
    out[out.length - 1] = out[out.length - 1]!.replace(/[,;]$/, "") + mark;
    sentenceStart = out.length;
    sincePunct = 0;
    capitalizeNext = true;
  };
  for (let i = 0; i < words.length; i++) {
    let word = words[i]!;
    // ASR 保留的句首大写是句界信号，但人名等专名也大写：只认闭集起句词
    const isCapitalStarter =
      (/^[A-Z][a-z]/.test(word) && EN_STARTER_SET.has(word.toLowerCase())) ||
      (word === "I" && EN_I_AUX_SET.has((words[i + 1] ?? "").toLowerCase()));
    if (i > 0 && isCapitalStarter) {
      const prev = out[out.length - 1]!;
      const prevWord = prev.toLowerCase().replace(/[^a-z']/g, "");
      // "day and I am" / "invite to Alice"：连接词/介词后的大写词不是句首
      const noBreak = EN_NO_BREAK_AFTER.has(prevWord) && !/[,;]$/.test(prev);
      // 逗号升级句号要求前面从句够长，避免把 "yesterday, John…" 这类前置短语拆散
      if (
        !noBreak &&
        ((/[,;]$/.test(prev) && out.length - sentenceStart >= 4) ||
          (sincePunct >= 3 && !/[.!?,;]$/.test(prev)))
      ) {
        closeSentence();
      }
    }
    if (i > 0 && sincePunct >= 3 && EN_BREAK_SET.has(word.toLowerCase())) {
      const prev = out[out.length - 1]!;
      if (!/[.!?,;]$/.test(prev)) {
        if (sincePunct >= EN_SENTENCE_WORDS) {
          closeSentence();
        } else {
          out[out.length - 1] = `${prev},`;
          sincePunct = 0;
        }
      }
    }
    if (capitalizeNext && /^[a-z]/.test(word)) word = word[0]!.toUpperCase() + word.slice(1);
    capitalizeNext = /[.!?]$/.test(word);
    if (/[.!?,;]$/.test(word)) sincePunct = 0;
    else sincePunct++;
    out.push(word);
    if (/[.!?]$/.test(word)) sentenceStart = out.length;
  }
  if (/[a-zA-Z0-9,;]$/.test(out[out.length - 1]!)) closeSentence();
  return out.join(" ");
}

/**
 * 本地断句：流式 ASR（如豆包）常整段无标点，这里按口语连接词保守补逗号/句号。
 * 只在文本几乎没有标点时介入（whisper 等自带标点的通道不受影响）。
 */
export function addLocalPunctuation(text: string): string {
  if (!CJK_RE.test(text)) return addEnglishPunctuation(text);
  if (text.length < 16) return text;
  const punctCount = (text.match(/[，。！？；,.!?;]/g) ?? []).length;
  if (punctCount > text.length / 25) return text;
  let out = text.replace(BREAK_RE, "，$1");
  // 每隔一段距离把逗号升级为句号，形成自然的句子边界
  let sinceStop = 0;
  const chars = Array.from(out);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch === "。" || ch === "！" || ch === "？") sinceStop = 0;
    else if (ch === "，" && sinceStop >= SENTENCE_SPAN) {
      chars[i] = "。";
      sinceStop = 0;
    } else sinceStop++;
  }
  out = chars.join("");
  return out.replace(/^[，。]/, "");
}

/**
 * 本地口语清理：删语气词、自我纠正、压重复、断句补标点、去尾句号。
 * 本地自我纠正是保守的子句替换（会丢前缀语义），润色通道开启时交给 LLM 处理。
 */
export function localCleanup(text: string, selfCorrect = true): string {
  let out = text.trim();
  for (const re of FILLERS) out = out.replace(re, "");
  if (selfCorrect) out = out.replace(SELF_CORRECTION, "");
  out = out.replace(/(.{2,10}?)\1{2,}/g, "$1");
  out = out.replace(/\s{2,}/g, " ").trim();
  if (selfCorrect) out = addLocalPunctuation(out);
  // 去尾句号是中文语音输入习惯；英文句尾句号要保留，否则和 addEnglishPunctuation 互搏
  return CJK_RE.test(out) ? out.replace(/[。．.]+$/, "") : out;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function chatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

/** 设置页“测试连接”：发一条最小请求验证端点/密钥/模型名 */
export async function testPolish(settings: Settings): Promise<{ ok: boolean; detail: string }> {
  if (!settings.polishBaseUrl || !settings.polishApiKey) return { ok: false, detail: "Base URL / API Key" };
  if (!/^https?:\/\//.test(settings.polishBaseUrl)) return { ok: false, detail: t("error.badUrl") };
  try {
    const res = await fetch(chatUrl(settings.polishBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.polishApiKey}`,
      },
      body: JSON.stringify({
        model: settings.polishModel || "gpt-4o-mini",
        max_tokens: 4,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 160);
      return { ok: false, detail: `HTTP ${res.status} ${body}` };
    }
    return { ok: true, detail: settings.polishModel || "gpt-4o-mini" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 选中文字 + 语音指令改写/翻译：把选区和口述指令交给润色模型，只回改写后的正文。
 * 没配润色模型时返回 null，由调用方提示用户去配置。
 */
export async function rewriteSelection(
  settings: Settings,
  selection: string,
  instruction: string,
): Promise<string | null> {
  if (!settings.polishBaseUrl || !settings.polishApiKey) return null;
  const prompt = [
    "你按用户的口述指令改写下面这段文字（可能是改写、润色、翻译、扩写、缩写等）。",
    "要求：",
    "1. 只输出改写后的正文，不要解释、不要引号、不要 Markdown 代码块。",
    "2. 严格遵守指令；指令没要求的部分不要擅自改动。",
    "3. 保持原文的换行与列表结构。",
    `\n口述指令：\n"""${instruction}"""`,
    `\n原文：\n"""${selection}"""`,
  ].join("\n");
  try {
    const res = await fetch(chatUrl(settings.polishBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.polishApiKey}`,
      },
      body: JSON.stringify({
        model: settings.polishModel || "gpt-4o-mini",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ? content.replace(/^["“]|["”]$/g, "") : null;
  } catch {
    return null;
  }
}

/**
 * 人设润色。识别与润色解耦：任何 OpenAI 兼容端点都能接
 * （DeepSeek / Kimi / 通义 / 智谱 / 本地 Ollama），没配就只做本地清理。
 */
export async function polishText(
  settings: Settings,
  persona: Persona,
  transcript: string,
): Promise<string> {
  const useLlm = settings.polishEnabled && Boolean(settings.polishBaseUrl && settings.polishApiKey);
  const cleaned = correctHotwords(localCleanup(transcript, !useLlm), settings.hotwords);
  if (!useLlm || !cleaned) return cleaned;

  const url = chatUrl(settings.polishBaseUrl);
  const hotwords = settings.hotwords.length
    ? `\n用户常用词汇（识别可能写错，按此纠正）：${settings.hotwords.join("、")}`
    : "";
  const prompt = [
    "你是语音输入的文字整理助手。把下面的语音转写整理成可直接使用的文本。",
    "要求：",
    "1. 只输出整理后的正文，不要解释、不要引号、不要 Markdown 代码块。",
    "2. 去掉语气词与口头重复，补齐标点，不要增删事实。",
    "3. 口述中出现自我更正（如“不对”“说错了”“我是说”“改成”、英文 no wait / actually 后接修正）时，只保留修正后的内容。",
    `4. 风格要求：${persona.prompt}`,
    hotwords,
    `\n语音转写原文：\n"""${cleaned}"""`,
  ].join("\n");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.polishApiKey}`,
      },
      body: JSON.stringify({
        model: settings.polishModel || "gpt-4o-mini",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return cleaned;
    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ? content.replace(/^["“]|["”]$/g, "") : cleaned;
  } catch {
    return cleaned;
  }
}
