import { UiohookKey, uIOhook, type UiohookKeyboardEvent, type UiohookMouseEvent } from "uiohook-napi";

/**
 * 全局热键（uiohook 键盘/鼠标钩子）：
 * - 长按键：按住说话、松手结束；按住不满判定时长算误触，直接忽略。
 * - 长按位也可以是鼠标侧键（Mouse4/Mouse5），适合手一直在鼠标上的场景。
 * - 点按组合键：按一下开始、再按一下结束（免按模式）。
 * - 改写键：按住对着选中的文字说指令（改写/翻译），松手替换选区。
 * - Alt+1..9：切换人设。
 */

export interface HotkeyHandlers {
  onHoldStart(rewrite: boolean): void;
  onHoldEnd(rewrite: boolean): void;
  onToggle(): void;
  /** 双击长按键（两次短敲）：进入/退出免按连续听写 */
  onDoubleTap(): void;
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
  CapsLock: UiohookKey.CapsLock,
  Tab: UiohookKey.Tab,
  Backquote: UiohookKey.Backquote,
  ...Object.fromEntries(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => [c, UiohookKey[c as "A"]]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, UiohookKey[`F${i + 1}` as "F1"]]),
  ),
};

const KEYCODE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_NAMES).map(([name, code]) => [code, name]),
);
const MOUSE_BUTTON_NAMES: Record<number, string> = { 4: "MouseBack", 5: "MouseForward", 3: "MouseMiddle" };

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

export const REWRITE_KEY_CHOICES = ["Off", ...HOLD_KEY_CHOICES];

export const TOGGLE_KEY_CHOICES = ["Alt+Q", "Alt+W", "Alt+Z", "Alt+X", "Alt+Space", "F9", "F10"];

/** 两次短敲的最大间隔（按第一次松开到第二次松开） */
const DOUBLE_TAP_MS = 400;

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
  private rewriteKeycode = -1;
  private rewriteMouseButton = 0;
  private toggleModAlt = true;
  private toggleKeycode: number = UiohookKey.Space;
  private holdDelayMs = 120;
  private personaHotkeys = true;
  private doubleTapEnabled = true;
  private lastTapAt = 0;
  private holdTimer: NodeJS.Timeout | null = null;
  private holdActive = false;
  private holdPressed = false;
  private rewriteTimer: NodeJS.Timeout | null = null;
  private rewriteActive = false;
  private rewritePressed = false;
  private started = false;
  private capture: ((name: string | null) => void) | null = null;
  /** 刚被录制的键：松开前吃掉系统 key repeat 的 keydown，避免误触发录音 */
  private captureSwallowKeycode = -1;

  constructor(private handlers: HotkeyHandlers) {}

  configure(
    hotkeyHold: string,
    hotkeyToggle: string,
    holdDelayMs: number,
    personaHotkeys = true,
    hotkeyRewrite = "Off",
    doubleTapHandsFree = true,
  ): void {
    this.doubleTapEnabled = doubleTapHandsFree;
    this.holdMouseButton = MOUSE_BUTTONS[hotkeyHold] ?? 0;
    this.holdKeycode = this.holdMouseButton ? -1 : (KEY_NAMES[hotkeyHold] ?? UiohookKey.CtrlRight);
    const rewriteOff = !hotkeyRewrite || hotkeyRewrite === "Off" || hotkeyRewrite === hotkeyHold;
    this.rewriteMouseButton = rewriteOff ? 0 : (MOUSE_BUTTONS[hotkeyRewrite] ?? 0);
    this.rewriteKeycode = rewriteOff || this.rewriteMouseButton ? -1 : (KEY_NAMES[hotkeyRewrite] ?? -1);
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

  /**
   * 录制下一次按键/鼠标侧键作为长按位；Esc 或超时取消，录制期间不触发热键。
   * 不支持的键（长按位只收单键）返回 "unsupported"，由设置页就地提示而不是静默失败。
   */
  captureNext(timeoutMs = 10000): Promise<string | null> {
    this.capture?.(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.capture === done) this.capture = null;
        resolve(null);
      }, timeoutMs);
      const done = (name: string | null): void => {
        clearTimeout(timer);
        this.capture = null;
        resolve(name);
      };
      this.capture = done;
    });
  }

  private onMouseDown(ev: UiohookMouseEvent): void {
    if (this.capture) {
      const name = MOUSE_BUTTON_NAMES[ev.button as number];
      if (name) this.capture(name);
      return;
    }
    if (this.holdMouseButton && ev.button === this.holdMouseButton) this.pressHold();
    else if (this.rewriteMouseButton && ev.button === this.rewriteMouseButton) this.pressRewrite();
  }

  private onMouseUp(ev: UiohookMouseEvent): void {
    if (this.holdMouseButton && ev.button === this.holdMouseButton) this.releaseHold();
    else if (this.rewriteMouseButton && ev.button === this.rewriteMouseButton) this.releaseRewrite();
  }

  private pressHold(): void {
    if (this.holdPressed) return; // 系统 key repeat
    this.holdPressed = true;
    this.handlers.onWarmUp();
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.holdActive = true;
      this.lastTapAt = 0;
      this.handlers.onHoldStart(false);
    }, this.holdDelayMs);
  }

  private releaseHold(): void {
    this.holdPressed = false;
    if (this.holdTimer) {
      // 按住不满判定时长：单次算误触撤销；连续两次短敲算双击，进免按连续听写
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
      const now = Date.now();
      if (this.doubleTapEnabled && now - this.lastTapAt <= DOUBLE_TAP_MS) {
        this.lastTapAt = 0;
        this.handlers.onDoubleTap();
      } else {
        this.lastTapAt = now;
      }
      return;
    }
    if (this.holdActive) {
      this.holdActive = false;
      this.handlers.onHoldEnd(false);
    }
  }

  private pressRewrite(): void {
    if (this.rewritePressed) return;
    this.rewritePressed = true;
    this.rewriteTimer = setTimeout(() => {
      this.rewriteTimer = null;
      this.rewriteActive = true;
      this.handlers.onHoldStart(true);
    }, this.holdDelayMs);
  }

  private releaseRewrite(): void {
    this.rewritePressed = false;
    if (this.rewriteTimer) {
      clearTimeout(this.rewriteTimer);
      this.rewriteTimer = null;
      return;
    }
    if (this.rewriteActive) {
      this.rewriteActive = false;
      this.handlers.onHoldEnd(true);
    }
  }

  private onKeyDown(ev: UiohookKeyboardEvent): void {
    if (this.capture) {
      if (ev.keycode === UiohookKey.Escape) this.capture(null);
      else {
        const name = KEYCODE_NAMES[ev.keycode];
        if (name) {
          this.captureSwallowKeycode = ev.keycode;
          this.capture(name);
        } else {
          this.capture("unsupported");
        }
      }
      return;
    }
    if (ev.keycode === this.captureSwallowKeycode) return;
    if (ev.keycode === this.holdKeycode) {
      this.pressHold();
      return;
    }
    // 其他键按下说明是组合键（如 Ctrl+C 连按两次），取消双击判定
    this.lastTapAt = 0;
    if (ev.keycode === this.rewriteKeycode) {
      this.pressRewrite();
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
    if (ev.keycode === this.captureSwallowKeycode) {
      this.captureSwallowKeycode = -1;
      return;
    }
    if (ev.keycode === this.holdKeycode) this.releaseHold();
    else if (ev.keycode === this.rewriteKeycode) this.releaseRewrite();
  }
}
