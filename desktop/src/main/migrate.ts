import { app } from "electron";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import log from "electron-log/main.js";

/**
 * 绿色免安装版：electron-builder 的 portable 目标把程序解到临时目录运行，
 * 配置若留在 AppData 就不算“绿色”。把 userData 挪到 exe 同级的 SpeakType-data，
 * 拷走整个文件夹即可带走全部设置、词典与历史。
 */
export function usePortableUserData(): void {
  const exe = process.env["PORTABLE_EXECUTABLE_FILE"];
  if (!exe) return;
  try {
    const dir = join(dirname(exe), "SpeakType-data");
    mkdirSync(dir, { recursive: true });
    app.setPath("userData", dir);
    log.info("portable mode, userData at", dir);
  } catch (error) {
    log.warn("portable userData redirect failed", error);
  }
}

/**
 * productName 曾为中文（生成过 "SpeakType 语音输入法" userData 目录），改为纯 ASCII
 * 后把旧目录的配置迁移过来。必须在任何 electron-store 实例化之前执行（store 带
 * defaults 会在 import 阶段立即写出 speaktype.json），因此放在独立模块里由入口
 * 文件最先 import。
 */
export function migrateLegacyUserData(): void {
  try {
    // 绿色版是独立实例：不继承本机旧安装的配置（含登录缓存），保持真正“开箱干净”
    if (process.env["PORTABLE_EXECUTABLE_FILE"]) return;
    const userData = app.getPath("userData");
    if (existsSync(join(userData, "speaktype.json"))) {
      log.info("userData config already present, no migration needed");
      return;
    }
    const appData = app.getPath("appData");
    const legacy = readdirSync(appData).find(
      (name) =>
        name !== "SpeakType" &&
        name.startsWith("SpeakType ") &&
        existsSync(join(appData, name, "speaktype.json")),
    );
    if (!legacy) {
      log.info("no legacy userData to migrate");
      return;
    }
    // 只迁移配置文件本身，避免把 Cache/GPUCache 等运行时目录一并拷过来
    mkdirSync(userData, { recursive: true });
    cpSync(join(appData, legacy, "speaktype.json"), join(userData, "speaktype.json"));
    log.info("migrated legacy userData from", legacy);
  } catch (error) {
    log.warn("legacy userData migration failed", error);
  }
}

usePortableUserData();
migrateLegacyUserData();
