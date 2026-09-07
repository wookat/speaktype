# SpeakType 第 308 轮体验官 + QA 验收报告（打包版实测）

- 被测对象：main `4945230`（文件树与任务书中的 `c243d55` 完全一致，仅作者署名重写；含 #399 第 307 轮修复、#400 README 重写、#401 测试经验），本机 `cd desktop && npm install && npm run typecheck && npm run build && npm run pack:dir` 产出的 `desktop/release/win-unpacked/SpeakType.exe`（v0.17.2，`packaged=true`），**未测 dev**
- 环境：Windows Server 2022 VM（1280x720，DPI 100%，`--use-fake-device-for-media-stream` + 指定 wav 假麦克风）、Node v20.19.0 / npm 10.8.2、ffmpeg 6（`C:\ProgramData\chocolatey\bin`）、Chrome for Testing、VS Code（官方 zip，`tools/vscode`）
- 测试者：Devin（user-experience-officer + qa-engineer 双角色），UI 由测试代理在同一台机器上实机操作（SendInput 合成 RightCtrl/Alt+Q/Esc/F8、原生 Notepad 前台校验、CDP 度量面板/toast/下拉几何、150ms 轮询）
- 时间：2026-09-07 15:13–17:10 UTC，两个 Phase 连续进行
- 证据目录（本机）：`C:\Users\Administrator\tts\r308\evidence\`（`*.md` 分项证据 + `*-main.log` / `*-history.json` / `*-panelpoll.txt` / `*-toast.jsonl` / `modelrow-*.json` / `E-rss-*.csv`）、截图 `C:\Users\Administrator\tts\r308\shots\`
- 录屏：`C:\Users\Administrator\screencasts\r308-g-core-a\r308-g-core-a-edited.mp4`（Phase 1：打包、核心回归、#399 复核、手机麦、端口竞态）、`C:\Users\Administrator\screencasts\r308-phase2\r308-phase2-edited.mp4`（Phase 2：冷启动、retry 文案、VS Code、soak、排队、段落）。`C:\Users\Administrator\screencasts\round308\` 只是环境准备片段，不是测试录屏
- 官方打包件 SHA-256（测前=测后，见 §12）：`app.asar` `7C9E33C8E07AA0ED0C89F2338CF47A2C59BA71B822115851ADEF1807B7101652`；`whisper-server.exe` `9E581A4A2B7BD5AEC0993F5794FEA3D65AF2D7F5921CF51C2A4E4B5A3A464D89`

## 0. 给老板的结论（三句）

第 308 轮对 main `4945230` 打包版实测 49 项 PASS、10 项 FAIL（归并为 1 P1 + 2 P2 + 2 P3 + 1 P3-doc）、13 项未测：核心链路（按住/排队/免按/Esc/F8/深色/三模型/手机麦隔离/端口竞态）与 #399 的三项修复（整行避让、免按重停靠、五语友好模型名）全部通过，int8/fp32 各 20 段免按 soak 20/20 落字、内存无慢泄漏。新增 1 个 P1：模型刚下载完成后 0.6s 内首次按住说话，3 次全部异常（1 次录到空音频、2 次松手后不收尾持续录音 34–46s，需 Esc 才停）；2 个 P2：第 2/3 源 retry 文案实际不可见（zh-TW/ja/ko 全部复现，源码已定位）、fp32 冷启动 3.5s 期间只显示「转写中…」无「加载模型」反馈。**结论：核心功能可发布，但建议修掉 P1（首次下载后首句路径）和两个 P2 后再出 v0.18。**

## 1. 总览：PASS / FAIL / 未测

| 分组 | PASS | FAIL | 未测 | 备注 |
|---|---:|---:|---:|---|
| 打包（clone → pack:dir） | 3 | 0 | 0 | `npm install` 退出码 1（EBADENGINE + lock 改写，已知 P3-306-6），产物完整 |
| 核心链路 C1–C8 | 13 | 0 | 0 | 排队第二句见 §3.2 Q |
| a) #399 复核 A1–A4 | 4 | 0 | 1 | 首个有声帧的精确时序未测（无日志钩子） |
| b) 冷启动 B | 2 | 4 | 0 | P1-308-1、P2-308-2 |
| c) retry 文案 C-retry | 2 | 4 | 0 | P2-308-1 |
| d) VS Code learnInaccessible D | 4 | 1 | 0 | P3-308-1 |
| e) 内存 soak E | 6 | 0 | 0 | |
| f) README 对照 F | 15 | 1 | 12 | 链接 100% 200 |
| g) 自由发掘 G | 定性 | - | - | §10 |
| **合计** | **49** | **10** | **13** | |

## 2. 打包（PASS）

| 项 | 结果 | 证据 |
|---|---|---|
| `git clone` → main | PASS | 测试开始时 `c243d55`，中途仓库历史重写为 `4945230`（仅署名，`git diff c243d55 4945230 --stat` 为空），打包件未变 |
| `npm install`（含 `postinstall: ensure-electron.mjs`） | PASS（退出码 1） | Node 20.19 EBADENGINE 警告；`node_modules/electron/dist/electron.exe` 存在；`desktop/package-lock.json` 被 npm 10 改写（`hasInstallScript`），提交前已还原，仍是已知 P3-306-6 |
| `npm run typecheck && npm run build && npm run pack:dir` | PASS | `release/win-unpacked/SpeakType.exe`；`app.asar.unpacked` 含 `koffi / sherpa-onnx-node / sherpa-onnx-win-x64 / uiohook-napi` |
| 启动日志 | PASS | `[2026-09-07 15:28:15.143] [info]  SpeakType 0.17.2 starting (packaged=true)` |

## 3. 核心链路回归（证据 `evidence/CORE.md`、`C8.md`）

### 3.1 逐项

| # | 用例 | 结果 | 证据 |
|---|---|---|---|
| C1 | RightCtrl 按住 ~4s，SenseVoice zh 落字 Notepad | PASS | `shots/C1-first-landed-4s.png`；`[15:29:27.907] dictation finalize: durationMs=3884 maxPeak=32767 voicedMs=2440`；history `帮我跟老板说，那个方案需要再改一下`（4s 只含 fixture 前半句，属预期） |
| C2 | 第二句换 wav（zh2），内容 ≠ 第一句 | PASS | `shots/C2-zh2-landed.png`；history 新增 `今天下午3点开会，请把上个季度的销售数据准备好`（`durationMs=6377`），与 C1 文本不同 |
| Q | **排队第二句**（上一句收尾中再按下） | PASS | 见 §3.2 |
| C3 | Alt+Q 进免按 → 4 段自动分句 → Alt+Q 退出 | PASS | history 7→11；`[15:40:10.649] [info]  dictation handsFree exit: byToggle stage=idle elapsedMs=0` |
| C4 | 录音中 Esc（普通 + 免按） | PASS | `[15:41:46.645] dictation cancel: byEsc=true stage=recording handsFree=false elapsedMs=7880`；`[15:42:00.838] dictation cancel: byEsc=true stage=recording handsFree=true elapsedMs=2134`；history sha256 前后一致（无新增）；`shots/C4-C6-dark-cancel-toast.png`、`shots/C4-handsfree-Esc-toast.png` |
| C5 | F8 选中改写（本地 mock LLM `127.0.0.1:18099/v1`） | PASS | `shots/C5-before-selection.png` → `shots/C5-after-mock-rewrite.png`（`MOCK-REWRITE-OK` 原位替换）；`evidence/mock-requests.jsonl` |
| C6 | 深色模式（主窗/面板/toast） | PASS | `shots/C6-dark-main-fixed-top.png`、`C6-dark-panel-A3-fixed-top.png`、`C4-C6-dark-cancel-toast.png`；注意悬浮条/toast 在浅色主题下本身就是深色面，不能单独作为主题切换证据；跟随系统实时切换未测 |
| C7a | Parakeet int8 en 一句 | PASS | `shots/C7-parakeet-en-landed.png`；`Please schedule the meeting for tomorrow morning and send me the agenda before noon.` |
| C7b | Whisper base ja 一句 | PASS | `shots/C7-whisper-ja-landed.png`；`明日の会議の資料を準備してください` |
| C8-b① | 手机麦（LAN WebSocket 模拟器）按住期间，本机 RightCtrl 松手被忽略 | PASS | `[15:48:42.805] dictation stop: hold release ignored, phone session in progress` → `[15:48:46.402] dictation finalize: durationMs=9269 …`；`shots/C8-phone-hold-landed.png` |
| C8-b② | 手机会话期间本机 F8 松手被忽略 | PASS | `[15:49:05.111] dictation stop: rewrite release ignored, phone session in progress` → `[15:49:08.760] dictation finalize`；`shots/C8-phone-rewrite-landed.png` |
| C8-b③ | 手机会话 Esc / 断连取消 | PASS | `shots/C8-phone-Esc-toast.png`、`shots/C8-phone-close-toast.png` |
| C8-a③ | whisper-server 缓存端口被占（竞态） | PASS | `[15:47:06.683] local whisper-server starting (model=base-q5_1, port=60936)` → `[15:47:06.810] [warn] local whisper-server exited (1)` `couldn't bind to server socket: hostname=127.0.0.1 port=60936` → `[15:47:12.559] dictation finalize` + `[15:47:12.565] local whisper-server starting (… port=60945)`；`shots/C8-port-race-recovered.png`。旧固定端口 18717 场景未测 |

