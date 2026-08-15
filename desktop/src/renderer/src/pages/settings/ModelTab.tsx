import { useState } from "react";
import { api } from "../../api";
import type { Translator } from "../../i18n";
import type { Settings } from "../../../../shared/types";
import { Row } from "../../components/Row";
import { Toggle } from "../../components/Toggle";
import { MODEL_PRESETS } from "../../constants";

function ModelTab(props: { t: Translator; s: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t, s, update } = props;
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testDetail, setTestDetail] = useState("");

  const presetId =
    MODEL_PRESETS.find((p) => p.baseUrl === s.polishBaseUrl && p.model === s.polishModel)?.id ?? "custom";

  const applyPreset = (id: string) => {
    const preset = MODEL_PRESETS.find((p) => p.id === id);
    if (preset) update({ polishBaseUrl: preset.baseUrl, polishModel: preset.model });
  };

  const runTest = () => {
    setTestState("testing");
    void api.testPolish().then(({ ok, detail }) => {
      setTestState(ok ? "ok" : "fail");
      setTestDetail(detail.slice(0, 120));
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="font-medium">{t("settings.model")}</div>
      <div className="mt-1 text-xs text-slate-400">{t("settings.modelHint")}</div>
      <Toggle label={t("settings.modelEnabled")} value={s.polishEnabled} onChange={(v) => update({ polishEnabled: v })} />
      {s.polishEnabled && (
        <div className="mt-3 space-y-3">
          <Row label={t("settings.modelPreset")}>
            <select
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              value={presetId}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="custom">{t("settings.modelPresetCustom")}</option>
              {MODEL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Row>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={`${t("settings.modelBaseUrl")}: https://api.deepseek.com/v1`}
            value={s.polishBaseUrl}
            onChange={(e) => update({ polishBaseUrl: e.target.value.trim() })}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            type="password"
            placeholder={t("settings.modelApiKey")}
            value={s.polishApiKey}
            onChange={(e) => update({ polishApiKey: e.target.value.trim() })}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={`${t("settings.modelName")}: deepseek-chat`}
            value={s.polishModel}
            onChange={(e) => update({ polishModel: e.target.value.trim() })}
          />
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={testState === "testing" || !s.polishBaseUrl}
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
    </section>
  );
}
export { ModelTab };
