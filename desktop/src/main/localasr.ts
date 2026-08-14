import { app } from "electron";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import log from "electron-log/main.js";
import type { LocalModelStatus } from "../shared/types";
import { downloadFiles, hfSources, partialProgress } from "./download";
import { t } from "./i18n";

/**
 * 内置离线识别，两套引擎：
 * - whisper.cpp：whisper-server 子进程 + ggml 模型，多语种通用。
 * - SenseVoice（sherpa-onnx）：进程内推理，中文准确率和速度明显好于同体积 whisper。
 */

const PORT = 18717;

/** SenseVoice 模型 id；localModel 等于它时走 sherpa-onnx 而不是 whisper-server */
export const SENSEVOICE = "sensevoice-small";

const SENSEVOICE_BASE =
  "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main";

/** Parakeet TDT 0.6B v3（sherpa-onnx int8）：英语及 25 种欧洲语言，自动语种检测，不支持中文 */
export const PARAKEET = "parakeet-tdt-0.6b-v3";

const PARAKEET_BASE =
  "csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main";

/** 走 sherpa-onnx 进程内推理的模型（否则走 whisper-server 子进程） */
export function isSherpaModel(model: string): boolean {
  return model === SENSEVOICE || model === PARAKEET;
}

export const LOCAL_MODELS = [
  { id: SENSEVOICE, size: "234MB" },
  { id: PARAKEET, size: "660MB" },
  { id: "tiny-q5_1", size: "32MB" },
  { id: "base-q5_1", size: "60MB" },
  { id: "small-q5_1", size: "190MB" },
] as const;

function modelsDir(): string {
  return join(app.getPath("userData"), "models");
}

function modelPath(model: string): string {
  return join(modelsDir(), `ggml-${model}.bin`);
}

/** 一个模型需要的全部文件：[HuggingFace 仓内路径, 本地落盘路径] */
function modelFiles(model: string): Array<[string, string]> {
  if (model === SENSEVOICE) {
    const dir = join(modelsDir(), SENSEVOICE);
    return [
      [`${SENSEVOICE_BASE}/model.int8.onnx`, join(dir, "model.int8.onnx")],
      [`${SENSEVOICE_BASE}/tokens.txt`, join(dir, "tokens.txt")],
    ];
  }
  if (model === PARAKEET) {
    const dir = join(modelsDir(), PARAKEET);
    return [
      [`${PARAKEET_BASE}/encoder.int8.onnx`, join(dir, "encoder.int8.onnx")],
      [`${PARAKEET_BASE}/decoder.int8.onnx`, join(dir, "decoder.int8.onnx")],
      [`${PARAKEET_BASE}/joiner.int8.onnx`, join(dir, "joiner.int8.onnx")],
      [`${PARAKEET_BASE}/tokens.txt`, join(dir, "tokens.txt")],
    ];
  }
  return [[`ggerganov/whisper.cpp/resolve/main/ggml-${model}.bin`, modelPath(model)]];
}

function modelReady(model: string): boolean {
  return modelFiles(model).every(([, path]) => existsSync(path));
}

function serverExe(): string {
  // 打包后在 resources/whisper，开发时在仓库 desktop/resources/whisper
  const dir = app.isPackaged
    ? join(process.resourcesPath, "whisper")
    : join(fileURLToPath(new URL(".", import.meta.url)), "../../resources/whisper");
  return join(dir, process.platform === "win32" ? "whisper-server.exe" : "whisper-server");
}

// 输入法全天高频短用：server 首次拉起后常驻到 App 退出，避免反复 ~2s 模型冷启动
let proc: ChildProcess | null = null;
let procModel = "";
let ready: Promise<void> | null = null;

const status: LocalModelStatus = { model: "", downloaded: false, downloading: false, progress: 0 };
let notify: ((s: LocalModelStatus) => void) | null = null;

export function onLocalModelStatus(cb: (s: LocalModelStatus) => void): void {
  notify = cb;
}

