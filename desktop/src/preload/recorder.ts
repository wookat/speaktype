import { ipcRenderer } from "electron";
import { type Socket, connect } from "node:net";

/**
 * 隐藏录音窗口专用 preload：开麦、AudioWorklet 采集 16kHz/mono/PCM16、200ms 一帧。
 * PCM 帧走命名管道（Node net）直达主进程：逐帧 Chromium IPC（无论
 * ipcRenderer.send 还是 MessagePort 结构化拷贝）实测都会在录音渲染进程
 * 原生内存里线性累积不释放；管道是纯 Node Buffer，完全绕开序列化。
 * 帧格式：u32le pcm 字节数 + f32le peak + pcm。
 * 低频控制消息（start/stop/枚举/错误）仍走常规 ipc。
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

const PCM_PIPE = (process.argv.find((a) => a.startsWith("--pcm-pipe=")) ?? "").slice("--pcm-pipe=".length);

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: AudioWorkletNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let pcmSock: Socket | null = null;

function ensurePipe(): Socket {
  if (pcmSock && !pcmSock.destroyed) return pcmSock;
  pcmSock = connect(PCM_PIPE);
  pcmSock.on("error", () => {
    pcmSock?.destroy();
    pcmSock = null;
  });
  return pcmSock;
}

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
    ensurePipe();
    node.port.onmessage = (ev: MessageEvent<{ pcm: Int16Array; peak: number }>) => {
      const pcm = ev.data.pcm;
      const frame = Buffer.allocUnsafe(8 + pcm.byteLength);
      frame.writeUInt32LE(pcm.byteLength, 0);
      frame.writeFloatLE(ev.data.peak, 4);
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(frame, 8);
      // 每帧重取：连接意外断开时自动重连，坏帧不阻塞后续
      ensurePipe().write(frame);
    };
    source.connect(node);
  } catch (error) {
    await stop();
    const name = error instanceof DOMException ? error.name : "";
    // 发送错误码，由主进程按界面语言翻译成提示文案
    ipcRenderer.send(
      "recorder:error",
      name === "NotAllowedError"
        ? "@micDenied"
        : name === "NotFoundError"
          ? "@micNotFound"
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
    ipcRenderer.send(
      "recorder:devices",
      devices
        .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId.slice(0, 8) })),
    );
  } catch {
    ipcRenderer.send("recorder:devices", []);
  }
}

ipcRenderer.on("recorder:start", (_e, opts: { deviceId: string }) => void start(opts?.deviceId ?? ""));
ipcRenderer.on("recorder:stop", () => void stop());
ipcRenderer.on("recorder:enumerate", () => void enumerate());
