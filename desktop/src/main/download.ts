import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { net } from "electron";
import log from "electron-log";
import type { DownloadSource } from "../shared/types";

/**
 * 统一的按需下载：VAD 模型、本地 ASR 模型、增强标点模型共用。
 * 多源顺序回退（直连失败落镜像再落 GitHub Releases 自托管）、先落 .part 再改名、
 * 断点续传（Range + .part.json 元数据）、sha256 完整性校验（取 302 的 X-Linked-ETag）。
 *
 * 传输层走 Electron net（Chromium 网络栈）而不是 Node fetch：Electron 43 内置 undici 7.29 的
 * HTTP/1 解析器在「写盘背压暂停期间对端关闭连接」时会以 assert(!this.paused) 断言直接崩掉主进程
 *（nodejs/undici#5360），Connection: close 的代理/CDN 下载大文件必现，应用层 try/catch 接不住。
 */

const GH_RELEASE_BASE = "https://github.com/wookat/speaktype/releases/download/models-v1/";

/** 响应头或正文连续无数据的上限：半开连接（服务端接了 TCP 不应答）不会自己报错，要靠它落下一源 */
const STALL_TIMEOUT_MS = 30_000;
/** 连续无数据超过这么久就告知 UI「连接中断，正在重试」：进度条冻着不说话，用户会以为卡死 */
const STALL_NOTICE_MS = 8_000;

/**
 * 下载阶段，供 UI 在百分比之外给出可行动状态：
 * retrying = 连接停滞或本源失败正切下一源；verifying = 字节已下满、正在算 sha256（大文件要几秒，不是卡住）
 */
export type DownloadPhase = "downloading" | "retrying" | "verifying";
/** 阶段回调附带当前源序号/主机，重试时 UI 能说清「正在换到第 N 个源」 */
export type PhaseCallback = (phase: DownloadPhase, source?: DownloadSource) => void;

/**
 * 空闲超时守卫：每收到一块数据重新计时，连续 STALL_TIMEOUT_MS 无数据则 abort 整个请求；
 * 外部 signal（用户取消）触发时同样中止当前请求。数据恢复时通过 onStall(false) 通知 UI 回到下载态。
 */
