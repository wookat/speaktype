import { spawn } from "node:child_process";
import log from "electron-log/main.js";

/**
 * 落字后自纠错学习：盯着落字目标输入框看一小会儿，用户手动改了哪个词，
 * 就把改后的词自动学进词典，同样的识别错误下次自动纠正。
 *
 * 实现：Windows UI Automation（PowerShell 助手进程）轮询焦点控件文本——
 * ValuePattern / TextPattern 覆盖浏览器、Electron、Office 等现代控件，
 * Name 属性兜底 Win32 经典 Edit（如记事本）。只读文本、只在本机比对，用完即弃。
 */

const WATCH_SECONDS = 15;
const POLL_MS = 700;
/** 变化段任一侧超过这个长度就当作用户在写别的东西，不学 */
const MAX_SEGMENT = 10;

const PS_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline = (Get-Date).AddSeconds(${WATCH_SECONDS})
$last = $null
while ((Get-Date) -lt $deadline) {
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

/** 去共同前后缀，取中间变化段；变化过大视为无关编辑 */
export function extractCorrection(before: string, after: string): Diff | null {
  if (before === after) return null;
  const a = Array.from(before);
  const b = Array.from(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const wrong = a.slice(start, a.length - end).join("");
  const right = b.slice(start, b.length - end).join("");
  if (wrong.length > MAX_SEGMENT || right.length > MAX_SEGMENT) return null;
  return { wrong, right };
}

/** 学习门槛：改后的词是 2-6 字纯中文才收进词典，避免误学标点/删改 */
export function learnableWord(diff: Diff, inserted: string): string | null {
  if (!diff.wrong || diff.wrong === diff.right) return null;
  if (!/^[\u4e00-\u9fff]{2,6}$/.test(diff.right)) return null;
  // 改动必须落在我们刚插入的文本里，别人的内容不学
  if (!inserted.includes(diff.wrong)) return null;
  return diff.right;
}

let current: ReturnType<typeof spawn> | null = null;

/**
 * 落字成功后调用：观察目标输入框 15 秒，发现用户把插入文本里的某个词改掉了，
 * 回调 (错词, 对词)。同时只跑一个观察进程，新落字会顶掉旧的。
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
  let latest: string | null = null;
  let buf = "";
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
      if (id && id === baselineId && text !== baseline) latest = text;
    }
  });

  child.on("close", () => {
    if (current === child) current = null;
    if (baseline === null || latest === null) return;
    const diff = extractCorrection(baseline, latest);
    if (!diff) return;
    const right = learnableWord(diff, inserted);
    if (!right) return;
    log.info(`auto-learn: "${diff.wrong}" -> "${right}"`);
    onLearn(diff.wrong, right);
  });
  child.on("error", (error) => {
    if (current === child) current = null;
    log.warn("watchPastedText helper failed", error);
  });
}
