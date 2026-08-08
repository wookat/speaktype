import type { AsrProvider, AsrSession } from "../types";
import { fromBase64, toBase64, type FromBridge, type ToBridge } from "./messages";
import {
  buildStartSessionPayload,
  decodeFrame,
  encodeFrame,
  readAsrText,
  type DoubaoIds,
  type ServerFrame,
} from "./protocol";

const PING_INTERVAL_MS = 5000;
const FINAL_WAIT_MS = 2500;

/**
 * 豆包网页版同款流式识别（SAMI VoiceGenie）。
 *
 * 这是私有接口：靠用户自己 doubao.com 的登录态，握手在 doubao.com 页面内完成
 * （见 entrypoints/doubao-bridge.content.ts），随豆包发版可能失效。
 * 官方 provider（volc/zhipu）保留，出问题可一键切回。
 */
export const doubaoProvider: AsrProvider = {
  id: "doubao",
  needsPcm: true,
  async start({ settings, onPartial }) {
    let ids: DoubaoIds | null = null;
    let sessionId = "";
    let text = "";
    let failure: Error | null = null;
    let finalized = false;

    const waiters = new Map<string, (frame: ServerFrame) => void>();

    const toBridge = (msg: ToBridge) => browser.runtime.sendMessage(msg).catch(() => {});

    const listener = (raw: unknown) => {
      const msg = raw as FromBridge;
      if (!msg || msg.target !== "doubao-client") return;
      if (msg.type === "open-ok") {
        ids = msg.ids;
        waiters.get("__open")?.({ event: "__open" });
        return;
      }
      if (msg.type === "error") {
        failure = new Error(msg.message);
        for (const [, resolve] of waiters) resolve({ event: "__error" });
        return;
      }
      if (msg.type === "closed") {
        for (const [, resolve] of waiters) resolve({ event: "__closed" });
        return;
      }
      const frame = decodeFrame(fromBase64(msg.data).buffer as ArrayBuffer);
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
    browser.runtime.onMessage.addListener(listener);

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

    const send = (frame: Parameters<typeof encodeFrame>[0]) =>
      toBridge({ target: "doubao-bridge", type: "frame", data: toBase64(encodeFrame(frame)) });

    await toBridge({ target: "doubao-bridge", type: "open", language: settings.language });
    const opened = await waitFor("__open", 10000);
    if (!opened || failure) {
      browser.runtime.onMessage.removeListener(listener);
      throw failure ?? new Error("连不上豆包语音服务：请先在浏览器里登录 doubao.com");
    }

    await send({ event: "StartTask" });
    if (!(await waitFor("TaskStarted"))) {
      browser.runtime.onMessage.removeListener(listener);
      throw failure ?? new Error("豆包语音服务未响应 StartTask");
    }

    await send({
      event: "StartSession",
      sessionId,
      payload: buildStartSessionPayload(ids!, settings.language),
    });
    if (!(await waitFor("SessionStarted"))) {
      browser.runtime.onMessage.removeListener(listener);
      throw failure ?? new Error("豆包语音服务未响应 StartSession");
    }

    const ping = setInterval(() => void send({ event: "Ping", sessionId }), PING_INTERVAL_MS);

    const cleanup = () => {
      clearInterval(ping);
      browser.runtime.onMessage.removeListener(listener);
      void toBridge({ target: "doubao-bridge", type: "close" });
    };

    return {
      pushPcm(frame) {
        void send({
          event: "TaskRequest",
          sessionId,
          audio: new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength),
        });
      },
      async finish() {
        clearInterval(ping);
        await send({ event: "FinishSession", sessionId });
        // 等一小会儿收尾：二遍识别会在判停后补一版更准的最终文本
        const deadline = Date.now() + FINAL_WAIT_MS;
        while (!finalized && Date.now() < deadline && !failure) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        cleanup();
        if (failure && !text) throw failure;
        return text.trim();
      },
      cancel() {
        cleanup();
      },
    } satisfies AsrSession;
  },
};
