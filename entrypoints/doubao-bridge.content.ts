import { fromBase64, toBase64, type FromBridge, type ToBridge } from "@/lib/asr/doubao/messages";
import { buildWsUrl, type DoubaoIds } from "@/lib/asr/doubao/protocol";

/**
 * 豆包语音识别桥接。
 *
 * VoiceGenie 的入口靠 doubao.com 的登录态 Cookie，跨站握手带不上，
 * 所以 WebSocket 必须在 doubao.com 页面内建立：这个 content script 就是那条通道，
 * 它只负责按扩展的指令开连接、双向转发字节，不读取也不外发任何 Cookie/token。
 */

const ID_PATTERN = /^\d{15,22}$/;
/**
 * 语音入口的 app key。豆包前端不一定写成 `api_app_key`（也可能只是 `appKey`/`app_key`），
 * 所以不强制 api 前缀；但页面里可能存在多个不相关的 app_key，因此只在 voicegenie 附近取。
 */
const APP_KEY_PATTERN = /(?:api_?)?app_?key["'\s:=]+([A-Za-z0-9_-]{12,32})/i;
const VOICE_HINT = /voicegenie/i;
/** 扩展缓存位，与设置里的手填值分开 */
const APP_KEY_CACHE = "local:doubaoAppKeyCache";
/** 扫描预算：豆包的 chunk 动辗十几 MB，不能阻塞到超时 */
const SCAN_BUDGET_MS = 6000;
const SCAN_CONCURRENCY = 8;

function readCookies(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) out[name] = rest.join("=");
  }
  return out;
}

/** 从页面自身的存储里取设备/用户标识（都是标识符，不是凭证）；取不到就退化为随机值 */
function discoverIds(): DoubaoIds {
  const cookies = readCookies();
  const candidates = new Map<string, string>();

  const consider = (key: string, value: string | null) => {
    if (!value) return;
    const trimmed = value.replace(/^"|"$/g, "");
    if (ID_PATTERN.test(trimmed)) candidates.set(key.toLowerCase(), trimmed);
  };

  for (const [key, value] of Object.entries(cookies)) consider(key, value);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const raw = localStorage.getItem(key);
    consider(key, raw);
    if (raw && raw.startsWith("{")) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string" || typeof v === "number") consider(k, String(v));
        }
      } catch {
        /* 非 JSON，忽略 */
      }
    }
  }

  const pick = (...names: string[]): string => {
    for (const name of names) {
      for (const [key, value] of candidates) {
        if (key.includes(name)) return value;
      }
    }
    return `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 19);
  };

  return {
    deviceId: pick("device_id", "did"),
    webId: pick("web_id", "tea_uuid", "uuid"),
    uid: pick("user_id", "uid", "user_unique_id"),
    appKey: "",
  };
}

/**
 * appkey 是 doubao.com 前端自己下发的参数（会随其改版变），不内置在扩展里；
 * 运行时从页面已加载的 JS 里拿，拿到后缓存。
 */
async function resolveAppKey(configured: string): Promise<string> {
  if (configured) return configured;
  const cached = await storage.getItem<string>(APP_KEY_CACHE);
  if (cached) return cached;

  /** 只接受 voicegenie 附近的 key，避开页面里其它业务的 app_key */
  const findNearVoiceGenie = (source: string): string => {
    const hint = new RegExp(VOICE_HINT.source, "gi");
    for (let match = hint.exec(source); match; match = hint.exec(source)) {
      const around = source.slice(Math.max(0, match.index - 2000), match.index + 2000);
      const hit = APP_KEY_PATTERN.exec(around);
      if (hit?.[1]) return hit[1];
    }
    return "";
  };

  const inline = [...document.querySelectorAll("script")].map((s) => s.textContent ?? "");
  for (const source of inline) {
    const key = findNearVoiceGenie(source);
    if (key) {
      await storage.setItem(APP_KEY_CACHE, key);
      return key;
    }
  }

  const urls = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => s.src);
  const deadline = Date.now() + SCAN_BUDGET_MS;
  let cursor = 0;
  let found = "";

  const worker = async () => {
    while (!found && Date.now() < deadline) {
      const url = urls[cursor++];
      if (!url) return;
      const text = await fetch(url).then(
        (r) => (r.ok ? r.text() : ""),
        () => "",
      );
      const key = findNearVoiceGenie(text);
      if (key) found = key;
    }
  };
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));

  if (found) await storage.setItem(APP_KEY_CACHE, found);
  return found;
}

export default defineContentScript({
  matches: ["*://*.doubao.com/*"],
  runAt: "document_idle",
  allFrames: false,
  main() {
    let socket: WebSocket | null = null;

    const emit = (msg: FromBridge) => {
      void browser.runtime.sendMessage(msg).catch(() => {});
    };

    const close = () => {
      const current = socket;
      socket = null;
      try {
        current?.close();
      } catch {
        /* already closed */
      }
    };

    const open = async (language: string, configuredAppKey: string) => {
      close();
      const ids = discoverIds();
      ids.appKey = await resolveAppKey(configuredAppKey);
      if (!ids.appKey) {
        emit({
          target: "doubao-client",
          type: "error",
          message:
            "没能从豆包页面自动取到语音入口 app key：请在设置里手填（豆包页面 DevTools → Network → voicegenie 连接的 api_app_key 参数），或改用官方引擎",
        });
        return;
      }
      const ws = new WebSocket(buildWsUrl(ids, language));
      ws.binaryType = "arraybuffer";
      socket = ws;

      ws.addEventListener("open", () => emit({ target: "doubao-client", type: "open-ok", ids }));
      ws.addEventListener("message", (ev) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        emit({ target: "doubao-client", type: "frame", data: toBase64(new Uint8Array(ev.data)) });
      });
      ws.addEventListener("close", (ev) => emit({ target: "doubao-client", type: "closed", code: ev.code }));
      ws.addEventListener("error", () =>
        emit({ target: "doubao-client", type: "error", message: "豆包语音连接失败（可能未登录或接口已变更）" }),
      );
    };

    browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
      const msg = raw as ToBridge;
      if (!msg || msg.target !== "doubao-bridge") return;
      if (msg.type === "ping") {
        // browser 这里就是原生 chrome（无 polyfill）：返回 Promise 会被丢弃，必须 sendResponse
        sendResponse({ alive: true });
        return true;
      }
      if (msg.type === "open") void open(msg.language, msg.appKey);
      else if (msg.type === "frame") {
        if (socket?.readyState === WebSocket.OPEN) socket.send(fromBase64(msg.data));
      } else if (msg.type === "close") close();
      return undefined;
    });
  },
});
