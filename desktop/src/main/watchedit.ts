import { spawn } from "node:child_process";
import log from "electron-log/main.js";

/**
 * 落字后自纠错学习：盯着落字目标输入框看一会儿，用户手动改了哪个词，
 * 就把改后的词自动学进词典，同样的识别错误下次自动纠正。
 *
 * 实现：Windows UI Automation（PowerShell 助手进程）轮询焦点控件文本——
 * ValuePattern / TextPattern 覆盖浏览器、Electron、Office 等现代控件，
 * Name 属性兜底 Win32 经典 Edit（如记事本）。只读文本、只在本机比对，用完即弃。
 *
 * 学习是持续增量的：每次编辑停顿（约 1.5 秒无变化）就把这一轮改动学掉并滚动基线，
 * 一次落字里改多个地方、每个都能学到。只要光标还停在同一个输入框（即使在发呆）
 * 观察就一直续期，看完一段再回头改也能学到；离开输入框后倒计时才开始跑。
 */

const WATCH_SECONDS = 45;
const MAX_WATCH_SECONDS = 300;
const POLL_MS = 700;
/** 编辑停顿判定：这么久没有新变化就认为一轮修改结束 */
const SETTLE_MS = 1500;
/** 变化段任一侧超过这个长度就当作用户在写别的东西，不学（英文单词比中文词长，上限需容下如 "dictation"） */
const MAX_SEGMENT = 20;
/** 中段差异做 LCS 拆分的长度上限，再长视为无关的大改动 */
const MAX_LCS = 160;

