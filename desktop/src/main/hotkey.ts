import { UiohookKey, uIOhook, type UiohookKeyboardEvent, type UiohookMouseEvent } from "uiohook-napi";

/**
 * 全局热键（uiohook 键盘/鼠标钩子）：
 * - 长按键：按住说话、松手结束；按住不满判定时长算误触，直接忽略。
 * - 长按位也可以是鼠标侧键（Mouse4/Mouse5），适合手一直在鼠标上的场景。
 * - 点按组合键：按一下开始、再按一下结束（免按模式）。
 * - Alt+1..9：切换人设。
 */

export interface HotkeyHandlers {
  onHoldStart(): void;
  onHoldEnd(): void;
  onToggle(): void;
  onPersona(index: number): void;
  /** 按下瞬间就回调（判定时长之前），用于抢跑建联 */
  onWarmUp(): void;
}

const KEY_NAMES: Record<string, number> = {
  RightCtrl: UiohookKey.CtrlRight,
  LeftCtrl: UiohookKey.Ctrl,
  RightAlt: UiohookKey.AltRight,
  LeftAlt: UiohookKey.Alt,
  RightShift: UiohookKey.ShiftRight,
  LeftShift: UiohookKey.Shift,
  Space: UiohookKey.Space,
  Q: UiohookKey.Q,
  W: UiohookKey.W,
  Z: UiohookKey.Z,
  X: UiohookKey.X,
  F1: UiohookKey.F1,
  F2: UiohookKey.F2,
  F3: UiohookKey.F3,
  F4: UiohookKey.F4,
  F6: UiohookKey.F6,
  F7: UiohookKey.F7,
  F8: UiohookKey.F8,
  F9: UiohookKey.F9,
  F10: UiohookKey.F10,
  CapsLock: UiohookKey.CapsLock,
  Tab: UiohookKey.Tab,
};

/** uiohook 的鼠标按键编号：4/5 是大多数鼠标拇指位的后退/前进键 */
const MOUSE_BUTTONS: Record<string, number> = { MouseBack: 4, MouseForward: 5, MouseMiddle: 3 };

export const HOLD_KEY_CHOICES = [
  "RightCtrl",
  "LeftCtrl",
  "RightAlt",
  "RightShift",
  "CapsLock",
  "F1",
  "F2",
  "F3",
  "F4",
  "F8",
  "F9",
  "F10",
  "MouseBack",
  "MouseForward",
  "MouseMiddle",
];

export const TOGGLE_KEY_CHOICES = ["Alt+Q", "Alt+W", "Alt+Z", "Alt+X", "Alt+Space", "F9", "F10"];

const DIGIT_KEYCODES: number[] = [
  UiohookKey[1],
  UiohookKey[2],
  UiohookKey[3],
  UiohookKey[4],
  UiohookKey[5],
  UiohookKey[6],
  UiohookKey[7],
  UiohookKey[8],
  UiohookKey[9],
];

export class HotkeyManager {
  private holdKeycode: number = UiohookKey.CtrlRight;
  private holdMouseButton = 0;
  private toggleModAlt = true;
  private toggleKeycode: number = UiohookKey.Space;
  private holdDelayMs = 120;
  private personaHotkeys = true;
  private holdTimer: NodeJS.Timeout | null = null;
  private holdActive = false;
  private holdPressed = false;
  private started = false;

  constructor(private handlers: HotkeyHandlers) {}

  configure(hotkeyHold: string, hotkeyToggle: string, holdDelayMs: number, personaHotkeys = true): void {
    this.holdMouseButton = MOUSE_BUTTONS[hotkeyHold] ?? 0;
    this.holdKeycode = this.holdMouseButton ? -1 : (KEY_NAMES[hotkeyHold] ?? UiohookKey.CtrlRight);
    this.holdDelayMs = holdDelayMs;
    this.personaHotkeys = personaHotkeys;
    const parts = hotkeyToggle.split("+");
    this.toggleModAlt = parts.includes("Alt");
    this.toggleKeycode = KEY_NAMES[parts[parts.length - 1] ?? "Space"] ?? UiohookKey.Space;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    uIOhook.on("keydown", (ev) => this.onKeyDown(ev));
    uIOhook.on("keyup", (ev) => this.onKeyUp(ev));
    uIOhook.on("mousedown", (ev) => this.onMouseDown(ev));
    uIOhook.on("mouseup", (ev) => this.onMouseUp(ev));
    uIOhook.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    uIOhook.stop();
  }

  private onMouseDown(ev: UiohookMouseEvent): void {
    if (this.holdMouseButton && ev.button === this.holdMouseButton) this.pressHold();
  }

  private onMouseUp(ev: UiohookMouseEvent): void {
    if (this.holdMouseButton && ev.button === this.holdMouseButton) this.releaseHold();
  }

  private pressHold(): void {
    if (this.holdPressed) return; // 系统 key repeat
    this.holdPressed = true;
    this.handlers.onWarmUp();
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.holdActive = true;
      this.handlers.onHoldStart();
    }, this.holdDelayMs);
  }

  private releaseHold(): void {
    this.holdPressed = false;
    if (this.holdTimer) {
      // 按住不满判定时长：误触，撤掉待启动的录音
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
      return;
    }
    if (this.holdActive) {
      this.holdActive = false;
      this.handlers.onHoldEnd();
    }
  }

  private onKeyDown(ev: UiohookKeyboardEvent): void {
    if (ev.keycode === this.holdKeycode) {
      this.pressHold();
      return;
    }
    if (ev.altKey && ev.keycode === this.toggleKeycode && this.toggleModAlt) {
      this.handlers.onToggle();
      return;
    }
    if (!this.toggleModAlt && ev.keycode === this.toggleKeycode) {
      this.handlers.onToggle();
      return;
    }
    if (ev.altKey && this.personaHotkeys) {
      const index = DIGIT_KEYCODES.indexOf(ev.keycode);
      if (index >= 0) this.handlers.onPersona(index);
    }
  }

  private onKeyUp(ev: UiohookKeyboardEvent): void {
    if (ev.keycode === this.holdKeycode) this.releaseHold();
  }
}
