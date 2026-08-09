/**
 * SpeakType 公网中转（Cloudflare Worker + Durable Object）
 *
 * 手机与电脑不在同一局域网时的音频中转：桌面端以 role=desktop 连入房间，
 * 手机扫码打开 /m/<room> 页面后以 role=phone 连入，双方消息原样互通（不落盘、不解析音频）。
 * 房间号是桌面端生成的 12 位十六进制随机串，即配对凭证；单房间同一时刻各只允许一台设备。
 *
 * 一键部署：https://deploy.workers.cloudflare.com/?url=https://github.com/wookat/speaktype/tree/main/relay
 */

export interface Env {
  ROOM: DurableObjectNamespace;
}

const ROOM_RE = /^[0-9a-f]{12}$/;

export class Room {
  private desktop: WebSocket | null = null;
  private phone: WebSocket | null = null;

  constructor(private state: DurableObjectState) {}

  fetch(request: Request): Response {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    if (request.headers.get("Upgrade") !== "websocket" || (role !== "desktop" && role !== "phone")) {
      return new Response("expected websocket", { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    if (role === "desktop") {
      this.desktop?.close(1000, "replaced");
      this.desktop = server;
      server.addEventListener("message", (ev) => {
        if (this.phone?.readyState === WebSocket.READY_STATE_OPEN) this.phone.send(ev.data);
      });
      server.addEventListener("close", () => {
        if (this.desktop === server) this.desktop = null;
        this.phone?.close(1000, "desktop left");
      });
      if (this.phone) server.send(JSON.stringify({ type: "peer", connected: true }));
    } else {
      if (this.phone?.readyState === WebSocket.READY_STATE_OPEN) {
        server.close(1008, "room occupied");
        return new Response(null, { status: 101, webSocket: client });
      }
      this.phone = server;
      server.addEventListener("message", (ev) => {
        if (this.desktop?.readyState === WebSocket.READY_STATE_OPEN) this.desktop.send(ev.data);
      });
      server.addEventListener("close", () => {
        if (this.phone === server) this.phone = null;
        if (this.desktop?.readyState === WebSocket.READY_STATE_OPEN) {
          this.desktop.send(JSON.stringify({ type: "peer", connected: false }));
        }
      });
      if (this.desktop?.readyState === WebSocket.READY_STATE_OPEN) {
        this.desktop.send(JSON.stringify({ type: "peer", connected: true }));
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }
}

function phonePage(room: string): string {
  return `<!doctype html>
<html lang="zh">
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
<header><h1>SpeakType</h1><div id="state">连接中…</div></header>
<div id="partial"></div>
<button id="talk" disabled>按住说话</button>
<footer>松手后文字会落到电脑光标处 · 音频经中转服务器直通，不存储</footer>
<script>
const stateEl = document.getElementById("state");
const partialEl = document.getElementById("partial");
const talk = document.getElementById("talk");
let ws = null, ctx = null, stream = null, node = null, holding = false;

function connect() {
  ws = new WebSocket("wss://" + location.host + "/ws/${room}?role=phone");
  ws.binaryType = "arraybuffer";
  ws.onopen = () => { stateEl.textContent = "已连接中转，等待电脑…"; talk.disabled = false; };
  ws.onclose = (ev) => {
    stateEl.textContent = ev.reason === "room occupied" ? "该房间已有手机连接" : "连接断开，正在重连…";
    talk.disabled = true;
    if (ev.reason !== "room occupied") setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    const m = JSON.parse(ev.data);
    if (m.type === "status") {
      partialEl.textContent = m.partial || partialEl.textContent;
      if (m.state === "transcribing") stateEl.textContent = "转写中…";
      else if (m.state === "polishing") stateEl.textContent = "润色中…";
      else if (m.state === "error") stateEl.textContent = m.message || "出错了";
      else if (m.state === "idle" && !holding) stateEl.textContent = "已连接电脑";
    }
    if (m.type === "peer") stateEl.textContent = m.connected ? "已连接电脑" : "电脑端已离线";
    if (m.type === "busy") { stateEl.textContent = "电脑端正在录音，请稍候"; endHold(true); }
  };
}
connect();

async function openMic() {
  if (stream) return true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) { stateEl.textContent = "麦克风权限被拒绝"; return false; }
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
  talk.textContent = "松手结束";
  stateEl.textContent = "录音中…";
  partialEl.textContent = "";
  ws.send(JSON.stringify({ type: "start" }));
}
function endHold(cancel) {
  if (!holding) return;
  holding = false;
  talk.classList.remove("rec");
  talk.textContent = "按住说话";
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

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");

    const page = url.pathname.match(/^\/m\/([0-9a-f]+)$/);
    if (page && ROOM_RE.test(page[1]!)) {
      return new Response(phonePage(page[1]!), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const ws = url.pathname.match(/^\/ws\/([0-9a-f]+)$/);
    if (ws && ROOM_RE.test(ws[1]!)) {
      const room = env.ROOM.get(env.ROOM.idFromName(ws[1]!));
      return room.fetch(request);
    }

    return new Response("SpeakType relay — see https://github.com/wookat/speaktype", { status: 404 });
  },
};
