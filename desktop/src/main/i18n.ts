import { app } from "electron";
import { makeTranslator, resolveLanguage, type LocaleKey, type Translator } from "../shared/i18n";
import { getSettings } from "./store";

/** 主进程侧翻译：每次取用都按当前设置解析，语言切换即时生效 */
export function currentLanguage(): "zh-CN" | "en" {
  return resolveLanguage(getSettings().uiLanguage, app.getLocale() || "zh-CN");
}

export function t(key: LocaleKey, vars?: Record<string, string | number>): string {
  return makeTranslator(currentLanguage())(key, vars);
}

export function translator(): Translator {
  return makeTranslator(currentLanguage());
}
