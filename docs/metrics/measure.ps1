# SpeakType 可用性度量一键脚本（第 101 轮基线方法固化，第 102 轮起随发版跑）
# 用法见同目录 README.md。必须以 -STA 运行：powershell -STA -File measure.ps1 -AppExe <SpeakType.exe 路径>
param(
  [Parameter(Mandatory = $true)][string]$AppExe,
  [string]$ZhAudio = "",           # 中文短句音频（wav/mp3），内容应为「今天下午3点开会，预算是5200元」类短句
  [string]$EnText = "this is a short test sentence",
  [int]$Runs = 5,
  [switch]$SkipHotwords,           # 跳过热词命中率（会临时改词典，脚本自动备份/还原配置）
  [int]$MockPort = 18099
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Name K -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);'
$appData = Join-Path $env:APPDATA "SpeakType"
$log = Join-Path $appData "logs\main.log"
$cfg = Join-Path $appData "speaktype.json"
$backup = "$cfg.metrics-bak"
$wsh = New-Object -ComObject WScript.Shell

function Speak([string]$text) {
  Add-Type -AssemblyName System.Speech
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SetOutputToDefaultAudioDevice(); $s.Rate = 0; $s.Speak($text); $s.Dispose()
}
function PlayAudio([string]$file) {
  Add-Type -AssemblyName PresentationCore
  $mp = New-Object System.Windows.Media.MediaPlayer
  $mp.Open([Uri](Resolve-Path $file)); $mp.Play(); Start-Sleep -Milliseconds 500
  while (-not $mp.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds 100 }
  Start-Sleep -Milliseconds ([int]$mp.NaturalDuration.TimeSpan.TotalMilliseconds)
  $mp.Stop(); $mp.Close()
}
# 松开热键 → 剪贴板出现结果，25ms 轮询
function MeasureDictation([string]$file, [string]$text) {
  $null = $wsh.AppActivate("Untitled - Notepad"); Start-Sleep -Milliseconds 500
  [System.Windows.Forms.Clipboard]::SetText("SENTINEL")
  [W.K]::keybd_event(0xA3, 0x1D, 0x1, [UIntPtr]::Zero)   # RightCtrl down
  Start-Sleep -Milliseconds 400
  if ($file) { PlayAudio $file } else { Speak $text }
  Start-Sleep -Milliseconds 900
  $sw = [Diagnostics.Stopwatch]::StartNew()
  [W.K]::keybd_event(0xA3, 0x1D, 0x3, [UIntPtr]::Zero)   # RightCtrl up
  while ($sw.ElapsedMilliseconds -lt 30000) {
    try { $c = [System.Windows.Forms.Clipboard]::GetText() } catch { $c = "SENTINEL" }
    if ($c -and $c -ne "SENTINEL") { break }
    Start-Sleep -Milliseconds 25
  }
  $sw.ElapsedMilliseconds
}
function Median($arr) { $s = $arr | Sort-Object; $s[[int](($s.Count - 1) / 2)] }

# ---------- 0. 准备：备份配置，确保 Notepad ----------
Copy-Item $cfg $backup -Force
if (-not (Get-Process notepad -EA SilentlyContinue)) { Start-Process notepad; Start-Sleep 2 }
Get-Process SpeakType -EA SilentlyContinue | Stop-Process -Force; Start-Sleep 2

# ---------- 1. 冷启动 → ASR 就绪（模型已下载态） ----------
$seen = (Get-Content $log -EA SilentlyContinue | Select-String "sherpa worker started" | Measure-Object).Count
$sw = [Diagnostics.Stopwatch]::StartNew()
Start-Process $AppExe
while ($sw.ElapsedMilliseconds -lt 60000) {
  $n = (Get-Content $log -EA SilentlyContinue | Select-String "sherpa worker started" | Measure-Object).Count
  if ($n -gt $seen) { break }
  Start-Sleep -Milliseconds 100
}
$cold = $sw.ElapsedMilliseconds
Start-Sleep 3

# ---------- 2. 松手 → 落字延迟 zh / en ----------
$zh = @(); $en = @()
if ($ZhAudio) { 1..$Runs | ForEach-Object { $zh += MeasureDictation $ZhAudio ""; Start-Sleep 2 } }
1..$Runs | ForEach-Object { $en += MeasureDictation "" $EnText; Start-Sleep 2 }

