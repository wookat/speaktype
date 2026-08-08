import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import AutoLaunch from "auto-launch";
import log from "electron-log/main.js";
import type { Persona, Settings, StatusPayload } from "../shared/types";
import { Dictation } from "./dictation";
import { ensureBridge, hasAppKey, showBridge } from "./doubao";
import { HOLD_KEY_CHOICES, HotkeyManager } from "./hotkey";
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
  onHoldStart: () => void dictation.start(),
  onHoldEnd: () => void dictation.stop(),
  onToggle: () => {
    if (dictation.isRecording()) void dictation.stop();
    else void dictation.start();
  },
  onPersona: (index) => {
    const personas = getPersonas();
    const persona = personas[index];
    if (!persona) return;
    setSettings({ personaId: persona.id });
    pushSettings();
    showToast("当前人设", `${persona.name}（Alt+${index + 1} 切换）`);
  },
});

function applyHotkeys(settings: Settings): void {
  hotkeys.configure(settings.hotkeyHold, settings.hotkeyToggle, settings.holdDelayMs);
}

function pushSettings(): void {
  const payload = { settings: getSettings(), personas: getPersonas() };
  for (const win of [mainWin, panelWin]) {
    if (win && !win.isDestroyed()) win.webContents.send("settings", payload);
  }
  broadcast(dictation.status());
}

const autoLaunch = new AutoLaunch({ name: "SpeakType" });

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

function setupTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip("SpeakType 语音输入法");
  const menu = Menu.buildFromTemplate([
    { label: "打开 SpeakType", click: () => showMain() },
    { label: "去豆包登录/激活", click: () => showBridge() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
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
    status: dictation.status(),
    version: app.getVersion(),
  }));
  ipcMain.handle("settings:update", async (_e, patch: Partial<Settings>) => {
    const next = setSettings(patch);
    applyHotkeys(next);
    if ("launchAtLogin" in patch) await applyLaunchAtLogin(next.launchAtLogin);
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
  ipcMain.handle("stats:get", () => getStats());
  ipcMain.handle("doubao:ready", () => hasAppKey());
  ipcMain.handle("doubao:activate", () => showBridge());
  ipcMain.handle("onboarding:done", () => setOnboarded(true));
  ipcMain.handle("record:toggle", () => {
    if (dictation.isRecording()) void dictation.stop();
    else void dictation.start();
  });
  ipcMain.handle("record:cancel", () => dictation.cancel());
  ipcMain.handle("window:minimize", () => BrowserWindow.getFocusedWindow()?.minimize());
  ipcMain.handle("window:close", () => BrowserWindow.getFocusedWindow()?.close());
  ipcMain.handle("open:external", (_e, url: string) => shell.openExternal(url));

  ipcMain.on("recorder:pcm", (_e, chunk: ArrayBuffer) => {
    dictation.pushPcm(new Int16Array(chunk));
  });
  ipcMain.on("recorder:level", (_e, level: number) => {
    if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send("level", level);
  });
  ipcMain.on("recorder:error", (_e, message: string) => {
    dictation.cancel();
    showToast("麦克风不可用", message);
  });
}

void app.whenReady().then(() => {
  registerIpc();
  mainWin = createMainWindow();
  panelWin = createPanelWindow();
  toastWin = createToastWindow();
  recorderWin = createRecorderWindow();
  setupTray();

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
});

app.on("window-all-closed", () => {
  if (quitting) app.quit();
});
