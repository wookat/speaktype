/** 本地离线模型清单：main 的推理/下载与 store 的导入校验共用同一份 id 白名单 */

/** SenseVoice 模型 id；localModel 等于它时走 sherpa-onnx 而不是 whisper-server */
export const SENSEVOICE = "sensevoice-small";

/** Parakeet TDT 0.6B v3（sherpa-onnx int8）：英语及 25 种欧洲语言，自动语种检测，不支持中文 */
export const PARAKEET = "parakeet-tdt-0.6b-v3";

/**
 * 同一 Parakeet 的 fp32 原精度版：int8 量化在个别首词（如 "Please"→"Ple"）处于判定边界会吞字
 *（离线 A/B：int8 15/99、fp32 0/99），fp32 消除该问题，代价是 2.5GB 下载、常驻内存约 2.7GB。
 */
export const PARAKEET_FP32 = "parakeet-tdt-0.6b-v3-fp32";

export const LOCAL_MODELS = [
  { id: SENSEVOICE, size: "234MB" },
  { id: PARAKEET, size: "660MB" },
  { id: PARAKEET_FP32, size: "2.5GB" },
  { id: "tiny-q5_1", size: "32MB" },
  { id: "base-q5_1", size: "60MB" },
  { id: "small-q5_1", size: "190MB" },
] as const;

/** 走 sherpa-onnx 进程内推理的模型（否则走 whisper-server 子进程） */
export function isSherpaModel(model: string): boolean {
  return model === SENSEVOICE || isParakeetModel(model);
}

/** Parakeet 两个精度版本共享同一套语义：自带语种检测、不吃 language 设置、不识中文 */
export function isParakeetModel(model: string): boolean {
  return model === PARAKEET || model === PARAKEET_FP32;
}

/**
 * whisper 非 large-v3 模型（本清单里的 tiny/base/small 全是）n_langs=99，词表不含 yue；
 * whisper.cpp 仍接受 language=yue 并把 yue(id 99) 编成 sot+100，即 translate 任务 token，
 * 实测 base-q5_1 同一段中文音频 language=zh 出中文、language=yue 出英文译文。
 * 这里把 yue 降到 zh：粤语音频按中文解码，虽不能保留粤语用词，至少不会被翻成英文。
 */
export function whisperLanguage(language: string): string {
  return language === "yue" ? "zh" : language;
}

/** 该本地模型能否原生识别粤语（SenseVoice 支持，whisper 小模型不支持，Parakeet 不识中文） */
export function supportsCantonese(model: string): boolean {
  return model === SENSEVOICE;
}

export const LOCAL_MODEL_IDS: ReadonlyArray<string> = LOCAL_MODELS.map((m) => m.id);
