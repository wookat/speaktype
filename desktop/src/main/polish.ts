import log from "electron-log/main.js";
import type { Persona, Settings } from "../shared/types";
import { httpErrorDetail } from "./asr";
import { correctHotwords } from "./hotwords";
import { applyItn } from "./itn";
import { t } from "./i18n";
import { punctuate } from "./punct";

const FILLERS = [/嗯+/g, /呃+/g, /那个那个/g, /就是就是/g, /然后然后/g];

// 自我纠正：“A，不对／说错了／口误，(是/应该是/改成)B”只保留 B；只处理逗号分隔的保守模式
const SELF_CORRECTION =
  /([^，。！？,.!?]{1,15})[，,]\s*(?:不对|说错了|口误|我是说)[，,]?\s*(?:是|应该是|改成)?/g;

// 断句：这些连接词在口语里通常开启新分句，前面补标点（长词优先匹配）
const BREAK_WORDS = [
  "也就是说",
  "也就是說",
  "换句话说",
  "換句話說",
  "举个例子",
  "舉個例子",
  "就是说",
  "就是說",
  "比如说",
  "比如說",
  "要不然",
  "然后",
  "然後",
  "但是",
  "不过",
  "不過",
  "所以",
  "因为",
  "因為",
  "如果",
  "还有",
  "還有",
  "另外",
  "其次",
  "最后",
  "首先",
  "或者",
  "其实",
  "其實",
  "而且",
  "接着",
  "接著",
  "总之",
];
const BREAK_RE = new RegExp(`(?<![，。！？；、,.!?;\\s])(${BREAK_WORDS.join("|")})`, "g");
const CJK_RE = /[\u4e00-\u9fff]/;
const KANA_RE = /[\u3040-\u30ff]/;
const HANGUL_RE = /[\uac00-\ud7af]/;
// 高频繁体专用字（与简体写法不同）：用于判定文本是否主体为繁体
const TRAD_CJK_RE =
  /[們個這裡裏來會對時點說話語讓請問開關門間見聽讀寫學國後沒麼樣過還進遠運動場報記訊計認識論證談謝錢銀錯鐘長陽陰隊際離難電頭題額願風飛餐飯館馬驗體鳥齊龍龜歲歷壓廠廣應廳張彈從復戰執擔據擇擊舉舊藝藥處號虛為與於業書買賣費資質購貴賽億萬兩傳價優備條務勞勢區醫華單預頁順須頂項發變邊達選連週遲經給結續總組線編練繫較輸轉車軍輕輯]/g;
// 日文句末形（です/ます系）后接非接续助词时补句号：ので/が等连接形不断
const JA_SENTENCE_END_RE =
  /(ました|ません|でした|でしょう|ください|ます|です)(?![。！？])(?![のがかしとねよにでをはもて])/g;
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
  // 日文（含假名）：中文连接词断句不适用，只保守地在句末形后补句号
  if (KANA_RE.test(text)) return text.replace(JA_SENTENCE_END_RE, "$1。").replace(/^[，。]/, "");
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
 * rulePunct=false 时跳过规则断句（由调用方用标点模型补，见 applyModelPunctuation）。
 */
