import { ipcRenderer } from "electron";
import { buildWsUrl, type DoubaoIds } from "../shared/doubao-protocol";

/**
 * 跑在 doubao.com 页面里的桥接：VoiceGenie 的握手要带该站点的登录态，
 * 所以 WebSocket 必须在这里建。只转发字节，不读取也不外发 Cookie。
 */

const ID_PATTERN = /^\d{15,22}$/;

function readCookies(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) out[name] = rest.join("=");
  }
  return out;
}

/** 设备/用户标识（标识符，不是凭证），取不到就退化为随机值 */
function discoverIds(): DoubaoIds {
  const candidates = new Map<string, string>();
  const consider = (key: string, value: string | null) => {
    if (!value) return;
    const trimmed = value.replace(/^"|"$/g, "");
    if (ID_PATTERN.test(trimmed)) candidates.set(key.toLowerCase(), trimmed);
  };

  for (const [key, value] of Object.entries(readCookies())) consider(key, value);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const raw = localStorage.getItem(key);
    consider(key, raw);
    if (raw && raw.startsWith("{")) {
      try {
        for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
          if (typeof v === "string" || typeof v === "number") consider(k, String(v));
        }
      } catch {
        /* 非 JSON，忽略 */
      }
    }
  }

  const pick = (...names: string[]): string => {
    for (const name of names) {
      for (const [key, value] of candidates) if (key.includes(name)) return value;
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

let socket: WebSocket | null = null;

function emit(payload: unknown): void {
  ipcRenderer.send("doubao:event", payload);
}

function close(): void {
  const current = socket;
  socket = null;
  try {
    current?.close();
  } catch {
    /* already closed */
  }
}

ipcRenderer.on("doubao:open", (_e, msg: { language: string; appKey: string }) => {
  close();
  const ids = discoverIds();
  ids.appKey = msg.appKey;
  const ws = new WebSocket(buildWsUrl(ids, msg.language));
  ws.binaryType = "arraybuffer";
  socket = ws;
  ws.addEventListener("open", () => emit({ type: "open-ok", ids }));
  ws.addEventListener("message", (ev) => {
    if (!(ev.data instanceof ArrayBuffer)) return;
    const bytes = new Uint8Array(ev.data);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    emit({ type: "frame", data: btoa(binary) });
  });
  ws.addEventListener("close", (ev) => emit({ type: "closed", code: ev.code }));
  ws.addEventListener("error", () =>
    emit({ type: "error", message: "豆包语音连接失败（可能未登录或接口已变更）" }),
  );
});

ipcRenderer.on("doubao:send", (_e, msg: { data: string }) => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const binary = atob(msg.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  socket.send(bytes);
});

ipcRenderer.on("doubao:close", () => close());

// 主世界的 WebSocket hook 截到 app key 后从这里进缓存
window.addEventListener("message", (ev: MessageEvent) => {
  const data = ev.data as { source?: string; appKey?: string } | null;
  if (ev.source !== window || data?.source !== "speaktype-doubao-hook") return;
  if (typeof data.appKey === "string") emit({ type: "app-key", key: data.appKey });
});
