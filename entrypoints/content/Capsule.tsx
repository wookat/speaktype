import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatHotkey,
  isModifierKey,
  isValidHotkey,
  matchesHotkey,
  parseHotkey,
  releasesHotkey,
} from "@/lib/hotkey";
import { findPersona } from "@/lib/personas";
import { getSettings, setSettings, watchSettings } from "@/lib/settings";
import { insertText, isEditable, readSelection, resolveTarget, type TextTarget } from "@/lib/insert";
import type { BgToUi, FixAction, RecorderState, Settings, UiToBg } from "@/lib/types";

const HINTS: Record<RecorderState, string> = {
  idle: "点一下或长按说话",
  connecting: "准备中…",
  recording: "正在听，松手或再点一下结束",
  processing: "整理中…",
  error: "出错了",
};

const BACKGROUND_DEAD = "扩展后台没响应：请到 chrome://extensions 重载 SpeakType 后重试";

function send(msg: UiToBg) {
  // 扩展重载后的孤儿 content script 里 sendMessage 会同步 throw
  try {
    void browser.runtime.sendMessage(msg).catch(() => {});
  } catch {
    // ignore
  }
}

export function Capsule() {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<RecorderState>("idle");
  const [message, setMessage] = useState("");
  const [fix, setFix] = useState<FixAction | null>(null);
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [visible, setVisible] = useState(false);
  const [showPersonas, setShowPersonas] = useState(false);
  const targetRef = useRef<TextTarget | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdFired = useRef(false);
  const watchdog = useRef<number | null>(null);
  const answered = useRef(false);
  const stateRef = useRef<RecorderState>("idle");
  stateRef.current = state;

  useEffect(() => {
    void getSettings().then(setLocalSettings);
    return watchSettings(setLocalSettings);
  }, []);

  // 跟随焦点决定出不出现和落字目标；位置永远固定在屏幕底部居中，不跟着输入框跑
  useEffect(() => {
    const onFocusIn = (ev: Event) => {
      const el = ev.target as Element | null;
      if (isEditable(el)) {
        targetRef.current = el;
        setVisible(true);
      }
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (!isEditable(document.activeElement) && state === "idle") setVisible(false);
      }, 150);
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    if (isEditable(document.activeElement)) {
      targetRef.current = document.activeElement;
      setVisible(true);
    }
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, [state]);

  const start = useCallback(() => {
    const target = resolveTarget(targetRef.current);
    if (target) targetRef.current = target;
    setPartial("");
    setMessage("");
    setFix(null);
    const startMsg: UiToBg = {
      type: "start-record",
      selectionText: readSelection(targetRef.current),
    };
    const dead = () => {
      setMessage(BACKGROUND_DEAD);
      setState("error");
    };
    // 后台 service worker 偶尔会挂掉且叫不醒，报错方式三种都得接住：
    // 同步 throw（扩展重载后页面里的孤儿脚本）、reject、以及消息发出去但无人应答
    answered.current = false;
    try {
      void browser.runtime.sendMessage(startMsg).catch(dead);
    } catch {
      dead();
      return;
    }
    if (watchdog.current) window.clearTimeout(watchdog.current);
    watchdog.current = window.setTimeout(() => {
      if (answered.current) return;
      dead();
    }, 2500);
  }, []);

  const stop = useCallback(() => send({ type: "stop-record" }), []);

  const toggle = useCallback(() => {
    if (state === "recording" || state === "connecting") stop();
    else if (state !== "processing") start();
  }, [state, start, stop]);

  useEffect(() => {
    const listener = (raw: unknown) => {
      const msg = raw as BgToUi;
      if (msg.type === "state") {
        answered.current = true;
        if (watchdog.current) window.clearTimeout(watchdog.current);
        setState(msg.state);
        if (msg.message) setMessage(msg.message);
        setFix(msg.action ?? null);
        if (msg.state === "recording") setMessage("");
      } else if (msg.type === "partial") {
        setPartial(msg.text);
      } else if (msg.type === "level") {
        setLevel(msg.value);
      } else if (msg.type === "hotkey-toggle") {
        toggle();
      } else if (msg.type === "final") {
        setPartial(msg.text);
        const target = resolveTarget(targetRef.current);
        if (msg.text && target && settings?.autoInsert) insertText(target, msg.text);
        window.setTimeout(() => setPartial(""), 1200);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [settings?.autoInsert, toggle]);

  const cancel = useCallback(() => {
    setPartial("");
    send({ type: "cancel-record" });
  }, []);

  // 按住说话：commands API 收不到松手，只能在页面内自己听 keydown/keyup。
  // 纯修饰键组合（默认 Ctrl）要按住 250ms 才起录，期间按了别的键就当成普通快捷键放过。
  const pttKey = useMemo(() => {
    if (!settings?.pushToTalk) return null;
    const parsed = parseHotkey(settings.pushToTalkKey);
    return isValidHotkey(parsed) ? parsed : null;
  }, [settings?.pushToTalk, settings?.pushToTalkKey]);

  useEffect(() => {
    if (!pttKey) return;
    let armed = false; // 组合已按下，等待成为长按
    let talking = false; // 已经在录音
    let timer: number | null = null;
    let ending: number | null = null; // 已收到松手，等一小会儿确认不是焦点离开引起的

    const clearTimer = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = null;
    };
    const clearEnding = () => {
      if (ending != null) window.clearTimeout(ending);
      ending = null;
    };
    const reset = () => {
      clearTimer();
      clearEnding();
      armed = false;
      talking = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (armed) {
        // 长按期间按了别的键（Ctrl+C 之类）：让位给页面快捷键，丢掉这次录音
        if (!matchesHotkey(event, pttKey) && !isModifierKey(event.key)) {
          if (talking) cancel();
          reset();
        }
        return;
      }
      if (event.repeat || !matchesHotkey(event, pttKey)) return;
      if (!isEditable(document.activeElement)) return;
      armed = true;
      const begin = () => {
        talking = true;
        start();
      };
      if (pttKey.key) {
        event.preventDefault();
        begin();
      } else {
        timer = window.setTimeout(begin, 250);
      }
    };

    // 焦点离开页面时 Chrome 会先补发一个被按住修饰键的合成 keyup，看起来跟真松手一模一样，
    // 所以落字要压后一拍：紧接着来了 blur/hidden 就改判成取消。
    const onKeyUp = (event: KeyboardEvent) => {
      if (!armed || ending != null || !releasesHotkey(event, pttKey)) return;
      clearTimer();
      if (!talking) {
        reset();
        return;
      }
      ending = window.setTimeout(() => {
        ending = null;
        stop();
        reset();
      }, 150);
    };

    // 离开页面时真正的 keyup 收不到了，必须主动收摊，否则录音一直挂着。
    // 切标签页只保证 visibilitychange，切到别的程序只保证 window blur，所以两个都听。
    const abort = () => {
      if (talking) cancel();
      reset();
    };
    const onVisibility = () => {
      if (document.hidden) abort();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", abort);
    window.addEventListener("pagehide", abort);
    return () => {
      clearTimer();
      clearEnding();
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", abort);
      window.removeEventListener("pagehide", abort);
    };
  }, [pttKey, start, stop, cancel]);

  const persona = useMemo(
    () => (settings ? findPersona(settings.personas, settings.personaId) : null),
    [settings],
  );

  if (!visible || !settings) return null;

  const recording = state === "recording" || state === "connecting";
  const bars = [0, 1, 2, 3, 4];

  return (
    <div
      className="fixed bottom-5 left-1/2 z-[2147483647] -translate-x-1/2 font-sans"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex w-max max-w-[320px] flex-col items-center gap-1.5">
        {(partial || message) && (
          <div
            className={`max-h-[68px] overflow-hidden rounded-2xl px-3 py-1.5 text-[12px] leading-snug shadow-lg backdrop-blur ${
              message ? "bg-red-50/95 text-red-700" : "bg-white/95 text-slate-700"
            }`}
          >
            {/* 只显示尾部：说得久了也不会把胶囊一直往下顶 */}
            {message || partial.slice(-140)}
            {message && fix && (
              <button
                type="button"
                onClick={() => {
                  send({ type: "run-fix", action: fix });
                  setMessage("");
                  setFix(null);
                  setState("idle");
                }}
                className="ml-2 rounded-full bg-red-600 px-2.5 py-0.5 text-[12px] font-medium text-white hover:bg-red-700"
              >
                {fix === "grant-mic" ? "去授权麦克风" : "打开豆包登录"}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 rounded-full bg-white/95 p-0.5 shadow-lg ring-1 ring-black/5 backdrop-blur">
          <button
            type="button"
            title={`${HINTS[state]}（${pttKey ? `按住 ${formatHotkey(pttKey)} 说话，或 ` : ""}Alt+Q）`}
            onPointerDown={() => {
              holdFired.current = false;
              holdTimer.current = window.setTimeout(() => {
                holdFired.current = true;
                if (!recording) start();
              }, 180);
            }}
            onPointerUp={() => {
              if (holdTimer.current) window.clearTimeout(holdTimer.current);
              if (holdFired.current) stop();
              else toggle();
            }}
            onPointerLeave={() => {
              if (holdTimer.current) window.clearTimeout(holdTimer.current);
            }}
            className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors ${
              recording
                ? "bg-red-500 text-white hover:bg-red-600"
                : state === "processing"
                  ? "bg-slate-200 text-slate-500"
                  : "bg-slate-900 text-white hover:bg-slate-700"
            }`}
          >
            {recording ? (
              <span className="flex h-4 items-end gap-[2px]">
                {bars.map((i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-white/90"
                    style={{ height: `${4 + Math.min(12, level * 14 * (1 + (i % 3) * 0.35))}px` }}
                  />
                ))}
              </span>
            ) : (
              <span aria-hidden>🎙️</span>
            )}
            <span>{recording ? "停止" : state === "processing" ? "整理中" : "说话"}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              title="选择改写风格"
              onClick={() => setShowPersonas((v) => !v)}
              className="flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-slate-600 hover:bg-slate-100"
            >
              <span aria-hidden>{persona?.icon}</span>
              <span>{persona?.name}</span>
            </button>
            {showPersonas && (
              <div className="absolute bottom-10 left-0 w-44 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5">
                {settings.personas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      void setSettings({ personaId: p.id });
                      setShowPersonas(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-slate-50 ${
                      p.id === settings.personaId ? "text-slate-900" : "text-slate-600"
                    }`}
                  >
                    <span aria-hidden>{p.icon}</span>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
