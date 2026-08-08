export const SAMPLE_RATE = 16000;

export interface PcmCapture {
  stop(): Promise<void>;
}

export interface CaptureHandlers {
  onFrame(pcm: Int16Array): void;
  onLevel?(peak: number): void;
}

/**
 * 采集麦克风并输出 16kHz/mono/PCM16 的 200ms 分包。
 * AudioContext 直接以 16kHz 创建，由浏览器完成重采样，避免自己写重采样器。
 */
export async function startPcmCapture(handlers: CaptureHandlers): Promise<PcmCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  await ctx.audioWorklet.addModule(browser.runtime.getURL("/pcm-worklet.js"));
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-collector");
  node.port.onmessage = (ev: MessageEvent<{ pcm: Int16Array; peak: number }>) => {
    handlers.onFrame(ev.data.pcm);
    handlers.onLevel?.(ev.data.peak);
  };
  source.connect(node);
  // processor 不写 output，所以接到 destination 只是为了让节点被持续调度，不会产生回放。
  node.connect(ctx.destination);

  return {
    async stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      for (const track of stream.getTracks()) track.stop();
      await ctx.close();
    },
  };
}

/** PCM16 → WAV（供一次性转写接口使用） */
export function pcmToWav(frames: Int16Array[], sampleRate = SAMPLE_RATE): Blob {
  const total = frames.reduce((n, f) => n + f.length, 0);
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + total * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, total * 2, true);
  let offset = 44;
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i++) {
      view.setInt16(offset, frame[i]!, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}
