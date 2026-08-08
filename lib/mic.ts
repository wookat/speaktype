/**
 * 麦克风权限相关的统一错误。
 *
 * 扩展的录音发生在 offscreen 文档里，用户看不到权限气泡，被拒时只会得到
 * `NotAllowedError` / Web Speech 的 `not-allowed` 这种黑话，所以在这里统一
 * 翻译成人话，并让 UI 能挂一个「去授权」的入口（见 permission 页面）。
 */
export class MicPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicPermissionError";
  }
}

const DENIED = "麦克风没授权，识别没法开始";
const MISSING = "找不到可用的麦克风，请检查系统录音设备";

/** 把各家的权限错误认出来；不是权限问题返回 null */
export function toMicError(error: unknown): MicPermissionError | null {
  if (error instanceof MicPermissionError) return error;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "NotAllowedError" || name === "SecurityError") return new MicPermissionError(DENIED);
  if (name === "NotFoundError" || name === "OverconstrainedError") return new MicPermissionError(MISSING);
  if (/not-allowed|permission denied/i.test(message)) return new MicPermissionError(DENIED);
  if (/audio-capture/i.test(message)) return new MicPermissionError(MISSING);
  return null;
}

/** Web Speech 的 error 串 → 人话；返回 null 表示不是权限类问题 */
export function micErrorFromSpeech(code: string): MicPermissionError | null {
  if (code === "not-allowed" || code === "service-not-allowed") return new MicPermissionError(DENIED);
  if (code === "audio-capture") return new MicPermissionError(MISSING);
  return null;
}
