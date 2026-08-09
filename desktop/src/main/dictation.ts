import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, clipboard, type BrowserWindow } from "electron";
import log from "electron-log/main.js";
import type { RecordState, StatusPayload } from "../shared/types";
import { localizePersona } from "../shared/personas";
import { pcmToWav, startLocalAsrSession, startOpenAiAsrSession } from "./asr";
import { ensureBridge, hasAppKey, startDoubaoSession, type DoubaoSession } from "./doubao";
import { localModelStatus } from "./localasr";
import { t, translator } from "./i18n";
import { pasteText, toggleSystemMute } from "./paste";
import { polishText } from "./polish";
import { addHistory, addStats, findPersona, getHistory, getSettings, updateHistoryItem } from "./store";

/** 握手期先开麦并缓冲音频（200ms/帧，封顶约 30s），连上再补发，冷启动第一句才不丢字 */
const MAX_BUFFERED_FRAMES = 150;
const WARM_UP_COOLDOWN_MS = 5000;
// 免按模式 VAD：峰值低于该阈值算静音（约 2.7% 满幅），开始后至少录这么久才允许自动结束
const VAD_SILENCE_PEAK = 900;
const VAD_MIN_RECORD_MS = 1500;
// 整段录音峰值低于此值（约 0.8% 满幅）才判定为纯静音丢弃，比 VAD 门限宽松以免误丢真实人声
const NO_SPEECH_PEAK = 250;
// 开口前的宽限：按下后还没检到人声时不按 vadSilenceMs 判停，给用户思考时间，超时才收尾走 noSpeech
const VAD_NO_VOICE_TIMEOUT_MS = 10000;
// 识别失败后音频保留在内存里，限时内再按一次热键可直接重试，不用重新录
const RETRY_WINDOW_MS = 60000;
const RETRY_MAX_FRAMES = 3000; // 约 60s @ 20ms/帧
// 失败会话的音频同时落盘（仅本机），从历史页可随时重试；滚动保留最近 20 段
const FAILED_AUDIO_MAX = 20;

function failedAudioDir(): string {
  return join(app.getPath("userData"), "failed-audio");
}