export function localModelStatus(model: string): LocalModelStatus {
  if (status.downloading && status.model === model) return { ...status };
  const downloaded = modelReady(model);
  const s: LocalModelStatus = { model, downloaded, downloading: false, progress: 0 };
  if (!downloaded) {
    const partial = modelPartialPercent(model);
    if (partial !== null) s.partial = partial;
  }
  return s;
}

/**
 * 磁盘上已有可续传残片时的模型整体完成百分比；没有残片返回 null。
 * 还没开始下的文件大小未知，按已知部分（已完成文件 + 残片元数据）估算，上限 99。
 */
function modelPartialPercent(model: string): number | null {
  let got = 0;
  let total = 0;
  let hasPart = false;
  for (const [, dest] of modelFiles(model)) {
    if (existsSync(dest)) {
      const size = statSync(dest).size;
      got += size;
      total += size;
      continue;
    }
    const p = partialProgress(dest);
    if (p) {
      got += p.got;
      total += p.total;
      hasPart = true;
    }
  }
  if (!hasPart || total <= 0) return null;
  return Math.min(99, Math.floor((got / total) * 100));
}

function push(patch: Partial<LocalModelStatus>): void {
  Object.assign(status, patch);
  notify?.({ ...status });
}

/** 下载模型所需的全部文件到 userData\models，进度按文件个数均分 */
export async function downloadLocalModel(model: string): Promise<LocalModelStatus> {
  if (status.downloading) return { ...status };
  if (modelReady(model)) return localModelStatus(model);

  push({ model, downloading: true, downloaded: false, progress: 0, partial: undefined, error: undefined });
  const files = modelFiles(model);
  try {
    await downloadFiles(
      files.map(([remote, dest]) => ({ sources: hfSources(remote), dest })),
      (percent) => push({ progress: percent }),
    );
    push({ downloading: false, downloaded: true, progress: 100, partial: undefined });
    log.info(`local model ${model} downloaded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    push({
      downloading: false,
      downloaded: false,
      progress: 0,
      partial: modelPartialPercent(model) ?? undefined,
      error: message,
    });
    log.warn(`local model ${model} download failed`, error);
  }
  return { ...status };
}

/**
 * sherpa-onnx 离线推理跑在 worker 线程里：解码是同步的，长句要几百毫秒到
 * 一秒多，留在主进程会卡住整个 UI（实时字幕反复重解时尤其明显）。worker 里模型实例
 * 常驻，语言变化时重建。SenseVoice 走 senseVoice 配置，Parakeet 走 NeMo transducer。
 */
const workerSource = `
const { parentPort, workerData } = require("worker_threads");
const mod = require(workerData.modulePath);
let rec = null;
let lang = null;
parentPort.on("message", (msg) => {
  try {
    if (!rec || lang !== msg.language) {
      const modelConfig = workerData.engine === "transducer"
        ? {
            transducer: { encoder: workerData.encoder, decoder: workerData.decoder, joiner: workerData.joiner },
            modelType: "nemo_transducer",
            tokens: workerData.tokens,
            numThreads: 2,
            provider: "cpu",
            debug: 0,
          }
        : {
            senseVoice: { model: workerData.model, language: msg.language, useInverseTextNormalization: 1 },
            tokens: workerData.tokens,
            numThreads: 2,
            provider: "cpu",
            debug: 0,
          };
      rec = new mod.OfflineRecognizer({ modelConfig });
      lang = msg.language;
    }
    const stream = rec.createStream();
    stream.acceptWaveform({ sampleRate: msg.sampleRate, samples: msg.samples });
    rec.decode(stream);
    parentPort.postMessage({ id: msg.id, text: rec.getResult(stream).text.trim() });
  } catch (error) {
    parentPort.postMessage({ id: msg.id, error: error instanceof Error ? error.message : String(error) });
  }
});
`;

let worker: Worker | null = null;
let workerKey = "";
let nextJobId = 1;
// 模型常驻内存可观（数百 MB）：空闲一段时间后自动释放，下次使用重建
const WORKER_IDLE_MS = 10 * 60 * 1000;
let idleTimer: NodeJS.Timeout | null = null;

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (worker && pending.size === 0) {
      void worker.terminate();
      worker = null;
      log.info("sherpa worker stopped (idle)");
    }
  }, WORKER_IDLE_MS);
  idleTimer.unref();
}
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function ensureWorker(modelId: string): Worker {
  const files = modelFiles(modelId);
  const paths = files.map(([, p]) => p);
  const tokens = paths[paths.length - 1]!;
  const key = paths.join("|");
  if (worker && workerKey !== key) {
    // 模型文件换了：旧 worker 里的模型实例已过时，停掉重建
    for (const job of pending.values()) job.reject(new Error("local model changed"));
    pending.clear();
    void worker.terminate();
    worker = null;
  }
  if (worker) {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    return worker;
  }
  workerKey = key;
  const require = createRequire(import.meta.url);
  const workerData =
    modelId === PARAKEET
      ? {
          modulePath: require.resolve("sherpa-onnx-node"),
          engine: "transducer",
          encoder: paths[0],
          decoder: paths[1],
          joiner: paths[2],
          tokens,
        }
      : { modulePath: require.resolve("sherpa-onnx-node"), engine: "sensevoice", model: paths[0], tokens };
  worker = new Worker(workerSource, { eval: true, workerData });
  worker.on("message", (msg: { id: number; text?: string; error?: string }) => {
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.error) job.reject(new Error(msg.error));
    else job.resolve(msg.text ?? "");
    if (pending.size === 0) scheduleIdleShutdown();
  });
  worker.on("error", (error) => {
    log.warn("sherpa worker error", error);
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    worker = null;
  });
  worker.on("exit", () => {
    worker = null;
  });
  log.info(`sherpa worker started (${modelId})`);
  return worker;
}

/** 启动后空闲时预热 worker：用一小段静音触发模型加载，把 ONNX 冷启动成本移出用户第一句 */
export function prewarmSherpa(model: string, language: string): void {
  if (worker || !isSherpaModel(model) || !modelReady(model)) return;
  const silence = new Float32Array(3200); // 0.2s @ 16kHz
  transcribeSherpa(model, silence, 16000, language).catch((error) => {
    log.warn("sherpa prewarm failed", error);
  });
}

export async function transcribeSherpa(
  modelId: string,
  samples: Float32Array,
  sampleRate: number,
  language: string,
): Promise<string> {
  if (!modelReady(modelId)) throw new Error(t("error.localModelMissing"));
  const w = ensureWorker(modelId);
  const id = nextJobId++;
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, samples, sampleRate, language });
  });
}

export function stopLocalServer(): void {
  if (proc) {
    proc.kill();
    proc = null;
    ready = null;
    log.info("local whisper-server stopped");
  }
}

async function waitHealthy(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (!proc) throw new Error(t("error.localServerFailed"));
    try {
      await fetch(`http://127.0.0.1:${PORT}/`, { method: "GET" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("whisper-server did not become ready");
}

/** 懒启动 whisper-server（换模型自动重启），返回 /inference 端点 */
export async function ensureLocalServer(model: string): Promise<string> {
  if (!modelReady(model)) throw new Error(t("error.localModelMissing"));
  if (proc && procModel !== model) stopLocalServer();

  if (!proc || !ready) {
    const exe = serverExe();
    if (!existsSync(exe)) throw new Error(`whisper-server.exe not found: ${exe}`);
    const child = spawn(
      exe,
      ["--model", modelPath(model), "--host", "127.0.0.1", "--port", String(PORT), "--language", "auto", "--prompt", "以下是普通话的句子。"],
      { stdio: "ignore", windowsHide: true },
    );
    proc = child;
    procModel = model;
    child.on("exit", (code) => {
      log.warn(`local whisper-server exited (${code})`);
      if (proc === child) {
        proc = null;
        ready = null;
      }
    });
    log.info(`local whisper-server starting (model=${model}, port=${PORT})`);
    ready = waitHealthy();
  }

  const readyP = ready;
  await readyP;
  return `http://127.0.0.1:${PORT}/inference`;
}
