import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import log from "electron-log/main.js";
import { streamingModelPaths, streamingModelReady } from "./localasr";

/**
 * 流式草稿字幕（two-pass 的「看」半边）：录音帧增量喂给常驻的 sherpa-onnx
 * OnlineRecognizer，逐字上屏；松手后的终稿仍走用户选中的离线模型（asr.ts 原路径）。
 * 与 localasr.ts 的离线 worker 平行的第二条 worker 线程：流式解码是增量的，
 * 每 200ms 帧到达时解码一点，RTF 0.1 级别，不需要也不该复用整句重解的离线 worker。
 *
 * 生命周期对齐 localasr.ts 的既有约定：模型常驻、session 级 stream、10min 空闲回收、
 * 关开关/删模型立即释放、启动后空闲预热把 ~238MB 冷加载移出用户第一句。
 * worker 加载期间的帧由 session 缓存、ready 后补喂——草稿从音频头部开始不丢第一句。
 */

const SAMPLE_RATE = 16_000;
// 对齐 localasr.ts WORKER_IDLE_MS：无活跃 session 后模型再驻留 10 分钟即回收
const WORKER_IDLE_MS = 10 * 60_000;
// 松手后流式收尾（inputFinished + 排空解码）通常毫秒级；超时视为流式侧故障，
// 终稿路径不受影响（草稿只用于字幕展示与终稿失败时的兜底）
const FINISH_TIMEOUT_MS = 2_000;
// worker 启动含 ~238MB 模型 ONNX 冷加载，慢盘上要几秒；一直等不到 ready 判启动
// 失败回收，本 session 降级。下一个 session 会重新尝试拉起（自愈，不永久失效）
const READY_TIMEOUT_MS = 30_000;
// partial 上报节流：文本有变化时也至多 300ms 一拍，避免高频 IPC 刷面板
const PARTIAL_MIN_INTERVAL_MS = 300;

const workerSource = `
const { parentPort, workerData } = require("worker_threads");
// OnlineStream 的 native 内存靠 GC finalizer 释放，worker JS 堆极小几乎不触发 GC，
// 会随 session 数线性挂账；与 localasr.ts 同款取 gc 的办法（--expose-gc 是进程级
// flag，worker 的 isolate 自带全局 gc，顶层不能再声明同名标识符）
let gcFn = globalThis.gc;
if (typeof gcFn !== "function") {
  try {
    require("v8").setFlagsFromString("--expose-gc");
    gcFn = require("vm").runInNewContext("gc");
  } catch {}
}
const mod = require(workerData.modulePath);
const t0 = Date.now();
// 识别器 worker 级常驻：模型加载一次，session 只是廉价的 createStream；
// P1 用默认 greedy_search（快），modified_beam_search + 热词属 P2
const rec = new mod.OnlineRecognizer({
  modelConfig: {
    paraformer: { encoder: workerData.encoder, decoder: workerData.decoder },
    tokens: workerData.tokens,
    numThreads: 2,
    provider: "cpu",
    debug: 0,
  },
});
parentPort.postMessage({ type: "ready", ms: Date.now() - t0 });

let stream = null;   // 当前 session 的流（听写天然串行，一次至多一个）
let curId = -1;      // 迟到消息按 session 序号丢弃
let lastText = "";   // 仅文本变化才上报，配合 300ms 节流
let lastSentAt = 0;
const drain = () => { while (stream && rec.isReady(stream)) rec.decode(stream); };

parentPort.on("message", (msg) => {
  try {
    if (msg.type === "start") {
      if (stream) { // 上一 session 未正常收尾（如 cancel 后又立刻 start）：弃旧建新
        stream = null;
        if (typeof gcFn === "function") gcFn();
      }
      curId = msg.id;
      stream = rec.createStream();
      lastText = "";
      lastSentAt = 0;
      parentPort.postMessage({ type: "started", id: msg.id });
      return;
    }
    if (msg.id !== curId || !stream) return; // 迟到/无主消息
    if (msg.type === "push") {
      stream.acceptWaveform({ sampleRate: msg.sampleRate, samples: msg.samples });
      drain();
      const text = rec.getResult(stream).text.trim();
      const now = Date.now();
      if (text && text !== lastText && now - lastSentAt >= ${PARTIAL_MIN_INTERVAL_MS}) {
        lastText = text;
        lastSentAt = now;
        parentPort.postMessage({ type: "partial", id: msg.id, text });
      }
      return;
    }
    if (msg.type === "finish") {
      stream.inputFinished();
      drain();
      const text = rec.getResult(stream).text.trim();
      parentPort.postMessage({ type: "final", id: msg.id, text });
      stream = null;
      curId = -1;
      if (typeof gcFn === "function") gcFn();
      return;
    }
    if (msg.type === "discard") {
      stream = null;
      curId = -1;
      if (typeof gcFn === "function") gcFn();
    }
  } catch (error) {
    // 解码异常不杀 worker（模型还在）：弃流并上报，主进程按降级处理
    stream = null;
    curId = -1;
    parentPort.postMessage({ type: "error", id: msg.id, error: error instanceof Error ? error.message : String(error) });
    if (typeof gcFn === "function") gcFn();
  }
});
`;

