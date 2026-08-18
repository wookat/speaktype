import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * 完全重置：上一实例带 --factory-reset 重启后，在任何 store/日志初始化之前整体
 * 删除 userData（设置、历史、词典、模型、日志、缓存），随后按全新安装启动。
 * 旧中文 productName 的 legacy 目录（如 "SpeakType 语音输入法"）也要一并删除，
 * 否则 migrate 的 legacy 迁移会把旧配置迁回、旧数据复活。
 * 必须在 ./migrate 之前 import：迁移和 electron-store 都会立即写出配置文件。
 */
if (process.argv.includes("--factory-reset")) {
  try {
    rmSync(app.getPath("userData"), { recursive: true, force: true });
    const appData = app.getPath("appData");
    for (const name of readdirSync(appData)) {
      if (
        name !== "SpeakType" &&
        name.startsWith("SpeakType ") &&
        existsSync(join(appData, name, "speaktype.json"))
      ) {
        rmSync(join(appData, name), { recursive: true, force: true });
      }
    }
  } catch {
    // 个别文件被占用删不掉时仍继续启动：store 的 clearInvalidConfig 会兜底
  }
}