function stallGuard(
  host: string,
  external?: AbortSignal,
  onStall?: (stalled: boolean) => void,
): { signal: AbortSignal; touch: () => void; clear: () => void } {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let notice: NodeJS.Timeout | null = null;
  let stalled = false;
  const onExternalAbort = (): void => controller.abort(external?.reason);
  external?.addEventListener("abort", onExternalAbort, { once: true });
  const touch = (): void => {
    if (timer) clearTimeout(timer);
    if (notice) clearTimeout(notice);
    if (stalled) {
      stalled = false;
      onStall?.(false);
    }
    timer = setTimeout(
      () => controller.abort(new Error(`stalled: no data for ${STALL_TIMEOUT_MS / 1000}s (${host})`)),
      STALL_TIMEOUT_MS,
    );
    notice = setTimeout(() => {
      stalled = true;
      onStall?.(true);
    }, STALL_NOTICE_MS);
  };
  touch();
  return {
    signal: controller.signal,
    touch,
    clear: () => {
      if (timer) clearTimeout(timer);
      if (notice) clearTimeout(notice);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

/** 用户主动取消的下载中断（与网络错误区分：不算失败、不换源、不记错误） */
export class DownloadCancelled extends Error {
  constructor() {
    super("download cancelled");
    this.name = "DownloadCancelled";
  }
}

/** models-v1 自托管资产的 sha256 清单（与上游 HF LFS oid 逐一核对）：GH 直链没有
X-Linked-ETag，第三源恰是前两源都挂的兜底场景，更需要完整性保护 */
const GH_ASSET_SHA256: Record<string, string> = {
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17-model.int8.onnx": "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51",
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17-tokens.txt": "f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc",
  "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8-encoder.int8.onnx": "acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247",
  "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8-decoder.int8.onnx": "179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e",
  "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8-joiner.int8.onnx": "3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3",
  "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8-tokens.txt": "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
};

function knownSha256(url: string): string {
  return url.startsWith(GH_RELEASE_BASE) ? GH_ASSET_SHA256[url.slice(GH_RELEASE_BASE.length)] || "" : "";
}

/** 自托管镜像：models-v1 Release 里的资产名 = 仓名最后一段 + 文件路径拼平 */
function ghAssetSource(path: string): string | null {
  const [repo, file] = path.split("/resolve/main/");
  if (!repo || !file) return null;
  const asset = `${repo.split("/").pop()}-${file.replaceAll("/", "-")}`;
  return `${GH_RELEASE_BASE}${asset}`;
}

/**
 * HuggingFace 仓内路径 → 直连 + 镜像 + GitHub Releases 自托管三个候选 URL。
 * 注意 hf-mirror.com 对部分仓会 308 回源 huggingface.co（实测 2026-08），并非独立源，
 * 所以附加自托管第三源兜底（不存在的资产 404 后正常报错）。
 */
export function hfSources(path: string): string[] {
  const sources = [`https://huggingface.co/${path}`, `https://hf-mirror.com/${path}`];
  const gh = ghAssetSource(path);
  // 只对 models-v1 里真正存在的资产附加第三源：不存在的资产必产 404，
  // 会以「最后一个错误」覆盖前两源的真实失败原因
  if (gh && knownSha256(gh)) sources.push(gh);
  return sources;
}

interface PartMeta {
  url: string;
  etag: string;
  total: number;
}

function readMeta(metaPath: string): PartMeta | null {
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as PartMeta;
  } catch {
    return null;
  }
}

/**
 * HF LFS 文件真正的 sha256 只在 302 重定向响应的 X-Linked-ETag 里（与 /raw/main LFS pointer
 * 的 oid 一致）；跟随跳转后 CDN 终端响应的 etag 可能恰好是 64 位 hex 却不是文件 sha256
 *（xet 桥对象 etag），绝不能当期望值。因此只认 X-Linked-ETag。
 */
function sha256FromHeaders(headers: Record<string, string | string[]>): string {
  const value = headers["x-linked-etag"];
  const raw = (Array.isArray(value) ? value[0] || "" : value || "").replaceAll('"', "").replace(/^W\//, "");
  return /^[0-9a-f]{64}$/i.test(raw) ? raw.toLowerCase() : "";
}

interface OpenedResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: Readable;
  linkedSha256: string;
  /** 不再读正文时中止请求（非 2xx、需从头重下等提前退出路径） */
  discard: () => void;
}

/**
 * 发起 GET 并等到响应头：手动跟随重定向，沿途捕获 X-Linked-ETag（自动跟随会吞掉 302 响应头）；
 * signal 中止时无论处于连接、等响应头还是读正文阶段都取消请求，正文流随之提前关闭
 */
function openRequest(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<OpenedResponse> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: "GET", redirect: "manual", cache: "no-store", useSessionCookies: false });
    for (const [name, value] of Object.entries(headers)) req.setHeader(name, value);
    let linkedSha256 = "";
    const onAbort = (): void => req.abort();
    const unlink = (): void => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    // 注意 ClientRequest 的 close 在请求体发完就触发（早于 response），不能拿它当事务结束；
    // 正文读完/中断以 response 的 close 为准
    req.on("redirect", (_status, _method, _redirectUrl, responseHeaders) => {
      linkedSha256 ||= sha256FromHeaders(responseHeaders);
      req.followRedirect();
    });
    req.on("response", (res) => {
      // Electron IncomingMessage 实现了 Readable 接口，类型声明里只标了 EventEmitter
      const body = res as unknown as Readable;
      body.on("close", unlink);
      resolve({
        status: res.statusCode,
        headers: res.headers,
        body,
        linkedSha256: linkedSha256 || sha256FromHeaders(res.headers),
        discard: () => req.abort(),
      });
    });
    req.on("error", (error) => {
      unlink();
      reject(error);
    });
    req.on("abort", () => {
      unlink();
      reject(signal.reason instanceof Error ? signal.reason : new Error("request aborted"));
    });
    req.end();
  });
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", resolve)
      .on("error", reject);
  });
  return hash.digest("hex");
}

