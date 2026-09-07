# 第 304 轮验收报告 · 打包版 SpeakType 0.17.2（main `851fb4b`）

- 角色：user-experience-officer + qa-engineer（独立复核，不照抄第 303 轮主控用例）
- 被测物：`desktop/release/win-unpacked/SpeakType.exe`，本机按 `cd desktop && npm install && npm run typecheck && npm run build && npm run pack:dir` 打出；不测 dev
- 环境：Windows Server VM，单显示器 1280×720（工作区 680），实际 DPI 100%（`devicePixelRatio=1`）；Node 20.19；fake mic（`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`）+ CDP `--remote-debugging-port=9333`；下载/mock 用例只在**便携副本**（`C:\tmp\r304\portable`，asar 改指向本地 dlproxy）上跑，正式副本 asar 未改
- 证据目录：`C:\tmp\r304\`（`findings.md`、`findings-phase2.md`、`shots\*.png`、`*-main.log`/`*-history.json`/`*-panel.log` 切片、`r304-evidence.zip`、`r304-phase2-evidence.zip`）；录屏 `C:\Users\Administrator\screencasts\r304-phase1\r304-phase1-edited.mp4`、`r304-phase2\r304-phase2-edited.mp4`
- 说明：报告里「PASS/FAIL/未测」逐项如实；「有代码」≠「验证过」，凡未实测的一律标 **未测** 并给原因

## 0. 结论（可直接转发老板）

1. 第 304 轮打包版核心链路（RightCtrl/排队/Alt+Q/Esc/F8 改写/深色、SenseVoice zh、Parakeet en、whisper ja、手机麦 owner 隔离、端口竞态）全部 PASS，#394 三项修复独立复核 PASS（润色状态精准、VS Code 无障碍 toast 一次性且五语均触发、光标避让按源码条件生效），无 P0/P1，**可发布**。
2. 本轮立案 1 项 P2（Parakeet int8 在真实「文件转录」路径复现首词 `Ple` 且一例整句丢词 `Ple sed by Friday.`，UI 无任何低置信提示；int8 空串在文件路径 0/4 未复现）和 12 项 P3（en/ja/ko 无障碍 toast 正文被截断、VTT/TXT 时间轴偏差 0.6–2.4 s、悬浮条遮挡 WordPad 功能区/资源管理器导航/被 Windows 搜索面板盖住、Home 统计口径随界面语言变动、导出/复制无完成反馈、模型录音中切换语义等）。
3. 180 分钟免按 soak（1854 段）主窗 renderer PrivateBytes 斜率 −0.0015 MB/min、非单调，内存观察项关闭（main 进程在一次 10.6 s 长段后一次性 +130 MB 后持平，记 305 复核）；125%/150% DPI、第二显示器、APM 关闭下的 4×5 麦克风矩阵三项**未测**（VM 改注册表 DPI 不生效、无第二显示器、Chromium 开关未能关掉 APM），需 305 轮换环境补测。

## 1. 环境与方法

| 项 | 实测 |
|---|---|
| 源码 | `git clone` main → `851fb4b`（#392/#394/#393/#395 已含），工作树干净 |
| 构建 | `npm install`（EBADENGINE 警告忽略）→ `node_modules\electron\dist\electron.exe` **缺失**，`node node_modules/electron/install.js` 后恢复；`npm run typecheck` PASS；`npm run build`、`npm run pack:dir` 成功产出 `release\win-unpacked\SpeakType.exe`（asar ≈36 MB，`app.asar.unpacked` 含 koffi/sherpa-onnx-node/sherpa-onnx-win-x64/uiohook-napi） |
| 语料 | Edge TTS→mp3→ffmpeg 16k wav：`en1.wav`「Please schedule the meeting for tomorrow at three in the afternoon.」、`ja1.wav`「明日の午前中までに、この資料を確認してください」、`zh_rewrite.wav`（改写指令）、`sample.wav`（zh「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」）；Parakeet 8 个 fixture 从 `origin/review/round303-parakeet-ab` 的 `docs/reviews/r303-parakeet-fixtures/` 取回 |
| 热键 | `rkey.ps1` SendInput 扫描码注入（本轮修复 INPUT 联合体 `Size=32`，否则静默失败）；Alt+Q/Esc/F8/RightCtrl 均走 uiohook 真实路径 |
| 取证 | `panelpoll.mjs`（150 ms 轮询 panel/toast 渲染进程 DOM，记录 `PANEL "vis|x,y|w×h|text"`）、`phasepoll.mjs`（`localModelStatus.phase` + `[role=status]`）、`cdpmap.mjs`（`--inspect=9229` 一次性映射 renderer PID→窗口）、`rss.ps1`（60 s 采样 PrivateBytes/WorkingSet） |
| mock | `mock_llm.cjs`（OpenAI 兼容 `/v1/chat/completions`，可配延迟，记录 abort）、`mockws\whisper-server.exe`（C# HttpListener，`health_delay.txt`/`infer_delay.txt` 控制延迟）、`dlproxy.cjs`（`dlctl.json` 模式 `ok|stall|badsha|…`，支持 Range 206）、手机麦 LAN WebSocket PCM 模拟器 |

## 2. 核心链路回归（每轮必做）

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| A1 | RightCtrl 按住说话落字 Notepad（Parakeet en） | **PASS** | `A-parakeet-main.log`、`A-parakeet-history.json`、`shots/A-parakeet-landed.png`：5.5 s hold 落字「Please schedule the meeting for tomorrow at three in the afternoon.」 |
| A2 | 排队第二句 | **PASS（机制）** | `A-queue-main.log`：`12:58:01.236 dictation finalize: durationMs=7970` → `12:58:01.716 dictation start: previous session still finalizing, queued` → `12:58:01.929 dictation start: resumed queued hold (frames=1, released=false)` → `12:58:09.599 finalize durationMs=7883`；Notepad 两句先后落字（`shots/A-queue-landed.png`）。**限制**：两次录音同一 fixture（fake mic 只能单文件），只证明了时序与两次落字，**未证明**「第二句内容≠第一句」的身份顺序；G1 用 en1 再跑一次同样如此（`G1-main.log` 13:55:50.436/50.644/51.107/53.534） |
| A3 | Alt+Q 进出免按 | **PASS** | `A-handsfree-main.log`、`A-handsfree-history.json`：自动分段 ≥2 句，第二次 Alt+Q 结束当前段并退出，toast「免按模式已退出」（`shots/A-handsfree-exit.png`） |
| A4 | 录音中 Esc 取消 | **PASS** | `A-cancel-panel.log`：toast「听写已取消 / 未落入任何文字」，Notepad 与 history 计数不变（`shots/A-esc-cancel.png`） |
| A5 | F8 mock 改写 | **PASS** | 选中文本 + F8 + `zh_rewrite.wav` → `MOCK-REWRITE[2]` 替换原文（`shots/A-rewrite-landed.png`，`mock_llm.log` 请求含改写 prompt）；Esc 取消：原文保留、mock 端 `client aborted`（`B-rewrite-cancel-panel.log` 13:01:16.291） |
| A6 | 深色模式 | **PASS** | 注册表 `AppsUseLightTheme=0` 后主窗/悬浮条/toast 实时变色，对比度正常（`shots/A-dark-main.png`、`A-dark-panel.png`） |
| A7 | SenseVoice zh 一遍 | **PASS** | UI 下载 7.1 s，99% 时可见「校验中」（`shots/A-sensevoice-verifying.png`）；`sample.wav` 落字「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」（`B-polish-off-history.json`） |
| A8 | Parakeet en 一句 | **PASS** | 同 A1 |
| A9 | whisper base ja 一句 | **PASS** | `A-whisper-ja-main.log`：`13:18:58.116 local model base-q5_1 downloaded` → `13:19:26.215 local whisper-server starting (model=base-q5_1, port=50562)` → `13:19:32.569 dictation finalize: durationMs=6378`；落字「明日の午前中までに、この資料を確認してください」（`shots/A-whisper-ja-landed.png`） |
| A10 | 手机麦 owner 隔离 b-①②③（LAN） | **PASS** | `A-phone-owner-main.log`：手机会话进行中 `13:17:06.790 dictation stop: hold release ignored, phone session in progress`、`13:17:08.312 dictation stop: rewrite release ignored, phone session in progress`，仅手机 stop 触发 `13:17:09.510 finalize durationMs=9235`，history `source=phone`；mock LLM 请求数不变（无误触改写）。b-②/③ 桌面 Esc、WS 1006 断开、手机 cancel 三种取消均弹「已取消」且 history 计数/首 ID 不变（`A-phone-{esc,close,cancel}-*`）。**限制**：用的是授权 LAN WebSocket PCM 模拟器，非真手机浏览器麦克风权限路径 |
| A11 | 端口竞态 a-③ | **PASS** | 预占 43117 后 LAN 页面给出 43118（`remote mic listening at https://172.16.8.2:43118/?t=[REDACTED]`），模拟器在 43118 连通 |