function saveFailedAudio(id: string, frames: Int16Array[]): string | undefined {
  try {
    mkdirSync(failedAudioDir(), { recursive: true });
    const file = join(failedAudioDir(), `${id}.wav`);
    writeFileSync(file, pcmToWav(frames));
    const all = readdirSync(failedAudioDir())
      .filter((f) => f.endsWith(".wav"))
      .map((f) => ({ f, at: statSync(join(failedAudioDir(), f)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    for (const old of all.slice(FAILED_AUDIO_MAX)) rmSync(join(failedAudioDir(), old.f), { force: true });
    return file;
  } catch (error) {
    log.warn("saveFailedAudio failed", error);
    return undefined;
  }
}

function wavToFrames(file: string): Int16Array[] {
  const buf = readFileSync(file);
  const data = buf.subarray(44);
  // 拷贝一份保证 2 字节对齐（Buffer 池的 byteOffset 可能是奇数）
  const copy = new Uint8Array(data.length - (data.length % 2));
  copy.set(data.subarray(0, copy.length));
  return [new Int16Array(copy.buffer, 0, copy.length / 2)];
}

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
  private muted = false;
  private mode: "hold" | "toggle" = "hold";
  private lastVoiceAt = 0;
  private maxPeak = 0;
  private allFrames: Int16Array[] = [];
  private lastFailed: {
    frames: Int16Array[];
    durationMs: number;
    maxPeak: number;
    at: number;
    historyId?: string;
  } | null = null;

  constructor(private deps: DictationDeps) {}

  status(): StatusPayload {
    const settings = getSettings();
    return {
      state: this.state,
      message: this.message,
      partial: this.partial,
      personaName: localizePersona(findPersona(settings.personaId), translator()).name,
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
    if (getSettings().asrProvider === "doubao" && hasAppKey()) ensureBridge();
  }

  private report(state: RecordState, message = ""): void {
    this.state = state;
    this.message = message;
    this.deps.broadcast(this.status());
    if (state === "error") {
      // 可重试的失败多给些时间让用户读完提示并按键重试
      const linger = this.lastFailed ? 15000 : 5000;
      setTimeout(() => {
        if (this.state === "error") {
          this.partial = "";
          this.report("idle");
        }
      }, linger);
    }
  }

  private setPartial(text: string): void {
    this.partial = text;
    this.deps.broadcast(this.status());
  }

  pushPcm(frame: Int16Array): void {
    if (this.session) this.session.pushPcm(frame);
    else if (this.buffered.length < MAX_BUFFERED_FRAMES) this.buffered.push(frame);
    if (this.allFrames.length < RETRY_MAX_FRAMES) this.allFrames.push(frame);
    this.checkAutoStop(frame);
  }

  /** 免按模式：说完后持续静音自动结束，不用再按一次 */
  private checkAutoStop(frame: Int16Array): void {
    let peak = 0;
    for (const v of frame) {
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    if (peak > this.maxPeak) this.maxPeak = peak;
    const now = Date.now();
    const voiced = peak >= VAD_SILENCE_PEAK;
    if (voiced) this.lastVoiceAt = now;
    if (this.mode !== "toggle" || this.state !== "recording" || !this.session) return;
    if (voiced) return;
    const settings = getSettings();
    if (!settings.vadAutoStop) return;
    if (now - this.startedAt < VAD_MIN_RECORD_MS) return;
    // 静音倒计时只在检到过人声后才按 vadSilenceMs 判停；开口前给更长宽限
    const silenceMs = this.maxPeak >= VAD_SILENCE_PEAK ? settings.vadSilenceMs : VAD_NO_VOICE_TIMEOUT_MS;
    if (this.lastVoiceAt && now - this.lastVoiceAt >= silenceMs) void this.stop();
  }

  async start(mode: "hold" | "toggle" = "hold"): Promise<void> {
    if (this.busy) return;
    if (this.state === "error" && (await this.retryLast())) return;
    this.busy = true;
    this.mode = mode;
    this.pendingEnd = null;
    this.partial = "";
    this.buffered = [];
    this.allFrames = [];
    this.startedAt = Date.now();
    this.lastVoiceAt = Date.now();
    this.maxPeak = 0;
    const settings = getSettings();

    try {
      this.report("connecting");
      if (settings.asrProvider === "openai" && (!settings.asrBaseUrl || !settings.asrApiKey)) {
        throw new Error(t("error.noAsrConfig"));
      }
      if (settings.asrProvider === "local" && !localModelStatus(settings.localModel || "base-q5_1").downloaded) {
        throw new Error(t("error.localModelMissing"));
      }
      if (settings.muteWhileRecording && !this.muted) {
        this.muted = true;
        toggleSystemMute();
      }
      const opening: Promise<DoubaoSession> =
        settings.asrProvider === "openai"
          ? Promise.resolve(startOpenAiAsrSession(settings))
          : settings.asrProvider === "local"
            ? Promise.resolve(startLocalAsrSession(settings))
            : startDoubaoSession(settings.language, (text) => this.setPartial(text));
      opening.catch(() => undefined); // 录音就绪前失败时避免 unhandledrejection

      // 麦克风先开、连接后建：握手期的话音先缓冲，连上补发
      this.deps.recorder()?.webContents.send("recorder:start", { deviceId: settings.micDeviceId });
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
      this.unmute();
      this.report("error", error instanceof Error ? error.message : String(error));
    }
  }

  private unmute(): void {
    if (!this.muted) return;
    this.muted = false;
    toggleSystemMute();
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
    this.unmute();
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

  /** 错误态下再按一次热键：用保留的音频重走识别管线，不重新录音 */
  private async retryLast(): Promise<boolean> {
    const failed = this.lastFailed;
    if (!failed || Date.now() - failed.at > RETRY_WINDOW_MS || failed.frames.length === 0) return false;
    this.busy = true;
    this.partial = "";
    const settings = getSettings();
    try {
      this.report("connecting");
      const session =
        settings.asrProvider === "openai"
          ? startOpenAiAsrSession(settings)
          : settings.asrProvider === "local"
            ? startLocalAsrSession(settings)
            : await startDoubaoSession(settings.language, (text) => this.setPartial(text));
      for (const frame of failed.frames) session.pushPcm(frame);
      this.session = session;
      this.startedAt = Date.now() - failed.durationMs;
      this.maxPeak = failed.maxPeak;
      this.allFrames = failed.frames;
      await this.finalize();
    } catch (error) {
      this.busy = false;
      this.session = null;
      this.report("error", error instanceof Error ? error.message : String(error));
    }
    return true;
  }

  private resolveFailedEntry(id: string, text: string, raw: string): void {
    const entry = getHistory().find((h) => h.id === id);
    if (entry?.audioFile && existsSync(entry.audioFile)) rmSync(entry.audioFile, { force: true });
    updateHistoryItem(id, { text, raw, at: Date.now(), status: undefined, error: undefined, audioFile: undefined });
  }

  /** 历史页的失败条目重试：读回落盘音频重跑识别+润色，成功后原地更新并复制到剪贴板 */
  async retryHistory(id: string): Promise<{ ok: boolean; detail: string }> {
    if (this.busy) return { ok: false, detail: "busy" };
    const entry = getHistory().find((h) => h.id === id);
    if (!entry || entry.status !== "failed" || !entry.audioFile || !existsSync(entry.audioFile)) {
      return { ok: false, detail: t("history.retryGone") };
    }
    const settings = getSettings();
    const persona = localizePersona(findPersona(settings.personaId), translator());
    try {
      const session =
        settings.asrProvider === "openai"
          ? startOpenAiAsrSession(settings)
          : settings.asrProvider === "local"
            ? startLocalAsrSession(settings)
            : await startDoubaoSession(settings.language, () => undefined);
      for (const frame of wavToFrames(entry.audioFile)) session.pushPcm(frame);
      const raw = await session.finish();
      if (!raw) return { ok: false, detail: t("toast.noSpeech") };
      const text = await polishText(settings, persona, raw);
      this.resolveFailedEntry(id, text, raw);
      addStats(text.length, entry.durationMs);
      clipboard.writeText(text);
      this.deps.showToast(t("history.retryDone"), text.slice(0, 60));
      return { ok: true, detail: text };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private async finalize(): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.session = null;
    const settings = getSettings();
    const persona = localizePersona(findPersona(settings.personaId), translator());
    const durationMs = Date.now() - this.startedAt;

    this.deps.recorder()?.webContents.send("recorder:stop");
    this.unmute();

    // 整段录音接近数字静音：不白耗一次识别调用，也避免 ASR 对噪声幻听落字
    log.info(`dictation finalize: durationMs=${durationMs} maxPeak=${this.maxPeak}`);
    if (this.maxPeak < NO_SPEECH_PEAK) {
      session.cancel();
      this.busy = false;
      this.partial = "";
      this.report("idle");
      this.deps.showToast(t("toast.noSpeech"), t("toast.noSpeechBody"));
      return;
    }

    this.report("transcribing");

    let raw = "";
    try {
      raw = await session.finish();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const id = randomUUID();
      const audioFile = saveFailedAudio(id, this.allFrames);
      addHistory({
        id,
        at: Date.now(),
        text: "",
        raw: "",
        personaName: persona.name,
        durationMs,
        status: "failed",
        error: message,
        audioFile,
      });
      this.lastFailed = { frames: this.allFrames, durationMs, maxPeak: this.maxPeak, at: Date.now(), historyId: id };
      this.busy = false;
      this.report("error", `${message} · ${t("error.retryHint")}`);
      return;
    }
    // 本次是热键重试且成功：把之前的失败条目原地升级，后面 addHistory 前先清掉
    const retriedId = this.lastFailed?.historyId;
    this.lastFailed = null;

    if (durationMs < settings.minRecordMs || !raw) {
      this.busy = false;
      this.partial = "";
      this.report("idle");
      if (!raw) this.deps.showToast(t("toast.noSpeech"), t("toast.noSpeechBody"));
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
        this.deps.showToast(t("toast.pasteFailed"), text.slice(0, 40));
      }
    }

    if (retriedId) this.resolveFailedEntry(retriedId, text, raw);
    else
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
