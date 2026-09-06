import type { Translator } from "../i18n";
import type { LocalModelStatus } from "../../../shared/types";

/** 下载进行中百分比之外的可行动状态文案（连接中断重试 / 校验完整性）；平稳下载返回 null */
export function downloadPhaseText(local: LocalModelStatus | null, t: Translator): string | null {
  if (!local?.downloading) return null;
  if (local.phase === "retrying") {
    const s = local.source;
    return s && s.total > 1
      ? t("download.retryingSource", { index: s.index, total: s.total, host: s.host })
      : t("download.retrying");
  }
  if (local.phase === "verifying") return t("download.verifying");
  return null;
}

/** 下载按钮文案：字节下满后在算 sha256 时显示「校验中」，不再停在「下载中 100%」 */
export function downloadingLabel(local: LocalModelStatus, t: Translator): string {
  if (local.phase === "verifying") return t("settings.localModelVerifying");
  return t("settings.localModelDownloading", { progress: String(local.progress) });
}

/** 把下载底层异常串归类成面向用户的提示（无法归类时原样透出便于排障） */
export function humanDownloadError(message: string, t: Translator): string {
  if (/sha256 mismatch|incomplete download/i.test(message)) return t("download.errChecksum");
  if (/EACCES|EPERM|EBUSY|ENOSPC|EROFS|EMFILE|permission denied|no space left/i.test(message))
    return t("download.errStorage");
  if (/HTTP 404/.test(message)) return t("download.errNotFound");
  if (/HTTP 5\d\d/.test(message)) return t("download.errServer");
  // net::ERR_* 是 Electron net.request（Chromium 网络栈）的连接类错误串
  if (/fetch failed|HTTP \d{3}|too many redirects|stalled|incomplete: \d|ENOTFOUND|ETIMEDOUT|ECONN|EAI_AGAIN|net::ERR_|network|abort/i.test(message))
    return t("download.errNetwork");
  return message;
}
