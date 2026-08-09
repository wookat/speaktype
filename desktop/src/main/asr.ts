import { Converter } from "opencc-js";
import type { Settings } from "../shared/types";
import type { DoubaoSession } from "./doubao";
import { ensureLocalServer } from "./localasr";

// whisper 中文常出繁体；仅本地通道落字前做繁→简（云端通道本就输出简体，不套以免误伤专名）
let t2cn: ((text: string) => string) | null = null;

function toSimplified(text: string): string {
  if (!t2cn) t2cn = Converter({ from: "t", to: "cn" });
  return t2cn(text);
}

const SAMPLE_RATE = 16000;

function transcriptionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return /\/audio\/transcriptions$/.test(base) ? base : `${base}/audio/transcriptions`;
}

/** 16k/mono/PCM16 帧封装成 WAV，供整句转写接口使用 */
function pcmToWav(frames: Int16Array[]): Buffer {
  const dataLen = frames.reduce((sum, f) => sum + f.length * 2, 0);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLen, 40);
  const chunks = frames.map((f) => Buffer.from(f.buffer, f.byteOffset, f.length * 2));
  return Buffer.concat([header, ...chunks]);
}

interface TranscriptionResponse {
  text?: string;
}

/** 设置页“测试连接”：上传一段极短静音验证端点/密钥/模型名 */
export async function testAsr(settings: Settings): Promise<{ ok: boolean; detail: string }> {
  if (!settings.asrBaseUrl || !settings.asrApiKey) return { ok: false, detail: "Base URL / API Key" };
  try {
    const silence = new Int16Array(SAMPLE_RATE / 4);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(pcmToWav([silence]))], { type: "audio/wav" }), "ping.wav");
    form.append("model", settings.asrModel || "whisper-1");
    const res = await fetch(transcriptionsUrl(settings.asrBaseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.asrApiKey}` },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 160);
      return { ok: false, detail: `HTTP ${res.status} ${body}` };
    }
    return { ok: true, detail: settings.asrModel || "whisper-1" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * OpenAI 兼容整句转写（POST /audio/transcriptions）：录音期本地缓存 PCM，
 * 松手后一次性上传识别。没有流式 partial，但任何 Whisper 类服务都能直接接。
 */
export function startOpenAiAsrSession(settings: Settings): DoubaoSession {
  const frames: Int16Array[] = [];
  let cancelled = false;

  return {
    pushPcm(frame: Int16Array): void {
      if (!cancelled) frames.push(frame);
    },
    cancel(): void {
      cancelled = true;
      frames.length = 0;
    },
    async finish(): Promise<string> {
      if (cancelled || frames.length === 0) return "";
      const wav = pcmToWav(frames);
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "speech.wav");
      form.append("model", settings.asrModel || "whisper-1");
      if (settings.language) form.append("language", settings.language);
      const res = await fetch(transcriptionsUrl(settings.asrBaseUrl), {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.asrApiKey}` },
        body: form,
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 160);
        throw new Error(`ASR HTTP ${res.status} ${body}`);
      }
      const data = (await res.json()) as TranscriptionResponse;
      return (data.text ?? "").trim();
    },
  };
}

/**
 * 内置离线 whisper.cpp：同样是整句识别，松手后懒启动本地 whisper-server
 * 并 POST /inference（无需密钥）。
 */
export function startLocalAsrSession(settings: Settings): DoubaoSession {
  const frames: Int16Array[] = [];
  let cancelled = false;

  // 抢跑：录音一开始就把本地 server 拉起来，松手时通常已就绪
  const warming = ensureLocalServer(settings.localModel || "base-q5_1");
  warming.catch(() => undefined);

  return {
    pushPcm(frame: Int16Array): void {
      if (!cancelled) frames.push(frame);
    },
    cancel(): void {
      cancelled = true;
      frames.length = 0;
    },
    async finish(): Promise<string> {
      if (cancelled || frames.length === 0) return "";
      const url = await ensureLocalServer(settings.localModel || "base-q5_1");
      const wav = pcmToWav(frames);
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "speech.wav");
      form.append("response_format", "json");
      if (settings.language) form.append("language", settings.language);
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 160);
        throw new Error(`Local ASR HTTP ${res.status} ${body}`);
      }
      const data = (await res.json()) as TranscriptionResponse;
      const text = (data.text ?? "").trim();
      return settings.localSimplified !== false ? toSimplified(text) : text;
    },
  };
}