# ---------- 3. F8 改写端到端（mock 即答端点，需要 node） ----------
$mockJs = Join-Path $env:TEMP "st-mock-polish.js"
@"
const http = require("http");
http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => {
  res.writeHead(200, {"Content-Type": "application/json"});
  res.end(JSON.stringify({choices: [{message: {content: "MOCK-REWRITE"}}]}));
}); }).listen($MockPort, "127.0.0.1");
"@ | Set-Content $mockJs -Encoding UTF8
$mock = Start-Process node -ArgumentList $mockJs -WindowStyle Hidden -PassThru
Get-Process SpeakType | Stop-Process -Force; Start-Sleep 2
$j = Get-Content $cfg -Raw | ConvertFrom-Json
$j.settings.polishBaseUrl = "http://127.0.0.1:$MockPort/v1"; $j.settings.polishApiKey = "mock"
$j | ConvertTo-Json -Depth 10 | Set-Content $cfg -Encoding UTF8
Start-Process $AppExe; Start-Sleep 10
$f8 = @()
1..3 | ForEach-Object {
  $null = $wsh.AppActivate("Untitled - Notepad"); Start-Sleep -Milliseconds 500
  [System.Windows.Forms.SendKeys]::SendWait("sample text for rewrite`n"); Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait("^a"); Start-Sleep -Milliseconds 300
  [System.Windows.Forms.Clipboard]::SetText("SENTINEL")
  [W.K]::keybd_event(0x77, 0x42, 0x0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 500
  Speak "make it uppercase"; Start-Sleep -Milliseconds 900
  $sw = [Diagnostics.Stopwatch]::StartNew()
  [W.K]::keybd_event(0x77, 0x42, 0x2, [UIntPtr]::Zero)
  while ($sw.ElapsedMilliseconds -lt 30000) {
    try { $c = [System.Windows.Forms.Clipboard]::GetText() } catch { $c = "" }
    if ($c -match "MOCK-REWRITE") { break }
    Start-Sleep -Milliseconds 25
  }
  $f8 += $sw.ElapsedMilliseconds; Start-Sleep 2
}
Stop-Process $mock -Force -EA SilentlyContinue

# ---------- 4. 热词命中率（en 变体 5 例 + zh 同音 2 例，zh 需 -ZhAudio 覆盖句） ----------
$hot = "skipped"
if (-not $SkipHotwords) {
  Get-Process SpeakType | Stop-Process -Force; Start-Sleep 2
  $j = Get-Content $cfg -Raw | ConvertFrom-Json
  $j.settings.hotwords = @("SpeakType", "GitHub", "DevOps", "PostgreSQL", "TypeScript", "JavaScript")
  $j | ConvertTo-Json -Depth 10 | Set-Content $cfg -Encoding UTF8
  Start-Process $AppExe; Start-Sleep 10
  $cases = @(
    @{ say = "we use speak type every day"; want = "SpeakType" },
    @{ say = "check the git hub repository"; want = "GitHub" },
    @{ say = "our dev ops pipeline is fast"; want = "DevOps" },
    @{ say = "I like type script a lot"; want = "TypeScript" },
    @{ say = "java script runs everywhere"; want = "JavaScript" }
  )
  $hits = 0
  foreach ($c in $cases) {
    $null = $wsh.AppActivate("Untitled - Notepad"); Start-Sleep -Milliseconds 500
    [System.Windows.Forms.Clipboard]::SetText("SENTINEL")
    [W.K]::keybd_event(0xA3, 0x1D, 0x1, [UIntPtr]::Zero); Start-Sleep -Milliseconds 400
    Speak $c.say; Start-Sleep -Milliseconds 900
    [W.K]::keybd_event(0xA3, 0x1D, 0x3, [UIntPtr]::Zero)
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt 30000) {
      try { $t = [System.Windows.Forms.Clipboard]::GetText() } catch { $t = "SENTINEL" }
      if ($t -and $t -ne "SENTINEL") { break }
      Start-Sleep -Milliseconds 25
    }
    if ($t -clike "*$($c.want)*") { $hits++ }
    Start-Sleep 2
  }
  $hot = "$hits/5"
}

# ---------- 收尾：还原配置并重启应用 ----------
Get-Process SpeakType -EA SilentlyContinue | Stop-Process -Force; Start-Sleep 2
Copy-Item $backup $cfg -Force; Remove-Item $backup -Force
Remove-Item $mockJs -Force -EA SilentlyContinue

"==== SpeakType metrics ===="
"cold_start_to_asr_ready_ms: $cold"
if ($zh.Count) { "dictation_latency_zh_ms: $($zh -join '/') median=$(Median $zh)" }
"dictation_latency_en_ms: $($en -join '/') median=$(Median $en)"
"f8_rewrite_e2e_ms: $($f8 -join '/') median=$(Median $f8)"
"hotword_en_variant_hits: $hot"
"note: 虚拟声卡环境下绝对值仅作同机相对对比"
