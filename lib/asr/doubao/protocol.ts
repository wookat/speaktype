/**
 * 豆包网页版语音输入（SAMI VoiceGenie）帧协议。
 * 字段编号来自实测抓包，详见 docs/reverse-engineering-doubao-voice.md。
 * 帧本身是一个 protobuf 消息，这里手写最小编解码，避免为几字段引入 protobuf 运行时。
 */

export const DOUBAO_WS_HOST = "wss://frontier-audio-web-ws.doubao.com/api/v2/sami/voicegenie";
export const NAMESPACE = "VoiceGenie";
export const WEB_AID = "497858";
export const DOUBAO_BOT_ID = "7234781073513644036";

export type ClientEvent = "StartTask" | "StartSession" | "TaskRequest" | "FinishSession" | "FinishTask" | "Ping";
export type ServerEvent =
  | "TaskStarted"
  | "SessionStarted"
  | "ASRResponse"
  | "SessionFinished"
  | "TaskFinished"
  | "Pong"
  | string;

const F_CLIENT_APP_KEY = 2;
const F_CLIENT_NAMESPACE = 3;
const F_CLIENT_EVENT = 5;
const F_CLIENT_PAYLOAD = 6;
const F_CLIENT_AUDIO = 7;
const F_CLIENT_SESSION = 8;

