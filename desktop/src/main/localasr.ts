import { app } from "electron";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import log from "electron-log/main.js";
import { PARAKEET, SENSEVOICE } from "../shared/localModels";
import type { LocalModelStatus } from "../shared/types";
import { downloadFiles, hfSources, partialProgress } from "./download";
import { t } from "./i18n";

/**
 * 内置离线识别，两套引擎：
 * - whisper.cpp：whisper-server 子进程 + ggml 模型，多语种通用。
 * - SenseVoice（sherpa-onnx）：进程内推理，中文准确率和速度明显好于同体积 whisper。
 */

const PORT = 18717;

export { LOCAL_MODELS, PARAKEET, SENSEVOICE } from "../shared/localModels";

const SENSEVOICE_BASE =
  "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main";

const PARAKEET_BASE =
  "csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main";

/** 走 sherpa-onnx 进程内推理的模型（否则走 whisper-server 子进程） */
export function isSherpaModel(model: string): boolean {
  return model === SENSEVOICE || model === PARAKEET;
}

function modelsDir(): string {
  return join(app.getPath("userData"), "models");
}

function modelPath(model: string): string {
  return join(modelsDir(), `ggml-${model}.bin`);
}

/** 一个模型需要的全部文件：[HuggingFace 仓内路径, 本地落盘路径, 文件字节数（多文件模型用于进度字节加权）] */
function modelFiles(model: string): Array<[string, string, number?]> {
  if (model === SENSEVOICE) {
    const dir = join(modelsDir(), SENSEVOICE);
    return [
      [`${SENSEVOICE_BASE}/model.int8.onnx`, join(dir, "model.int8.onnx"), 239_233_841],
      [`${SENSEVOICE_BASE}/tokens.txt`, join(dir, "tokens.txt"), 315_894],
    ];
  }
  if (model === PARAKEET) {
    const dir = join(modelsDir(), PARAKEET);
    return [
      [`${PARAKEET_BASE}/encoder.int8.onnx`, join(dir, "encoder.int8.onnx"), 652_184_281],
      [`${PARAKEET_BASE}/decoder.int8.onnx`, join(dir, "decoder.int8.onnx"), 11_845_275],
      [`${PARAKEET_BASE}/joiner.int8.onnx`, join(dir, "joiner.int8.onnx"), 6_355_277],
      [`${PARAKEET_BASE}/tokens.txt`, join(dir, "tokens.txt"), 93_939],
    ];
  }
  return [[`ggerganov/whisper.cpp/resolve/main/ggml-${model}.bin`, modelPath(model)]];
}

function modelReady(model: string): boolean {
  // 已知字节数的文件（sherpa 系）同时校验大小：损坏/截断的 onnx 会让原生层
  // 直接 abort 整个进程，这里判未就绪走重新下载引导
  return modelFiles(model).every(([, path, size]) => {
    if (!existsSync(path)) return false;
    return size === undefined || statSync(path).size === size;
  });
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
// 最近一次下载失败的原因，按模型记；切页后重新读状态时错误仍可见
const lastError = new Map<string, string>();
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
    const err = lastError.get(model);
    if (err) s.error = err;
  }
  return s;
}

/**
 * 磁盘上已有部分进度（可续传残片，或多文件模型里部分文件已完好）时的模型整体完成
 * 百分比；完全没有进度返回 null。还没开始下且大小未知的文件不计入，上限 99。
 */
function modelPartialPercent(model: string): number | null {
  let got = 0;
  let total = 0;
  let hasProgress = false;
  for (const [, dest, expected] of modelFiles(model)) {
    if (existsSync(dest)) {
      const size = statSync(dest).size;
      if (expected === undefined || size === expected) {
        got += size;
        total += size;
        continue;
      }
      // 大小与预期不符（损坏/截断）：按该文件未下载计，其余完好文件仍计入进度
      total += expected;
      hasProgress = true;
      continue;
    }
    const p = partialProgress(dest);
    if (p) {
      got += p.got;
      total += p.total;
      hasProgress = true;
    } else if (expected !== undefined) {
      total += expected;
    }
  }
  // 有完好文件在盘（got > 0）时，缺失/损坏其余文件也算部分进度；全新用户 got = 0 仍走全量文案
  if ((!hasProgress && got <= 0) || total <= 0) return null;
  const percent = Math.min(99, Math.floor((got / total) * 100));
  // 不足 1% 的「进度」（如只有 tokens.txt 这类小文件在盘）对用户等于从头下：走全量文案，避免「继续下载 0%」自相矛盾
  return percent < 1 ? null : percent;
}

function push(patch: Partial<LocalModelStatus>): void {
  Object.assign(status, patch);
  notify?.({ ...status });
}

/** 下载模型所需的全部文件到 userData\models，进度按文件字节加权 */
export async function downloadLocalModel(model: string): Promise<LocalModelStatus> {
  if (status.downloading) return { ...status };
  if (modelReady(model)) return localModelStatus(model);

  lastError.delete(model);
  push({ model, downloading: true, downloaded: false, progress: 0, partial: undefined, error: undefined });
  const files = modelFiles(model);
  try {
    await downloadFiles(
      files.map(([remote, dest, size]) => ({ sources: hfSources(remote), dest, size })),
      (percent) => push({ progress: percent }),
    );
    push({ downloading: false, downloaded: true, progress: 100, partial: undefined });
    log.info(`local model ${model} downloaded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastError.set(model, message);
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

/** 删除模型的全部落盘文件（含可续传残片）；调用方需先停掉占用模型的 worker/server */
export function deleteLocalModel(model: string): LocalModelStatus {
  if (status.downloading && status.model === model) return { ...status };
  for (const [, dest] of modelFiles(model)) {
    rmSync(dest, { force: true });
    rmSync(`${dest}.part`, { force: true });
    rmSync(`${dest}.part.json`, { force: true });
  }
  if (isSherpaModel(model)) rmSync(join(modelsDir(), model), { recursive: true, force: true });
  lastError.delete(model);
  log.info(`local model ${model} deleted`);
  return localModelStatus(model);
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
  // OfflineStream 的 native 内存靠 GC finalizer 释放，worker JS 堆极小几乎不触发 GC，
  // 会导致 native 内存随解码次数线性挂账，这里每次解码后显式回收。
  if (global.gc) global.gc();
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

// 汉字/假名之间不使用空格（韩语空格属正字法，不处理）；SenseVoice 日文输出会夹杂空格，落字前收敛
const CJK_NO_SPACE = "\\u3005\\u3041-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const CJK_SPACE_RE = new RegExp(`([${CJK_NO_SPACE}])[ \\t]+(?=[${CJK_NO_SPACE}])`, "g");

function collapseCjkSpaces(text: string): string {
  return text.replace(CJK_SPACE_RE, "$1");
}

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
  worker = new Worker(workerSource, { eval: true, workerData, execArgv: ["--expose-gc"] });
  worker.on("message", (msg: { id: number; text?: string; error?: string }) => {
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.error) job.reject(new Error(msg.error));
    else job.resolve(collapseCjkSpaces(msg.text ?? ""));
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

/** 切换本地模型后旧 worker 不会再被用到：立即释放（数百 MB～GB 级），不等空闲计时 */
export function releaseSherpaWorker(): void {
  if (!worker || pending.size > 0) return;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  void worker.terminate();
  worker = null;
  log.info("sherpa worker stopped (model switched)");
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
      if (proc === child) {
        log.warn(`local whisper-server exited (${code})`);
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
