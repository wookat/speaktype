import { app } from "electron";
import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import log from "electron-log/main.js";
import type { LocalModelStatus } from "../shared/types";
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

export const LOCAL_MODELS = [
  { id: SENSEVOICE, size: "234MB" },
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
  return { model, downloaded: modelReady(model), downloading: false, progress: 0 };
}

function push(patch: Partial<LocalModelStatus>): void {
  Object.assign(status, patch);
  notify?.({ ...status });
}

/** 下载单个文件（先落 .part 再改名），直连 HuggingFace 失败时落到镜像源 */
async function fetchFile(path: string, dest: string, onProgress: (bytes: number, total: number) => void): Promise<void> {
  const hosts = ["https://huggingface.co", "https://hf-mirror.com"];
  let res: Response | null = null;
  let lastError: unknown = null;
  for (const host of hosts) {
    try {
      const r = await fetch(`${host}/${path}`);
      if (r.ok && r.body) {
        res = r;
        break;
      }
      lastError = new Error(`HTTP ${r.status} (${host})`);
    } catch (error) {
      lastError = error;
    }
  }
  if (!res || !res.body) throw lastError instanceof Error ? lastError : new Error(String(lastError));

  const part = `${dest}.part`;
  const total = Number(res.headers.get("content-length")) || 0;
  let got = 0;
  const out = createWriteStream(part);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const buf = Buffer.from(value);
    got += buf.length;
    if (!out.write(buf)) await new Promise<void>((r) => out.once("drain", () => r()));
    onProgress(got, total);
  }
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  renameSync(part, dest);
}

/** 下载模型所需的全部文件到 userData\models，进度按文件个数均分 */
export async function downloadLocalModel(model: string): Promise<LocalModelStatus> {
  if (status.downloading) return { ...status };
  if (modelReady(model)) return localModelStatus(model);

  push({ model, downloading: true, downloaded: false, progress: 0, error: undefined });
  const files = modelFiles(model);
  try {
    for (const [index, [remote, dest]] of files.entries()) {
      mkdirSync(join(dest, ".."), { recursive: true });
      if (existsSync(dest)) continue;
      await fetchFile(remote, dest, (got, total) => {
        if (!total) return;
        push({ progress: Math.floor(((index + got / total) / files.length) * 100) });
      });
    }
    push({ downloading: false, downloaded: true, progress: 100 });
    log.info(`local model ${model} downloaded`);
  } catch (error) {
    for (const [, dest] of files) rmSync(`${dest}.part`, { force: true });
    const message = error instanceof Error ? error.message : String(error);
    push({ downloading: false, downloaded: false, progress: 0, error: message });
    log.warn(`local model ${model} download failed`, error);
  }
  return { ...status };
}

/**
 * SenseVoice 推理跑在 worker 线程里：sherpa-onnx 的解码是同步的，长句要几百毫秒到
 * 一秒多，留在主进程会卡住整个 UI（实时字幕反复重解时尤其明显）。worker 里模型实例
 * 常驻，语言变化时重建。
 */
const workerSource = `
const { parentPort, workerData } = require("worker_threads");
const mod = require(workerData.modulePath);
let rec = null;
let lang = null;
parentPort.on("message", (msg) => {
  try {
    if (!rec || lang !== msg.language) {
      rec = new mod.OfflineRecognizer({
        modelConfig: {
          senseVoice: { model: workerData.model, language: msg.language, useInverseTextNormalization: 1 },
          tokens: workerData.tokens,
          numThreads: 2,
          provider: "cpu",
          debug: 0,
        },
      });
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
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function ensureWorker(model: string, tokens: string): Worker {
  const key = `${model}|${tokens}`;
  if (worker && workerKey !== key) {
    // 模型文件换了：旧 worker 里的模型实例已过时，停掉重建
    for (const job of pending.values()) job.reject(new Error("local model changed"));
    pending.clear();
    void worker.terminate();
    worker = null;
  }
  if (worker) return worker;
  workerKey = key;
  const require = createRequire(import.meta.url);
  worker = new Worker(workerSource, {
    eval: true,
    workerData: { modulePath: require.resolve("sherpa-onnx-node"), model, tokens },
  });
  worker.on("message", (msg: { id: number; text?: string; error?: string }) => {
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.error) job.reject(new Error(msg.error));
    else job.resolve(msg.text ?? "");
  });
  worker.on("error", (error) => {
    log.warn("sensevoice worker error", error);
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    worker = null;
  });
  worker.on("exit", () => {
    worker = null;
  });
  log.info("sensevoice worker started");
  return worker;
}

/** 启动后空闲时预热 worker：用一小段静音触发模型加载，把 ONNX 冷启动成本移出用户第一句 */
export function prewarmSenseVoice(language: string): void {
  if (worker || !modelReady(SENSEVOICE)) return;
  const silence = new Float32Array(3200); // 0.2s @ 16kHz
  transcribeSenseVoice(silence, 16000, language).catch((error) => {
    log.warn("sensevoice prewarm failed", error);
  });
}

export async function transcribeSenseVoice(
  samples: Float32Array,
  sampleRate: number,
  language: string,
): Promise<string> {
  const files = modelFiles(SENSEVOICE);
  const model = files[0]?.[1] ?? "";
  const tokens = files[1]?.[1] ?? "";
  if (!existsSync(model) || !existsSync(tokens)) throw new Error(t("error.localModelMissing"));
  const w = ensureWorker(model, tokens);
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
