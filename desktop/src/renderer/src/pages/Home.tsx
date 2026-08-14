import { useEffect, useState } from "react";
import { api } from "../api";
import type { Translator } from "../i18n";
import type { LocalModelStatus, Persona, Settings } from "../../../shared/types";
import { PersonaIcon } from "../components/PersonaIcon";
import { StatCard } from "../components/StatCard";
import { fmtDuration } from "../lib/format";

function Home(props: {
  t: Translator;
  settings: Settings;
  personas: Persona[];
  doubaoReady: boolean;
  statsWords: number;
  statsDuration: number;
  statsSessions: number;
  goSettings: () => void;
}) {
  const { t } = props;
  const persona = props.personas.find((p) => p.id === props.settings.personaId) ?? props.personas[0];
  const saved = Math.max(0, Math.round(props.statsWords / 40) * 60000 - props.statsDuration);

  // 离线通道是默认通道，模型没下好就说话必然失败，首页直接给一键下载入口
  const [local, setLocal] = useState<LocalModelStatus | null>(null);
  const localModel = props.settings.localModel || "sensevoice-small";
  useEffect(() => {
    if (props.settings.asrProvider !== "local") return;
    void api.localModelStatus(localModel).then(setLocal);
    return api.onLocalModel(setLocal);
  }, [props.settings.asrProvider, localModel]);
  const needsModel = props.settings.asrProvider === "local" && local !== null && !local.downloaded;
  // 标题里的热键要渲染成键帽样式，按占位符拆开
  const [titleBefore, titleAfter = ""] = t("home.title").split("{{key}}");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">
        {titleBefore}
        <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-mono text-lg text-white">
          {props.settings.hotkeyHold}
        </span>
        {titleAfter}
      </h1>
      <p className="mt-2 text-sm text-slate-500">{t("home.subtitle", { toggle: props.settings.hotkeyToggle })}</p>

      {needsModel && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <div>
            <div className="font-medium text-indigo-700">{t("home.model.title")}</div>
            <div className="mt-1 text-sm text-indigo-600">{t("home.model.desc")}</div>
          </div>
          <button
            className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-60"
            disabled={local?.downloading}
            onClick={() => void api.localModelDownload(localModel)}
          >
            {local?.downloading
              ? `${Math.round(local.progress)}%`
              : t("home.model.button")}
          </button>
        </div>
      )}

      {props.settings.asrProvider !== "local" &&
        props.settings.asrProvider !== "chatgpt" &&
        !(props.settings.asrProvider === "openai"
          ? Boolean(props.settings.asrBaseUrl && props.settings.asrApiKey)
          : props.doubaoReady) && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <div>
            <div className="font-medium text-indigo-700">{t("home.activate.title")}</div>
            <div className="mt-1 text-sm text-indigo-600">{t("home.activate.desc")}</div>
          </div>
          <button
            className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
            onClick={() => void api.activateDoubao()}
          >
            {t("home.activate.button")}
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatCard title={t("home.stat.sessions")} value={`${props.statsSessions}`} />
        <StatCard title={t("home.stat.words")} value={`${props.statsWords}`} />
        <StatCard title={t("home.stat.duration")} value={fmtDuration(props.statsDuration, t)} />
        <StatCard title={t("home.stat.saved")} value={fmtDuration(saved, t)} hint={t("home.stat.savedHint")} />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("home.steps.title")}</div>
        <ol className="mt-4 grid grid-cols-4 gap-3 text-sm text-slate-600">
          {[
            t("home.steps.1"),
            t("home.steps.2"),
            t("home.steps.3", { key: props.settings.hotkeyHold }),
            t("home.steps.4"),
          ].map((step, i) => (
            <li key={step} className="rounded-xl bg-slate-50 p-3">
              <div className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                {i + 1}
              </div>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <div className="text-xs text-slate-400">{t("home.persona.current")}</div>
          <div className="mt-1 flex items-center gap-2 font-medium">
            <PersonaIcon name={persona?.icon ?? ""} className="h-4 w-4 text-indigo-500" />
            {persona?.name}
          </div>
          <div className="mt-1 max-w-md text-xs text-slate-500">{persona?.prompt}</div>
        </div>
        <div className="text-xs text-slate-400">{t("home.persona.switch")}</div>
      </div>
    </div>
  );
}
export { Home };