手机麦是同机 LAN 上的 WebSocket 模拟器（`tts/r308/phone.mjs`），不是真机 APK/网页 UI。

### 3.2 Q 排队第二句

方法：官方副本、fp32 已预热、`hf_en30.wav`；同一个常驻 SendInput 进程执行「按住 4s → 松手 → 等 100ms → 再按住 3s → 松手」，第二次按下落在第一句 finalize 之后、history 提交之前，真正进入 `pendingStart` 队列（Phase 1 的 C2 是顺序两句，不算排队证据）。

结果 **PASS**（`evidence/Q-queue.md`，`shots/Q-fp32-final.png`）：

```text
2026-09-07T17:00:20.5805501+00:00 up:rctrl return
2026-09-07T17:00:20.6809011+00:00 down:rctrl call        ← 松手后 100.4ms 再按下
[2026-09-07 17:00:20.577] [info]  dictation finalize: durationMs=3876 maxPeak=32767 voicedMs=2400
[2026-09-07 17:00:20.800] [info]  dictation start: previous session still finalizing, queued
[2026-09-07 17:00:21.325] [info]  dictation start: resumed queued hold (frames=2, released=false)
[2026-09-07 17:00:23.687] [info]  dictation finalize: durationMs=2886 maxPeak=32767 voicedMs=1400
```

history 新增两条：`Good morning everyone. Today we are going to review`（`durationMs=3876`）、`Good morning everyone. Today`（`durationMs=2886`）；Notepad UIA 文本 = 两条 history 以空格拼接（`exactJoinedHistory: true`）。排队期间面板显示 `Good morning everyone. 转写中…` → 恢复后重新流式（panelpoll `17:00:20.687` → `17:00:21.327` → `17:00:22.113 Good morning.`）。fp32 热态松手→history：+0.74s / +0.69s。未测：连续 3 句以上重叠、按住期间已松手（`released=true`）的分支。

## 4. a) #399 独立复核（证据 `evidence/A1-A3.md`、`A4.md`）

