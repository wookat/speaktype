export const REPO_URL = "https://github.com/wookat/speaktype";

const ASR_PRESETS: Array<{ id: string; label: string; baseUrl: string; model: string }> = [
  { id: "openai", label: "OpenAI Whisper", baseUrl: "https://api.openai.com/v1", model: "whisper-1" },
  {
    id: "siliconflow",
    label: "（免费模型）SiliconFlow 硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "FunAudioLLM/SenseVoiceSmall",
  },
  { id: "groq", label: "（免费额度）Groq Whisper", baseUrl: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo" },
  { id: "fireworks", label: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", model: "whisper-v3-turbo" },
  { id: "mistral", label: "Mistral Voxtral", baseUrl: "https://api.mistral.ai/v1", model: "voxtral-mini-latest" },
  {
    id: "bailian",
    label: "阿里云百炼 (Qwen ASR)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3-asr-flash",
  },
  { id: "local", label: "本地 Whisper (faster-whisper-server)", baseUrl: "http://127.0.0.1:8000/v1", model: "Systran/faster-whisper-small" },
];

const MODEL_PRESETS: Array<{ id: string; label: string; baseUrl: string; model: string }> = [
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "zhipu", label: "（免费）智谱 GLM-4-Flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  {
    id: "siliconflow",
    label: "（免费模型）SiliconFlow 硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-7B-Instruct",
  },
  {
    id: "openrouter",
    label: "（免费模型）OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
  { id: "kimi", label: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { id: "qwen", label: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "ollama", label: "Ollama（本地）", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
];

const MAX_HOTWORDS = 300;
const MAX_HOTWORD_LEN = 20;
export { ASR_PRESETS, MODEL_PRESETS, MAX_HOTWORDS, MAX_HOTWORD_LEN };
