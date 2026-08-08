import { storage } from "#imports";
import { BUILTIN_PERSONAS } from "./personas";
import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  provider: "doubao",
  proxyUrl: "",
  volcAppKey: "",
  volcAccessKey: "",
  zhipuApiKey: "",
  doubaoAppKey: "",
  language: "zh-CN",
  personaId: "default",
  personas: BUILTIN_PERSONAS,
  polish: true,
  autoInsert: true,
};

const item = storage.defineItem<Settings>("local:settings", {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<Settings> {
  const stored = await item.getValue();
  // 合并默认值，避免升级后新增字段为 undefined
  return { ...DEFAULT_SETTINGS, ...stored, personas: stored.personas?.length ? stored.personas : BUILTIN_PERSONAS };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await item.setValue(next);
  return next;
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  return item.watch((value) => cb({ ...DEFAULT_SETTINGS, ...value }));
}
