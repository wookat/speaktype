import type { Persona } from "./types";

/**
 * 内置人格。措辞参考主流语音输入产品的「场景化改写」思路：
 * 先转写，再按目标读者/场景重写，而不是简单纠错。
 */
export const BUILTIN_PERSONAS: Persona[] = [
  {
    id: "default",
    name: "默认",
    icon: "✨",
    prompt: "让文本保持自然、清晰、口语化的语气，同时更精炼易读，去掉句尾的句号。",
  },
  {
    id: "boss",
    name: "汇报老板",
    icon: "📈",
    prompt: "用专业、稳重、结果导向的方式表述，突出结论、风险与下一步计划；语气委婉得体，不要命令口吻。",
  },
  {
    id: "coworker",
    name: "同事沟通",
    icon: "🤝",
    prompt: "保持友好又专业，强调协作与清晰沟通，避免居高临下。",
  },
  {
    id: "partner",
    name: "亲密对话",
    icon: "💗",
    prompt: "语气温柔、体贴，表达理解与关心，避免生硬或命令式说法。",
  },
  {
    id: "translator",
    name: "中英互译",
    icon: "🌏",
    prompt: "若文本为中文，翻译成自然流畅的英文；若已是英文则仅做清理，不改变语言。专有名词保持原样。",
  },
  {
    id: "coding",
    name: "写代码",
    icon: "💻",
    prompt: "保持技术准确性和语义，清理口头语，保留代码讨论的上下文与疑问句式，代码标识符保持原样。",
  },
  {
    id: "prompt",
    name: "写提示词",
    icon: "🧠",
    prompt: "把口述内容整理成结构清晰、指令明确的提示词：先目标，再约束，再输出要求，去掉寒暄与口头语。",
  },
];

export function findPersona(personas: Persona[], id: string): Persona {
  return personas.find((p) => p.id === id) ?? personas[0] ?? BUILTIN_PERSONAS[0]!;
}
