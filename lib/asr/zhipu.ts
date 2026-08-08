import { pcmToWav } from "../audio/capture";
import type { AsrProvider, AsrSession } from "./types";

const ZHIPU_TRANSCRIBE = "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions";
const MODEL = "glm-asr-2512";

/**
 * 智谱 GLM-ASR：一次性转写（非流式），说完再上传。
 * 单段音频限制 30s / 25MB，所以适合「短句速记」场景。
 * 优先走中转（不暴露服务端 key）；用户自带 key 时可直连。
 */
export const zhipuProvider: AsrProvider = {
  id: "zhipu",
  needsPcm: true,
  async start({ settings, onPartial }) {
    const frames: Int16Array[] = [];
    let aborted = false;

    const session: AsrSession = {
      pushPcm(frame) {
        frames.push(frame);
      },
      async finish() {
        if (aborted || frames.length === 0) return "";
        onPartial("识别中…");
        const wav = pcmToWav(frames);
        const form = new FormData();
        form.append("file", wav, "speech.wav");
        form.append("model", MODEL);

        const direct = Boolean(settings.zhipuApiKey);
        const url = direct ? ZHIPU_TRANSCRIBE : `${settings.proxyUrl.replace(/\/$/, "")}/asr/zhipu`;
        if (!direct && !settings.proxyUrl) {
          throw new Error("智谱 provider 需要填写 API key 或中转地址");
        }
        const res = await fetch(url, {
          method: "POST",
          headers: direct ? { Authorization: `Bearer ${settings.zhipuApiKey}` } : {},
          body: form,
        });
        if (!res.ok) throw new Error(`智谱转写失败 ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = (await res.json()) as { text?: string };
        return (data.text ?? "").trim();
      },
      cancel() {
        aborted = true;
        frames.length = 0;
      },
    };
    return session;
  },
};
