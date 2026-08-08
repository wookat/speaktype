import { micErrorFromSpeech } from "@/lib/mic";
import type { AsrProvider, AsrSession } from "./types";

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; 0: { transcript: string } };
  };
}

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | undefined {
  const w = globalThis as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const webSpeechAvailable = () => getCtor() !== undefined;

/**
 * 浏览器原生识别：零配置降级方案，无需任何 API key。
 * 缺点是无标点/ITN、长句准确率一般，所以只作为兜底。
 */
export const webSpeechProvider: AsrProvider = {
  id: "webspeech",
  needsPcm: false,
  async start({ settings, onPartial }) {
    const Ctor = getCtor();
    if (!Ctor) throw new Error("此浏览器不支持 Web Speech 识别，请在设置里配置火山或智谱 provider");

    const rec = new Ctor();
    rec.lang = settings.language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = "";
    let error: string | null = null;
    let ended = false;
    const endedWaiters: Array<() => void> = [];
    // 权限被拒时 onerror 在 start() 之后才异步到达，得在这里就变成启动失败，
    // 否则用户要说完松手才看到报错
    let settleStart: ((code: string | null) => void) | null = null;
    const started = new Promise<string | null>((resolve) => {
      settleStart = resolve;
      setTimeout(() => resolve(null), 1200);
    });

    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (!result) continue;
        const text = result[0].transcript;
        if (result.isFinal) finalText += text;
        else interim += text;
      }
      onPartial(finalText + interim);
    };
    rec.onerror = (ev) => {
      if (ev.error !== "aborted" && ev.error !== "no-speech") error = ev.error;
      settleStart?.(ev.error);
    };
    rec.onstart = () => settleStart?.(null);
    rec.onend = () => {
      ended = true;
      for (const w of endedWaiters.splice(0)) w();
    };
    rec.start();

    const startError = await started;
    if (startError) {
      rec.abort();
      const mic = micErrorFromSpeech(startError);
      if (mic) throw mic;
      throw new Error(`浏览器内置识别启动失败：${startError}`);
    }

    const session: AsrSession = {
      pushPcm() {},
      async finish() {
        rec.stop();
        if (!ended) {
          await new Promise<void>((resolve) => {
            endedWaiters.push(resolve);
            setTimeout(resolve, 3000);
          });
        }
        if (error) {
          const mic = micErrorFromSpeech(error);
          if (mic) throw mic;
          throw new Error(`浏览器内置识别失败：${error}`);
        }
        return finalText.trim();
      },
      cancel() {
        rec.abort();
      },
    };
    return session;
  },
};
