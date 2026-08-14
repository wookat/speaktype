import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import { BUILTIN_PERSONAS } from "../shared/personas";
import type { HistoryItem, Persona, Settings, Stats } from "../shared/types";

export const DEFAULT_SETTINGS: Settings = {
  // Alt+Space 是 Windows 系统菜单键，会让目标窗口进入菜单模态吃掉 Ctrl+V，默认避开
  hotkeyToggle: "Alt+Q",
  hotkeyHold: "RightCtrl",
  hotkeyRewrite: "F8",
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
  remoteRelayUrl: "https://speaktype.zalize.com/relay",
  remoteRelayRoom: "",
  appPersonas: [],
  autoLearn: true,
};

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

interface Schema {
  settings: Settings;
  personas: Persona[];
  /** 已迁到独立 history store；保留字段仅为旧版数据一次性迁移 */
  history: HistoryItem[];
  stats: Stats;
  onboarded: boolean;
  doubaoAppKeyCache: string;
  mainWindowBounds: WindowBounds | null;
}

// 高频大体积的历史/统计单独存：改设置/存窗口位置不再重写 500 条历史，配置损坏时历史也不陪葬
interface HistorySchema {
  history: HistoryItem[];
  stats: Stats;
}

const STORE_OPTIONS: ConstructorParameters<typeof Store<Schema>>[0] = {
  name: "speaktype",
  // 配置文件损坏（BOM/截断）时回落默认值，不能让应用起不来
  clearInvalidConfig: true,
  defaults: {
    settings: DEFAULT_SETTINGS,
    personas: [],
    history: [],
    stats: { words: 0, durationMs: 0, sessions: 0 },
    onboarded: false,
    doubaoAppKeyCache: "",
    mainWindowBounds: null,
  },
};

const HISTORY_STORE_OPTIONS: ConstructorParameters<typeof Store<HistorySchema>>[0] = {
  name: "history",
  clearInvalidConfig: true,
  defaults: {
    history: [],
    stats: { words: 0, durationMs: 0, sessions: 0 },
  },
};

// clearInvalidConfig 会静默清空损坏文件：先预检 JSON，解不开就备份一份 .bad，用户数据还能找回
function backupIfCorrupt(name: string): boolean {
  const file = join(app.getPath("userData"), `${name}.json`);
  if (!existsSync(file)) return false;
  // 预检必须和 electron-store 的解析器同样严格：它不剥 BOM，带 BOM 一样算损坏
  const raw = readFileSync(file, "utf8");
  try {
    JSON.parse(raw);
    return false;
  } catch {
    /* 继续走修复/备份 */
  }
  // 仅带 BOM（记事本另存的常见形态）：剥掉后写回即可修复，数据零丢失
  try {
    const stripped = raw.replace(/^\uFEFF/, "");
    JSON.parse(stripped);
    writeFileSync(file, stripped, "utf8");
    return false;
  } catch {
    try {
      copyFileSync(file, `${file}.bad`);
    } catch {
      /* 备份失败也继续：重建配置优先于保留残骸 */
    }
    return true;
  }
}

let storeRecovered = false;

/** 启动时配置文件损坏被重建了吗？用于首屏提示用户 .bad 备份位置 */
export function wasStoreRecovered(): boolean {
  return storeRecovered;
}

function createStore(): Store<Schema> {
  storeRecovered = backupIfCorrupt("speaktype");
  try {
    return new Store<Schema>(STORE_OPTIONS);
  } catch {
    // clearInvalidConfig 只兜 JSON 解析失败；其它读取异常时把旧文件改名保留后用默认值重建
    try {
      const file = join(app.getPath("userData"), "speaktype.json");
      renameSync(file, `${file}.bad`);
    } catch {
      /* 改名失败就只能靠重建覆盖 */
    }
    return new Store<Schema>(STORE_OPTIONS);
  }
}

const store = createStore();

function createHistoryStore(): Store<HistorySchema> {
  backupIfCorrupt("history");
  const hs = new Store<HistorySchema>(HISTORY_STORE_OPTIONS);
  // 旧版历史/统计还在主配置里：一次性迁入独立 store 后从主配置删掉
  const legacy = store.get("history");
  if (legacy.length > 0 && hs.get("history").length === 0) {
    hs.set("history", legacy);
    hs.set("stats", store.get("stats"));
    store.set("history", []);
  }
  // 历史被清过但统计还在旧位置的情况也要迁
  if (hs.get("stats").sessions === 0 && store.get("stats").sessions > 0) {
    hs.set("stats", store.get("stats"));
  }
  if (store.get("stats").sessions > 0) {
    store.set("stats", { words: 0, durationMs: 0, sessions: 0 });
  }
  return hs;
}

const historyStore = createHistoryStore();

export function getWindowBounds(): WindowBounds | null {
  return store.get("mainWindowBounds");
}

export function setWindowBounds(bounds: WindowBounds): void {
  store.set("mainWindowBounds", bounds);
}

export function getSettings(): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...store.get("settings") };
  // 中转地址留空时回落到官方中转，保证「公网中转」开箱即用
  if (!merged.remoteRelayUrl.trim()) merged.remoteRelayUrl = DEFAULT_SETTINGS.remoteRelayUrl;
  // 旧版官方地址（workers.dev 在部分地区不可达）迁移到新官方域名
  if (merged.remoteRelayUrl === "https://speaktype-relay.wookat520.workers.dev") {
    merged.remoteRelayUrl = DEFAULT_SETTINGS.remoteRelayUrl;
  }
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
  return historyStore.get("history");
}

export function addHistory(item: HistoryItem): void {
  historyStore.set("history", [item, ...getHistory()].slice(0, 500));
}

export function clearHistory(): void {
  historyStore.set("history", []);
}

export function updateHistoryItem(id: string, patch: Partial<HistoryItem>): HistoryItem | null {
  const list = getHistory();
  const idx = list.findIndex((h) => h.id === id);
  if (idx < 0) return null;
  const next = { ...list[idx]!, ...patch };
  list[idx] = next;
  historyStore.set("history", list);
  return next;
}

export function deleteHistory(ids: string[]): void {
  const drop = new Set(ids);
  historyStore.set(
    "history",
    getHistory().filter((h) => !drop.has(h.id)),
  );
}

export function getStats(): Stats {
  return historyStore.get("stats");
}

export function addStats(words: number, durationMs: number): void {
  const current = getStats();
  historyStore.set("stats", {
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
