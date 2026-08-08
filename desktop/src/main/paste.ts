import { clipboard } from "electron";
import koffi from "koffi";

/**
 * 落字：写剪贴板 → SendInput 模拟 Ctrl+V → 还原剪贴板。
 * 与智谱 AI 输入法同一方案（它用 robotjs）；koffi 直调 user32 免去原生编译。
 */

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

const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 2;
const VK_CONTROL = 0x11;
const VK_V = 0x56;

function key(vk: number, up: boolean) {
  return {
    type: INPUT_KEYBOARD,
    ki: { wVk: vk, wScan: 0, dwFlags: up ? KEYEVENTF_KEYUP : 0, time: 0, dwExtraInfo: 0 },
    padding: new Array(8).fill(0),
  };
}

function sendCtrlV(): void {
  const inputs = [key(VK_CONTROL, false), key(VK_V, false), key(VK_V, true), key(VK_CONTROL, true)];
  SendInput(inputs.length, inputs, koffi.sizeof(INPUT));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pasteText(text: string): Promise<void> {
  const previous = clipboard.readText();
  clipboard.writeText(text);
  await sleep(60);
  sendCtrlV();
  // 等目标程序完成粘贴再还原，太快还原会粘到旧内容
  await sleep(350);
  if (previous) clipboard.writeText(previous);
}
