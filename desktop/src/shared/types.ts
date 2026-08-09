export type RecordState = "idle" | "connecting" | "recording" | "transcribing" | "polishing" | "error";

export interface Persona {
  id: string;
  name: string;
  prompt: string;
  builtin: boolean;
  icon: string;
}

/** 界面语言："system" 表示跟随系统 */
export type UiLanguage = "system" | "zh-CN" | "zh-TW" | "en" | "ja" | "ko";

/** 语音识别服务商：豆包（流式，需登录）、任意 OpenAI 兼容转写接口（整句）、或内置离线 whisper.cpp */
export type AsrProvider = "doubao" | "openai" | "local";

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
  /** 免按（点按开关）模式下检测到静音自动结束 */
  vadAutoStop: boolean;
  /** 静音多久后自动结束，毫秒 */
  vadSilenceMs: number;
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
  /** 离线通道的 whisper.cpp 模型名，如 "base-q5_1" */
  localModel: string;
  /** 离线通道落字前繁→简转换（whisper 中文常出繁体） */
  localSimplified: boolean;
  /** 增强人声检测（Silero VAD，需先在设置中下载增强包） */
  enhancedVad: boolean;
  /** 识别失败时把录音保存在本机供重试（最多 20 段 / 7 天 / 50MB） */
  keepFailedAudio: boolean;
}

/** VAD 增强包下载/就绪状态，主进程推给设置页 */
export interface VadStatus {
  /** 当前平台是否支持增强包（目前仅 Windows x64） */
  supported: boolean;
  downloaded: boolean;
  downloading: boolean;
  /** 0-100 */
  progress: number;
  error?: string;
}

/** 离线模型下载/就绪状态，主进程推给设置页 */
export interface LocalModelStatus {
  model: string;
  downloaded: boolean;
  downloading: boolean;
  /** 0-100 */
  progress: number;
  error?: string;
}

export interface HistoryItem {
  id: string;
  at: number;
  text: string;
  raw: string;
  personaName: string;
  durationMs: number;
  failed?: string;
  /** 识别失败的会话：音频留存本机，可从历史页重试 */
  status?: "failed";
  error?: string;
  audioFile?: string;
  /** 产生该条目的 ASR 通道 */
  provider?: AsrProvider;
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
