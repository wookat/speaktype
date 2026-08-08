import type { ToBridge } from "@/lib/asr/doubao/messages";
import { polishText } from "@/lib/polish";
import { getSettings } from "@/lib/settings";
import type {
  BgToOffscreen,
  BgToUi,
  FixAction,
  OffscreenToBg,
  RecorderState,
  UiToBg,
} from "@/lib/types";

const OFFSCREEN_PATH = "offscreen.html";
const DOUBAO_TAB_URL = "https://www.doubao.com/chat/";

export default defineBackground(() => {
  let activeTabId: number | null = null;
  let selectionText = "";
  let state: RecorderState = "idle";
  let creatingOffscreen: Promise<unknown> | null = null;

  async function ensureOffscreen(): Promise<void> {
    const contexts = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (contexts.length > 0) return;
    if (!creatingOffscreen) {
      creatingOffscreen = browser.offscreen
        .createDocument({
          url: OFFSCREEN_PATH,
          reasons: ["USER_MEDIA"],
          justification: "采集麦克风音频用于语音输入转写",
        })
        .finally(() => {
          creatingOffscreen = null;
        });
    }
    await creatingOffscreen;
  }

  function toOffscreen(msg: BgToOffscreen) {
    void browser.runtime.sendMessage(msg).catch(() => {});
  }

  function toUi(msg: BgToUi, tabId = activeTabId) {
    if (tabId == null) return;
    void browser.tabs.sendMessage(tabId, msg).catch(() => {});
  }

  function setState(next: RecorderState, message?: string, action?: FixAction) {
    state = next;
    toUi({ type: "state", state: next, message, action });
  }

  /** 错误提示上的一键修复：授权麦克风 / 去豆包页面激活登录态 */
  async function runFix(action: FixAction) {
    const url =
      action === "grant-mic" ? browser.runtime.getURL("/permission.html") : DOUBAO_TAB_URL;
    await browser.tabs.create({ url, active: true });
  }

  async function startRecording(tabId: number, selection: string) {
    activeTabId = tabId;
    selectionText = selection;
    const settings = await getSettings();
    await ensureOffscreen();
    toOffscreen({ target: "offscreen", type: "start", settings, selectionText });
  }

  async function handleTranscript(transcript: string) {
    if (!transcript) {
      toUi({ type: "final", text: "", transcript: "" });
      setState("idle");
      return;
    }
    const settings = await getSettings();
    const text = await polishText(settings, transcript, selectionText);
    toUi({ type: "final", text, transcript });
    setState("idle");
  }

  // 豆包 provider 的 WebSocket 必须开在 doubao.com 页面内（要带其登录态），
  // 所以这里维持一个后台标签页，并把 offscreen 的帧转发给页面里的桥接脚本。
  let bridgeTabId: number | null = null;
  let bridgeQueue: Promise<unknown> = Promise.resolve();

  async function waitForLoad(tabId: number) {
    await new Promise<void>((resolve) => {
      const onUpdated = (updatedId: number, info: { status?: string }) => {
        if (updatedId === tabId && info.status === "complete") {
          browser.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(onUpdated);
      setTimeout(resolve, 15000);
    });
    // 等 content script 注入完成
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async function bridgeAlive(tabId: number): Promise<boolean> {
    const reply = await browser.tabs
      .sendMessage(tabId, { target: "doubao-bridge", type: "ping" } satisfies ToBridge)
      .catch(() => null);
    return Boolean(reply);
  }

  async function ensureBridgeTab(): Promise<number> {
    const candidate =
      bridgeTabId != null ? ((await browser.tabs.get(bridgeTabId).catch(() => null))?.id ?? null) : null;
    const existing = candidate ?? (await browser.tabs.query({ url: "*://*.doubao.com/*" }))[0]?.id ?? null;

    if (existing != null) {
      // 扩展重载后旧标签页里的 content script 已失效，重载一次把它拉回来
      if (await bridgeAlive(existing)) {
        bridgeTabId = existing;
        return existing;
      }
      await browser.tabs.reload(existing);
      await waitForLoad(existing);
      if (await bridgeAlive(existing)) {
        bridgeTabId = existing;
        return existing;
      }
    }

    const created = await browser.tabs.create({ url: DOUBAO_TAB_URL, active: false, pinned: true });
    if (created.id == null) throw new Error("无法打开 doubao.com 标签页");
    await waitForLoad(created.id);
    if (!(await bridgeAlive(created.id))) {
      throw new Error("doubao.com 标签页里的桥接未就绪，请确认能正常打开 doubao.com 并已登录");
    }
    bridgeTabId = created.id;
    return created.id;
  }

  function forwardToBridge(msg: ToBridge) {
    bridgeQueue = bridgeQueue
      .then(async () => {
        const tabId = await ensureBridgeTab();
        await browser.tabs.sendMessage(tabId, msg);
      })
      .catch((error: unknown) => {
        bridgeTabId = null;
        // 失败必须冒泡到 offscreen，否则 UI 会死在「准备中」
        void browser.runtime
          .sendMessage({
            target: "doubao-client",
            type: "error",
            message: error instanceof Error ? error.message : "豆包桥接不可用",
          })
          .catch(() => {});
      });
  }

  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const msg = raw as UiToBg | OffscreenToBg | ToBridge;

    if ("target" in msg && msg.target === "doubao-bridge") {
      forwardToBridge(msg);
      return;
    }

    if ("target" in msg && msg.target === "background") {
      if (msg.type === "state") setState(msg.state, msg.message, msg.action);
      else if (msg.type === "partial") toUi({ type: "partial", text: msg.text });
      else if (msg.type === "level") toUi({ type: "level", value: msg.value });
      else if (msg.type === "transcript") void handleTranscript(msg.text);
      return;
    }

    const ui = msg as UiToBg;
    if (ui.type === "start-record") {
      const tabId = sender.tab?.id;
      // 失败（多半是 offscreen 建不起来）必须冒泡，否则点了「说话」毫无反应
      if (tabId != null) {
        void startRecording(tabId, ui.selectionText).catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          setState("error", `启动录音失败：${reason}`);
        });
      }
    } else if (ui.type === "stop-record") {
      toOffscreen({ target: "offscreen", type: "stop" });
    } else if (ui.type === "cancel-record") {
      toOffscreen({ target: "offscreen", type: "cancel" });
    } else if (ui.type === "run-fix") {
      void runFix(ui.action);
    } else if (ui.type === "get-state") {
      // 原生 chrome 会丢弃返回的 Promise，必须 sendResponse
      sendResponse({ state });
      return true;
    }
    return undefined;
  });

  // 装完就把麦克风授权做掉，别等用户第一次说话时撞一句 not-allowed
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") void runFix("grant-mic");
  });

  // 全局快捷键：转发给当前标签页的悬浮条，由它决定开始还是停止
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-record") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    await browser.tabs.sendMessage(tab.id, { type: "hotkey-toggle" } satisfies BgToUi).catch(() => {});
  });
});