| # | 用例 | 结果 | 证据 |
|---|---|---|---|
| A1 | auto 档 × Notepad 底行（Ln51）Col1 / Col80 / Col150 × RightCtrl | PASS | 三处面板均 `y=12`（切顶）；顶行对照 `y=518`（留底）。`shots/A1-bottom-Col150-panel-top.png`（行尾 Col150 也切顶，证明整行判定生效）、`A1-bottom-Col1-panel-top.png`、`A1-bottom-Col80-panel-top.png`、`A1-top-row-panel-bottom.png`；panelpoll `15:35:37.775 visible|410,12` ×3、`15:36:13.000 visible|410,518` |
| A2 | 免按段间光标顶行→底行行首 / 顶行→底行行尾，下一句面板须切顶 | PASS（位置）/ 未测（首个有声帧精确时序） | 面板持续可见期间 `518→12`（移到底行行首后 815ms）、`12→518`（移回顶行）、`518→12`（移到底行行尾后 1229ms），每次都先于该句首个 partial 出现（`15:39:45.593`、`15:40:03.472`）。main.log 无 firstVoice 日志钩子，无法证明「恰在首个有声帧」，只能证明「下一句开口前已重停靠」。`A2fast-actions.txt` + `A2fast-panelpoll.txt`，`shots/A2fast-move-1..3.png` |
| A3 | 固定 top / bottom 不受影响 | PASS | 底行光标下 top=`y=12`、bottom=`y=518`；`shots/C6-dark-panel-A3-fixed-top.png`、`A3-fixed-bottom.png` |
| A4 | 五语 × 820/1280px 模型下拉友好名 | PASS | 10 组全部 select ≤ `230×35`（en 230、ko 225、zh/ja 208 宽），行右边界 767/1107 未被撑破，raw id 正则（`sensevoice-small|parakeet-tdt|q5_1`）在可见 option 文本中 0 命中；`modelrow-*.json`，`shots/A4-{en,zh-CN,zh-TW,ja,ko}-820.png` |

A4 译名与 fp32 提示原文（zh-TW / ja / ko）：

- zh-TW：`Parakeet 原精度 (2.5GB)`；提示「Parakeet 原精度版：語種與辨識速度和標準版 Parakeet 相同，但不再出現標準版（int8）偶發的句首吞字（如 "Please" 辨成 "Ple"）。代價是 2.5GB 下載、載入後約佔 2.7GB 記憶體——記憶體充足且遇過句首缺字時再選它。」
- ja：`Parakeet フル精度 (2.5GB)`；「…代わりに 2.5GB のダウンロードと読み込み時約 2.7GB のメモリが必要です。メモリに余裕があり文頭欠落に遭遇した場合のみ選んでください。」
- ko：`Parakeet 원본 정밀도 (2.5GB)`；「…대신 2.5GB 다운로드와 로드 시 약 2.7GB 메모리가 필요합니다. 메모리가 충분하고 첫 단어 누락을 겪은 경우에만 선택하세요.」

体验评价：三语提示都把代价说成了具体数字（下载 2.5GB、内存 2.7GB）并给出「什么情况下才选它」的条件句，普通用户能看懂；但提示只在**选中 fp32 之后**才出现，下拉项里只有「(2.5GB)」一个线索，选前看不到内存代价（P3 体验点，不单独立案）。已知 raw id 位置（Voice「识别语言」Parakeet 提示里的 `sensevoice-small`、Transcribe 缺模型横幅 `shots/A4-known-transcribe-raw-id.png`）本轮确认仍在，按任务书不重复立案。

## 5. b) fp32 / int8 极短按住冷启动（证据 `evidence/B-coldstart.md`、`B-stuck.md`）

方法：Settings → Voice 用 UI「删除」再「下载」真实模型，`downloaded` 日志出现后立即前台 Notepad，SendInput 按住 RightCtrl 1.2s（B-stuck 对照 1.15s）；150ms 轮询面板/toast；`sherpa worker started` 是 Worker 线程创建时刻而非模型就绪时刻（源码 `localasr.ts` 无就绪日志）。

| 用例 | 松手→首个 partial | 松手→面板定稿 | 松手→history 提交 | 面板/toast 反馈 | 结果 |
|---|---:|---:|---:|---|---|
| fp32 冷（删除→重下→1.21s 按住） | +2884ms | +3657ms（`Please get a little bit more than.`） | +3476ms | 全程只有「转写中…」，同时叠着下载完成的「离线模型已就绪」toast；无「加载模型」字样 | PASS（收尾/落字）/ **FAIL**（无加载反馈，P2-308-2） |
| int8 冷 r1（删除→重下→1.20s 按住） | — | — | 无新条目 | `没听清 这次没识别到内容` | **FAIL**（`finalize: durationMs=1081 maxPeak=0 voicedMs=0`，录到的是空音频） |
| int8 冷 r2（删除→重下→1.51s 按住） | +1340ms（`Please schedule.`） | 未定稿 | 无 | 面板持续流式 partial 46s，直到 Esc：`[16:09:37.558] dictation cancel: byEsc=true stage=recording handsFree=false elapsedMs=46207` | **FAIL**（松手不收尾） |
| int8 冷 r3（删除→重下→1.45s 按住） | +1589ms | 34s 后 | 34s 后 | 松手不收尾；单独再补一次 RightCtrl-up 后 `[16:10:56.541] dictation finalize: durationMs=34115 maxPeak=32767 voicedMs=10760` | **FAIL**（松手不收尾） |
| int8 热对照（同进程 1.21s 按住） | +121ms | +749ms（`Please.`） | +608ms | 「转写中…」<1s | PASS |

fp32 冷启动关键日志：

```text
[2026-09-07 16:05:12.948] [info]  local model parakeet-tdt-0.6b-v3-fp32 downloaded
[2026-09-07 16:05:13.705] [info]  sherpa worker started (parakeet-tdt-0.6b-v3-fp32)
[2026-09-07 16:05:14.780] [info]  dictation finalize: durationMs=1081 maxPeak=32767 voicedMs=360
```
```text
2026-09-07T16:05:14.7945903+00:00 up:rctrl
2026-09-07T16:05:14.879Z PANEL "visible|410,518|转写中…"
2026-09-07T16:05:17.679Z PANEL "visible|410,518|Please get a little bit more than 转写中…"
2026-09-07T16:05:18.451Z PANEL "visible|410,518|Please get a little bit more than."
```

int8 r2/r3 关键日志（下载完成 → 0.6s 内按下 → 松手无效）：

