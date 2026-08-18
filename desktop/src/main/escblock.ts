import koffi from "koffi";
import log from "electron-log/main.js";

/**
 * 录音期间用 WH_KEYBOARD_LL 低级键盘钩子在系统层吞掉 Esc。
 * Ctrl+Esc 是 Windows shell 保留组合，RegisterHotKey/globalShortcut 拦不住（开始菜单照弹），
 * 只有低级钩子对 Esc 返回非零才能让 shell 收不到组合键。钩子只在录音会话期间安装，空闲即卸载。
 */

const isWin = process.platform === "win32";

const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_SYSKEYDOWN = 0x0104;
const VK_ESCAPE = 0x1b;

interface EscBlockApi {
  install(onEscape: () => void): void;
  uninstall(): void;
}

function loadWin32(): EscBlockApi {
  const user32 = koffi.load("user32.dll");
  const KBDLLHOOKSTRUCT = koffi.struct("KBDLLHOOKSTRUCT", {
    vkCode: "uint32",
    scanCode: "uint32",
    flags: "uint32",
    time: "uint32",
    dwExtraInfo: "uintptr",
  });
  const HookProc = koffi.proto("intptr __stdcall EscHookProc(int nCode, uintptr wParam, KBDLLHOOKSTRUCT *lParam)");
  const SetWindowsHookExW = user32.func("void *SetWindowsHookExW(int idHook, EscHookProc *lpfn, void *hMod, uint32 dwThreadId)");
  const UnhookWindowsHookEx = user32.func("bool UnhookWindowsHookEx(void *hhk)");
  const CallNextHookEx = user32.func("intptr CallNextHookEx(void *hhk, int nCode, uintptr wParam, KBDLLHOOKSTRUCT *lParam)");

  let hook: unknown = null;
  let registered: ReturnType<typeof koffi.register> | null = null;

  return {
    install(onEscape) {
      if (hook) return;
      registered = koffi.register((nCode: number, wParam: number, lParam: unknown) => {
        if (nCode === 0) {
          const info = koffi.decode(lParam, KBDLLHOOKSTRUCT) as { vkCode: number };
          if (info.vkCode === VK_ESCAPE) {
            if (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN) setImmediate(onEscape);
            return 1; // 吞掉 Esc 的按下与松开：shell 收不到 Ctrl+Esc，开始菜单不弹
          }
        }
        return CallNextHookEx(null, nCode, wParam, lParam) as number;
      }, koffi.pointer(HookProc));
      hook = SetWindowsHookExW(WH_KEYBOARD_LL, registered, null, 0);
      if (!hook) {
        log.warn("SetWindowsHookEx(WH_KEYBOARD_LL) failed");
        koffi.unregister(registered);
        registered = null;
      }
    },
    uninstall() {
      if (hook) {
        UnhookWindowsHookEx(hook);
        hook = null;
      }
      if (registered) {
        koffi.unregister(registered);
        registered = null;
      }
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
