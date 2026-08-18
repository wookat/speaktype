// 必须最先 import：在任何 electron-store 实例化（会立即写出默认 speaktype.json）之前完成旧配置迁移
import "./migrate";
import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, shell } from "electron";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import log from "electron-log/main.js";
import pkg from "../../package.json";

// 构建时由 electron.vite.config.ts 的 define 注入的 git 短 commit
declare const __COMMIT__: string;
import { localizePersona } from "../shared/personas";
import type { HistoryItem, Persona, Settings, StatusPayload } from "../shared/types";
import { Dictation, clearFailedAudio } from "./dictation";
import { runningApps } from "./activeapp";
import { chatgptLoggedIn, closeChatgptBridge, showChatgptLogin, testChatgpt } from "./chatgpt";
import { closeBridge, ensureBridge, hasAppKey, onAppKeyCaptured, showBridge, testDoubao } from "./doubao";
import { HOLD_KEY_CHOICES, REWRITE_KEY_CHOICES, TOGGLE_KEY_CHOICES, HotkeyManager } from "./hotkey";
import { t, translator } from "./i18n";
import { testAsr } from "./asr";
import { LOCAL_MODELS, downloadLocalModel, isSherpaModel, localModelStatus, onLocalModelStatus, prewarmSherpa, releaseSherpaWorker, stopLocalServer } from "./localasr";
import { initMuteRecovery } from "./mute";
import { downloadPunct, onPunctStatus, punctStatus } from "./punct";
import { cancelTranscribe, onTranscribeState, startTranscribe, transcribeState } from "./transcribe";
import { cleanupLegacyVad, downloadVad, onVadStatus, vadStatus } from "./vad";
import { testPolish } from "./polish";
import {
  broadcastToPhones,
  configureRemoteMic,
  newPairCode,
  remoteMicInfo,
  startRemoteMic,
  stopRemoteMic,
} from "./remotemic";
import {
  clearHistory,
  deleteHistory,
  getHistory,
  getPersonas,
  getSettings,
  getStats,
  isOnboarded,
  onPersistError,
  pruneStalePersonaRefs,
  restoreHistory,
  setCustomPersonas,
  setOnboarded,
  setSettings,
  updateHistoryItem,
  wasHistoryRecovered,
  wasStoreRecovered,
} from "./store";
import {
  createMainWindow,
  createPanelWindow,
  createRecorderWindow,
  createToastWindow,
  dockPanel,
  dockToast,
} from "./windows";

log.initialize();
log.info(`SpeakType ${app.isPackaged ? app.getVersion() : pkg.version} starting (packaged=${app.isPackaged})`);

// 崩溃兜底：任何未捕获异常都落日志并弹窗告知日志位置，避免静默秒退
process.on("uncaughtException", (error) => {
  log.error("uncaughtException", error);
  try {
    dialog.showErrorBox(
      "SpeakType",
      `${error instanceof Error ? error.message : String(error)}\n\nLog: ${log.transports.file.getFile().path}`,
    );
  } catch {
    // dialog 在 app ready 前也可用；仅在极端情况下忽略
  }
  app.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", reason);
});

