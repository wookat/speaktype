import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../shared/types";
import { SENSEVOICE } from "../shared/localModels";

// startLocalAsrSession 的收尾路径只关心会话编排：终稿引擎（localasr）与流式字幕
// （streaming-asr）都换成可控假件，专测 finish/cancel 的 Promise 落定语义
vi.mock("electron-log/main.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./i18n", () => ({ t: (key: string) => key }));
vi.mock("./chatgpt", () => ({ transcribeViaChatgpt: vi.fn() }));
vi.mock("./localasr", () => ({
  ensureLocalServer: vi.fn(),
  isFireRedModel: (model: string) => model === "fire-red-asr2-ctc-zh-en-int8",
  isSherpaModel: (model: string) => model === SENSEVOICE,
  streamingModelReady: vi.fn(() => true),
  transcribeSherpa: vi.fn(),
  whisperLanguage: (language: string) => language,
}));
vi.mock("./streaming-asr", () => ({ startStreamingCaptions: vi.fn() }));

import { startLocalAsrSession } from "./asr";
import { transcribeSherpa } from "./localasr";
import { startStreamingCaptions } from "./streaming-asr";

/** 流式会话假件：finish 默认永不落定（模拟流式侧卡死），用于证明调用方没有在等它 */
function fakeStreamingSession() {
  return { push: vi.fn(), finish: vi.fn(() => new Promise<string | null>(() => {})), discard: vi.fn() };
}

function makeSettings(): Settings {
  return { localModel: SENSEVOICE, streamingCaptions: true, language: "auto" } as unknown as Settings;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("startLocalAsrSession finish/cancel", () => {
  it("空录音：直接弃流返回空串，不发起流式收尾（finish 后 discard 的死锁回归）", async () => {
    const streaming = fakeStreamingSession();
    vi.mocked(startStreamingCaptions).mockReturnValueOnce(streaming);
    const session = startLocalAsrSession(makeSettings(), () => {});
    await expect(session.finish()).resolves.toBe("");
    expect(streaming.finish).not.toHaveBeenCalled();
    expect(streaming.discard).toHaveBeenCalled();
  });

  it("已取消（Esc）：同上，finish 不再挂起", async () => {
    const streaming = fakeStreamingSession();
    vi.mocked(startStreamingCaptions).mockReturnValueOnce(streaming);
    const session = startLocalAsrSession(makeSettings(), () => {});
    session.cancel();
    await expect(session.finish()).resolves.toBe("");
    expect(streaming.finish).not.toHaveBeenCalled();
  });

  it("终稿期间按 Esc：不等本地推理与草稿，立即返回空串（busy 永久锁死回归）", async () => {
    const streaming = fakeStreamingSession();
    vi.mocked(startStreamingCaptions).mockReturnValueOnce(streaming);
    // 推理挂起不落定：Esc 本无法中断，必须靠 abortable/提前返回跳出等待
    vi.mocked(transcribeSherpa).mockImplementation(() => new Promise(() => {}));
    const session = startLocalAsrSession(makeSettings(), () => {});
    session.pushPcm(new Int16Array(16_000));
    const finishing = session.finish();
    session.cancel();
    await expect(finishing).resolves.toBe("");
    expect(streaming.discard).toHaveBeenCalled();
  });

  it("终稿失败且草稿非空：草稿仍顶上落字（修复不破坏兜底）", async () => {
    const streaming = fakeStreamingSession();
    streaming.finish.mockReturnValueOnce(Promise.resolve(" 草稿 "));
    vi.mocked(startStreamingCaptions).mockReturnValueOnce(streaming);
    vi.mocked(transcribeSherpa).mockRejectedValueOnce(new Error("boom"));
    const session = startLocalAsrSession(makeSettings(), () => {});
    session.pushPcm(new Int16Array(16_000));
    await expect(session.finish()).resolves.toBe("草稿");
  });

  it("终稿成功即落字，不等流式收尾（流式卡住不拖终稿）", async () => {
    const streaming = fakeStreamingSession();
    vi.mocked(startStreamingCaptions).mockReturnValueOnce(streaming);
    vi.mocked(transcribeSherpa).mockResolvedValueOnce("终稿");
    const session = startLocalAsrSession(makeSettings(), () => {});
    session.pushPcm(new Int16Array(16_000));
    await expect(session.finish()).resolves.toBe("终稿");
  });
});