```text
[2026-09-07 16:08:50.644] [info]  local model parakeet-tdt-0.6b-v3 downloaded
[2026-09-07 16:08:51.356] [info]  sherpa worker started (parakeet-tdt-0.6b-v3)
2026-09-07T16:08:51.2165735+00:00 down:rctrl
2026-09-07T16:08:52.7232608+00:00 up:rctrl
2026-09-07T16:08:54.063Z PANEL "visible|410,518|Please schedule."
2026-09-07T16:09:34.254Z PANEL "visible|410,518|Please schedule the meeting for tomorrow morning and send me the agenda before n"
[2026-09-07 16:09:37.558] [info]  dictation cancel: byEsc=true stage=recording handsFree=false elapsedMs=46207
```
```text
[2026-09-07 16:10:21.572] [info]  local model parakeet-tdt-0.6b-v3 downloaded
[2026-09-07 16:10:22.664] [info]  sherpa worker started (parakeet-tdt-0.6b-v3)
2026-09-07T16:10:22.1612585+00:00 down:rctrl
2026-09-07T16:10:23.6128155+00:00 up:rctrl
[2026-09-07 16:10:56.541] [info]  dictation finalize: durationMs=34115 maxPeak=32767 voicedMs=10760
```

排除性对照（`B-stuck.md`，6/6 PASS，松手后 ≤10ms 内 finalize）：同进程预热后 1.15s 按住 ×2；同进程 Whisper base→int8 切换（worker 冷建）后等 3s 再按 ×3；进程启动后 1.67s 内按住 ×1。说明「worker 冷建」「进程刚启动」本身都不触发，触发条件收窄为**「模型下载刚完成（≤0.6s）之后的第一次按住」**。截图：`shots/B-fp32-cold-r2-*.png`、`B-int8-cold-r2-*.png`、`B-int8-cold-r3-*.png`、`B-int8-warm-*.png`、`B-stuck-*.png`。

用户视角结论：fp32 冷首句从松手到落字 ≈3.5s，热态 ≈0.6s；3.5s 里用户只看到「转写中…」，会误以为识别慢或卡住——冷启动**需要**产品层提示（或干脆在下载完成后立即后台预热，见 P2-308-2 建议）。

## 6. c) 第 2/3 源 retry 文案可见性（证据 `evidence/C-retry.md`、`C-*-phasepoll.txt`）

方法：只用第 293/305 轮同法的 portable 副本 B（asar 内三源指向本地 `dlproxy.cjs`，`app.asar` sha256 `B2C9…1379`，官方副本未改），`dlctl.json = {"mode":"stall-hf","stallAt":3000000,"mirrorDelayMs":4000}`：HF 源发 3MB 后停滞，mirror 源建连延迟 4s；`phasepoll.mjs` 150ms 轮询 preload 状态 + `role=status` 文案；General 切 zh-TW / ja / ko 各跑一次，ko 再跑一次 `fail-hf` + `ghDelay` 触发第 3 源。

| 语言 | 8s 停滞提示 | 30s 换源后「第 2/3 源重试」可见 | 最终下载 | 结果 |
|---|---|---|---|---|
| zh-TW | `連線中斷，正在透過第 1/3 個來源重試（127.0.0.1:8981）…`（`shots/C-zhTW-stall-notice.png`） | **不可见**：`16:21:03.980 phase=downloading source.index=2 status=[]`，4s 建连期间状态栏为空，只剩「下載中 1%」（`shots/C-zhTW-r2-phasepoll-source2.png`、`C-zhTW-source2-no-retry-text.png`） | PASS（`verifying` → `downloaded`） | **FAIL** |
| ja | `接続が中断されました。ソース 1/3（127.0.0.1:8981）で再試行中…` | 不可见（`16:22:26.720 phase=downloading index=2 status=[]`） | PASS | **FAIL** |
| ko | 停滞提示可见（`shots/C-ko-stall-notice.png`） | 不可见（`shots/C-ko-phasepoll-source2.png`） | PASS | **FAIL** |
| ko 第 3 源 | — | 第 3 源同样不可见（`shots/C-ko-source3-phasepoll-source3.png`） | PASS | **FAIL** |

150ms 轮询在三语共 4 次换源中都没抓到任何 `2/3` 或 `3/3` 字样；`retrying` 相位只在源码层存在了一个事件循环。另注：停滞时的提示写的是「第 1/3 個來源重試」——用户还没换源就看到「1/3 重试」，语义上是「同源重连」，容易误读成已经换到别的源（P3 文案点，随 P2-308-1 一起修）。

## 7. d) VS Code `learnInaccessible` 长 toast 与屏幕阅读器学词（证据 `evidence/D.md`、`D-*-toast.jsonl`、`D-*-uia.jsonl`）

| # | 用例 | 结果 | 证据 |
|---|---|---|---|
| D1 | autoLearn 开，目标 VS Code 新建无标题编辑器，未开屏幕阅读器模式，按住 4s 落字后弹 toast | PASS | zh-CN toast `16:26:52.749 visible` → `16:27:00.744 hidden`（≈8.0s）；文案「此编辑器暂不支持自动学习 / VS Code 等编辑器需按 Shift+Alt+F1 开启屏幕阅读器优化模式，SpeakType 才能看到你的修改」；`shots/D-zhCN-toast.png` |
| D2 | zh / en / ko 三语排版 | PASS | 三语 toast 均 `520×120`，标题 1 行（24px）+ 正文 2 行（40px/20px 行高，`scrollH==clientH` 无裁切，`clamp:3` 未触发）；en「Auto-learn unavailable in this editor / In VS Code and similar editors, press Shift+Alt+F1 to enable screen reader mode so SpeakType can see your edits」；ko「이 편집기에서는 자동 학습이 불가합니다 / VS Code 등에서는 Shift+Alt+F1로 스크린 리더 모드를 켜야 SpeakType이 수정을 감지할 수 있습니다」；`shots/D-en-toast.png`、`D-ko-toast.png` |
| D3 | toast「可行动」/「不再提示」 | **FAIL** | 运行时 toast `buttons:[]`，没有任何按钮；源码 `dictation.ts` 调 `showToast(t("toast.learnInaccessible"), t("toast.learnInaccessibleBody"), undefined, 8000)` 第三参 action 为 `undefined`。「不再提示」不存在；抑制只是 `watchedit.ts` 模块变量 `a11yHintShown`，同进程第二次落字不再弹（`D-once-control-toast.jsonl` 全程 hidden），但每次重启 app 都会再弹一次（切 en/ko 时重启即复现）——P3-308-1 |
| D4 | 开屏幕阅读器（Shift+Alt+F1）后改词真能学进词典 | PASS | Shift+Alt+F1 开启后，新建无标题编辑器落字 `帮我跟老板说，那个方案需要再改一下`，选中「老板」改为「经理」并静置：`[17:02:45.936] [info]  auto-learn: "老板" -> "经理"`；toast「已学会新词 / 撤销 / 「经理」已加入词典（与「老板」不同音，不会自动替换）」（`D-learn2-on-toast.jsonl`，`shots/D-learn2-on-learned.png`）；`speaktype.json.settings.hotwords` `[] → ["经理"]`，词典页可见（`shots/D-learn2-dictionary-entry.png`）。`dictionary.json` 从未被创建——本版本学习结果落在 `hotwords`，README「学进词典」在 UI 语义上成立。负向对照：UI 删除「经理」后关闭屏幕阅读器、同一编辑同一改法：`[17:04:08.840] auto-learn: editor not accessible (Monaco a11y hint), watch stopped`，toast 8031ms，hotwords 保持 `[]`（`shots/D-learn2-off-visible-1.png`，`D-learn2.md`） |