## 3. 专项 a) #394 独立复核

### a-① 润色状态精准（P3-302-4）

| 场景 | 期望 | 实测 | 证据 |
|---|---|---|---|
| `polishEnabled=false`（默认） | 全程无 `polishing` | **PASS**：panelpoll 序列 `12:57:11.970 转写中…` → `12:57:12.587 最终文本` → `12:57:13.879 hidden`，**无**「润色中」 | `B-polish-off-panel.log` |
| 开 mock LLM（`polishEnabled=true`，`polishBaseUrl=http://127.0.0.1:8098/v1`，mock 延迟 3 s） | 有 `polishing` | **PASS**：`12:59:55.977 转写中…` → `12:59:56.293 润色中…` → `12:59:59.858 MOCK-POLISH[1]` → `13:00:00.983 hidden` | `B-polish-on-panel.log`、`shots/B-polishing-visible.png` |
| F8 改写 | 有 polishing 且 Esc 可取消 | **PASS**：改写期悬浮条显示「改写中…」（渲染层对 rewrite 用专门文案，不是「润色中…」——符合 `panel.tsx` 按 mode 取文案的设计，不算缺陷）；Esc 后 `13:01:16.367 hidden` + `13:01:16.369 已取消/原文未变` toast，mock 端第 3 个请求 `client aborted` | `B-rewrite-panel.log`、`B-rewrite-cancel-panel.log`、`shots/B-rewrite-cancel-{before,inflight,after}.png` |
| 延迟润色 Esc 取消 | 可取消 | **PASS**：润色 3 s 窗口内 Esc → 原文不落、mock abort | 同上 |

源码核对：`dictation.ts` 仅 `if (rewriteTarget || usesLlmPolish(settings)) this.report("polishing")`；`polish.ts` `usesLlmPolish = polishEnabled && Boolean(polishBaseUrl)`。与实测一致。

### a-② VS Code 无障碍 toast（P3-302-2）

VS Code 用便携版 1.136（`C:\tmp\r304\vscode`），默认 settings（无 `editor.accessibilitySupport`）。