const F_SERVER_CONNECT_ID = 1;
const F_SERVER_EVENT = 4;
const F_SERVER_STATUS_CODE = 5;
const F_SERVER_STATUS_MESSAGE = 6;
const F_SERVER_PAYLOAD = 7;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function varint(value: number): number[] {
  const out: number[] = [];
  let v = value;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

function lengthDelimited(field: number, bytes: Uint8Array): Uint8Array {
  const head = [...varint((field << 3) | 2), ...varint(bytes.length)];
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head, 0);
  out.set(bytes, head.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export interface ClientFrame {
  event: ClientEvent;
  appKey: string;
  payload?: unknown;
  sessionId?: string;
  audio?: Uint8Array;
}

export function encodeFrame(frame: ClientFrame): Uint8Array {
  const parts: Uint8Array[] = [
    lengthDelimited(F_CLIENT_APP_KEY, encoder.encode(frame.appKey)),
    lengthDelimited(F_CLIENT_NAMESPACE, encoder.encode(NAMESPACE)),
    lengthDelimited(F_CLIENT_EVENT, encoder.encode(frame.event)),
    lengthDelimited(F_CLIENT_PAYLOAD, encoder.encode(JSON.stringify(frame.payload ?? {}))),
  ];
  if (frame.audio) parts.push(lengthDelimited(F_CLIENT_AUDIO, frame.audio));
  if (frame.sessionId) parts.push(lengthDelimited(F_CLIENT_SESSION, encoder.encode(frame.sessionId)));
  return concat(parts);
}

export interface ServerFrame {
  connectId?: string;
  event: ServerEvent;
  statusCode?: number;
  statusMessage?: string;
  payload?: unknown;
}

export function decodeFrame(buffer: ArrayBuffer): ServerFrame {
  const bytes = new Uint8Array(buffer);
  const out: ServerFrame = { event: "" };
  let i = 0;
  const readVarint = (): number => {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = bytes[i++] ?? 0;
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  };

  while (i < bytes.length) {
    const key = readVarint();
    const field = key >> 3;
    const wireType = key & 7;
    if (wireType === 0) {
      const value = readVarint();
      if (field === F_SERVER_STATUS_CODE) out.statusCode = value;
      continue;
    }
    if (wireType !== 2) break;
    const length = readVarint();
    const slice = bytes.subarray(i, i + length);
    i += length;
    if (field === F_SERVER_CONNECT_ID) out.connectId = decoder.decode(slice);
    else if (field === F_SERVER_EVENT) out.event = decoder.decode(slice);
    else if (field === F_SERVER_STATUS_MESSAGE) out.statusMessage = decoder.decode(slice);
    else if (field === F_SERVER_PAYLOAD) {
      const text = decoder.decode(slice);
      try {
        out.payload = JSON.parse(text);
      } catch {
        out.payload = text;
      }
    }
  }
  return out;
}

export interface AsrResponsePayload {
  results?: Array<{ text?: string; is_interim?: boolean }>;
}

export function readAsrText(payload: unknown): { text: string; interim: boolean } | null {
  const data = payload as AsrResponsePayload | undefined;
  const first = data?.results?.[0];
  if (!first || typeof first.text !== "string") return null;
  return { text: first.text, interim: first.is_interim !== false };
}

export interface DoubaoIds {
  deviceId: string;
  webId: string;
  uid: string;
  /** doubao.com 前端自己下发的 web appkey，运行时从页面取，不内置在扩展里 */
  appKey: string;
}

export function buildWsUrl(ids: DoubaoIds, language: string): string {
  const url = new URL(DOUBAO_WS_HOST);
  const params: Record<string, string> = {
    api_app_key: ids.appKey,
    namespace: NAMESPACE,
    version_code: "20800",
    language: language.startsWith("zh") ? "zh" : language.slice(0, 2),
    device_platform: "web",
    pc_version: "3.31.0",
    doubao_pc_version: "3.31.0",
    pkg_type: "release_version",
    region: "CN",
    sys_region: "CN",
    samantha_web: "1",
    "use-olympus-account": "1",
    doubao_device_platform: "web",
    aid: WEB_AID,
    real_aid: WEB_AID,
    device_id: ids.deviceId,
    web_id: ids.webId,
    tea_uuid: ids.webId,
    web_platform: "browser",
    web_tab_id: crypto.randomUUID(),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/** StartSession 配置。参数取自实测抓包：VAD 判停、二遍识别、ITN/标点后处理都按网页版一致 */
export function buildStartSessionPayload(ids: DoubaoIds, language: string) {
  return {
    business: 1,
    enable_audio_input: true,
    query_mode: 2,
    interrupt_type: 0,
    request_type: 3,
    chat: {
      bot_id: DOUBAO_BOT_ID,
      message_id: "",
      uid: ids.uid,
      conversation_id: `local_${Date.now()}${Math.floor(Math.random() * 1000)}`,
      is_conf_fetched: false,
      is_dora_onboarding: false,
      new_conversation: false,
      question_id: "",
    },
    asr: {
      model: "bigasr-acllm-release-grpc-main",
      lang: language.startsWith("zh") ? "zh" : language.slice(0, 2),
      enable_vad: true,
      enable_punctuation: true,
      enable_itn: true,
      enable_disfluency: true,
      hot_word_version: 3,
      audio_src: 1,
      audio_info: { channel: 1, format: "pcm", sample_rate: 16000 },
      extra: {
        enable_asr_twopass: true,
        stream_model: "bigasr-acllm-release-streaming-grpc-4",
        nonstream_model: "bigasr-acllm-release-grpc-main",
        nonstream_asr_timeout_ms: 8000,
        use_bigasr_itn: true,
        use_bigasr_punc: true,
        enable_text_format: true,
        enable_text_post_process: true,
        asr_text_post_process_type: "last_post_process",
        enable_trim_punctuation: true,
        begin_smooth_window_ms: 500,
        end_smooth_window_ms: 800,
        end_smooth_silence_proportion: 0.9,
        voice_max_seconds: 25,
        force_to_speech_ms: 10000,
        bigasr_config: {
          max_vad_accumulate_duration_ms: 15000,
          vad_config: { model: "v2", voice_max_seconds: 5 },
        },
        vad_namespace: "VAD_V3",
        new_arch: true,
        asr_context: {},
      },
    },
    tts: { audio_config: null, extra: null },
    extra: {
      did: ids.deviceId,
      uid: ids.uid,
      app_version: 20800,
      os: "",
      enable_box_input_asr: false,
    },
  };
}
