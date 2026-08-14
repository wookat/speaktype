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
}

function loadWin32(): Win32Api | null {
  try {
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    const GetForegroundWindow = user32.func("void *GetForegroundWindow()");
    const GetWindowTextW = user32.func("int GetWindowTextW(void *hWnd, _Out_ uint16_t *buf, int len)");
    const GetWindowThreadProcessId = user32.func(
      "uint32 GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *pid)",
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
          .map((s) => `${s}.exe`);
        resolve([...new Set(names)].sort());
      },
    );
  });
}

export function activeApp(): { app: string; title: string } | null {
  if (isMac) return macCache;
  return win32?.activeApp() ?? null;
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
