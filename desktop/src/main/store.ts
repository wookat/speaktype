import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import log from "electron-log/main.js";
import { LOCAL_MODEL_IDS } from "../shared/localModels";
import { BUILTIN_PERSONAS } from "../shared/personas";
import type { AppPersonaRule, HistoryItem, Persona, Settings, Stats } from "../shared/types";

// 系统语言决定默认本地模型：中日韩粵用 SenseVoice；英语/欧洲语系用 Parakeet（这些语言准确率更高）。只影响全新用户默认值
const SYS_LOCALE = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
const CJK_LOCALE = /^(zh|ja|ko|yue)/.test(SYS_LOCALE);

export const DEFAULT_SETTINGS: Settings = {
  // Alt+Space 是 Windows 系统菜单键，会让目标窗口进入菜单模态吃掉 Ctrl+V，默认避开
  hotkeyToggle: "Alt+Q",
  hotkeyHold: "RightCtrl",
  hotkeyRewrite: "F8",
  holdDelayMs: 120,
  minRecordMs: 300,
  language: CJK_LOCALE ? (SYS_LOCALE.startsWith("yue") ? "yue" : SYS_LOCALE.slice(0, 2)) : "en",
  uiLanguage: "system",
  theme: "system",
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
  localModel: CJK_LOCALE ? "sensevoice-small" : "parakeet-tdt-0.6b-v3",
  localSimplified: true,
  enhancedVad: false,
  enhancedPunct: false,
  itn: true,
  doubleTapHandsFree: true,
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
let historyRecovered = false;

/** 启动时配置文件损坏被重建了吗？用于首屏提示用户 .bad 备份位置 */
export function wasStoreRecovered(): boolean {
  return storeRecovered;
}

/** 启动时历史文件损坏被重建了吗？提示文案与主配置区分（history.json.bad） */
export function wasHistoryRecovered(): boolean {
  return historyRecovered;
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
  historyRecovered = backupIfCorrupt("history");
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

// 磁盘写入被拒（文件只读/权限不足/备份软件锁定）时通知 UI，不能静默丢配置
let persistErrorHandler: ((error: unknown) => void) | null = null;

export function onPersistError(handler: (error: unknown) => void): void {
  persistErrorHandler = handler;
}

function persist<K extends keyof Schema>(key: K, value: Schema[K], notify: boolean): void {
  try {
    store.set(key, value);
  } catch (error) {
    log.error(`failed to persist ${key}`, error);
    if (notify) persistErrorHandler?.(error);
  }
}

export function getWindowBounds(): WindowBounds | null {
  return store.get("mainWindowBounds");
}

export function setWindowBounds(bounds: WindowBounds): void {
  // 窗口位置属锦上添花，写失败只落日志不打扰
  persist("mainWindowBounds", bounds, false);
}

export function getSettings(): Settings {
  const stored = store.get("settings");
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  // 旧配置没有 localModel 字段时按识别语言回落：CJK 语言下 Parakeet 输出拉丁化文本，近乎不可用
  if (stored.localModel === undefined && /^(zh|ja|ko|yue)/.test(merged.language)) {
    merged.localModel = "sensevoice-small";
  }
  // 中转地址留空时回落到官方中转，保证「公网中转」开箱即用
  if (!merged.remoteRelayUrl.trim()) merged.remoteRelayUrl = DEFAULT_SETTINGS.remoteRelayUrl;
  // 旧版官方地址（workers.dev 在部分地区不可达）迁移到新官方域名
  if (merged.remoteRelayUrl === "https://speaktype-relay.wookat520.workers.dev") {
    merged.remoteRelayUrl = DEFAULT_SETTINGS.remoteRelayUrl;
  }
  // Alt+Space 与 Windows 系统菜单冲突，已从可选项移除；存量配置迁到默认键
  if (merged.hotkeyToggle === "Alt+Space") merged.hotkeyToggle = DEFAULT_SETTINGS.hotkeyToggle;
  return merged;
}

/** 恢复默认设置：只重置偏好项，用户资产（词典热词、按应用人设规则、手机配对码、已下载模型的选择）保留 */
export function resetSettingsToDefaults(): Settings {
  const current = getSettings();
  const next: Settings = {
    ...DEFAULT_SETTINGS,
    hotwords: current.hotwords,
    appPersonas: current.appPersonas,
    remoteRelayRoom: current.remoteRelayRoom,
    // locale 默认模型可能没下载过：重置后落缺模型态，不如保留当前可用的选择
    localModel: current.localModel,
  };
  persist("settings", next, true);
  return next;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  persist("settings", next, true);
  return next;
}

/** 不随导出文件流转的字段：凭证明文落盘有泄露风险，micDeviceId 绑定本机音频设备 */
const NON_PORTABLE_KEYS: ReadonlyArray<keyof Settings> = ["polishApiKey", "asrApiKey", "doubaoAppKey", "micDeviceId"];

export interface ConfigExport {
  app: "speaktype";
  configVersion: 1;
  exportedAt: string;
  settings: Partial<Settings>;
  personas: Persona[];
}

export function buildConfigExport(): ConfigExport {
  const settings: Partial<Settings> = { ...getSettings() };
  for (const key of NON_PORTABLE_KEYS) delete settings[key];
  return {
    app: "speaktype",
    configVersion: 1,
    exportedAt: new Date().toISOString(),
    settings,
    personas: store.get("personas"),
  };
}

/** 解析导入文件：只收留与默认值同形的已知字段，凭证/设备字段保留本机现值；ignored 计被丢弃的字段数供可见反馈 */
export function parseConfigImport(
  raw: string,
): { settings: Partial<Settings>; personas: Persona[]; ignored: number } | null {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const d = data as { app?: unknown; settings?: unknown; personas?: unknown };
  if (d.app !== "speaktype" || typeof d.settings !== "object" || d.settings === null) return null;
  const incoming = d.settings as Record<string, unknown>;
  const patch: Partial<Settings> = {};
  const knownKeys = new Set<string>(Object.keys(DEFAULT_SETTINGS));
  let ignored = Object.keys(incoming).filter((k) => !knownKeys.has(k)).length;
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = incoming[key];
    if (value === undefined) continue;
    if (NON_PORTABLE_KEYS.includes(key)) {
      ignored++;
      continue;
    }
    const def = DEFAULT_SETTINGS[key];
    if (Array.isArray(def) ? !Array.isArray(value) : typeof value !== typeof def) {
      ignored++;
      continue;
    }
    Object.assign(patch, { [key]: value });
  }
  // localModel 写入白名外的 id 会让听写陷入缺模型死态：非法值不导入，保留本机现值
  if (patch.localModel !== undefined && !LOCAL_MODEL_IDS.includes(patch.localModel)) {
    delete patch.localModel;
    ignored++;
  }
  // captionLines 值域外的数会持久化但 UI 下拉无对应项，显示与存储不一致：非法值不导入
  if (patch.captionLines !== undefined && ![1, 3, 6].includes(patch.captionLines)) {
    delete patch.captionLines;
    ignored++;
  }
  if (patch.hotwords) patch.hotwords = patch.hotwords.filter((w): w is string => typeof w === "string");
  if (patch.appPersonas) {
    patch.appPersonas = patch.appPersonas.filter(
      (r): r is AppPersonaRule =>
        typeof r === "object" && r !== null && typeof r.match === "string" && typeof r.personaId === "string",
    );
  }
  const personas = (Array.isArray(d.personas) ? d.personas : [])
    .filter(
      (p): p is Persona =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as Persona).id === "string" &&
        typeof (p as Persona).name === "string" &&
        typeof (p as Persona).prompt === "string",
    )
    .map((p) => ({ id: p.id, name: p.name, prompt: p.prompt, builtin: false, icon: typeof p.icon === "string" ? p.icon : "sparkles" }));
  return { settings: patch, personas, ignored };
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

/** 清洗指向已不存在人设的引用（历史版本删除人设不清理规则留下的存量脏数据） */
export function pruneStalePersonaRefs(): void {
  const ids = new Set(getPersonas().map((p) => p.id));
  const settings = getSettings();
  const patch: Partial<Settings> = {};
  const rules = settings.appPersonas.filter((r) => ids.has(r.personaId));
  if (rules.length !== settings.appPersonas.length) patch.appPersonas = rules;
  if (!ids.has(settings.personaId)) patch.personaId = "default";
  if (Object.keys(patch).length > 0) {
    setSettings(patch);
    log.info("pruned stale persona refs", patch);
  }
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
  // 清空历史同时归零统计：首页还显示已删会话的计数会让人以为数据没删干净
  historyStore.set("stats", { words: 0, durationMs: 0, sessions: 0 });
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

/** 撤销删除：按原位置插回（幂等，去重后 clamp 到当前列表范围） */
export function restoreHistory(item: HistoryItem, index: number): void {
  const list = getHistory().filter((h) => h.id !== item.id);
  list.splice(Math.min(Math.max(index, 0), list.length), 0, item);
  historyStore.set("history", list.slice(0, 500));
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

/** 统计口径：CJK 每字计 1 词，拉丁/数字按连续串计 1 词（混排相加），避免英文按字符计虚高 */
export function countWords(text: string): number {
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
  return cjk + latin;
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
