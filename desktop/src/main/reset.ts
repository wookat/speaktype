import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";

/**
 * 便携版 userData 目录（exe 同级 SpeakType-data）；非便携环境返回 null。
 * 放在 reset.ts 供 migrate.ts 复用而不是反向依赖：本模块必须先于 ./migrate
 * import（下面 --factory-reset 的删除等不到那边的重定向），反向 import 会把
 * migrate 的迁移副作用一并提前，顺序语义就乱了。
 */
export function portableUserDataDir(): string | null {
  const exe = process.env["PORTABLE_EXECUTABLE_FILE"];
  return exe ? join(dirname(exe), "SpeakType-data") : null;
}

/**
 * 完全重置：上一实例带 --factory-reset 重启后，在任何 store/日志初始化之前整体
 * 删除 userData（设置、历史、词典、模型、日志、缓存），随后按全新安装启动。
 * 旧中文 productName 的 legacy 目录（如 "SpeakType 语音输入法"）也要一并删除，
 * 否则 migrate 的 legacy 迁移会把旧配置迁回、旧数据复活——但便携版除外：便携版
 * 与正式安装版可并存于同一台机器，重置便携版只删自己的 SpeakType-data，绝不
 * 波及 %APPDATA% 下的正式版与 legacy 数据。
 * 必须在 ./migrate 之前 import：迁移和 electron-store 都会立即写出配置文件。
 */
if (process.argv.includes("--factory-reset")) {
  try {
    // 本模块先于 migrate 执行，便携版重定向尚未生效，userData 仍指着系统默认的
    // %APPDATA%\SpeakType：先自行重定向再删，否则误删的是正式安装版的全部数据
    const portable = portableUserDataDir();
    if (portable) app.setPath("userData", portable);
    rmSync(app.getPath("userData"), { recursive: true, force: true });
    if (!portable) {
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
    }
  } catch {
    // 个别文件被占用删不掉时仍继续启动：store 的 clearInvalidConfig 会兜底
  }
}
