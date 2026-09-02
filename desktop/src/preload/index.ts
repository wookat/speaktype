import { contextBridge, ipcRenderer } from "electron";
import type {
  HistoryItem,
  LocalModelStatus,
  Persona,
  RemoteMicInfo,
  Settings,
  Stats,
  StatusPayload,
  TranscribeState,
  VadStatus,
} from "../shared/types";

export interface InitPayload {
  settings: Settings;
  personas: Persona[];
  history: HistoryItem[];
  stats: Stats;
  doubaoReady: boolean;
  holdKeyChoices: string[];
  rewriteKeyChoices: string[];
  toggleKeyChoices: string[];
  status: StatusPayload;
  version: string;
  commit: string;
  systemLocale: string;
}

export interface MicDevice {
  deviceId: string;
  label: string;
}

/** 配置导出/导入结果：canceled=用户在文件对话框取消，invalid=文件不是有效的 SpeakType 配置，ignored=导入时被丢弃的字段数 */
export interface ConfigTransferResult {
  ok: boolean;
  canceled?: boolean;
  invalid?: boolean;
  error?: string;
  ignored?: number;
}

const api = {
  init: (): Promise<InitPayload> => ipcRenderer.invoke("app:init"),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke("settings:update", patch),
  savePersonas: (list: Persona[]): Promise<Persona[]> => ipcRenderer.invoke("personas:save", list),
  runningApps: (): Promise<string[]> => ipcRenderer.invoke("apps:running"),
  captureHotkey: (): Promise<string | null> => ipcRenderer.invoke("hotkey:capture"),
  history: (): Promise<HistoryItem[]> => ipcRenderer.invoke("history:list"),
  clearHistory: (): Promise<HistoryItem[]> => ipcRenderer.invoke("history:clear"),
  deleteHistory: (ids: string[]): Promise<HistoryItem[]> => ipcRenderer.invoke("history:delete", ids),
  restoreHistory: (item: HistoryItem, index: number): Promise<HistoryItem[]> =>
    ipcRenderer.invoke("history:restore", item, index),
  retryHistory: (id: string): Promise<{ ok: boolean; detail: string }> => ipcRenderer.invoke("history:retry", id),
  correctHistory: (id: string, text: string): Promise<HistoryItem[]> =>
    ipcRenderer.invoke("history:correct", id, text),
  stats: (): Promise<Stats> => ipcRenderer.invoke("stats:get"),
  doubaoReady: (): Promise<boolean> => ipcRenderer.invoke("doubao:ready"),
  activateDoubao: (): Promise<void> => ipcRenderer.invoke("doubao:activate"),
  chatgptReady: (): Promise<boolean> => ipcRenderer.invoke("chatgpt:ready"),
  loginChatgpt: (): Promise<void> => ipcRenderer.invoke("chatgpt:login"),
  testChatgpt: (): Promise<{ ok: boolean; detail: string }> => ipcRenderer.invoke("chatgpt:test"),
  testDoubao: (): Promise<{ ok: boolean; detail: string }> => ipcRenderer.invoke("doubao:test"),
  toggleRecord: (): Promise<void> => ipcRenderer.invoke("record:toggle"),
  cancelRecord: (): Promise<void> => ipcRenderer.invoke("record:cancel"),
  micList: (): Promise<MicDevice[]> => ipcRenderer.invoke("mic:list"),
  micTest: (on: boolean): Promise<void> => ipcRenderer.invoke("mic:test", on),
  testPolish: (): Promise<{ ok: boolean; detail: string }> => ipcRenderer.invoke("polish:test"),
  testAsr: (): Promise<{ ok: boolean; detail: string }> => ipcRenderer.invoke("asr:test"),
  minimize: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke("window:maximize"),
  close: (): Promise<void> => ipcRenderer.invoke("window:close"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("open:external", url),
  openLogs: (): Promise<void> => ipcRenderer.invoke("log:open"),
  latestVersion: (): Promise<string> => ipcRenderer.invoke("app:latestVersion"),
  localModels: (): Promise<Array<{ id: string; size: string }>> => ipcRenderer.invoke("local:models"),
  localModelStatus: (model: string): Promise<LocalModelStatus> => ipcRenderer.invoke("local:status", model),
  localModelDownload: (model: string): Promise<LocalModelStatus> => ipcRenderer.invoke("local:download", model),
  localModelDelete: (model: string): Promise<LocalModelStatus> => ipcRenderer.invoke("local:delete", model),
  resetSettings: (): Promise<Settings> => ipcRenderer.invoke("settings:reset"),
  exportConfig: (): Promise<ConfigTransferResult> => ipcRenderer.invoke("config:export"),
  importConfig: (): Promise<ConfigTransferResult> => ipcRenderer.invoke("config:import"),
  factoryReset: (): Promise<void> => ipcRenderer.invoke("app:factoryReset"),
  onLocalModel: (fn: (s: LocalModelStatus) => void) => {
    const listener = (_e: unknown, s: LocalModelStatus) => fn(s);
    ipcRenderer.on("local:model", listener);
    return () => {
      ipcRenderer.removeListener("local:model", listener);
    };
  },
  remoteMicInfo: (): Promise<RemoteMicInfo> => ipcRenderer.invoke("remotemic:info"),
  onRemoteMic: (fn: (s: RemoteMicInfo) => void) => {
    const listener = (_e: unknown, s: RemoteMicInfo) => fn(s);
    ipcRenderer.on("remotemic:info", listener);
    return () => {
      ipcRenderer.removeListener("remotemic:info", listener);
    };
  },
  vadStatus: (): Promise<VadStatus> => ipcRenderer.invoke("vad:status"),
  vadDownload: (): Promise<VadStatus> => ipcRenderer.invoke("vad:download"),
  onVadStatus: (fn: (s: VadStatus) => void) => {
    const listener = (_e: unknown, s: VadStatus) => fn(s);
    ipcRenderer.on("vad:status", listener);
    return () => {
      ipcRenderer.removeListener("vad:status", listener);
    };
  },
  transcribeStart: (samples: ArrayBuffer, fileName?: string): Promise<TranscribeState> =>
    ipcRenderer.invoke("transcribe:start", samples, fileName),
  transcribeCancel: (): Promise<void> => ipcRenderer.invoke("transcribe:cancel"),
  transcribeState: (): Promise<TranscribeState> => ipcRenderer.invoke("transcribe:state"),
  onTranscribeState: (fn: (s: TranscribeState) => void) => {
    const listener = (_e: unknown, s: TranscribeState) => fn(s);
    ipcRenderer.on("transcribe:state", listener);
    return () => {
      ipcRenderer.removeListener("transcribe:state", listener);
    };
  },
  punctStatus: (): Promise<VadStatus> => ipcRenderer.invoke("punct:status"),
  punctDownload: (): Promise<VadStatus> => ipcRenderer.invoke("punct:download"),
  onPunctStatus: (fn: (s: VadStatus) => void) => {
    const listener = (_e: unknown, s: VadStatus) => fn(s);
    ipcRenderer.on("punct:status", listener);
    return () => {
      ipcRenderer.removeListener("punct:status", listener);
    };
  },

  onStatus: (fn: (payload: StatusPayload) => void) => {
    const listener = (_e: unknown, payload: StatusPayload) => fn(payload);
    ipcRenderer.on("status", listener);
    return () => ipcRenderer.removeListener("status", listener);
  },
  onSettings: (fn: (payload: { settings: Settings; personas: Persona[] }) => void) => {
    const listener = (_e: unknown, payload: { settings: Settings; personas: Persona[] }) => fn(payload);
    ipcRenderer.on("settings", listener);
    return () => ipcRenderer.removeListener("settings", listener);
  },
  onLevel: (fn: (level: number) => void) => {
    const listener = (_e: unknown, level: number) => fn(level);
    ipcRenderer.on("level", listener);
    return () => ipcRenderer.removeListener("level", listener);
  },
  onGoto: (fn: (payload: { page: string; tab?: string }) => void) => {
    const listener = (_e: unknown, payload: { page: string; tab?: string }) => fn(payload);
    ipcRenderer.on("goto", listener);
    return () => ipcRenderer.removeListener("goto", listener);
  },
  onToast: (fn: (payload: { title: string; body: string; actionLabel?: string }) => void) => {
    const listener = (_e: unknown, payload: { title: string; body: string; actionLabel?: string }) =>
      fn(payload);
    ipcRenderer.on("toast", listener);
    return () => ipcRenderer.removeListener("toast", listener);
  },
  toastAction: () => ipcRenderer.send("toast:action"),
  toastHover: (hovering: boolean) => ipcRenderer.send("toast:hover", hovering),
};

export type SpeakTypeApi = typeof api;

contextBridge.exposeInMainWorld("speaktype", api);