D4 诊断补充：UIA 外部采样（`D-baseline-uia.jsonl` / `D-edited-uia.jsonl`）证明开屏幕阅读器后 VS Code 编辑区是同一个 `native-edit-context`（RuntimeId `42.3211992.4.4.1.18`，`ControlType.Edit`），Value/Text 长度 17 且精确包含落字句，编辑后 Value 变化并稳定 3 次采样——即 `watchedit.ts` 的 baseline/同控件门槛在 VS Code 屏幕阅读器模式下满足。首次尝试的 `方案→方桉` 不是合法学习样本（`learnableWord()` 要求 right 为 2–6 个整词汉字，`Intl.Segmenter` 不认「方桉」为词，退化成单字 diff 被拒），不能作为学习失败证据，因此追加了整词替换用例 D4。

## 8. e) 内存 soak（证据 `evidence/E-soak.md`、`E-rss-int8.csv`、`E-rss-fp32.csv`、`E-summary.json`）

方法：Notepad 前台、预填 60 行让光标在底行、auto 档；`hf_en30.wav`（英文 ≈30s 循环，尾部静音 ≈3.2s）；Alt+Q 进免按，轮询 history 计数到 +20 后 Alt+Q 退出；`rss.ps1 -IntervalSec 10` 采 SpeakType 全部 PID 的 Private/WorkingSet（`E-rss-*.csv`，496/577 行）。注意 Sherpa 是主进程内的 Node Worker 线程，没有独立进程，下表 Private 是**主进程**值，与 306 轮「≈1.32GB / ≈2.57GB」只能近似对照。

| 模型 | 20 段落字 | Notepad 文本 = 20 条 history 顺序拼接 | 用时 | Private 预热前 | 第 10 段 | 第 20 段 | 首段落地→最后一采样变化 | 首段后区间极差 | 结果 |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| Parakeet int8 | 20/20 | 一致 | 596.7s | 781.6 MiB | 1316.9 MiB | 1317.5 MiB（1.287 GiB） | +1.9 MiB | 15 MiB | PASS |
| Parakeet fp32 | 20/20 | 一致 | 596.4s | 93.5 MiB（进程刚起） | 2572.4 MiB | 2569.2 MiB（2.509 GiB） | +10.1 MiB | 18 MiB | PASS |

- 两条曲线在首段落地后都不是单调上升（`strict monotonic=false`），10 分钟内无慢泄漏迹象；更长会话未测。
- 20 段 `dictation finalize` 全部 `voicedMs≈18.5s`、`maxPeak 28396–32767`，0 丢句（`E-int8-main.log`、`E-fp32-main.log`，`E-int8-actions.txt`）。
- 面板：光标一直在底行，面板首段停靠 `y=12` 后 20 段 0 次再切换（`E-*-panelpoll.txt`）。
- 段落空行：常规 fixture 静音 3.2s < 默认 `paragraphBreakMs=4000`，20 段之间 0 个换行，**符合默认**但不算覆盖「另起一段」；因此追加 **E-para**：`hf_para.wav`（zh1 + 5.5s 静音 + zh2 + 5.5s 静音）、空 Notepad 光标顶行、免按 3 段 → Notepad 文本 = 3 条 history 以 `\r\n\r\n` 拼接，状态栏 Ln5（`shots/E-para-final.png`，`E-para.md`）；`[17:06:23.174] dictation handsFree exit: byToggle stage=idle elapsedMs=0`。PASS。
- 截图：`shots/E-int8-final.png`、`shots/E-fp32-final.png`。

## 9. f) README 对照走查（#400；证据 `evidence/F-linkcheck.txt`）

链接：README.md / README.zh-CN.md 全部 41 个外链/锚点/相对路径逐个 HEAD/存在性核验，**0 失效**；6 个 release 资产均 `302 -> 200`，Content-Length：Setup 103,283,961（≈98.5 MiB，README 写 ~98MB ✓）、portable 91,670,753（≈87.4 MiB ✓）、apk 2,494,687、mac arm64 dmg 118,718,802（≈113 MiB ✓）、x64 dmg 125,190,610（≈119 MiB ✓）。

功能声明对照（以打包版本轮实测为准；未在本轮跑到的如实记未测）：

