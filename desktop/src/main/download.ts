import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import log from "electron-log";

/**
 * 统一的按需下载：VAD 模型、本地 ASR 模型、增强标点模型共用。
 * 多源顺序回退（直连失败落镜像再落 GitHub Releases 自托管）、先落 .part 再改名、
 * 断点续传（Range + .part.json 元数据）、sha256 完整性校验（取 302 的 X-Linked-ETag）。
 */

const GH_RELEASE_BASE = "https://github.com/wookat/speaktype/releases/download/models-v1/";

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
  if (gh) sources.push(gh);
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
function sha256FromHeaders(headers: Headers): string {
  const raw = (headers.get("x-linked-etag") || "").replaceAll('"', "").replace(/^W\//, "");
  return /^[0-9a-f]{64}$/i.test(raw) ? raw.toLowerCase() : "";
}

/** 手动跟随重定向，沿途捕获 X-Linked-ETag（fetch 自动跟随会吞掉 302 响应头） */
async function fetchFollow(
  url: string,
  headers: Record<string, string>,
): Promise<{ res: Response; linkedSha256: string }> {
  let current = url;
  let linkedSha256 = "";
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(current, { headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      linkedSha256 ||= sha256FromHeaders(res.headers);
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) return { res, linkedSha256 };
      current = new URL(location, current).toString();
      continue;
    }
    linkedSha256 ||= sha256FromHeaders(res.headers);
    return { res, linkedSha256 };
  }
  throw new Error(`too many redirects (${new URL(url).host})`);
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
 * - .part + .part.json 元数据匹配（同 etag）时发 Range 续传，服务端不支持（200）则重下；
 * - 边下边算 sha256，结束后与 HF ETag 比对，不匹配删残片抛错；
 * - 网络中断保留 .part 供下次续传，只有校验失败才删。
 */
async function downloadFromUrl(
  url: string,
  dest: string,
  onProgress?: (got: number, total: number) => void,
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const metaPath = `${part}.json`;

  let offset = 0;
  const meta = existsSync(part) ? readMeta(metaPath) : null;
  const headers: Record<string, string> = {};
  if (meta && meta.url === url) {
    offset = statSync(part).size;
    // 已下满但在校验/改名前被杀：直接本地收尾，不发 Range（服务端会回 416 被误判源失败）
    if (meta.total > 0 && offset >= meta.total) {
      const want = meta.etag || knownSha256(url);
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

  const { res, linkedSha256 } = await fetchFollow(url, headers);
  const expected = linkedSha256 || knownSha256(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} (${new URL(url).host})`);

  const resumed = res.status === 206 && offset > 0;
  if (!resumed) offset = 0;
  if (resumed && meta && expected && meta.etag && meta.etag !== expected) {
    // 服务端文件已变化，续传无意义：从头重下
    rmSync(part, { force: true });
    rmSync(metaPath, { force: true });
    return downloadFromUrl(url, dest, onProgress);
  }
  const remaining = Number(res.headers.get("content-length")) || 0;
  const total = resumed ? offset + remaining : remaining;
  writeFileSync(metaPath, JSON.stringify({ url, etag: expected, total } satisfies PartMeta));

  let got = offset;
  const out = createWriteStream(part, resumed ? { flags: "a" } : {});
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      got += buf.length;
      if (!out.write(buf)) await new Promise<void>((r) => out.once("drain", () => r()));
      onProgress?.(got, total);
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  } catch (error) {
    // 网络中断：保留 .part 与元数据，下次续传
    out.destroy();
    throw error;
  }

  if (total && got !== total) throw new Error(`incomplete: ${got}/${total} bytes (${new URL(url).host})`);
  if (expected) {
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

/** 下载单个文件到 dest：依次尝试 sources 里的完整 URL，全部失败抛最后一个错误 */
export async function downloadFile(
  sources: string[],
  dest: string,
  onProgress?: (got: number, total: number) => void,
): Promise<void> {
  let lastError: unknown = null;
  for (const url of sources) {
    try {
      await downloadFromUrl(url, dest, onProgress);
      return;
    } catch (error) {
      lastError = error;
      log.warn(`download source failed: ${url}`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 下载一组文件（已存在的跳过），总进度按文件个数均分 */
export async function downloadFiles(
  files: Array<{ sources: string[]; dest: string }>,
  onProgress: (percent: number) => void,
): Promise<void> {
  for (const [index, file] of files.entries()) {
    if (existsSync(file.dest)) continue;
    await downloadFile(file.sources, file.dest, (got, total) => {
      if (total) onProgress(Math.floor(((index + got / total) / files.length) * 100));
    });
  }
}
