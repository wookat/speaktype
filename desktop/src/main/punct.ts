import { app } from "electron";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import log from "electron-log/main.js";
import type { VadStatus } from "../shared/types";
import { fetchFile } from "./localasr";

/**
 * 增强标点（ct-transformer 中英标点模型，sherpa-onnx OfflinePunctuation）。
 * 模型约 281MB，不进安装包，首次启用时按需下载到 userData\models\punct-ct；
 * 未下载或加载失败时上层回退到规则断句（polish.ts addLocalPunctuation）。
 */

const MODEL_REMOTE =
  "csukuangfj/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12/resolve/main/model.onnx";

function punctDir(): string {
  return join(app.getPath("userData"), "models", "punct-ct");
}

function modelPath(): string {
  return join(punctDir(), "model.onnx");
}

export function punctDownloaded(): boolean {
  return existsSync(modelPath());
}

const status: VadStatus = { supported: true, downloaded: false, downloading: false, progress: 0 };
let notify: ((s: VadStatus) => void) | null = null;

export function onPunctStatus(cb: (s: VadStatus) => void): void {
  notify = cb;
}

export function punctStatus(): VadStatus {
  if (status.downloading) return { ...status };
  return { supported: true, downloaded: punctDownloaded(), downloading: false, progress: 0 };
}

function push(patch: Partial<VadStatus>): void {
  Object.assign(status, patch);
  notify?.({ ...status });
}

/** 按需下载标点模型（约 281MB） */
export async function downloadPunct(): Promise<VadStatus> {
  if (status.downloading) return { ...status };
  if (punctDownloaded()) return punctStatus();

  push({ downloading: true, downloaded: false, progress: 0, error: undefined });
  try {
    mkdirSync(punctDir(), { recursive: true });
    await fetchFile(MODEL_REMOTE, modelPath(), (got, total) => {
      if (total) push({ progress: Math.floor((got / total) * 100) });
    });
    workerFailed = false;
    push({ downloading: false, downloaded: true, progress: 100 });
    log.info("punct model downloaded");
  } catch (error) {
    rmSync(`${modelPath()}.part`, { force: true });
    const message = error instanceof Error ? error.message : String(error);
    push({ downloading: false, downloaded: false, progress: 0, error: message });
    log.warn("punct model download failed", error);
  }
  return { ...status };
}

/**
 * 推理跑在 worker 线程里（与 SenseVoice 同一模式）：单句只要几毫秒，但模型常驻
 * 内存可观（~360MB RSS），空闲一段时间后自动释放，下次使用重建。
 */
const workerSource = `
const { parentPort, workerData } = require("worker_threads");
const mod = require(workerData.modulePath);
const punct = new mod.OfflinePunctuation({
  model: { ctTransformer: workerData.model, numThreads: 2, provider: "cpu", debug: 0 },
});
parentPort.on("message", (msg) => {
  try {
    parentPort.postMessage({ id: msg.id, text: punct.addPunct(msg.text) });
  } catch (error) {
    parentPort.postMessage({ id: msg.id, error: error instanceof Error ? error.message : String(error) });
  }
});
`;

let worker: Worker | null = null;
let workerFailed = false; // 加载失败只报一次；重新下载成功后重置
let nextJobId = 1;
const WORKER_IDLE_MS = 10 * 60 * 1000;
let idleTimer: NodeJS.Timeout | null = null;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (worker && pending.size === 0) {
      void worker.terminate();
      worker = null;
      log.info("punct worker stopped (idle)");
    }
  }, WORKER_IDLE_MS);
  idleTimer.unref();
}

function ensureWorker(): Worker {
  if (worker) {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    return worker;
  }
  const require = createRequire(import.meta.url);
  const w = new Worker(workerSource, {
    eval: true,
    workerData: { modulePath: require.resolve("sherpa-onnx-node"), model: modelPath() },
  });
  worker = w;
  w.on("message", (msg: { id: number; text?: string; error?: string }) => {
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.error) job.reject(new Error(msg.error));
    else job.resolve(msg.text ?? "");
    if (pending.size === 0) scheduleIdleShutdown();
  });
  w.on("error", (error) => {
    log.warn("punct worker error", error);
    workerFailed = true; // 模型加载/推理崩溃只报一次，之后回退规则断句
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    if (worker === w) worker = null;
  });
  w.on("exit", () => {
    if (worker === w) worker = null;
  });
  log.info("punct worker started");
  return w;
}

/** 模型标点：不可用（未下载/曾失败）返回 null，由调用方回退规则断句 */
export async function punctuate(text: string): Promise<string | null> {
  if (workerFailed || !punctDownloaded()) return null;
  try {
    const w = ensureWorker();
    const id = nextJobId++;
    return await new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, text });
    });
  } catch (error) {
    log.warn("punctuate failed, falling back to rules", error);
    return null;
  }
}
