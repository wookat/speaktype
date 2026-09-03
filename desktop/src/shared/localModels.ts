/** 本地离线模型清单：main 的推理/下载与 store 的导入校验共用同一份 id 白名单 */

/** SenseVoice 模型 id；localModel 等于它时走 sherpa-onnx 而不是 whisper-server */
export const SENSEVOICE = "sensevoice-small";

/** Parakeet TDT 0.6B v3（sherpa-onnx int8）：英语及 25 种欧洲语言，自动语种检测，不支持中文 */
export const PARAKEET = "parakeet-tdt-0.6b-v3";

export const LOCAL_MODELS = [
  { id: SENSEVOICE, size: "234MB" },
  { id: PARAKEET, size: "660MB" },
  { id: "tiny-q5_1", size: "32MB" },
  { id: "base-q5_1", size: "60MB" },
  { id: "small-q5_1", size: "190MB" },
] as const;

/** 走 sherpa-onnx 进程内推理的模型（否则走 whisper-server 子进程） */
export function isSherpaModel(model: string): boolean {
  return model === SENSEVOICE || model === PARAKEET;
}

export const LOCAL_MODEL_IDS: ReadonlyArray<string> = LOCAL_MODELS.map((m) => m.id);