// 隐藏自验参数：--test-crash 人为触发未捕获异常，用于验收崩溃兜底链路
if (process.argv.includes("--test-crash")) {
  setTimeout(() => {
    throw new Error("SpeakType --test-crash: intentional crash for verifying the crash guard");
  }, 3000);
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();

let mainWin: BrowserWindow | null = null;
let panelWin: BrowserWindow | null = null;
let toastWin: BrowserWindow | null = null;
let recorderWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let toastTimer: NodeJS.Timeout | null = null;

function broadcast(payload: StatusPayload): void {
  for (const win of [mainWin, panelWin]) {
    if (win && !win.isDestroyed()) win.webContents.send("status", payload);
  }
  broadcastToPhones(payload);
  if (!panelWin || panelWin.isDestroyed()) return;
  if (payload.state === "idle" && !payload.partial) panelWin.hide();
  else if (!panelWin.isVisible()) {
    dockPanel(panelWin);
    panelWin.showInactive();
  }
}

let toastAction: (() => void) | null = null;

function showToast(
  title: string,
  body: string,
  action?: { label: string; run: () => void },
  durationMs?: number,
): void {
  if (!toastWin || toastWin.isDestroyed()) return;
  toastAction = action?.run ?? null;
  toastWin.webContents.send("toast", { title, body, actionLabel: action?.label });
  dockToast(toastWin);
  toastWin.showInactive();
  if (toastTimer) clearTimeout(toastTimer);
  // 带操作按钮的 toast 停留久一点，给用户点击时间
  toastTimer = setTimeout(() => toastWin?.hide(), durationMs ?? (action ? 6000 : 4000));
}

// 悬停暂停自动隐藏，移开后短暂宽限再收起
ipcMain.on("toast:hover", (_e, hovering: boolean) => {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = hovering ? null : setTimeout(() => toastWin?.hide(), 2000);
});

ipcMain.on("toast:action", () => {
  const run = toastAction;
  toastAction = null;
  if (toastTimer) clearTimeout(toastTimer);
  toastWin?.hide();
  run?.();
});

const dictation = new Dictation({
  recorder: () => recorderWin,
  broadcast,
  pushSettings: () => pushSettings(),
  showToast,
  openModelSettings: (tab = "model") => {
    showMain();
    mainWin?.webContents.send("goto", { page: "settings", tab });
  },
});

configureRemoteMic({
  start: () => dictation.start("hold", true),
  stop: () => dictation.stop(),
  cancel: () => dictation.cancel(),
  pushPcm: (frame) => dictation.pushPcm(frame),
  isRecording: () => dictation.isRecording(),
  onClients: (count) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("remotemic:info", { ...remoteMicInfo(), clients: count });
  },
});

