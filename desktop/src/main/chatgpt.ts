import type { BrowserWindow } from "electron";
import { t } from "./i18n";
import { createChatgptWindow } from "./windows";

let bridge: BrowserWindow | null = null;
let loaded = false;

/** 抢跑：热键按下即把 chatgpt.com 拉起来，松手时登录态与 Cloudflare 校验已就绪 */
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

/** 让用户在应用内登录 ChatGPT */
export function showChatgptLogin(): void {
  const win = ensureChatgptBridge();
  win.show();
  win.focus();
}

/** 页面内取一次会话态，判断是否已登录（token 只留在本机页面上下文里） */
export async function chatgptLoggedIn(): Promise<boolean> {
  if (!bridge || bridge.isDestroyed() || !loaded) return false;
  try {
    return await bridge.webContents.executeJavaScript(
      `fetch("/api/auth/session", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => Boolean(d && d.accessToken))
        .catch(() => false)`,
    );
  } catch {
    return false;
  }
}

/**
 * 在已登录的 chatgpt.com 页面里把 WAV 发给它自己的转写接口。
 * 走站内 fetch 而不是主进程 fetch：Cookie、cf_clearance 与浏览器指纹都天然带上，
 * 访问令牌始终留在页面上下文，不经过我们的存储。
 */
export async function transcribeViaChatgpt(wav: Buffer): Promise<string> {
  const win = ensureChatgptBridge();
  for (let i = 0; i < 100 && !loaded; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!loaded) throw new Error(t("error.chatgptNotReady"));

  const base64 = wav.toString("base64");
  const result = (await win.webContents.executeJavaScript(
    `(async () => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
      const session = await fetch("/api/auth/session", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!session || !session.accessToken) return { error: "unauthorized" };
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "audio/wav" }), "speech.wav");
      const res = await fetch("/backend-api/transcribe", {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: "Bearer " + session.accessToken,
          ...(session.account && session.account.id
            ? { "chatgpt-account-id": session.account.id }
            : {}),
        },
        body: form,
      });
      if (!res.ok) return { error: "http " + res.status + " " + (await res.text()).slice(0, 160) };
      const data = await res.json().catch(() => null);
      return { text: data && typeof data.text === "string" ? data.text : "" };
    })()`,
  )) as { text?: string; error?: string };

  if (result.error === "unauthorized") throw new Error(t("error.chatgptNotLoggedIn"));
  if (result.error) throw new Error(`ChatGPT ASR ${result.error}`);
  return (result.text ?? "").trim();
}
