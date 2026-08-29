import { useEffect, useState } from "react";
import { api } from "../api";
import type { Translator } from "../i18n";
import type { LocalModelStatus, Persona, Settings } from "../../../shared/types";
import { PARAKEET, SENSEVOICE } from "../../../shared/localModels";
import { PersonaIcon } from "../components/PersonaIcon";
import { StatCard } from "../components/StatCard";
import { humanDownloadError } from "../lib/downloadError";
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
  goRemoteMic: () => void;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t } = props;
  const persona = props.personas.find((p) => p.id === props.settings.personaId) ?? props.personas[0];
  // 手打按 40 词/分估算；不先取整到分钟，少量词数也能给出非零节省
  const saved = Math.max(0, Math.round((props.statsWords / 40) * 60000) - props.statsDuration);

  // 熟手默认收起引导卡，新用户默认展开
  const [stepsOpen, setStepsOpen] = useState(props.statsSessions < 10);
  // 离线通道是默认通道，模型没下好就说话必然失败，首页直接给一键下载入口
  const [local, setLocal] = useState<LocalModelStatus | null>(null);
  const [modelSize, setModelSize] = useState("");
  const localModel = props.settings.localModel || "sensevoice-small";
  useEffect(() => {
    if (props.settings.asrProvider !== "local") return;
    void api.localModelStatus(localModel).then(setLocal);
    void api.localModels().then((models) => setModelSize(models.find((m) => m.id === localModel)?.size ?? ""));
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
      <p className="mt-2 text-sm text-slate-500">
        {props.settings.hotkeyToggle === props.settings.hotkeyHold ||
        (props.settings.hotkeyRewrite !== "Off" &&
          props.settings.hotkeyToggle === props.settings.hotkeyRewrite)
          ? t("home.subtitleNoToggle")
          : t("home.subtitle", { toggle: props.settings.hotkeyToggle })}
      </p>

      {needsModel && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <div>
            <div className="font-medium text-indigo-700">{t("home.model.title")}</div>
            <div className="mt-1 text-sm text-indigo-600">{t("home.model.desc", { size: modelSize })}</div>
            {/* 首次下载前先按语言选对模型：parakeet 不支持中日韩粤，选错要 660MB 白下 */}
            {!local?.downloading && (
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { id: SENSEVOICE, label: t("home.model.optSense") },
                  { id: PARAKEET, label: t("home.model.optPara") },
                ].map((m) => (
                  <button
                    key={m.id}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${
                      localModel === m.id
                        ? "border-indigo-400 bg-indigo-100 font-medium text-indigo-700"
                        : "border-indigo-200 bg-white text-indigo-500 hover:bg-indigo-100"
                    }`}
                    onClick={() => props.update({ localModel: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {local?.error && <div className="mt-1 text-sm text-red-500">{humanDownloadError(local.error, t)}</div>}
          </div>
          <button
            className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-60"
            disabled={local?.downloading}
            onClick={() => void api.localModelDownload(localModel)}
          >
            {local?.downloading
              ? `${Math.round(local.progress)}%`
              : local?.partial != null
                ? t("settings.localModelResume", { progress: String(local.partial) })
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

      {/* 熟手（≥10 次会话）不再需要整块引导卡，折叠为一行可展开；手机麦入口保持常驻 */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="font-medium">{t("home.steps.title")}</div>
          {props.statsSessions >= 10 && (
            <button
              className="text-sm text-slate-400 hover:text-slate-600"
              onClick={() => setStepsOpen((v) => !v)}
            >
              {stepsOpen ? t("home.steps.collapse") : t("home.steps.expand")}
            </button>
          )}
        </div>
        {stepsOpen && (
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
        )}
        <button
          className="mt-3 text-sm text-indigo-500 hover:text-indigo-600"
          onClick={props.goRemoteMic}
        >
          {t("home.remoteMic")}
        </button>
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