| 场景 | 结果 | 证据 |
|---|---|---|
| zh-CN 首次听写 → 一次性 toast | **PASS**：`13:02:35.629 auto-learn: editor not accessible (Monaco a11y hint), watch stopped`；toast 可见区间 13:02:35.767–13:02:43.754（≈8.0 s）；标题「此编辑器暂不支持自动学习」正文「VS Code 等编辑器需按 Shift+Alt+F1 开启屏幕阅读器优化模式，SpeakType 才能看到你的修改」 | `B-vscode-zh-main.log`、`B-vscode-zh-panel.log`、`shots/B-vscode-a11y-zh-CN.png` |
| 第二次听写不再弹 | **PASS**：`13:02:55.860` 同样记 `editor not accessible` 日志，但 panelpoll 无第二次 toast（`a11yHintShown` 每进程一次） | 同上 |
| en 文案 | **功能 PASS / UX FAIL（P3-304-3）**：toast 可见 13:04:09.117–13:04:17.150（8.03 s），但正文在 100% DPI 下被省略号截断为「SpeakType can see your…」，用户看不到「edits」 | `shots/B-vscode-a11y-en.png`、`B-vscode-en-panel.log` |
| zh-TW / ja / ko | zh-TW **PASS**（完整可读，「螢幕閱讀器最佳化」可理解；台湾惯用「螢幕閱讀器」已对，无需改）；ja **UX FAIL**（截断于「SpeakType が編集を…」）；ko **UX FAIL**（截断于「SpeakType이 수정을 감지할 수 …」）；五语均真实触发 | `shots/C-a11y-{zh-TW,ja,ko}.png`、`C-vscode-*-panel.log` |
| Shift+Alt+F1 开启后 3/3 逐键改词 | **PASS**：`13:08:49.987 auto-learn: "答复" -> "回复"`、`13:09:09.452 "答复" -> "回信"`、`13:09:30.387 "答复" -> "回应"`，history 三条同 id 文本被替换 | `B-vscode-learn-main.log`、`B-vscode-learn-history.json`、`shots/B-vscode-learn-3of3.png` |
| Notepad 3/3 | **PASS** | `B-notepad-learn-main.log`、`shots/B-notepad-learn-3of3.png` |
| Edge textarea 3/3（Chrome 未装，用 Edge） | **PASS**（新进程起测，避免每进程一次的假阴性） | `B-edge-learn-main.log`、`shots/B-edge-learn-3of3.png` |
| 空 textarea 负例 | **PASS**：无 toast、main.log 仅 `dictation finalize` | `B-edge-empty-learn-panel.log` |

8 s 够读完？zh-CN 两行正文集中阅读可读完；en/ja/ko 因截断谈不上读完。体验官意见：标题「此编辑器暂不支持自动学习」容易被误读成「不支持听写」，建议改为「自动学词需先开启编辑器无障碍」（见 P3-304-3/-4）。

### a-③ 光标避让（P3-302-3）

源码：`windows.ts dockPanel()`，PANEL 460×150、底槽 `y = workArea.bottom - 150 - 12`，光标矩形（`activeapp.ts caretRect()` = `GetGUIThreadInfo.rcCaret` + `ClientToScreen`）扩 24 px **与底槽矩形相交**才改停 `workArea.y + 12`。本机底槽 `410,518`、顶槽 `410,12`。

| 场景 | 期望 | 实测 | 证据 |
|---|---|---|---|
| Notepad 最大化，底行**居中**光标 | 顶部 | **PASS** `PANEL 410,12` | `B-dock-bottom-100-panel.log`、`shots/B-dock-bottom-caret-top-panel-100.png` |
| 顶行光标 | 底部 | **PASS** `410,518` | `B-dock-top-100-panel.log` |
| 屏幕中部光标 | 底部 | **PASS** `410,518` | `B-dock-middle-100-panel.log` |
| WordPad（无 Word） | 按相交判定 | **PASS** 底行居中→`410,12`；**UX（P3-304-5）**：顶槽盖住功能区「插入/编辑」与标尺 | `B-dock-wordpad-panel.log`、`shots/B-dock-wordpad-top.png` |
| Windows 搜索框 | 记录行为 | panelpoll `410,518` 且有实时识别文本，但截图里**看不到悬浮条**（被搜索面板盖住）→ **可见性 FAIL（P3-304-5）** | `B-dock-search-panel.log`、`shots/B-dock-search-panel-obscured.png` |
| Edge 地址栏 | Chromium 自绘无 Win32 光标→底部 | **PASS** `410,518`，可见 | `B-dock-edge-address-panel.log`、`shots/B-dock-edge-address-bottom.png` |
| 资源管理器重命名（底部文件） | — | 避开输入框停顶部，但盖住地址栏/导航按钮（G2） | `shots/G-Explorer-rename-top-over-navigation.png` |
| DPI 125% / 150% | 重启后复核 | **未测**：显示设置里缩放下拉在本 VM 灰掉；写 `LogPixels`/`AppliedDPI`=120/144 + 重启 Explorer 与 app 后 renderer 仍 `devicePixelRatio=1`、`screen 1280×720`（`B-dpi-final-cdp.log`），注销会切断测试通道未执行。**未以注册表值冒充实测** | `shots/B-dpi-disabled.png`、`dpi-before.reg` |
| 第二显示器 | — | **未测**：VM 单显示器，`Set-DisplayResolution` 无法加屏 | — |

用户视角：顶槽**不遮** Notepad 菜单（菜单左对齐，悬浮条居中），但盖住文档第 2–6 行中央文字；位置切换对用户无提示、也无法拖动/固定。判断：**需要**「可拖动 / 记住位置」或「固定顶/底」偏好（P3-304-5），不是阻塞项。

## 4. 专项 b) P3-302-1 Parakeet 真实路径取证

### b-① Transcribe 页文件转录（不经麦克风/APM）

官方副本、Parakeet、`language=en`，8 个 fixture 逐个从 UI 选择文件；`D-transcribe-main.log` 每条 `file transcribe started (…, model=parakeet-tdt-0.6b-v3)` → `file transcribe done (1 segments)`，UI 均显示「完成」、无任何低置信/异常提示，每条各入 1 条 `source=file` History。

