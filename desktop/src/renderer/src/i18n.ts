import { makeTranslator, resolveLanguage, type Translator } from "../../shared/i18n";
import type { UiLanguage } from "../../shared/types";

export function getT(uiLanguage: UiLanguage, systemLocale: string): Translator {
  return makeTranslator(resolveLanguage(uiLanguage, systemLocale));
}

export type { Translator };
