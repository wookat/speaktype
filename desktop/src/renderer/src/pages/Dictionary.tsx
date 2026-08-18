import { useEffect, useState } from "react";
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
  const [dropped, setDropped] = useState(0);
  const [kanaAdded, setKanaAdded] = useState(0);
  // 清空是本页唯一批量不可逆操作：两步确认，几秒不点自动复位
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);
  const words = props.settings.hotwords;

  const addFromText = () => {
    const lines = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const incoming = lines.filter((s) => s.length <= MAX_HOTWORD_LEN);
    const unique = [...new Set([...words, ...incoming])];
    const merged = unique.slice(0, MAX_HOTWORDS);
    setDropped(unique.length - merged.length + (lines.length - incoming.length));
    // 含假名的条目读音是日语，拼音同音纠错不适用（hotwords.ts 假名语境跳过），入库时如实告知避免静默死条目
    setKanaAdded(merged.filter((w) => !words.includes(w) && /[\u3041-\u30ff]/.test(w)).length);
    props.update({ hotwords: merged });
    setText("");
  };

  const remove = (word: string) => props.update({ hotwords: words.filter((w) => w !== word) });
  // 导出一行一词的 .txt，与粘贴导入天然 round-trip
  const exportWords = () => {
    // UTF-8 BOM：写字板等按 ANSI 猜编码的旧编辑器打开 CJK 不乱码；导入侧 trim() 会剥掉 \ufeff，round-trip 不受影响
    const blob = new Blob(["\ufeff", `${words.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `speaktype-dictionary-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const q = query.trim().toLowerCase();
  const filtered = q ? words.filter((w) => w.toLowerCase().includes(q)) : words;

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
      {dropped > 0 && (
        <div className="mt-2 rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-700">
          {t("dict.limitReached", { count: dropped })}
        </div>
      )}
      {kanaAdded > 0 && (
        <div className="mt-2 rounded-xl bg-slate-100 px-4 py-2 text-xs text-slate-500">
          {t("dict.kanaNotCorrected", { count: kanaAdded })}
        </div>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          disabled={words.length === 0}
          onClick={exportWords}
        >
          {t("dict.export")}
        </button>
        <button
          className={`rounded-xl border px-4 py-2 text-sm disabled:opacity-40 ${
            confirmClear
              ? "border-red-200 bg-red-50 font-medium text-red-500 hover:bg-red-100"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
          disabled={words.length === 0}
          onClick={() => {
            if (confirmClear) {
              props.update({ hotwords: [] });
              setConfirmClear(false);
            } else setConfirmClear(true);
          }}
        >
          {/* 始终按更长的确认文案占位，超时回弹时按钮不横向跳动 */}
          <span className="relative inline-block">
            <span className="invisible">{t("dict.clearConfirm")}</span>
            <span className="absolute inset-0 text-center">
              {confirmClear ? t("dict.clearConfirm") : t("dict.clear")}
            </span>
          </span>
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
          {words.length > 0 ? (
            t("dict.noResults")
          ) : (
            <>
              {t("dict.empty")}
              <div className="mt-1 text-xs">{t("dict.emptyHint")}</div>
            </>
          )}
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
