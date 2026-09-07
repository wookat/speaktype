import { useEffect, useRef, useState } from "react";
import { Check, FileAudio, Loader2 } from "lucide-react";
import { api } from "../api";
import { downloadPhaseText, downloadingLabel, humanDownloadError } from "../lib/downloadError";
import { useLocalModelStatus } from "../lib/useLocalModelStatus";
import { localModelLabel } from "../lib/modelLabel";
import type { Translator } from "../i18n";
import type { LocaleKey } from "../../../shared/i18n";
import type { Settings, TranscribeState } from "../../../shared/types";
import { PARAKEET_FP32, isParakeetModel } from "../../../shared/localModels";

const SR = 16000;
/** 上限 3 小时：16k 浮点采样约 660MB，超过容易把主进程拖爆 */
const MAX_SECONDS = 3 * 60 * 60;

/** 秒 → 字幕时间戳 HH:MM:SS<sep>mmm（SRT 用逗号、WebVTT 用句点） */
function cueTime(sec: number, sep: "," | "."): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(rest, 3)}`;
}

/** 秒 → 带时间戳文本的行前缀 HH:MM:SS（固定三段，便于对齐与工具解析） */
function stampTime(sec: number): string {
  return cueTime(sec, ".").slice(0, 8);
}

type ExportFormat = "txt" | "txtTs" | "srt" | "vtt";
const EXPORT_FORMATS: Array<{ id: ExportFormat; label: LocaleKey }> = [
  { id: "txt", label: "transcribe.export.txt" },
  { id: "txtTs", label: "transcribe.export.txtTs" },
  { id: "srt", label: "transcribe.export.srt" },
  { id: "vtt", label: "transcribe.export.vtt" },
];

function clockTime(sec: number): string {
  const s = Math.floor(sec);
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
    : `${Math.floor(s / 60)}:${pad(s % 60)}`;
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
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setCopied(null);
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
  const saveText = (content: string, fileName: string, filterName: string) =>
    void api.saveTextFile({ title: t("common.exportTitle"), fileName, filterName, content });
  const exportAs = (format: ExportFormat) => {
    const segs = state.segments;
    switch (format) {
      case "txt":
        return saveText(`${allText}\n`, `${exportBase}.txt`, "Text");
      case "txtTs":
        return saveText(segs.map((s) => `[${stampTime(s.start)}] ${s.text}`).join("\n") + "\n", `${exportBase}.txt`, "Text");
      case "srt":
        return saveText(
          segs.map((s, i) => `${i + 1}\n${cueTime(s.start, ",")} --> ${cueTime(s.end, ",")}\n${s.text}\n`).join("\n"),
          `${exportBase}.srt`,
          "SubRip",
        );
      case "vtt":
        return saveText(
          `WEBVTT\n\n${segs.map((s) => `${cueTime(s.start, ".")} --> ${cueTime(s.end, ".")}\n${s.text}\n`).join("\n")}`,
          `${exportBase}.vtt`,
          "WebVTT",
        );
    }
  };
  const copyAll = () => {
    navigator.clipboard.writeText(allText).then(
      () => setCopied("ok"),
      () => setCopied("fail"),
    );
  };
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), copied === "ok" ? 2000 : 4000);
    return () => clearTimeout(timer);
  }, [copied]);

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
            <div className="flex shrink-0 items-center gap-2">
              <button
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white disabled:opacity-40"
                disabled={Boolean(local?.downloading) || Boolean(local?.busyModel)}
                onClick={() => void api.localModelDownload(model).then(setLocal)}
              >
                {local?.downloading
                  ? downloadingLabel(local, t)
                  : local?.partial != null
                    ? t("settings.localModelResume", { progress: String(local.partial) })
                    : t("settings.localModelDownload")}
              </button>
              {local?.downloading && (
                <button
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
                  onClick={() => void api.localModelCancelDownload()}
                >
                  {t("common.cancel")}
                </button>
              )}
            </div>
          </div>
          {local?.busyModel && (
            <div className="mt-2 text-xs text-amber-600">{t("settings.localModelBusy", { model: localModelLabel(local.busyModel, t, false) })}</div>
          )}
          {local?.downloading && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${local.progress}%` }} />
            </div>
          )}
          {downloadPhaseText(local, t) && (
            <div className="mt-2 text-xs text-amber-600" role="status">
              {downloadPhaseText(local, t)}
            </div>
          )}
          {local?.error && !local.downloading && (
            <div className="mt-2 text-xs text-red-600">{humanDownloadError(local.error, t)}</div>
          )}
        </div>
      )}

      {isParakeetModel(model) && (
        <div className="mt-4 rounded-2xl bg-indigo-50 px-4 py-2.5 text-xs text-indigo-600">
          {t("transcribe.parakeetHint")}
          {model === PARAKEET_FP32 && <span className="ml-1">{t("transcribe.parakeetFp32Hint")}</span>}
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

      {/* 进度行在任务结束后保留（进度定格、取消键隐身占位）：下方导出行不上移到 Cancel 原位，不会被误点 */}
      {(state.running || state.percent > 0) && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${state.percent}%` }} />
          </div>
          <button
            className={`shrink-0 whitespace-nowrap rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 ${state.running ? "" : "invisible"}`}
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
          {/* 头部允许整体换行：窄窗下导出按钮组整组落到下一行，徽标/时间各自不断字，按钮不被压扁 */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
              <span className="whitespace-nowrap">{t("transcribe.result", { count: state.segments.length })}</span>
              {state.fileName && (
                <span className="truncate font-normal text-slate-400">{state.fileName}</span>
              )}
              {!state.running && state.cancelled && (
                <span className="whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-700">
                  {t("transcribe.cancelled", { percent: state.percent })}
                </span>
              )}
              {!state.running && state.finishedAt && (
                <span className="whitespace-nowrap font-normal text-slate-400">
                  · {new Date(state.finishedAt).toLocaleString(props.settings.uiLanguage)}
                </span>
              )}
            </div>
            {/* ml-auto：窄窗整组掉行后仍靠右，与宽窗布局一致 */}
            <div className="ml-auto flex shrink-0 gap-2">
              <button
                className={`flex items-center gap-1 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs ${
                  copied === "ok"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : copied === "fail"
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
                aria-live="polite"
                onClick={copyAll}
              >
                {copied === "ok" && <Check className="h-3.5 w-3.5" />}
                {copied === "ok"
                  ? t("transcribe.copied")
                  : copied === "fail"
                    ? t("transcribe.copyFailed")
                    : t("transcribe.copy")}
              </button>
              {/* 四种格式收进一个原生下拉：820px 窄窗不再四按钮并排挤压，键盘/读屏直接可用；选完即导出并回到占位项 */}
              <select
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                value=""
                aria-label={t("transcribe.export")}
                onChange={(e) => {
                  const picked = EXPORT_FORMATS.find((f) => f.id === e.target.value);
                  if (picked) exportAs(picked.id);
                }}
              >
                <option value="">{t("transcribe.export")}</option>
                {EXPORT_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {t(f.label)}
                  </option>
                ))}
              </select>
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
