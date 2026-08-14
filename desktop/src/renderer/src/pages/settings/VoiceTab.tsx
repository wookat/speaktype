import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../../api";
import type { Translator } from "../../i18n";
import type { LocalModelStatus, Settings } from "../../../../shared/types";
import { EnhancedPunct } from "../../components/EnhancedPunct";
import { Row } from "../../components/Row";
import { Toggle } from "../../components/Toggle";
import { ASR_PRESETS } from "../../constants";

function VoiceTab(props: {
  t: Translator;
  s: Settings;
  update: (patch: Partial<Settings>) => void;
  doubaoReady: boolean;
}) {
  const { t, s, update } = props;
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [local, setLocal] = useState<LocalModelStatus | null>(null);
  const [localModels, setLocalModels] = useState<Array<{ id: string; size: string }>>([]);
  const localModel = s.localModel || "base-q5_1";
  const parakeetActive = s.asrProvider === "local" && localModel === "parakeet-tdt-0.6b-v3";

  useEffect(() => {
    void api.localModels().then(setLocalModels);
    return api.onLocalModel(setLocal);
  }, []);
  useEffect(() => {
    void api.localModelStatus(localModel).then(setLocal);
  }, [localModel]);

  const [chatgptReady, setChatgptReady] = useState(false);
  const [chatgptDetail, setChatgptDetail] = useState("");
  useEffect(() => {
    if (s.asrProvider === "chatgpt") void api.chatgptReady().then(setChatgptReady);
  }, [s.asrProvider]);

  const configured =
    s.asrProvider === "openai"
      ? Boolean(s.asrBaseUrl && s.asrApiKey)
      : s.asrProvider === "local"
        ? Boolean(local?.downloaded)
        : s.asrProvider === "chatgpt"
          ? chatgptReady
          : props.doubaoReady;
  // OpenAI 兼容通道要测试连接成功才算 Ready；仅填完字段属"已配置未验证"
  const ready = s.asrProvider === "openai" ? configured && testState === "ok" : configured;
  const [testDetail, setTestDetail] = useState("");
  const presetId = ASR_PRESETS.find((p) => p.baseUrl === s.asrBaseUrl && p.model === s.asrModel)?.id ?? "custom";
  const applyPreset = (id: string) => {
    const preset = ASR_PRESETS.find((p) => p.id === id);
    if (preset) update({ asrBaseUrl: preset.baseUrl, asrModel: preset.model });
  };
  const runTest = () => {
    setTestState("testing");
    void api.testAsr().then(({ ok, detail }) => {
      setTestState(ok ? "ok" : "fail");
      setTestDetail(detail.slice(0, 120));
    });
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="font-medium">{t("settings.asr")}</div>
      <div className="mt-1 text-xs text-slate-400">
        {s.asrProvider === "openai"
          ? t("settings.asrOpenaiHint")
          : s.asrProvider === "local"
            ? t("settings.asrLocalHint")
            : s.asrProvider === "chatgpt"
              ? t("settings.asrChatgptHint")
              : t("settings.asrHint")}
      </div>
      {(s.asrProvider === "chatgpt" || s.asrProvider === "doubao") && (
        <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {t("settings.thirdPartyRisk")}
        </div>
      )}
      <Row label={t("settings.asrProvider")}>
        <select
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
          value={s.asrProvider}
          onChange={(e) => update({ asrProvider: e.target.value as Settings["asrProvider"] })}
        >
          <option value="doubao">{t("settings.asrProviderDoubao")}</option>
          <option value="openai">{t("settings.asrProviderOpenai")}</option>
          <option value="chatgpt">{t("settings.asrProviderChatgpt")}</option>
          <option value="local">{t("settings.asrProviderLocal")}</option>
        </select>
      </Row>
      <Row label={t("settings.asrStatus")}>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            ready ? "bg-emerald-50 text-emerald-600" : configured ? "bg-sky-50 text-sky-600" : "bg-amber-50 text-amber-600"
          }`}
        >
          {ready && <Check className="mr-1 inline h-3.5 w-3.5" />}
          {ready ? t("settings.asrReady") : configured ? t("settings.asrConfigured") : t("settings.asrNotReady")}
        </span>
      </Row>
      {s.asrProvider === "local" ? (
        <div className="mt-4 space-y-3">
          <Row label={t("settings.localModel")} hint={t("settings.localModelHint")}>
            <select
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              value={localModel}
              onChange={(e) => update({ localModel: e.target.value })}
            >
              {localModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({m.size})
                </option>
              ))}
            </select>
          </Row>
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={Boolean(local?.downloading) || Boolean(local?.downloaded)}
              onClick={() => void api.localModelDownload(localModel).then(setLocal)}
            >
              {local?.downloaded
                ? t("settings.localModelReady")
                : local?.downloading
                  ? t("settings.localModelDownloading", { progress: String(local.progress) })
                  : t("settings.localModelDownload")}
            </button>
            {local?.downloading && (
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-400" style={{ width: `${local.progress}%` }} />
              </div>
            )}
            {local?.error && <span className="text-sm text-red-500">{local.error}</span>}
          </div>
          <Toggle
            label={t("settings.localSimplified")}
            hint={t("settings.localSimplifiedHint")}
            value={s.localSimplified !== false}
            onChange={(v) => update({ localSimplified: v })}
          />
        </div>
      ) : s.asrProvider === "chatgpt" ? (
        <>
          <Row
            label={t("settings.chatgptLogin")}
            hint={`${t("settings.chatgptLoginHint")} ${t("settings.chatgptCodexHint")}`}
          >
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => void api.loginChatgpt().then(() => api.chatgptReady().then(setChatgptReady))}
            >
              {t("settings.chatgptLogin")}
            </button>
          </Row>
          <Row label={t("settings.chatgptTest")} hint={chatgptDetail || t("settings.chatgptTestHint")}>
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => {
                setChatgptDetail(t("settings.modelTesting"));
                void api.testChatgpt().then(({ ok, detail }) => {
                  setChatgptDetail(`${ok ? "OK" : "FAIL"} · ${detail.slice(0, 160)}`);
                  void api.chatgptReady().then(setChatgptReady);
                });
              }}
            >
              {t("settings.chatgptTest")}
            </button>
          </Row>
        </>
      ) : s.asrProvider === "doubao" ? (
        <>
          <Row label={t("settings.asrOpenLogin")}>
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => void api.activateDoubao()}
            >
              {t("settings.asrOpenLogin")}
            </button>
          </Row>
          <Row label={t("settings.asrAppKey")}>
            <input
              className="w-64 rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              type="password"
              placeholder={t("settings.asrAppKeyPlaceholder")}
              value={s.doubaoAppKey}
              onChange={(e) => update({ doubaoAppKey: e.target.value.trim() })}
            />
          </Row>
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <Row label={t("settings.modelPreset")}>
            <select
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              value={presetId}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="custom">{t("settings.modelPresetCustom")}</option>
              {ASR_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Row>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={`${t("settings.asrBaseUrl")}: https://api.openai.com/v1`}
            value={s.asrBaseUrl}
            onChange={(e) => update({ asrBaseUrl: e.target.value.trim() })}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            type="password"
            placeholder={t("settings.asrApiKey")}
            value={s.asrApiKey}
            onChange={(e) => update({ asrApiKey: e.target.value.trim() })}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={`${t("settings.asrModel")}: whisper-1`}
            value={s.asrModel}
            onChange={(e) => update({ asrModel: e.target.value.trim() })}
          />
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={testState === "testing" || !s.asrBaseUrl || !s.asrApiKey}
              onClick={runTest}
            >
              {testState === "testing" ? t("settings.modelTesting") : t("settings.modelTest")}
            </button>
            {testState === "ok" && (
              <span className="text-sm text-emerald-600">{t("settings.modelTestOk", { model: testDetail })}</span>
            )}
            {testState === "fail" && (
              <span className="text-sm text-red-500">{t("settings.modelTestFail", { error: testDetail })}</span>
            )}
          </div>
        </div>
      )}
      <Row
        label={t("settings.asrLanguage")}
        hint={parakeetActive ? t("settings.asrLanguageParakeetHint") : undefined}
      >
        <select
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
          value={s.language}
          disabled={parakeetActive}
          onChange={(e) => update({ language: e.target.value })}
        >
          <option value="zh">中文 Chinese</option>
          <option value="en">English</option>
          <option value="ja">日本語 Japanese</option>
          <option value="ko">한국어 Korean</option>
          <option value="yue">粤语 Cantonese</option>
        </select>
      </Row>
      <EnhancedPunct t={t} s={s} update={update} />
      <Toggle
        label={t("settings.itn")}
        hint={t("settings.itnHint")}
        value={s.itn}
        onChange={(v) => update({ itn: v })}
      />
    </section>
  );
}
export { VoiceTab };
