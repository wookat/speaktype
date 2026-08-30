import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, clipboard, globalShortcut } from "electron";
import { blockEscape, unblockEscape } from "./escblock";
import log from "electron-log/main.js";
import type { RecordState, StatusPayload } from "../shared/types";
import { localizePersona } from "../shared/personas";
import { foregroundPid, foregroundWindowKey, hasPasteTarget, isTerminalForeground, personaForActiveApp } from "./activeapp";
import {
  pcmToWav,
  preconnectAsr,
  startChatgptAsrSession,
  startLocalAsrSession,
  startOpenAiAsrSession,
} from "./asr";
import { warmChatgpt } from "./chatgpt";
import { ensureBridge, hasAppKey, startDoubaoSession, type DoubaoSession } from "./doubao";
import { isSherpaModel, localModelStatus, prewarmSherpa } from "./localasr";
import { t, translator } from "./i18n";
import { muteForRecording, unmuteAfterRecording } from "./mute";
import { copySelection, pasteText, sendBackspaces } from "./paste";
import { deformatForTerminal, polishText, rewriteSelection } from "./polish";
import { SileroVad } from "./vad";
import { addHistory, addStats, countWords, findPersona, getHistory, getSettings, setSettings, updateHistoryItem } from "./store";
import { watchPastedText, type Diff } from "./watchedit";

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
// 免按模式连续这么多轮无人声（每轮约 10s）自动退出，避免忘关后麦克风常开；
// 关掉 vadAutoStop 时用更宽松的绝对上限（约 5 分钟）兜底，长停顿不被踢但不至于彻底不设防
const HANDS_FREE_MAX_SILENT_ROUNDS = 6;
const HANDS_FREE_MAX_SILENT_ROUNDS_NO_VAD = 30;
// 免按模式单段上限：超过软上限后遇到第一个非人声帧就分段落字，硬上限即使一直有人声也强制分段，
// 避免连续说话「一段到底」——中途崩溃全丢、实时字幕 20s 后也不再更新
const HANDS_FREE_SOFT_SEGMENT_MS = 50000;
const HANDS_FREE_HARD_SEGMENT_MS = 75000;
// 防幻听：整段录音里有声时长（按 20ms 子窗口统计 peak≥900）不足门槛时视为无有效人声，不送 ASR
const VOICED_WINDOW_SAMPLES = 320; // 20ms @ 16kHz
const MIN_VOICED_MS = 100; // 人话最短音节 >100ms；短哔声跨窗量化最多计到 ~60ms，不会擦线
// 按住说话模式：上一句落字后短间隔内的下一句视为同一段落，拉丁字母/数字开头时补句间空格
const HOLD_GLUE_WINDOW_MS = 15000;
// 免按句间空档（转写/落字/重启窗口）的帧暂存上限（按采样数计）：空档通常 <2s，5s 足够且不膨胀
const HANDS_FREE_CARRY_MAX_SAMPLES = 5 * 16000;
/**
 * 免按语音命令词表（默认关）：整条 finalize 去尾标点后精确匹配才触发，
 * 嵌入句中照常落字。仅启用已实测 ASR 输出稳定的 zh/en 词表。
 */
type VoiceCommand = "newline" | "paragraph" | "deleteLast";
const VOICE_COMMANDS: ReadonlyArray<{ cmd: VoiceCommand; words: readonly string[] }> = [
  { cmd: "newline", words: ["换行", "換行", "new line", "newline", "line break"] },
  { cmd: "paragraph", words: ["另起一段", "new paragraph"] },
  { cmd: "deleteLast", words: ["删除上一句", "刪除上一句", "delete last sentence"] },
];

function matchVoiceCommand(part: string): VoiceCommand | null {
  const normalized = part.trim().replace(/[。．.!?！？，,\s]+$/u, "").toLowerCase();
  if (!normalized) return null;
  for (const { cmd, words } of VOICE_COMMANDS) if (words.includes(normalized)) return cmd;
  return null;
}

/** 整条文本全部由命令词组成才算命令（按句号切分逐段匹配），否则视为普通听写 */
function parseVoiceCommands(text: string): VoiceCommand[] | null {
  const parts = text.split(/[。．.!?！？]/u).filter((p) => p.trim().length > 0);
  if (parts.length === 0) return null;
  const cmds: VoiceCommand[] = [];
  for (const part of parts) {
    const cmd = matchVoiceCommand(part);
    if (!cmd) return null;
    cmds.push(cmd);
  }
  return cmds;
}
// 识别失败后音频保留在内存里，限时内再按一次热键可直接重试，不用重新录
const RETRY_WINDOW_MS = 60000;
const RETRY_MAX_FRAMES = 3000; // 约 60s @ 20ms/帧
// 失败会话的音频同时落盘（仅本机），从历史页可随时重试；滚动保留最近 20 段，额外受 7 天 / 50MB 上限约束
const FAILED_AUDIO_MAX = 20;
const FAILED_AUDIO_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const FAILED_AUDIO_MAX_BYTES = 50 * 1024 * 1024;

