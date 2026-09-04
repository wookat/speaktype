import { useEffect, useRef, useState } from "react";
import { FileAudio, Loader2 } from "lucide-react";
import { api } from "../api";
import { humanDownloadError } from "../lib/downloadError";
import { useLocalModelStatus } from "../lib/useLocalModelStatus";
import type { Translator } from "../i18n";
import type { Settings, TranscribeState } from "../../../shared/types";

const SR = 16000;
/** 上限 3 小时：16k 浮点采样约 660MB，超过容易把主进程拖爆 */
const MAX_SECONDS = 3 * 60 * 60;

/** 秒 → SRT 时间戳 HH:MM:SS,mmm */
function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`;
}

function clockTime(sec: number): string {
  const s = Math.floor(sec);
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
    : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

function saveText(content: string, filename: string, mime: string): void {
  // UTF-8 BOM：写字板等按 ANSI 猜编码的旧编辑器打开 CJK 不乱码
  const blob = new Blob(["\ufeff", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** WAV（RIFF/WAVE）从头部直接读出时长，免去全量解码；非 WAV 或解析失败返回 null */
async function wavDurationSeconds(file: File): Promise<number | null> {
  try {
    const head = new DataView(await file.slice(0, 65536).arrayBuffer());
    if (head.byteLength < 44) return null;
    if (head.getUint32(0, false) !== 0x52494646 || head.getUint32(8, false) !== 0x57415645) return null;
    let offset = 12;
    let byteRate = 0;
    while (offset + 8 <= head.byteLength) {
      const id = head.getUint32(offset, false);
      const size = head.getUint32(offset + 4, true);
      if (id === 0x666d7420 && offset + 20 <= head.byteLength) byteRate = head.getUint32(offset + 16, true);
      if (id === 0x64617461) {
        if (!byteRate || size === 0xffffffff) return null;
        return size / byteRate;
      }
      offset += 8 + size + (size % 2);
    }
    return null;
  } catch {
    return null;
  }
}

function Transcribe(props: {
  t: Translator;
  settings: Settings;
}) {
  const { t } = props;
  const [state, setState] = useState<TranscribeState>({ running: false, percent: 0, segments: [] });
  const [decoding, setDecoding] = useState(false);
  const [fileName, setFileName] = useState("");
  const [localError, setLocalError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  // 完成后短暂保留进度行占位，避免下方导出按钮瞬间上移到 Cancel 原位被误点
  const [settling, setSettling] = useState(false);
  const wasRunning = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wasRunning.current && !state.running) {
      wasRunning.current = false;
      setSettling(true);
      const timer = setTimeout(() => setSettling(false), 600);
      return () => clearTimeout(timer);
    }
    wasRunning.current = state.running;
    return undefined;
  }, [state.running]);

  useEffect(() => {
    // 切页回来接上进行中的任务
    void api.transcribeState().then(setState);
    return api.onTranscribeState(setState);
  }, []);

  const model = props.settings.localModel || "base-q5_1";
  const [local, setLocal] = useLocalModelStatus(model);
  const modelReady = Boolean(local?.downloaded);

  const busy = decoding || state.running;

  const handleFile = async (file: File) => {
    if (busy) return;
    setLocalError("");
    setCopied(false);
    setFileName(file.name);
    setDecoding(true);
    let ctx: AudioContext | null = null;
    try {
      // WAV 先读头预检时长：超长文件不必先全量解码占数百 MB 再报限
      const wavDur = await wavDurationSeconds(file);
      if (wavDur != null && wavDur > MAX_SECONDS) {
        setLocalError(t("transcribe.tooLong"));
        return;
      }
      const bytes = await file.arrayBuffer();
      // 16k 采样率的 AudioContext：decodeAudioData 会顺带重采样到目标采样率
      ctx = new AudioContext({ sampleRate: SR });
      const decoded = await ctx.decodeAudioData(bytes);
      if (decoded.duration > MAX_SECONDS) {
        setLocalError(t("transcribe.tooLong"));
        return;
      }
      // 多声道混为单声道
      const mono = new Float32Array(decoded.length);
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const data = decoded.getChannelData(ch);
        for (let i = 0; i < data.length; i++) mono[i] = (mono[i] ?? 0) + data[i]! / decoded.numberOfChannels;
      }
      setDecoding(false);
      await api.transcribeStart(mono.buffer, file.name);
    } catch {
      setLocalError(t("transcribe.decodeFailed"));
    } finally {
      setDecoding(false);
      void ctx?.close();
    }
  };

  const allText = state.segments.map((s) => s.text).join("\n");
  // 主进程的 fileName 优先：切页重挂载后组件本地的 fileName 为空，任务却还在跑
  const shownFileName = state.fileName || fileName;
  const exportBase = shownFileName.replace(/\.[^.]+$/, "") || "transcript";
  const exportTxt = () => saveText(`${allText}\n`, `${exportBase}.txt`, "text/plain;charset=utf-8");
  const exportSrt = () => {
    const srt = state.segments
      .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`)
      .join("\n");
    saveText(srt, `${exportBase}.srt`, "text/plain;charset=utf-8");
  };
  const copyAll = () => {
    void navigator.clipboard.writeText(allText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const done = !busy && state.percent === 100 && !state.error;
  const error = localError || state.error;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">
        {t("transcribe.title")}{" "}
        <span className="ml-2 text-sm font-normal text-slate-400">{t("transcribe.subtitle")}</span>
      </h1>

      {!modelReady && (
        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <div className="flex items-center justify-between gap-3">
            <span>{t("transcribe.noModel", { model })}</span>
            <button
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white disabled:opacity-40"
              disabled={Boolean(local?.downloading)}
              onClick={() => void api.localModelDownload(model).then(setLocal)}
            >
              {local?.downloading
                ? t("settings.localModelDownloading", { progress: String(local.progress) })
                : local?.partial != null
                  ? t("settings.localModelResume", { progress: String(local.partial) })
                  : t("settings.localModelDownload")}
            </button>
          </div>
          {local?.downloading && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${local.progress}%` }} />
            </div>
          )}
          {local?.error && !local.downloading && (
            <div className="mt-2 text-xs text-red-600">{humanDownloadError(local.error, t)}</div>
          )}
        </div>
      )}

      {model.startsWith("parakeet") && (
        <div className="mt-4 rounded-2xl bg-indigo-50 px-4 py-2.5 text-xs text-indigo-600">
          {t("transcribe.parakeetHint")}
        </div>
      )}

      <div
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
        role="button"
        tabIndex={busy ? -1 : 0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        {busy ? (
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        ) : (
          <FileAudio className="h-8 w-8 text-slate-300" />
        )}
        <div className="mt-3 text-sm text-slate-600">
          {decoding
            ? t("transcribe.decoding")
            : state.running
              ? t("transcribe.working", { percent: state.percent })
              : t("transcribe.drop")}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {busy && shownFileName ? shownFileName : t("transcribe.formats")}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/mp4,video/webm,.m4a,.aac,.opus"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {(state.running || settling) && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${state.percent}%` }} />
          </div>
          <button
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            disabled={!state.running}
            onClick={() => void api.transcribeCancel()}
          >
            {t("transcribe.cancel")}
          </button>
        </div>
      )}

      {error && <div className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}
      {done && state.segments.length === 0 && (
        <div className="mt-6 text-center text-sm text-slate-400">{t("transcribe.empty")}</div>
      )}
      {!busy && state.cancelled && state.segments.length === 0 && (
        <div className="mt-6 text-center text-sm text-slate-400">
          {t("transcribe.cancelled", { percent: state.percent })}
        </div>
      )}

      {state.segments.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm font-medium">
              {t("transcribe.result", { count: state.segments.length })}
              {state.fileName && (
                <span className="ml-2 font-normal text-slate-400">{state.fileName}</span>
              )}
              {!state.running && state.cancelled && (
                <span className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-700">
                  {t("transcribe.cancelled", { percent: state.percent })}
                </span>
              )}
              {!state.running && state.finishedAt && (
                <span className="ml-2 font-normal text-slate-400">
                  · {new Date(state.finishedAt).toLocaleString(props.settings.uiLanguage)}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                onClick={copyAll}
              >
                {copied ? t("transcribe.copied") : t("transcribe.copy")}
              </button>
              <button
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                onClick={exportTxt}
              >
                TXT
              </button>
              <button
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                onClick={exportSrt}
              >
                SRT
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {state.segments.map((s, i) => (
              <div key={`${s.start}-${i}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
                <span className="shrink-0 pt-0.5 font-mono text-xs text-slate-400">{clockTime(s.start)}</span>
                <span className="whitespace-pre-wrap">{s.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export { Transcribe };
