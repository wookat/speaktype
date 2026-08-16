import { useRef, useState } from "react";
import { api } from "../api";
import type { Translator } from "../i18n";
import type { HistoryItem, Settings } from "../../../shared/types";
import { ReviewDiff } from "../components/ReviewDiff";
import { dayLabel, fmtClock, fmtDuration, suggestHotword } from "../lib/format";

const PAGE_SIZE = 50;

function History(props: {
  t: Translator;
  history: HistoryItem[];
  setHistory: (h: HistoryItem[]) => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t } = props;
  const [query, setQuery] = useState("");
  const [retrying, setRetrying] = useState("");
  const [retryError, setRetryError] = useState<{ id: string; msg: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [suggest, setSuggest] = useState<{ id: string; word: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // 本地断句/标点后几乎每条 raw≠text，常显 diff 是满屏红字噪音；收进“查看原文”按需展开
  const [diffOpen, setDiffOpen] = useState<string | null>(null);
  // 历史上限 500 条全量渲染会卡：分页展示，按需加载更多
  const [visible, setVisible] = useState(PAGE_SIZE);
  // 单条删除唯一无后悔药：先删后置 Undo 栏，点撤销按原位插回
  const [undoDel, setUndoDel] = useState<{ item: HistoryItem; index: number } | null>(null);
  const undoTimer = useRef<number | null>(null);
  const armUndoTimer = (ms: number): void => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndoDel(null), ms);
  };
  const removeItem = (item: HistoryItem): void => {
    const index = props.history.findIndex((h) => h.id === item.id);
    void api.deleteHistory([item.id]).then(props.setHistory);
    setUndoDel({ item, index });
    armUndoTimer(10000);
  };
  const undoDelete = (): void => {
    if (!undoDel) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    void api.restoreHistory(undoDel.item, undoDel.index).then(props.setHistory);
    setUndoDel(null);
  };
  const saveEdit = (item: HistoryItem): void => {
    if (!editing) return;
    const next = editing.text.trim();
    setEditing(null);
    if (!next || next === item.text) return;
    const word = suggestHotword(item.text, next);
    if (word && !props.settings.hotwords.includes(word)) setSuggest({ id: item.id, word });
    void api.correctHistory(item.id, next).then(props.setHistory);
  };
  const addSuggested = (): void => {
    if (!suggest) return;
    props.update({ hotwords: [...props.settings.hotwords, suggest.word] });
    setSuggest(null);
  };
  const retry = (id: string): void => {
    setRetrying(id);
    setRetryError(null);
    void api.retryHistory(id).then(async (r) => {
      setRetrying("");
      if (!r.ok) setRetryError({ id, msg: r.detail });
      props.setHistory(await api.history());
    });
  };
  // 导出当前筛选结果为 Markdown（失败条目除外），浏览器下载通道落到本地文件
  const exportHistory = (items: HistoryItem[]): void => {
    const lines = items
      .filter((h) => h.status !== "failed")
      // 多行文本续行补两空格缩进，保持在同一列表项内，不会被解析成新的顶级条目
      .map((h) => `- ${new Date(h.at).toLocaleString(props.settings.uiLanguage)} · ${h.personaName}\n\n  ${h.text.replace(/\n/g, "\n  ")}`);
    const blob = new Blob([`# SpeakType History\n\n${lines.join("\n\n")}\n`], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `speaktype-history-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const q = query.toLowerCase();
  const filtered = q
    ? props.history.filter(
        (h) =>
          h.text.toLowerCase().includes(q) ||
          h.raw.toLowerCase().includes(q) ||
          // 转录条目的 personaName 是来源文件名，是最自然的检索键；听写条目按人设名筛也合理
          h.personaName.toLowerCase().includes(q),
      )
    : props.history;

  const groups: Array<{ label: string; items: HistoryItem[] }> = [];
  for (const item of filtered.slice(0, visible)) {
    const label = dayLabel(item.at, t);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("history.title")}</h1>
        <div className="flex items-center gap-3">
          {props.history.length > 0 && (
            <input
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
              placeholder={t("history.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {props.history.length > 0 && confirmClear && (
            <>
              <span className="text-sm text-slate-500">{t("history.clearConfirm")}</span>
              <button
                className="text-sm font-medium text-red-500 hover:text-red-600"
                onClick={() => {
                  setConfirmClear(false);
                  void api.clearHistory().then(props.setHistory);
                }}
              >
                {t("history.clearYes")}
              </button>
              <button className="text-sm text-slate-400" onClick={() => setConfirmClear(false)}>
                {t("common.cancel")}
              </button>
            </>
          )}
          {filtered.length > 0 && !confirmClear && (
            <button
              className="text-sm text-slate-400 hover:text-indigo-500"
              onClick={() => exportHistory(filtered)}
            >
              {t("history.export")}
            </button>
          )}
          {props.history.length > 0 && !confirmClear && (
            <button
              className="text-sm text-slate-400 hover:text-red-500"
              onClick={() => setConfirmClear(true)}
            >
              {t("history.clear")}
            </button>
          )}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="mt-16 text-center text-sm text-slate-400">
          {q ? t("history.noResults") : t("history.empty")}
          {!q && <div className="mt-1 text-xs">{t("history.emptyHint")}</div>}
        </div>
      ) : (
        <>
          {groups.map((group) => (
          <div key={group.label}>
            <div className="mt-6 text-sm font-medium text-slate-500">{group.label}</div>
            <ul className="mt-2 space-y-3">
              {group.items.map((item) => (
                <li key={item.id} className="group rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span className="min-w-0 truncate">
                      {fmtClock(item.at)} · {item.personaName} · {fmtDuration(item.durationMs, t)}
                      {item.provider && <> · {t(`history.provider.${item.provider}`)}</>}
                    </span>
                    {/* 不用 hover 门控：远程桌面/触屏 (hover:none) 下 group-hover 永不触发 */}
                    <span className="flex shrink-0 gap-3 whitespace-nowrap">
                      <button className="hover:text-slate-600" onClick={() => void navigator.clipboard.writeText(item.text)}>
                        {t("history.copy")}
                      </button>
                      {item.status !== "failed" && (
                        <button
                          className="hover:text-slate-600"
                          onClick={() => {
                            setSuggest(null);
                            setEditing({ id: item.id, text: item.text });
                          }}
                        >
                          {t("history.edit")}
                        </button>
                      )}
                      <button
                        className="hover:text-red-500"
                        onClick={() => removeItem(item)}
                      >
                        {t("history.delete")}
                      </button>
                    </span>
                  </div>
                  {item.status === "failed" ? (
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-xs text-red-500">
                        {t("history.failedEntry")}: {item.error}
                      </span>
                      {item.audioFile && (
                        <button
                          className="rounded-lg bg-violet-50 px-2.5 py-1 text-xs text-violet-600 hover:bg-violet-100 disabled:opacity-50"
                          disabled={retrying === item.id}
                          onClick={() => retry(item.id)}
                        >
                          {retrying === item.id ? t("history.retrying") : t("history.retry")}
                        </button>
                      )}
                      {retryError?.id === item.id && <span className="text-xs text-red-400">{retryError.msg}</span>}
                    </div>
                  ) : editing?.id === item.id ? (
                    <div className="mt-2">
                      <textarea
                        className="w-full rounded-xl border border-indigo-200 p-2 text-sm"
                        rows={2}
                        autoFocus
                        value={editing.text}
                        onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                      />
                      <div className="mt-1 flex gap-2">
                        <button
                          className="rounded-lg bg-indigo-500 px-2.5 py-1 text-xs text-white hover:bg-indigo-600"
                          onClick={() => saveEdit(item)}
                        >
                          {t("history.editSave")}
                        </button>
                        <button
                          className="rounded-lg px-2.5 py-1 text-xs text-slate-400 hover:text-slate-600"
                          onClick={() => setEditing(null)}
                        >
                          {t("history.editCancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="selectable mt-2 text-sm">{item.text}</div>
                  )}
                  {suggest?.id === item.id && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700">
                      <span>{t("history.hotwordAsk", { word: suggest.word })}</span>
                      <button
                        className="rounded-lg bg-violet-500 px-2 py-0.5 text-white hover:bg-violet-600"
                        onClick={addSuggested}
                      >
                        {t("history.hotwordAdd")}
                      </button>
                      <button className="text-violet-400 hover:text-violet-600" onClick={() => setSuggest(null)}>
                        {t("history.editCancel")}
                      </button>
                    </div>
                  )}
                  {item.status !== "failed" && item.raw !== item.text && (
                    <div className="mt-1 text-xs leading-relaxed text-slate-400">
                      {diffOpen === item.id ? (
                        <>
                          <ReviewDiff before={item.raw} after={item.text} />
                          <button
                            className="mt-1 text-slate-300 hover:text-slate-500"
                            onClick={() => setDiffOpen(null)}
                          >
                            {t("history.hideRaw")}
                          </button>
                        </>
                      ) : (
                        <button
                          className="text-slate-300 hover:text-slate-500"
                          onClick={() => setDiffOpen(item.id)}
                        >
                          {t("history.showRaw")}
                        </button>
                      )}
                    </div>
                  )}
                  {item.failed && (
                    <div className="mt-1 text-xs text-red-400">
                      {t("history.failed")}: {item.failed}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          ))}
          {filtered.length > visible && (
            <div className="mt-4 text-center">
              <button
                className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                {t("history.showMore", { count: filtered.length - visible })}
              </button>
            </div>
          )}
        </>
      )}
      {undoDel && (
        <div
          className="fixed bottom-6 right-6 z-10 flex items-center gap-3 rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-100 shadow-lg"
          onMouseEnter={() => {
            if (undoTimer.current) window.clearTimeout(undoTimer.current);
          }}
          onMouseLeave={() => armUndoTimer(2000)}
        >
          <span>{t("history.deleted")}</span>
          <button className="font-medium text-indigo-300 hover:text-indigo-200" onClick={undoDelete}>
            {t("toast.undo")}
          </button>
        </div>
      )}
    </div>
  );
}
export { History };
