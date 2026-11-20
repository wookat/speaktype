import { describe, expect, it } from "vitest";
import { isVirtualMic, pickAutoMic, sortMicDevices, type MicDeviceItem } from "./mic";

const REAL_DEVICES: MicDeviceItem[] = [
  { deviceId: "dev-todesk", label: "麦克风 (ToDesk Virtual Audio)" },
  { deviceId: "dev-uu", label: "麦克风阵列 (UU远程虚拟音频设备)" },
  { deviceId: "dev-asus", label: "AI Noise-Canceling Microphone (ASUS Utility)" },
  { deviceId: "dev-cam", label: "麦克风 (2MP USB Camera-Audio) (2bdf:02b2)" },
  { deviceId: "dev-spk", label: "麦克风 (4-mic Speakerphone) (2bdf:0802)" },
];

describe("isVirtualMic", () => {
  it("准确识别真机上的虚拟音频/远程音频/华硕降噪壳，不误伤物理麦", () => {
    expect(isVirtualMic("麦克风 (4-mic Speakerphone) (2bdf:0802)")).toBe(false);
    expect(isVirtualMic("麦克风 (2MP USB Camera-Audio) (2bdf:02b2)")).toBe(false);
    expect(isVirtualMic("麦克风 (ToDesk Virtual Audio)")).toBe(true);
    expect(isVirtualMic("麦克风阵列 (UU远程虚拟音频设备)")).toBe(true);
    expect(isVirtualMic("AI Noise-Canceling Microphone (ASUS Utility)")).toBe(true);
    expect(isVirtualMic("CABLE Output (VB-Audio Virtual Cable)")).toBe(true);
    expect(isVirtualMic("Stereo Mix (Realtek(R) Audio)")).toBe(true);
  });
});

describe("sortMicDevices", () => {
  it("独立物理麦排最前、摄像头麦居中、虚拟声卡排最后", () => {
    const sorted = sortMicDevices(REAL_DEVICES);
    expect(sorted.map((d) => d.deviceId)).toEqual([
      "dev-spk",
      "dev-cam",
      "dev-todesk",
      "dev-uu",
      "dev-asus",
    ]);
  });
});

describe("pickAutoMic", () => {
  it("系统默认命中虚拟声卡或 ASUS Utility 时自动切到独立物理麦", () => {
    expect(pickAutoMic(REAL_DEVICES, "麦克风 (ToDesk Virtual Audio)")?.deviceId).toBe("dev-spk");
    expect(pickAutoMic(REAL_DEVICES, "麦克风阵列 (UU远程虚拟音频设备)")?.deviceId).toBe("dev-spk");
    expect(pickAutoMic(REAL_DEVICES, "AI Noise-Canceling Microphone (ASUS Utility)")?.deviceId).toBe("dev-spk");
  });

  it("系统默认已是正常物理麦且未被排除时返回 null（保持原流）", () => {
    expect(pickAutoMic(REAL_DEVICES, "麦克风 (4-mic Speakerphone) (2bdf:0802)")).toBeNull();
    expect(pickAutoMic(REAL_DEVICES, "麦克风 (2MP USB Camera-Audio) (2bdf:02b2)")).toBeNull();
  });

  it("主物理麦因连续全 0 死麦被排除后自动回退到第二顺位物理麦", () => {
    const dead = new Set(["dev-spk"]);
    expect(pickAutoMic(REAL_DEVICES, "麦克风 (4-mic Speakerphone) (2bdf:0802)", dead)?.deviceId).toBe("dev-cam");
  });

  it("仅有虚拟声卡可用时返回 null（不切换到另一个虚拟设备）", () => {
    const virtualOnly = REAL_DEVICES.filter((d) => isVirtualMic(d.label));
    expect(pickAutoMic(virtualOnly, "麦克风 (ToDesk Virtual Audio)")).toBeNull();
  });
});
