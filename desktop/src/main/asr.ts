import { Converter } from "opencc-js/t2cn";
import type { Settings } from "../shared/types";
import type { DoubaoSession } from "./doubao";
import { t } from "./i18n";
import { transcribeViaChatgpt } from "./chatgpt";
import { SENSEVOICE, ensureLocalServer, transcribeSenseVoice } from "./localasr";

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
export function pcmToWav(frames: Int16Array[]): Buffer {
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
  if (!/^https?:\/\//.test(settings.asrBaseUrl)) return { ok: false, detail: t("error.badUrl") };
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
 * 抢跑建联：按下热键瞬间对转写服务发一次极小请求，把 DNS/TCP/TLS 握手提前做完，
 * undici 连接池会复用这条连接，松手后的正式上传省掉冷启动往返。
 */
export function preconnectAsr(settings: Settings): void {
  if (!/^https?:\/\//.test(settings.asrBaseUrl)) return;
  try {
    const origin = new URL(settings.asrBaseUrl).origin;
    void fetch(origin, { method: "HEAD" }).catch(() => undefined);
  } catch {
    /* URL 非法时静默跳过，正式请求会给出可读报错 */
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
 * ChatGPT 网页转写：复用本机已有的 ChatGPT 登录态调用它自带的语音输入接口，
 * 免密钥、免额度配置；整句识别，无流式 partial。
 */
export function startChatgptAsrSession(settings: Settings): DoubaoSession {
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
      return transcribeViaChatgpt(pcmToWav(frames), settings.language ?? "");
    },
  };
}

/** PCM16 帧拼成 sherpa-onnx 要的 [-1,1] 浮点采样 */
function pcmToFloat32(frames: Int16Array[]): Float32Array {
  const total = frames.reduce((sum, f) => sum + f.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i++) out[offset + i] = (frame[i] ?? 0) / 32768;
    offset += frame.length;
  }
  return out;
}

/**
 * 内置离线识别：SenseVoice 走进程内 sherpa-onnx，whisper 模型懒启动本地
 * whisper-server 并 POST /inference。两者都不联网、不需密钥，整句识别。
 */
export function startLocalAsrSession(settings: Settings): DoubaoSession {
  const frames: Int16Array[] = [];
  let cancelled = false;
  const model = settings.localModel || "base-q5_1";

  // 抢跑：录音一开始就把本地 server 拉起来，松手时通常已就绪
  if (model !== SENSEVOICE) ensureLocalServer(model).catch(() => undefined);

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
      if (model === SENSEVOICE) {
        // SenseVoice 本就输出简体，不再过繁→简以免误伤专名
        return transcribeSenseVoice(pcmToFloat32(frames), SAMPLE_RATE, settings.language || "auto");
      }
      const url = await ensureLocalServer(model);
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
