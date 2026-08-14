import { useEffect, useState } from "react";
import { api } from "../api";
import type { Translator } from "../i18n";
import type { Settings, VadStatus } from "../../../shared/types";
import { Toggle } from "./Toggle";

/** 增强人声检测：Silero VAD 增强包按需下载（~3MB，不占安装包体积），未下载时开关先引导下载 */
function EnhancedVad(props: { t: Translator; s: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t, s, update } = props;
  const [vad, setVad] = useState<VadStatus | null>(null);

  useEffect(() => {
    void api.vadStatus().then(setVad);
    return api.onVadStatus(setVad);
  }, []);

  if (vad && !vad.supported) return null;

  return (
    <>
      <Toggle
        label={t("settings.enhancedVad")}
        hint={t("settings.enhancedVadHint")}
        value={s.enhancedVad}
        onChange={(v) => update({ enhancedVad: v })}
      />
      {s.enhancedVad && !vad?.downloaded && (
        <div className="ml-4 mt-2 flex items-center gap-3 border-l-2 border-slate-100 pl-4">
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={Boolean(vad?.downloading)}
            onClick={() => void api.vadDownload().then(setVad)}
          >
            {vad?.downloading
              ? t("settings.enhancedVadDownloading", { progress: String(vad.progress) })
              : t("settings.enhancedVadDownload")}
          </button>
          {vad?.downloading && (
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-indigo-500" style={{ width: `${vad.progress}%` }} />
            </div>
          )}
          {vad?.error && <span className="text-xs text-red-400">{vad.error}</span>}
          {!vad?.downloading && !vad?.error && (
            <span className="text-xs text-slate-400">{t("settings.enhancedVadFallback")}</span>
          )}
        </div>
      )}
      {s.enhancedVad && vad?.downloaded && (
        <div className="ml-4 mt-1 border-l-2 border-slate-100 pl-4 text-xs text-slate-400">
          {t("settings.enhancedVadReady")}
        </div>
      )}
    </>
  );
}
export { EnhancedVad };
