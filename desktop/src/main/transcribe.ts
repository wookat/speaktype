import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";
import type { Settings, TranscribeSegment, TranscribeState } from "../shared/types";
import { finalizeWhisperText, pcmToWav } from "./asr";
import { correctHotwords } from "./hotwords";
import { t } from "./i18n";
import { ensureLocalServer, isSherpaModel, transcribeSherpa } from "./localasr";
import { addHistory } from "./store";

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
/** 句间停顿切片：静音谷 ≥ PAUSE_S 按谷心切开，子段至少 MIN_SUB_S；
 * 模型对段尾才稳定出句号，整段解码会把句界降级成逗号或丢失 */
const PAUSE_S = 0.5;
const MIN_SUB_S = 1.5;
/** 超长子段降级补切：主阈值切完仍 >SECONDARY_SEG_S 的段，用次级阈值再切一遍，
 * 避免频繁落入 capLongSegment 的盲切导致段尾句读质量下降 */
const SECONDARY_SEG_S = 20;
const PAUSE_2_S = 0.3;
/** 静音谷判定：帧 RMS 低于全文峰值 RMS 的 2% */
const QUIET_RATIO = 0.02;
/** 段内峰值低于该值视为纯静音段，跳过识别避免幻听 */
const SILENT_PEAK = 0.008;

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
      finishedAt?: number;
    };
    if (!state.running && Array.isArray(saved.segments) && saved.segments.length > 0) {
      Object.assign(state, {
        percent: 100,
        segments: saved.segments,
        fileName: saved.fileName,
        finishedAt: saved.finishedAt,
      });
    }
  } catch (error) {
    log.warn("transcribe last result load failed", error);
  }
}

function saveLastResult(): void {
  try {
    writeFileSync(
      lastResultFile(),
      JSON.stringify({ segments: state.segments, fileName: state.fileName, finishedAt: state.finishedAt }),
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
  log.info(`file transcribe cancelled at ${state.percent}% (${state.segments.length} segments)`);
  push({ running: false, cancelled: true });
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

/** 句间停顿切片：在 [from, to) 内找 ≥ pauseS 的静音谷，按谷心切开，两侧子段不短于 MIN_SUB_S */
function splitByPauses(
  rms: Float32Array,
  quiet: number,
  pauseS: number,
  from: number,
  to: number,
): Array<[number, number]> {
  const minFrames = Math.round((pauseS * SR) / HOP);
  const fromFrame = Math.ceil(from / HOP);
  const toFrame = Math.ceil(to / HOP);
  const out: Array<[number, number]> = [];
  let start = from;
  let runStart = -1;
  for (let f = fromFrame; f <= toFrame; f++) {
    if (f < toFrame && f < rms.length && rms[f]! < quiet) {
      if (runStart < 0) runStart = f;
      continue;
    }
    if (runStart >= 0 && f - runStart >= minFrames) {
      const cut = Math.round(((runStart + f) / 2) * HOP);
      if (cut - start >= MIN_SUB_S * SR && to - cut >= MIN_SUB_S * SR) {
        out.push([start, cut]);
        start = cut;
      }
    }
    runStart = -1;
  }
  out.push([start, to]);
  return out;
}

/** 单段封顶：每段 ≤ MAX_SEG_S，切点选 [MIN_CUT_S, MAX_SEG_S] 内最静的 100ms */
function capLongSegment(from: number, to: number, rms: Float32Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = from;
  while (start < to) {
    if (to - start <= MAX_SEG_S * SR) {
      out.push([start, to]);
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
    const cut = Math.min(to, (best + 1) * HOP);
    out.push([start, cut]);
    start = cut;
  }
  return out;
}

/** 先按句间停顿切片（超长子段用次级阈值补切），再对仍超长的子段封顶 */
function splitSegments(samples: Float32Array): Array<[number, number]> {
  const rms = rmsProfile(samples);
  let peak = 0;
  for (const v of rms) if (v > peak) peak = v;
  const quiet = peak * QUIET_RATIO;
  const out: Array<[number, number]> = [];
  for (const [from, to] of splitByPauses(rms, quiet, PAUSE_S, 0, samples.length)) {
    const subs =
      to - from > SECONDARY_SEG_S * SR ? splitByPauses(rms, quiet, PAUSE_2_S, from, to) : [[from, to] as [number, number]];
    for (const [f, t2] of subs) out.push(...capLongSegment(f, t2, rms));
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

const KANA_RE = /[\u3041-\u30ff]/;

/** 子段尾落在句间停顿上：汉字结尾且无终止标点时补句号（含假名的日文不动） */
function endCjkSentence(text: string): string {
  return /[\u4e00-\u9fff]$/.test(text) && !KANA_RE.test(text) ? text + "\u3002" : text;
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
  if (settings.language && settings.language !== "auto") form.append("language", settings.language);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Local ASR HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { text?: string };
  return finalizeWhisperText((data.text ?? "").trim(), settings);
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
  push({
    running: true,
    percent: 0,
    segments: [],
    fileName,
    finishedAt: undefined,
    cancelled: undefined,
    error: undefined,
  });
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
        if (text) segments.push({ start: from / SR, end: to / SR, text: endCjkSentence(text) });
      }
      push({ percent: Math.min(99, Math.round(((i + 1) / ranges.length) * 100)), segments: [...segments] });
    }
    push({ running: false, percent: 100, segments: [...segments], finishedAt: Date.now() });
    if (segments.length > 0) {
      saveLastResult();
      // 全文进历史：复用历史页的搜索/导出/淡汰，旧转录被新任务覆盖后仍可找回
      const full = segments.map((s) => s.text).join("\n");
      addHistory({
        id: randomUUID(),
        at: Date.now(),
        text: full,
        raw: full,
        personaName: fileName || t("transcribe.title"),
        durationMs: Math.round((samples.length / SR) * 1000),
        source: "file",
      });
    }
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
