import type { Settings } from "../shared/types";
import type { DoubaoSession } from "./doubao";

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
