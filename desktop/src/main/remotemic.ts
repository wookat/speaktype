import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";
import QRCode from "qrcode";
import selfsigned from "selfsigned";
import { WebSocketServer, WebSocket } from "ws";
import type { RemoteMicInfo, StatusPayload } from "../shared/types";
import { currentLanguage, t } from "./i18n";

const PORT_BASE = 43117;
const PORT_TRIES = 10;

export interface RemoteMicDeps {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => void;
  pushPcm: (frame: Int16Array) => void;
  isRecording: () => boolean;
  onClients: (count: number) => void;
}

let server: Server | null = null;
let wss: WebSocketServer | null = null;
let deps: RemoteMicDeps | null = null;
let token = "";
// 公网中转模式：桌面端作为客户端连入 Cloudflare Worker 房间，手机页由 Worker 托管
let relayWs: WebSocket | null = null;
let relayRoom = "";
let relayBase = "";
let relayStopped = true;
let relayPhoneConnected = false;
/** 中转连续建联失败计数：达到阈值后在设置页显示可见错误，成功建联即清零 */
let relayFails = 0;
const RELAY_FAIL_VISIBLE = 3;
let info: RemoteMicInfo = { running: false, url: "", qrDataUrl: "", clients: 0 };
/** 当前持有录音会话的手机连接：只有它能推流/结束，避免多台手机互相打架 */
let activeWs: WebSocket | null = null;

function lanAddress(): string {
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) return net.address;
    }
  }
  return "127.0.0.1";
}

