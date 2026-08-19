import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { api } from "./api";
import { getT } from "./i18n";
import type { StatusPayload, UiLanguage } from "../../shared/types";
import "./global.css";

const BAR_COUNT = 24;
// 字幕行高约 19px（13px 字号 × leading-snug），按设置的行数换算最大高度
const CAPTION_LINE_PX = 19;

/** 贴屏幕底部居中的悬浮条：实时字幕 + 波形 + 取消，转写/润色期只显示旋转指示 */
function Panel() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0.08));
  const [lang, setLang] = useState<{ ui: UiLanguage; system: string }>({ ui: "system", system: "zh-CN" });
  const [captionLines, setCaptionLines] = useState(3);
  const [captionOverflow, setCaptionOverflow] = useState(false);
  const levelRef = useRef(0);
  const captionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void api.init().then((data) => {
      setLang({ ui: data.settings.uiLanguage, system: data.systemLocale });
      setCaptionLines(data.settings.captionLines || 3);
    });
    const offSettings = api.onSettings(({ settings }) => {
      setLang((prev) => ({ ...prev, ui: settings.uiLanguage }));
      setCaptionLines(settings.captionLines || 3);
    });
    const offStatus = api.onStatus(setStatus);
    const offLevel = api.onLevel((level) => {
      levelRef.current = level;
    });
    return () => {
      offSettings();
      offStatus();
      offLevel();
    };
  }, []);

  const recording = status?.state === "recording" || status?.state === "connecting";

  // 波形刷新循环只在录音期间运行，空闲时不空转
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setLevels((prev) => [...prev.slice(1), Math.min(1, 0.08 + levelRef.current * 1.6)]);
    }, 60);
    return () => {
      clearInterval(timer);
      setLevels(new Array(BAR_COUNT).fill(0.08));
    };
  }, [recording]);

  // 实时字幕总是滚到最新一个字
  useEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setCaptionOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [status?.partial, captionLines]);

  const t = getT(lang.ui, lang.system);

  if (!status || status.state === "idle") {
    if (!status?.partial) return null;
  }

  const working = status?.state === "transcribing" || status?.state === "polishing";

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-end pb-2 font-sans">
      {status?.partial && (
        <div
          ref={captionRef}
          className="mb-2 max-w-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#292929]/95 px-4 py-2 text-[13px] leading-snug text-slate-100 shadow-lg [scrollbar-width:none]"
          style={{
            maxHeight: captionLines * CAPTION_LINE_PX + 16,
            // 滚动溢出时顶部渐隐，避免上一行露出半截裁切文字
            maskImage: captionOverflow
              ? "linear-gradient(to bottom, transparent 0, black 16px, black 100%)"
              : undefined,
          }}
        >
          {status.partial}
        </div>
      )}
      {(recording || working || status?.state === "error") && (
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#292929]/95 px-4 py-2 shadow-xl">
        {(recording || working) && status?.appPersonaName && (
          <span className="max-w-[120px] truncate rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-300">
            {status.appPersonaName}
          </span>
        )}
        {recording && (
          <div className="flex h-8 items-center gap-[3px]">
            {levels.map((v, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-violet-400"
                style={{ height: `${Math.max(3, v * 30)}px`, transition: "height 60ms linear" }}
              />
            ))}
          </div>
        )}
        {working && (
          <span className="flex items-center gap-2 text-[13px] text-slate-300">
            <Loader2 size={16} className="animate-spin text-violet-400" />
            {status?.state === "transcribing" ? t("panel.transcribing") : t("panel.polishing")}
          </span>
        )}
        {status?.state === "error" && (
          <span className="flex items-start gap-2 text-[13px] text-red-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="line-clamp-3 max-w-[420px] leading-snug">
              {status.message ?? t("panel.error")}
            </span>
          </span>
        )}
        {recording && (
          <button
            aria-label={t("panel.cancel")}
            title={t("panel.cancel")}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
            onClick={() => void api.cancelRecord()}
          >
            <X size={15} />
          </button>
        )}
      </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Panel />);
