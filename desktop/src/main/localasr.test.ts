import { describe, expect, it, vi } from "vitest";
import { SENSEVOICE } from "../shared/localModels";

// transcribeSherpa 的在途任务挂 in worker 消息回环上：Worker 换成可控假件，
// 手工派发 message/exit 验证「worker 死掉时 pending 必须被 reject」
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
vi.mock("electron", () => ({ app: { getPath: () => "E:\\st-test\\userData", isPackaged: false } }));
vi.mock("electron-log/main.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./i18n", () => ({ t: (key: string) => key }));
vi.mock("./download", () => ({
  DownloadCancelled: class extends Error {},
  downloadFiles: vi.fn(),
  hfSources: vi.fn((path: string) => [path]),
  partialProgress: vi.fn(() => null),
}));
// modelReady 的字节数校验按文件名给吻合的 size，让 SENSEVOICE 直接判已就绪
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  rmSync: vi.fn(),
  statSync: vi.fn((path: unknown) => ({ size: String(path).endsWith("tokens.txt") ? 315_894 : 239_233_841 })),
}));

import { transcribeSherpa } from "./localasr";

function lastWorker(): InstanceType<typeof FakeWorker> {
  const w = FakeWorker.instances.at(-1);
  if (!w) throw new Error("worker not spawned");
  return w;
}

describe("transcribeSherpa 在途任务的 worker 崩溃兜底", () => {
  it("正常解码消息照常 resolve（兜底不影响正常路径）", async () => {
    const job = transcribeSherpa(SENSEVOICE, new Float32Array(1600), 16000, "zh");
    const w = lastWorker();
    const posted = w.posted.find((m) => m["id"] !== undefined);
    w.emit("message", { id: posted?.["id"], text: "你好" });
    await expect(job).resolves.toBe("你好");
  });

  it("worker 异常退出且无 error 事件：在途任务立即 reject，不永久挂起（busy 锁死回归）", async () => {
    const job = transcribeSherpa(SENSEVOICE, new Float32Array(1600), 16000, "zh");
    lastWorker().emit("exit", 1);
    await expect(job).rejects.toThrow("sherpa worker exited (1)");
  });
});
