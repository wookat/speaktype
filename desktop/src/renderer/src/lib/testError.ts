import type { Translator } from "../i18n";

/** 网络层原始错误串（fetch failed/ECONNREFUSED 等）对用户无意义，映射成可行动的人话 */
export function humanTestError(detail: string, t: Translator): string {
  return /fetch failed|ENOTFOUND|ETIMEDOUT|ECONN|EAI_AGAIN|EPIPE|socket hang up|network error/i.test(detail)
    ? t("settings.testErrNetwork")
    : detail;
}