| Fixture | 页面显示 | History `at` / `durationMs` | 判定 |
|---|---|---|---|
| empty_s09g_700_1001.wav | Could you share the slides from yesterday's presentation? | 1788701913278 / 7536 | PASS（空串**未复现**） |
| empty_s09g_700_1004.wav | 同上 | 1788701932981 / 7536 | PASS |
| empty_s09g_700_1010.wav | 同上 | 1788701947857 / 7536 | PASS |
| empty_s09g_700_1013.wav | 同上 | 1788701963377 / 7536 | PASS |
| ple_en_200_zero.wav | **Ple** schedule the meeting for tomorrow at three in the afternoon. | 1788701977892 / 7286 | **FAIL**（P3） |
| ple_s01j_300_zero.wav | **Ple sed by Friday.**（原句 Please send me the updated report by Friday.） | 1788701992149 / 6568 | **FAIL**（P2） |
| ple_s01j_500_zero.wav | Please send me the updated report by Friday. | 1788702007793 / 6768 | PASS |
| ctl_s09g_700_zero.wav | Could you share the slides from yesterday's presentation? | 1788702023508 / 7536 | PASS |

证据：`D-transcribe-history.json`、`D-*-state.json`（`transcribe-last.json` 快照）、`shots/D-ple300-artifact.png`、`D-ple-en-artifact.png`、`D-empty*-nonempty.png`。

### b-② recorder 约束与 APM 关闭尝试

`desktop/src/preload/recorder.ts`：`getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true[, deviceId] } })`——产品**显式开启**三项 APM。用 CDP 在 recorder 进程读 `track.getSettings()`，四种启动组合结果**完全相同**：

```json
{"echoCancellation":true,"noiseSuppression":true,"autoGainControl":true,"channelCount":1,"sampleRate":48000,"sampleSize":16,"latency":0.01,"voiceIsolation":false}
```

尝试过：常规 fake 开关；`--disable-features=WebRtcAudioProcessing`；`--disable-features=WebRtcAudioProcessing,WebRtcApmInAudioService`；`--disable-features=WebRtcAllowInputVolumeAdjustment`（`D-apm-{normal,processing,service,volume}.json`）。因产品侧约束写死为 true，命令行开关无法在不改代码的前提下关掉 APM → **4 个 empty 样本 × 5 次的关 APM 麦克风矩阵：未测**。补充：APM 开着的 fake mic 跑 empty_1001 落字正常（`D-apm-mic-main.log`）。

### b-③ 结论

- 真实产品路径（Transcribe 页）**复现 `Ple`**（2/8，其中 1 例整句丢词），**未复现 int8 空串**（0/4；`transcribe.ts` 走 `segmentPeak ≥ SILENT_PEAK` 后直传 sherpa，同 302 轮离线路径，但本轮 4 个 700 ms 前导样本均出全句）。
- 严重度：`Ple sed by Friday.` 丢掉「send me the updated report」这一动作主体、且 UI 显示「完成」并入 History → **P2**（用户可感知、无补救提示）；`Ple schedule…` 仅首词残缺 → P3。2/8 是刀口样本命中率，**不是**真人语料发生率（第 303 轮 A/B：int8 15/99 vs fp32 0/99）。
- 关 APM 麦克风路径：未测（原因见 b-②）。

## 5. 专项 c) #391 三项复核

### c-① VTT / 时间戳 TXT 内容与时间轴（3 处对照）

语料 `E-three-en.wav`：en1.wav 用 ffmpeg `-stream_loop 2` 拼三遍（17.357 s），`ffmpeg silencedetect -35dB/0.3s` 量得语音区间 0.600–3.585、6.386–9.370、12.171–15.156 s（`E-silencedetect.log`）。Transcribe 识别为 3 段并导出：

```vtt
WEBVTT

00:00:00.000 --> 00:00:04.950
Please schedule the meeting for tomorrow at three in the afternoon.

00:00:04.950 --> 00:00:10.750
Please schedule the meeting for tomorrow at three in the afternoon.

00:00:10.750 --> 00:00:17.357
Please schedule the meeting for tomorrow at three in the afternoon.
```
```text
[00:00:00] Please schedule the meeting for tomorrow at three in the afternoon.
[00:00:04] Please schedule the meeting for tomorrow at three in the afternoon.
[00:00:10] Please schedule the meeting for tomorrow at three in the afternoon.
```

| 对照点 | 音频实测 | VTT | Δ | TXT | Δ |
|---|---|---|---|---|---|
| 第 1 句开始 | 0.600 | 0.000 | −0.600 s | 00:00:00 | −0.600 s |
| 第 2 句开始 | 6.386 | 4.950 | −1.436 s | 00:00:04 | −2.386 s |
| 第 3 句结束 | 15.156 | 17.357 | +2.201 s | N/A | — |

内容正确性 **PASS**（文本、BOM、cue 连续无重叠）；时间轴 **FAIL（P3-304-2）**：cue 边界是 `splitSegments` 的静音谷心（`PAUSE_S=0.5` 按谷心切、`segments.push({start: from/SR, end: to/SR})`），前后静音都算进 cue，导致字幕早出 0.6–1.4 s、晚消 2.2 s；TXT 又整秒截断再多错 ≤1 s。证据 `E-export/three-en.vtt`、`three-en-timestamped.txt`、`E-transcribe-state.json`、`shots/E-three-cues.png`。

### c-② Home「节省时间」口径

渲染原文（`shots/E-home-zh.png`/`E-home-en.png`）：zh-CN 卡片「节省时间 · 7 分钟 · 估算值：按手打 60 字/分、口述 200 字/分的速度差」；en「Time saved · 11 min · Estimate: typing 40 words/min vs. speaking 150 words/min」。

