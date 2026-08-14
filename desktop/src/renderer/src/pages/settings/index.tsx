import { useEffect, useState } from "react";
import type { Translator } from "../../i18n";
import type { Settings } from "../../../../shared/types";
import { GeneralTab } from "./GeneralTab";
import { VoiceTab } from "./VoiceTab";
import { ModelTab } from "./ModelTab";
import { AboutTab } from "./AboutTab";

type SettingsTab = "general" | "voice" | "model" | "about";

function SettingsPage(props: {
  t: Translator;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  holdKeyChoices: string[];
  rewriteKeyChoices: string[];
  toggleKeyChoices: string[];
  doubaoReady: boolean;
  version: string;
  commit: string;
  jumpTab: string | null;
  clearJump: () => void;
}) {
  const { t, settings: s } = props;
  const [tab, setTab] = useState<SettingsTab>("general");
  useEffect(() => {
    if (!props.jumpTab) return;
    setTab(props.jumpTab as SettingsTab);
    props.clearJump();
  }, [props.jumpTab]);

  const TABS: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: t("settings.tab.general") },
    { id: "voice", label: t("settings.tab.voice") },
    { id: "model", label: t("settings.tab.model") },
    { id: "about", label: t("settings.tab.about") },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
      <div className="mt-4 flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`rounded-xl px-4 py-2 text-sm ${
              tab === item.id ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-100"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-6">
        {tab === "general" && (
          <GeneralTab
            t={t}
            s={s}
            update={props.update}
            holdKeyChoices={props.holdKeyChoices}
            rewriteKeyChoices={props.rewriteKeyChoices}
            toggleKeyChoices={props.toggleKeyChoices}
          />
        )}
        {tab === "voice" && <VoiceTab t={t} s={s} update={props.update} doubaoReady={props.doubaoReady} />}
        {tab === "model" && <ModelTab t={t} s={s} update={props.update} />}
        {tab === "about" && <AboutTab t={t} version={props.version} commit={props.commit} />}
      </div>
    </div>
  );
}
export { SettingsPage };
