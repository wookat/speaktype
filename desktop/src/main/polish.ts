import type { Persona, Settings } from "../shared/types";

const FILLERS = [/嗯+/g, /呃+/g, /那个那个/g, /就是就是/g, /然后然后/g];

/** 没有 LLM 时的本地口语清理：删语气词、压重复、去尾句号 */
export function localCleanup(text: string): string {
  let out = text.trim();
  for (const re of FILLERS) out = out.replace(re, "");
  out = out.replace(/(.{2,10}?)\1{2,}/g, "$1");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out.replace(/[。．.]+$/, "");
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
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
  const cleaned = localCleanup(transcript);
  if (!settings.polishEnabled || !cleaned || !settings.polishBaseUrl || !settings.polishApiKey) {
    return cleaned;
  }

  const base = settings.polishBaseUrl.replace(/\/$/, "");
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
  const hotwords = settings.hotwords.length
    ? `\n用户常用词汇（识别可能写错，按此纠正）：${settings.hotwords.join("、")}`
    : "";
  const prompt = [
    "你是语音输入的文字整理助手。把下面的语音转写整理成可直接使用的文本。",
    "要求：",
    "1. 只输出整理后的正文，不要解释、不要引号、不要 Markdown 代码块。",
    "2. 去掉语气词与口头重复，补齐标点，不要增删事实。",
    `3. 风格要求：${persona.prompt}`,
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
