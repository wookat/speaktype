import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import AutoLaunch from "auto-launch";
import log from "electron-log/main.js";
import pkg from "../../package.json";
import { localizePersona } from "../shared/personas";
import type { Persona, Settings, StatusPayload } from "../shared/types";
import { Dictation } from "./dictation";
import { ensureBridge, hasAppKey, onAppKeyCaptured, showBridge } from "./doubao";
import { HOLD_KEY_CHOICES, TOGGLE_KEY_CHOICES, HotkeyManager } from "./hotkey";
import { t, translator } from "./i18n";
import { testAsr } from "./asr";
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
  ipcMain.handle("stats:get", () => getStats());
  ipcMain.handle("doubao:ready", () => hasAppKey());
  ipcMain.handle("doubao:activate", () => showBridge());
  ipcMain.handle("onboarding:done", () => setOnboarded(true));
  ipcMain.handle("record:toggle", () => {
    if (dictation.isRecording()) void dictation.stop();
    else void dictation.start();
  });
  ipcMain.handle("record:cancel", () => dictation.cancel());
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
    showToast(t("toast.micUnavailable"), message);
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
