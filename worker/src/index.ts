/**
 * SpeakType 中转（Cloudflare Worker）
 *
 * 两个职责：
 * 1. /asr/volc：把浏览器的 WebSocket 透传到火山引擎流式识别接口，并补上浏览器无法设置的 X-Api-* 鉴权头。
 *    只做字节转发，不解析音频，也不落盘。
 * 2. /asr/zhipu、/polish：代理智谱转写与润色请求，避免把服务端 key 下发到浏览器。
 */

interface Env {
  VOLC_APP_KEY?: string;
  VOLC_ACCESS_KEY?: string;
  VOLC_RESOURCE_ID?: string;
  ZHIPU_API_KEY?: string;
  /** 逗号分隔的允许来源（扩展 id），留空表示不限制 */
  ALLOWED_ORIGINS?: string;
}

const VOLC_ASR = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";
const ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_RESOURCE_ID = "volc.bigasr.sauc.duration";

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers": "content-type,authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
});

function originAllowed(request: Request, env: Env): boolean {
  const allow = env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!allow?.length) return true;
  const origin = request.headers.get("Origin");
  return Boolean(origin && allow.includes(origin));
}

async function relayVolc(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const appKey = url.searchParams.get("app_key") || env.VOLC_APP_KEY;
  const accessKey = url.searchParams.get("access_key") || env.VOLC_ACCESS_KEY;
  if (!appKey || !accessKey) return new Response("missing volc credentials", { status: 400 });

  // Workers 里给 WebSocket 握手加自定义头，只能走 fetch + Upgrade，再取 response.webSocket
  const upstreamRes = await fetch(VOLC_ASR.replace(/^wss:/, "https:"), {
    headers: {
      Upgrade: "websocket",
      "X-Api-App-Key": appKey,
      "X-Api-Access-Key": accessKey,
      "X-Api-Resource-Id": env.VOLC_RESOURCE_ID ?? DEFAULT_RESOURCE_ID,
      "X-Api-Connect-Id": crypto.randomUUID(),
    },
  });
  const upstream = upstreamRes.webSocket;
  if (!upstream) {
    return new Response(`upstream refused: ${upstreamRes.status}`, { status: 502 });
  }
  upstream.accept();

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  server.accept();

  upstream.addEventListener("message", (ev) => {
    try {
      server.send(ev.data as ArrayBuffer);
    } catch {
      /* client gone */
    }
  });
  upstream.addEventListener("close", (ev) => server.close(ev.code === 1005 ? 1000 : ev.code, ev.reason));
  upstream.addEventListener("error", () => server.close(1011, "upstream error"));

  server.addEventListener("message", (ev) => {
    upstream.send(ev.data as ArrayBuffer);
  });
  server.addEventListener("close", () => {
    try {
      upstream.close();
    } catch {
      /* already closed */
    }
  });

  return new Response(null, { status: 101, webSocket: client });
}

async function proxyZhipu(request: Request, env: Env, path: string): Promise<Response> {
  if (!env.ZHIPU_API_KEY) return new Response("missing ZHIPU_API_KEY", { status: 400 });
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${env.ZHIPU_API_KEY}`);
  headers.delete("host");
  headers.delete("origin");
  const res = await fetch(`${ZHIPU_BASE}${path}`, {
    method: "POST",
    headers,
    body: request.body,
  });
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors(request.headers.get("Origin")))) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request.headers.get("Origin")) });
    }
    // 健康检查不带 Origin，放在来源校验之前，否则配了 ALLOWED_ORIGINS 就探不活
    if (url.pathname === "/health") return new Response("ok");
    if (!originAllowed(request, env)) return new Response("forbidden", { status: 403 });

    if (url.pathname === "/asr/volc") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      return relayVolc(request, env);
    }
    if (url.pathname === "/asr/zhipu") return proxyZhipu(request, env, "/audio/transcriptions");
    if (url.pathname === "/polish") return proxyZhipu(request, env, "/chat/completions");

    return new Response("not found", { status: 404 });
  },
};
