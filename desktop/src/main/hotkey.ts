import { UiohookKey, uIOhook, type UiohookKeyboardEvent } from "uiohook-napi";

/**
 * 全局热键（uiohook 键盘钩子）：
 * - 长按键：按住说话、松手结束；按住不满判定时长算误触，直接忽略。
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

export const HOLD_KEY_CHOICES = Object.keys(KEY_NAMES);

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
  private toggleModAlt = true;
  private toggleKeycode: number = UiohookKey.Space;
  private holdDelayMs = 120;
  private holdTimer: NodeJS.Timeout | null = null;
  private holdActive = false;
  private holdPressed = false;
  private started = false;

  constructor(private handlers: HotkeyHandlers) {}

  configure(hotkeyHold: string, hotkeyToggle: string, holdDelayMs: number): void {
    this.holdKeycode = KEY_NAMES[hotkeyHold] ?? UiohookKey.CtrlRight;
    this.holdDelayMs = holdDelayMs;
    const parts = hotkeyToggle.split("+");
    this.toggleModAlt = parts.includes("Alt");
    this.toggleKeycode = KEY_NAMES[parts[parts.length - 1] ?? "Space"] ?? UiohookKey.Space;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    uIOhook.on("keydown", (ev) => this.onKeyDown(ev));
    uIOhook.on("keyup", (ev) => this.onKeyUp(ev));
    uIOhook.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    uIOhook.stop();
  }

  private onKeyDown(ev: UiohookKeyboardEvent): void {
    if (ev.keycode === this.holdKeycode) {
      if (this.holdPressed) return; // 系统 key repeat
      this.holdPressed = true;
      this.handlers.onWarmUp();
      this.holdTimer = setTimeout(() => {
        this.holdTimer = null;
        this.holdActive = true;
        this.handlers.onHoldStart();
      }, this.holdDelayMs);
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
    if (ev.altKey) {
      const index = DIGIT_KEYCODES.indexOf(ev.keycode);
      if (index >= 0) this.handlers.onPersona(index);
    }
  }

  private onKeyUp(ev: UiohookKeyboardEvent): void {
    if (ev.keycode !== this.holdKeycode) return;
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
}