/** 启停手机麦克风服务，失败时把错误推给设置页 */
async function syncRemoteMic(enabled: boolean): Promise<void> {
  try {
    await stopRemoteMic();
    let s = getSettings();
    if (enabled && s.remoteMicMode === "relay" && !s.remoteRelayRoom) {
      // 首次开启中转时生成固定配对码，之后每次都用同一个，手机 App 才能一直连上
      s = setSettings({ remoteRelayRoom: newPairCode() });
    }
    if (enabled) await startRemoteMic(s.remoteMicMode, s.remoteRelayUrl, s.remoteRelayRoom);
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("remotemic:info", remoteMicInfo());
  } catch (error) {
    log.warn("remote mic failed", error);
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("remotemic:info", {
        ...remoteMicInfo(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const hotkeys = new HotkeyManager({
  onWarmUp: () => dictation.warmUp(),
  onHoldStart: (rewrite) => void (rewrite ? dictation.startRewrite() : dictation.start("hold")),
  onHoldEnd: () => void dictation.stop(),
  onToggle: () => dictation.toggleHandsFree(),
  onEscape: () => dictation.cancelByKey(),
  onDoubleTap: () => dictation.toggleHandsFree(),
  onPersona: (index) => {
    const personas = getPersonas();
    const persona = personas[index];
    if (!persona) return;
    setSettings({ personaId: persona.id });
    pushSettings();
    const name = localizePersona(persona, translator()).name;
    showToast(t("toast.persona"), t("toast.personaBody", { name, index: index + 1 }));
  },
});

function applyHotkeys(settings: Settings): void {
  hotkeys.configure(
    settings.hotkeyHold,
    settings.hotkeyToggle,
    settings.holdDelayMs,
    settings.personaHotkeysEnabled,
    settings.hotkeyRewrite,
    settings.doubleTapHandsFree,
  );
}

function pushSettings(): void {
  const payload = { settings: getSettings(), personas: getPersonas() };
  for (const win of [mainWin, panelWin]) {
    if (win && !win.isDestroyed()) win.webContents.send("settings", payload);
  }
  broadcast(dictation.status());
}

// --hidden 配合「开机时不展示应用窗口」判断静默启动
// 绿色版解压在临时目录运行，自启必须指向 exe 本体（PORTABLE_EXECUTABLE_FILE）
// Run 值名固定为 SpeakType：与 exe 文件名解耦，绿色版换名升级不留死链，卸载器也按此名清理
const LOGIN_EXE = process.env["PORTABLE_EXECUTABLE_FILE"] || process.execPath;

async function applyLaunchAtLogin(enabled: boolean): Promise<void> {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      name: "SpeakType",
      path: LOGIN_EXE,
      args: ["--hidden"],
    });
    // 历史版本的 Run 值名取 exe 基名（绿色版带版本号），迁移时按需清掉旧值
    if (process.platform === "win32") {
      const legacy = basename(LOGIN_EXE, ".exe");
      if (legacy !== "SpeakType") {
        execFile("reg", [
          "delete",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
          "/v",
          legacy,
          "/f",
        ]).on("error", () => {});
      }
    }
  } catch (error) {
    log.warn("launch-at-login apply failed", error);
  }
}

function trayIcon(): Electron.NativeImage {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  return nativeImage.createFromPath(join(dir, "../../build/icon.png")).resize({ width: 16, height: 16 });
}

// 托盘菜单文案按配置状态选键：未配置显「配置语音识别」引导，已配置显中性「语音识别设置」
function asrConfigured(): boolean {
  const s = getSettings();
  switch (s.asrProvider) {
    case "local":
      return localModelStatus(s.localModel || "base-q5_1").downloaded;
    case "openai":
      return Boolean(s.asrBaseUrl && s.asrApiKey);
    case "doubao":
      return hasAppKey();
    default:
      return true; // chatgpt 登录态为异步会话级状态，按已配置处理
  }
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setToolTip(`SpeakType - ${t("app.tagline")}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t("tray.open"), click: () => showMain() },
      {
        // 直接弹豆包桥接网页会让新用户误以为必须登录豆包：改为打开 设置→语音识别，桥接入口保留在豆包 provider 卡片里
        label: asrConfigured() ? t("tray.settings") : t("tray.activate"),
        click: () => {
          showMain();
          mainWin?.webContents.send("goto", { page: "settings", tab: "voice" });
        },
      },
      { type: "separator" },
      {
        label: t("tray.quit"),
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function setupTray(): void {
  tray = new Tray(trayIcon());
  refreshTrayMenu();
  tray.on("click", () => showMain());
}

function showMain(): void {
  if (!mainWin || mainWin.isDestroyed()) mainWin = createMainWindow();
  else {
    mainWin.show();
    mainWin.focus();
  }
  // Windows 前台锁会让窗口在当前应用后面打开：短暂置顶再放下，保证引导可见
  const win = mainWin;
  win.setAlwaysOnTop(true);
  setTimeout(() => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(false);
  }, 800);
}

function registerIpc(): void {
  ipcMain.handle("app:init", () => ({
    settings: getSettings(),
    personas: getPersonas(),
    history: getHistory(),
    stats: getStats(),
    onboarded: isOnboarded(),
    doubaoReady: hasAppKey(),
    holdKeyChoices: HOLD_KEY_CHOICES,
    rewriteKeyChoices: REWRITE_KEY_CHOICES,
    toggleKeyChoices: TOGGLE_KEY_CHOICES,
    status: dictation.status(),
    version: app.isPackaged ? app.getVersion() : pkg.version,
    commit: typeof __COMMIT__ === "string" ? __COMMIT__ : "unknown",
    systemLocale: app.getLocale() || "zh-CN",
  }));
  ipcMain.handle("settings:update", async (_e, patch: Partial<Settings>) => {
    const prevModel = getSettings().localModel;
    const next = setSettings(patch);
    applyHotkeys(next);
    // 旧模型 worker 常驻数百 MB～GB：切换本身就是「不再用它」信号，立即释放而非等空闲计时
    if ("localModel" in patch && next.localModel !== prevModel) {
      releaseSherpaWorker();
      stopLocalServer();
    }
    // 切走豆包 provider 时收掉隐藏预载的桥接窗口，不让其继续保持豆包连接
    if ("asrProvider" in patch && next.asrProvider !== "doubao") closeBridge();
    if ("asrProvider" in patch && next.asrProvider !== "chatgpt") closeChatgptBridge();
    if ("launchAtLogin" in patch) await applyLaunchAtLogin(next.launchAtLogin);
    if (
      "uiLanguage" in patch ||
      "asrProvider" in patch ||
      "localModel" in patch ||
      "asrBaseUrl" in patch ||
      "asrApiKey" in patch
    ) {
      refreshTrayMenu();
    }
    if ("remoteMicEnabled" in patch || "remoteMicMode" in patch || "remoteRelayUrl" in patch) {
      await syncRemoteMic(next.remoteMicEnabled);
    }
    pushSettings();
    return next;
  });
  // 轻量新版提示（非自动更新）：启动后空闲预拨一次 GitHub latest release。
  // 匿名 API 限额 60 次/时/IP，共享出口 IP 极易耗尽：成功结果落盘缓存 24h，失败 30 分钟后重试至多 3 次，仍失败静默（离线不打扰）
  let latestTag = "";
  const latestCacheFile = join(app.getPath("userData"), "latest-release.json");
  try {
    const cached = JSON.parse(readFileSync(latestCacheFile, "utf8")) as { tag?: string; at?: number };
    if (cached.tag && Date.now() - (cached.at ?? 0) < 24 * 3600_000) latestTag = cached.tag;
  } catch {
    // 无缓存或损坏：当作首次拨号
  }
  let latestRetriesLeft = 3;
  const fetchLatestTag = async (): Promise<string> => {
    if (latestTag) return latestTag;
    try {
      const res = await fetch("https://api.github.com/repos/wookat/speaktype/releases/latest", {
        headers: { accept: "application/vnd.github+json" },
      });
      if (res.ok) {
        latestTag = ((await res.json()) as { tag_name?: string }).tag_name ?? "";
        log.info(`latest release prefetched: ${latestTag || "(none)"}`);
        if (latestTag) {
          try {
            writeFileSync(latestCacheFile, JSON.stringify({ tag: latestTag, at: Date.now() }));
          } catch {
            // 缓存写入失败不影响本次提示
          }
        }
      }
    } catch {
      // 离线：下面统一走重试
    }
    if (!latestTag && latestRetriesLeft-- > 0) setTimeout(() => void fetchLatestTag(), 30 * 60_000);
    return latestTag;
  };
  setTimeout(() => void fetchLatestTag(), 5000);
  ipcMain.handle("app:latestVersion", () => fetchLatestTag());
  ipcMain.handle("hotkey:capture", () => hotkeys.captureNext());
  ipcMain.handle("apps:running", () => runningApps());
  ipcMain.handle("personas:save", (_e, list: Persona[]) => {
    setCustomPersonas(list);
    pushSettings();
    return getPersonas();
  });
  ipcMain.handle("history:list", () => getHistory());
  ipcMain.handle("history:clear", () => {
    clearHistory();
    clearFailedAudio();
    return getHistory();
  });
  ipcMain.handle("history:delete", (_e, ids: string[]) => {
    deleteHistory(ids);
    return getHistory();
  });
  ipcMain.handle("history:restore", (_e, item: HistoryItem, index: number) => {
    restoreHistory(item, index);
    return getHistory();
  });
  ipcMain.handle("history:retry", (_e, id: string) => dictation.retryHistory(id));
  ipcMain.handle("history:correct", (_e, id: string, text: string) => {
    updateHistoryItem(id, { text });
    return getHistory();
  });
  ipcMain.handle("stats:get", () => getStats());
  ipcMain.handle("doubao:ready", () => hasAppKey());
  ipcMain.handle("doubao:activate", () => showBridge());
  ipcMain.handle("chatgpt:ready", () => chatgptLoggedIn());
  ipcMain.handle("chatgpt:login", () => showChatgptLogin());
  ipcMain.handle("chatgpt:test", () => testChatgpt());
  ipcMain.handle("doubao:test", () => testDoubao());
  ipcMain.handle("onboarding:done", () => setOnboarded(true));
  ipcMain.handle("record:toggle", () => dictation.toggleHandsFree());
  ipcMain.handle("record:cancel", () => dictation.cancel());
  ipcMain.handle("local:models", () => LOCAL_MODELS.map((m) => ({ ...m })));
  ipcMain.handle("local:status", (_e, model: string) => localModelStatus(model));
  ipcMain.handle("local:download", async (_e, model: string) => {
    const result = await downloadLocalModel(model);
    if (result.downloaded) {
      showToast(t("toast.modelReady"), t("toast.modelReadyBody"));
      refreshTrayMenu();
    }
    return result;
  });
  ipcMain.handle("vad:status", () => vadStatus());
  ipcMain.handle("vad:download", () => downloadVad());
  ipcMain.handle("punct:status", () => punctStatus());
  ipcMain.handle("punct:download", () => downloadPunct());
  ipcMain.handle("transcribe:start", (_e, buffer: ArrayBuffer, fileName?: string) =>
    startTranscribe(getSettings(), new Float32Array(buffer), fileName),
  );
  ipcMain.handle("transcribe:cancel", () => cancelTranscribe());
  ipcMain.handle("transcribe:state", () => transcribeState());
  ipcMain.handle("polish:test", () => testPolish(getSettings()));
  ipcMain.handle("remotemic:info", () => remoteMicInfo());
  ipcMain.handle("asr:test", () => testAsr(getSettings()));
  ipcMain.handle("mic:list", async () => {
    const win = recorderWin;
    if (!win || win.isDestroyed()) return [];
    const devices = new Promise<Array<{ deviceId: string; label: string }>>((resolve) => {
      const timer = setTimeout(() => resolve([]), 5000);
      ipcMain.once("recorder:devices", (_e, list: Array<{ deviceId: string; label: string }>) => {
        clearTimeout(timer);
        resolve(list);
      });
    });
    win.webContents.send("recorder:enumerate");
    return devices;
  });
  ipcMain.handle("mic:test", (_e, on: boolean) => {
    if (dictation.isRecording()) return; // 正在语音输入时不抢麦
    const win = recorderWin;
    if (!win || win.isDestroyed()) return;
    if (on) win.webContents.send("recorder:start", { deviceId: getSettings().micDeviceId });
    else win.webContents.send("recorder:stop");
  });
  ipcMain.handle("window:minimize", () => BrowserWindow.getFocusedWindow()?.minimize());
  ipcMain.handle("window:maximize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle("window:close", () => BrowserWindow.getFocusedWindow()?.close());
  ipcMain.handle("open:external", (_e, url: string) => shell.openExternal(url));
  ipcMain.handle("log:open", () => shell.showItemInFolder(log.transports.file.getFile().path));

  ipcMain.on("recorder:pcm", (_e, chunk: ArrayBuffer) => {
    dictation.pushPcm(new Int16Array(chunk));
  });
  ipcMain.on("recorder:level", (_e, level: number) => {
    for (const win of [panelWin, mainWin]) {
      if (win && !win.isDestroyed()) win.webContents.send("level", level);
    }
  });
  ipcMain.on("recorder:error", (_e, message: string) => {
    dictation.cancel();
    const body =
      message === "@micDenied"
        ? t("error.micDenied")
        : message === "@micNotFound"
          ? t("error.micNotFound")
          : message;
    showToast(t("toast.micUnavailable"), body);
  });
}

void app.whenReady().then(() => {
  initMuteRecovery(app.getPath("userData"));
  pruneStalePersonaRefs();
  registerIpc();
  const startHidden = getSettings().startMinimized && process.argv.includes("--hidden");
  mainWin = createMainWindow(!startHidden);
  panelWin = createPanelWindow();
  toastWin = createToastWindow();
  recorderWin = createRecorderWindow();
  setupTray();

  onAppKeyCaptured(() => pushSettings());
  onLocalModelStatus((s) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("local:model", s);
  });
  onVadStatus((s) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("vad:status", s);
  });
  cleanupLegacyVad();
  onPunctStatus((s) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("punct:status", s);
  });
  onTranscribeState((s) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("transcribe:state", s);
  });

  const settings = getSettings();
  applyHotkeys(settings);
  hotkeys.start();
  void applyLaunchAtLogin(settings.launchAtLogin);
  // 仅当前 provider 是豆包才预载桥接窗口：其他 provider 下残留的 app key 缓存不应触发任何出网
  if (settings.asrProvider === "doubao" && hasAppKey()) ensureBridge();
  if (settings.remoteMicEnabled) void syncRemoteMic(true);
  // 启动后空闲预热离线模型，把 ONNX 冷启动成本移出用户第一句
  if (settings.asrProvider === "local" && isSherpaModel(settings.localModel)) {
    setTimeout(() => prewarmSherpa(getSettings().localModel, getSettings().language), 3000);
  }
  // 设置写盘被拒（文件只读/权限不足）时给可见提示，否则重启后改动静默丢失
  onPersistError(() => showToast(t("toast.saveFailed"), t("toast.saveFailedBody")));
  if (wasStoreRecovered()) {
    setTimeout(() => showToast(t("toast.configRecovered"), t("toast.configRecoveredBody")), 1500);
  }
  if (wasHistoryRecovered()) {
    setTimeout(() => showToast(t("toast.historyRecovered"), t("toast.historyRecoveredBody")), 2600);
  }

  mainWin.on("close", (ev) => {
    // 关主窗口 = 收进托盘继续待命，从托盘退出才真正退出
    if (quitting) return;
    ev.preventDefault();
    mainWin?.hide();
  });

  app.on("second-instance", () => showMain());
});

app.on("before-quit", () => {
  quitting = true;
  hotkeys.stop();
  stopLocalServer();
  void stopRemoteMic();
});

app.on("window-all-closed", () => {
  if (quitting) app.quit();
});
