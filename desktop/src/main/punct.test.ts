import { describe, expect, it, vi } from "vitest";

// punctuate 的在途任务挂 in worker 消息回环上：Worker 换成可控假件，手工派发
// message/exit 验证「worker 死掉时 pending 必须被 reject（上层回退规则断句）」
const { FakeWorker } = vi.hoisted(() => {
  class FakeWorker {
    static instances: FakeWorker[] = [];
    posted: Array<Record<string, unknown>> = [];
    /* eslint 无配置，any[] 仅为绕开与各 handler 签名（msg: {...} / code: number）的变型冲突 */
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
vi.mock("electron", () => ({ app: { getPath: () => "E:\\st-test\\userData" } }));
vi.mock("electron-log/main.js", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("./download", () => ({ downloadFile: vi.fn(), hfSources: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => true) }));

import { punctuate } from "./punct";

function lastWorker(): InstanceType<typeof FakeWorker> {
  const w = FakeWorker.instances.at(-1);
  if (!w) throw new Error("worker not spawned");
  return w;
}

describe("punctuate 在途任务的 worker 崩溃兜底", () => {
  it("正常消息照常加标点返回", async () => {
    const job = punctuate("你好");
    const w = lastWorker();
    const posted = w.posted.find((m) => m["id"] !== undefined);
    w.emit("message", { id: posted?.["id"], text: "你好。" });
    await expect(job).resolves.toBe("你好。");
  });

  it("worker 异常退出且无 error 事件：回退 null 而不是永久挂起（管线锁死回归）", async () => {
    const job = punctuate("你好世界");
    lastWorker().emit("exit", 1);
    await expect(job).resolves.toBeNull();
  });
});