| README 声明 | 实测 | 结果 |
|---|---|---|
| 按住 `RightCtrl`，实时字幕，松手落字 | C1/C2/C7 | PASS |
| 「上一句还在收尾时接着说下一句会排队，不会被吞」 | §3.2 Q | PASS（`queued` + `resumed queued` 日志、两条 history、两句都落字） |
| `Alt+Q` 进/出免按、按静音自动分句 | C3、E（20 段） | PASS |
| 「停顿更久自动另起一段」 | §8 E-para | PASS（5.5s 停顿 → `CRLF CRLF`，Notepad Ln5） |
| 双击长按键进免按；语音命令「换行/另起一段/删除上一句」 | 本轮未跑 | 未测 |
| `Esc` 在录音中作废 | C4 | PASS |
| `Esc` 在识别/改写阶段作废 | 本轮未跑（306 轮已测） | 未测 |
| `Alt+1..9` 人设、按前台应用自动切 | 未跑 | 未测 |
| 热词同音纠错；「手动改过的词自动学进词典（Windows）」 | D4 | PASS（屏幕阅读器模式下 `老板→经理` 学进 `settings.hotwords`；注意学习结果存在 `speaktype.json` 的 `hotwords`，没有独立 `dictionary.json`） |
| `F8` 选中改写原位替换 | C5（mock） | PASS；「切窗后留在剪贴板」未测 |
| Silero VAD、标点模型附加包、中文数字 | 未跑 | 未测（SenseVoice 自带标点可见：raw `…再改一下。`） |
| 失败录音保留/历史页重试 | 未跑 | 未测 |
| 文件转录导出 TXT / 带时间戳 TXT / SRT / VTT | 未跑（306 轮测过 VTT） | 未测 |
| 悬浮条压光标时自动挪顶、可固定顶/底 | A1–A3 | PASS |
| 深色模式可固定；实时跟随系统 | C6 固定深色 PASS；跟随系统未测 | PASS / 未测 |
| 三档重置 | 未跑 | 未测 |
| 模型表：SenseVoice 234MB / Parakeet 660MB / fp32 2.5GB / Whisper 32·60·190MB | 实测目录字节：SenseVoice 239,549,735（239.5 MB / 228.5 MiB）、Parakeet int8 670,478,772（670.5 MB / 639.4 MiB）、fp32 2,549,800,429（2.55 GB）、base 59,707,625（59.7 MB）、tiny 32,152,673（32.2 MB） | Whisper 与 fp32 吻合；SenseVoice/Parakeet 用 MB 或 MiB 都对不上（-2%/-1.5%），P3-doc-308-1 |
| 「SenseVoice 实测每句约 0.27 秒」 | 本轮端到端（松手→history）SenseVoice 0.63s、int8 热 0.61s；README 未说明 0.27s 的口径 | 未测（口径不明，建议标注「纯识别耗时」） |
| Parakeet fp32「与 int8 同速」 | fp32 热态松手→history +0.74s / +0.69s（§3.2 Q），int8 热 +0.61s（§5），同量级 | PASS（端到端口径） |
| 下载：断点续传 / SHA-256 校验 / 三源兜底 / 停滞自动换源 / 人话报错+重试 | 校验相位可见（`G-whisper-base-verifying.png`）、三源兜底与停滞换源在副本 B 复现（§6）；续传与报错文案本轮未跑 | PASS（校验/换源）/ 未测（续传、报错） |
| 「main 领先 v0.17.2：原精度 Parakeet、VTT/带时间戳 TXT 导出、停滞换源、悬浮条避让」 | fp32 ✓、停滞换源 ✓、悬浮条 ✓ 本轮实测存在；VTT 导出未跑 | PASS（3/4 实测）；另 main 还领先友好模型名、cancel/exit 日志、learnInaccessible toast，README 未列（可补，非错误） |
| Windows 步骤「Settings → Speech → Built-in offline → download」 | 首启实际入口是 Home 页的模型卡 + 下载按钮（G），Settings 路径也存在 | PASS（两条路都通） |
| 「未覆盖：100%/125%/150% 之外的 DPI」 | 306/307/308 三轮都无法在本 VM 测 125%/150%；此前是否测过我们无法核实 | 未测（建议 README 直接写明 125/150 由谁在什么机器测过） |
| 五语 UI 即时切换 | A4 五语 + C-retry/D 切语言即时生效 | PASS |

## 10. g) 自由发掘（30 分钟新用户视角；证据 `evidence/G-part1.md`、`G-part2.md`、`E-soak.md`）

**从零到第一次落字的路径与耗时**（全新 profile，`no legacy userData to migrate`）：

1. 启动 → Home（默认 English UI、English 识别语言、Parakeet int8）：+2.6s。Home 即引导页，无阻塞向导（`shots/G-first-home-default-en-parakeet.png`）。
2. Home 选 SenseVoice → Download：模型 5.2s + tokens 0.9s，启动后 +15.5s 就绪。
3. **卡点 1**：选了 SenseVoice（中文模型）后，Settings → Speech 的识别语言仍是 English（`shots/G-sensevoice-ready-language-still-English.png`），中文用户不手动改会用英文模式识别中文——P3-308-2。
4. Notepad 按住 4s → 首句落字：启动后 +72.8s（含测试者自检与导航，不是最小值；`帮我跟老板说，那个方案需要再改一下`）。
5. 依次下载 Parakeet int8（23.5s）、Whisper base（1.3s）、fp32（122.8s）全部成功，相位「下载中 %」→「校验中」→「已就绪」清晰。

**模型页四档是否够清楚**：实际下拉是 6 项（SenseVoice / Parakeet / Parakeet 原精度 / Whisper tiny / base / small），README 的「四档」是把 Whisper 三档并成一行。友好名 + 体积已经比 raw id 好很多，fp32 提示尤其好（有具体代价和条件句）；缺的是「我说中文该选哪个」这一句——6 项并列、没有推荐标记，SenseVoice 与 Parakeet 的语种差别只在选中后的提示里才出现。建议在下拉项或卡片上加语种角标（如「中/日/韩/英」「英+欧 25 语」「多语（慢）」）并默认高亮推荐项。

**免按长会话悬浮条会不会打扰**：本轮三段免按长会话（int8 20 段、fp32 20 段、E-para 3 段）里面板都只在进免按时停靠一次，之后 0 次切换——重停靠只发生在每句开口时且只在光标换了半区才会真的动（A2 里 3 次移动 3 次切换），不存在句内抖动。所以对「光标一直在同一区域」的正常写作不打扰；真会来回跳的场景是光标每句都跨越屏幕中线（例如在长文中间编辑），本轮没有构造这种用例，属未测。另一个观察：免按从顶行写到第 5 行（E-para）面板一直留底，说明判定是光标行而不是「文档已写多少行」，符合预期。

