import { beforeEach, describe, expect, it, vi } from "vitest";

// reset/migrate 的模块体在 import 时就执行删除/重定向：node:fs 与 electron 换成
// 可控假件，按用例改写 argv/env 后动态 import 逐次重放模块体；断言用的假件也从
// 同一模块图取回，保证与被测模块见到的是同一个实例
const fsState = vi.hoisted(() => ({ dirEntries: [] as string[], legacyConfigExists: false }));
const paths = vi.hoisted(() => ({
  userData: "C:\\Users\\u\\AppData\\Roaming\\SpeakType",
  appData: "C:\\Users\\u\\AppData\\Roaming",
}));
// 模拟真实 app.setPath 会改写后续 getPath 的取值
const electronState = vi.hoisted(() => ({ overrides: new Map<string, string>() }));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => fsState.legacyConfigExists),
  readdirSync: vi.fn(() => fsState.dirEntries),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
  cpSync: vi.fn(),
}));
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((key: string) => electronState.overrides.get(key) ?? (key === "userData" ? paths.userData : paths.appData)),
    setPath: vi.fn((key: string, value: string) => {
      electronState.overrides.set(key, value);
    }),
  },
}));
vi.mock("electron-log/main.js", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));

const PORTABLE_EXE = "E:\\tools\\SpeakType.exe";
const PORTABLE_DATA = "E:\\tools\\SpeakType-data";
const ORIGINAL_ARGV = process.argv;

/** 重放一次模块图（factory-reset 分支在 import 时同步执行），并带回同图的 electron/fs 假件 */
async function loadModules(
  entry: "./reset" | "./migrate",
  factoryReset: boolean,
): Promise<{ app: typeof import("electron")["app"]; fs: Pick<typeof import("node:fs"), "existsSync" | "mkdirSync" | "readdirSync" | "rmSync"> }> {
  process.argv = factoryReset
    ? [...ORIGINAL_ARGV, "--factory-reset"]
    : ORIGINAL_ARGV.filter((arg) => arg !== "--factory-reset");
  vi.resetModules();
  try {
    await import(entry);
    const { app } = await import("electron");
    const fs = await import("node:fs");
    return { app, fs };
  } finally {
    process.argv = ORIGINAL_ARGV;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fsState.dirEntries = [];
  fsState.legacyConfigExists = false;
  electronState.overrides.clear();
  delete process.env["PORTABLE_EXECUTABLE_FILE"];
});

describe("portableUserDataDir", () => {
  it("便携环境：exe 同级的 SpeakType-data", async () => {
    await loadModules("./reset", false);
    process.env["PORTABLE_EXECUTABLE_FILE"] = PORTABLE_EXE;
    try {
      const { portableUserDataDir } = await import("./reset");
      expect(portableUserDataDir()).toBe(PORTABLE_DATA);
    } finally {
      delete process.env["PORTABLE_EXECUTABLE_FILE"];
    }
  });
  it("非便携环境返回 null", async () => {
    await loadModules("./reset", false);
    const { portableUserDataDir } = await import("./reset");
    expect(portableUserDataDir()).toBeNull();
  });
});

describe("--factory-reset 删除目标", () => {
  it("便携版：先重定向再删，只删自身 SpeakType-data，不扫 %APPDATA%", async () => {
    fsState.dirEntries = ["SpeakType 语音输入法"];
    process.env["PORTABLE_EXECUTABLE_FILE"] = PORTABLE_EXE;
    try {
      const { app, fs } = await loadModules("./reset", true);
      expect(app.setPath).toHaveBeenCalledWith("userData", PORTABLE_DATA);
      expect(fs.rmSync).toHaveBeenCalledWith(PORTABLE_DATA, { recursive: true, force: true });
      // legacy 扫描被跳过：正式版与旧目录都不得波及
      expect(fs.readdirSync).not.toHaveBeenCalled();
      for (const [target] of vi.mocked(fs.rmSync).mock.calls) {
        expect(String(target)).not.toContain("AppData");
      }
    } finally {
      delete process.env["PORTABLE_EXECUTABLE_FILE"];
    }
  });

  it("正式安装版：删系统 userData 并一并清 legacy 目录", async () => {
    fsState.dirEntries = ["SpeakType 语音输入法"];
    fsState.legacyConfigExists = true;
    const { app, fs } = await loadModules("./reset", true);
    expect(app.setPath).not.toHaveBeenCalled();
    expect(fs.rmSync).toHaveBeenCalledWith(paths.userData, { recursive: true, force: true });
    expect(fs.rmSync).toHaveBeenCalledWith(`${paths.appData}\\SpeakType 语音输入法`, { recursive: true, force: true });
  });

  it("不带 --factory-reset 时模块体不删任何东西", async () => {
    const { fs } = await loadModules("./reset", false);
    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });
});

describe("usePortableUserData（migrate 与 reset 同源公式）", () => {
  it("便携环境把 userData 指向 SpeakType-data 并建目录", async () => {
    process.env["PORTABLE_EXECUTABLE_FILE"] = PORTABLE_EXE;
    try {
      const { app, fs } = await loadModules("./migrate", false);
      expect(app.setPath).toHaveBeenCalledWith("userData", PORTABLE_DATA);
      expect(fs.mkdirSync).toHaveBeenCalledWith(PORTABLE_DATA, { recursive: true });
    } finally {
      delete process.env["PORTABLE_EXECUTABLE_FILE"];
    }
  });
});
