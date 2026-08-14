import type { Translator } from "../i18n";

function fmtDuration(ms: number, t: Translator): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60}min`;
}

function dayLabel(at: number, t: Translator): string {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return t("history.today");
  if (d.toDateString() === yesterday.toDateString()) return t("history.yesterday");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtClock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 找出纰正后新增的词：去掉共同前后缀后，新文本中间部分若是 2-6 字纯中文就建议加入词典 */
function suggestHotword(before: string, after: string): string | null {
  if (before === after) return null;
  const a = Array.from(before);
  const b = Array.from(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const mid = b.slice(start, b.length - end).join("");
  return /^[\u4e00-\u9fff]{2,6}$/.test(mid) ? mid : null;
}

/** 审阅式对照：去掉共同前后缀，把中间变化段高亮出来 */
function diffSegments(before: string, after: string): { prefix: string; delA: string; delB: string; suffix: string } {
  const a = Array.from(before);
  const b = Array.from(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  return {
    prefix: a.slice(0, start).join(""),
    delA: a.slice(start, a.length - end).join(""),
    delB: b.slice(start, b.length - end).join(""),
    suffix: a.slice(a.length - end).join(""),
  };
}
export { fmtDuration, dayLabel, fmtClock, suggestHotword, diffSegments };
