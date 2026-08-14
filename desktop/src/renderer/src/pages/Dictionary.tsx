import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";
import type { Translator } from "../i18n";
import type { Settings } from "../../../shared/types";
import { Toggle } from "../components/Toggle";
import { MAX_HOTWORDS, MAX_HOTWORD_LEN } from "../constants";

function Dictionary(props: { t: Translator; settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t } = props;
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const words = props.settings.hotwords;

  const addFromText = () => {
    const incoming = text
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && s.length <= MAX_HOTWORD_LEN);
    const merged = [...new Set([...words, ...incoming])].slice(0, MAX_HOTWORDS);
    props.update({ hotwords: merged });
    setText("");
  };

  const remove = (word: string) => props.update({ hotwords: words.filter((w) => w !== word) });
  const filtered = query ? words.filter((w) => w.includes(query)) : words;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">
        {t("dict.title")} <span className="ml-2 text-sm font-normal text-slate-400">{t("dict.subtitle")}</span>
      </h1>
      <div className="relative mt-4">
        <textarea
          className="h-36 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm"
          placeholder={t("dict.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="absolute bottom-3 right-4 text-xs text-slate-400">{t("dict.count", { count: words.length })}</div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          disabled={words.length === 0}
          onClick={() => props.update({ hotwords: [] })}
        >
          {t("dict.clear")}
        </button>
        <button
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
          disabled={!text.trim()}
          onClick={addFromText}
        >
          {t("dict.save")}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-1">
        <Toggle
          label={t("dict.autoLearn")}
          hint={t("dict.autoLearnHint")}
          value={props.settings.autoLearn}
          onChange={(v) => props.update({ autoLearn: v })}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm font-medium">{t("dict.manage")}</div>
        {words.length > 0 && (
          <input
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
            placeholder={t("dict.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="mt-12 text-center text-sm text-slate-400">
          {t("dict.empty")}
          <div className="mt-1 text-xs">{t("dict.emptyHint")}</div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {filtered.map((word) => (
            <span
              key={word}
              className="group flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm"
            >
              {word}
              <button className="text-slate-300 hover:text-red-500" onClick={() => remove(word)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
export { Dictionary };
