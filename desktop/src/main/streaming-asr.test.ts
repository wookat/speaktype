import { beforeEach, describe, expect, it, vi } from "vitest";

// 会话收尾走的是真实协议时序：Worker 换成可控假件（记录 postMessage、手工派发
// message/exit 事件），驱动 started/final 消息验证 Promise 落定语义
const { FakeWorker } = vi.hoisted(() => {
  class FakeWorker {
    static instances: FakeWorker[] = [];
    posted: Array<Record<string, unknown>> = [];
    /* eslint 无配置，any[] 仅为绕开与各 handler 签名（msg: WorkerMessage / code: number）的变型冲突 */
    private handlers = new Map<string, Array<(...args: any[]) => void>>();

    constructor() {
      FakeWorker.instances.push(this);
    }

    on(event: string, cb: (...args: any[]) => void): void {
      const list = this.handlers.get(event) ?? [];
      list.push(cb);
      this.handlers.set(event, list);
    }

    postMessage(msg: Record<string, unknown>): void {
      this.posted.push(msg);
    }

    terminate(): void {
      /* 测试里无需真实终止 */
    }

    /** 模拟 worker 线程向主进程派发事件（message/exit 等） */
    emit(event: string, ...args: unknown[]): void {
      for (const cb of [...(this.handlers.get(event) ?? [])]) cb(...args);
    }
  }
  return { FakeWorker };
});

vi.mock("node:worker_threads", () => ({ Worker: FakeWorker }));
vi.mock("electron-log/main.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./localasr", () => ({
  streamingModelReady: () => true,
  streamingModelPaths: () => ({ encoder: "E:\\m\\encoder.onnx", decoder: "E:\\m\\decoder.onnx", tokens: "E:\\m\\tokens.txt" }),
}));

type StreamingModule = typeof import("./streaming-asr");
type StreamingSession = import("./streaming-asr").StreamingCaptionSession;
type FakeWorkerInstance = InstanceType<typeof FakeWorker>;
let streaming: StreamingModule;

beforeEach(async () => {
  vi.resetModules();
  FakeWorker.instances.length = 0;
  streaming = await import("./streaming-asr");
});

function startSession(): { session: StreamingSession; w: FakeWorkerInstance; id: number } {
  const session = streaming.startStreamingCaptions(() => {});
  if (!session) throw new Error("streaming session unavailable in test");
  const w = FakeWorker.instances.at(-1);
  if (!w) throw new Error("worker not spawned");
  w.emit("message", { type: "ready", ms: 1 });
  const startMsg = w.posted.find((m) => m["type"] === "start");
  const id = startMsg?.["id"];
  if (typeof id !== "number") throw new Error("start message not posted");
  w.emit("message", { type: "started", id });
  return { session, w, id };
}

describe("startStreamingCaptions 建流窗口的帧序", () => {
  function startUnstartedSession(): { session: StreamingSession; w: FakeWorkerInstance; id: number } {
    const session = streaming.startStreamingCaptions(() => {});
    if (!session) throw new Error("streaming session unavailable in test");
    const w = FakeWorker.instances.at(-1);
    if (!w) throw new Error("worker not spawned");
    const startMsg = w.posted.find((m) => m["type"] === "start");
    const id = startMsg?.["id"];
    if (typeof id !== "number") throw new Error("start message not posted");
    return { session, w, id };
  }

  it("ready 与 started 之间的新帧排在缓存旧帧之后（乱序回归）", () => {
    const { session, w, id } = startUnstartedSession();
    session.push(new Int16Array(1)); // 模型未 ready：缓存
    session.push(new Int16Array(2));
    w.emit("message", { type: "ready", ms: 1 });
    // ready 已到但流未建：新帧仍须缓存，直发会插到旧帧之前（乱序）
    session.push(new Int16Array(3));
    w.emit("message", { type: "started", id });
    const pushes = w.posted.filter((m) => m["type"] === "push");
    expect(pushes.map((m) => (m["samples"] as Float32Array).length)).toEqual([1, 2, 3]);
  });

  it("建流窗口内的 finish()：缓存帧刷出之后才发 finish（抢跑回归）", async () => {
    const { session, w, id } = startUnstartedSession();
    session.push(new Int16Array(1));
    w.emit("message", { type: "ready", ms: 1 });
    const finishPromise = session.finish();
    // 未 started：finish 不发（会抢在缓存帧之前被 worker 处理，草稿丢尾巴）
    expect(w.posted.some((m) => m["type"] === "finish")).toBe(false);
    w.emit("message", { type: "started", id });
    const types = w.posted.map((m) => m["type"]);
    expect(types.indexOf("finish")).toBeGreaterThan(types.lastIndexOf("push"));
    w.emit("message", { type: "final", id, text: "草稿" });
    await expect(finishPromise).resolves.toBe("草稿");
  });
});

describe("startStreamingCaptions 收尾与弃流", () => {
  it("finish() 后 discard()：挂起的收尾 Promise 必须 resolve null（Esc 死锁回归）", async () => {
    const { session, w, id } = startSession();
    session.push(new Int16Array([1000, -1000]));
    const finishPromise = session.finish();
    session.discard();
    await expect(finishPromise).resolves.toBeNull();
    // worker 侧同样收到弃流指令（迟到 final 会被 id 丢弃）
    expect(w.posted.some((m) => m["type"] === "discard" && m["id"] === id)).toBe(true);
  });

  it("discard() 后再 finish()：立即 null，不再向 worker 发 finish", async () => {
    const { session, w } = startSession();
    session.discard();
    await expect(session.finish()).resolves.toBeNull();
    expect(w.posted.some((m) => m["type"] === "finish")).toBe(false);
  });

  it("正常收尾：final 消息 trim 后 resolve，随后的 discard 是无害空操作", async () => {
    const { session, w, id } = startSession();
    const finishPromise = session.finish();
    w.emit("message", { type: "final", id, text: " 你好 " });
    await expect(finishPromise).resolves.toBe("你好");
    expect(() => session.discard()).not.toThrow();
  });

  it("worker 收尾超时：2s 兜底 settle 成 null，不挂起", async () => {
    vi.useFakeTimers();
    try {
      const { session } = startSession();
      const finishPromise = session.finish();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(finishPromise).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
