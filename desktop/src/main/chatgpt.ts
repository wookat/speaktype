import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type BrowserWindow, session } from "electron";
import { t } from "./i18n";
import { createChatgptWindow } from "./windows";

/**
 * ChatGPT 自带的一次性转写端点。不是公开稳定 API：它只认 ChatGPT 账号的
 * access token，并要求带上桌面客户端标识，随时可能变动或被风控。
 */
const ENDPOINT = "https://chatgpt.com/backend-api/transcribe";
const ORIGINATOR = "Codex Desktop";
const CLIENT_VERSION = "26.429.30905";
const USER_AGENT = `${ORIGINATOR}/${CLIENT_VERSION} (${process.platform}; ${process.arch})`;

interface ChatgptAuth {
  accessToken: string;
  accountId: string | null;
  /** 令牌来源，只用于给用户看，不含任何令牌内容 */
  source: "codex" | "login";
}

interface CodexAuthFile {
  tokens?: { access_token?: string; account_id?: string };
}

interface SessionResponse {
  accessToken?: string;
  account?: { id?: string };
}

interface TranscribeResponse {
  text?: string;
}

let bridge: BrowserWindow | null = null;
let loaded = false;

function tokenPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 从 JWT 里取 ChatGPT 账号 ID；解析失败返回 null，请求照常发（服务端会用默认账号） */
function accountIdFromToken(token: string): string | null {
  const auth = tokenPayload(token)?.["https://api.openai.com/auth"];
  if (typeof auth !== "object" || auth === null) return null;
  const id = (auth as Record<string, unknown>)["chatgpt_account_id"];
  return typeof id === "string" ? id : null;
}

/** JWT 已过期（或即将过期）时不再使用，避免拿死 token 报“未登录”误导用户 */
function tokenExpired(token: string): boolean {
  const exp = tokenPayload(token)?.["exp"];
  return typeof exp === "number" && exp * 1000 < Date.now() + 60_000;
}

/**
 * 优先复用本机 Codex CLI / Codex Desktop 已有的登录态（$CODEX_HOME/auth.json），
 * 用户装过 Codex 就完全免登录。文件只读不写，令牌不落我们自己的配置。
 */
function authFromCodexHome(): ChatgptAuth | null {
  const home = process.env["CODEX_HOME"] || join(homedir(), ".codex");
  const path = join(home, "auth.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CodexAuthFile;
    const token = parsed.tokens?.access_token;
    if (!token || tokenExpired(token)) return null;
    return {
      accessToken: token,
      accountId: parsed.tokens?.account_id ?? accountIdFromToken(token),
      source: "codex",
    };
  } catch {
    return null;
  }
}

/** 抢跑：热键按下即把 chatgpt.com 拉起来，松手时登录态已就绪 */
export function ensureChatgptBridge(): BrowserWindow {
  if (bridge && !bridge.isDestroyed()) return bridge;
  loaded = false;
  bridge = createChatgptWindow();
  bridge.webContents.on("did-finish-load", () => {
    loaded = true;
  });
  bridge.on("closed", () => {
    bridge = null;
    loaded = false;
  });
  return bridge;
}

/** 抢跑，但本机 Codex 已登录时无需拉起网页，省一个隐藏窗口 */
export function warmChatgpt(): void {
  if (!authFromCodexHome()) ensureChatgptBridge();
}

/** 让用户在应用内的官方页面登录 ChatGPT */
export function showChatgptLogin(): void {
  const win = ensureChatgptBridge();
  win.show();
  win.focus();
}

/** 从应用内已登录页面取一次会话态。令牌只在内存里流转，不写配置、不给渲染进程 */
async function authFromLoginWindow(wait: boolean): Promise<ChatgptAuth | null> {
  if (!bridge || bridge.isDestroyed()) return null;
  for (let i = 0; wait && i < 100 && !loaded; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!loaded) return null;
  try {
    const data = (await bridge.webContents.executeJavaScript(
      `fetch("/api/auth/session", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)`,
    )) as SessionResponse | null;
    if (!data?.accessToken || tokenExpired(data.accessToken)) return null;
    return {
      accessToken: data.accessToken,
      accountId: data.account?.id ?? accountIdFromToken(data.accessToken),
      source: "login",
    };
  } catch {
    return null;
  }
}

