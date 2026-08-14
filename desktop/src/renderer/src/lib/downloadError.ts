import type { Translator } from "../i18n";

/** 把下载底层异常串归类成面向用户的提示（无法归类时原样透出便于排障） */
export function humanDownloadError(message: string, t: Translator): string {
  if (/sha256 mismatch|incomplete download/i.test(message)) return t("download.errChecksum");
  if (/EACCES|EPERM|EBUSY|ENOSPC|EROFS|EMFILE|permission denied|no space left/i.test(message))
    return t("download.errStorage");
  if (/fetch failed|HTTP \d{3}|too many redirects|incomplete: \d|ENOTFOUND|ETIMEDOUT|ECONN|EAI_AGAIN|network/i.test(message))
    return t("download.errNetwork");
  return message;
}
