import { BrowserWindow, screen, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const preload = join(dir, "../preload/index.mjs");
const doubaoPreload = join(dir, "../preload/doubao.mjs");
const rendererDir = join(dir, "../renderer");
const devServer = process.env["ELECTRON_RENDERER_URL"];

export const DOUBAO_URL = "https://www.doubao.com/chat";

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 150;
const TOAST_WIDTH = 520;
const TOAST_HEIGHT = 92;

function load(win: BrowserWindow, page: string): void {
  if (devServer) void win.loadURL(`${devServer}/${page}.html`);
  else void win.loadFile(join(rendererDir, `${page}.html`));
}

export function createMainWindow(visible = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 940,
    minHeight: 600,
    frame: false,
    show: false,
    center: true,
    backgroundColor: "#f7f7f9",
    title: "SpeakType",
    webPreferences: { preload, sandbox: false },
  });
  if (visible) win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  load(win, "index");
  return win;
}

/** 贴屏幕底部居中的悬浮波形条，不抢焦点（抢了就会打断用户正在输入的窗口） */
export function createPanelWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: { preload, sandbox: false },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(false);
  load(win, "panel");
  return win;
}

export function createToastWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: { preload, sandbox: false },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  load(win, "toast");
  return win;
}

/** 隐藏的录音渲染进程：主进程没有 getUserMedia，麦克风必须在渲染层开 */
export function createRecorderWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    skipTaskbar: true,
    webPreferences: { preload, sandbox: false, backgroundThrottling: false },
  });
  load(win, "recorder");
  return win;
}

/**
 * 豆包桥接窗口：VoiceGenie 靠 doubao.com 的登录态，握手必须发生在该站点内，
 * 所以这里开一个走同一 session 的窗口，由 preload 建 WebSocket 并转发字节。
 */
export function createBridgeWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 1080,
    height: 760,
    title: "豆包语音（SpeakType 桥接）",
    webPreferences: { preload: doubaoPreload, sandbox: false, backgroundThrottling: false },
  });
  void win.loadURL(DOUBAO_URL);
  return win;
}

/** 把悬浮条放到鼠标所在屏幕的底部居中 */
export function dockPanel(win: BrowserWindow): void {
  const point = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(point).workArea;
  win.setBounds({
    x: Math.round(area.x + (area.width - PANEL_WIDTH) / 2),
    y: Math.round(area.y + area.height - PANEL_HEIGHT - 12),
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
  });
}

export function dockToast(win: BrowserWindow): void {
  const point = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(point).workArea;
  win.setBounds({
    x: Math.round(area.x + (area.width - TOAST_WIDTH) / 2),
    y: Math.round(area.y + area.height - TOAST_HEIGHT - 176),
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
  });
}
