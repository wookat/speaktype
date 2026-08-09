import type { Persona, Settings } from "../shared/types";
import { correctHotwords } from "./hotwords";

const FILLERS = [/嗯+/g, /呃+/g, /那个那个/g, /就是就是/g, /然后然后/g];

// 自我纠正：“A，不对／说错了／口误，(是/应该是/改成)B”只保留 B；只处理逗号分隔的保守模式
const SELF_CORRECTION =
  /([^，。！？,.!?]{1,15})[，,]\s*(?:不对|说错了|口误|我是说)[，,]?\s*(?:是|应该是|改成)?/g;

/**
 * 本地口语清理：删语气词、自我纠正、压重复、去尾句号。
 * 本地自我纠正是保守的子句替换（会丢前缀语义），润色通道开启时交给 LLM 处理。
 */
export function localCleanup(text: string, selfCorrect = true): string {
  let out = text.trim();
  for (const re of FILLERS) out = out.replace(re, "");
  if (selfCorrect) out = out.replace(SELF_CORRECTION, "");
  out = out.replace(/(.{2,10}?)\1{2,}/g, "$1");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out.replace(/[。．.]+$/, "");
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