export function localCleanup(
  text: string,
  selfCorrect = true,
  rulePunct = true,
  keepCjkPeriod = false,
): string {
  let out = text.trim();
  for (const re of FILLERS) out = out.replace(re, "");
  if (selfCorrect) out = out.replace(SELF_CORRECTION, "");
  out = out.replace(/(.{2,10}?)\1{2,}/g, "$1");
  out = out.replace(/\s{2,}/g, " ").trim();
  // 上游 ASR 的 ITN 把 "costs eleven dollars" 重写成 "costs$11"：单词紧跟 $数字 之间补空格
  out = out.replace(/([A-Za-z])\$(\d)/g, "$1 $$$2");
  // 上游 ITN 把 "three thirty pm" 拆成 "3 30 pm" 或 "3.30 pm"：小时+两位分钟紧跟 am/pm 时归一成冒号时刻
  out = out.replace(/\b(\d{1,2})[ .]([0-5]\d) ?([ap]\.?m\.?)(?![\w.])/gi, "$1:$2 $3");
  if (selfCorrect && rulePunct) out = addLocalPunctuation(out);
  // 去尾句号是中文单次语音输入习惯；免按连续听写需保留，否则多句无分隔连成一片不可读；
  // 英文句尾句号一律保留，否则和 addEnglishPunctuation 互搏
  if (!keepCjkPeriod) return CJK_RE.test(out) ? out.replace(/[。．.]+$/, "") : out;
  // 免按多句连投：规则断句路径段尾也补句号，与模型路径风格一致
  return selfCorrect && rulePunct ? endCjkPeriod(out) : out;
}

/** 免按连续听写的段尾补句号：中文（非假名语境）段尾是汉字时补「。」，多段落字才有分隔 */
function endCjkPeriod(text: string): string {
  return /[\u4e00-\u9fff]$/.test(text) && !KANA_RE.test(text) ? text + "。" : text;
}

/** 与 addLocalPunctuation/addEnglishPunctuation 同口径的介入门槛：文本几乎没标点才补 */
function needsPunctuation(text: string): boolean {
  if (!CJK_RE.test(text)) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 6) return false;
    // 逗号/分号也算已有标点（parakeet 输出自带完整标点），数字内的 "35,000"/"3.5" 不算。
    // 模型重打会拆坏金额/缩写（$35,000→$ 35, 000），已带标点的文本宁可少补也不重打：标点极稀才介入
    const punct = (text.match(/[,.!?;:](?!\d)/g) ?? []).length;
    return punct <= Math.max(1, words.length / 40);
  }
  if (text.length < 16) return false;
  const punctCount = (text.match(/[，。！？；,.!?;]/g) ?? []).length;
  return punctCount <= text.length / 25;
}

/** 模型覆盖范围门：含 Hangul，或繁体特征字 ≥2 个且占 CJK 字符 ≥10% */
function skipsPunctModel(text: string): boolean {
  if (HANGUL_RE.test(text)) return true;
  const trad = text.match(TRAD_CJK_RE)?.length ?? 0;
  if (trad < 2) return false;
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return trad >= cjk / 10;
}

