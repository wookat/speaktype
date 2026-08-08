import { getProvider } from "@/lib/asr";
import type { AsrSession } from "@/lib/asr";
import { startPcmCapture, type PcmCapture } from "@/lib/audio/capture";
import { toMicError } from "@/lib/mic";
import type { BgToOffscreen, FixAction, OffscreenToBg, RecorderState } from "@/lib/types";

let capture: PcmCapture | null = null;
let session: AsrSession | null = null;
let busy = false;
/**
 * 连接期（还没拿到 session）收到的结束指令。按住说话很容易在“准备中…”就松手，
 * 不排队的话这条 stop/cancel 会直接丢掉，录音就一直跑下去。
 */
let pendingEnd: "stop" | "cancel" | null = null;
/** 握手完成前先攒下的音频帧（200ms/帧，封顶约 30s） */
let buffered: Int16Array[] = [];
const MAX_BUFFERED_FRAMES = 150;

function send(msg: OffscreenToBg) {
  void browser.runtime.sendMessage(msg).catch(() => {});
}

function report(state: RecorderState, message?: string, action?: FixAction) {
  send({ target: "background", type: "state", state, message, action });
}

/** 错误 → 人话 + 可点的修复入口 */
function describe(error: unknown, provider: string): { message: string; action?: FixAction } {
  const mic = toMicError(error);
  if (mic) return { message: mic.message, action: "grant-mic" };
  const message = error instanceof Error ? error.message : String(error);
  if (provider === "doubao" && /doubao|豆包/.test(message)) return { message, action: "open-doubao" };
  return { message };
}

async function teardown() {
  buffered = [];
  const c = capture;
  capture = null;
  await c?.stop().catch(() => {});
}

/** 连接期排队的结束指令：拿到一个就执行它，返回是否已结束 */
async function flushPendingEnd(): Promise<boolean> {
  const end = pendingEnd;
  if (!end) return false;
  pendingEnd = null;
  if (end === "cancel") await cancel();
  else await stop();
  return true;
}

async function start(msg: Extract<BgToOffscreen, { type: "start" }>) {
  if (busy) return;
  busy = true;
  pendingEnd = null;
  try {
    report("connecting");
    const provider = getProvider(msg.settings.provider);
    const opening = provider.start({
      settings: msg.settings,
      onPartial: (text) => send({ target: "background", type: "partial", text }),
    });
    // 握手先于录音就绪失败时，避免在 await 之前报 unhandledrejection
    opening.catch(() => {});

    if (provider.needsPcm) {
      // 麦克风先开、连接后建：握手期间（豆包冷启动能到好几秒）的话音先缓冲，
      // 连上再补发，否则第一句的开头会被吃掉。
      capture = await startPcmCapture({
        onFrame: (frame) => {
          if (session) session.pushPcm(frame);
          else if (buffered.length < MAX_BUFFERED_FRAMES) buffered.push(frame);
        },
        onLevel: (value) => send({ target: "background", type: "level", value }),
      });
      report("recording");
    }

    session = await opening;
    for (const frame of buffered) session.pushPcm(frame);
    buffered = [];
    if (await flushPendingEnd()) return;
    report("recording");
  } catch (error) {
    busy = false;
    pendingEnd = null;
    session = null;
    await teardown();
    const { message, action } = describe(error, msg.settings.provider);
    report("error", message, action);
  }
}

async function stop() {
  if (busy && !session) {
    pendingEnd = "stop";
    return;
  }
  const current = session;
  session = null;
  if (!current) {
    busy = false;
    return;
  }
  report("processing");
  await teardown();
  try {
    const text = await current.finish();
    send({ target: "background", type: "transcript", text });
  } catch (error) {
    const { message, action } = describe(error, "");
    report("error", message, action);
  } finally {
    busy = false;
  }
}

async function cancel() {
  if (busy && !session) {
    pendingEnd = "cancel";
    return;
  }
  const current = session;
  session = null;
  busy = false;
  current?.cancel();
  await teardown();
  report("idle");
}

browser.runtime.onMessage.addListener((raw: unknown) => {
  const msg = raw as BgToOffscreen;
  if (!msg || msg.target !== "offscreen") return;
  if (msg.type === "start") void start(msg);
  else if (msg.type === "stop") void stop();
  else if (msg.type === "cancel") void cancel();
});