interface WorkerMessage {
  type: "ready" | "started" | "partial" | "final" | "error";
  id?: number;
  ms?: number;
  text?: string;
  error?: string;
}

export interface StreamingCaptionSession {
  /** 喂一帧 PCM16（16kHz 单声道）；ready 前的帧会被缓存，模型加载完一起补进去 */
  push(frame: Int16Array): void;
  /** 收尾取流式最终草稿；任何故障/超时返回 null，绝不抛出（草稿只是字幕） */
  finish(): Promise<string | null>;
  /** 弃流（用户取消）：不产生任何回报 */
  discard(): void;
}

let worker: Worker | null = null;
let workerReady = false;
let nextSessionId = 1;
let activeSession: SessionState | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const captionsLoadedListeners = new Set<() => void>();

/**
 * 流式字幕模型是否正在加载（worker 已拉起、模型未就绪）。供听写状态机在录音期
 * 给面板「字幕模型加载中」提示——冷启动那 1-2 秒的静默等待曾让用户以为功能失效。
 */
export function isStreamingCaptionsLoading(): boolean {
  return worker !== null && !workerReady;
}

/** 流式模型加载完成回调：面板从「字幕模型加载中」切回字幕/波形 */
export function onStreamingCaptionsLoaded(listener: () => void): void {
  captionsLoadedListeners.add(listener);
}

interface SessionState {
  id: number;
  onPartial: (text: string) => void;
  /** 建流前缓存的浮点帧；started 消息到达后按序补喂并清空 */
  pending: Float32Array[];
  /** started 消息已到（worker 已建流）：此前新帧必须走缓存，避免插到缓存旧帧之前（乱序） */
  started: boolean;
  finishResolve: ((text: string | null) => void) | null;
  finishTimer: NodeJS.Timeout | null;
  failed: boolean;
}

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (worker && !activeSession) terminateWorker("idle", false);
  }, WORKER_IDLE_MS);
  idleTimer.unref();
}

/** abnormal=true（崩溃/超时）才毒化重启资格；idle/released 是正常关停 */
function terminateWorker(reason: string, abnormal: boolean): void {
  if (!worker) return;
  void worker.terminate();
  worker = null;
  workerReady = false;
  if (abnormal) log.warn(`streaming worker gone (${reason})`);
  else log.info(`streaming worker stopped (${reason})`);
  settleActiveSession(`streaming worker gone (${reason})`);
}

function settleActiveSession(reason: string): void {
  const s = activeSession;
  activeSession = null;
  if (!s) return;
  if (s.finishTimer) clearTimeout(s.finishTimer);
  s.failed = true;
  s.finishResolve?.(null);
  log.warn(`streaming session ${s.id} degraded: ${reason}`);
}

function onWorkerMessage(msg: WorkerMessage): void {
  if (msg.type === "ready") {
    workerReady = true;
    log.info(`streaming model loaded in ${msg.ms}ms`);
    for (const listener of captionsLoadedListeners) listener();
    return;
  }
  const s = activeSession;
  if (!s || msg.id !== s.id) return; // 迟到消息按 session 丢弃
  if (msg.type === "started") {
    // 模型冷加载期间缓存的帧此刻按序补喂，草稿从整段音频的头部开始（不丢第一句）；
    // started 置位要先于刷缓存，补喂期间到达的新帧才不会插队
    s.started = true;
    for (const f of s.pending.splice(0)) postPush(s.id, f);
    // 收尾在建流窗口内已被调用（resolve 已挂）：缓存帧刷完后补发 finish，
    // 否则 finish 抢在缓存帧之前被 worker 处理，草稿丢掉头部
    if (s.finishResolve) worker?.postMessage({ type: "finish", id: s.id });
    return;
  }
  if (msg.type === "partial") {
    if (msg.text) s.onPartial(msg.text);
    return;
  }
  if (msg.type === "final") {
    if (s.finishTimer) clearTimeout(s.finishTimer);
    activeSession = null;
    s.finishResolve?.(msg.text?.trim() || null);
    scheduleIdleShutdown();
    return;
  }
  if (msg.type === "error") {
    // 解码级异常：session 降级但 worker 与模型仍健康，下次听写照常再试
    settleActiveSession(msg.error ?? "streaming decode error");
  }
}

function postPush(id: number, samples: Float32Array): void {
  // new Float32Array 的 buffer 必为 ArrayBuffer（TS lib 类型标宽为 ArrayBufferLike），转移所有权避免拷贝
  worker?.postMessage({ type: "push", id, sampleRate: SAMPLE_RATE, samples }, [samples.buffer as ArrayBuffer]);
}

