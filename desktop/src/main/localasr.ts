import { app } from "electron";
import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import log from "electron-log/main.js";
import type { LocalModelStatus } from "../shared/types";
import { t } from "./i18n";

/** 内置离线识别：管理 whisper.cpp whisper-server 子进程与 ggml 模型下载 */

const PORT = 18717;

export const LOCAL_MODELS = [
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

function serverExe(): string {
  // 打包后在 resources/whisper，开发时在仓库 desktop/resources/whisper
  const dir = app.isPackaged
    ? join(process.resourcesPath, "whisper")
    : join(fileURLToPath(new URL(".", import.meta.url)), "../../resources/whisper");
  return join(dir, "whisper-server.exe");
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
  return { model, downloaded: existsSync(modelPath(model)), downloading: false, progress: 0 };
}

function push(patch: Partial<LocalModelStatus>): void {
  Object.assign(status, patch);
  notify?.({ ...status });
}

/** 从 Hugging Face 下载 ggml 模型到 userData\models（先落 .part 再改名） */
export async function downloadLocalModel(model: string): Promise<LocalModelStatus> {
  if (status.downloading) return { ...status };
  if (existsSync(modelPath(model))) return localModelStatus(model);

  push({ model, downloading: true, downloaded: false, progress: 0, error: undefined });
  const part = `${modelPath(model)}.part`;
  try {
    mkdirSync(modelsDir(), { recursive: true });
    // 多源顺序重试：直连 HuggingFace 失败时落到镜像源
    const hosts = ["https://huggingface.co", "https://hf-mirror.com"];
    let res: Response | null = null;
    let lastError: unknown = null;
    for (const host of hosts) {
      try {
        const r = await fetch(`${host}/ggerganov/whisper.cpp/resolve/main/ggml-${model}.bin`);
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
      if (total) push({ progress: Math.floor((got / total) * 100) });
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    renameSync(part, modelPath(model));
    push({ downloading: false, downloaded: true, progress: 100 });
    log.info(`local model ${model} downloaded (${got} bytes)`);
  } catch (error) {
    rmSync(part, { force: true });
    const message = error instanceof Error ? error.message : String(error);
    push({ downloading: false, downloaded: false, progress: 0, error: message });
    log.warn(`local model ${model} download failed`, error);
  }
  return { ...status };
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
  if (!existsSync(modelPath(model))) throw new Error(t("error.localModelMissing"));
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