其他：native `<select>` 键盘导航时容易选错项，但下载需要再点按钮，不会误下载（测试者误点属操作失误，不立案）。fp32 冷首句 3.5s 的「转写中…」是新用户第二个困惑点（§5）。整体没有遇到死路或必须重启的场景。

## 11. 立案清单

### P1-308-1 模型下载刚完成后首次按住说话：松手不收尾 / 录到空音频（3/3 复现）

- 复现：Settings → Voice 选 Parakeet int8 → 删除 → 下载；「离线模型已就绪」toast 一出（≤0.6s 内）前台 Notepad，按住 RightCtrl 1.2–1.5s 松手。
- 现象：r1 `finalize: durationMs=1081 maxPeak=0 voicedMs=0`（录音期间没有任何音频帧）；r2/r3 松手后面板继续流式识别 34–46s，直到 Esc（`cancel: byEsc=true stage=recording elapsedMs=46207`）或再补一次 RightCtrl 松手（`finalize: durationMs=34115`）。fp32 同流程 1 次通过。
- 排除项（源码 + 6 组对照全过）：`dictation.stop()` 的 phone/rewrite/pendingStart 门控都不满足；`stop()` 在 session 未建立时会记 `pendingEnd="stop"` 并在 `createSession` 完成后 `flushPendingEnd()`，r2/r3 里 session 明明已建立（有 partial）却没收尾，说明 `onHoldEnd` 很可能**根本没被调用**——`hotkey.ts releaseHold()` 只有 `holdActive` 为真才回调，而 `holdActive` 由 `holdDelayMs` 定时器置位；如果主线程在下载完成后的那 1–2s 被同步工作占住（下载收尾、`localModelStatus` 统计、Worker 创建），uiohook 的 key-up 与定时器回调的到达顺序就可能颠倒（key-up 先于定时器被处理 → 走「短敲取消」分支，定时器随后才把 holdActive 置真并 `onHoldStart`，从此没有对应的 up）。r1 的空音频（recorder 帧 1s 内没到）同样指向该时间窗内主线程/渲染进程繁忙。**根因为推断，未在运行时证实**。
- 建议：① `hotkey.ts` 在 `pressHold/releaseHold` 加 info 日志（含 `holdActive`/timer 状态），下一轮即可判定是「事件未到」还是「到了被丢」；② 按住会话加看门狗：录音中每 500ms 用 koffi `GetAsyncKeyState(holdVk)` 校验热键仍处于按下，否则等同松手；③ 下载完成后立即 `prewarmSherpa()`（现在只在会话开始或启动 3s 后预热），把 Worker 创建从首句路径挪走，也顺带缩短 fp32 冷首句。

### P2-308-1 换源 retry 文案「正在通过第 2/3 个源重试」实际不可见（zh-TW / ja / ko + 第 3 源全部复现）

- 复现：§6 方法（HF 停滞 30s 后自动换到 mirror，mirror 建连延迟 4s）。
- 现象：换源瞬间 phase 变为 `downloading`、`status=[]`，4s 建连期间只显示「下载中 1%」，150ms 轮询未见 `2/3` 字样；第 3 源同样。
- 根因（源码）：`download.ts:368` `if (index < sources.length - 1) onPhase?.("retrying", sourceAt(index + 1))` 之后 for 循环立刻进入下一源的 `downloadFromUrl()`，其 `download.ts:256` 在 `openRequest()`（真正建连）**之前**同步调用 `onPhase?.("downloading")`，把 `retrying` 覆盖；渲染层 `downloadPhaseText()` 对 `downloading` 返回 `null`，状态栏清空。367 行注释写的「换源期间（建连、等响应头）告知 UI 在重试」与代码实际行为不符。
- 建议：把 `downloadFromUrl` 里首个 `onPhase("downloading")` 移到 `openRequest()` 返回响应头之后（或仅对 `index>0` 的源延后），让 `retrying(2/3)` 覆盖整个建连期；顺带把停滞提示的「第 1/3 個來源重試」改成「连接停滞，正在重连（源 1/3）」以区分「同源重连」与「已换源」。
- 补充说明：本条在 asar 换源的副本 B 上复现，官方副本逻辑相同（同一 `app.asar` 代码，仅 URL 常量不同）。

### P2-308-2 fp32 冷启动 ≈3.5s 只显示「转写中…」，无「模型加载中」反馈

- 复现：删除并重下 fp32，按住 1.2s 松手。
- 现象：松手后 2.9s 才有首个 partial，3.66s 定稿；期间面板文案与热态完全相同（「转写中…」），同时还叠着「离线模型已就绪」toast，用户会把 3.5s 理解为「识别很慢」。
- 根因（源码）：`localasr.ts` Worker 只有 `sherpa worker started` 日志，没有 ready 消息/相位；`dictation.ts` 的 stage 只有 connecting/recording/transcribing。
- 建议：Worker 加载完成后 postMessage `ready`，主进程在 `finalize` 等待期间若 worker 尚未 ready 就上报 `loading` 相位，面板显示「正在加载模型（首次约 3–5 秒）…」；并在下载完成/切模型时立即 `prewarmSherpa()`（见 P1-308-1 ③）。

### P3-308-1 `learnInaccessible` toast 不可行动、无「不再提示」、抑制只在进程内

- 现象：toast `buttons:[]`；同进程第二次不再弹，但每次重启 app 首次落到 VS Code 又弹 8s。
- 根因：`dictation.ts` `showToast(..., undefined, 8000)` 未传 action；`watchedit.ts` `a11yHintShown` 是模块级布尔，不落设置。
- 建议：加「不再提示」action 写入 settings（如 `learnInaccessibleDismissed`），或加「怎么开？」action 打开文档；文案本身三语排版 PASS 不用改。

### P3-308-2 首启选 SenseVoice 后识别语言仍是 English