/** 全部可用登录态，按优先级排列；前面的 401 时逐个降级重试 */
async function resolveAuths(wait: boolean): Promise<ChatgptAuth[]> {
  const auths: ChatgptAuth[] = [];
  const codex = authFromCodexHome();
  if (codex) auths.push(codex);
  const login = await authFromLoginWindow(wait);
  if (login) auths.push(login);
  return auths;
}

async function resolveAuth(wait: boolean): Promise<ChatgptAuth | null> {
  return (await resolveAuths(wait))[0] ?? null;
}

/** 设置页用：是否已有可用登录态（Codex 本机登录或应用内登录任一即可） */
export async function chatgptLoggedIn(): Promise<boolean> {
  return (await resolveAuth(false)) !== null;
}

/** 手搓 multipart：Electron 的 net.fetch 不接受 FormData 对象作为 body */
function multipart(wav: Buffer, language: string): { body: Buffer; contentType: string } {
  const boundary = `----speaktype${Date.now().toString(16)}`;
  const parts: Buffer[] = [];
  if (language) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="speech.wav"\r\n` +
        `Content-Type: audio/wav\r\n\r\n`,
    ),
    wav,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function post(auth: ChatgptAuth, wav: Buffer, language: string): Promise<string> {
  const { body, contentType } = multipart(wav, language);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    originator: ORIGINATOR,
    "User-Agent": USER_AGENT,
    "Content-Type": contentType,
  };
  if (auth.accountId) headers["ChatGPT-Account-Id"] = auth.accountId;

  // 走 Chromium 的网络栈而不是 Node fetch：系统代理、Cookie、TLS 指纹都与登录窗口一致
  const res = await session.defaultSession.fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: new Uint8Array(body),
  });
  if (res.status === 401) throw new Error(t("error.chatgptNotLoggedIn"));
  if (res.status === 403) throw new Error(t("error.chatgptBlocked"));
  if (!res.ok) {
    const body = (await res.text()).slice(0, 160);
    throw new Error(`ChatGPT ASR HTTP ${res.status} ${body}`);
  }
  const data = (await res.json()) as TranscribeResponse;
  return (data.text ?? "").trim();
}

/**
 * 用本机已有的 ChatGPT 登录态把 WAV 发给它自带的转写接口。
 * 请求由主进程用 Chromium 网络栈发（需要桌面客户端的 originator/User-Agent，页面内 fetch 改不了这两项），
 * 令牌仅在本次调用的内存里，不写日志、不写配置、不出本机。
 */
export async function transcribeViaChatgpt(wav: Buffer, language: string): Promise<string> {
  const auths = await resolveAuths(true);
  if (auths.length === 0) throw new Error(t("error.chatgptNotLoggedIn"));
  let lastError: unknown = null;
  // 本机 Codex 的 token 可能失效但文件还在：401 时降级到应用内登录态重试
  for (const auth of auths) {
    try {
      return await post(auth, wav, language);
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || error.message !== t("error.chatgptNotLoggedIn")) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 设置页“测试转写”：传一段极短静音，把真实失败原因（含 HTTP 状态）显示出来 */
export async function testChatgpt(): Promise<{ ok: boolean; detail: string }> {
  const auth = await resolveAuth(true);
  if (!auth) return { ok: false, detail: t("error.chatgptNotLoggedIn") };
  try {
    const silence = Buffer.alloc(44 + 8000);
    silence.write("RIFF", 0);
    silence.writeUInt32LE(36 + 8000, 4);
    silence.write("WAVEfmt ", 8);
    silence.writeUInt32LE(16, 16);
    silence.writeUInt16LE(1, 20);
    silence.writeUInt16LE(1, 22);
    silence.writeUInt32LE(16000, 24);
    silence.writeUInt32LE(32000, 28);
    silence.writeUInt16LE(2, 32);
    silence.writeUInt16LE(16, 34);
    silence.write("data", 36);
    silence.writeUInt32LE(8000, 40);
    await post(auth, silence, "");
    return { ok: true, detail: auth.source === "codex" ? "Codex" : "ChatGPT" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