- 不看代码能懂「是估算、按速度差」：**PASS**。
- 但同一份 650 词历史，仅把界面语言 zh→en，数字就从 7 分钟变 11 分钟（`Home.tsx` 第 29–31 行 `cjkUi ? [60,200] : [40,150]` 以 **uiLanguage** 选速率）→ 用户会觉得统计「不稳定」；四张卡片都没有范围说明（全部时间？本机？删历史会不会归零？）→ **P3-304-6**。
- 文案建议：zh「估算节省的输入时间（非实测）：按每分钟手打 60 字、口述 200 字计算」；en「Estimated typing time avoided (not measured): assumes 40 typed vs 150 spoken words/min」；卡片组顶部加一行「统计范围：本机全部历史（清空历史不影响累计）」——括号内需产品确认留存契约后再写。

### c-③ 下载「正在重试…」与「校验中…」

便携副本 + `dlproxy`（模式 `stall` 在 10 066 304 B 停发但保持连接）：

- **PASS 正在重试**：代理 `13:45:50.040` 停发 → phasepoll `13:45:58.003 phase=retrying`（**≈7.96 s**，符合 `STALL_NOTICE_MS=8000`），Home 卡片文字「连接中断，正在重试…」进度 16%，肉眼可辨、与卡死进度条可区分（`shots/E-dl-retrying.png`）。
- **PASS 30 s 切源 + 断点续传**：main.log `[2026-09-06 13:46:19.948] [warn] download source failed: http://127.0.0.1:8097/hf/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin Error: stalled: no data for 30s (127.0.0.1:8097)`；代理 `13:46:19.952 #4 /mir GET range=bytes=10066304-`（`E-dl-proxy.log`）。
- **PASS 校验中**：`13:46:53.449 phase=verifying` 文案「下载完成，正在校验文件完整性…」→ `13:46:54.265 ready`，**仅 816 ms**（57 MB base-q5_1 的 SHA-256）；肉眼是「一闪」，能感知有校验但读不完整句；紧接就绪 toast，可接受。UX 小瑕疵：校验期间按钮仍显示「下载中 100%」（P3-304-10）。`[2026-09-06 13:46:54.150] [info] local model base-q5_1 downloaded`。
- **PASS 坏校验拒收**：`badsha` 模式 → `13:48:31.252 downloaded=false error="sha256 mismatch (127.0.0.1:8097)"`，UI「下载失败：文件校验未通过，请重试。」，未接受损坏模型（`shots/E-dl-checksum-error.png`）。

## 6. 专项 d) 3 小时 soak

官方副本、Parakeet en、`--use-file-for-fake-audio-capture=en1.wav`、`--inspect=9229`（仅启动时一次性 `cdpmap.mjs` 映射 PID→窗口后断开），主窗最小化、Notepad 前台，Alt+Q 免按连续 **180.2 分钟**（14:37:57–17:38:12），`rss.ps1` 每 60 s 采样 `Win32_Process.PrivatePageCount/WorkingSetSize`（`soak\rss.csv` 182 行/进程，`soak\map.json`）。期间 main.log `dictation finalize` **1854** 条，无 error；仅前 2 分钟（主窗尚未最小化、Notepad 未在前台）有 18 条 `[warn] paste skipped: no input target (fg=1310998), text kept in history`，14:39:44 之后再无 warn，Notepad 持续落字，悬浮条位置稳定 `410,518`。

PID 映射：`{"10016":"main","7596":"renderer:index.html","944":"renderer:panel.html(hidden)","8756":"renderer:toast.html(hidden)","9252":"renderer:recorder.html(hidden)"}`。

`soakslope.mjs`（最小二乘，30 min → 最后一点）结果（`soak\slope.txt`）：

| 进程 | 30 min | 180 min | 斜率 MB/min | 单调？ | 全程 min/max MB |
|---|---|---|---|---|---|
| **renderer:index.html（主窗）** | 66.4 | 60.0 | **−0.0015**（端点 −0.042） | 否（129 升/21 降，锯齿） | 53.6 / 68.5 |
| renderer:panel.html | 64.3 | 65.4 | +0.0088 | 否 | 53.6 / 66.1 |
| renderer:toast.html | 42.7 | 45.3 | −0.0088 | 否 | 41.0 / 50.3 |
| renderer:recorder.html | 67.5 | 59.7 | +0.0314 | 否 | 42.1 / 73.5 |
| main | 920.1 | 1060.7 | +0.439 | 否（81 升/69 降） | 803.3 / 1068.0 |
| gpu / NetworkService / AudioService | 14.6 / 11.0 / 11.2 | 不变 | 0 | — | — |

- **判据结论：主窗 renderer 斜率 −0.0015 MB/min（<0.15）且非单调 → 无泄漏迹象，按题设定性为「观察项关闭」**，不立 P2；未做前后 heap diff（仅留末态 `soak\heap-end.heapsnapshot` 11.7 MB：string 2.9 MB、code 1.9 MB，顶部无业务对象堆积）。
- **观察（不立案，记 305 复核）：main 进程有一次台阶**：14:38–17:26 稳定在 914–934 MB（斜率 ≈ +0.05），`17:26:11 925.2` → `17:27:11 1056.9`，之后 11 分钟停在 1057–1066 MB 不再增长。同一分钟 main.log 里唯一异常是 `[2026-09-06 17:26:30.441] [info]  dictation finalize: durationMs=10592 maxPeak=22512 voicedMs=3760`（其余段 2.1–7.5 s，其中 16:08:05 的 7494 ms 段未引起阶跃；阶跃后 `17:28:42.741 durationMs=11753 voicedMs=5060` 更长的一段也**没有**再增长）。推断（未证实）：sherpa-onnx/ONNX Runtime 为更长输入扩大了 arena 且不归还 OS，属「按最长输入一次性扩容」而非「随次数单调爬升」。建议 305 用刻意的 15 s / 30 s 长段各 3 次复现，若每次长段都再阶跃则升 P2。

