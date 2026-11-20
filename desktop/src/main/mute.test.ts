import { afterAll, describe, expect, it, vi } from "vitest";

// 静音竞态在 macOS 路径（osascript 异步探测）：把 platform 伪装成 darwin 再动态
// import（mute.ts 在加载时快照 isMac），execFile 换成可手工放行的假件重放时序
const execState = vi.hoisted(() => ({
  calls: [] as Array<{ args: string[] }>,
  pending: [] as Array<(error: Error | null, stdout: string) => void>,
}));

vi.mock("child_process", () => ({
  execFile: vi.fn((_cmd: unknown, args: string[], cb: (error: Error | null, stdout: string) => void) => {
    execState.calls.push({ args });
    execState.pending.push(cb);
  }),
}));
vi.mock("koffi", () => ({ default: {} }));

const REAL_PLATFORM = process.platform;
// 必须先于动态 import：isMac 在模块加载时定死
Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

async function loadMute(): Promise<typeof import("./mute")> {
  vi.resetModules();
  return await import("./mute");
}

/** 放行最早一次未决的 execFile 回调（macGetMute 的探测），并让出 microtask 等它的 .then 跑完 */
async function flushFirstGetMute(stdout: string): Promise<void> {
  execState.pending.shift()?.(null, stdout);
  await Promise.resolve();
  await Promise.resolve();
}

function setMuteCalls(): string[] {
  return execState.calls.filter((c) => (c.args[1] ?? "").includes("set volume output muted")).map((c) => c.args[1] ?? "");
}

afterAll(() => {
  Object.defineProperty(process, "platform", { value: REAL_PLATFORM, configurable: true });
});

describe("macOS 静音异步竞态（muteGen 守卫）", () => {
  it("探测回调晚于录音结束：不得再把系统静回去（永久静音回归）", async () => {
    const mute = await loadMute();
    execState.calls.length = 0;
    mute.muteForRecording();
    expect(execState.calls.length).toBe(1); // macGetMute 探测在途
    mute.unmuteAfterRecording(); // 短句先结束（mutedByUs 尚未置位）
    await flushFirstGetMute("false"); // 回调晚到：系统当前未静音
    expect(setMuteCalls()).toEqual([]); // 不得执行 set volume output muted true
  });

  it("正常时序：先探测再静音，录音结束解除", async () => {
    const mute = await loadMute();
    execState.calls.length = 0;
    mute.muteForRecording();
    await flushFirstGetMute("false");
    expect(setMuteCalls()).toEqual(["set volume output muted true"]);
    mute.unmuteAfterRecording();
    expect(setMuteCalls()).toEqual(["set volume output muted true", "set volume output muted false"]);
  });
});
