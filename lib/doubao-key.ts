/** 豆包语音入口 app key 的自动提取缓存位（与设置里的手填值分开） */
export const DOUBAO_APP_KEY_CACHE = "local:doubaoAppKeyCache";

export async function getDoubaoAppKeyCache(): Promise<string> {
  return (await storage.getItem<string>(DOUBAO_APP_KEY_CACHE)) ?? "";
}

export async function setDoubaoAppKeyCache(key: string): Promise<void> {
  await storage.setItem(DOUBAO_APP_KEY_CACHE, key);
}
