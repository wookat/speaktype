import { clipboard } from "electron";
import { execFile } from "child_process";
import koffi from "koffi";

/**
 * 落字：写剪贴板 → 模拟粘贴快捷键 → 还原剪贴板。
 * Windows：koffi 直调 user32 SendInput（Ctrl+V），免原生编译。
 * macOS：osascript 发 Cmd+V（需要辅助功能授权）。
 */

const isMac = process.platform === "darwin";

interface Win32Api {
  sendInputs(keys: Array<{ vk: number; up: boolean }>): void;
}

const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 2;
const VK_CONTROL = 0x11;
const VK_V = 0x56;
const VK_VOLUME_MUTE = 0xad;

function loadWin32(): Win32Api {
  const user32 = koffi.load("user32.dll");
  const INPUT = koffi.struct("INPUT", {
    type: "uint32",
    ki: koffi.struct({
      wVk: "uint16",
      wScan: "uint16",
      dwFlags: "uint32",
      time: "uint32",
      dwExtraInfo: "uintptr",
    }),
    padding: koffi.array("uint8", 8),
  });
  const SendInput = user32.func("uint32 SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)");
  return {
    sendInputs(keys) {
      const inputs = keys.map(({ vk, up }) => ({
        type: INPUT_KEYBOARD,
        ki: { wVk: vk, wScan: 0, dwFlags: up ? KEYEVENTF_KEYUP : 0, time: 0, dwExtraInfo: 0 },
        padding: new Array(8).fill(0),
      }));
      SendInput(inputs.length, inputs, koffi.sizeof(INPUT));
    },
  };
}

const win32 = isMac ? undefined : loadWin32();

function osascript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (error) => (error ? reject(error) : resolve()));
  });
}

/** “录音时静音其他应用”：Windows 敲系统静音开关键；macOS 切换系统输出静音 */
export function toggleSystemMute(): void {
  if (isMac) {
    void osascript('set curMuted to output muted of (get volume settings)\nset volume output muted (not curMuted)').catch(() => {});
    return;
  }
  win32?.sendInputs([
    { vk: VK_VOLUME_MUTE, up: false },
    { vk: VK_VOLUME_MUTE, up: true },
  ]);
}

async function sendPasteShortcut(): Promise<void> {
  if (isMac) {
    // key code 9 = V；需要「系统设置 → 隐私与安全性 → 辅助功能」授权
    await osascript('tell application "System Events" to keystroke "v" using command down');
    return;
  }
  win32?.sendInputs([
    { vk: VK_CONTROL, up: false },
    { vk: VK_V, up: false },
    { vk: VK_V, up: true },
    { vk: VK_CONTROL, up: true },
  ]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pasteText(text: string): Promise<void> {
  const previous = clipboard.readText();
  clipboard.writeText(text);
  await sleep(60);
  await sendPasteShortcut();
  // 等目标程序完成粘贴再还原，太快还原会粘到旧内容
  await sleep(350);
  if (previous) clipboard.writeText(previous);
}
