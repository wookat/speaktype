// AudioWorklet: 把 AudioContext(16kHz) 的 float 帧累积成 200ms 的 PCM16 分包后抛给主线程。
// 200ms 是火山大模型流式识别的推荐分包大小（性能最优）。
const FRAME_SAMPLES = 3200; // 200ms @ 16kHz

class PcmCollector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(FRAME_SAMPLES);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const ch = input && input[0];
    if (!ch) return true;
    let offset = 0;
    while (offset < ch.length) {
      const n = Math.min(FRAME_SAMPLES - this.filled, ch.length - offset);
      this.buf.set(ch.subarray(offset, offset + n), this.filled);
      this.filled += n;
      offset += n;
      if (this.filled === FRAME_SAMPLES) {
        const pcm = new Int16Array(FRAME_SAMPLES);
        let peak = 0;
        for (let i = 0; i < FRAME_SAMPLES; i++) {
          const s = Math.max(-1, Math.min(1, this.buf[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          const a = s < 0 ? -s : s;
          if (a > peak) peak = a;
        }
        this.port.postMessage({ pcm, peak }, [pcm.buffer]);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-collector", PcmCollector);
