import { execFile } from "child_process";
import { existsSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import koffi from "koffi";

/**
 * “录音时静音其他应用”：显式读写系统静音状态，而非盲翻转静音键。
 * Windows：koffi 直调 CoreAudio IAudioEndpointVolume GetMute/SetMute。
 * macOS：osascript 显式 set volume output muted。
 * 用户已手动静音时不动系统状态；进程崩溃后用落盘标志在下次启动兜底恢复。
 */

const isMac = process.platform === "darwin";

function guid(str: string): Buffer {
  const parts = str.split("-");
  if (parts.length !== 5) throw new Error(`bad guid: ${str}`);
  const [p1, p2, p3, p4, p5] = parts as [string, string, string, string, string];
  const b = Buffer.alloc(16);
  b.writeUInt32LE(parseInt(p1, 16), 0);
  b.writeUInt16LE(parseInt(p2, 16), 4);
  b.writeUInt16LE(parseInt(p3, 16), 6);
  Buffer.from(p4 + p5, "hex").copy(b, 8);
  return b;
}

interface WinVolumeApi {
  getMute(): boolean | null;
  setMute(muted: boolean): void;
}

function loadWinVolume(): WinVolumeApi {
  const ole32 = koffi.load("ole32.dll");
  const CoInitializeEx = ole32.func("int32 CoInitializeEx(void *pvReserved, uint32 dwCoInit)");
  const CoCreateInstance = ole32.func(
    "int32 CoCreateInstance(uint8 *rclsid, void *pUnkOuter, uint32 dwClsContext, uint8 *riid, _Out_ void **ppv)",
  );
  const CLSID_MMDeviceEnumerator = guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
  const IID_IMMDeviceEnumerator = guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
  const IID_IAudioEndpointVolume = guid("5CDF2C82-841E-4546-9722-0CF74078229A");
  const GetDefaultAudioEndpointProto = koffi.proto(
    "int32 __stdcall MuteGetDefaultAudioEndpoint(void *self, uint32 dataFlow, uint32 role, _Out_ void **device)",
  );
  const ActivateProto = koffi.proto(
    "int32 __stdcall MuteActivate(void *self, uint8 *iid, uint32 clsCtx, void *params, _Out_ void **iface)",
  );
  const SetMuteProto = koffi.proto("int32 __stdcall MuteSetMute(void *self, int32 mute, void *eventContext)");
  const GetMuteProto = koffi.proto("int32 __stdcall MuteGetMute(void *self, _Out_ int32 *mute)");
  const ReleaseProto = koffi.proto("uint32 __stdcall MuteRelease(void *self)");
  const ptrSize = koffi.sizeof("void *");

  function method<T>(objPtr: unknown, index: number, proto: koffi.IKoffiCType): T {
    const vtbl = koffi.decode(objPtr, "void *");
    const fnPtr = koffi.decode(vtbl, index * ptrSize, "void *");
    return koffi.decode(fnPtr, proto) as T;
  }

  /** 每次按当前默认输出设备取 IAudioEndpointVolume，用完释放；任何一步失败返回 null */
  function withVolume<T>(fn: (vol: unknown) => T): T | null {
    try {
      CoInitializeEx(null, 2); // 已初始化返回 S_FALSE/RPC_E_CHANGED_MODE，均可继续
      const enumOut: unknown[] = [null];
      if (CoCreateInstance(CLSID_MMDeviceEnumerator, null, 1, IID_IMMDeviceEnumerator, enumOut) !== 0) return null;
      const enumerator = enumOut[0];
      const release = (obj: unknown) => method<(self: unknown) => number>(obj, 2, ReleaseProto)(obj);
      try {
        const devOut: unknown[] = [null];
        const getEndpoint = method<(self: unknown, flow: number, role: number, out: unknown[]) => number>(
          enumerator,
          4,
          GetDefaultAudioEndpointProto,
        );
        if (getEndpoint(enumerator, 0, 1, devOut) !== 0) return null;
        const device = devOut[0];
        try {
          const volOut: unknown[] = [null];
          const activate = method<(self: unknown, iid: Buffer, ctx: number, params: null, out: unknown[]) => number>(
            device,
            3,
            ActivateProto,
          );
          if (activate(device, IID_IAudioEndpointVolume, 23, null, volOut) !== 0) return null;
          const vol = volOut[0];
          try {
            return fn(vol);
          } finally {
            release(vol);
          }
        } finally {
          release(device);
        }
      } finally {
        release(enumerator);
      }
    } catch {
      return null;
    }
  }

  return {
    getMute() {
      return withVolume((vol) => {
        const out = [0];
        const getMute = method<(self: unknown, out: number[]) => number>(vol, 15, GetMuteProto);
        if (getMute(vol, out) !== 0) return null;
        return out[0] !== 0;
      });
    },
    setMute(muted) {
      withVolume((vol) => {
        const setMute = method<(self: unknown, mute: number, ctx: null) => number>(vol, 14, SetMuteProto);
        setMute(vol, muted ? 1 : 0, null);
        return null;
      });
    },
  };
}

const winVolume = isMac ? undefined : loadWinVolume();

function macGetMute(): Promise<boolean | null> {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", "output muted of (get volume settings)"], (error, stdout) =>
      resolve(error ? null : stdout.trim() === "true"),
    );
  });
}

function macSetMute(muted: boolean): void {
  execFile("osascript", ["-e", `set volume output muted ${muted}`], () => undefined);
}

let mutedByUs = false;
let flagPath = "";

function setFlag(on: boolean): void {
  if (!flagPath) return;
  try {
    if (on) writeFileSync(flagPath, "1");
    else rmSync(flagPath, { force: true });
  } catch {
    /* 标志只是崩溃兜底，写不进不影响主流程 */
  }
}

/** 启动时调用：上次录音中崩溃/被强杀导致的残留静音在这里恢复 */
export function initMuteRecovery(userDataDir: string): void {
  flagPath = join(userDataDir, "muted-by-recording");
  if (!existsSync(flagPath)) return;
  setFlag(false);
  if (isMac) macSetMute(false);
  else winVolume?.setMute(false);
}

/** 录音开始：仅当系统当前未静音时才静音；用户已静音或状态不可读时不动 */
export function muteForRecording(): void {
  if (mutedByUs) return;
  if (isMac) {
    void macGetMute().then((cur) => {
      if (cur !== false) return;
      mutedByUs = true;
      setFlag(true);
      macSetMute(true);
    });
    return;
  }
  if (winVolume?.getMute() !== false) return;
  mutedByUs = true;
  setFlag(true);
  winVolume.setMute(true);
}

/** 录音结束：只解除本应用施加的静音 */
export function unmuteAfterRecording(): void {
  if (!mutedByUs) return;
  mutedByUs = false;
  setFlag(false);
  if (isMac) macSetMute(false);
  else winVolume?.setMute(false);
}
