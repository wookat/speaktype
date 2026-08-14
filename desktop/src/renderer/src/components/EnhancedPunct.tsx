import { useEffect, useState } from "react";
import { api } from "../api";
import type { Translator } from "../i18n";
import type { Settings, VadStatus } from "../../../shared/types";
import { Toggle } from "./Toggle";

/** 增强标点：ct-transformer 中英标点模型按需下载（~281MB，不占安装包体积），未下载时开关先引导下载 */
function EnhancedPunct(props: { t: Translator; s: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t, s, update } = props;
  const [punct, setPunct] = useState<VadStatus | null>(null);

  useEffect(() => {
    void api.punctStatus().then(setPunct);
    return api.onPunctStatus(setPunct);
  }, []);

  return (
    <>
      <Toggle
        label={t("settings.enhancedPunct")}
        hint={t("settings.enhancedPunctHint")}
        value={s.enhancedPunct}
        onChange={(v) => update({ enhancedPunct: v })}
      />
      {s.enhancedPunct && !punct?.downloaded && (
        <div className="ml-4 mt-2 flex items-center gap-3 border-l-2 border-slate-100 pl-4">
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={Boolean(punct?.downloading)}
            onClick={() => void api.punctDownload().then(setPunct)}
          >
            {punct?.downloading
              ? t("settings.enhancedPunctDownloading", { progress: String(punct.progress) })
              : t("settings.enhancedPunctDownload")}
          </button>
          {punct?.downloading && (
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-indigo-500" style={{ width: `${punct.progress}%` }} />
            </div>
          )}
          {punct?.error && <span className="text-xs text-red-400">{punct.error}</span>}
          {!punct?.downloading && !punct?.error && (
            <span className="text-xs text-slate-400">{t("settings.enhancedPunctFallback")}</span>
          )}
        </div>
      )}
      {s.enhancedPunct && punct?.downloaded && (
        <div className="ml-4 mt-1 border-l-2 border-slate-100 pl-4 text-xs text-slate-400">
          {t("settings.enhancedPunctReady")}
        </div>
      )}
    </>
  );
}
export { EnhancedPunct };
