import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type { RecordState, StatusPayload } from "../shared/types";
import { ensureBridge, hasAppKey, startDoubaoSession, type DoubaoSession } from "./doubao";
import { pasteText } from "./paste";
import { polishText } from "./polish";
import { addHistory, addStats, findPersona, getSettings } from "./store";

/** 握手期先开麦并缓冲音频（200ms/帧，封顶约 30s），连上再补发，冷启动第一句才不丢字 */
const MAX_BUFFERED_FRAMES = 150;
const WARM_UP_COOLDOWN_MS = 5000;

export interface DictationDeps {
  recorder: () => BrowserWindow | null;
  broadcast: (payload: StatusPayload) => void;
  showToast: (title: string, body: string) => void;
}

export class Dictation {
  private state: RecordState = "idle";
  private message = "";
  private partial = "";
  private session: DoubaoSession | null = null;
  private buffered: Int16Array[] = [];
  private busy = false;
  private pendingEnd: "stop" | "cancel" | null = null;
  private startedAt = 0;
  private lastWarmUp = 0;

  constructor(private deps: DictationDeps) {}

  status(): StatusPayload {
    const settings = getSettings();
    return {
      state: this.state,
      message: this.message,
      partial: this.partial,
      personaName: findPersona(settings.personaId).name,
      hotkeyHold: settings.hotkeyHold,
    };
  }

  isRecording(): boolean {
    return this.state === "recording" || this.state === "connecting";
  }

  /** 抢跑建联：热键按下的瞬间调用，把慢路径提前拉起来 */
  warmUp(): void {
    const now = Date.now();
    if (now - this.lastWarmUp < WARM_UP_COOLDOWN_MS) return;
    this.lastWarmUp = now;
    if (hasAppKey()) ensureBridge();
  }

  private report(state: RecordState, message = ""): void {
    this.state = state;
    this.message = message;
    this.deps.broadcast(this.status());
  }

  private setPartial(text: string): void {
    this.partial = text;
    this.deps.broadcast(this.status());
  }

  pushPcm(frame: Int16Array): void {
    if (this.session) this.session.pushPcm(frame);
    else if (this.buffered.length < MAX_BUFFERED_FRAMES) this.buffered.push(frame);
  }

  async start(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.pendingEnd = null;
    this.partial = "";
    this.buffered = [];
    this.startedAt = Date.now();
    const settings = getSettings();

    try {
      this.report("connecting");
      const opening = startDoubaoSession(settings.language, (text) => this.setPartial(text));
      opening.catch(() => undefined); // 录音就绪前失败时避免 unhandledrejection

      // 麦克风先开、连接后建：握手期的话音先缓冲，连上补发
      this.deps.recorder()?.webContents.send("recorder:start");
      this.report("recording");

      this.session = await opening;
      for (const frame of this.buffered) this.session.pushPcm(frame);
      this.buffered = [];
      if (await this.flushPendingEnd()) return;
      this.report("recording");
    } catch (error) {
      this.busy = false;
      this.pendingEnd = null;
      this.session = null;
      this.deps.recorder()?.webContents.send("recorder:stop");
      this.report("error", error instanceof Error ? error.message : String(error));
    }
  }

  async stop(): Promise<void> {
    if (!this.busy) return;
    if (!this.session) {
      this.pendingEnd = "stop";
      return;
    }
    await this.finalize();
  }

  cancel(): void {
    if (!this.busy) return;
    if (!this.session) {
      this.pendingEnd = "cancel";
      return;
    }
    this.session.cancel();
    this.session = null;
    this.busy = false;
    this.buffered = [];
    this.deps.recorder()?.webContents.send("recorder:stop");
    this.partial = "";
    this.report("idle");
  }

  /** 连接建立期间用户已经松手/取消：连上后立刻按当时的意图收尾 */
  private async flushPendingEnd(): Promise<boolean> {
    if (this.pendingEnd === "stop") {
      this.pendingEnd = null;
      await this.finalize();
      return true;
    }
    if (this.pendingEnd === "cancel") {
      this.pendingEnd = null;
      this.cancel();
      return true;
    }
    return false;
  }

  private async finalize(): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.session = null;
    const settings = getSettings();
    const persona = findPersona(settings.personaId);
    const durationMs = Date.now() - this.startedAt;

    this.deps.recorder()?.webContents.send("recorder:stop");
    this.report("transcribing");

    let raw = "";
    try {
      raw = await session.finish();
    } catch (error) {
      this.busy = false;
      this.report("error", error instanceof Error ? error.message : String(error));
      return;
    }

    if (durationMs < settings.minRecordMs || !raw) {
      this.busy = false;
      this.partial = "";
      this.report("idle");
      if (!raw) this.deps.showToast("没听清", "这次没识别到内容，再说一次试试");
      return;
    }

    this.report("polishing");
    const text = await polishText(settings, persona, raw);

    let failed: string | undefined;
    if (settings.autoPaste) {
      try {
        await pasteText(text);
      } catch (error) {
        failed = error instanceof Error ? error.message : String(error);
        this.deps.showToast("落字失败，已复制", text.slice(0, 40));
      }
    }

    addHistory({
      id: randomUUID(),
      at: Date.now(),
      text,
      raw,
      personaName: persona.name,
      durationMs,
      failed,
    });
    addStats(text.length, durationMs);

    this.busy = false;
    this.setPartial(text);
    this.report("idle");
    setTimeout(() => {
      if (this.state === "idle") this.setPartial("");
    }, 1200);
  }
}
