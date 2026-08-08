import type { Settings } from "../types";

export interface AsrSession {
  /** 仅 needsPcm 的 provider 需要喂音频 */
  pushPcm(frame: Int16Array): void;
  /** 结束说话，返回最终文本 */
  finish(): Promise<string>;
  cancel(): void;
}

export interface AsrStartOptions {
  settings: Settings;
  onPartial(text: string): void;
}

export interface AsrProvider {
  id: Settings["provider"];
  /** true 表示由本扩展采集 PCM 并推送；false 表示 provider 自己接管麦克风（Web Speech） */
  needsPcm: boolean;
  start(options: AsrStartOptions): Promise<AsrSession>;
}
