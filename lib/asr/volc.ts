import type { AsrProvider, AsrSession } from "./types";

/**
 * 火山引擎「豆包语音识别大模型」双向流式接口（wss://openspeech.bytedance.com/api/v3/sauc/bigmodel）。
 * 与 doubao.com 网页版同一识别引擎（bigasr），但走官方鉴权与计费。
 *
 * 浏览器 WebSocket 无法自定义请求头，而该接口的鉴权在 header 上，
 * 因此必须经过我们自己的中转（见 worker/），由中转补 X-Api-* 头并双向转发二进制帧。
 * 二进制协议本身在这里实现，中转只做透传，不解析音频。
 */

const PROTOCOL_VERSION = 0b0001;
const HEADER_SIZE = 0b0001; // 1 * 4 bytes

const MSG_FULL_CLIENT = 0b0001;
const MSG_AUDIO_ONLY = 0b0010;
const MSG_FULL_SERVER = 0b1001;
const MSG_ERROR = 0b1111;

const FLAG_POSITIVE_SEQ = 0b0001;
const FLAG_NEGATIVE_SEQ = 0b0011; // 最后一包

const SER_JSON = 0b0001;
const SER_RAW = 0b0000;
const COMPRESS_NONE = 0b0000;

function buildFrame(
  msgType: number,
  flags: number,
  serialization: number,
  sequence: number,
  payload: Uint8Array,
): Uint8Array {
  const withSeq = flags === FLAG_POSITIVE_SEQ || flags === FLAG_NEGATIVE_SEQ;
  const head = 4 + (withSeq ? 4 : 0) + 4;
  const out = new Uint8Array(head + payload.length);
  const view = new DataView(out.buffer);
  out[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE;
  out[1] = (msgType << 4) | flags;
  out[2] = (serialization << 4) | COMPRESS_NONE;
  out[3] = 0;
  let offset = 4;
  if (withSeq) {
    view.setInt32(offset, sequence, false);
    offset += 4;
  }
  view.setUint32(offset, payload.length, false);
  offset += 4;
  out.set(payload, offset);
  return out;
}

interface VolcUtterance {
  text?: string;
  definite?: boolean;
}

interface VolcResponse {
  result?: { text?: string; utterances?: VolcUtterance[] };
}

interface ParsedFrame {
  msgType: number;
  code?: number;
  payload: string;
}

function parseFrame(buffer: ArrayBuffer): ParsedFrame {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const headerSize = (bytes[0]! & 0x0f) * 4;
  const msgType = bytes[1]! >> 4;
  const flags = bytes[1]! & 0x0f;
  let offset = headerSize;
  if (flags & 0x01) offset += 4; // sequence
  let code: number | undefined;
  if (msgType === MSG_ERROR) {
    code = view.getUint32(offset, false);
    offset += 4;
  }
  const size = view.getUint32(offset, false);
  offset += 4;
  const payload = new TextDecoder().decode(bytes.subarray(offset, offset + size));
  return { msgType, code, payload };
}

function buildRequest(language: string): Uint8Array {
  const body = {
    user: { uid: "speaktype" },
    audio: { format: "pcm", codec: "raw", rate: 16000, bits: 16, channel: 1 },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
      // 二遍识别：流式出逐字中间结果 + 分句后用非流式模型重识别，兼顾快与准
      enable_nonstream: true,
      end_window_size: 800,
      show_utterances: true,
      result_type: "single",
      language,
    },
  };
  return new TextEncoder().encode(JSON.stringify(body));
}

function proxyEndpoint(proxyUrl: string, appKey: string, accessKey: string, language: string): string {
  const base = proxyUrl.replace(/\/$/, "");
  const url = new URL(`${base}/asr/volc`);
  url.searchParams.set("lang", language);
  // 自带凭证模式：不填则使用中转自身配置的服务端凭证
  if (appKey) url.searchParams.set("app_key", appKey);
  if (accessKey) url.searchParams.set("access_key", accessKey);
  return url.toString();
}

export const volcProvider: AsrProvider = {
  id: "volc",
  needsPcm: true,
  async start({ settings, onPartial }) {
    if (!settings.proxyUrl) {
      throw new Error("火山 provider 需要先在设置里填写中转地址（浏览器无法直接设置鉴权请求头）");
    }
    const language = settings.language.startsWith("zh") ? "zh-CN" : settings.language;
    const ws = new WebSocket(
      proxyEndpoint(settings.proxyUrl, settings.volcAppKey, settings.volcAccessKey, language),
    );
    ws.binaryType = "arraybuffer";

    let sequence = 1;
    let text = "";
    let failure: Error | null = null;
    let closed = false;
    const closeWaiters: Array<() => void> = [];

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("无法连接语音中转服务，请检查中转地址"));
    });

    ws.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      const frame = parseFrame(ev.data);
      if (frame.msgType === MSG_ERROR) {
        failure = new Error(`火山识别错误 ${frame.code ?? ""}: ${frame.payload}`.trim());
        return;
      }
      if (frame.msgType !== MSG_FULL_SERVER || !frame.payload) return;
      let data: VolcResponse;
      try {
        data = JSON.parse(frame.payload) as VolcResponse;
      } catch {
        return;
      }
      const next = data.result?.text ?? data.result?.utterances?.map((u) => u.text ?? "").join("") ?? "";
      if (next) {
        text = next;
        onPartial(text);
      }
    };
    ws.onclose = () => {
      closed = true;
      for (const w of closeWaiters.splice(0)) w();
    };

    ws.send(buildFrame(MSG_FULL_CLIENT, FLAG_POSITIVE_SEQ, SER_JSON, sequence, buildRequest(language)));

    return {
      pushPcm(frame) {
        if (ws.readyState !== WebSocket.OPEN) return;
        sequence += 1;
        const bytes = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
        ws.send(buildFrame(MSG_AUDIO_ONLY, FLAG_POSITIVE_SEQ, SER_RAW, sequence, bytes));
      },
      async finish() {
        if (ws.readyState === WebSocket.OPEN) {
          // 负包：告知服务端音频结束，服务端据此给出最终结果
          ws.send(buildFrame(MSG_AUDIO_ONLY, FLAG_NEGATIVE_SEQ, SER_RAW, -(sequence + 1), new Uint8Array()));
          if (!closed) {
            await new Promise<void>((resolve) => {
              closeWaiters.push(resolve);
              setTimeout(resolve, 5000);
            });
          }
          ws.close();
        }
        if (failure) throw failure;
        return text.trim();
      },
      cancel() {
        ws.close();
      },
    } satisfies AsrSession;
  },
};
