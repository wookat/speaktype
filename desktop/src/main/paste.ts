import { clipboard } from "electron";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import koffi from "koffi";

/**
 * 落字：写剪贴板 → 模拟粘贴快捷键 → 还原剪贴板。
 * Windows：koffi 直调 user32 SendInput（Ctrl+V），免原生编译。
 * macOS：osascript 发 Cmd+V（需要辅助功能授权）。
 */

const isMac = process.platform === "darwin";

interface Win32Api {
  sendInputs(keys: Array<{ vk: number; up: boolean }>): void;
  modifiersDown(): boolean;
}

const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 2;
const VK_CONTROL = 0x11;
const VK_V = 0x56;
const VK_C = 0x43;
const VK_Z = 0x5a;
const VK_BACK = 0x08;
const VK_SHIFT = 0x10;
const VK_MENU = 0x12;
const VK_LWIN = 0x5b;
const VK_RWIN = 0x5c;

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
  const GetAsyncKeyState = user32.func("int16 GetAsyncKeyState(int vKey)");
  return {
    modifiersDown() {
      return [VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN].some(
        (vk) => (GetAsyncKeyState(vk) & 0x8000) !== 0,
      );
    },
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

async function sendShortcut(vk: number, macKey: string): Promise<void> {
  if (isMac) {
    // 需要「系统设置 → 隐私与安全性 → 辅助功能」授权
    await osascript(`tell application "System Events" to keystroke "${macKey}" using command down`);
    return;
  }
  win32?.sendInputs([
    { vk: VK_CONTROL, up: false },
    { vk, up: false },
    { vk, up: true },
    { vk: VK_CONTROL, up: true },
  ]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 等物理修饰键（Shift/Alt/Win）全部松开再发快捷键：短句识别极快，用户退出免按的
 * Alt 还没松时 Ctrl+V 会变成 Ctrl+Alt+V 被目标程序忽略，造成静默丢字。
 * 封顶 1s；超时返回 false，由调用方改走提示而非盲发。
 */
async function waitModifiersReleased(): Promise<boolean> {
  if (!win32) return true;
  for (let i = 0; i < 50 && win32.modifiersDown(); i++) await sleep(20);
  return !win32.modifiersDown();
}

/** 语音命令「撤销」：向前台发一次 Ctrl/Cmd+Z */
export async function sendUndo(): Promise<boolean> {
  if (!(await waitModifiersReleased())) return false;
  await sendShortcut(VK_Z, "z");
  return true;
}

/** 语音命令「删除上一句」：向前台连发 Backspace */
export async function sendBackspaces(count: number): Promise<boolean> {
  if (count <= 0) return true;
  if (!(await waitModifiersReleased())) return false;
  if (isMac) {
    await osascript(`tell application "System Events" to repeat ${count} times\nkey code 51\nend repeat`);
    return true;
  }
  for (let i = 0; i < count; i++) {
    win32?.sendInputs([
      { vk: VK_BACK, up: false },
      { vk: VK_BACK, up: true },
    ]);
    await sleep(5);
  }
  return true;
}

/**
 * 读取当前前台窗口的选中文字：清空剪贴板 → 发 Ctrl/Cmd+C → 读回。
 * 没有选中时剪贴板不会被写入，返回空串；原剪贴板内容会还原。
 */
export async function copySelection(): Promise<string> {
  const previous = clipboard.readText();
  const probe = `\u200b speaktype-probe ${randomUUID()}`;
  clipboard.writeText(probe);
  await sleep(60);
  await sendShortcut(VK_C, "c");
  await sleep(250);
  const copied = clipboard.readText();
  const selection = copied === probe ? "" : copied;
  clipboard.writeText(previous);
  return selection;
}

/** 返回是否真的发出了粘贴；修饰键超时未发时文字留在剪贴板供手动粘贴 */
export async function pasteText(text: string): Promise<boolean> {
  const prevText = clipboard.readText();
  // 文本为空时快照图片剪贴板（如截图后立刻口述），文件列表等其余格式不保
  const prevImage = prevText ? null : clipboard.readImage();
  clipboard.writeText(text);
  await sleep(60);
  if (!(await waitModifiersReleased())) return false;
  await sendShortcut(VK_V, "v");
  // 等目标程序完成粘贴再还原，太快还原会粘到旧内容
  await sleep(350);
  // 剪贴板已被用户/其他程序改写时放弃还原，避免覆盖用户新复制的内容
  if (clipboard.readText() !== text) return true;
  if (prevText) clipboard.writeText(prevText);
  else if (prevImage && !prevImage.isEmpty()) clipboard.writeImage(prevImage);
  return true;
}
