import { BrowserWindow, nativeTheme, screen, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSettings, getWindowBounds, setWindowBounds } from "./store";

function isDarkTheme(): boolean {
  const theme = getSettings().theme;
  return theme === "dark" || (theme === "system" && nativeTheme.shouldUseDarkColors);
}

const dir = fileURLToPath(new URL(".", import.meta.url));
const preload = join(dir, "../preload/index.mjs");
const doubaoPreload = join(dir, "../preload/doubao.mjs");
const rendererDir = join(dir, "../renderer");
const devServer = process.env["ELECTRON_RENDERER_URL"];

export const DOUBAO_URL = "https://www.doubao.com/chat";
export const CHATGPT_URL = "https://chatgpt.com/";

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 150;
const TOAST_WIDTH = 520;
const TOAST_HEIGHT = 92;

function intersects(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function load(win: BrowserWindow, page: string): void {
  if (devServer) void win.loadURL(`${devServer}/${page}.html`);
  else void win.loadFile(join(rendererDir, `${page}.html`));
}

export function createMainWindow(visible = true): BrowserWindow {
  const saved = getWindowBounds();
  const win = new BrowserWindow({
    width: saved?.width ?? 1100,
    height: saved?.height ?? 740,
    ...(saved?.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : { center: true }),
    minWidth: 820,
    minHeight: 560,
    frame: false,
    show: false,
    backgroundColor: isDarkTheme() ? "#14161d" : "#f7f7f9",
    title: "SpeakType",
    webPreferences: { preload, sandbox: false },
  });
  // 保存的位置可能落在已拔掉的显示器上：完全不可见时回到主屏居中
  if (saved?.x !== undefined && !screen.getAllDisplays().some((d) => intersects(win.getBounds(), d.workArea))) {
    win.center();
  }
  // 隐藏窗口调用 maximize() 会被 Electron 强制显示，推迟到首次 show 再恢复最大化
  if (saved?.maximized) {
    if (visible) win.maximize();
    else win.once("show", () => win.maximize());
  }
  const persistBounds = (): void => {
    if (win.isMinimized()) return;
    const maximized = win.isMaximized();
    const b = maximized ? win.getNormalBounds() : win.getBounds();
    setWindowBounds({ x: b.x, y: b.y, width: b.width, height: b.height, maximized });
  };
  win.on("close", persistBounds);
  // 强杀/崩溃时 close 不触发：移动/缩放后延迟落盘一次
  let boundsTimer: NodeJS.Timeout | null = null;
  const persistLater = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      boundsTimer = null;
      if (!win.isDestroyed()) persistBounds();
    }, 800);
  };
  win.on("resize", persistLater);
  win.on("move", persistLater);
  win.on("maximize", persistLater);
  win.on("unmaximize", persistLater);
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

/**
 * ChatGPT 桥接窗口：转写走 chatgpt.com 自己的 /backend-api/transcribe，
 * 依赖该站点的登录态与 Cloudflare 校验，必须在站内页面发起请求。
 */
export function createChatgptWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 1080,
    height: 760,
    title: "ChatGPT（SpeakType 桥接）",
    webPreferences: { sandbox: true, backgroundThrottling: false },
  });
  // Google OAuth 拒绝内嵌浏览器（"此浏览器或应用可能不安全"）：UA 里去掉
  // Electron/应用名标记，伪装成普通 Chrome 才能在窗口内完成谷歌登录
  win.webContents.userAgent = win.webContents.userAgent
    .replace(/\sSpeakType\/[\d.]+/i, "")
    .replace(/\sElectron\/[\d.]+/i, "");
  void win.loadURL(CHATGPT_URL);
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
