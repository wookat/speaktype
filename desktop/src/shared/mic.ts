/**
 * 多麦克风自动检测与虚拟声卡过滤（纯函数，供 preload/recorder 与单元测试复用）
 */

export interface MicDeviceItem {
  deviceId: string;
  label: string;
}

const VIRTUAL_MIC_RE =
  /\b(virtual\s*(audio|mic|microphone|device|cable|desktop)|todesk|vb-audio|voicemeeter|cable\s*output|stereo\s*mix|what\s*u\s*hear|loopback|blackhole|soundflower|steam\s*streaming|parsec|sunlogin|rustdesk|nvidia\s*broadcast|rtx\s*voice|ai\s*noise[- ]canceling|asus\s*utility|nahimic|sonic\s*studio|oculus\s*virtual)\b|虚拟(音频|麦克风|声卡)|UU远程|向日葵|立体声混音/i;

const CAMERA_MIC_RE = /\b(camera|webcam|usb\s*video)\b|摄像头|相机/i;

/** 判断设备名是否属于常见虚拟音频、远程桌面或虚拟降噪壳 */
export function isVirtualMic(label: string): boolean {
  return VIRTUAL_MIC_RE.test(label);
}

/** 判断设备名是否属于摄像头附带麦克风（优先级次于独立物理麦） */
export function isCameraMic(label: string): boolean {
  return CAMERA_MIC_RE.test(label);
}

/** 录音输入优先级：独立物理麦(0) < 摄像头麦(1) < 虚拟声卡(2) */
export function micPriority(label: string): 0 | 1 | 2 {
  if (isVirtualMic(label)) return 2;
  if (isCameraMic(label)) return 1;
  return 0;
}

/** 按优先级稳定排序：物理麦在前、摄像头麦居中、虚拟声卡排最后 */
export function sortMicDevices<T extends MicDeviceItem>(devices: ReadonlyArray<T>): T[] {
  return [...devices].sort((a, b) => micPriority(a.label) - micPriority(b.label));
}

/**
 * 自动检测模式下挑选最合适的真实麦克风。
 * 返回 null 表示保持系统默认流（当前已是正常物理麦，或无可用替代设备）。
 */
export function pickAutoMic(
  devices: ReadonlyArray<MicDeviceItem>,
  currentLabel?: string,
  excludeIds?: ReadonlySet<string>,
): MicDeviceItem | null {
  const candidates = excludeIds?.size ? devices.filter((d) => !excludeIds.has(d.deviceId)) : [...devices];
  if (candidates.length === 0) return null;

  if (currentLabel) {
    const currentExcluded = Boolean(
      excludeIds?.size && devices.some((d) => d.label === currentLabel && excludeIds.has(d.deviceId)),
    );
    if (!currentExcluded && !isVirtualMic(currentLabel)) {
      return null;
    }
  }

  const best = sortMicDevices(candidates)[0];
  if (!best) return null;
  if (isVirtualMic(best.label) && currentLabel) return null;
  if (best.label === currentLabel && !excludeIds?.size) return null;
  return best;
}