/** 自签证书：getUserMedia 要求安全上下文，局域网 IP 只能走自签 HTTPS（手机端首次需信任一次） */
async function loadCert(): Promise<{ key: string; cert: string }> {
  const dir = join(app.getPath("userData"), "remote-mic");
  const keyFile = join(dir, "key.pem");
  const certFile = join(dir, "cert.pem");
  if (existsSync(keyFile) && existsSync(certFile)) {
    return { key: readFileSync(keyFile, "utf8"), cert: readFileSync(certFile, "utf8") };
  }
  const pems = await selfsigned.generate([{ name: "commonName", value: "speaktype.local" }], {
    notAfterDate: new Date(Date.now() + 3650 * 24 * 3600 * 1000),
    keySize: 2048,
    algorithm: "sha256",
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(keyFile, pems.private);
  writeFileSync(certFile, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

/** 配对页文案：跟随桌面端界面语言（中文界面给中文，其余给英文） */
function pageStrings(): Record<string, string> {
  const zh = currentLanguage().startsWith("zh");
  return zh
    ? {
        lang: "zh",
        connecting: "连接中…",
        connected: "已连接电脑",
        reconnecting: "连接断开，正在重连…",
        transcribing: "转写中…",
        polishing: "润色中…",
        error: "出错了",
        busy: "电脑端正在录音，请稍候",
        hold: "按住说话",
        release: "松手结束",
        recording: "录音中…",
        micDenied: "麦克风权限被拒绝",
        rescan: "配对已失效，请回电脑重新扫码",
        footer: "松手后文字会落到电脑光标处 · 音频仅经局域网传输",
      }
    : {
        lang: "en",
        connecting: "Connecting…",
        connected: "Connected to your PC",
        reconnecting: "Disconnected, reconnecting…",
        transcribing: "Transcribing…",
        polishing: "Polishing…",
        error: "Something went wrong",
        busy: "Your PC is recording, please wait",
        hold: "Hold to talk",
        release: "Release to finish",
        recording: "Recording…",
        micDenied: "Microphone permission denied",
        rescan: "Pairing expired — scan the QR code on your PC again",
        footer: "Text lands at your PC cursor on release · audio stays on your local network",
      };
}

/** 链接失效页：与配对页同一套语言约定（中文界面给中文，其余给英文） */
function invalidLinkPage(): string {
  const zh = currentLanguage().startsWith("zh");
  const title = zh ? "链接已失效" : "Link expired";
  const body = zh ? "请回电脑上的 SpeakType 重新扫码" : "Go back to SpeakType on your PC and scan the QR code again";
  return `<!doctype html>
<html lang="${zh ? "zh" : "en"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SpeakType</title>
<style>
  body { font-family: system-ui, sans-serif; background: #17171c; color: #e2e8f0; height: 100dvh;
         margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
         padding: 24px; text-align: center; }
  h1 { font-size: 18px; font-weight: 600; }
  p { margin-top: 10px; font-size: 14px; color: #94a3b8; }
</style>
</head>
<body><h1>${title}</h1><p>${body}</p></body>
</html>`;
}

function page(): string {
  const L = pageStrings();
  return `<!doctype html>
<html lang="${L.lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<title>SpeakType</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { font-family: system-ui, sans-serif; background: #17171c; color: #e2e8f0; height: 100dvh;
         display: flex; flex-direction: column; align-items: center; justify-content: space-between;
         padding: 24px; user-select: none; }
  header { text-align: center; }
  h1 { font-size: 18px; font-weight: 600; }
  #state { margin-top: 6px; font-size: 13px; color: #94a3b8; min-height: 18px; }
  #partial { flex: 1; width: 100%; max-width: 460px; margin: 16px 0; padding: 14px; overflow-y: auto;
             border-radius: 16px; background: #232329; font-size: 15px; line-height: 1.6; color: #cbd5e1; }
  #talk { width: 132px; height: 132px; border-radius: 50%; border: none; background: #6d5ae0; color: #fff;
          font-size: 16px; font-weight: 600; touch-action: none; transition: transform .1s, background .2s; }
  #talk:disabled { background: #3f3f46; }
  #talk.rec { background: #ef4444; transform: scale(1.08); }
  footer { margin-top: 18px; font-size: 12px; color: #64748b; text-align: center; }
</style>
</head>
<body>
<header><h1>SpeakType</h1><div id="state">${L.connecting}</div></header>
<div id="partial"></div>
<button id="talk" disabled>${L.hold}</button>
<footer>${L.footer}</footer>
<script>
const L = ${JSON.stringify(L)};
const token = new URLSearchParams(location.search).get("t") || "";
const stateEl = document.getElementById("state");
const partialEl = document.getElementById("partial");
const talk = document.getElementById("talk");
let ws = null, ctx = null, stream = null, node = null, holding = false, fails = 0;

function connect() {
  ws = new WebSocket("wss://" + location.host + "/ws?t=" + token);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => { fails = 0; stateEl.textContent = L.connected; talk.disabled = false; };
  // token 已轮换（桌面端开关过远程麦）时重连永远被拒：连拒 8 次即停，提示重新扫码
  ws.onclose = () => {
    talk.disabled = true;
    if (++fails >= 8) { stateEl.textContent = L.rescan; return; }
    stateEl.textContent = L.reconnecting;
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    const m = JSON.parse(ev.data);
    if (m.type === "status") {
      partialEl.textContent = m.partial || partialEl.textContent;
      if (m.state === "transcribing") stateEl.textContent = L.transcribing;
      else if (m.state === "polishing") stateEl.textContent = L.polishing;
      else if (m.state === "error") stateEl.textContent = m.message || L.error;
      else if (m.state === "idle" && !holding) stateEl.textContent = L.connected;
    }
    if (m.type === "busy") { stateEl.textContent = L.busy; endHold(true); }
  };
}
connect();

async function openMic() {
  if (stream) return true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) { stateEl.textContent = L.micDenied; return false; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  node = ctx.createScriptProcessor(4096, 1, 1);
  const ratio = ctx.sampleRate / 16000;
  node.onaudioprocess = (e) => {
    if (!holding || !ws || ws.readyState !== 1) return;
    const input = e.inputBuffer.getChannelData(0);
    const out = new Int16Array(Math.floor(input.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const v = input[Math.floor(i * ratio)];
      out[i] = Math.max(-32768, Math.min(32767, v * 32767));
    }
    ws.send(out.buffer);
  };
  src.connect(node);
  node.connect(ctx.destination);
  return true;
}

async function startHold(ev) {
  ev.preventDefault();
  if (holding || talk.disabled) return;
  if (!(await openMic())) return;
  if (ctx.state === "suspended") await ctx.resume();
  holding = true;
  talk.classList.add("rec");
  talk.textContent = L.release;
  stateEl.textContent = L.recording;
  partialEl.textContent = "";
  ws.send(JSON.stringify({ type: "start" }));
}
function endHold(cancel) {
  if (!holding) return;
  holding = false;
  talk.classList.remove("rec");
  talk.textContent = L.hold;
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: cancel ? "cancel" : "stop" }));
}
talk.addEventListener("touchstart", startHold, { passive: false });
talk.addEventListener("touchend", (e) => { e.preventDefault(); endHold(false); }, { passive: false });
talk.addEventListener("touchcancel", () => endHold(true));
talk.addEventListener("mousedown", startHold);
talk.addEventListener("mouseup", () => endHold(false));
</script>
</body>
</html>`;
}

export function configureRemoteMic(d: RemoteMicDeps): void {
  deps = d;
}

export function remoteMicInfo(): RemoteMicInfo {
  return { ...info };
}

/** 把录音状态转发给手机端（显示实时字幕/转写进度） */
export function broadcastToPhones(payload: StatusPayload): void {
  if (!wss && !relayWs) return;
  const msg = JSON.stringify({
    type: "status",
    state: payload.state,
    partial: payload.partial ?? "",
    message: payload.message ?? "",
  });
  if (wss) {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }
  if (relayWs?.readyState === WebSocket.OPEN && relayPhoneConnected) relayWs.send(msg);
}

/** 手机端消息处理：局域网直连与公网中转共用同一协议 */
function handlePhoneMessage(d: RemoteMicDeps, ws: WebSocket, data: unknown, isBinary: boolean): void {
  if (isBinary) {
    if (activeWs !== ws) return;
    const buf = data as Buffer;
    const copy = new Uint8Array(buf.length - (buf.length % 2));
    copy.set(buf.subarray(0, copy.length));
    d.pushPcm(new Int16Array(copy.buffer, 0, copy.length / 2));
    return;
  }
  try {
    const msg = JSON.parse(String(data)) as { type: string; connected?: boolean };
    if (msg.type === "peer" && ws === relayWs) {
      // 中转房间的手机上线/离线通知
      relayPhoneConnected = Boolean(msg.connected);
      if (!relayPhoneConnected && activeWs === ws) {
        activeWs = null;
        d.cancel();
      }
      info.clients = relayPhoneConnected ? 1 : 0;
      d.onClients(info.clients);
    } else if (msg.type === "start") {
      if (d.isRecording()) {
        ws.send(JSON.stringify({ type: "busy" }));
        return;
      }
      activeWs = ws;
      void d.start();
    } else if (msg.type === "stop" && activeWs === ws) {
      activeWs = null;
      void d.stop();
    } else if (msg.type === "cancel" && activeWs === ws) {
      activeWs = null;
      d.cancel();
    }
  } catch {
    // 忽略无法解析的消息
  }
}

export async function stopRemoteMic(): Promise<void> {
  activeWs = null;
  relayStopped = true;
  relayPhoneConnected = false;
  if (relayWs) {
    relayWs.terminate();
    relayWs = null;
  }
  if (wss) {
    for (const client of wss.clients) client.terminate();
    wss.close();
    wss = null;
  }
  if (server) {
    // 配对页残留的 HTTP keep-alive 连接会让 close 永远等不到回调，进而卡死后续的模式切换
    server.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
  info = { running: false, url: "", qrDataUrl: "", clients: 0 };
}

// 中转连接心跳：半开 TCP 不会触发 close，靠协议层 ping/pong 探活，超时即 terminate 让现有重连接管
const RELAY_PING_INTERVAL = 25_000;

function connectRelay(d: RemoteMicDeps): void {
  const ws = new WebSocket(`wss://${relayBase}/ws/${relayRoom}?role=desktop`);
  relayWs = ws;
  let alive = true;
  let heartbeat: NodeJS.Timeout | null = null;
  ws.on("open", () => {
    relayFails = 0;
    if (info.error) {
      info.error = undefined;
      d.onClients(info.clients);
    }
    heartbeat = setInterval(() => {
      if (!alive) {
        log.warn("relay ws heartbeat timeout, terminating");
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, RELAY_PING_INTERVAL);
  });
  ws.on("pong", () => {
    alive = true;
  });
  ws.on("message", (data, isBinary) => handlePhoneMessage(d, ws, data, isBinary));
  ws.on("error", (error) => log.warn("relay ws error", error));
  ws.on("close", () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (activeWs === ws) {
      activeWs = null;
      d.cancel();
    }
    if (relayWs === ws) relayWs = null;
    relayPhoneConnected = false;
    info.clients = 0;
    d.onClients(0);
    // 开关仍开着时掉线自动重连；连续失败达到阈值时在设置页显示可见错误
    if (!relayStopped) {
      relayFails++;
      if (relayFails >= RELAY_FAIL_VISIBLE && !info.error) {
        info.error = t("settings.remoteMicRelayError");
        d.onClients(info.clients);
      }
      setTimeout(() => !relayStopped && !relayWs && connectRelay(d), 2000);
    }
  });
}

/** 公网中转模式：连入用户自部署（或公共）的 Cloudflare Worker 中转 */
async function startRelayMic(relayUrl: string, room: string): Promise<RemoteMicInfo> {
  const d = deps;
  if (!d) throw new Error("remote mic not configured");
  const parsed = new URL(relayUrl.startsWith("http") ? relayUrl : `https://${relayUrl}`);
  relayBase = parsed.host + parsed.pathname.replace(/\/+$/, "");
  relayRoom = room;
  relayStopped = false;
  relayFails = 0;
  connectRelay(d);
  const url = `https://${relayBase}/m/${relayRoom}?lang=${currentLanguage()}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  info = { running: true, url, qrDataUrl, clients: 0, pairCode: relayRoom };
  log.info(`remote mic relaying via ${url}`);
  return remoteMicInfo();
}

/** 房间号即配对码：固定下来，装到主屏幕的手机 App 才能一直连同一台电脑 */
export function newPairCode(): string {
  return randomBytes(6).toString("hex");
}

export async function startRemoteMic(
  mode: "lan" | "relay" = "lan",
  relayUrl = "",
  relayRoomId = "",
): Promise<RemoteMicInfo> {
  if (server || relayWs) return remoteMicInfo();
  if (mode === "relay") {
    if (!relayUrl.trim()) throw new Error("relay URL required");
    return startRelayMic(relayUrl.trim(), relayRoomId || newPairCode());
  }
  const d = deps;
  if (!d) throw new Error("remote mic not configured");
  token = randomBytes(6).toString("hex");
  const { key, cert } = await loadCert();

  const srv = createServer({ key, cert }, (req, res) => {
    const url = new URL(req.url ?? "/", "https://x");
    if (url.pathname === "/" && url.searchParams.get("t") === token) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page());
    } else {
      res.writeHead(403, { "content-type": "text/html; charset=utf-8" });
      res.end(invalidLinkPage());
    }
  });

  const sockets = new WebSocketServer({ noServer: true });
  srv.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "https://x");
    if (url.pathname !== "/ws" || url.searchParams.get("t") !== token) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit("connection", ws));
  });

  sockets.on("connection", (ws) => {
    info.clients = sockets.clients.size;
    d.onClients(sockets.clients.size);
    ws.on("close", () => {
      if (activeWs === ws) {
        activeWs = null;
        d.cancel();
      }
      info.clients = sockets.clients.size;
      d.onClients(sockets.clients.size);
    });
    ws.on("message", (data, isBinary) => handlePhoneMessage(d, ws, data, isBinary));
  });

  let port = PORT_BASE;
  for (let i = 0; i < PORT_TRIES; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        srv.once("error", reject);
        srv.listen(port, "0.0.0.0", () => {
          srv.removeAllListeners("error");
          resolve();
        });
      });
      break;
    } catch (error) {
      port++;
      if (i === PORT_TRIES - 1) throw error instanceof Error ? error : new Error(String(error));
    }
  }

  server = srv;
  wss = sockets;
  const url = `https://${lanAddress()}:${port}/?t=${token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  info = { running: true, url, qrDataUrl, clients: 0 };
  log.info(`remote mic listening at ${url}`);
  return remoteMicInfo();
}

