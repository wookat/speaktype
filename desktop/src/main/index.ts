// 必须最先 import：在任何 electron-store 实例化（会立即写出默认 speaktype.json）之前完成旧配置迁移
import "./migrate";
import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import AutoLaunch from "auto-launch";
import log from "electron-log/main.js";
import pkg from "../../package.json";

// 构建时由 electron.vite.config.ts 的 define 注入的 git 短 commit
declare const __COMMIT__: string;
import { localizePersona } from "../shared/personas";
import type { Persona, Settings, StatusPayload } from "../shared/types";
import { Dictation } from "./dictation";
import { ensureBridge, hasAppKey, onAppKeyCaptured, showBridge } from "./doubao";
import { HOLD_KEY_CHOICES, TOGGLE_KEY_CHOICES, HotkeyManager } from "./hotkey";
import { t, translator } from "./i18n";
import { testAsr } from "./asr";
import { LOCAL_MODELS, downloadLocalModel, localModelStatus, onLocalModelStatus, stopLocalServer } from "./localasr";
import { testPolish } from "./polish";
import {
  clearHistory,
  deleteHistory,
  getHistory,
  getPersonas,
  getSettings,
  getStats,
  isOnboarded,
  setCustomPersonas,
  setOnboarded,
  setSettings,
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
  if (!panelWin || panelWin.isDestroyed()) return;
  if (payload.state === "idle" && !payload.partial) panelWin.hide();
  else if (!panelWin.isVisible()) {
    dockPanel(panelWin);
    panelWin.showInactive();
  }
}

function showToast(title: string, body: string): void {
  if (!toastWin || toastWin.isDestroyed()) return;
  toastWin.webContents.send("toast", { title, body });
  dockToast(toastWin);
  toastWin.showInactive();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastWin?.hide(), 2600);
}

const dictation = new Dictation({
  recorder: () => recorderWin,
  broadcast,
  showToast,
});

const hotkeys = new HotkeyManager({
  onWarmUp: () => dictation.warmUp(),
  onHoldStart: () => void dictation.start("hold"),
  onHoldEnd: () => void dictation.stop(),
  onToggle: () => {
    if (dictation.isRecording()) void dictation.stop();
    else void dictation.start("toggle");
  },
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
  hotkeys.configure(settings.hotkeyHold, settings.hotkeyToggle, settings.holdDelayMs, settings.personaHotkeysEnabled);
}

function pushSettings(): void {
  const payload = { settings: getSettings(), personas: getPersonas() };
  for (const win of [mainWin, panelWin]) {
    if (win && !win.isDestroyed()) win.webContents.send("settings", payload);
  }
  broadcast(dictation.status());
}

// isHidden 会给自启命令行追加 --hidden，配合“开机时不展示应用窗口”判断静默启动
const autoLaunch = new AutoLaunch({ name: "SpeakType", isHidden: true });

async function applyLaunchAtLogin(enabled: boolean): Promise<void> {
  try {
    const current = await autoLaunch.isEnabled();
    if (enabled && !current) await autoLaunch.enable();
    if (!enabled && current) await autoLaunch.disable();
  } catch (error) {
    log.warn("auto-launch failed", error);
  }
}

function trayIcon(): Electron.NativeImage {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  return nativeImage.createFromPath(join(dir, "../../build/icon.png")).resize({ width: 16, height: 16 });
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setToolTip(`SpeakType - ${t("app.tagline")}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t("tray.open"), click: () => showMain() },
      { label: t("tray.activate"), click: () => showBridge() },
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
    toggleKeyChoices: TOGGLE_KEY_CHOICES,
    status: dictation.status(),
    version: app.isPackaged ? app.getVersion() : pkg.version,
    commit: typeof __COMMIT__ === "string" ? __COMMIT__ : "unknown",
    systemLocale: app.getLocale() || "zh-CN",
  }));
  ipcMain.handle("settings:update", async (_e, patch: Partial<Settings>) => {
    const next = setSettings(patch);
    applyHotkeys(next);
    if ("launchAtLogin" in patch) await applyLaunchAtLogin(next.launchAtLogin);
    if ("uiLanguage" in patch) refreshTrayMenu();
    pushSettings();
    return next;
  });
  ipcMain.handle("personas:save", (_e, list: Persona[]) => {
    setCustomPersonas(list);
    pushSettings();
    return getPersonas();
  });
  ipcMain.handle("history:list", () => getHistory());
  ipcMain.handle("history:clear", () => {
    clearHistory();
    return getHistory();
  });
  ipcMain.handle("history:delete", (_e, ids: string[]) => {
    deleteHistory(ids);
    return getHistory();
  });
  ipcMain.handle("history:retry", (_e, id: string) => dictation.retryHistory(id));
  ipcMain.handle("stats:get", () => getStats());
  ipcMain.handle("doubao:ready", () => hasAppKey());
  ipcMain.handle("doubao:activate", () => showBridge());
  ipcMain.handle("onboarding:done", () => setOnboarded(true));
  ipcMain.handle("record:toggle", () => {
    if (dictation.isRecording()) void dictation.stop();
    else void dictation.start("toggle");
  });
  ipcMain.handle("record:cancel", () => dictation.cancel());
  ipcMain.handle("local:models", () => LOCAL_MODELS.map((m) => ({ ...m })));
  ipcMain.handle("local:status", (_e, model: string) => localModelStatus(model));
  ipcMain.handle("local:download", (_e, model: string) => downloadLocalModel(model));
  ipcMain.handle("polish:test", () => testPolish(getSettings()));
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

  const settings = getSettings();
  applyHotkeys(settings);
  hotkeys.start();
  void applyLaunchAtLogin(settings.launchAtLogin);
  if (hasAppKey()) ensureBridge();

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
});

app.on("window-all-closed", () => {
  if (quitting) app.quit();
});