- 现象：全新 profile Home 选 SenseVoice 并下载，Settings → Speech 识别语言仍 `English`，中文用户不改会以英文模式识别中文。
- 根因：`Home.tsx:86` / `VoiceTab.tsx:131` 只 `update({ localModel })`，不联动 `language`。
- 建议：切到 SenseVoice 且当前 language 为 en 时提示/默认改为「自动」或按 UI 语言推断；或在 Home 模型卡旁并列「我说的语言」选择。

### P3-doc-308-1 README 模型体积与实际字节不一致

- SenseVoice 标 234MB，实测 239,549,735 B（239.5 MB / 228.5 MiB）；Parakeet 标 660MB，实测 670,478,772 B（670.5 MB / 639.4 MiB）；Whisper/fp32 吻合。`shared/localModels.ts` 的 `size` 字段同源，UI 下拉也显示 234MB/660MB。建议统一口径为 MB（十进制）并按实际字节改为 240MB / 670MB，或写「约」。

### 未立案的体验观察

- 停滞提示「第 1/3 個來源重試」语义易误读（随 P2-308-1 修）。
- fp32 内存代价只在选中后才可见（§4）。
- README「SenseVoice 每句约 0.27 秒」缺口径；「125%/150% DPI 已覆盖」需注明来源（§9）。
- 已知 raw id 位置（识别语言提示、Transcribe 横幅）仍在。

## 12. 环境还原（PASS）

| 项 | 结果 | 证据 |
|---|---|---|
| 官方 `app.asar` / `whisper-server.exe` sha256 | 测前 = 测后 | `7C9E33C8…1652` / `9E581A4A…4D89`（`evidence/baseline-hashes.txt`） |
| 模型文件 | 五档全部保留、体积与测前一致（SenseVoice 239,233,841+315,894；int8 encoder 652,184,281；fp32 encoder.weights 2,435,420,160；base 59,707,625；tiny 32,152,673） | `evidence/PHASE2-cleanup.json` |
| `speaktype.json` | 与测前备份 0 个差异键：SenseVoice / language=zh / zh-CN / theme=system / panel=auto / remoteMic off / hotwords `[]` | `PHASE2-cleanup.json differentKeys: []` |
| `history.json` | 测前不存在（全新 profile）；81 条测试记录已另存 `evidence/final-history-full.json`，文件恢复为 `[]` | 本机 |
| `dictionary.json` | 从未创建（本版本学习结果在 `hotwords`） | `PHASE2-cleanup.json dictionaryExists=false` |
| 副本 B / dlproxy / mock LLM / phone 模拟器 / panelpoll / phasepoll / rss / SendInput 常驻进程 / VS Code / SpeakType / Notepad | 全部已停止；`dlctl.json` 恢复 `{"mode":"ok"}` | `PHASE2-stopped-pids.txt`；最终进程表只剩 Chrome |
| VS Code | 按任务书保留（`tools/vscode`，官方 zip） | |
| 仓库 | `desktop/package-lock.json` 已还原；`git status` 仅 `docs/reviews/round308.md` + `.agents/skills/testing-speaktype-desktop/SKILL.md`；分支 `review/round308-report` 自 `origin/main 4945230` 切出 | |
| 未还原项 | Whisper tiny（32MB，G 阶段下载）额外留在模型目录；`tools/vscode`；测试 harness `C:\Users\Administrator\tts\r308\`（仓库外） | |

## 13. 未测项汇总

- DPI 125% / 150%（本 VM 不可改，按任务书直接记未测）
- 免按重停靠与「首个有声帧」的精确时序（无日志钩子，只证明了「下一句开口前已切顶」）
- 排队/并发压力（多于 2 句连续重叠）
- 真机手机 APK / 网页 UI（用的是 LAN WebSocket 模拟器）
- 旧固定端口 18717 场景
- Whisper 独立就绪延迟
- 双击进免按、语音命令、人设 Alt+1..9、Esc 在识别/改写阶段、F8 切窗留剪贴板、Silero/标点模型、失败重试、文件转录导出、三档重置、深色跟随系统实时切换、下载续传与报错文案
- 真实付费云端 API、物理麦克风
- 免按中光标每句都跨越屏幕中线时的面板来回切换体感（§10）
- 排队第二句 `released=true` 分支（第二次按下后在恢复前就松手）
- 超过 10 分钟的免按内存曲线
- 「不再提示」的持久化行为（功能不存在，P3-308-1）
- 云端 / 手机 relay 模式（只测 LAN）

## 14. 建议下一轮（309）验收点

1. **P1-308-1 复测**：`hotkey.ts` 加日志后，重复「删除→下载→就绪 toast 出现 ≤0.6s 内按住 1.2–1.5s」×5（int8/fp32 各），并加「就绪后等 3s 再按」×3 对照，确认修复且首次按住有音频（`maxPeak>0`）。
2. **P2-308-1 复测**：同 §6 方法（dlproxy `stall-hf` + `mirrorDelayMs=4000`）zh-TW/ja/ko 各一次，要求 150ms 轮询在建连 4s 内持续看到「2/3（host）」；再跑一次第 3 源。
3. **P2-308-2 复测**：fp32 删除→重下后首句面板出现「加载模型」相位；若采纳下载后预热，验证 `downloaded` 日志后 ≤1s 出现 `sherpa worker started` 且首句松手→落字 <1.5s。
4. **P3-308-1**：「不再提示」落设置后重启不再弹；en/ko 文案随 action 按钮加入后重跑 toastgeo 三语排版。
5. **P3-308-2**：首启选 SenseVoice 后识别语言联动；全新 profile 从启动到中文首句落字目标 <45s（无需进 Settings）。
6. **README**：模型体积改口径；补「0.27s」口径；「main 领先」列表补友好模型名/取消日志；DPI 覆盖来源注明。
7. **回归固定项**：RightCtrl / 排队第二句（真正重叠，核 `queued`+`resumed queued` 日志）/ Alt+Q（`handsFree exit`）/ Esc（`cancel` 日志）/ F8 / 深色 / 三模型各一句 / 手机麦 b-①②③ / 端口竞态 a-③ / 免按段落空行（≥4s 停顿）。
8. **本轮未测补测**：Esc 在识别/改写阶段、F8 切窗留剪贴板、三档重置、双击进免按、语音命令各一次。
