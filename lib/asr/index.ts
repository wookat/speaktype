import type { AsrProviderId } from "../types";
import type { AsrProvider } from "./types";
import { doubaoProvider } from "./doubao";
import { volcProvider } from "./volc";
import { webSpeechProvider } from "./webspeech";
import { zhipuProvider } from "./zhipu";

const PROVIDERS: Record<AsrProviderId, AsrProvider> = {
  webspeech: webSpeechProvider,
  doubao: doubaoProvider,
  volc: volcProvider,
  zhipu: zhipuProvider,
};

export function getProvider(id: AsrProviderId): AsrProvider {
  return PROVIDERS[id] ?? webSpeechProvider;
}

export const PROVIDER_LABELS: Record<AsrProviderId, string> = {
  webspeech: "浏览器内置（免配置）",
  doubao: "豆包网页版同款（需登录 doubao.com，非官方接口）",
  volc: "火山引擎 · 豆包语音识别大模型（流式）",
  zhipu: "智谱 GLM-ASR（≤30s 短句）",
};

export type { AsrProvider, AsrSession } from "./types";
