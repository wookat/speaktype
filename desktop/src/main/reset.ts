import { rmSync } from "node:fs";
import { app } from "electron";

/**
 * 完全重置：上一实例带 --factory-reset 重启后，在任何 store/日志初始化之前整体
 * 删除 userData（设置、历史、词典、模型、日志、缓存），随后按全新安装启动。
 * 必须在 ./migrate 之前 import：迁移和 electron-store 都会立即写出配置文件。
 */
if (process.argv.includes("--factory-reset")) {
  try {
    rmSync(app.getPath("userData"), { recursive: true, force: true });
  } catch {
    // 个别文件被占用删不掉时仍继续启动：store 的 clearInvalidConfig 会兜底
  }
}