/** 网络层原始错误串（fetch failed/ECONNREFUSED 等）对用户无意义，映射成可行动的人话 */
function humanizeAsrError(message: string): string {
  return /fetch failed|ENOTFOUND|ETIMEDOUT|ECONN|EAI_AGAIN|EPIPE|socket hang up|network error/i.test(message)
    ? t("error.asrNetwork")
    : message;
}

/**
 * 前台是自家窗口时，Win32 焦点探测不可靠（Chromium 的 hwndFocus 恒为顶层 HWND），
 * 改为直接问渲染进程 document.activeElement 是否可输入控件。前台非本进程时不干预。
 */
async function selfWindowPasteable(): Promise<boolean> {
  if (process.platform === "darwin" || foregroundPid() !== process.pid) return true;
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return false;
  try {
    return await win.webContents.executeJavaScript(
      "(() => { const e = document.activeElement; " +
        "return !!e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.isContentEditable); })()",
    );
  } catch {
    return true;
  }
}

function failedAudioDir(): string {
  return join(app.getPath("userData"), "failed-audio");
}

/** 保留策略：最多 20 段、最长 7 天、总大小不超 50MB，超出从最旧开始删 */
function pruneFailedAudio(): void {
  const all = readdirSync(failedAudioDir())
    .filter((f) => f.endsWith(".wav"))
    .map((f) => {
      const st = statSync(join(failedAudioDir(), f));
      return { f, at: st.mtimeMs, size: st.size };
    })
    .sort((a, b) => b.at - a.at);
  const now = Date.now();
  let bytes = 0;
  all.forEach((item, i) => {
    if (i >= FAILED_AUDIO_MAX || now - item.at > FAILED_AUDIO_MAX_AGE_MS || bytes + item.size > FAILED_AUDIO_MAX_BYTES) {
      rmSync(join(failedAudioDir(), item.f), { force: true });
    } else {
      bytes += item.size;
    }
  });
}

/** 清空历史时一并删掉落盘的失败录音 */
export function clearFailedAudio(): void {
  rmSync(failedAudioDir(), { recursive: true, force: true });
}

