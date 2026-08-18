import { basename } from "path";
import { execFile } from "child_process";
import koffi from "koffi";
import log from "electron-log";

/**
 * 取当前前台窗口所属程序（如 "code.exe" / "wechat.exe"），用于按应用自动切人设。
 * 只读进程名与窗口标题，不读窗口内容，全程本地。
 */

const isMac = process.platform === "darwin";

interface Win32Api {
  activeApp(): { app: string; title: string } | null;
  foregroundWindowKey(): string | null;
  foregroundPid(): number | null;
  hasPasteTarget(): boolean;
}

function loadWin32(): Win32Api | null {
  try {
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    const GetForegroundWindow = user32.func("void *GetForegroundWindow()");
    const GetClassNameW = user32.func("int GetClassNameW(void *hWnd, _Out_ uint16_t *buf, int len)");
    const GetWindowTextW = user32.func("int GetWindowTextW(void *hWnd, _Out_ uint16_t *buf, int len)");
    const GetWindowThreadProcessId = user32.func(
      "uint32 GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *pid)",
    );
    const GUITHREADINFO = koffi.struct("GUITHREADINFO", {
      cbSize: "uint32",
      flags: "uint32",
      hwndActive: "uintptr",
      hwndFocus: "uintptr",
      hwndCapture: "uintptr",
      hwndMenuOwner: "uintptr",
      hwndMoveSize: "uintptr",
      hwndCaret: "uintptr",
      rcCaret: koffi.array("int32", 4),
    });
    const GetGUIThreadInfo = user32.func(
      "bool GetGUIThreadInfo(uint32 idThread, _Inout_ GUITHREADINFO *info)",
    );
    const OpenProcess = kernel32.func("void *OpenProcess(uint32 access, bool inherit, uint32 pid)");
    const CloseHandle = kernel32.func("bool CloseHandle(void *h)");
    const QueryFullProcessImageNameW = kernel32.func(
      "bool QueryFullProcessImageNameW(void *h, uint32 flags, _Out_ uint16_t *buf, _Inout_ uint32 *size)",
    );
    const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    const decode = (buf: Uint16Array): string => {
      const end = buf.indexOf(0);
      return Buffer.from(buf.buffer, 0, (end < 0 ? buf.length : end) * 2).toString("utf16le");
    };

    return {
      activeApp() {
        const hwnd = GetForegroundWindow();
        if (!hwnd) return null;
        const titleBuf = new Uint16Array(512);
        GetWindowTextW(hwnd, titleBuf, titleBuf.length);
        const pid = [0];
        GetWindowThreadProcessId(hwnd, pid);
        let app = "";
        const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
        if (handle) {
          const pathBuf = new Uint16Array(1024);
          const size = [pathBuf.length];
          if (QueryFullProcessImageNameW(handle, 0, pathBuf, size)) app = basename(decode(pathBuf));
          CloseHandle(handle);
        }
        return { app: app.toLowerCase(), title: decode(titleBuf) };
      },
      foregroundWindowKey() {
        const hwnd = GetForegroundWindow();
        return hwnd ? String(koffi.address(hwnd)) : null;
      },
      foregroundPid() {
        const hwnd = GetForegroundWindow();
        if (!hwnd) return null;
        const pid = [0];
        GetWindowThreadProcessId(hwnd, pid);
        return pid[0] || null;
      },
      hasPasteTarget() {
        const hwnd = GetForegroundWindow();
        if (!hwnd) return false;
        const classBuf = new Uint16Array(64);
        GetClassNameW(hwnd, classBuf, classBuf.length);
        const cls = decode(classBuf);
        // 桌面壳窗口（Progman/WorkerW）不是输入目标，盲发 Ctrl+V 会静默丢字
        if (cls === "Progman" || cls === "WorkerW") return false;
        // 窗口在但没有键盘焦点控件（如点在空白区）时粘贴同样不会生效
        const tid = GetWindowThreadProcessId(hwnd, [0]);
        if (tid) {
          const info = {
            cbSize: koffi.sizeof(GUITHREADINFO),
            flags: 0,
            hwndActive: 0,
            hwndFocus: 0,
            hwndCapture: 0,
            hwndMenuOwner: 0,
            hwndMoveSize: 0,
            hwndCaret: 0,
            rcCaret: [0, 0, 0, 0],
          };
          if (GetGUIThreadInfo(tid, info) && !info.hwndFocus) return false;
        }
        return true;
      },
    };
  } catch (error) {
    log.warn("active window api unavailable", error);
    return null;
  }
}

