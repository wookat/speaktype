import { findPersona } from "./personas";
import type { Settings } from "./types";

const ZHIPU_CHAT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const POLISH_MODEL = "glm-4.5-flash";

const FILLERS = [
  /嗯+/g,
  /呃+/g,
  /啊，/g,
  /那个那个/g,
  /就是说/g,
  /然后就是/g,
  /怎么说呢/g,
  /这个这个/g,
];

/** 无 LLM 时的本地口语清理：去填充词、去重复、去句尾句号 */
export function localCleanup(text: string): string {
  let out = text.trim();
  for (const re of FILLERS) out = out.replace(re, "");
  out = out.replace(/(.{2,10}?)\1{2,}/g, "$1"); // 转写抖动导致的重复片段
  out = out.replace(/\s{2,}/g, " ").trim();
  out = out.replace(/[。．.]+$/, "");
  return out;
}

function buildPrompt(settings: Settings, transcript: string, selectionText: string): string {
  const persona = findPersona(settings.personas, settings.personaId);
  const selection = selectionText
    ? `\n\n用户当前选中的文本（如口述是要求修改它，则输出修改后的完整文本）：\n"""${selectionText.slice(0, 2000)}"""`
    : "";
  return [
    "你是语音输入的文本整理器。把下面的语音转写结果整理成可直接发送的文本。",
    "规则：",
    "1. 只输出整理后的正文，不要解释、不要引号、不要 Markdown 代码块。",
    "2. 去掉口头语、重复和自我纠正，保留原意与信息量，不要凭空添加内容。",
    "3. 补齐标点，数字与单位规范化。",
    `4. 风格要求：${persona.prompt}`,
    selection,
    `\n语音转写结果：\n"""${transcript}"""`,
  ].join("\n");
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * AI 润色。有智谱 key 时直连，否则走中转；两者都没有就退化为本地清理。
 */
export async function polishText(
  settings: Settings,
  transcript: string,
  selectionText: string,
): Promise<string> {
  const cleaned = localCleanup(transcript);
  if (!settings.polish || !cleaned) return cleaned;

  const direct = Boolean(settings.zhipuApiKey);
  if (!direct && !settings.proxyUrl) return cleaned;

  const url = direct ? ZHIPU_CHAT : `${settings.proxyUrl.replace(/\/$/, "")}/polish`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(direct ? { Authorization: `Bearer ${settings.zhipuApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: POLISH_MODEL,
        temperature: 0.3,
        messages: [{ role: "user", content: buildPrompt(settings, cleaned, selectionText) }],
      }),
    });
    if (!res.ok) return cleaned;
    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ? content.replace(/^["「『]|["」』]$/g, "") : cleaned;
  } catch {
    return cleaned;
  }
}
