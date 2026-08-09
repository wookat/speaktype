import type { UiLanguage } from "./types";
import { zhCN, type LocaleDict, type LocaleKey } from "./locales/zh-CN";
import { en } from "./locales/en";
import { zhTW } from "./locales/zh-TW";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";

/** 主进程与渲染进程共用的轻量 i18n：key 集合以 zh-CN 为基准，类型层面保证不漏译 */

const DICTS: Record<Exclude<UiLanguage, "system">, LocaleDict> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  en,
  ja,
  ko,
};

export const UI_LANGUAGES: Array<{ value: UiLanguage; label: string }> = [
  { value: "system", label: "" }, // label 走 t("settings.followSystem")
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
];

export function resolveLanguage(setting: UiLanguage, systemLocale: string): Exclude<UiLanguage, "system"> {
  if (setting !== "system") return setting;
  const locale = systemLocale.toLowerCase();
  if (locale.startsWith("zh")) {
    return locale.includes("tw") || locale.includes("hk") || locale.includes("mo") || locale.includes("hant")
      ? "zh-TW"
      : "zh-CN";
  }
  if (locale.startsWith("ja")) return "ja";
  if (locale.startsWith("ko")) return "ko";
  return "en";
}

export type Translator = (key: LocaleKey, vars?: Record<string, string | number>) => string;

export function makeTranslator(lang: Exclude<UiLanguage, "system">): Translator {
  const dict = DICTS[lang] ?? zhCN;
  return (key, vars) => {
    let text = dict[key] ?? zhCN[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{{${name}}}`, String(value));
      }
    }
    return text;
  };
}

export type { LocaleKey };