/**
 * 开一个流式草稿 session。返回 null 表示流式侧不可用（模型未就绪等），调用方
 * 降级回滑窗或无字幕。同一时刻至多一个 session；worker 加载中也可开（帧先缓存）。
 */
export function startStreamingCaptions(onPartial: (text: string) => void): StreamingCaptionSession | null {
  if (activeSession) {
    // 上一 session 未收尾（理论上不会发生，听写串行）：弃旧开新，别让旧流吃帧
    log.warn("streaming session overlapped, discarding previous");
    activeSession.finishResolve?.(null);
    activeSession = null;
  }
  if (!streamingModelReady()) return null;
  if (!worker && !spawnWorker()) return null;
  const id = nextSessionId++;
  const state: SessionState = { id, onPartial, pending: [], started: false, finishResolve: null, finishTimer: null, failed: false };
  activeSession = state;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  worker!.postMessage({ type: "start", id });
  return {
    push(frame: Int16Array): void {
      if (activeSession !== state || state.failed) return;
      const f = new Float32Array(frame.length);
      for (let i = 0; i < frame.length; i++) f[i] = frame[i]! / 32768;
      // 以 started（worker 已建流）而不是 ready 为界：ready 与 started 之间的窗口内
      // 直发会排到缓存旧帧之前（帧乱序），必须等 started 补喂完再直发
      if (state.started) postPush(state.id, f);
      else state.pending.push(f);
    },
    finish(): Promise<string | null> {
      if (activeSession !== state || state.failed) return Promise.resolve(null);
      return new Promise((resolve) => {
        state.finishResolve = resolve;
        // 流式收尾与终稿解码并行：这里只挂超时兜底，正常路径由 final 消息 resolve
        state.finishTimer = setTimeout(() => settleActiveSession("streaming finish timeout"), FINISH_TIMEOUT_MS);
        state.finishTimer.unref();
        // 未建流前不发 finish：它会抢在缓存帧之前被 worker 处理（草稿丢尾巴），
        // 由 started 消息到达时补发（见 onWorkerMessage）
        if (state.started) worker?.postMessage({ type: "finish", id: state.id });
      });
    },
    discard(): void {
      if (activeSession !== state) return;
      // finish() 已发起、final 消息未回来就被弃流：把挂起的收尾 Promise resolve 成
      // null。worker 已弃流不会再回 final，不 resolve 的话调用方 await 永久挂起
      //（空录音/Esc 取消时 asr.ts 卡死的根因）
      state.finishResolve?.(null);
      state.finishResolve = null;
      if (state.finishTimer) clearTimeout(state.finishTimer);
      activeSession = null;
      worker?.postMessage({ type: "discard", id: state.id });
      scheduleIdleShutdown();
    },
  };
}

function spawnWorker(): boolean {
  const paths = streamingModelPaths();
  const require = createRequire(import.meta.url);
  const w = new Worker(workerSource, {
    eval: true,
    workerData: {
      modulePath: require.resolve("sherpa-onnx-node"),
      encoder: paths.encoder,
      decoder: paths.decoder,
      tokens: paths.tokens,
    },
  });
  worker = w;
  workerReady = false;
  w.on("message", onWorkerMessage);
  w.on("error", (error) => {
    log.warn("streaming worker error", error);
    if (worker === w) terminateWorker("error", true);
  });
  w.on("exit", (code) => {
    if (worker === w) terminateWorker(`exit ${code}`, true);
  });
  log.info("streaming worker starting");
  const timer = setTimeout(() => {
    if (worker === w && !workerReady) terminateWorker("ready timeout", true);
  }, READY_TIMEOUT_MS);
  timer.unref();
  return true;
}

/**
 * 「worker 健康度」曾作为启用判定的输入：加载窗口内返回 false 拒绝会话，导致
 * FireRed 终稿用户整句无字幕（回退滑窗、而 FireRed 被排除在滑窗外）——间歇性
 * 「没字幕但转录正常」的根因。已随根因修复移除：加载中的 worker 可承接会话
 * （session 缓存帧、就绪补喂），崩溃态自愈（worker 置空、下次会话现场重拉），
 * 不存在需要拒绝的状态。此注释留档防回归。
 */

/** 关开关/删模型时立即释放（约 238MB 常驻，对齐 releaseSherpaWorker 语义） */
export function releaseStreamingWorker(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  terminateWorker("released", false);
}

/**
 * 启动后空闲预热：开关开且模型就绪时把 worker 拉起来（识别器在 worker 启动时同步
 * 加载，无需喂静音），用户第一句不再等 ~238MB 冷加载。
 */
export function prewarmStreamingCaptions(): void {
  if (worker || !streamingModelReady()) return;
  spawnWorker();
}
