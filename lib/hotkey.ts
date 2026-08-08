/**
 * 「按住说话」的键位描述与匹配。
 *
 * Chrome 的 commands API 只给 keydown，拿不到松手事件，所以按住说话必须在页面内
 * 自己监听 keydown/keyup，键位也就得自己解析。支持两类组合：
 * - 纯修饰键长按，如 `Ctrl`、`Ctrl+Alt`（不产生字符，最适合按住说话）
 * - 修饰键 + 主键，如 `Ctrl+Space`、`F2`
 */

export interface Hotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** 主键（KeyboardEvent.key，单字符统一小写）；纯修饰键组合时为空串 */
  key: string;
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph"]);

export const EMPTY_HOTKEY: Hotkey = { ctrl: false, alt: false, shift: false, meta: false, key: "" };

/** 键位是否可用：纯修饰键组合，或带主键的组合 */
export function isValidHotkey(hotkey: Hotkey): boolean {
  return Boolean(hotkey.key) || hotkey.ctrl || hotkey.alt || hotkey.shift || hotkey.meta;
}

function normalizeKey(key: string): string {
  if (key === " ") return "Space";
  return key.length === 1 ? key.toLowerCase() : key;
}

export function parseHotkey(text: string): Hotkey {
  const parts = text
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  const hotkey: Hotkey = { ...EMPTY_HOTKEY };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") hotkey.ctrl = true;
    else if (lower === "alt" || lower === "option") hotkey.alt = true;
    else if (lower === "shift") hotkey.shift = true;
    else if (lower === "meta" || lower === "cmd" || lower === "command" || lower === "win")
      hotkey.meta = true;
    else hotkey.key = normalizeKey(part);
  }
  return hotkey;
}

export function formatHotkey(hotkey: Hotkey): string {
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push("Ctrl");
  if (hotkey.alt) parts.push("Alt");
  if (hotkey.shift) parts.push("Shift");
  if (hotkey.meta) parts.push("Meta");
  if (hotkey.key) parts.push(hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key);
  return parts.join("+");
}

/** 从 keydown 事件还原用户想设置的组合；只按下修饰键时得到纯修饰键组合 */
export function hotkeyFromEvent(event: KeyboardEvent): Hotkey {
  return {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key: MODIFIER_KEYS.has(event.key) ? "" : normalizeKey(event.key),
  };
}

/** 事件是否正好按下了该组合（多按了别的修饰键就不算，避免和页面快捷键抢） */
export function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  const pressed = hotkeyFromEvent(event);
  return (
    pressed.ctrl === hotkey.ctrl &&
    pressed.alt === hotkey.alt &&
    pressed.shift === hotkey.shift &&
    pressed.meta === hotkey.meta &&
    pressed.key === hotkey.key
  );
}

/** keyup 是否松开了该组合里的某个键 —— 松开任一键就该停止录音 */
export function releasesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  if (hotkey.key && normalizeKey(event.key) === hotkey.key) return true;
  if (event.key === "Control" && hotkey.ctrl) return true;
  if (event.key === "Alt" && hotkey.alt) return true;
  if (event.key === "Shift" && hotkey.shift) return true;
  if (event.key === "Meta" && hotkey.meta) return true;
  return false;
}

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}
