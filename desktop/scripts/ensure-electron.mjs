// npm install 偶发跳过 electron 的 postinstall（复用旧缓存/被中断），留下没有二进制的
// node_modules/electron：electron-vite dev 与 electron-builder 都会因找不到 electron.exe 失败。
// 装完自检一次，缺就补跑 electron 自带的下载脚本。
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const electronDir = join(root, "node_modules", "electron");
if (!existsSync(electronDir)) process.exit(0);

const pathFile = join(electronDir, "path.txt");
const binary = existsSync(pathFile) ? join(electronDir, "dist", readFileSync(pathFile, "utf8").trim()) : null;
if (binary && existsSync(binary)) process.exit(0);

console.log("[ensure-electron] electron binary missing, running electron/install.js");
const result = spawnSync(process.execPath, [join(electronDir, "install.js")], { stdio: "inherit" });
process.exit(result.status ?? 1);
