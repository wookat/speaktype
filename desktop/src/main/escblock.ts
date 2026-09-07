import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import koffi from "koffi";
import log from "electron-log/main.js";

/**
 * 录音期间用 WH_KEYBOARD_LL 低级键盘钩子在系统层吞掉 Esc。
 * Ctrl+Esc 是 Windows shell 保留组合，RegisterHotKey/globalShortcut 拦不住（开始菜单照弹），
 * 只有低级钩子对 Esc 返回非零才能让 shell 收不到组合键。钩子只在录音会话期间安装，空闲即卸载。
 *
 * 钩子必须跑在独立线程：低级钩子回调由安装它的线程执行，Windows 每次回调只等约 300ms
 * （LowLevelHooksTimeout），超时即整条丢弃该按键事件并静默卸载钩子——后面链上的 uiohook
 * 也收不到。主进程在下载收尾、模型冷加载、同步落盘时常卡 0.3～1s，钩子挂在主线程会把
 * 用户松开热键的 keyup 吞掉，会话就此挂住不收尾。worker 线程只跑一个消息循环，永不阻塞。
 */

const isWin = process.platform === "win32";

interface EscBlockApi {
  install(onEscape: () => void): void;
  uninstall(): void;
  dispose(): void;
}

const WM_QUIT = 0x0012;
const WM_APP = 0x8000;
const CMD_INSTALL = WM_APP + 1;
const CMD_UNINSTALL = WM_APP + 2;

// 钩子线程：GetMessageW 阻塞期间由系统回调钩子；主进程通过 PostThreadMessage 下发装/卸命令
const workerSource = `
const { parentPort, workerData } = require("worker_threads");
const koffi = require(workerData.modulePath);
const WH_KEYBOARD_LL = 13, WM_KEYDOWN = 0x0100, WM_SYSKEYDOWN = 0x0104, VK_ESCAPE = 0x1b;
const PM_NOREMOVE = 0;
const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");
const KBDLLHOOKSTRUCT = koffi.struct("KBDLLHOOKSTRUCT", {
  vkCode: "uint32", scanCode: "uint32", flags: "uint32", time: "uint32", dwExtraInfo: "uintptr",
});
const MSG = koffi.struct("MSG", {
  hwnd: "void *", message: "uint32", wParam: "uintptr", lParam: "intptr", time: "uint32", ptX: "int32", ptY: "int32",
});
const HookProc = koffi.proto("intptr __stdcall EscHookProc(int nCode, uintptr wParam, KBDLLHOOKSTRUCT *lParam)");
const SetWindowsHookExW = user32.func("void *SetWindowsHookExW(int idHook, EscHookProc *lpfn, void *hMod, uint32 dwThreadId)");
const UnhookWindowsHookEx = user32.func("bool UnhookWindowsHookEx(void *hhk)");
const CallNextHookEx = user32.func("intptr CallNextHookEx(void *hhk, int nCode, uintptr wParam, KBDLLHOOKSTRUCT *lParam)");
const GetMessageW = user32.func("int GetMessageW(_Out_ MSG *msg, void *hwnd, uint32 min, uint32 max)");
const PeekMessageW = user32.func("bool PeekMessageW(_Out_ MSG *msg, void *hwnd, uint32 min, uint32 max, uint32 remove)");
const GetCurrentThreadId = kernel32.func("uint32 GetCurrentThreadId()");

const proc = koffi.register((nCode, wParam, lParam) => {
  if (nCode === 0) {
    const info = koffi.decode(lParam, KBDLLHOOKSTRUCT);
    if (info.vkCode === VK_ESCAPE) {
      if (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN) parentPort.postMessage("escape");
      return 1; // 吞掉 Esc 的按下与松开：shell 收不到 Ctrl+Esc，开始菜单不弹
    }
  }
  return CallNextHookEx(null, nCode, wParam, lParam);
}, koffi.pointer(HookProc));

let hook = null;
const msg = {};
PeekMessageW(msg, null, 0, 0, PM_NOREMOVE); // 先建线程消息队列，PostThreadMessage 才投得进来
parentPort.postMessage({ threadId: GetCurrentThreadId() });
while (GetMessageW(msg, null, 0, 0) > 0) {
  if (msg.message === ${CMD_INSTALL} && !hook) {
    hook = SetWindowsHookExW(WH_KEYBOARD_LL, proc, null, 0);
    parentPort.postMessage(hook ? "installed" : "failed");
  } else if (msg.message === ${CMD_UNINSTALL} && hook) {
    UnhookWindowsHookEx(hook);
    hook = null;
    parentPort.postMessage("uninstalled");
  }
}
if (hook) UnhookWindowsHookEx(hook);
`;

function loadWin32(): EscBlockApi {
  const user32 = koffi.load("user32.dll");
  const PostThreadMessageW = user32.func("bool PostThreadMessageW(uint32 idThread, uint32 msg, uintptr wParam, intptr lParam)");

  let worker: Worker | null = null;
  let threadId = 0;
  let wanted = false;
  let handler: (() => void) | null = null;

  const post = (cmd: number): void => {
    if (threadId && !PostThreadMessageW(threadId, cmd, 0, 0)) log.warn(`escblock: PostThreadMessage(${cmd}) failed`);
  };

  const ensureWorker = (): void => {
    if (worker) return;
    const require = createRequire(import.meta.url);
    const w = new Worker(workerSource, { eval: true, workerData: { modulePath: require.resolve("koffi") } });
    worker = w;
    w.on("message", (m: string | { threadId: number }) => {
      if (worker !== w) return;
      if (typeof m === "object") {
        threadId = m.threadId;
        if (wanted) post(CMD_INSTALL);
      } else if (m === "escape") {
        handler?.();
      } else if (m === "failed") {
        log.warn("SetWindowsHookEx(WH_KEYBOARD_LL) failed");
      } else {
        log.debug(`escblock: hook ${m}`);
      }
    });
    w.on("error", (error) => log.warn("escblock worker error", error));
    w.on("exit", () => {
      if (worker !== w) return;
      worker = null;
      threadId = 0;
    });
  };

  return {
    install(onEscape) {
      handler = onEscape;
      if (wanted) return;
      wanted = true;
      ensureWorker();
      post(CMD_INSTALL);
    },
    uninstall() {
      handler = null;
      if (!wanted) return;
      wanted = false;
      post(CMD_UNINSTALL);
    },
    dispose() {
      // 钩子线程卡在 GetMessageW 里，直接 terminate 会等不到线程退出而挂住进程；先让消息循环自然结束
      wanted = false;
      handler = null;
      post(WM_QUIT);
      worker = null;
      threadId = 0;
    },
  };
}

const api: EscBlockApi | null = isWin ? loadWin32() : null;

/** 安装系统级 Esc 吞键钩子；Esc 按下时回调（钩子回调内只调度，不做重活） */
export function blockEscape(onEscape: () => void): boolean {
  if (!api) return false;
  api.install(onEscape);
  return true;
}

export function unblockEscape(): void {
  api?.uninstall();
}

/** 退出前结束钩子线程（before-quit 调用） */
export function disposeEscBlock(): void {
  api?.dispose();
}
