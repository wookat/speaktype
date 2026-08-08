import { contextBridge, ipcRenderer } from "electron";
import type { HistoryItem, Persona, Settings, Stats, StatusPayload } from "../shared/types";

export interface InitPayload {
  settings: Settings;
  personas: Persona[];
  history: HistoryItem[];
  stats: Stats;
  onboarded: boolean;
  doubaoReady: boolean;
  holdKeyChoices: string[];
  status: StatusPayload;
  version: string;
}

const api = {
  init: (): Promise<InitPayload> => ipcRenderer.invoke("app:init"),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke("settings:update", patch),
  savePersonas: (list: Persona[]): Promise<Persona[]> => ipcRenderer.invoke("personas:save", list),
  history: (): Promise<HistoryItem[]> => ipcRenderer.invoke("history:list"),
  clearHistory: (): Promise<HistoryItem[]> => ipcRenderer.invoke("history:clear"),
  deleteHistory: (ids: string[]): Promise<HistoryItem[]> => ipcRenderer.invoke("history:delete", ids),
  stats: (): Promise<Stats> => ipcRenderer.invoke("stats:get"),
  doubaoReady: (): Promise<boolean> => ipcRenderer.invoke("doubao:ready"),
  activateDoubao: (): Promise<void> => ipcRenderer.invoke("doubao:activate"),
  onboardingDone: (): Promise<void> => ipcRenderer.invoke("onboarding:done"),
  toggleRecord: (): Promise<void> => ipcRenderer.invoke("record:toggle"),
  cancelRecord: (): Promise<void> => ipcRenderer.invoke("record:cancel"),
  minimize: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  close: (): Promise<void> => ipcRenderer.invoke("window:close"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("open:external", url),

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
  onToast: (fn: (payload: { title: string; body: string }) => void) => {
    const listener = (_e: unknown, payload: { title: string; body: string }) => fn(payload);
    ipcRenderer.on("toast", listener);
    return () => ipcRenderer.removeListener("toast", listener);
  },

  recorder: {
    onStart: (fn: () => void) => ipcRenderer.on("recorder:start", fn),
    onStop: (fn: () => void) => ipcRenderer.on("recorder:stop", fn),
    sendPcm: (chunk: ArrayBuffer) => ipcRenderer.send("recorder:pcm", chunk),
    sendLevel: (level: number) => ipcRenderer.send("recorder:level", level),
    sendError: (message: string) => ipcRenderer.send("recorder:error", message),
  },
};

export type SpeakTypeApi = typeof api;

contextBridge.exposeInMainWorld("speaktype", api);