function saveFailedAudio(id: string, frames: Int16Array[]): string | undefined {
  if (!getSettings().keepFailedAudio) return undefined;
  try {
    mkdirSync(failedAudioDir(), { recursive: true });
    const file = join(failedAudioDir(), `${id}.wav`);
    writeFileSync(file, pcmToWav(frames));
    pruneFailedAudio();
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
  showToast: (
    title: string,
    body: string,
    action?: { label: string; run: () => void },
    durationMs?: number,
  ) => void;
  /** 主进程直改了 settings/历史后推给渲染层，让词典/历史页立即刷新 */
  pushSettings: () => void;
  /** 打开设置页并定位 tab：润色模型在 "model"，ASR/语音识别配置在 "voice" */
  openModelSettings: (tab?: "model" | "voice") => void;
}

export class Dictation {
  private state: RecordState = "idle";
  private message = "";
  private partial = "";
  private session: DoubaoSession | null = null;
  /** 转写阶段（finish 进行中）的会话：Esc 取消时由此中断上传/丢弃结果 */
  private finishing: DoubaoSession | null = null;
  private finishCancelled = false;
  private buffered: Int16Array[] = [];
  private busy = false;
  private pendingEnd: "stop" | "cancel" | null = null;
  private startedAt = 0;
  /** 本次录音起手时前台应用命中的人设；录完再读窗口就已经切走了，必须在按下时取 */
  private appPersonaId: string | null = null;
  private lastWarmUp = 0;
  private muted = false;
  private mode: "hold" | "toggle" = "hold";
  /** 免按模式：一句落字后自动继续聆听，直到用户再按一次或长时间无人声 */
  private handsFree = false;
  private handsFreeSilentRounds = 0;
  /** 本次免按会话内已落过字：后续句子若以拉丁字母/数字开头需补一个空格分隔 */
  private handsFreeTyped = false;
  /** 免按被其他热键结束：本次收尾的静音分支不再叠加「没听清」toast 覆盖退出提示 */
  private handsFreeEndedByKey = false;
  /** 免按句间空档到达的帧：下一句起手时补喂，语音中途切换会话不丢字 */
  private handsFreeCarry: Int16Array[] = [];
  private handsFreeCarrySamples = 0;
  /** finalize 进行中（转写/落字阶段）：此时到达的帧必须进 carry 而非 buffered，否则下一句 start 会整批丢弃 */
  private finalizing = false;
  /** hold 模式上一次落字时间，用于短间隔连续口述的句间空格 */
  private lastHoldPasteAt = 0;
  /** hold 模式上一次落字的前台窗口标识：切窗后新位置应顶格，不补句间空格 */
  private lastHoldPasteWin: string | null = null;
  /** 免按最近一次成功落字的完整文本（含 glue）：语音命令「删除上一句」按它回退 */
  private lastHandsFreePasted = "";
  private lastVoiceAt = 0;
  /** 本句首个有声帧时刻：与上一句句尾人声时刻的差即句间停顿时长 */
  private firstVoiceAt = 0;
  /** 免按会话内上一句句尾人声时刻，用于段落停顿判定 */
  private prevVoiceEndAt = 0;
  private maxPeak = 0;
  private voicedMs = 0;
  private silero: SileroVad | null = null;
  /** 改写模式：按下改写键时抓到的选区文字，本次口述当作改写指令 */
  private rewriteTarget: string | null = null;
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
      appPersonaName: this.appPersonaId
        ? localizePersona(findPersona(this.appPersonaId), translator()).name
        : undefined,
      hotkeyHold: settings.hotkeyHold,
    };
  }

  isRecording(): boolean {
    return this.state === "recording" || this.state === "connecting";
  }

  /** 听写会话是否占用中：从 start 到落字/失败为止（含转写、润色），此间不能再接新会话 */
  isBusy(): boolean {
    return this.busy;
  }

  /** 抢跑建联：热键按下的瞬间调用，把慢路径提前拉起来 */
  warmUp(): void {
    const now = Date.now();
    if (now - this.lastWarmUp < WARM_UP_COOLDOWN_MS) return;
    this.lastWarmUp = now;
    const settings = getSettings();
    if (settings.asrProvider === "doubao" && hasAppKey()) ensureBridge();
    if (settings.asrProvider === "openai") preconnectAsr(settings);
    if (settings.asrProvider === "chatgpt") warmChatgpt();
  }

  private report(state: RecordState, message = ""): void {
    this.state = state;
    this.message = message;
    if (state === "idle" || state === "error") this.releaseEscape();
    else this.grabEscape();
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

  /**
   * 录音/转写期间在系统层吞掉 Esc：按住 RightCtrl 时按 Esc 不再弹出 Windows 开始菜单。
   * Windows 上 Ctrl+Esc 是 shell 保留组合，globalShortcut/RegisterHotKey 拦不住，
   * 改用 WH_KEYBOARD_LL 低级钩子（escblock.ts）；其他平台退回 globalShortcut。
   * 回到空闲立即卸载/注销，不影响其他应用的 Esc。
   */
  private escGrabbed = false;

  private grabEscape(): void {
    if (this.escGrabbed) return;
    this.escGrabbed = true;
    if (blockEscape(() => this.cancelByKey())) return;
    for (const acc of ["Escape", "Control+Escape"]) {
      try {
        if (!globalShortcut.register(acc, () => this.cancelByKey())) log.warn(`register ${acc} returned false`);
      } catch (error) {
        log.warn(`register ${acc} failed`, error);
      }
    }
  }

  private releaseEscape(): void {
    if (!this.escGrabbed) return;
    this.escGrabbed = false;
    unblockEscape();
    for (const acc of ["Escape", "Control+Escape"]) globalShortcut.unregister(acc);
  }

  private setPartial(text: string): void {
    // 全程无人声时不上屏 partial：纯静音下 ASR 偶发幻听短词（如「我。」）
    const hadVoice = this.silero ? this.voicedMs > 0 : this.maxPeak >= VAD_SILENCE_PEAK;
    if (text && !hadVoice) return;
    this.partial = text;
    this.deps.broadcast(this.status());
  }

  pushPcm(frame: Int16Array): void {
    // 免按跨句保持采集：句间空档与 finalize（转写/落字）期间到达的帧暂存到 carry，
    // 下一句起手时补喂。finalize 期间 session 已置空，这些帧若走 buffered 会在下一句
    // start 时被整批丢弃——这正是免按短停顿句头丢字（P3-2541）的根因
    if (!this.busy || this.finalizing) {
      if (this.handsFree && this.mode === "toggle") {
        this.handsFreeCarry.push(frame);
        this.handsFreeCarrySamples += frame.length;
        // 空档里到达的人声也算数：否则下一句起手补喂时时间戳失真，慢解码会被误判成段落停顿
        for (let i = 0; i < frame.length; i++) {
          const a = frame[i]! < 0 ? -frame[i]! : frame[i]!;
          if (a >= VAD_SILENCE_PEAK) {
            this.lastVoiceAt = Date.now();
            break;
          }
        }
        while (this.handsFreeCarrySamples > HANDS_FREE_CARRY_MAX_SAMPLES && this.handsFreeCarry.length > 1) {
          this.handsFreeCarrySamples -= this.handsFreeCarry.shift()!.length;
        }
      }
      return;
    }
    if (this.session) this.session.pushPcm(frame);
    else if (this.buffered.length < MAX_BUFFERED_FRAMES) this.buffered.push(frame);
    if (this.allFrames.length < RETRY_MAX_FRAMES) this.allFrames.push(frame);
    this.checkAutoStop(frame);
  }

  /** 免按模式：说完后持续静音自动结束，不用再按一次 */
  private checkAutoStop(frame: Int16Array): void {
    let peak = 0;
    // 按 20ms 子窗口统计有声时长：renderer 送来的 chunk 可能长达几百毫秒，整块取峰值会严重低估短句的有声时长
    let peakVoicedMs = 0;
    for (let off = 0; off < frame.length; off += VOICED_WINDOW_SAMPLES) {
      let winPeak = 0;
      const end = Math.min(off + VOICED_WINDOW_SAMPLES, frame.length);
      for (let i = off; i < end; i++) {
        const a = frame[i]! < 0 ? -frame[i]! : frame[i]!;
        if (a > winPeak) winPeak = a;
      }
      if (winPeak > peak) peak = winPeak;
      if (winPeak >= VAD_SILENCE_PEAK) peakVoicedMs += ((end - off) / 16) | 0;
    }
    if (peak > this.maxPeak) this.maxPeak = peak;
    const now = Date.now();
    // 增强模式下用 Silero 人声概率判有声，否则用峰值门槛
    const sileroMs = this.silero ? this.silero.push(frame) : 0;
    const voiced = this.silero ? sileroMs > 0 : peak >= VAD_SILENCE_PEAK;
    this.voicedMs += this.silero ? sileroMs : peakVoicedMs;
    if (voiced) {
      if (!this.firstVoiceAt) this.firstVoiceAt = now;
      this.lastVoiceAt = now;
    }
    if (this.mode !== "toggle" || this.state !== "recording" || !this.session) return;
    if (this.handsFree) {
      const elapsed = now - this.startedAt;
      if (elapsed >= HANDS_FREE_HARD_SEGMENT_MS || (elapsed >= HANDS_FREE_SOFT_SEGMENT_MS && !voiced)) {
        void this.autoStop();
        return;
      }
    }
    if (voiced) return;
    const settings = getSettings();
    // 免按模式始终按静音分句落字；vadAutoStop 只控制连续静默后是否退出会话
    if (!settings.vadAutoStop && !this.handsFree) return;
    if (now - this.startedAt < VAD_MIN_RECORD_MS) return;
    // 静音倒计时只在检到过人声后才按 vadSilenceMs 判停；开口前给更长宽限
    const hadVoice = this.silero ? this.voicedMs > 0 : this.maxPeak >= VAD_SILENCE_PEAK;
    const silenceMs = hadVoice ? settings.vadSilenceMs : VAD_NO_VOICE_TIMEOUT_MS;
    if (this.lastVoiceAt && now - this.lastVoiceAt >= silenceMs) void this.autoStop();
  }

  /**
   * 改写模式：先抓当前选中的文字，再开录；本次说的话当作改写/翻译指令。
   * 没选中文字或没配润色模型时直接提示，不进入录音。
   */
  async startRewrite(): Promise<void> {
    if (this.busy) return;
    const settings = getSettings();
    if (!settings.polishBaseUrl) {
      this.deps.showToast(t("toast.rewriteNoModel"), t("toast.rewriteNoModelBody"));
      this.deps.openModelSettings();
      return;
    }
    const selection = await copySelection();
    if (!selection.trim()) {
      this.deps.showToast(t("toast.rewriteNoSelection"), t("toast.rewriteNoSelectionBody"));
      return;
    }
    this.rewriteTarget = selection;
    await this.start("hold");
  }

  /** remote=true 时音频由手机端经 remotemic 推流，不开本机麦克风 */
  async start(mode: "hold" | "toggle" = "hold", remote = false): Promise<void> {
    if (this.busy) return;
    if (this.state === "error" && (await this.retryLast())) return;
    // 全新录音：丢弃上一次失败的重试上下文，成功后不得吞掉历史里的失败条目
    this.lastFailed = null;
    this.busy = true;
    this.finalizing = false;
    this.mode = mode;
    this.pendingEnd = null;
    this.partial = "";
    this.buffered = [];
    this.allFrames = [];
    this.startedAt = Date.now();
    // 免按跨句：记下上一句句尾人声时刻，本句首个有声帧与它的差即句间停顿
    this.prevVoiceEndAt = this.handsFree && mode === "toggle" && this.handsFreeTyped ? this.lastVoiceAt : 0;
    this.lastVoiceAt = Date.now();
    this.firstVoiceAt = 0;
    // 改写模式不走人设润色，命中的人设徽标只会误导用户
    this.appPersonaId = this.rewriteTarget ? null : personaForActiveApp(getSettings().appPersonas);
    this.maxPeak = 0;
    this.voicedMs = 0;
    const settings = getSettings();
    this.silero = settings.enhancedVad ? SileroVad.create() : null;
    if (this.handsFree && mode === "toggle" && this.handsFreeCarry.length > 0) {
      const carry = this.handsFreeCarry;
      this.handsFreeCarry = [];
      this.handsFreeCarrySamples = 0;
      for (const frame of carry) this.pushPcm(frame);
    } else {
      this.handsFreeCarry = [];
      this.handsFreeCarrySamples = 0;
    }

    try {
      this.report("connecting");
      if (settings.asrProvider === "openai" && (!settings.asrBaseUrl || !settings.asrApiKey)) {
        throw new Error(t("error.noAsrConfig"));
      }
      if (settings.asrProvider === "local" && !localModelStatus(settings.localModel || "base-q5_1").downloaded) {
        throw new Error(t("error.localModelMissing"));
      }
      // 空闲释放后的冷启动在说话期间完成，不占用首句延迟
      if (settings.asrProvider === "local" && isSherpaModel(settings.localModel)) {
        prewarmSherpa(settings.localModel, settings.language);
      }
      if (settings.muteWhileRecording && !this.muted) {
        this.muted = true;
        muteForRecording();
      }
      const opening = this.createSession(settings, (text) => this.setPartial(text));
      opening.catch(() => undefined); // 录音就绪前失败时避免 unhandledrejection

      // 麦克风先开、连接后建：握手期的话音先缓冲，连上补发
      if (!remote) this.deps.recorder()?.webContents.send("recorder:start", { deviceId: settings.micDeviceId });
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
      const message = error instanceof Error ? error.message : String(error);
      // 配置类失败（未登录/未填 key/模型未下载）只闪状态条用户看不见：补常驻 toast 并直达设置
      const configErrors = [t("error.noAppKey"), t("error.noAsrConfig"), t("error.localModelMissing")];
      if (configErrors.includes(message)) {
        this.deps.showToast(
          t("toast.asrNotConfigured"),
          message,
          { label: t("toast.openSettingsAction"), run: () => this.deps.openModelSettings("voice") },
          12000,
        );
      }
      this.report("error", humanizeAsrError(message));
    }
  }

  /** provider→会话的唯一入口：启动/重试/历史重跑都走这里，避免分支拷贝分叉 */
  private createSession(
    settings: ReturnType<typeof getSettings>,
    onPartial?: (text: string) => void,
  ): Promise<DoubaoSession> {
    switch (settings.asrProvider) {
      case "openai":
        return Promise.resolve(startOpenAiAsrSession(settings));
      case "chatgpt":
        return Promise.resolve(startChatgptAsrSession(settings));
      case "local":
        return Promise.resolve(startLocalAsrSession(settings, onPartial));
      default:
        return startDoubaoSession(settings.language, onPartial ?? (() => undefined));
    }
  }

  private unmute(): void {
    if (!this.muted) return;
    this.muted = false;
    unmuteAfterRecording();
  }

  /** 免按模式热键：未录音则进入连续聆听，录音中/聆听中则退出 */
  toggleHandsFree(): void {
    if (this.busy || this.handsFree) {
      const wasHandsFree = this.handsFree;
      this.handsFree = false;
      this.handsFreeEndedByKey = true; // 用户主动退出：本轮静音不再弹「没听清」
      if (wasHandsFree) {
        // stop() 只在旗标仍在时提示，这里已先清旗标，退出提示由本入口负责
        this.deps.showToast(t("toast.handsFreeEnd"), t("toast.handsFreeEndByKey"));
        if (!this.busy) {
          // 句间空档退出：没有进行中会话可收尾，直接停麦、解除静音
          this.deps.recorder()?.webContents.send("recorder:stop");
          this.unmute();
          this.setPartial("");
          return;
        }
      }
      void this.stop();
      return;
    }
    this.handsFree = true;
    this.handsFreeSilentRounds = 0;
    this.handsFreeTyped = false;
    this.handsFreeCarry = [];
    this.handsFreeCarrySamples = 0;
    this.lastHandsFreePasted = "";
    void this.start("toggle");
  }

  /** VAD 静音自动收尾：不退出免按模式，落字后继续聆听下一句 */
  private async autoStop(): Promise<void> {
    if (!this.busy) return;
    if (!this.session) {
      this.pendingEnd = "stop";
      return;
    }
    await this.finalize();
  }

  async stop(): Promise<void> {
    if (this.handsFree) {
      // 免按聆听中按了长按/改写热键：明确告知已退出，避免用户以为还在听
      this.handsFree = false;
      this.handsFreeEndedByKey = true;
      this.deps.showToast(t("toast.handsFreeEnd"), t("toast.handsFreeEndByKey"));
      // 句间空档（无进行中会话）退出：麦克风跨句保持着，这里必须停麦解除静音
      if (!this.busy) {
        this.deps.recorder()?.webContents.send("recorder:stop");
        this.unmute();
        return;
      }
    }
    if (!this.busy) return;
    if (!this.session) {
      this.pendingEnd = "stop";
      return;
    }
    await this.finalize();
  }

  /** 录音/转写进行中按 Esc 一键取消；无进行中会话时返回 false，让 Esc 保持系统默认行为 */
  cancelByKey(): boolean {
    if (!this.busy && !this.handsFree) return false;
    this.cancel();
    return true;
  }

  cancel(): void {
    // 免按退出已有专属提示；普通取消给一条短提示，让用户能区分「已取消」与「识别失败」
    const wasHandsFree = this.handsFree;
    if (this.handsFree) {
      this.handsFree = false;
      this.deps.showToast(t("toast.handsFreeEnd"), t("toast.handsFreeEndByKey"));
    }
    this.rewriteTarget = null;
    if (!this.busy) {
      // 免按句间空档取消：麦克风跨句保持着，一样要停麦解除静音
      if (wasHandsFree) {
        this.deps.recorder()?.webContents.send("recorder:stop");
        this.unmute();
      }
      return;
    }
    if (!this.session) {
      if (this.finishing) {
        // 转写/处理阶段取消：中断云端上传，结果到达也丢弃，收尾由 finalize 完成
        this.finishCancelled = true;
        this.finishing.cancel();
      } else {
        this.pendingEnd = "cancel";
      }
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
    if (!wasHandsFree) this.deps.showToast(t("toast.canceled"), t("toast.canceledBody"), undefined, 2500);
  }

  /** 转写阶段被取消的统一收尾：停麦、解静音、回空闲、短提示 */
  private abortFinish(): void {
    this.handsFree = false;
    this.deps.recorder()?.webContents.send("recorder:stop");
    this.unmute();
    this.busy = false;
    this.partial = "";
    this.report("idle");
    this.deps.showToast(t("toast.canceled"), t("toast.canceledBody"), undefined, 2500);
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
      const session = await this.createSession(settings, (text) => this.setPartial(text));
      for (const frame of failed.frames) session.pushPcm(frame);
      this.session = session;
      this.startedAt = Date.now() - failed.durationMs;
      this.maxPeak = failed.maxPeak;
      this.voicedMs = MIN_VOICED_MS; // 该段音频进入过 ASR，已通过有声门槛
      this.allFrames = failed.frames;
      await this.finalize();
    } catch (error) {
      this.busy = false;
      this.session = null;
      this.report("error", humanizeAsrError(error instanceof Error ? error.message : String(error)));
    }
    return true;
  }

  private resolveFailedEntry(id: string, text: string, raw: string): void {
    const entry = getHistory().find((h) => h.id === id);
    if (entry?.audioFile && existsSync(entry.audioFile)) rmSync(entry.audioFile, { force: true });
    updateHistoryItem(id, {
      text,
      raw,
      at: Date.now(),
      status: undefined,
      error: undefined,
      audioFile: undefined,
      provider: getSettings().asrProvider,
    });
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
      const session = await this.createSession(settings);
      for (const frame of wavToFrames(entry.audioFile)) session.pushPcm(frame);
      const raw = await session.finish();
      if (!raw) return { ok: false, detail: t("toast.noSpeech") };
      const text = await polishText(settings, persona, raw);
      this.resolveFailedEntry(id, text, raw);
      addStats(countWords(text), entry.durationMs);
      clipboard.writeText(text);
      this.deps.broadcast(this.status());
      this.deps.showToast(t("history.retryDone"), text.slice(0, 60));
      return { ok: true, detail: text };
    } catch (error) {
      return { ok: false, detail: humanizeAsrError(error instanceof Error ? error.message : String(error)) };
    }
  }

  /** 用户在目标输入框里手动改对了词：整批学进词典 + 同步修正历史条目 + 一条可撤销提示 */
  private learnCorrections(historyId: string, items: Diff[]): void {
    const settings = getSettings();
    let hotwords = settings.hotwords;
    const learned: Diff[] = [];
    let skippedFull = false;
    for (const item of items) {
      if (hotwords.includes(item.right)) continue;
      if (hotwords.length >= 300) {
        log.info(`auto-learn skipped (dictionary full): "${item.right}"`);
        skippedFull = true;
        continue;
      }
      hotwords = [...hotwords, item.right];
      learned.push(item);
    }
    if (learned.length === 0) {
      if (skippedFull) this.deps.showToast(t("toast.dictFull"), t("toast.dictFullBody"));
      return;
    }
    setSettings({ hotwords });
    const entry = getHistory().find((h) => h.id === historyId);
    if (entry) {
      let text = entry.text;
      for (const { wrong, right } of learned) if (text.includes(wrong)) text = text.replace(wrong, right);
      if (text !== entry.text) updateHistoryItem(historyId, { text });
    }
    this.deps.pushSettings();
    const words = learned.map((l) => l.right);
    const body =
      learned.length === 1
        ? t("toast.learnedBody", { word: words[0]! })
        : t("toast.learnedManyBody", { words: words.join(", ") });
    // 误编辑（如手滑打错再改回）也会触发学词：toast 上直接给撤销（整批一起撤），不用去词典页手删
    this.deps.showToast(t("toast.learned"), body, {
      label: t("toast.undo"),
      run: () => {
        const now = getSettings();
        setSettings({ hotwords: now.hotwords.filter((w) => !words.includes(w)) });
        const item = getHistory().find((h) => h.id === historyId);
        if (item) {
          let text = item.text;
          for (const { wrong, right } of learned) if (text.includes(right)) text = text.replace(right, wrong);
          if (text !== item.text) updateHistoryItem(historyId, { text });
        }
        this.deps.pushSettings();
        const undoneBody =
          learned.length === 1
            ? t("toast.undoneBody", { word: words[0]! })
            : t("toast.undoneManyBody", { words: words.join(", ") });
        this.deps.showToast(t("toast.undone"), undoneBody);
      },
    });
  }

  private async finalize(): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.finalizing = true;
    // 本次会话一开始就消费掉改写意图：空结果/异常提前退出时不能残留到下一次普通听写
    const rewriteTarget = this.rewriteTarget;
    this.rewriteTarget = null;
    const settings = getSettings();
    const persona = localizePersona(
      findPersona(this.appPersonaId ?? settings.personaId),
      translator(),
    );
    const durationMs = Date.now() - this.startedAt;
    const endedByKey = this.handsFreeEndedByKey;
    this.handsFreeEndedByKey = false;

    // 免按会话内跨句保持麦克风与系统静音：每句都整轮拆建 getUserMedia/AudioContext/AudioWorklet
    // 会让录音渲染进程原生内存每句累积不归还；退出免按处统一停麦解除
    if (!(this.handsFree && this.mode === "toggle")) {
      this.deps.recorder()?.webContents.send("recorder:stop");
      this.unmute();
    }

    // 整段录音接近数字静音：不白耗一次识别调用，也避免 ASR 对噪声幻听落字
    log.info(
      `dictation finalize: durationMs=${durationMs} maxPeak=${this.maxPeak} voicedMs=${this.voicedMs}`,
    );
    if (this.maxPeak < NO_SPEECH_PEAK || this.voicedMs < MIN_VOICED_MS) {
      session.cancel();
      this.busy = false;
      this.partial = "";
      this.report("idle");
      if (this.maybeContinueHandsFree(true)) return;
      if (!endedByKey) this.deps.showToast(t("toast.noSpeech"), t("toast.noSpeechBody"));
      return;
    }

    this.report("transcribing");

    let raw = "";
    this.finishing = session;
    this.finishCancelled = false;
    try {
      raw = await session.finish();
    } catch (error) {
      this.finishing = null;
      if (this.finishCancelled) {
        this.finishCancelled = false;
        this.abortFinish();
        return;
      }
      const message = humanizeAsrError(error instanceof Error ? error.message : String(error));
      // 热键重试再失败：原地刷新既有失败条目，不追加重复条目与重复音频
      const priorId = this.lastFailed?.historyId;
      const id = priorId && getHistory().some((h) => h.id === priorId) ? priorId : randomUUID();
      if (id === priorId) {
        updateHistoryItem(id, { at: Date.now(), error: message, provider: settings.asrProvider });
      } else {
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
          provider: settings.asrProvider,
        });
      }
      this.lastFailed = { frames: this.allFrames, durationMs, maxPeak: this.maxPeak, at: Date.now(), historyId: id };
      this.handsFree = false;
      this.deps.recorder()?.webContents.send("recorder:stop");
      this.unmute();
      this.busy = false;
      this.report("error", `${message} · ${t("error.retryHint")}`);
      return;
    }
    this.finishing = null;
    if (this.finishCancelled) {
      // 云端无法中断的通道（chatgpt/本地）取消后仍会出结果：用户已取消，结果丢弃不落字
      this.finishCancelled = false;
      this.abortFinish();
      return;
    }
    // 本次是热键重试且成功：把之前的失败条目原地升级，后面 addHistory 前先清掉
    const retriedId = this.lastFailed?.historyId;
    this.lastFailed = null;

    if (durationMs < settings.minRecordMs || !raw) {
      this.busy = false;
      this.partial = "";
      this.report("idle");
      if (this.maybeContinueHandsFree(true)) return;
      if (!raw) this.deps.showToast(t("toast.noSpeech"), t("toast.noSpeechBody"));
      return;
    }

    this.report("polishing");
    let text: string;
    if (rewriteTarget) {
      const rewritten = await rewriteSelection(settings, rewriteTarget, raw);
      if (typeof rewritten !== "string") {
        this.busy = false;
        this.partial = "";
        this.report("idle");
        this.deps.showToast(
          t("toast.rewriteFailed"),
          t(
            rewritten.error === "network"
              ? "toast.rewriteFailedNetworkBody"
              : rewritten.error === "timeout"
                ? "toast.rewriteFailedTimeoutBody"
                : "toast.rewriteFailedBody",
          ),
        );
        return;
      }
      text = rewritten;
    } else {
      // 免按连续听写保留中文句尾句号：多句依次落字，没有它们就连成一片不可读
      text = await polishText(
        settings,
        persona,
        raw,
        () => this.deps.showToast(t("toast.polishFallback"), t("toast.polishFallbackBody")),
        this.mode === "toggle",
      );
    }

    // 免按语音命令：整条精确命中命令词表时不落字，改执行编辑动作；终端前台不执行（换行即回车）
    if (this.mode === "toggle" && !rewriteTarget && settings.voiceCommands && !isTerminalForeground()) {
      const cmds = parseVoiceCommands(text);
      if (cmds) {
        for (const cmd of cmds) await this.runVoiceCommand(cmd);
        this.busy = false;
        this.partial = "";
        this.report("idle");
        this.maybeContinueHandsFree(false);
        return;
      }
    }

    let failed: string | undefined;
    let pastedOk = true;
    const noTarget =
      !rewriteTarget && settings.autoPaste && (!hasPasteTarget() || !(await selfWindowPasteable()));
    if (noTarget) {
      // 前台是桌面壳等非输入目标：盲发 Ctrl+V 会静默丢字，改为提示已存历史
      this.deps.showToast(t("toast.noPasteTarget"), t("toast.noPasteTargetBody"));
    }
    if ((settings.autoPaste && !noTarget) || rewriteTarget) {
      if (!rewriteTarget && isTerminalForeground()) text = deformatForTerminal(text);
      // 免按连续听写的第 2 句起：拉丁字母/数字开头时补空格，避免 "test.And here" 顶格拼接。
      // 不看 handsFree：退出免按（热键/Alt+Q）会先清它再 finalize 最后一句，只认本会话是否已落过字。
      // hold 模式同理：短间隔内连续口述视为同一段落，一样补句间空格
      const pasteWin = this.mode === "hold" && !rewriteTarget ? foregroundWindowKey() : null;
      const holdGlue =
        this.mode === "hold" &&
        !rewriteTarget &&
        Date.now() - this.lastHoldPasteAt < HOLD_GLUE_WINDOW_MS &&
        pasteWin !== null &&
        pasteWin === this.lastHoldPasteWin;
      // 免按自动分段：句间停顿达段落阈值时落字前插入空行；终端粘贴换行会直接回车执行，不分段
      const paraBreak =
        this.mode === "toggle" &&
        this.handsFreeTyped &&
        !rewriteTarget &&
        settings.handsFreeParagraphs &&
        this.prevVoiceEndAt > 0 &&
        this.firstVoiceAt > 0 &&
        this.firstVoiceAt - this.prevVoiceEndAt >= settings.paragraphBreakMs &&
        !isTerminalForeground();
      const glue = paraBreak
        ? process.platform === "win32"
          ? "\r\n\r\n"
          : "\n\n"
        : ((this.mode === "toggle" && this.handsFreeTyped) || holdGlue) && /^[A-Za-z0-9]/.test(text)
          ? " "
          : "";
      try {
        // 改写模式：选区还选着，直接粘贴就是替换
        const pasted = await pasteText(glue + text);
        if (!pasted) {
          // 修饰键超时未松（如持续按住 Alt），盲发会静默丢字；文字留在剪贴板+历史
          pastedOk = false;
          this.deps.showToast(t("toast.pasteBlocked"), t("toast.pasteBlockedBody"));
        } else {
          if (this.handsFree && this.mode === "toggle") this.handsFreeTyped = true;
          if (this.mode === "toggle") this.lastHandsFreePasted = glue + text;
          if (this.mode === "hold" && !rewriteTarget) {
            this.lastHoldPasteAt = Date.now();
            this.lastHoldPasteWin = pasteWin;
          }
        }
      } catch (error) {
        failed = error instanceof Error ? error.message : String(error);
        this.deps.showToast(t("toast.pasteFailed"), text.slice(0, 40));
      }
    }

    const historyId = retriedId ?? randomUUID();
    if (retriedId) this.resolveFailedEntry(retriedId, text, raw);
    else
      addHistory({
        id: historyId,
        at: Date.now(),
        text,
        raw,
        personaName: persona.name,
        durationMs,
        failed,
        provider: settings.asrProvider,
      });
    addStats(countWords(text), durationMs);

    // 自纠错学习：落字成功后盯一会儿目标输入框，用户手改的词自动学进词典（改写模式不学，文本不是转写结果）
    if (!rewriteTarget && settings.autoLearn && settings.autoPaste && !failed && pastedOk && !noTarget && /[\u4e00-\u9fff]|[A-Za-z]{3,}/.test(text)) {
      watchPastedText(text, (items) => this.learnCorrections(historyId, items));
    }

    this.busy = false;
    this.setPartial(text);
    this.report("idle");
    if (this.maybeContinueHandsFree(false)) return;
    setTimeout(() => {
      if (this.state === "idle") this.setPartial("");
    }, 1200);
  }

  /** 命中的免按语音命令：不落字，转为编辑动作，并给短提示 */
  private async runVoiceCommand(cmd: VoiceCommand): Promise<void> {
    const cmdName = {
      newline: t("voiceCommand.newline"),
      paragraph: t("voiceCommand.paragraph"),
      deleteLast: t("voiceCommand.deleteLast"),
    }[cmd];
    let ok: boolean;
    if (cmd === "newline" || cmd === "paragraph") {
      const eol = process.platform === "win32" ? "\r\n" : "\n";
      ok = await pasteText(cmd === "newline" ? eol : eol + eol);
      // 换行后下一句顶格起：不再补句间空格/段落空行
      if (ok) this.handsFreeTyped = false;
    } else {
      const presses = Array.from(this.lastHandsFreePasted.replace(/\r\n/g, "\n")).length;
      ok = presses > 0 && (await sendBackspaces(presses));
      if (ok) this.lastHandsFreePasted = "";
    }
    this.deps.showToast(
      ok ? t("toast.voiceCommandDone") : t("toast.voiceCommandFailed"),
      cmdName,
      undefined,
      2000,
    );
  }

  /** 免按模式未退出时自动开启下一句；连续多轮无人声（约 1 分钟）才自动退出 */
  private maybeContinueHandsFree(silent: boolean): boolean {
    if (!this.handsFree || this.mode !== "toggle") return false;
    if (silent) {
      this.handsFreeSilentRounds++;
      const maxRounds = getSettings().vadAutoStop
        ? HANDS_FREE_MAX_SILENT_ROUNDS
        : HANDS_FREE_MAX_SILENT_ROUNDS_NO_VAD;
      if (this.handsFreeSilentRounds >= maxRounds) {
        this.handsFree = false;
        this.deps.recorder()?.webContents.send("recorder:stop");
        this.unmute();
        this.setPartial("");
        // 返回 true 让调用方跳过 noSpeech toast，否则退出提示会被它覆盖
        this.deps.showToast(t("toast.handsFreeEnd"), t("toast.handsFreeEndBody"));
        return true;
      }
    } else {
      this.handsFreeSilentRounds = 0;
    }
    setTimeout(() => {
      if (this.handsFree && !this.busy) void this.start("toggle");
    }, 150);
    return true;
  }
}