## 7. 专项 e) `launchGen` 多代并发注入

便携副本 `whisper-server.exe` 换成 mock（原件 SHA-256 `9E581A4A…464D89` 备份并测后还原核对一致；mock `C4D39C9A…10FA53`，`F-server-hashes.txt`）。

源码核对（`localasr.ts`）：`spawnServer` 入口 `const gen = ++launchGen`，`freePort()` 只在 `!port` 时取新端口；`waitHealthy` 每 500 ms GET `/`，超时 60 s；失败分支 `if (gen === launchGen) { ready = null; port = 0; }`；`stopLocalServer()` 令 `launchGen++`、`ready = null`、杀进程。**Esc 取消录音本身不调用 `stopLocalServer()`**，只有超时/换模型/退出会。

| 用例 | 实测 | 证据 |
|---|---|---|
| F1 健康探测延迟 30 s+，期间 Esc 并立即 RightCtrl 起新代 | **PASS（无污染）**：`13:50:26.931 local whisper-server starting (model=base-q5_1, port=50652)`；第一段 finalize 13:50:28.838、Esc 13:50:31.968（toast「听写已取消」）、第二段 finalize 13:50:33.983——两次都**复用同一个 pending `ready`**（未起第二个进程，`只有一条 starting`），直到 `[2026-09-06 13:51:27.499] [warn] whisper-server stderr (not ready after 60s): mock whisper-server pid=3560 port=50652`；UI「本地识别引擎启动失败…刚才的录音已保留，再按一次热键立即重试」，Notepad 无字、History 一条 `status=failed`；mock 24 次 GET、0 次 POST。下一次热键 `13:51:40.153 local whisper-server starting (model=base-q5_1, port=50702)` → **端口已复位换新** | `F1-main.log`、`F1-mock.log`、`F1-panel-run.log`、`shots/F1-timeout-no-text.png` |
| F2 释放后 pending 期间切模型（旧代被 stop） | **PASS**：`13:53:35.611 starting port=50702 pid=6852`，finalize 13:53:37.563，`13:53:37.579` 切 SenseVoice → stop（比 mock 定时 200 早 70 ms）；旧代无 200/无 POST、无落字；下一次热键用保留录音经 SenseVoice 落字「帮我跟老板说」 | `F2-main.log`、`F2-mock.log`、`shots/F2-postrelease-stopped.png`、`F2-sensevoice-recovered.png` |
| F2′ **录音中**切模型（RightCtrl 仍按住） | **非污染，但语义待定（P3-304-9）**：`13:52:22.997` 起 base 代→`13:52:23.024` 切模型 stop；释放 finalize `13:52:24.946` 后 **又起了一代 base-q5_1**（`13:52:24.949 starting model=base-q5_1 port=50702`），pid 7128 POST 后 `MOCK-WHISPER[7128-2]` 落字——即本次录音沿用**开始录音时快照的 settings**，当前已选 SenseVoice 被忽略且无提示。不是旧代迟到响应 | `F2-main-first.log`、`F2-switch.log`、`shots/F2-old-model-respawn.png` |

结论：`launchGen`/`port` 复位逻辑正确，旧代健康响应无法污染新代（旧代 `proc !== child` 即抛 `exited before ready`）。**注意**：打包版在按键释放前就开始起 whisper（`starting` 早于 finalize），复现「释放后 pending」窗口要以 finalize 行为锚点。

## 8. 专项 f) Home 统计范围提示、导出反馈、electron.exe

- 统计范围提示：**值得做，P3-304-6**（见 §5 c-②）。
- 导出反馈：History 导出成功写出 `C-history-export.md`（3228 B），但保存对话框消失后**无任何成功 toast/落点提示**（`C-export-panel2.log` 无 toast；`main/index.ts file:saveText` 成功分支只 `return true`，失败才 `showToast(toast.exportFailed)`）→ **P3-304-7**。Transcribe「复制全部」：源码有 2 s 的按钮文案切换 `transcribe.copied`，但体验走查时**未被注意到**（`shots/G-ko-copy-no-feedback.png`），说明该反馈过弱，归入同一条。
- `electron.exe`：本轮 `npm install` 后 `node_modules\electron\dist\electron.exe` **再次缺失**（复现 302 §9.9），`node node_modules/electron/install.js` 后恢复；phase 2 复查 `Test-Path` 为 `True`。建议 `desktop/package.json` 加 `postinstall: node node_modules/electron/install.js` 或在 README 注明（环境项，不立案）。

## 9. 专项 g) 自由发掘（30 分钟，13:56:34–14:26:53，30m18s，`G2-exploration-notes.txt`）

走查 zh-CN/zh-TW/ja/ko 四语的 Home/引导/设置/词典/人设/托盘/History/Transcribe：

- **PASS**：ko 托盘「SpeakType 열기 / 음성 인식 설정 열기 / 종료」；ja 拖放转录（`14:11:46.989 file transcribe started (17.4s…)` → `14:11:48.249 done (3 segments)`）、非音频文件拖放的 ja 错误 banner；History 搜索「Ple sed」命中、删除、撤销；「AI 润色」关/开可发现性好（Home 人设卡琥珀色提示 + 「配置 AI 润色」直达设置页该 tab，开关在首屏）。
- **UX FAIL P3-304-4**：一次性 toast 错过后，设置/词典/关于/托盘里找不到任何「编辑器无障碍」帮助入口。
- **UX FAIL P3-304-5**（悬浮条可预期性）：Edge/VS Code 底槽长会话盖住正在编辑的行（`G-ja-Edge-bottom-caret-overlay.png`、`G-ko-vscode-long-form.png`）；悬浮条**持续可见期间不随光标移动重新定位**；用户无法预判它会停哪。
- **UX FAIL P3-304-8**：ja 免按退出 toast 最后一个字符独占一行（`G-ja-exit-toast-wrapping.png`）；ko/zh-TW 正常。
- **UX FAIL P3-304-3**：ja/ko 无障碍 toast 截断（同 §3）。
- 观察（未立案）：一次进入 History 时页面保留了上一页的滚动位置（`G-history-arrived-mid-scroll.png`）；源码 `App.tsx` 已有切页 `scrollTo({top:0})`，未能稳定复现，305 复测。
- AI 润色文案建议：关闭态说明改为「关闭时仅做本地标点/数字/热词清理；人设风格需开启 AI 润色」。
- 没有发现「让我不想继续用」的 P0/P1 问题。