const win32 = isMac ? null : loadWin32();
let macCache: { app: string; title: string } | null = null;

// macOS 取前台应用要走 osascript（异步），这里后台刷新缓存，读取侧保持同步
if (isMac) {
  setInterval(() => {
    execFile(
      "osascript",
      ["-e", 'tell application "System Events" to name of first application process whose frontmost is true'],
      (error, stdout) => {
        if (!error) macCache = { app: stdout.trim().toLowerCase(), title: "" };
      },
    );
  }, 2000).unref();
}

// Windows 系统壳进程：有窗口句柄但用户不会拿它当落字目标，下拉里只是噪音
const SYSTEM_APPS = new Set([
  "applicationframehost.exe",
  "dwm.exe",
  "shellexperiencehost.exe",
  "shutdown.exe",
  "searchhost.exe",
  "startmenuexperiencehost.exe",
  "systemsettings.exe",
  "taskmgr.exe",
  "textinputhost.exe",
  "speaktype.exe",
]);

/** 列出当前有可见窗口的进程名（如 "code.exe"），供人设应用规则下拉选择 */
export function runningApps(): Promise<string[]> {
  return new Promise((resolve) => {
    if (isMac) {
      execFile(
        "osascript",
        ["-e", 'tell application "System Events" to name of every application process whose visible is true'],
        (error, stdout) => {
          if (error) return resolve([]);
          resolve([...new Set(stdout.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))].sort());
        },
      );
      return;
    }
    execFile(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty ProcessName",
      ],
      (error, stdout) => {
        if (error) return resolve([]);
        const names = stdout
          .split(/\r?\n/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .map((s) => `${s}.exe`)
          .filter((s) => !SYSTEM_APPS.has(s));
        resolve([...new Set(names)].sort());
      },
    );
  });
}

export function activeApp(): { app: string; title: string } | null {
  if (isMac) return macCache;
  return win32?.activeApp() ?? null;
}

/** 前台窗口的稳定标识（hwnd）。标题变化不影响；取不到时返回 null */
export function foregroundWindowKey(): string | null {
  if (isMac) return macCache?.app ?? null;
  return win32?.foregroundWindowKey() ?? null;
}

/** 前台是否有可粘贴的目标窗口（桌面壳/无前台不算；自身窗口算）。判断不了时按有目标处理 */
export function hasPasteTarget(): boolean {
  if (isMac) return true;
  return win32?.hasPasteTarget() ?? true;
}

/** 前台窗口所属进程 id；取不到时返回 null */
export function foregroundPid(): number | null {
  if (isMac) return null;
  return win32?.foregroundPid() ?? null;
}

/** 终端类前台进程：落字后一回车就执行，句级格式（尾句号/句首大写）会让命令出错 */
const TERMINAL_APPS = new Set([
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe",
  "windowsterminal.exe",
  "openconsole.exe",
  "conhost.exe",
  "alacritty.exe",
  "wezterm-gui.exe",
  "mintty.exe",
  "hyper.exe",
  "wsl.exe",
  "ubuntu.exe",
]);

export function isTerminalForeground(): boolean {
  const app = activeApp()?.app.toLowerCase();
  return app ? TERMINAL_APPS.has(app) : false;
}

/**
 * 按规则挑人设：规则的 match 命中进程名或窗口标题（不区分大小写）即采用，
 * 先命中先用，全不命中返回 null 走当前人设。
 */
export function personaForActiveApp(
  rules: Array<{ match: string; personaId: string }>,
): string | null {
  if (rules.length === 0) return null;
  const current = activeApp();
  if (!current) return null;
  const haystack = `${current.app} ${current.title}`.toLowerCase();
  for (const rule of rules) {
    const needle = rule.match.trim().toLowerCase();
    if (needle && haystack.includes(needle)) return rule.personaId;
  }
  return null;
}
