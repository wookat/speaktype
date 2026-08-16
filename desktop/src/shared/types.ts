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

/**
 * 语音识别服务商：豆包（流式，需登录）、任意 OpenAI 兼容转写接口（整句）、
 * ChatGPT 网页会话（免密钥，需应用内登录）、或内置离线 whisper.cpp
 */
export type AsrProvider = "doubao" | "openai" | "chatgpt" | "local";

export interface Settings {
  /** 点按开关热键，uiohook 键名组合，例如 "Alt+Space" */
  hotkeyToggle: string;
  /** 长按说话热键，例如 "RightCtrl" */
  hotkeyHold: string;
  /** 选中文字后长按说指令改写/翻译的热键；"Off" 为关闭 */
  hotkeyRewrite: string;
  /** 长按判定时长，低于它算误触 */
  holdDelayMs: number;
  /** 最短录音时长，低于它不发起识别 */
  minRecordMs: number;
  /** 识别语言 */
  language: string;
  /** 界面语言 */
  uiLanguage: UiLanguage;
  /** 界面主题：跟随系统 / 浅色 / 深色 */
  theme: "system" | "light" | "dark";
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
  /** 增强标点（ct-transformer 中英标点模型，需先在设置中下载增强包）；未下载/加载失败时回退规则断句 */
  enhancedPunct: boolean;
  /** 数字规范化（ITN）：中文口语数字/时间转书面数字（三点半→3:30） */
  itn: boolean;
  /** 双击长按键进入免按连续听写 */
  doubleTapHandsFree: boolean;
  /** 识别失败时把录音保存在本机供重试（最多 20 段 / 7 天 / 50MB） */
  keepFailedAudio: boolean;
  /** 悬浮条实时字幕最大行数（1/3/6），超出滚动到最新 */
  captionLines: number;
  /** 手机当麦克风：局域网 HTTPS+WS 服务，手机扫码按住说话、文字落到电脑光标处 */
  remoteMicEnabled: boolean;
  /** 手机麦克风连接方式：局域网直连（默认）或公网中转（Cloudflare Worker 自部署） */
  remoteMicMode: "lan" | "relay";
  /** 公网中转服务地址，如 https://speaktype.zalize.com/relay 或自部署的 workers.dev 地址 */
  remoteRelayUrl: string;
  /** 中转房间号（= 手机端配对码），首次开启时生成后固定，装到主屏幕的手机 App 才能一直连同一台电脑 */
  remoteRelayRoom: string;
  /** 按当前应用自动切人设；匹配前台进程名或窗口标题，先命中先用 */
  appPersonas: AppPersonaRule[];
  /** 落字后观察输入框：用户手动改对的词自动学进词典（仅 Windows，纯本地） */
  autoLearn: boolean;
}

export interface AppPersonaRule {
  /** 子串匹配，如 "code.exe"、"wechat"、"gmail" */
  match: string;
  personaId: string;
}

/** 手机麦克风服务状态，主进程推给设置页 */
export interface RemoteMicInfo {
  running: boolean;
  url: string;
  qrDataUrl: string;
  clients: number;
  /** 公网中转模式下的 12 位配对码（房间号），装了手机 App 的用户可直接手输配对 */
  pairCode?: string;
  error?: string;
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
  /** 磁盘上已有可续传的半途数据时的完成百分比（0-99），无残片时不设 */
  partial?: number;
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

/** 文件转录的一个分段（秒） */
export interface TranscribeSegment {
  start: number;
  end: number;
  text: string;
}

/** 文件转录进行状态，主进程推给转录页 */
export interface TranscribeState {
  running: boolean;
  /** 0-100 */
  percent: number;
  segments: TranscribeSegment[];
  /** 来源文件名，用于导出命名与重启后恢复展示 */
  fileName?: string;
  /** 完成时刻（ms），恢复态下区分「这是什么时候转的」 */
  finishedAt?: number;
  error?: string;
}

export interface StatusPayload {
  state: RecordState;
  message?: string;
  partial?: string;
  personaName: string;
  /** 本次录音命中按应用规则时，实际生效的人设名 */
  appPersonaName?: string;
  hotkeyHold: string;
}