const PS_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline = (Get-Date).AddSeconds(${WATCH_SECONDS})
$hardStop = (Get-Date).AddSeconds(${MAX_WATCH_SECONDS})
function Read-ElText($el) {
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
    return $p.Current.Value
  }
  $tp = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$tp)) {
    return $tp.DocumentRange.GetText(20000)
  }
  if ($el.Current.ClassName -match 'Edit') { return $el.Current.Name }
  return $null
}
$last = $null
$anchorId = $null
$anchorEl = $null
$blurSent = $false
while ((Get-Date) -lt $deadline -and (Get-Date) -lt $hardStop) {
  $txt = $null
  $id = ''
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($el) {
      $id = ($el.GetRuntimeId() -join '.')
      $txt = Read-ElText $el
    }
  } catch { $txt = $null }
  if ($txt -ne $null -and $anchorId -eq $null) { $anchorId = $id; $anchorEl = $el }
  # 光标还在落字那个输入框里就续期（即使什么都没改），离开才开始倒计时
  if ($txt -ne $null -and $id -eq $anchorId) {
    $deadline = (Get-Date).AddSeconds(${WATCH_SECONDS})
    $blurSent = $false
  } elseif ($anchorId -ne $null -and -not $blurSent) {
    # 焦点离开落字控件：先补读一次控件当前文本（轮询间隔内最后几次击键可能没被采到），
    # 再通知节点侧立即结算。UIA 按元素引用读文本不依赖焦点，控件已销毁时静默回退
    try {
      if ($anchorEl -ne $null) {
        $ftxt = Read-ElText $anchorEl
        if ($ftxt -ne $null) {
          $fline = $anchorId + '|' + $ftxt
          if ($fline -ne $last) {
            $last = $fline
            [Console]::Out.WriteLine($anchorId + '|' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ftxt)))
          }
        }
      }
    } catch { }
    [Console]::Out.WriteLine('BLUR|')
    $blurSent = $true
  }
  $line = $id + '|' + $txt
  if ($txt -ne $null -and $line -ne $last) {
    $last = $line
    [Console]::Out.WriteLine($id + '|' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($txt)))
  }
  Start-Sleep -Milliseconds ${POLL_MS}
}
`;

export interface Diff {
  wrong: string;
  right: string;
}

const ALNUM = /^[A-Za-z0-9]$/;
const ASCII_SEG = /^[A-Za-z0-9-]+$/;
const CJK_CH = /^[\u4e00-\u9fff]$/;

interface Span {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

/** 去共同前后缀，取中间变化段；中段过大时再用 LCS 拆成多个独立小改动 */
export function extractCorrections(before: string, after: string): Diff[] {
  if (before === after) return [];
  const a = Array.from(before);
  const b = Array.from(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  // 英文单词内部部分重合（如 Bericht→report 共后缀 t）会把词拆碎：把边界外扩到完整单词
  while (start > 0 && ALNUM.test(a[start - 1] ?? "") && (ALNUM.test(a[start] ?? "") || ALNUM.test(b[start] ?? ""))) start--;
  while (
    end > 0 &&
    ALNUM.test(a[a.length - end] ?? "") &&
    (ALNUM.test(a[a.length - end - 1] ?? "") || ALNUM.test(b[b.length - end - 1] ?? ""))
  )
    end--;
  // 中文同音词常只差一字（名天→明天）：去前后缀后剩单字会被 2 字门槛拒学，
  // 回扩 1 字复用共同前/后缀，学到的词仍须过 learnableWord 的 2-6 字门槛
  const singleCjk = (arr: string[]): boolean =>
    arr.length - start - end === 1 && CJK_CH.test(arr[start] ?? "");
  if (singleCjk(a) || singleCjk(b)) {
    if (end > 0 && CJK_CH.test(a[a.length - end] ?? "")) end--;
    else if (start > 0 && CJK_CH.test(a[start - 1] ?? "")) start--;
  }
  const ma = a.slice(start, a.length - end);
  const mb = b.slice(start, b.length - end);
  // 整句/整段重写不是纠错：变化段占原文过半时不学（短句单词改动不受影响）
  if (a.length >= 10 && ma.length > a.length * 0.6) return [];
  // 短段或两侧均为单个英文词时直接当一处改动；长段可能是改了多个不相邻的地方，LCS 对齐后按连续变化段分组
  if ((ma.length <= 6 && mb.length <= 6) || (ma.length > 0 && mb.length > 0 && ASCII_SEG.test(ma.join("")) && ASCII_SEG.test(mb.join("")))) {
    return [{ wrong: ma.join(""), right: mb.join("") }];
  }
  if (ma.length > MAX_LCS || mb.length > MAX_LCS) return [];
  const n = ma.length;
  const m = mb.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = ma[i] === mb[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const spans: Span[] = [];
  let i = 0;
  let j = 0;
  let di = -1;
  let dj = -1;
  const flush = (): void => {
    if (di >= 0) spans.push({ i0: di, i1: i, j0: dj, j1: j });
    di = -1;
    dj = -1;
  };
  while (i < n && j < m) {
    if (ma[i] === mb[j]) {
      flush();
      i++;
      j++;
    } else {
      if (di < 0) {
        di = i;
        dj = j;
      }
      if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
      else j++;
    }
  }
  if (i < n || j < m) {
    if (di < 0) {
      di = i;
      dj = j;
    }
    i = n;
    j = m;
  }
  flush();
  // 一轮改两个词（review→feedback + report→summary）时 LCS 会把词拆碎：
  // 每个变化段各自向两侧吸附到完整单词
  for (const s of spans) {
    while (
      s.i0 > 0 &&
      s.j0 > 0 &&
      ma[s.i0 - 1] === mb[s.j0 - 1] &&
      ALNUM.test(ma[s.i0 - 1] ?? "") &&
      (ALNUM.test(ma[s.i0] ?? "") || ALNUM.test(mb[s.j0] ?? ""))
    ) {
      s.i0--;
      s.j0--;
    }
    while (
      s.i1 < n &&
      s.j1 < m &&
      ma[s.i1] === mb[s.j1] &&
      ALNUM.test(ma[s.i1] ?? "") &&
      (ALNUM.test(ma[s.i1 - 1] ?? "") || ALNUM.test(mb[s.j1 - 1] ?? ""))
    ) {
      s.i1++;
      s.j1++;
    }
  }
  // 吸附后相邻段可能重叠：合并成一段
  const merged: Span[] = [];
  for (const s of spans) {
    const prev = merged[merged.length - 1];
    if (prev && (s.i0 < prev.i1 || s.j0 < prev.j1)) {
      prev.i1 = Math.max(prev.i1, s.i1);
      prev.j1 = Math.max(prev.j1, s.j1);
    } else {
      merged.push(s);
    }
  }
  return merged
    .map((s) => ({ wrong: ma.slice(s.i0, s.i1).join(""), right: mb.slice(s.j0, s.j1).join("") }))
    .filter((d) => d.wrong.length <= MAX_SEGMENT && d.right.length <= MAX_SEGMENT);
}

/** 英文错词须以完整词边界出现在文本里，防止 LCS 碎片（如 "w"）误学 */
function wholeWordIn(text: string, word: string): boolean {
  for (let idx = text.indexOf(word); idx >= 0; idx = text.indexOf(word, idx + 1)) {
    const beforeOk = !ALNUM.test(word[0] ?? "") || !ALNUM.test(text[idx - 1] ?? "");
    const afterOk = !ALNUM.test(word[word.length - 1] ?? "") || !ALNUM.test(text[idx + word.length] ?? "");
    if (beforeOk && afterOk) return true;
  }
  return false;
}

/** 学习门槛：改后的词是 2-6 字纯中文，或 3-20 字符英文词（可含连字符/数字）才收进词典，避免误学标点/删改 */
export function learnableWord(diff: Diff, inserted: string): string | null {
  if (!diff.wrong || diff.wrong === diff.right) return null;
  const zh = /^[\u4e00-\u9fff]{2,6}$/.test(diff.right);
  const en = /^[A-Za-z][A-Za-z0-9-]{2,19}$/.test(diff.right) && /[A-Za-z]/.test(diff.wrong);
  if (!zh && !en) return null;
  // 纯大小写差异不是识别错误（"report"→"Report" 学了会全局强制大写），不学
  if (en && diff.wrong.toLowerCase() === diff.right.toLowerCase()) return null;
  // 改动必须落在我们刚插入的文本里，别人的内容不学
  if (!inserted.includes(diff.wrong)) return null;
  if (en && !wholeWordIn(inserted, diff.wrong)) return null;
  return diff.right;
}

let current: ReturnType<typeof spawn> | null = null;

/**
 * 落字成功后调用：持续观察目标输入框，用户每改完一处（停顿约 1.5 秒）就把
 * 插入文本里被改掉的词整批回调（同一轮停顿改多个词只弹一次学习提示），
 * 基线滚动更新，可连续学多处。
 * 同时只跑一个观察进程，新落字会顶掉旧的（顶掉前把最后一轮改动也学完）。
 */
export function watchPastedText(
  inserted: string,
  onLearn: (corrections: Diff[]) => void,
): void {
  if (process.platform !== "win32") return;
  if (current) {
    current.kill();
    current = null;
  }
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  current = child;

  let baseline: string | null = null;
  let baselineId = "";
  let pending: string | null = null;
  let settleTimer: NodeJS.Timeout | null = null;
  let buf = "";

  const settle = (): void => {
    settleTimer = null;
    if (baseline === null || pending === null || pending === baseline) return;
    const learned: Diff[] = [];
    for (const diff of extractCorrections(baseline, pending)) {
      const right = learnableWord(diff, inserted);
      if (!right) continue;
      log.info(`auto-learn: "${diff.wrong}" -> "${right}"`);
      learned.push({ wrong: diff.wrong, right });
    }
    if (learned.length > 0) onLearn(learned);
    // 基线滚动到当前文本：后面接着改还能继续学
    baseline = pending;
    pending = null;
  };

  child.stdout!.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const sep = line.indexOf("|");
      if (sep < 0) continue;
      const id = line.slice(0, sep);
      if (id === "BLUR") {
        if (settleTimer) {
          clearTimeout(settleTimer);
          settle();
        }
        continue;
      }
      let text: string;
      try {
        text = Buffer.from(line.slice(sep + 1).trim(), "base64").toString("utf8");
      } catch {
        continue;
      }
      // 第一份包含插入文本的采样作为基线，并记住控件身份；
      // 后续只比对同一个控件，用户切去别的窗口打字不能被误学
      if (baseline === null) {
        if (text.includes(inserted)) {
          baseline = text;
          baselineId = id;
        }
        continue;
      }
      if (!id || id !== baselineId) continue;
      pending = text;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, SETTLE_MS);
    }
  });

  child.on("close", () => {
    if (current === child) current = null;
    // 观察结束（或被新落字顶掉）时，把最后一轮还没结算的改动也学完
    if (settleTimer) clearTimeout(settleTimer);
    settle();
  });
  child.on("error", (error) => {
    if (current === child) current = null;
    log.warn("watchPastedText helper failed", error);
  });
}