/**
 * 从单个 URL 下载到 dest（内部）：
 * - .part + .part.json 元数据存在时发 Range 续传（同一 dest 的各源是同一文件，换源也续；etag 不一致才重下），
 *   服务端不支持（200）则重下；
 * - 响应头/正文连续 STALL_TIMEOUT_MS 无数据则中止，交给上层换源；
 * - 边下边算 sha256，结束后与 HF ETag 比对，不匹配删残片抛错；
 * - 网络中断保留 .part 供下次续传，只有校验失败才删。
 */
async function downloadFromUrl(
  url: string,
  dest: string,
  onProgress?: (got: number, total: number) => void,
  signal?: AbortSignal,
  onPhase?: PhaseCallback,
): Promise<void> {
  if (signal?.aborted) throw new DownloadCancelled();
  mkdirSync(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const metaPath = `${part}.json`;

  let offset = 0;
  const meta = existsSync(part) ? readMeta(metaPath) : null;
  const headers: Record<string, string> = {};
  if (meta) {
    offset = statSync(part).size;
    // 已下满但在校验/改名前被杀：直接本地收尾，不发 Range（服务端会回 416 被误判源失败）
    if (meta.total > 0 && offset >= meta.total) {
      const want = meta.etag || knownSha256(url);
      if (want) onPhase?.("verifying");
      if (offset === meta.total && (!want || (await hashFile(part)) === want)) {
        rmSync(metaPath, { force: true });
        renameSync(part, dest);
        return;
      }
      rmSync(part, { force: true });
      rmSync(metaPath, { force: true });
      offset = 0;
    } else if (offset > 0) {
      headers["range"] = `bytes=${offset}-`;
    }
  }

  onPhase?.("downloading");
  const guard = stallGuard(new URL(url).host, signal, (stalled) => onPhase?.(stalled ? "retrying" : "downloading"));
  // 中止后底层只报「流提前关闭」，真正原因（用户取消 / 停滞超时）在 signal 上
  const abortReason = (error: unknown): unknown => {
    if (signal?.aborted) return new DownloadCancelled();
    return guard.signal.aborted ? guard.signal.reason : error;
  };
  let res: OpenedResponse;
  try {
    res = await openRequest(url, headers, guard.signal);
  } catch (error) {
    guard.clear();
    throw abortReason(error);
  }
  if (res.status < 200 || res.status >= 300) {
    guard.clear();
    res.discard();
    throw new Error(`HTTP ${res.status} (${new URL(url).host})`);
  }

  const resumed = res.status === 206 && offset > 0;
  if (!resumed) offset = 0;
  // 换源续传时新源可能不带校验值，沿用首源记在元数据里的期望值，续传结果仍能整体校验
  const expected = res.linkedSha256 || knownSha256(url) || (resumed ? meta?.etag || "" : "");
  if (resumed && meta && expected && meta.etag && meta.etag !== expected) {
    // 服务端文件已变化，续传无意义：从头重下
    guard.clear();
    res.discard();
    rmSync(part, { force: true });
    rmSync(metaPath, { force: true });
    return downloadFromUrl(url, dest, onProgress, signal, onPhase);
  }
  const remaining = Number(res.headers["content-length"]) || 0;
  const total = resumed ? offset + remaining : remaining;
  writeFileSync(metaPath, JSON.stringify({ url, etag: expected, total } satisfies PartMeta));

  let got = offset;
  const out = createWriteStream(part, resumed ? { flags: "a" } : {});
  res.body.on("data", (chunk: Buffer) => {
    guard.touch();
    got += chunk.length;
    onProgress?.(got, total);
  });
  // pipeline 负责背压与两端收尾：写盘错误（ENOSPC 等）、对端断开、中止都以 reject 返回，
  // 不会变成进程级 uncaughtException，也不会在等 drain 时永久悬挂
  try {
    await pipeline(res.body, out);
    guard.clear();
  } catch (error) {
    // 网络中断 / 停滞超时 / 磁盘写满 / 用户取消：保留 .part 与元数据（已落盘前缀仍有效），下次续传
    guard.clear();
    throw abortReason(error);
  }

  if (total && got !== total) throw new Error(`incomplete: ${got}/${total} bytes (${new URL(url).host})`);
  if (expected) {
    onPhase?.("verifying");
    const actual = await hashFile(part);
    if (actual !== expected) {
      rmSync(part, { force: true });
      rmSync(metaPath, { force: true });
      throw new Error(`sha256 mismatch (${new URL(url).host})`);
    }
  }
  rmSync(metaPath, { force: true });
  renameSync(part, dest);
}

/** dest 对应的可续传残片进度（字节）；没有残片或元数据不可信时返回 null */
export function partialProgress(dest: string): { got: number; total: number } | null {
  const part = `${dest}.part`;
  if (!existsSync(part)) return null;
  const meta = readMeta(`${part}.json`);
  if (!meta || !Number.isFinite(meta.total) || meta.total <= 0) return null;
  const got = statSync(part).size;
  // 残片比元数据总长还大：元数据与文件已不对应，下次开始会丢弃重下，不能当“快下完了”展示
  if (got > meta.total) return null;
  return { got, total: meta.total };
}

/** 本机存储类错误：换源重试无意义，且对用户最可操作，报错时应优先选它 */
function isStorageError(error: unknown): boolean {
  return /EACCES|EPERM|EBUSY|ENOSPC|EROFS|EMFILE|permission denied|no space left/i.test(String(error));
}

/**
 * 下载单个文件到 dest：依次尝试 sources 里的完整 URL；全部失败时抛最可操作的错误：
 * 存储类优先；其次是非 404 的最后一个（某源缺资产是该源的问题，不该盖住其他源的网络/服务端错误）；
 * 全部 404 才报「文件不存在」。
 */
export async function downloadFile(
  sources: string[],
  dest: string,
  onProgress?: (got: number, total: number) => void,
  signal?: AbortSignal,
  onPhase?: PhaseCallback,
): Promise<void> {
  const errors: Error[] = [];
  const sourceAt = (i: number): DownloadSource => ({ index: i + 1, total: sources.length, host: new URL(sources[i]!).host });
  for (const [index, url] of sources.entries()) {
    const startedAt = Date.now();
    try {
      await downloadFromUrl(url, dest, onProgress, signal, (phase) => onPhase?.(phase, sourceAt(index)));
      log.info(`download ok: ${new URL(url).host} -> ${basename(dest)} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      return;
    } catch (error) {
      if (error instanceof DownloadCancelled) throw error;
      log.warn(`download source failed: ${url}`, error);
      const err = error instanceof Error ? error : new Error(String(error));
      if (isStorageError(err)) throw err;
      errors.push(err);
      // 还有下一源：换源期间（建连、等响应头）告知 UI 在重试，而不是让进度条无声冻着
      if (index < sources.length - 1) onPhase?.("retrying", sourceAt(index + 1));
    }
  }
  throw errors.filter((e) => !/HTTP 404/.test(e.message)).at(-1) ?? errors.at(-1) ?? new Error("no sources");
}

/** 下载一组文件（已存在的跳过）；全部文件带 size 时总进度按字节加权，否则按文件个数均分 */
export async function downloadFiles(
  files: Array<{ sources: string[]; dest: string; size?: number }>,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  onPhase?: PhaseCallback,
): Promise<void> {
  const weighted = files.every((f) => f.size && f.size > 0);
  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  let doneBytes = 0;
  for (const [index, file] of files.entries()) {
    if (existsSync(file.dest)) {
      if (!file.size || statSync(file.dest).size === file.size) {
        doneBytes += file.size || 0;
        continue;
      }
      // 大小与预期不符：损坏/截断文件，删掉重新下载
      rmSync(file.dest, { force: true });
    }
    await downloadFile(
      file.sources,
      file.dest,
      (got, total) => {
        if (!total) return;
        const percent =
          weighted && totalBytes > 0
            ? ((doneBytes + (got / total) * (file.size || 0)) / totalBytes) * 100
            : ((index + got / total) / files.length) * 100;
        onProgress(Math.floor(percent));
      },
      signal,
      onPhase,
    );
    doneBytes += file.size || 0;
  }
}
