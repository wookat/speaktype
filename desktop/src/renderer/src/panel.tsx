import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { getT } from "./i18n";
import type { StatusPayload, UiLanguage } from "../../shared/types";
import "./global.css";

const BAR_COUNT = 24;

/** 贴屏幕底部居中的悬浮波形条：录音时波形 + 实时字幕，结束显示整理进度 */
function Panel() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0.08));
  const [lang, setLang] = useState<{ ui: UiLanguage; system: string }>({ ui: "system", system: "zh-CN" });
  const levelRef = useRef(0);

  useEffect(() => {
    void api.init().then((data) => setLang({ ui: data.settings.uiLanguage, system: data.systemLocale }));
    const offSettings = api.onSettings(({ settings }) =>
      setLang((prev) => ({ ...prev, ui: settings.uiLanguage })),
    );
    const offStatus = api.onStatus(setStatus);
    const offLevel = api.onLevel((level) => {
      levelRef.current = level;
    });
    const timer = setInterval(() => {
      setLevels((prev) => [...prev.slice(1), Math.min(1, 0.08 + levelRef.current * 1.6)]);
    }, 60);
    return () => {
      offSettings();
      offStatus();
      offLevel();
      clearInterval(timer);
    };
  }, []);

  const t = getT(lang.ui, lang.system);

  if (!status || status.state === "idle") {
    if (!status?.partial) return null;
  }

  const label =
    status?.state === "connecting"
      ? t("panel.connecting")
      : status?.state === "recording"
        ? t("panel.recording")
        : status?.state === "transcribing"
          ? t("panel.transcribing")
          : status?.state === "polishing"
            ? t("panel.polishing")
            : status?.state === "error"
              ? (status.message ?? t("panel.error"))
              : "";

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-end pb-2 font-sans">
      {status?.partial && (
        <div className="mb-2 max-h-[64px] max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#292929]/95 px-4 py-2 text-[13px] leading-snug text-slate-100 shadow-lg">
          {status.partial}
        </div>
      )}
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#292929]/95 px-4 py-2 shadow-xl">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm">
          {status?.state === "recording" ? "🎙️" : status?.state === "error" ? "⚠️" : "⏳"}
        </div>
        {status?.state === "recording" || status?.state === "connecting" ? (
          <div className="flex h-8 items-end gap-[3px]">
            {levels.map((v, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-violet-400"
                style={{ height: `${Math.max(3, v * 30)}px`, transition: "height 60ms linear" }}
              />
            ))}
          </div>
        ) : null}
        <span
          className={`text-[13px] ${
            status?.state === "error"
              ? "line-clamp-2 max-w-[340px] leading-snug text-red-300"
              : "max-w-[240px] truncate text-slate-200"
          }`}
        >
          {label}
        </span>
        {(status?.state === "recording" || status?.state === "connecting") && (
          <button
            className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
            onClick={() => void api.cancelRecord()}
          >
            {t("panel.cancel")}
          </button>
        )}
      </div>
      <div className="mt-1 text-[10px] text-slate-500/70">{status?.personaName}</div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Panel />);
