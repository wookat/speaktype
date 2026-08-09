import { app } from "electron";
import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

interface SherpaStream {
  acceptWaveform(input: { sampleRate: number; samples: Float32Array }): void;
}

interface SherpaRecognizer {
  createStream(): SherpaStream;
  decode(stream: SherpaStream): void;
  getResult(stream: SherpaStream): { text: string };
}

interface SherpaModule {
  OfflineRecognizer: new (config: unknown) => SherpaRecognizer;
}

let sherpa: SherpaRecognizer | null = null;

/** SenseVoice 推理：进程内同步调用，模型实例建一次常驻（首次 ~1.5s，之后每句 ~0.3s） */
export function transcribeSenseVoice(samples: Float32Array, sampleRate: number, language: string): string {
  const files = modelFiles(SENSEVOICE);
  const model = files[0]?.[1] ?? "";
  const tokens = files[1]?.[1] ?? "";
  if (!existsSync(model) || !existsSync(tokens)) throw new Error(t("error.localModelMissing"));
  if (!sherpa) {
    const require = createRequire(import.meta.url);
    const mod = require("sherpa-onnx-node") as SherpaModule;
    sherpa = new mod.OfflineRecognizer({
      modelConfig: {
        senseVoice: { model, language, useInverseTextNormalization: 1 },
        tokens,
        numThreads: 2,
        provider: "cpu",
        debug: 0,
      },
    });
    log.info("sensevoice recognizer created");
  }
  const stream = sherpa.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  sherpa.decode(stream);
  return sherpa.getResult(stream).text.trim();
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
