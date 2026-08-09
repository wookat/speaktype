import Store from "electron-store";
import { BUILTIN_PERSONAS } from "../shared/personas";
import type { HistoryItem, Persona, Settings, Stats } from "../shared/types";

export const DEFAULT_SETTINGS: Settings = {
  // Alt+Space 是 Windows 系统菜单键，会让目标窗口进入菜单模态吃掉 Ctrl+V，默认避开
  hotkeyToggle: "Alt+Q",
  hotkeyHold: "RightCtrl",
  holdDelayMs: 120,
  minRecordMs: 300,
  language: "zh",
  uiLanguage: "system",
  personaId: "default",
  autoPaste: true,
  launchAtLogin: false,
  startMinimized: false,
  muteWhileRecording: false,
  personaHotkeysEnabled: true,
  vadAutoStop: true,
  vadSilenceMs: 2000,
  micDeviceId: "",
  polishEnabled: false,
  polishBaseUrl: "",
  polishApiKey: "",
  polishModel: "",
  hotwords: [],
  doubaoAppKey: "",
  // 默认走内置离线：零密钥零登录，新用户下完模型就能说第一句
  asrProvider: "local",
  asrBaseUrl: "",
  asrApiKey: "",
  asrModel: "",
  localModel: "sensevoice-small",
  localSimplified: true,
  enhancedVad: false,
  keepFailedAudio: true,
  captionLines: 3,
  remoteMicEnabled: false,
  remoteMicMode: "lan",
  // 官方公共中转（Cloudflare Worker，音频直通不存储）；用户可换成自部署地址
  remoteRelayUrl: "https://speaktype-relay.wookat520.workers.dev",
};

interface Schema {
  settings: Settings;
  personas: Persona[];
  history: HistoryItem[];
  stats: Stats;
  onboarded: boolean;
  doubaoAppKeyCache: string;
}

const store = new Store<Schema>({
  name: "speaktype",
  defaults: {
    settings: DEFAULT_SETTINGS,
    personas: [],
    history: [],
    stats: { words: 0, durationMs: 0, sessions: 0 },
    onboarded: false,
    doubaoAppKeyCache: "",
  },
});

export function getSettings(): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...store.get("settings") };
  // 中转地址留空时回落到官方中转，保证「公网中转」开箱即用
  if (!merged.remoteRelayUrl.trim()) merged.remoteRelayUrl = DEFAULT_SETTINGS.remoteRelayUrl;
  return merged;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  store.set("settings", next);
  return next;
}

/** 内置人设 + 用户自建人设，顺序即 Alt+1..9 的编号顺序 */
export function getPersonas(): Persona[] {
  return [...BUILTIN_PERSONAS, ...store.get("personas")];
}

export function setCustomPersonas(list: Persona[]): void {
  store.set(
    "personas",
    list.filter((p) => !p.builtin),
  );
}

export function findPersona(id: string): Persona {
  return getPersonas().find((p) => p.id === id) ?? BUILTIN_PERSONAS[0]!;
}

export function getHistory(): HistoryItem[] {
  return store.get("history");
}

export function addHistory(item: HistoryItem): void {
  store.set("history", [item, ...getHistory()].slice(0, 500));
}

export function clearHistory(): void {
  store.set("history", []);
}

export function updateHistoryItem(id: string, patch: Partial<HistoryItem>): HistoryItem | null {
  const list = getHistory();
  const idx = list.findIndex((h) => h.id === id);
  if (idx < 0) return null;
  const next = { ...list[idx]!, ...patch };
  list[idx] = next;
  store.set("history", list);
  return next;
}

export function deleteHistory(ids: string[]): void {
  const drop = new Set(ids);
  store.set(
    "history",
    getHistory().filter((h) => !drop.has(h.id)),
  );
}

export function getStats(): Stats {
  return store.get("stats");
}

export function addStats(words: number, durationMs: number): void {
  const current = getStats();
  store.set("stats", {
    words: current.words + words,
    durationMs: current.durationMs + durationMs,
    sessions: current.sessions + 1,
  });
}

export function isOnboarded(): boolean {
  return store.get("onboarded");
}

export function setOnboarded(value: boolean): void {
  store.set("onboarded", value);
}

export function getAppKeyCache(): string {
  return store.get("doubaoAppKeyCache");
}

export function setAppKeyCache(key: string): void {
  store.set("doubaoAppKeyCache", key);
}
