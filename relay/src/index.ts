/**
 * SpeakType 公网中转（Cloudflare Worker + Durable Object）
 *
 * 手机与电脑不在同一局域网时的音频中转：桌面端以 role=desktop 连入房间，
 * 手机扫码打开 /m/<room> 页面后以 role=phone 连入，双方消息原样互通（不落盘、不解析音频）。
 * 房间号是桌面端生成的 12 位十六进制随机串，即配对凭证；单房间同一时刻各只允许一台设备。
 *
 * 一键部署：https://deploy.workers.cloudflare.com/?url=https://github.com/wookat/speaktype/tree/main/relay
 */

import { ICON_192_B64, ICON_512_B64 } from "./icons";
import { manifest, swJs, phonePage } from "./phone";

export interface Env {
  ROOM: DurableObjectNamespace;
}

const ROOM_RE = /^[0-9a-f]{12}$/;

/** 直通转发：workerd 里二进制帧可能以 Blob 到达，直接 send(Blob) 会被字符串化，需转回 ArrayBuffer */
async function forward(dst: WebSocket | null, data: unknown): Promise<void> {
  if (dst?.readyState !== WebSocket.READY_STATE_OPEN) return;
  if (typeof data === "string" || data instanceof ArrayBuffer) dst.send(data);
  else dst.send(await (data as Blob).arrayBuffer());
}

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
        void forward(this.phone, ev.data);
      });
      server.addEventListener("close", () => {
        if (this.desktop === server) this.desktop = null;
        this.phone?.close(1000, "desktop left");
      });
      if (this.phone) {
        server.send(JSON.stringify({ type: "peer", connected: true }));
        if (this.phone.readyState === WebSocket.READY_STATE_OPEN) {
          this.phone.send(JSON.stringify({ type: "peer", connected: true }));
        }
      }
    } else {
      if (this.phone?.readyState === WebSocket.READY_STATE_OPEN) {
        server.close(1008, "room occupied");
        return new Response(null, { status: 101, webSocket: client });
      }
      this.phone = server;
      server.addEventListener("message", (ev) => {
        void forward(this.desktop, ev.data);
      });
      server.addEventListener("close", () => {
        if (this.phone === server) this.phone = null;
        if (this.desktop?.readyState === WebSocket.READY_STATE_OPEN) {
          this.desktop.send(JSON.stringify({ type: "peer", connected: false }));
        }
      });
      if (this.desktop?.readyState === WebSocket.READY_STATE_OPEN) {
        this.desktop.send(JSON.stringify({ type: "peer", connected: true }));
        server.send(JSON.stringify({ type: "peer", connected: true }));
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }
}

const HTML_HEADERS = { "content-type": "text/html; charset=utf-8" };

function png(base64: string): Response {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" },
  });
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);
    // 支持挂在域名的 /relay 前缀下（如 speaktype.zalize.com/relay/…），也支持 workers.dev 根路径
    const prefixed = url.pathname === "/relay" || url.pathname.startsWith("/relay/");
    const base = prefixed ? "/relay" : "";
    const path = prefixed ? url.pathname.slice("/relay".length) || "/" : url.pathname;

    if (path === "/health") return new Response("ok");

    // PWA 资源：装到主屏幕后从 /app 启动，房间号取 localStorage 里上次配对的电脑
    if (path === "/app") return new Response(phonePage(null, base), { headers: HTML_HEADERS });
    if (path === "/manifest.webmanifest") {
      return new Response(manifest(base), { headers: { "content-type": "application/manifest+json" } });
    }
    if (path === "/sw.js") {
      return new Response(swJs(base), { headers: { "content-type": "text/javascript; charset=utf-8" } });
    }
    if (path === "/icon-192.png") return png(ICON_192_B64);
    if (path === "/icon-512.png") return png(ICON_512_B64);

    const page = path.match(/^\/m\/([0-9a-f]+)$/);
    if (page && ROOM_RE.test(page[1]!)) {
      return new Response(phonePage(page[1]!, base), { headers: HTML_HEADERS });
    }

    const ws = path.match(/^\/ws\/([0-9a-f]+)$/);
    if (ws && ROOM_RE.test(ws[1]!)) {
      const room = env.ROOM.get(env.ROOM.idFromName(ws[1]!));
      return room.fetch(request);
    }

    return new Response("SpeakType relay — see https://github.com/wookat/speaktype", { status: 404 });
  },
};
