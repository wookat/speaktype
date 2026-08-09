import { api } from "./api";

/**
 * 隐藏录音页：主进程发 recorder:start 后开麦，16kHz/mono/PCM16、200ms 一帧回传。
 * 仅在用户主动按热键时开麦，不做后台常驻录音。
 */

const SAMPLE_RATE = 16000;

const WORKLET = `
class PcmCollector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.length = 0;
    this.target = ${SAMPLE_RATE / 5}; // 200ms
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let peak = 0;
    const pcm = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const v = Math.max(-1, Math.min(1, channel[i]));
      if (Math.abs(v) > peak) peak = Math.abs(v);
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    this.buffer.push(pcm);
    this.length += pcm.length;
    if (this.length >= this.target) {
      const merged = new Int16Array(this.length);
      let offset = 0;
      for (const part of this.buffer) {
        merged.set(part, offset);
        offset += part.length;
      }
      this.buffer = [];
      this.length = 0;
      this.port.postMessage({ pcm: merged, peak }, [merged.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm-collector", PcmCollector);
`;

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: AudioWorkletNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;

async function start(deviceId = ""): Promise<void> {
  if (ctx) return;
  try {
    const base = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    stream = await navigator.mediaDevices
      .getUserMedia({ audio: deviceId ? { ...base, deviceId: { exact: deviceId } } : base })
      // 选中的设备可能已拔掉，回退到系统默认麦克风
      .catch(() => navigator.mediaDevices.getUserMedia({ audio: base }));
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    source = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, "pcm-collector");
    node.port.onmessage = (ev: MessageEvent<{ pcm: Int16Array; peak: number }>) => {
      const pcm = ev.data.pcm;
      const copy = new Int16Array(pcm.length);
      copy.set(pcm);
      api.recorder.sendPcm(copy.buffer);
      api.recorder.sendLevel(ev.data.peak);
    };
    source.connect(node);
  } catch (error) {
    await stop();
    const name = error instanceof DOMException ? error.name : "";
    api.recorder.sendError(
      name === "NotAllowedError"
        ? "麦克风权限被拒绝：请在 Windows 设置 → 隐私 → 麦克风中允许桌面应用使用麦克风"
        : name === "NotFoundError"
          ? "没有找到麦克风设备"
          : error instanceof Error
            ? error.message
            : String(error),
    );
  }
}

async function stop(): Promise<void> {
  node?.port.close();
  node?.disconnect();
  source?.disconnect();
  for (const track of stream?.getTracks() ?? []) track.stop();
  await ctx?.close().catch(() => undefined);
  ctx = null;
  stream = null;
  node = null;
  source = null;
}

async function enumerate(): Promise<void> {
  try {
    // 未授权过时 label 为空，先开一下麦再枚举
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const track of probe.getTracks()) track.stop();
    api.recorder.sendDevices(
      devices
        .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId.slice(0, 8) })),
    );
  } catch {
    api.recorder.sendDevices([]);
  }
}

api.recorder.onStart(({ deviceId }) => void start(deviceId));
api.recorder.onStop(() => void stop());
api.recorder.onEnumerate(() => void enumerate());
