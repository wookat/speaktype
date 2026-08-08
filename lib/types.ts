export type AsrProviderId = "webspeech" | "doubao" | "volc" | "zhipu";

export interface Persona {
  id: string;
  name: string;
  icon: string;
  prompt: string;
}

export interface Settings {
  provider: AsrProviderId;
  /** 服务端代理地址（Cloudflare Worker），用于隐藏 provider 凭证并补齐浏览器无法设置的请求头 */
  proxyUrl: string;
  /** 用户自带凭证：留空则走 proxyUrl 上配置的服务端凭证 */
  volcAppKey: string;
  volcAccessKey: string;
  zhipuApiKey: string;
  /** 豆包网页版语音入口的 api_app_key；置空时桥接尝试从页面自动取 */
  doubaoAppKey: string;
  /** 润色用的 OpenAI 兼容端点（DeepSeek/Kimi/千问/OpenAI 等均可）；置空时回退到智谱/中转 */
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  language: string;
  personaId: string;
  personas: Persona[];
  /** AI 润色开关，关闭时只做本地口语清理 */
  polish: boolean;
  /** 识别到最终结果后自动插入光标处 */
  autoInsert: boolean;
  /** 按住说话开关 */
  pushToTalk: boolean;
  /** 按住说话的键位，如 `Ctrl`、`Ctrl+Alt`、`F2` */
  pushToTalkKey: string;
}

export type RecorderState = "idle" | "connecting" | "recording" | "processing" | "error";

/** 错误态下 UI 可以挂的一键修复入口 */
export type FixAction = "grant-mic" | "open-doubao";

/** content script → background */
export type UiToBg =
  | { type: "start-record"; selectionText: string }
  | { type: "stop-record" }
  | { type: "cancel-record" }
  | { type: "get-state" }
  | { type: "run-fix"; action: FixAction };

/** background → content script */
export type BgToUi =
  | { type: "state"; state: RecorderState; message?: string; action?: FixAction }
  | { type: "partial"; text: string }
  | { type: "final"; text: string; transcript: string }
  | { type: "level"; value: number }
  | { type: "hotkey-toggle" };

/** background ↔ offscreen */
export type BgToOffscreen =
  | { target: "offscreen"; type: "start"; settings: Settings; selectionText: string }
  | { target: "offscreen"; type: "stop" }
  | { target: "offscreen"; type: "cancel" };

export type OffscreenToBg =
  | { target: "background"; type: "state"; state: RecorderState; message?: string; action?: FixAction }
  | { target: "background"; type: "partial"; text: string }
  | { target: "background"; type: "transcript"; text: string }
  | { target: "background"; type: "level"; value: number };