/** 标点模型对英文也出全角标点且不大写：转半角、补标点后空格、句首大写 */
function toEnglishPunct(text: string): string {
  let out = text
    .replace(/，/g, ",")
    .replace(/[。．]/g, ".")
    .replace(/？/g, "?")
    .replace(/！/g, "!")
    .replace(/；/g, ";")
    .replace(/、/g, ",")
    .replace(/：/g, ":");
  out = out.replace(/\s+([,.?!;:])/g, "$1").replace(/([,.?!;:])(?=[A-Za-z])/g, "$1 ");
  // 原文句尾已有标点时模型会再补一个（"tonight.."、"great,."）：逗号后紧跟终止标点时终止标点优先，连续终止标点只留第一个
  out = out.replace(/[,;:]+(?=[.?!])/g, "").replace(/([.?!])[.?!,;:]+/g, "$1");
  out = out.replace(/(^|[.?!]\s+)([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase());
  return out.trim();
}

/**
 * 模型分词会把金额/千分位/时间拆开（$35,000 → $ 35, 000、3:30 → 3: 30）：
 * 把输入中原样存在的数字串在模型输出里复原，不碰模型新增的句间标点。
 */
function restoreNumericTokens(input: string, out: string): string {
  const tokens = input.match(/[$€£¥]?\d[\d,.:]*\d%?|[$€£¥]\d%?/g) ?? [];
  let fixed = out;
  for (const tok of new Set(tokens)) {
    const pattern = tok
      .split("")
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s*");
    fixed = fixed.replace(new RegExp(pattern, "g"), tok.replace(/\$/g, "$$$$"));
  }
  return fixed;
}

/**
 * 增强标点：用 ct-transformer 模型补标点，未下载/加载失败时回退规则断句。
 * 输入应是 localCleanup(text, true, false) 后的文本（已清理、未补标点）。
 */
export async function applyModelPunctuation(text: string, keepCjkPeriod = false): Promise<string> {
  // 门槛下的短文本不送模型，但免按连投时段尾仍需句号，与规则断句路径口径一致
  if (!needsPunctuation(text)) return keepCjkPeriod ? endCjkPeriod(text) : text;
  // punct-ct 只覆盖简体中文与英文：韩文会被按字符重拼吞掉词间空格，繁体高占比文本会被词内插逗号破坏语义，都直接走规则断句
  const modeled = skipsPunctModel(text) ? null : await punctuate(text);
  // 模型不可用或对该语言无产出（punct-ct 只覆盖中英，日文等输入原样返回）：回退规则断句
  if (modeled === null || needsPunctuation(modeled)) {
    const out = addLocalPunctuation(text);
    if (!keepCjkPeriod) return CJK_RE.test(out) ? out.replace(/[。．.]+$/, "") : out;
    return endCjkPeriod(out);
  }
  if (!CJK_RE.test(modeled)) return restoreNumericTokens(text, toEnglishPunct(modeled));
  const merged = restoreNumericTokens(text, modeled)
    .replace(/[，、；：]+(?=[。！？])/g, "")
    .replace(/([。！？])[。！？，、；：]+/g, "$1")
    .replace(/^[，。]/, "");
  return keepCjkPeriod ? merged : merged.replace(/[。．.]+$/, "");
}

/** 终端目标降格式：去尾部终止标点、还原句首自动大写。驼峰专名（首词后续仍含大写，如 SpeakType）不动 */
export function deformatForTerminal(text: string): string {
  const out = text.replace(/[。．.!?！？]+\s*$/, "").trimEnd();
  const first = out.match(/^[A-Za-z][A-Za-z0-9'’-]*/)?.[0];
  if (!first || !/^[A-Z][a-z]/.test(first) || /[A-Z]/.test(first.slice(1))) return out;
  return first[0]!.toLowerCase() + out.slice(1);
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** 小模型偶发无视“只输出正文”约束：剥掉常见寒暄前缀与首尾引号，只在剥后仍有正文时生效 */
export function stripLlmWrapper(content: string): string {
  const unquoted = content.replace(/^["“]|["”]$/g, "");
  const stripped = unquoted.replace(
    /^(?:(?:sure|okay|ok)[,!.]?\s+)?(?:here(?:'s| is)\b[^:\n。]{0,60}|(?:好的[，,]?)?(?:以下是|这是|润色后(?:的文本|的正文)?|改写后(?:的文本|的正文)?)[^：:\n]{0,20})[：:]\s*/i,
    "",
  );
  return stripped.trim() ? stripped.replace(/^["“]|["”]$/g, "").trim() : unquoted;
}

function chatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

/** 端点挂死/网络黑洞时不能无限等：超时后走失败分支（保留选区/回退本地清理） */
const CHAT_TIMEOUT_MS = 30_000;

/** 本地无鉴权端点（Ollama / LM Studio）可不填 key：仅非空时带 Authorization 头 */
function chatHeaders(settings: Settings): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.polishApiKey) headers["Authorization"] = `Bearer ${settings.polishApiKey}`;
  return headers;
}

/** 设置页“测试连接”：发一条最小请求验证端点/密钥/模型名 */
export async function testPolish(settings: Settings): Promise<{ ok: boolean; detail: string }> {
  if (!settings.polishBaseUrl) return { ok: false, detail: "Base URL" };
  if (!/^https?:\/\//.test(settings.polishBaseUrl)) return { ok: false, detail: t("error.badUrl") };
  try {
    const res = await fetch(chatUrl(settings.polishBaseUrl), {
      method: "POST",
      headers: chatHeaders(settings),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.polishModel || "gpt-4o-mini",
        max_tokens: 4,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (!res.ok) {
      return { ok: false, detail: httpErrorDetail(res.status, await res.text()) };
    }
    return { ok: true, detail: settings.polishModel || "gpt-4o-mini" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 选中文字 + 语音指令改写/翻译：把选区和口述指令交给润色模型，只回改写后的正文。
 * 失败时区分连不上服务（network）、服务报错（http）、非兼容响应（badResponse）、
 * 超时（timeout）与模型空结果（empty），由调用方分别提示。
 */
export type RewriteFailure =
  | { error: "network" | "empty" | "timeout" | "badResponse" }
  | { error: "http"; status: number };

export async function rewriteSelection(
  settings: Settings,
  selection: string,
  instruction: string,
): Promise<string | RewriteFailure> {
  if (!settings.polishBaseUrl) return { error: "empty" };
  // 指令同样来自 ASR，词典专名纠错在改写路径也要生效
  instruction = correctHotwords(instruction, settings.hotwords);
  // prompt 框架跟指令语言走：英文指令用英文模板，小模型对英文指令的遵循度更稳
  const prompt = (
    CJK_RE.test(instruction)
      ? [
          "你按用户的口述指令改写下面这段文字（可能是改写、润色、翻译、扩写、缩写等）。",
          "要求：",
          "1. 只输出改写后的正文，不要解释、不要引号、不要 Markdown 代码块。",
          "2. 严格遵守指令；指令没要求的部分不要擅自改动。",
          "3. 保持原文的换行与列表结构。",
          `\n口述指令：\n"""${instruction}"""`,
          `\n原文：\n"""${selection}"""`,
        ]
      : [
          "Rewrite the text below according to the user's spoken instruction (rewrite, polish, translate, expand, shorten, etc.).",
          "Rules:",
          "1. Output only the rewritten text — no explanations, no quotes, no Markdown code blocks.",
          "2. Follow the instruction strictly; do not change anything it does not ask for.",
          "3. Preserve the original line breaks and list structure.",
          `\nSpoken instruction:\n"""${instruction}"""`,
          `\nOriginal text:\n"""${selection}"""`,
        ]
  ).join("\n");
  try {
    const res = await fetch(chatUrl(settings.polishBaseUrl), {
      method: "POST",
      headers: chatHeaders(settings),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.polishModel || "gpt-4o-mini",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      log.warn(`rewrite: endpoint returned HTTP ${res.status}`);
      return { error: "http", status: res.status };
    }
    let data: ChatResponse;
    try {
      data = (await res.json()) as ChatResponse;
    } catch {
      log.warn("rewrite: endpoint returned non-JSON response");
      return { error: "badResponse" };
    }
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ? stripLlmWrapper(content) : { error: "empty" };
  } catch (error) {
    // 服务挂起 30s 后才失败与立刻连不上是两种排查方向，提示要分开
    log.warn(`rewrite: ${error instanceof Error ? error.message : String(error)}`);
    return { error: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network" };
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
  onLlmFallback?: () => void,
  keepCjkPeriod = false,
): Promise<string> {
  const useLlm = settings.polishEnabled && Boolean(settings.polishBaseUrl);
  let base = localCleanup(transcript, !useLlm, !settings.enhancedPunct, keepCjkPeriod);
  if (!useLlm && settings.enhancedPunct) base = await applyModelPunctuation(base, keepCjkPeriod);
  if (settings.itn) base = applyItn(base);
  const cleaned = correctHotwords(base, settings.hotwords);
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
      headers: chatHeaders(settings),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.polishModel || "gpt-4o-mini",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      onLlmFallback?.();
      return cleaned;
    }
    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ? stripLlmWrapper(content) : cleaned;
  } catch {
    onLlmFallback?.();
    return cleaned;
  }
}
