import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

/**
 * 统一的按需下载：VAD 模型、本地 ASR 模型、增强标点模型共用。
 * 多源顺序回退（直连失败落镜像）、先落 .part 再改名、失败清理残片。
 */

/** HuggingFace 仓内路径 → 直连 + 国内镜像两个候选 URL */
export function hfSources(path: string): string[] {
  return [`https://huggingface.co/${path}`, `https://hf-mirror.com/${path}`];
}

/** 下载单个文件到 dest：依次尝试 sources 里的完整 URL，全部失败抛最后一个错误 */
export async function downloadFile(
  sources: string[],
  dest: string,
  onProgress?: (got: number, total: number) => void,
): Promise<void> {
  let res: Response | null = null;
  let lastError: unknown = null;
  for (const url of sources) {
    try {
      const r = await fetch(url);
      if (r.ok && r.body) {
        res = r;
        break;
      }
      lastError = new Error(`HTTP ${r.status} (${new URL(url).host})`);
    } catch (error) {
      lastError = error;
    }
  }
  if (!res || !res.body) throw lastError instanceof Error ? lastError : new Error(String(lastError));

  mkdirSync(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const total = Number(res.headers.get("content-length")) || 0;
  let got = 0;
  const out = createWriteStream(part);
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
    renameSync(part, dest);
  } catch (error) {
    out.destroy();
    rmSync(part, { force: true });
    throw error;
  }
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
