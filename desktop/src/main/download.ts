import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * 统一的按需下载：VAD 模型、本地 ASR 模型、增强标点模型共用。
 * 多源顺序回退（直连失败落镜像）、先落 .part 再改名、断点续传（Range + .part.json 元数据）、
 * sha256 完整性校验（HuggingFace LFS 的 ETag/X-Linked-ETag 即文件 sha256）。
 */

/** HuggingFace 仓内路径 → 直连 + 国内镜像两个候选 URL */
export function hfSources(path: string): string[] {
  return [`https://huggingface.co/${path}`, `https://hf-mirror.com/${path}`];
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

/** HF LFS 的 ETag/X-Linked-ETag 是文件 sha256（64 位十六进制）；其他情况返回空 */
function sha256FromHeaders(headers: Headers): string {
  const raw = (headers.get("x-linked-etag") || headers.get("etag") || "").replaceAll('"', "").replace(/^W\//, "");
  return /^[0-9a-f]{64}$/i.test(raw) ? raw.toLowerCase() : "";
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
    if (offset > 0) headers["range"] = `bytes=${offset}-`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} (${new URL(url).host})`);

  const resumed = res.status === 206 && offset > 0;
  if (!resumed) offset = 0;
  const expected = sha256FromHeaders(res.headers);
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
