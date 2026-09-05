import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  buildStartSessionPayload,
  decodeFrame,
  encodeFrame,
  readAsrText,
  type DoubaoIds,
  type ServerFrame,
} from "../shared/doubao-protocol";
import { t } from "./i18n";
import { createBridgeWindow } from "./windows";
import { DEFAULT_SETTINGS, getAppKeyCache, getSettings, setAppKeyCache } from "./store";

const PING_INTERVAL_MS = 5000;
const FINAL_WAIT_MS = 2500;

export interface DoubaoSession {
  pushPcm(frame: Int16Array): void;
  finish(): Promise<string>;
  cancel(): void;
}

type BridgeEvent =
  | { type: "app-key"; key: string }
  | { type: "open-ok"; ids: DoubaoIds }
  | { type: "frame"; data: string }
  | { type: "closed"; code?: number }
  | { type: "error"; message: string };

let bridge: BrowserWindow | null = null;
let appKeyCaptured: (() => void) | null = null;

/** 截到 app key（激活完成）时通知主窗口刷新状态 */
export function onAppKeyCaptured(fn: () => void): void {
  appKeyCaptured = fn;
}
let listeners = new Set<(ev: BridgeEvent) => void>();
let loaded = false;

export function bridgeReady(): boolean {
  return Boolean(bridge && !bridge.isDestroyed() && loaded);
}

export function hasAppKey(): boolean {
  return Boolean(getSettings().doubaoAppKey || getAppKeyCache());
}

/** 抢跑：热键按下的瞬间就把桥接窗口拉起来，真正起录时只剩 WebSocket 握手 */
export function ensureBridge(): BrowserWindow {
  if (bridge && !bridge.isDestroyed()) return bridge;
  loaded = false;
  bridge = createBridgeWindow();
  bridge.webContents.on("did-finish-load", () => {
    loaded = true;
    void injectKeyHook(bridge!, !hasAppKey() || bridge!.isVisible());
  });
  bridge.on("closed", () => {
    bridge = null;
    loaded = false;
  });
  return bridge;
}

/** 收掉隐藏的桥接窗口，断开其保持的豆包连接；用户主动打开的可见登录窗不动 */
export function closeBridge(): void {
  if (bridge && !bridge.isDestroyed() && !bridge.isVisible()) bridge.destroy();
}

/** 让用户登录/激活豆包时把桥接窗口显示出来 */
export function showBridge(): void {
  const win = ensureBridge();
  win.show();
  win.focus();
}

/**
 * app key 是 doubao.com 前端自己下发的参数（随其改版轮换），不内置在应用里。两条捕获路径：
 * 1. hook 页面主世界的 WebSocket 构造——用户用一次豆包自带语音，voicegenie 建连 URL 里就带着 key（权威来源）；
 * 2. scanBundles：key 同时以字面量写在豆包前端 bundle 里，紧邻 voicegenie 的 version_code 参数表，
 *    登录后扫一遍已加载脚本即可免语音直接拿到（脚本走浏览器缓存，全量约 1s）。
 */
async function injectKeyHook(win: BrowserWindow, scanBundles: boolean): Promise<void> {
  await win.webContents
    .executeJavaScript(
      `(() => {
        if (window.__speaktypeHook) return;
        window.__speaktypeHook = true;
        const report = (key) => window.postMessage({ source: "speaktype-doubao-hook", appKey: key }, location.origin);
        if (${scanBundles}) {
          const seen = new Set();
          let found = false;
          const pattern = /"([A-Za-z0-9_-]{12,32})",\\w+=\\{version_code:"/;
          const scan = async (urls) => {
            for (const url of urls) {
              if (found || seen.has(url) || !/\\.js(\\?|$)/.test(url)) continue;
              seen.add(url);
              try {
                const match = pattern.exec(await (await fetch(url)).text());
                if (match && !found) {
                  found = true;
                  report(match[1]);
                }
              } catch {}
            }
          };
          new PerformanceObserver((list) => void scan(list.getEntries().map((e) => e.name)))
            .observe({ type: "resource", buffered: true });
        }
        const Native = window.WebSocket;
        window.WebSocket = function (url, protocols) {
          try {
            const text = String(url);
            if (/voicegenie/i.test(text)) {
              const key = new URL(text).searchParams.get("api_app_key");
              if (key) report(key);
            }
          } catch {}
          return protocols === undefined ? new Native(url) : new Native(url, protocols);
        };
        window.WebSocket.prototype = Native.prototype;
        for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) window.WebSocket[k] = Native[k];
      })();`,
    )
    .catch(() => undefined);
}

function emit(ev: BridgeEvent): void {
  for (const listener of [...listeners]) listener(ev);
}

ipcMain.on("doubao:event", (_e, ev: BridgeEvent) => {
  if (ev.type === "app-key") {
    if (/^[A-Za-z0-9_-]{12,32}$/.test(ev.key) && ev.key !== getAppKeyCache()) {
      setAppKeyCache(ev.key);
      appKeyCaptured?.();
    }
    return;
  }
  emit(ev);
});

