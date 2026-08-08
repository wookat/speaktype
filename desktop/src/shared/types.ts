export type RecordState = "idle" | "connecting" | "recording" | "transcribing" | "polishing" | "error";

export interface Persona {
  id: string;
  name: string;
  prompt: string;
  builtin: boolean;
  icon: string;
}

export interface Settings {
  /** 点按开关热键，uiohook 键名组合，例如 "Alt+Space" */
  hotkeyToggle: string;
  /** 长按说话热键，例如 "RightCtrl" */
  hotkeyHold: string;
  /** 长按判定时长，低于它算误触 */
  holdDelayMs: number;
  /** 最短录音时长，低于它不发起识别 */
  minRecordMs: number;
  language: string;
  personaId: string;
  autoPaste: boolean;
  launchAtLogin: boolean;
  muteWhileRecording: boolean;
  polishEnabled: boolean;
  polishBaseUrl: string;
  polishApiKey: string;
  polishModel: string;
  hotwords: string[];
  doubaoAppKey: string;
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