## 10. 立案清单

| 编号 | 级别 | 标题 |
|---|---|---|
| P2-304-1 | P2 | Parakeet int8 文件转录：`ple_s01j_300_zero.wav` → `Ple sed by Friday.`（丢词），UI 报「完成」无提示 |
| P3-304-2 | P3 | VTT/时间戳 TXT 的 cue 边界含前后静音，偏差 0.6–2.4 s |
| P3-304-3 | P3 | `toast.learnInaccessible` 正文 en/ja/ko 在 100% DPI 被截断 |
| P3-304-4 | P3 | 无障碍提示每进程一次，且无常驻帮助入口 |
| P3-304-5 | P3 | 悬浮条遮挡（WordPad 功能区/Explorer 导航/编辑行）、被 Windows 搜索面板盖住、不可拖动/记忆 |
| P3-304-6 | P3 | Home 统计无范围说明；「节省时间」随界面语言切换变值 |
| P3-304-7 | P3 | History/Transcribe 导出成功无反馈；复制全部反馈过弱 |
| P3-304-8 | P3 | ja 免按退出 toast 折行孤字 |
| P3-304-9 | P3 | 录音中切换模型：本次录音仍用旧模型且无提示（语义待定） |
| P3-304-10 | P3 | 校验中按钮仍显示「下载中 100%」；重试无倒计时/源信息 |
| P3-304-11 | P3 | `Ple schedule…` 首词残缺（同根因于 P2-304-1，单列便于统计） |
| P3-304-12 | P3 | Parakeet 结果无低置信/首词异常提示（P2-304-1 的产品侧兜底缺失） |

### P2-304-1 / P3-304-11 / P3-304-12 Parakeet int8 首词吞字
- 复现：Transcribe 页选择 `ple_s01j_300_zero.wav`（或 `ple_en_200_zero.wav`），Parakeet、en → 显示 `Ple sed by Friday.` / `Ple schedule…`，History 入库、无提示。
- 根因（源码 + 303 轮 A/B）：`transcribe.ts transcribeSlice` → `transcribeSherpa` 把切片原样 `acceptWaveform`，无预处理；`csukuangfj/…parakeet-tdt-0.6b-v3-int8` 量化模型在「Please」发音处于判定边界（303 轮：int8 15/99 vs fp32 0/99，对前导长度非单调，±1e-5 扰动即翻转）。是模型量化问题，不是切片/缓冲 bug。
- 建议：① 提供 fp32 Parakeet 作为可选模型（2.5 GB，303 轮实测同机解码不慢）；② 短期在 Transcribe/History 对「首 token 为 ≤3 字母且后接空格的非词」等启发式结果加「可能有误，点此重试/换模型」提示（P3-304-12）；③ 不建议改 `blankPenalty`（303 轮证明不修 Ple 且改数字格式）。

### P3-304-2 时间轴
- 复现：§5 c-①。根因：`splitSegments` 按静音谷心切，cue 用 `[from,to]` 整段。
- 建议：每段导出前用现成 `rmsProfile` 收缩到首/末超过静音阈值的帧（±100 ms），TXT 用四舍五入或保留一位小数；或在导出菜单标注「按句段近似时间」。

### P3-304-3 toast 截断
- 复现：uiLanguage=en/ja/ko，在默认 VS Code 里听写。根因：`windows.ts` toast 窗 520×92，`toast.tsx` 标题与正文**同一行** flex（标题 `shrink-0` + 正文 `line-clamp-3`），英文长正文超出宽度后被 clamp。
- 建议：标题/正文改上下堆叠、窗高随内容（`setContentSize` 后 `line-clamp-3`），或对含快捷键的正文禁用 clamp。

### P3-304-4 无常驻帮助
- 建议：设置→自动学词区块加「在 VS Code 等编辑器中不生效？」链接，打开与 toast 相同的说明；`a11yHintShown` 改为「每进程一次 + 设置页可重新查看」。

### P3-304-5 悬浮条位置
- 复现：§3 a-③、§9。根因：`dockPanel()` 只有两个槽位，只在显示瞬间计算一次，`caretRect()` 对 Chromium/Electron 自绘光标恒为 null；Windows 搜索为 shell 沉浸层，`alwaysOnTop` 窗口在其 z-band 之下（推断）。
- 建议：① 设置项「悬浮条位置：自动 / 顶部 / 底部 / 上次拖动位置」并允许拖动、记住坐标；② 免按模式每段结束时重算一次；③ Windows 搜索场景接受现状但在文档中说明。

### P3-304-6 统计口径
- 根因：`Home.tsx` 第 29–31 行按 `uiLanguage` 选 60/200 vs 40/150；卡片无范围文案。建议：按**识别语言**或按 History 条目语言分别累计；加范围说明（见 §5 c-②）。

### P3-304-7 导出/复制反馈
- 根因：`main/index.ts file:saveText` 成功只 `return true`；`Transcribe.tsx` 复制仅 2 s 文案切换。建议：成功后 `showToast(t("toast.exported"), path)` + 「打开所在文件夹」；复制改为带图标的 toast。

