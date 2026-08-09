import type { UiLanguage } from "./types";
import { zhCN, type LocaleDict, type LocaleKey } from "./locales/zh-CN";
import { en } from "./locales/en";

/** 主进程与渲染进程共用的轻量 i18n：key 集合以 zh-CN 为基准，类型层面保证不漏译 */

const DICTS: Record<Exclude<UiLanguage, "system">, LocaleDict> = {
  "zh-CN": zhCN,
  en,
};

export const UI_LANGUAGES: Array<{ value: UiLanguage; label: string }> = [
  { value: "system", label: "" }, // label 走 t("settings.followSystem")
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
];

export function resolveLanguage(setting: UiLanguage, systemLocale: string): Exclude<UiLanguage, "system"> {
  if (setting !== "system") return setting;
  return systemLocale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
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
