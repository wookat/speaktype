import { polishText } from "@/lib/polish";
import { getSettings } from "@/lib/settings";
import type { BgToOffscreen, BgToUi, OffscreenToBg, RecorderState, UiToBg } from "@/lib/types";

const OFFSCREEN_PATH = "offscreen.html";

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

  function setState(next: RecorderState, message?: string) {
    state = next;
    toUi({ type: "state", state: next, message });
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

  browser.runtime.onMessage.addListener((raw, sender) => {
    const msg = raw as UiToBg | OffscreenToBg;

    if ("target" in msg && msg.target === "background") {
      if (msg.type === "state") setState(msg.state, msg.message);
      else if (msg.type === "partial") toUi({ type: "partial", text: msg.text });
      else if (msg.type === "level") toUi({ type: "level", value: msg.value });
      else if (msg.type === "transcript") void handleTranscript(msg.text);
      return;
    }

    const ui = msg as UiToBg;
    if (ui.type === "start-record") {
      const tabId = sender.tab?.id;
      if (tabId != null) void startRecording(tabId, ui.selectionText);
    } else if (ui.type === "stop-record") {
      toOffscreen({ target: "offscreen", type: "stop" });
    } else if (ui.type === "cancel-record") {
      toOffscreen({ target: "offscreen", type: "cancel" });
    } else if (ui.type === "get-state") {
      return Promise.resolve({ state });
    }
    return undefined;
  });

  // 全局快捷键：转发给当前标签页的悬浮条，由它决定开始还是停止
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-record") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    await browser.tabs.sendMessage(tab.id, { type: "hotkey-toggle" } satisfies BgToUi).catch(() => {});
  });
});
