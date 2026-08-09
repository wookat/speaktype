export type RecordState = "idle" | "connecting" | "recording" | "transcribing" | "polishing" | "error";

export interface Persona {
  id: string;
  name: string;
  prompt: string;
  builtin: boolean;
  icon: string;
}

/** 界面语言："system" 表示跟随系统 */
export type UiLanguage = "system" | "zh-CN" | "en";

/** 语音识别服务商：豆包（流式，需登录）或任意 OpenAI 兼容转写接口（整句） */
export type AsrProvider = "doubao" | "openai";

export interface Settings {
  /** 点按开关热键，uiohook 键名组合，例如 "Alt+Space" */
  hotkeyToggle: string;
  /** 长按说话热键，例如 "RightCtrl" */
  hotkeyHold: string;
  /** 长按判定时长，低于它算误触 */
  holdDelayMs: number;
  /** 最短录音时长，低于它不发起识别 */
  minRecordMs: number;
  /** 识别语言 */
  language: string;
  /** 界面语言 */
  uiLanguage: UiLanguage;
  personaId: string;
  autoPaste: boolean;
  launchAtLogin: boolean;
  /** 开机自启时不弹主窗口，直接进托盘 */
  startMinimized: boolean;
  muteWhileRecording: boolean;
  /** Alt+1..9 快速切人设 */
  personaHotkeysEnabled: boolean;
  /** 麦克风设备 deviceId，空串表示系统默认 */
  micDeviceId: string;
  polishEnabled: boolean;
  polishBaseUrl: string;
  polishApiKey: string;
  polishModel: string;
  hotwords: string[];
  doubaoAppKey: string;
  asrProvider: AsrProvider;
  asrBaseUrl: string;
  asrApiKey: string;
  asrModel: string;
}

export interface HistoryItem {
  id: string;
  at: number;
  text: string;
  raw: string;
  personaName: string;
  durationMs: number;
  failed?: string;
}

export interface Stats {
  words: number;
  durationMs: number;
  sessions: number;
}

export interface StatusPayload {
  state: RecordState;
  message?: string;
  partial?: string;
  personaName: string;
  hotkeyHold: string;
}
