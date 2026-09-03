import type { LocaleKey, Translator } from "./i18n";
import type { Persona } from "./types";

/** 内置人设的名称与 prompt 随界面语言本地化，自定义人设保持原样 */
export function localizePersona(persona: Persona, t: Translator): Persona {
  if (!persona.builtin) return persona;
  return {
    ...persona,
    name: t(`persona.${persona.id}.name` as LocaleKey),
    prompt: t(`persona.${persona.id}.prompt` as LocaleKey),
  };
}

/** 历史条目的人设显示名：内置人设随当前界面语言，自建人设与无 id 的旧条目用录入时的名字 */
export function personaDisplayName(personaId: string | undefined, fallback: string, t: Translator): string {
  if (personaId && BUILTIN_PERSONAS.some((p) => p.id === personaId)) {
    return t(`persona.${personaId}.name` as LocaleKey);
  }
  return fallback;
}

/**
 * 内置人设 = 一段后处理 prompt，切换只影响润色阶段，不影响识别。
 * 文案与智谱 AI 输入法的内置人设对齐（Alt+1..9 快速切换）。
 */
export const BUILTIN_PERSONAS: Persona[] = [
  {
    id: "default",
    name: "默认风格",
    icon: "sparkles",
    builtin: true,
    prompt: "让文本保持自然、清晰、口语化的语气，同时更精炼易读，要把句尾的句号去掉。",
  },
  {
    id: "translator",
    name: "自动翻译",
    icon: "languages",
    builtin: true,
    prompt: "如果文本为中文，请翻译成自然流畅的英文；如已是英文则仅做清理，不改变语言。专有名词保持原样。",
  },
  {
    id: "boss",
    name: "面对老板",
    icon: "briefcase",
    builtin: true,
    prompt:
      "用专业、稳重且结果导向的方式表述，突出结论、风险与下一步计划。面对老板的语气要委婉要高情商，不要用命令的口吻。",
  },
  {
    id: "coworker",
    name: "面对同事",
    icon: "users",
    builtin: true,
    prompt: "保持友好又专业，强调协作与清晰沟通，避免居高临下。",
  },
  {
    id: "partner",
    name: "面对伴侣",
    icon: "heart",
    builtin: true,
    prompt: "语气温柔、体贴，表达理解与关心，避免生硬或命令式说法。",
  },
  {
    id: "command-line",
    name: "命令行大神",
    icon: "terminal",
    builtin: true,
    prompt:
      "你是一个精通 Linux、FFmpeg、OpenSSL、Curl 等命令行工具的专家。用户会用自然语言描述需求，你直接输出最简洁、有效的 Command Line 命令，不要解释，直接给代码。",
  },
  {
    id: "vibe-coding",
    name: "语感编程",
    icon: "code",
    builtin: true,
    prompt: "保持技术准确性和语义，清理口头语，保留代码讨论的上下文和疑问句式。",
  },
];