function toBridge(channel: string, payload: unknown): void {
  if (bridge && !bridge.isDestroyed()) bridge.webContents.send(channel, payload);
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, "base64"));
}

export async function startDoubaoSession(
  language: string,
  onPartial: (text: string) => void,
): Promise<DoubaoSession> {
  // 豆包协议要具体语种：「自动」回落到系统语言推导的默认识别语言
  if (language === "auto") language = DEFAULT_SETTINGS.language;
  const settings = getSettings();
  const appKey = settings.doubaoAppKey || getAppKeyCache();
  if (!appKey) {
    throw new Error(t("error.noAppKey"));
  }

  ensureBridge();

  let ids: DoubaoIds | null = null;
  let sessionId = "";
  let text = "";
  let failure: Error | null = null;
  let finalized = false;
  const waiters = new Map<string, (frame: ServerFrame) => void>();

  const listener = (ev: BridgeEvent) => {
    if (ev.type === "open-ok") {
      ids = ev.ids;
      waiters.get("__open")?.({ event: "__open" });
      return;
    }
    if (ev.type === "error") {
      failure = new Error(ev.message);
      for (const [, resolve] of waiters) resolve({ event: "__error" });
      return;
    }
    if (ev.type === "closed") {
      for (const [, resolve] of waiters) resolve({ event: "__closed" });
      return;
    }
    if (ev.type !== "frame") return;
    const frame = decodeFrame(fromBase64(ev.data).buffer as ArrayBuffer);
    if (frame.statusCode && frame.statusCode !== 20000000) {
      failure = new Error(`豆包识别错误 ${frame.statusCode}: ${frame.statusMessage ?? ""}`.trim());
    }
    if (frame.event === "TaskStarted" && frame.connectId) sessionId = frame.connectId;
    if (frame.event === "ASRResponse") {
      const result = readAsrText(frame.payload);
      if (result?.text) {
        text = result.text;
        onPartial(text);
        if (!result.interim) finalized = true;
      }
    }
    waiters.get(frame.event)?.(frame);
  };
  listeners.add(listener);

  const waitFor = (event: string, timeoutMs = 8000) =>
    new Promise<ServerFrame | null>((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(event);
        resolve(null);
      }, timeoutMs);
      const done = (frame: ServerFrame) => {
        clearTimeout(timer);
        waiters.delete(event);
        resolve(frame);
      };
      waiters.set(event, done);
      waiters.set("__error", done);
      waiters.set("__closed", done);
    });

  const send = (frame: { event: string; payload?: unknown; sessionId?: string; audio?: Uint8Array }) =>
    toBridge("doubao:send", {
      data: toBase64(
        encodeFrame({
          event: frame.event as never,
          appKey: ids?.appKey ?? appKey,
          payload: frame.payload,
          sessionId: frame.sessionId,
          audio: frame.audio,
        }),
      ),
    });

  const cleanup = () => {
    listeners.delete(listener);
    toBridge("doubao:close", {});
  };

  toBridge("doubao:open", { language, appKey });
  const opened = await waitFor("__open", 20000);
  if (!opened || failure) {
    cleanup();
    throw failure ?? new Error("连不上豆包语音服务：请确认应用内已登录 doubao.com 且网络可达");
  }

  send({ event: "StartTask" });
  if (!(await waitFor("TaskStarted"))) {
    cleanup();
    throw failure ?? new Error("豆包语音服务未响应 StartTask");
  }

  send({
    event: "StartSession",
    sessionId,
    payload: buildStartSessionPayload(ids!, language),
  });
  if (!(await waitFor("SessionStarted"))) {
    cleanup();
    throw failure ?? new Error("豆包语音服务未响应 StartSession");
  }

  const ping = setInterval(() => send({ event: "Ping", sessionId }), PING_INTERVAL_MS);

  return {
    pushPcm(frame) {
      send({
        event: "TaskRequest",
        sessionId,
        audio: new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength),
      });
    },
    async finish() {
      clearInterval(ping);
      send({ event: "FinishSession", sessionId });
      // 二遍识别会在判停后补一版更准的最终文本，等一小会儿收尾
      const deadline = Date.now() + FINAL_WAIT_MS;
      while (!finalized && Date.now() < deadline && !failure) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      cleanup();
      if (failure && !text) throw failure;
      return text.trim();
    },
    cancel() {
      clearInterval(ping);
      cleanup();
    },
  };
}

/** 设置页「测试转写」：真发一段短静音会话，把真实失败原因（缺 key/未登录/握手被拒）原样返回 */
export async function testDoubao(): Promise<{ ok: boolean; detail: string }> {
  try {
    const session = await startDoubaoSession(getSettings().language, () => undefined);
    session.pushPcm(new Int16Array(5120)); // 320ms @16kHz 静音
    await session.finish();
    return { ok: true, detail: "Doubao" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
