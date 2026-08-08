import { getProvider } from "@/lib/asr";
import type { AsrSession } from "@/lib/asr";
import { startPcmCapture, type PcmCapture } from "@/lib/audio/capture";
import type { BgToOffscreen, OffscreenToBg, RecorderState } from "@/lib/types";

let capture: PcmCapture | null = null;
let session: AsrSession | null = null;
let busy = false;

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

async function start(msg: Extract<BgToOffscreen, { type: "start" }>) {
  if (busy) return;
  busy = true;
  try {
    report("connecting");
    const provider = getProvider(msg.settings.provider);
    session = await provider.start({
      settings: msg.settings,
      onPartial: (text) => send({ target: "background", type: "partial", text }),
    });
    if (provider.needsPcm) {
      capture = await startPcmCapture({
        onFrame: (frame) => session?.pushPcm(frame),
        onLevel: (value) => send({ target: "background", type: "level", value }),
      });
    }
    report("recording");
  } catch (error) {
    busy = false;
    session = null;
    await teardown();
    report("error", error instanceof Error ? error.message : String(error));
  }
}

async function stop() {
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
