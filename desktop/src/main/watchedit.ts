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
$last = $null
$anchorId = $null
while ((Get-Date) -lt $deadline -and (Get-Date) -lt $hardStop) {
  $txt = $null
  $id = ''
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($el) {
      $id = ($el.GetRuntimeId() -join '.')
      $p = $null
      if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
        $txt = $p.Current.Value
      } else {
        $tp = $null
        if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$tp)) {
          $txt = $tp.DocumentRange.GetText(20000)
        } elseif ($el.Current.ClassName -match 'Edit') {
          $txt = $el.Current.Name
        }
      }
    }
  } catch { $txt = $null }
  if ($txt -ne $null -and $anchorId -eq $null) { $anchorId = $id }
  # 光标还在落字那个输入框里就续期（即使什么都没改），离开才开始倒计时
  if ($txt -ne $null -and $id -eq $anchorId) {
    $deadline = (Get-Date).AddSeconds(${WATCH_SECONDS})
  }
  $line = $id + '|' + $txt
  if ($txt -ne $null -and $line -ne $last) {
    $last = $line
    [Console]::Out.WriteLine($id + '|' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($txt)))
  }
  Start-Sleep -Milliseconds ${POLL_MS}
}
`;

interface Diff {
  wrong: string;
  right: string;
}

const ALNUM = /^[A-Za-z0-9]$/;
const ASCII_SEG = /^[A-Za-z0-9-]+$/;

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
  const ma = a.slice(start, a.length - end);
  const mb = b.slice(start, b.length - end);
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
  const out: Diff[] = [];
  let i = 0;
  let j = 0;
  let wrong = "";
  let right = "";
  const flush = (): void => {
    if (wrong || right) out.push({ wrong, right });
    wrong = "";
    right = "";
  };
  while (i < n && j < m) {
    if (ma[i] === mb[j]) {
      flush();
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      wrong += ma[i++];
    } else {
      right += mb[j++];
    }
  }
  wrong += ma.slice(i).join("");
  right += mb.slice(j).join("");
  flush();
  return out.filter((d) => d.wrong.length <= MAX_SEGMENT && d.right.length <= MAX_SEGMENT);
}

/** 学习门槛：改后的词是 2-6 字纯中文，或 3-20 字符英文词（可含连字符/数字）才收进词典，避免误学标点/删改 */
export function learnableWord(diff: Diff, inserted: string): string | null {
  if (!diff.wrong || diff.wrong === diff.right) return null;
  const zh = /^[\u4e00-\u9fff]{2,6}$/.test(diff.right);
  const en = /^[A-Za-z][A-Za-z0-9-]{2,19}$/.test(diff.right) && /[A-Za-z]/.test(diff.wrong);
  if (!zh && !en) return null;
  // 改动必须落在我们刚插入的文本里，别人的内容不学
  if (!inserted.includes(diff.wrong)) return null;
  return diff.right;
}

let current: ReturnType<typeof spawn> | null = null;

/**
 * 落字成功后调用：持续观察目标输入框，用户每改完一处（停顿约 1.5 秒）就把
 * 插入文本里被改掉的词回调 (错词, 对词)，基线滚动更新，可连续学多处。
 * 同时只跑一个观察进程，新落字会顶掉旧的（顶掉前把最后一轮改动也学完）。
 */
export function watchPastedText(
  inserted: string,
  onLearn: (wrong: string, right: string) => void,
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
    for (const diff of extractCorrections(baseline, pending)) {
      const right = learnableWord(diff, inserted);
      if (!right) continue;
      log.info(`auto-learn: "${diff.wrong}" -> "${right}"`);
      onLearn(diff.wrong, right);
    }
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
