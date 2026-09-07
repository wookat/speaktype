import type { Translator } from "../i18n";
import { LOCAL_MODELS, PARAKEET_FP32 } from "../../../shared/localModels";

/** 本地模型的用户可读名，如「Parakeet 原精度 (2.5GB)」；清单外的 id 原样返回 */
export function localModelLabel(id: string, t: Translator, withSize = true): string {
  const m = LOCAL_MODELS.find((x) => x.id === id);
  if (!m) return id;
  const name = id === PARAKEET_FP32 ? `${m.name} ${t("settings.localModelFp32")}` : m.name;
  return withSize ? `${name} (${m.size})` : name;
}
