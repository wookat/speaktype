import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { Converter } from "opencc-js/t2cn";
import log from "electron-log/main.js";
import type { Settings, TranscribeSegment, TranscribeState } from "../shared/types";
import { pcmToWav } from "./asr";
import { correctHotwords } from "./hotwords";
import { t } from "./i18n";
import { ensureLocalServer, isSherpaModel, transcribeSherpa } from "./localasr";

/**
 * 文件转录：整段 16k 单声道音频按静音切成若干段，逐段走内置离线引擎
 * （sherpa 进程内 / whisper-server），返回带时间戳的分段文本，可导出 SRT。
 * 音频解码在渲染进程（decodeAudioData 支持 mp3/m4a/wav/ogg/flac 等），
 * 这里只处理已重采样好的浮点采样。
 */

const SR = 16000;
/** 静音探测粒度（样本数）：100ms */
const HOP = SR / 10;
/** 单段上限：过长会拖慢单次解码；在 [MIN_CUT, MAX_SEG] 区间找最静的点切开 */
const MAX_SEG_S = 28;
const MIN_CUT_S = 16;
/** 段内峰值低于该值视为纯静音段，跳过识别避免幻听 */
const SILENT_PEAK = 0.008;

let t2cn: ((text: string) => string) | null = null;

function toSimplified(text: string): string {
  if (!t2cn) t2cn = Converter({ from: "t", to: "cn" });
  return t2cn(text);
}

const state: TranscribeState = { running: false, percent: 0, segments: [] };
let notify: ((s: TranscribeState) => void) | null = null;
let jobId = 0;

// 完成的转录结果落盘：3 小时长音频转一次可能要几十分钟，重启不该作废
function lastResultFile(): string {
  return join(app.getPath("userData"), "transcribe-last.json");
}

let lastLoaded = false;

function loadLastResult(): void {
  if (lastLoaded) return;
  lastLoaded = true;
  try {
    if (!existsSync(lastResultFile())) return;
    const saved = JSON.parse(readFileSync(lastResultFile(), "utf8")) as {
      segments?: TranscribeSegment[];
      fileName?: string;
    };
    if (!state.running && Array.isArray(saved.segments) && saved.segments.length > 0) {
      Object.assign(state, { percent: 100, segments: saved.segments, fileName: saved.fileName });
    }
  } catch (error) {
    log.warn("transcribe last result load failed", error);
  }
}

function saveLastResult(): void {
  try {
    writeFileSync(
      lastResultFile(),
      JSON.stringify({ segments: state.segments, fileName: state.fileName }),
      "utf8",
    );
  } catch (error) {
    log.warn("transcribe last result save failed", error);
  }
}

export function onTranscribeState(cb: (s: TranscribeState) => void): void {
  notify = cb;
}

export function transcribeState(): TranscribeState {
  loadLastResult();
  return { ...state, segments: [...state.segments] };
}

function push(patch: Partial<TranscribeState>): void {
  Object.assign(state, patch);
  notify?.(transcribeState());
}

export function cancelTranscribe(): void {
  if (!state.running) return;
  jobId++;
  push({ running: false });
}

/** 每 100ms 的 RMS，用于找静音切点 */
function rmsProfile(samples: Float32Array): Float32Array {
  const frames = Math.ceil(samples.length / HOP);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * HOP;
    const end = Math.min(start + HOP, samples.length);
    for (let i = start; i < end; i++) sum += samples[i]! * samples[i]!;
    out[f] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return out;
}

/** 按静音切段：每段 ≤ MAX_SEG_S，切点选 [MIN_CUT_S, MAX_SEG_S] 内最静的 100ms */
function splitSegments(samples: Float32Array): Array<[number, number]> {
  const rms = rmsProfile(samples);
  const total = samples.length;
  const out: Array<[number, number]> = [];
  let start = 0;
  while (start < total) {
    const remain = total - start;
    if (remain <= MAX_SEG_S * SR) {
      out.push([start, total]);
      break;
    }
    const fromFrame = Math.floor((start + MIN_CUT_S * SR) / HOP);
    const toFrame = Math.floor((start + MAX_SEG_S * SR) / HOP);
    let best = toFrame;
    let bestRms = Number.POSITIVE_INFINITY;
    for (let f = fromFrame; f <= toFrame && f < rms.length; f++) {
      if (rms[f]! < bestRms) {
        bestRms = rms[f]!;
        best = f;
      }
    }
    const cut = Math.min(total, (best + 1) * HOP);
    out.push([start, cut]);
    start = cut;
  }
  return out;
}

function segmentPeak(samples: Float32Array, from: number, to: number): number {
  let peak = 0;
  for (let i = from; i < to; i++) {
    const v = Math.abs(samples[i]!);
    if (v > peak) peak = v;
  }
  return peak;
}

function floatToInt16(samples: Float32Array, from: number, to: number): Int16Array {
  const out = new Int16Array(to - from);
  for (let i = 0; i < out.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[from + i]!));
    out[i] = Math.round(v * 32767);
  }
  return out;
}

async function transcribeSlice(
  settings: Settings,
  model: string,
  samples: Float32Array,
  from: number,
  to: number,
): Promise<string> {
  if (isSherpaModel(model)) {
    // slice：worker postMessage 结构化克隆会拷整个底层 buffer
    return transcribeSherpa(model, samples.slice(from, to), SR, settings.language || "auto");
  }
  const url = await ensureLocalServer(model);
  const wav = pcmToWav([floatToInt16(samples, from, to)]);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "clip.wav");
  form.append("response_format", "json");
  if (settings.language) form.append("language", settings.language);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Local ASR HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  return settings.localSimplified !== false ? toSimplified(text) : text;
}

/** 转录一整个文件的采样（16k mono）。进度和分段结果通过 onTranscribeState 推送 */
export async function startTranscribe(
  settings: Settings,
  samples: Float32Array,
  fileName?: string,
): Promise<TranscribeState> {
  if (state.running) return transcribeState();
  loadLastResult();
  const model = settings.localModel || "base-q5_1";
  const job = ++jobId;
  push({ running: true, percent: 0, segments: [], fileName, error: undefined });
  log.info(`file transcribe started (${(samples.length / SR).toFixed(1)}s, model=${model})`);

  const ranges = splitSegments(samples);
  const segments: TranscribeSegment[] = [];
  try {
    for (let i = 0; i < ranges.length; i++) {
      if (jobId !== job) return transcribeState(); // 已取消
      const [from, to] = ranges[i]!;
      if (segmentPeak(samples, from, to) >= SILENT_PEAK) {
        const raw = await transcribeSlice(settings, model, samples, from, to);
        const text = correctHotwords(raw, settings.hotwords).trim();
        if (jobId !== job) return transcribeState();
        if (text) segments.push({ start: from / SR, end: to / SR, text });
      }
      push({ percent: Math.min(99, Math.round(((i + 1) / ranges.length) * 100)), segments: [...segments] });
    }
    push({ running: false, percent: 100, segments: [...segments] });
    if (segments.length > 0) saveLastResult();
    log.info(`file transcribe done (${segments.length} segments)`);
  } catch (error) {
    if (jobId === job) {
      const message = error instanceof Error ? error.message : String(error);
      push({ running: false, error: message || t("error.localModelMissing") });
      log.warn("file transcribe failed", error);
    }
  }
  return transcribeState();
}
