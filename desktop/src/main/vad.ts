import { app } from "electron";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import log from "electron-log/main.js";
import type { VadStatus } from "../shared/types";
import { downloadFiles } from "./download";

/**
 * 增强人声检测（Silero VAD v5，走 sherpa-onnx 内建 VAD）。
 * 与 SenseVoice/增强标点共用同一套 onnxruntime，避免双 ORT 版本冲突；
 * 模型（~2.3MB）不进安装包，首次启用时按需下载到 userData\vad，
 * 未下载或加载失败时上层回退到峰值门槛。
 */

const FILES = ["silero_vad.onnx"] as const;
// 与安装包同一发布分支托管；jsdelivr 作为国内可达的镜像源
const SOURCES = [
  "https://github.com/wookat/speaktype/raw/dist-v0.1.0/vad",
  "https://cdn.jsdelivr.net/gh/wookat/speaktype@dist-v0.1.0/vad",
];
const WINDOW = 512; // silero v5 @16kHz 固定 512 样本（32ms）
const SPEECH_PROB = 0.5;
// sherpa-onnx 预编译产物目前只随包带了 win-x64；其他平台回退峰值门槛
const SUPPORTED = process.platform === "win32" && process.arch === "x64";

function vadDir(): string {
  return join(app.getPath("userData"), "vad");
}

export function vadDownloaded(): boolean {
  return FILES.every((f) => existsSync(join(vadDir(), f)));
}

// 旧版 VAD 增强包独立带过一套 ORT runtime（约 33MB），现已不加载，启动时顺手清掉
const LEGACY_FILES = [
  "onnxruntime.dll",
  "onnxruntime_providers_shared.dll",
  "DirectML.dll",
  "msvcp140_1.dll",
  "msvcp140_2.dll",
  "onnxruntime_binding.node",
];

export function cleanupLegacyVad(): void {
  for (const f of LEGACY_FILES) {
    try {
      rmSync(join(vadDir(), f), { force: true });
    } catch (error) {
      log.warn("vad: failed to remove legacy file", f, error);
    }
  }
}

const status: VadStatus = { supported: SUPPORTED, downloaded: false, downloading: false, progress: 0 };
let notify: ((s: VadStatus) => void) | null = null;

export function onVadStatus(cb: (s: VadStatus) => void): void {
  notify = cb;
}

export function vadStatus(): VadStatus {
  if (status.downloading) return { ...status };
  return { supported: SUPPORTED, downloaded: SUPPORTED && vadDownloaded(), downloading: false, progress: 0 };
}

function push(patch: Partial<VadStatus>): void {
  Object.assign(status, patch);
  notify?.({ ...status });
}

/** 按需下载 VAD 模型（约 2.3MB） */
export async function downloadVad(): Promise<VadStatus> {
  if (!SUPPORTED || status.downloading) return { ...status };
  if (vadDownloaded()) return vadStatus();

  push({ downloading: true, downloaded: false, progress: 0, error: undefined });
  try {
    await downloadFiles(
      FILES.map((file) => ({ sources: SOURCES.map((src) => `${src}/${file}`), dest: join(vadDir(), file) })),
      (percent) => push({ progress: percent }),
    );
    sessionFailed = false;
    push({ downloading: false, downloaded: true, progress: 100 });
    log.info("vad pack downloaded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    push({ downloading: false, downloaded: false, progress: 0, error: message });
    log.warn("vad pack download failed", error);
  }
  return { ...status };
}

interface SherpaVad {
  acceptWaveform(samples: Float32Array): void;
  isDetected(): boolean;
  isEmpty(): boolean;
  pop(): void;
}

let sessionFailed = false; // 加载失败只报一次；重新下载成功后重置

/** 流式 Silero 检测器：喂 16k PCM，按 512 样本窗口统计人声毫秒 */
export class SileroVad {
  private vad: SherpaVad | null = null;
  private pending = new Float32Array(WINDOW);
  private pendingLen = 0;

  static create(): SileroVad | null {
    if (sessionFailed || !vadDownloaded()) return null;
    try {
      const require2 = createRequire(import.meta.url);
      const mod = require2("sherpa-onnx-node") as {
        Vad: new (config: object, bufferSizeInSeconds: number) => SherpaVad;
      };
      const instance = new SileroVad();
      instance.vad = new mod.Vad(
        {
          sileroVad: {
            model: join(vadDir(), "silero_vad.onnx"),
            threshold: SPEECH_PROB,
            minSpeechDuration: 0.1,
            minSilenceDuration: 0.25,
            maxSpeechDuration: 30,
            windowSize: WINDOW,
          },
          sampleRate: 16000,
          numThreads: 1,
          debug: 0,
        },
        10,
      );
      return instance;
    } catch (error) {
      sessionFailed = true; // 加载失败只报一次，之后回退峰值门槛
      log.warn("silero vad load failed, falling back to peak threshold", error);
      return null;
    }
  }

  /** 返回本次新增的人声毫秒数（凑不满一个窗口的余量留到下次） */
  push(frame: Int16Array): number {
    if (!this.vad) return 0;
    let voicedMs = 0;
    let idx = 0;
    while (idx < frame.length) {
      const take = Math.min(WINDOW - this.pendingLen, frame.length - idx);
      for (let i = 0; i < take; i++) this.pending[this.pendingLen + i] = frame[idx + i]! / 32768;
      this.pendingLen += take;
      idx += take;
      if (this.pendingLen === WINDOW) {
        this.pendingLen = 0;
        try {
          this.vad.acceptWaveform(this.pending.slice());
          if (this.vad.isDetected()) voicedMs += 32;
          while (!this.vad.isEmpty()) this.vad.pop(); // 只要检测不要分段，及时排空避免积压
        } catch (error) {
          log.warn("silero vad inference failed", error);
          this.vad = null;
          return 0;
        }
      }
    }
    return voicedMs;
  }
}