### P3-304-8 ja 折行
- 根因：toast 正文 `leading-5` 在 520 px 宽下日文句末「す。」被挤到下一行。建议：正文容器 `text-wrap: balance` 或加 `padding-right`，日文文案略缩短。

### P3-304-9 录音中切模型
- 复现：§7 F2′。根因：`dictation.ts` 在 start 时快照 `settings` 并沿用到 finalize；`ensureLocalServer(model)` 以快照 model 起新代。建议：产品定语义——要么切模型时取消当前录音并 toast「模型已切换，请重新说」，要么在设置页标注「对下一次录音生效」。

### P3-304-10 下载按钮/重试信息
- 建议：`phase==="verifying"` 时按钮文案「校验中…」；`retrying` 文案追加「(第 N 个源)」。

## 11. 未测项（如实）

| 项 | 原因 |
|---|---|
| DPI 125% / 150% 下光标避让 | VM 缩放下拉禁用；注册表改值后 `devicePixelRatio` 仍为 1；注销会断测试通道 |
| 第二显示器 | VM 单屏 |
| 关闭 APM 的 fake mic 4×5 空串矩阵 | 产品 `recorder.ts` 显式 `echoCancellation/noiseSuppression/autoGainControl: true`，四种 Chromium 开关下 `getSettings()` 全部仍为 true |
| 排队第二句「内容身份」 | fake mic 单文件，两次同句；仅证明时序与两次落字 |
| 真手机浏览器麦克风权限路径 | 用 LAN WebSocket PCM 模拟器替代 |
| 真人麦克风下 Ple/空串发生率 | 本轮全部为合成刀口样本 |
| Word（未安装，用 WordPad）、Chrome（未安装，用 Edge） | 环境限制 |

## 12. 环境还原

| 项 | 状态 |
|---|---|
| 正式副本 `resources\app.asar` | **未改过**，SHA-256 `BC5642E00EAC9C86…`，与便携副本保存的 `app.asar.orig`（改前拷贝）一致 |
| 正式副本 `resources\whisper\whisper-server.exe` | 未改过，`9E581A4A2B7BD5AE…464D89` |
| 便携副本 `C:\tmp\r304\portable` | 测试专用副本（asar 下载源指向本地 dlproxy），其 `whisper-server.exe` 已由 mock 还原为原件 `9E581A4A…`（`F-server-hashes.txt`） |
| `%APPDATA%\SpeakType\models` | 仅由 app 自身正常下载（base-q5_1 / parakeet int8 / sensevoice），未手工改动；坏校验用例被 app 拒收未落盘 |
| `speaktype.json` | 从 `C:\tmp\r304\speaktype.json.bak`（12:49 首启后基线）恢复，哈希一致；测试末态另存 `G-final-speaktype.json` |
| `history.json` / `transcribe-last.json` | 会话开始时不存在（全新 VM），已删除；末态另存 `G-final-history.json` |
| 系统 DPI | 测前 `dpi-before.reg` 无 `LogPixels`、`AppliedDPI=96`；已删除测试写入的 `LogPixels`，`AppliedDPI=0x60`，实际全程 100% |
| VS Code（便携 `C:\tmp\r304\vscode`，数据目录 `vscode-data`） | `User\settings.json` 恢复为 `{}`（测前无该文件） |
| 进程 | SpeakType（正式/便携）、mock_llm、mock whisper-server、dlproxy、手机模拟器、rss/panelpoll、Notepad/WordPad/Edge/VS Code 全部退出；8097/8098/9229/9333/43117/43118 无监听 |
| Git | 工作树仅 `docs/reviews/round304.md`（新增）与 `.agents/skills/testing-speaktype-desktop/SKILL.md`（+13 行 CRLF 追加，无 BOM/行尾变化） |

## 13. 建议下一轮（305）验收点

1. **P2-304-1**：若上 fp32 Parakeet 选项，用 303 轮 99 组 Ple 探针 + 本轮 8 个 fixture 在打包版 Transcribe 页复跑，要求 0/8 Ple；同时验证下载体积/常驻内存提示文案。
2. **P3-304-3/-8**：五语 `toast.learnInaccessible*` 与免按退出 toast 在 100%/125%/150% 各截图一次，要求正文完整无省略号、无孤字；**换有真实 DPI 缩放能力的机器**（或 RDP 会话内改缩放后重登）补本轮未测的 DPI 避让。
3. **P3-304-5**：若实现「悬浮条位置」偏好/拖动，验收：拖动后重启记住；免按模式段间重算；Notepad/WordPad/Explorer/Edge 各一次。
4. **P3-304-2**：VTT 三点对照 |Δ| ≤ 0.3 s（用本轮 `E-three-en.wav` + `E-silencedetect.log` 基线）。
5. **P3-304-6/-7**：Home 范围文案与导出成功 toast（含路径、打开文件夹），zh/en 各一次；复制全部改 toast 后复查可见。
6. **P3-304-9**：确认语义后复测 F2′：录音中切模型 → 期望取消并提示，或设置页标注「下次录音生效」。
7. 排队第二句：用两段不同句子拼接的 wav（或手机模拟器第二路）证明第二次落字内容 ≠ 第一次。
8. 关 APM 取证：若产品加「原始麦克风（关闭噪声抑制）」开关，则以该开关跑 4×5 empty 矩阵；否则继续标未测。
9. 内存：主窗 renderer 已关闭；针对 §6 main 进程「长段后 +130 MB 台阶」，用 15 s / 30 s 长段各 3 次 + `rss.ps1 -IntervalSec 10` 复现，确认是否按最长输入一次性扩容（可接受）还是每次长段都增长（P2）。
10. 环境：`npm install` 后 `electron.exe` 缺失第三次出现，建议加 `postinstall` 并在 305 验证一次干净 clone 直接 `pack:dir` 成功。
