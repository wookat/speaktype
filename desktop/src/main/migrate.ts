import { app } from "electron";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import log from "electron-log/main.js";

/**
 * productName 曾为中文（生成过 "SpeakType 语音输入法" userData 目录），改为纯 ASCII
 * 后把旧目录的配置迁移过来。必须在任何 electron-store 实例化之前执行（store 带
 * defaults 会在 import 阶段立即写出 speaktype.json），因此放在独立模块里由入口
 * 文件最先 import。
 */
export function migrateLegacyUserData(): void {
  try {
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

migrateLegacyUserData();
