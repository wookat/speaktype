import { useState } from "react";
import { api } from "../api";
import type { Translator } from "../i18n";
import type { Persona, Settings } from "../../../shared/types";
import { PERSONA_ICONS, PersonaIcon } from "../components/PersonaIcon";

function Personas(props: {
  t: Translator;
  personas: Persona[];
  localized: Persona[];
  setPersonas: (p: Persona[]) => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t } = props;
  const [editing, setEditing] = useState<Persona | null>(null);
  const current = props.settings.personaId;
  const currentPersona = props.localized.find((p) => p.id === current) ?? props.localized[0];

  const save = (persona: Persona) => {
    const custom = props.personas.filter((p) => !p.builtin);
    const exists = custom.some((p) => p.id === persona.id);
    const next = exists ? custom.map((p) => (p.id === persona.id ? persona : p)) : [...custom, persona];
    void api.savePersonas(next).then(props.setPersonas);
    setEditing(null);
  };

  const duplicate = (persona: Persona) => {
    setEditing({
      id: `custom-${Date.now()}`,
      name: persona.name,
      prompt: persona.prompt,
      builtin: false,
      icon: persona.icon,
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* 当前人设卡 */}
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-100 to-violet-50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">
            <PersonaIcon name={currentPersona?.icon ?? ""} className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <div className="text-xs text-indigo-700/70">{t("home.persona.current")}</div>
            <div className="text-lg font-semibold">{currentPersona?.name}</div>
            <div className="mt-0.5 max-w-lg text-xs text-slate-500">{currentPersona?.prompt}</div>
          </div>
        </div>
        <button
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-indigo-50"
          onClick={() => setEditing({ id: `custom-${Date.now()}`, name: "", prompt: "", builtin: false, icon: "sparkles" })}
        >
          {t("personas.new")}
        </button>
      </div>

      {/* 按应用自动切人设：录音起手时读前台进程名/窗口标题，命中即用该人设润色 */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{t("personas.appRules")}</div>
            <div className="mt-1 text-xs text-slate-500">{t("personas.appRulesHint")}</div>
          </div>
          <button
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
            onClick={() =>
              props.update({
                appPersonas: [
                  ...props.settings.appPersonas,
                  { match: "", personaId: props.localized[0]?.id ?? "default" },
                ],
              })
            }
          >
            {t("personas.appRuleAdd")}
          </button>
        </div>
        {props.settings.appPersonas.length > 0 && (
          <ul className="mt-3 space-y-2">
            {props.settings.appPersonas.map((rule, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                  placeholder={t("personas.appRulePlaceholder")}
                  value={rule.match}
                  onChange={(e) => {
                    const next = props.settings.appPersonas.map((r, j) =>
                      j === i ? { ...r, match: e.target.value } : r,
                    );
                    props.update({ appPersonas: next });
                  }}
                />
                <select
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                  value={rule.personaId}
                  onChange={(e) => {
                    const next = props.settings.appPersonas.map((r, j) =>
                      j === i ? { ...r, personaId: e.target.value } : r,
                    );
                    props.update({ appPersonas: next });
                  }}
                >
                  {props.localized.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  className="text-xs text-slate-400 hover:text-red-500"
                  onClick={() =>
                    props.update({ appPersonas: props.settings.appPersonas.filter((_, j) => j !== i) })
                  }
                >
                  {t("personas.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("personas.mine")}</h1>
        <div className="text-xs text-slate-400">{t("personas.subtitle")}</div>
      </div>
      <ul className="mt-3 space-y-3">
        {props.localized.map((persona, index) => (
          <li
            key={persona.id}
            className={`flex cursor-pointer items-center justify-between rounded-2xl border bg-white p-4 ${
              current === persona.id ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-200"
            }`}
            onClick={() => props.update({ personaId: persona.id })}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50/60">
                <PersonaIcon name={persona.icon} className="h-4.5 w-4.5 text-indigo-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {persona.name}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {persona.builtin ? t("personas.builtin") : t("personas.custom")}
                  </span>
                  {index < 9 && props.settings.personaHotkeysEnabled && (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-400">Alt+{index + 1}</span>
                  )}
                </div>
                <div className="mt-1 max-w-lg text-xs text-slate-500">{persona.prompt}</div>
              </div>
            </div>
            <div className="flex gap-2 text-xs text-slate-400">
              {persona.builtin ? (
                <button
                  className="hover:text-indigo-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicate(persona);
                  }}
                >
                  {t("personas.duplicate")}
                </button>
              ) : (
                <>
                  <button
                    className="hover:text-slate-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(props.personas.find((p) => p.id === persona.id) ?? persona);
                    }}
                  >
                    {t("personas.edit")}
                  </button>
                  <button
                    className="hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      void api
                        .savePersonas(props.personas.filter((p) => !p.builtin && p.id !== persona.id))
                        .then(props.setPersonas);
                    }}
                  >
                    {t("personas.delete")}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[520px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="font-medium">{t("personas.detail")}</div>
            <label className="mt-4 block text-xs text-slate-500">{t("personas.name")}</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder={t("personas.namePlaceholder")}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <label className="mt-3 block text-xs text-slate-500">{t("personas.icon")}</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.keys(PERSONA_ICONS).map((name) => (
                <button
                  key={name}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                    editing.icon === name ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                  onClick={() => setEditing({ ...editing, icon: name })}
                >
                  <PersonaIcon name={name} className={`h-4 w-4 ${editing.icon === name ? "text-indigo-500" : "text-slate-500"}`} />
                </button>
              ))}
            </div>
            <label className="mt-3 block text-xs text-slate-500">{t("personas.prompt")}</label>
            <textarea
              className="mt-1 h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder={t("personas.promptPlaceholder")}
              value={editing.prompt}
              onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl px-4 py-2 text-sm text-slate-500" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
                disabled={!editing.name || !editing.prompt}
                onClick={() => save(editing)}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export { Personas };
