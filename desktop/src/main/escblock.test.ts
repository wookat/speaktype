import { beforeEach, describe, expect, it, vi } from "vitest";

// 钩子命令经 PostThreadMessageW 下发（koffi 直调）：koffi 换成记录参数的假件，
// Worker 换成可控假件，重放「线程就绪 → 异常退出 → 再次安装」验证重建
const { FakeWorker } = vi.hoisted(() => {
  class FakeWorker {
    static instances: FakeWorker[] = [];
    posted: Array<Record<string, unknown>> = [];
    /* eslint 无配置，any[] 仅为绕开与各 handler 签名的变型冲突 */
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

    /** 模拟钩子线程向主进程派发事件（message/exit 等） */
    emit(event: string, ...args: unknown[]): void {
      for (const cb of [...(this.handlers.get(event) ?? [])]) cb(...args);
    }
  }
  return { FakeWorker };
});
const koffiState = vi.hoisted(() => ({ postCalls: [] as unknown[][] }));

vi.mock("node:worker_threads", () => ({ Worker: FakeWorker }));
vi.mock("electron-log/main.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("koffi", () => ({
  default: {
    load: () => ({
      func: () =>
        (...args: unknown[]) => {
          koffiState.postCalls.push(args);
          return true;
        },
    }),
  },
}));

import { blockEscape } from "./escblock";

// CMD_INSTALL = WM_APP + 1 = 0x8001：install() 就绪后的补发安装命令
const CMD_INSTALL = 0x8001;

beforeEach(() => {
  FakeWorker.instances.length = 0;
  koffiState.postCalls.length = 0;
});

describe("escblock 钩子线程崩溃重建", () => {
  it.skipIf(process.platform !== "win32")("异常退出后再次 blockEscape 重建线程并补发安装（wanted 复位回归）", () => {
    expect(blockEscape(() => {})).toBe(true);
    const w1 = FakeWorker.instances.at(-1);
    if (!w1) throw new Error("worker not spawned");
    w1.emit("message", { threadId: 42 });
    w1.emit("exit"); // 模拟钩子线程异常退出（无 error 事件）
    // 崩溃后再次安装：不得被残留的 wanted 短路，必须重建线程
    expect(blockEscape(() => {})).toBe(true);
    const w2 = FakeWorker.instances.at(-1);
    expect(w2).toBeDefined();
    expect(w2).not.toBe(w1);
    // 新线程就绪上报 threadId 后补发安装命令
    w2!.emit("message", { threadId: 43 });
    expect(koffiState.postCalls.some((args) => args[0] === 43 && args[1] === CMD_INSTALL)).toBe(true);
  });
});
