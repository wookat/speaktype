import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { app, shell } from "electron";
import log from "electron-log/main.js";
import pkg from "../../package.json";
import { downloadFile, DownloadCancelled, partialProgress } from "./download";
import type { UpdateInfo, UpdateState } from "../shared/types";

/**
 * 应用内更新：检查 GitHub latest release → 复用 download.ts 多源断点续传下载安装包
 * → NSIS 静默安装（/S，per-user 无需提权）后重启。
 *
 * 不用 electron-updater 的原因：发布流程是手工上传、release 资产里没有 latest.yml
 * （GitHub provider 必需），二进制未签名也无法做发布者校验；而本仓库自带的下载器已有
 * 停滞检测/换源/续传/进度推送，直接复用更贴合现有架构。macOS 未签名，保持只提示不更新。
 */

const RELEASE_API = "https://api.github.com/repos/wookat/speaktype/releases/latest";
/** 手动检查也不必每次打 API：同一会话内缓存一会儿，防连点/反复开关页撞匿名限额 */
const CHECK_CACHE_MS = 10 * 60_000;
/** 半开连接下 fetch 会永久挂起，与下载侧 stallGuard 的标准对齐给个超时 */
const CHECK_TIMEOUT_MS = 15_000;

/** 版本号比大小："v0.18.0" vs "0.17.2"，逐段数字比较（与关于页同名实现一致，主进程侧独立一份） */
export function versionNewer(tag: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [a, b] = [parse(tag), parse(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
}

/** dev 模式 app.getVersion() 返回 Electron 版本，与启动日志同款约定取 package.json 版本 */
function currentVersion(): string {
  return app.isPackaged ? app.getVersion() : pkg.version;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

let cached: { at: number; info: UpdateInfo | null } | null = null;

function updateDir(): string {
  return join(app.getPath("userData"), "updates");
}

/** 新目标确定后顺手清掉旧版本安装包与残片（.exe / .exe.part / .exe.part.json），updates 目录不留多个 ~100MB 文件 */
function pruneOldInstallers(keep: string): void {
  // 目录只归更新器使用，不在保留名单（当前目标的三个落盘名）里的一律清掉
  const keepSet = new Set([keep, `${keep}.part`, `${keep}.part.json`]);
  try {
    for (const f of readdirSync(updateDir())) {
      if (!keepSet.has(f)) rmSync(join(updateDir(), f), { force: true });
    }
  } catch {
    // 目录不存在等：无事可清
  }
}

/** 检查更新：仅 Windows；返回 null = 无新版/不支持。portable 版没有安装器语义，由 UI 换成「打开所在文件夹」 */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  if (process.platform !== "win32") return null;
  if (cached && Date.now() - cached.at < CHECK_CACHE_MS) {
    if (cached.info) {
      currentInfo = cached.info;
      pruneOldInstallers(cached.info.fileName);
    }
    return cached.info;
  }
  try {
    const res = await fetch(RELEASE_API, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const release = (await res.json()) as { tag_name?: string; assets?: ReleaseAsset[] };
    const tag = release.tag_name ?? "";
    const asset = release.assets?.find((a) => /^SpeakType-Setup-.*\.exe$/.test(a.name));
    if (!tag || !asset || !versionNewer(tag, currentVersion())) {
      cached = { at: Date.now(), info: null };
      return null;
    }
    const info: UpdateInfo = {
      tag,
      size: asset.size,
      fileName: asset.name,
      portable: !!process.env.PORTABLE_EXECUTABLE_DIR,
    };
    cached = { at: Date.now(), info };
    currentInfo = info;
    pruneOldInstallers(asset.name);
    return info;
  } catch (error) {
    // 检查失败不弹窗：关于页按钮上会显示可重试的失败态，这里静默记日志即可
    log.warn("update check failed", error);
    return null;
  }
}

let notify: ((s: UpdateState) => void) | null = null;

/** 主进程注册推送回调（与 onVadStatus 同款模式） */
export function onUpdateState(cb: (s: UpdateState) => void): void {
  notify = cb;
}

let state: UpdateState | null = null;

function setState(next: UpdateState): void {
  state = next;
  notify?.(next);
}

let currentInfo: UpdateInfo | null = null;
let downloadedPath: string | null = null;
let abort: AbortController | null = null;

/** 已下完整包且大小与远端一致：restart 后据此直接显示「安装并重启」，不再重下 ~100MB */
function installerReady(info: UpdateInfo): string | null {
  const dest = join(updateDir(), info.fileName);
  return existsSync(dest) && statSync(dest).size === info.size ? dest : null;
}

/** 恢复用：页面打开时读当前状态；已下完的显示 ready，否则有可续传残片时按残片进度显示（partial 标记区分于活跃下载） */
export function updateState(): UpdateState | null {
  if (state) return state;
  const info = currentInfo ?? cached?.info;
  if (!info) return null;
  if (installerReady(info)) return { phase: "ready", progress: 100 };
  const partial = partialProgress(join(updateDir(), info.fileName));
  if (!partial) return null;
  return { phase: "downloading", progress: Math.floor((partial.got / partial.total) * 100), partial: true };
}

/**
 * 下载安装包：单源 GitHub 直链——发布资产没有官方 sha256，加第三方代理镜像等于让不明中间人
 * 供二进制，不干；断点续传/停滞重试语义与模型下载一致。目标只取主进程 checkUpdate 的结果，
 * 不吃渲染层传参（fileName 会直接进 join 与 URL，不可信）
 */
export async function downloadUpdate(): Promise<void> {
  const info = currentInfo ?? cached?.info;
  if (!info || abort) return;
  const dest = join(updateDir(), info.fileName);
  // 上次已下完未安装：直接就绪
  if (installerReady(info)) {
    downloadedPath = dest;
    setState({ phase: "ready", progress: 100 });
    return;
  }
  abort = new AbortController();
  // 用磁盘残片进度做起点：续传场景下进度条从上次位置继续，不在建连间隙跳回 0
  const seed = partialProgress(dest);
  setState({ phase: "downloading", progress: seed ? Math.floor((seed.got / seed.total) * 100) : 0 });
  try {
    await downloadFile(
      [`https://github.com/wookat/speaktype/releases/download/${info.tag}/${info.fileName}`],
      dest,
      (got, total) => {
        if (total > 0) setState({ phase: "downloading", progress: Math.floor((got / total) * 100) });
      },
      abort.signal,
      (phase, source) => {
        // retrying/verifying 期间保留已到百分比，进度条不回跳
        setState({ phase, progress: state?.progress ?? 0, ...(phase === "retrying" && source ? { source } : {}) });
      },
    );
    downloadedPath = dest;
    setState({ phase: "ready", progress: 100 });
    log.info(`update installer ready: ${info.fileName}`);
  } catch (error) {
    if (error instanceof DownloadCancelled) {
      // 用户取消：残片保留，状态切到「可续传」而非清空——正在显示的进度条立即变成续传按钮
      setState({ phase: "downloading", progress: state?.progress ?? 0, partial: true });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    setState({ phase: "error", progress: state?.progress ?? 0, error: message });
    log.warn("update download failed", error);
  } finally {
    abort = null;
  }
}

export function cancelUpdateDownload(): void {
  abort?.abort(new DownloadCancelled());
}

/** 安装并退出：NSIS assisted + /S 静默装（per-user），装完由安装器拉起新版本；便携版只定位文件 */
export function installUpdate(): void {
  if (!downloadedPath) return;
  if (currentInfo?.portable) {
    void shell.showItemInFolder(downloadedPath);
    return;
  }
  log.info(`update install: quitting and running ${downloadedPath}`);
  // 先拉起安装器再退出：spawn detached 让它脱离本进程生命周期，app.quit() 异步收尾不抢跑。
  // --force-run 必须带：NSIS assisted 安装器静默（/S）模式默认装完不自启，只有该标志才拉起新版本
  //（模板 installSection.nsh：${if} ${isForceRun} ${andIf} ${Silent} → doStartApp，本机已实测）
  try {
    const child = spawn(downloadedPath, ["/S", "--force-run"], { detached: true, stdio: "ignore" });
    child.unref();
    app.quit();
  } catch (error) {
    // 安装包被杀软隔离/手删等：回到错误态给重试入口，而不是让拒绝悬空、按钮无响应
    const message = error instanceof Error ? error.message : String(error);
    setState({ phase: "error", progress: 100, error: message });
    log.warn("update install failed", error);
  }
}
