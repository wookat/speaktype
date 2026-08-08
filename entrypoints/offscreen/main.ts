import { getProvider } from "@/lib/asr";
import type { AsrSession } from "@/lib/asr";
import { startPcmCapture, type PcmCapture } from "@/lib/audio/capture";
import type { BgToOffscreen, OffscreenToBg, RecorderState } from "@/lib/types";

let capture: PcmCapture | null = null;
let session: AsrSession | null = null;
let busy = false;
/**
 * 连接期（还没拿到 session）收到的结束指令。按住说话很容易在“准备中…”就松手，
 * 不排队的话这条 stop/cancel 会直接丢掉，录音就一直跑下去。
 */
let pendingEnd: "stop" | "cancel" | null = null;

function send(msg: OffscreenToBg) {
  void browser.runtime.sendMessage(msg).catch(() => {});
}

function report(state: RecorderState, message?: string) {
  send({ target: "background", type: "state", state, message });
}

async function teardown() {
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
    session = await provider.start({
      settings: msg.settings,
      onPartial: (text) => send({ target: "background", type: "partial", text }),
    });
    if (await flushPendingEnd()) return;
    if (provider.needsPcm) {
      capture = await startPcmCapture({
        onFrame: (frame) => session?.pushPcm(frame),
        onLevel: (value) => send({ target: "background", type: "level", value }),
      });
      if (await flushPendingEnd()) return;
    }
    report("recording");
  } catch (error) {
    busy = false;
    pendingEnd = null;
    session = null;
    await teardown();
    report("error", error instanceof Error ? error.message : String(error));
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
    report("error", error instanceof Error ? error.message : String(error));
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
