import { ipcRenderer } from "electron";
import { type Socket, connect } from "node:net";
import { isVirtualMic, pickAutoMic, sortMicDevices, type MicDeviceItem } from "../shared/mic";

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
/** getUserMedia 进行中：同期再来的 start 直接复用，避免开出两条采集链路只留一条引用 */
let starting = false;
/** 开麦尚未完成就收到 stop（短按即松/取消）：开完立即关，不让麦克风悬空开着 */
let stopWhileStarting = false;
/** 自动检测模式下已证实连续输出全 0 的死麦 deviceId */
const deadAutoIds = new Set<string>();
/** 自动检测模式下已优选出的非虚拟物理麦 deviceId */
let autoPreferredId = "";

navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  deadAutoIds.clear();
  autoPreferredId = "";
});

async function listRealAudioInputs(): Promise<MicDeviceItem[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return sortMicDevices(
    devices
      .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
      .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId.slice(0, 8) })),
  );
}

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
  if (ctx || starting) {
    stopWhileStarting = false;
    return;
  }
  starting = true;
  stopWhileStarting = false;
  try {
    const base = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const initialId = deviceId || (autoPreferredId && !deadAutoIds.has(autoPreferredId) ? autoPreferredId : "");
    stream = await navigator.mediaDevices
      .getUserMedia({ audio: initialId ? { ...base, deviceId: { exact: initialId } } : base })
      // 选中的设备可能已拔掉，回退到系统默认麦克风
      .catch(() => navigator.mediaDevices.getUserMedia({ audio: base }));

    // 自动检测模式：若系统默认设备落在虚拟声卡/降噪壳或已知死麦上，改选最优真实物理麦
    if (!deviceId) {
      const track = stream.getAudioTracks()[0];
      const trackLabel = track?.label ?? "";
      const trackId = track?.getSettings?.().deviceId ?? "";
      if (isVirtualMic(trackLabel) || (trackId && deadAutoIds.has(trackId))) {
        const devices = await listRealAudioInputs();
        const preferred = pickAutoMic(devices, trackLabel, deadAutoIds);
        if (preferred) {
          for (const t of stream.getTracks()) t.stop();
          stream = await navigator.mediaDevices
            .getUserMedia({ audio: { ...base, deviceId: { exact: preferred.deviceId } } })
            .catch(() => navigator.mediaDevices.getUserMedia({ audio: base }));
          autoPreferredId = preferred.deviceId;
        }
      }
    }

    const openedLabel = stream.getAudioTracks()[0]?.label ?? "unknown";
    ipcRenderer.send("recorder:opened", { label: openedLabel, auto: !deviceId });

    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    source = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, "pcm-collector");
    ensurePipe();
    let zeroFrames = 0;
    let switchedDead = false;
    node.port.onmessage = (ev: MessageEvent<{ pcm: Int16Array; peak: number }>) => {
      const pcm = ev.data.pcm;
      const peak = ev.data.peak;
      if (peak > 0) {
        zeroFrames = 0;
      } else if (!deviceId && !switchedDead) {
        zeroFrames++;
        if (zeroFrames >= 3) {
          switchedDead = true;
          const currentCtx = ctx;
          const currentNode = node;
          const oldStream = stream;
          const oldSource = source;
          const currentTrack = oldStream?.getAudioTracks()[0];
          const currentLabel = currentTrack?.label ?? "";
          const currentId = currentTrack?.getSettings?.().deviceId ?? "";
          void (async () => {
            if (currentId) deadAutoIds.add(currentId);
            const devices = await listRealAudioInputs();
            for (const d of devices) {
              if (currentLabel && d.label === currentLabel) deadAutoIds.add(d.deviceId);
            }
            if (ctx !== currentCtx || node !== currentNode || !currentCtx || !currentNode) return;
            autoPreferredId = "";
            const next = pickAutoMic(devices, currentLabel, deadAutoIds);
            if (!next) return;
            const newStream = await navigator.mediaDevices
              .getUserMedia({ audio: { ...base, deviceId: { exact: next.deviceId } } })
              .catch(() => null);
            if (!newStream) return;
            if (ctx !== currentCtx || node !== currentNode) {
              for (const t of newStream.getTracks()) t.stop();
              return;
            }
            const newSource = currentCtx.createMediaStreamSource(newStream);
            newSource.connect(currentNode);
            oldSource?.disconnect();
            for (const t of oldStream?.getTracks() ?? []) t.stop();
            stream = newStream;
            source = newSource;
            autoPreferredId = next.deviceId;
            zeroFrames = 0;
            ipcRenderer.send("recorder:opened", {
              label: newStream.getAudioTracks()[0]?.label || next.label,
              auto: true,
              fallback: true,
            });
          })();
        }
      }
      const frame = Buffer.allocUnsafe(8 + pcm.byteLength);
      frame.writeUInt32LE(pcm.byteLength, 0);
      frame.writeFloatLE(peak, 4);
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(frame, 8);
      // 每帧重取：连接意外断开时自动重连，坏帧不阻塞后续
      ensurePipe().write(frame);
    };
    source.connect(node);
  } catch (error) {
    starting = false;
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
  } finally {
    starting = false;
    if (stopWhileStarting) {
      stopWhileStarting = false;
      await stop();
    }
  }
}

async function stop(): Promise<void> {
  if (starting) {
    stopWhileStarting = true;
    return;
  }
  // 先同步清状态再等 close：stop 紧接 start（上一句收尾中又按下热键）时 start 不会因 ctx 未清而被吞
  const closing = ctx;
  node?.port.close();
  node?.disconnect();
  source?.disconnect();
  for (const track of stream?.getTracks() ?? []) track.stop();
  ctx = null;
  stream = null;
  node = null;
  source = null;
  await closing?.close().catch(() => undefined);
}

async function enumerate(): Promise<void> {
  try {
    // 未授权过时 label 为空，先开一下麦再枚举
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    const list = await listRealAudioInputs();
    for (const track of probe.getTracks()) track.stop();
    ipcRenderer.send("recorder:devices", list);
  } catch {
    ipcRenderer.send("recorder:devices", []);
  }
}

ipcRenderer.on("recorder:start", (_e, opts: { deviceId: string }) => void start(opts?.deviceId ?? ""));
ipcRenderer.on("recorder:stop", () => void stop());
ipcRenderer.on("recorder:enumerate", () => void enumerate());
