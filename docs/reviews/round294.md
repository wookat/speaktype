# SpeakType 第 294 轮严格体验官报告（打包版 0.17.2 @ main b429e77 / PR #384）

> 角色：user-experience-officer + qa-engineer。测试对象：Windows VM 上从 main 全新 clone → `npm install && typecheck && build && pack:dir` 产出的 `desktop/release/win-unpacked/SpeakType.exe`（不测 dev）。全程真实本地模型（SenseVoice / whisper tiny-q5_1 / Parakeet 0.6B v3），唯一 mock 是 F8 改写用的本地 OpenAI 兼容服务（`http://127.0.0.1:18099/v1`）。
> 证据目录（VM 本地，未入库）：截图 `C:\Users\Administrator\tts\r294\shots\`，分阶段笔记/日志/history 切片打包在 `C:\Users\Administrator\tts\r294\stage{1,2,3}_evidence.zip`。录屏见文末。

## 给老板的结论（可直接转发）

1. #384 三项修复在真实环境全部实测通过：whisper 日文逐字不转（`東京/天気/晴/議` 原样、无 t2cn 日志）、中文文件转录真的触发 `whisper t2cn applied (language=zh): 5/29 chars changed`；真源（huggingface.co）中断续传 `Range: bytes=4719864-` → 206 → sha256 一致、无 416；本地假源 30.000s 精确停滞落源。核心链路（RightCtrl / Alt+Q / Esc / F8）、韩语 SenseVoice、Parakeet 英文全绿，无 P0/P1。
2. 新立 2 个 P2：连续两次按住说话间隔 <~1s 时第二句被静默吞掉（`start()` 遇 busy 直接 return，无提示、无排队）；人设新增/编辑弹窗不锁焦点，Tab 会跑到背景按钮、Enter 直接导航走。另 5 个 P3（History 复制无反馈、导出对话框标题是 blob URL、自动落字关闭时首页文案仍承诺落字、ja History 工具栏「すべて消去」折行、下载中无 Cancel / 另一模型「下载」静默无效）。
3. 判断：可以继续发布迭代，但 P2-294-1 会让高频用户丢句，建议 295 轮优先修。

---

## 0. 环境与构建

| 项 | 结果 |
|---|---|
| 源码 | `git clone https://github.com/wookat/speaktype` main，HEAD `b429e7742c297e99821b04cdd4429a3ef6960e4d` |
| Node / OS | Node 20.19.0，Windows Server 2022（无物理音频输出设备；系统 locale en） |
| `npm install` | 成功；EBADENGINE 警告（electron 43.3.0 / node-abi 要 Node ≥22.12）按指示忽略 |
| `npm run typecheck` | 通过（`tsc --noEmit -p tsconfig.json`） |
| `npm run build` | 通过（Vite main/preload/renderer） |
| `npm run pack:dir` | 通过，产出 `desktop/release/win-unpacked/SpeakType.exe`，`resources/app.asar` 36,598,138 B，SHA-256 `3A280184A4FEA01FCC01F7ED80E2FE85338E85437C2D61174A44CEC271E91800` |
| 启动参数 | `--no-proxy-server --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`，需要度量时加 `--remote-debugging-port=9333`；下载观测阶段加 `--inspect=9229`（只读 diagnostics_channel 观察 undici 请求，不改行为） |
| 音频夹具 | Edge TTS 合成后重采样 16k mono：`sample.wav`（zh，「帮我跟老板说那个方案需要再改一下明天上午之前给他答复」）、`ja1.wav`（「東京の天気は今日も晴れです。会議は午後3時からです。」）、`ko1.wav`、`en1.wav`、`rewrite.wav`（「把这句话改得更正式一点」）、`silence12.wav`、`ja_long.wav`（78.6s，文件转录取消用） |

main.log 开机行（打包态证明）：
```text
[2026-09-05 17:45:19.103] [info]  SpeakType 0.17.2 starting (packaged=true)
```

## 1. 总览矩阵

| # | 项目 | 结论 | 主要证据 |
|---|---|---|---|
| 1.1 | RightCtrl 按住说话落字 Notepad（SenseVoice zh） | **PASS** | `03_rctrl_notepad.png`；history `durationMs=7870`；log `dictation finalize: durationMs=7870 maxPeak=32768 voicedMs=4000` |
| 1.2 | Alt+Q 进/出免按（SenseVoice zh） | **PASS** | `04_handsfree_capsule.png`、`05_handsfree_two_sentences_exit.png`；两句自动分句落字，Alt+Q 退出后空尾 finalize 一次无落字 |
| 1.3 | 录音中 Esc 取消 | **PASS** | `06_cancel_toast.png`（「Dictation canceled / Nothing was typed」），history 计数不变，无 finalize 行 |
| 1.4 | F8 mock 改写 | **PASS** | `08_f8_replaced.png`，选中文本被替换为 `MOCK-REWRITE-294-OK`；mock 收到 1 条 user message（改写规则 + 三引号口述指令 + 三引号原文），temperature 0.3 |
| 1.5 | whisper tiny ja 一句不转简 | **PASS** | `16_whisper_ja_notepad.png`；history text `東京の天気は今日も晴れです。\n海議は午後3時からです`；log 无 `whisper t2cn applied`；`15_japanese_simplified_hidden.png` 简体开关隐藏 |
| 1.6 | whisper zh t2cn 真的发生（补充） | **PASS**（文件转录路径） | log `[debug] whisper t2cn applied (language=zh): 5/29 chars changed` |
| a.1 | 真源中断续传（huggingface.co） | **PASS** | `13_resume_14_percent.png`、`14_resume_14_to_ready.png`；`.part` 4,719,864/32,152,673；请求 `Range: bytes=4719864-` → 302 → CDN 206；sha256 = etag；无 416 |
| a.2 | 30s 停滞落源（本地 TCP 假源，改 asar 导流） | **PASS** | log `download source failed: http://127.0.0.1:18101/... stalled: no data for 30s (127.0.0.1:18101)`；首请求 17:56:15.710 → 下一源 17:56:45.712 = 30.000s；`22_stall_fallback_complete.png` |
| a.3 | asar 还原 | **PASS** | 还原后 SHA-256 `3A2801…1800`、36,598,138 B，与备份一致；`23_restored_build_ready.png` 还原版可启动 |
| b.1 | 820px ja/en 转录取消态结果头 | **PASS**（ja 导出组换行，判定可接受，见 §3.b） | `2x_E1_ja820_cancel.png` 等 4 张 + layout.json |
| b.2 | ja History 普通态「すべて消去」折行 | **FAIL → P3-294-4** | `2x_E3_ja820_history.png`：export.top 55.5 / clear.top 91；ko、zh-TW 同排 |
| c.1 | P3-292-8 F8 改写中面板无模式标识 | **复现（仍存在）** | `07_f8_wait_polishing.png`：慢 mock 3000ms（实测 3005ms）期间只显示通用「Polishing...」 |
| c.2 | P3-292-10 ja 转录页副标题 820 孤字 | **部分复现**（两字尾 `ート`，非单字） | `2x_E2_ja820_title.png` |
| c.3 | P3-292-9 重启窗口高度 -12px | **未复现（PASS）** | 三次 tray Quit 重启：native 836×660 / CDP 820×652 全程不变；自定 956×620 / 940×612 也不变 |
| d | 下载中无 Cancel（Parakeet 660MB 场景） | **立案 P3-294-6**（含另一模型「下载」静默无效） | `2x_G2_parakeet_downloading_no_cancel.png`、`2x_G2_other_download_noop.png` |
| e.1 | ko 听写（SenseVoice）落字 + History | **PASS** | `2x_G1_korean_notepad.png`；text=raw `내일 오전 회의는 10시에 시작합니다 자료를 미리 준비해주세요.` |
| e.2 | Parakeet 英文听写落字 | **PASS** | `2x_G2_english_notepad.png`；`Please send the quarterly report to the finance team before Friday afternoon.`（与夹具逐字一致） |
| e.3 | Parakeet 选中时识别语言下拉禁用文案五语 | **PASS** | `2x_G3_{zhCN,zhTW,en,ja,ko}_parakeet.png`；select clientWidth=scrollWidth，无截断 |
| f.1 | History / Dictionary 空态 zh-TW/ja/ko × 浅/深 | **PASS**（12 变体） | `2x_H_*`；对比度 浅 4.83:1 / 深 6.17:1 |
| f.2 | toast 与免按面板同时出现遮挡 | **PASS** | `2x_I_no_target_toast_panel.png`、`2x_I_pasteblocked_live_caption.png`；toast 底 504 / 面板顶 518，间隙 14px |
| g | 自由发掘 ~27 分钟 | 2 P2 + 3 P3 | §4 |

## 2. 核心链路回归（SenseVoice zh + whisper tiny ja）

### 2.1 RightCtrl 按住说话 — PASS
- 步骤：Notepad 前台 → `rkey.ps1 down:rctrl,sleep:8000,up:rctrl`（假麦 sample.wav）。
- history.json 切片：
```json
{"id":"f16bc756-acc1-4659-bf51-64347c8f860c","at":1788630409537,
 "text":"帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复",
 "raw":"帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复。",
 "personaName":"Default","personaId":"default","durationMs":7870,"provider":"local"}
```
- main.log：
```text
[2026-09-05 17:46:13.009] [info]  local model sensevoice-small downloaded
[2026-09-05 17:46:40.980] [info]  sherpa worker started (sensevoice-small)
[2026-09-05 17:46:48.839] [info]  dictation finalize: durationMs=7870 maxPeak=32768 voicedMs=4000
```
- 备注：SenseVoice 模型首次下载 ~4–9s（未精确计时），进度 29% 时无 Cancel（`01_sensevoice_downloading_no_cancel.png`）。

### 2.2 Alt+Q 免按 — PASS
两句各自静音自动落字，再 Alt+Q 退出；退出时尾段空录音 finalize 一次（`maxPeak=0`）不落字、不进 History。
```text
[2026-09-05 17:47:20.482] [info]  dictation finalize: durationMs=8242 maxPeak=32768 voicedMs=4000
[2026-09-05 17:47:37.282] [info]  dictation finalize: durationMs=15933 maxPeak=21177 voicedMs=4020
[2026-09-05 17:47:44.254] [info]  dictation finalize: durationMs=5794 maxPeak=0 voicedMs=0
```

### 2.3 Esc 取消 — PASS
`down:rctrl,sleep:3000,esc,up:rctrl` 原子序列：toast「Dictation canceled / Nothing was typed」，Notepad 空，重启后无任何 `dictation finalize`，history 计数 3→3。（首次截图错过瞬态，重跑一次才抓到——见 SKILL 备注。）

### 2.4 F8 改写（mock）— PASS；P3-292-8 复现
- 选中 `Please revise this message.` → 按住 F8 6s（假麦 rewrite.wav）→ 文本被替换为 `MOCK-REWRITE-294-OK`。
- mock 日志（3000ms 延迟）：
```text
2026-09-05T17:49:21.697Z POST /v1/chat/completions
{"model":"mock-model","temperature":0.3,"messages":[{"role":"user","content":"你按用户的口述指令改写下面这段文字（可能是改写、润色、翻译、扩写、缩写等）。\n要求：\n1. 只输出改写后的正文…\n\n口述指令：\n\"\"\"把这句话改得更正式一点。\"\"\"\n\n原文：\n\"\"\"Please revise this message.\"\"\""}]}
---
2026-09-05T17:49:24.702Z replied after 3000ms
```
- 等待 3s 期间面板（`07_f8_wait_polishing.png`）只有转圈 + 「Polishing...」，与普通润色完全同款，没有「改写/翻译中」标识 → P3-292-8 仍在，见 §3.c。
- 普通听写全程 `polishEnabled=false`，避免 mock 污染普通落字。

### 2.5 whisper tiny ja — PASS（转换门控）；ASR 准确率另记
- 识别语言 ja、模型 tiny-q5_1、`localSimplified=true`（故意开着看门控是否压过开关）。
- Settings 中「Force Simplified」开关在 ja 下隐藏（`15_japanese_simplified_hidden.png`）；切回 zh 显示（`17_chinese_simplified_visible.png`）。
- 结果 `東京の天気は今日も晴れです。\n海議は午後3時からです`：`東/気/晴/議` 均为日文字形未被转为 `东/气/议`；`会議`→`海議` 是 tiny 模型听错（同音），与 t2cn 无关，如实记录不算 #384 回归。
- 该次会话 main.log 无任何 `whisper t2cn applied` 行：
```text
[2026-09-05 17:53:39.569] [info]  local whisper-server starting (model=tiny-q5_1, port=18717)
[2026-09-05 17:53:49.435] [info]  dictation finalize: durationMs=9875 maxPeak=32768 voicedMs=3540
```
- zh 实时听写（`18_whisper_zh_notepad.png`）输出本身已是简体，无字符改变故无 debug 行；正向分支由 Stage 2 的中文文件转录覆盖：
```text
[2026-09-05 18:04:33.695] [info]  file transcribe started (10.7s, model=tiny-q5_1)
[2026-09-05 18:04:34.107] [debug] whisper t2cn applied (language=zh): 5/29 chars changed
[2026-09-05 18:04:34.111] [info]  file transcribe done (1 segments)
```
- 未测：yue、auto 含/不含假名谚文、zh-TW locale 全新配置默认 `localSimplified=false`（未做 zh-TW locale 全新 profile 首启验证，只读到源码 `store.ts` 52 行 `localSimplified: !HANT_LOCALE`——「有代码」不等于「验证过」）。

## 3. 本轮专项

### a) #384 真源回归 — PASS

**a.1 中断续传（真实 huggingface.co）**
- 三次尝试：第 1 次 32MB 在 kill 前已下完（17:50:42.638 完成 vs 17:50:42.827 kill）；第 2 次 kill 时 `.part` 已满 32,152,673 B（=total），UI 显示「Resume (99%)」，本地校验直接 Ready 无 Range 请求（99% 上限是 `modelPartialPercent` 的设计，不是 bug）；第 3 次预先定位主进程、`.part` 出现即 `Kill()`，留下真残片：
```text
ggml-tiny-q5_1.bin.part       4719864
ggml-tiny-q5_1.bin.part.json  177
{"url":"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin","etag":"818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7","total":32152673}
```
- 重启后 Settings 显示「Resume download (14%)」（4719864/32152673=14.68% 取整，`13_resume_14_percent.png`）。
- 点击后只读观察到的 undici 请求（main.log 不记录成功源/Range，故用 `--inspect` 挂 diagnostics_channel）：
```text
2026-09-05T17:52:49.029Z undici:request:create  https://huggingface.co     Range=bytes=4719864- 
2026-09-05T17:52:49.165Z undici:request:headers https://huggingface.co     Range=bytes=4719864- status=302
2026-09-05T17:52:49.168Z undici:request:create  https://us.aws.cdn.hf.co   Range=bytes=4719864-
2026-09-05T17:52:49.448Z undici:request:headers https://us.aws.cdn.hf.co   Range=bytes=4719864- status=206
```
- 888ms 后 `[info] local model tiny-q5_1 downloaded`；最终文件 SHA-256 `818710568DA3…D3C7` 与 `.part.json` etag 一致；全程 main.log 无 `416`、无重下。

**a.2 30s 停滞落源（本地 TCP 假源）**
- 方法：备份 `app.asar` → 解包 → 只把 `hfSources()` 第一个 host `https://huggingface.co/` 改成 `http://127.0.0.1:18101/`（第二源 hf-mirror 保持真实）→ 重打包（保留 koffi/sherpa-onnx/uiohook unpacked 标记，`app.asar.unpacked` 不动）。未改 hosts、未开防火墙。
- 假源 Node TCP server：accept、记录请求行、永不写回。服务端日志：
```text
2026-09-05T17:56:15.710Z accepted 127.0.0.1
2026-09-05T17:56:15.711Z received GET /ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin HTTP/1.1; deliberately no response
2026-09-05T17:56:45.708Z closed
```
- main.log：
```text
[2026-09-05 17:56:45.710] [warn]  download source failed: http://127.0.0.1:18101/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin Error: stalled: no data for 30s (127.0.0.1:18101)
[2026-09-05 17:56:47.196] [info]  local model tiny-q5_1 downloaded
```
- 停滞判定 30.000s 精确（源码 `STALL_TIMEOUT_MS = 30_000`，`stallGuard` 用 `new URL(url).host` 故消息带端口）。落源后 1.5s 完成（hf-mirror 308 → HF 302 → CDN 200，由只读观察器记录）。
- 停滞 0% 期间切到 Home 再回来进度保持（`20_download_persists_home.png`），无 Cancel（`21_stall_waiting_no_cancel.png`）。
- 还原：`app.asar` 还原后 SHA-256 / 大小与备份完全一致，还原版启动正常（`23_restored_build_ready.png`）。
- 未测：`.part` > total 的 99% 分支、404/5xx/网络错误三种文案（未构造对应源）、跨源 etag 身份不一致时的丢弃分支。

### b) #384 未覆盖布局观察

**b.1 820px ja/en 取消态结果头（CDP 度量）**

| 语言 / innerWidth | 左组（标题+文件名+badge）rect | 导出组（复制/TXT/SRT）rect | 是否同排 |
|---|---|---|---|
| ja 820（46% 取消，6 段） | (240,370,368.64,20) | (240,398,205.17,30) | 否，落第二行左对齐 |
| ja 1100 | (270,347,368.64,20) | (832.83,342,205.17,30) | 是 |
| en 820（31% 取消，4 段） | (240,347,347.31,20) | (612.30,342,175.70,30) | 是 |
| en 1100 | — | — | 是 |

- 取消 badge 单行；进度行完成后保留，Cancel `visibility:hidden` 高 30 仍占位（ja y=316、en y=288），导出行没有滑进 Cancel 位置 → #384 的三点修复实测成立。
- 取消态无 `finishedAt`，因此没有时间戳 span（源码 `!state.running && state.finishedAt` 才渲染），不存在「时间戳挤压」问题。
- **设计判断：ja 导出组换行可接受，不建议强制单行。** 依据：① 最小窗宽 820 是产品下限，内容区仅 548px，ja「全文をコピー」比 en「Copy all」宽 ~30px，强制单行只能截断文件名或缩按钮；② 同类桌面工具（VS Code 编辑器标题栏 action、Windows 11 记事本/照片工具栏、macOS Finder 工具栏）在窄宽下一律「溢出换行或折进 … 菜单」，不会截断主操作；③ 源码 `flex-wrap … justify-between` 是有意为之的响应式策略。但换行后导出组贴左（x=240）与 1100 时贴右不一致，建议给按钮组加 `ml-auto`，换行后仍右对齐，一行代码即可（P3 级打磨，并入 P3-294-4 一起处理）。

**b.2 ja History 普通态工具栏（820px）— FAIL，立案 P3-294-4**
- 度量：search.top 48.5 / export.top 55.5 / clear.top 91 → 「すべて消去」单独落到「エクスポート」下方；ko、zh-TW 三控件同排（55.5）。有来源筛选 `<select>` 时（文件+听写并存）更容易折。
- 清空确认态三语均单行（`2x_E3_*_confirm.png`），#384 该点成立。

### c) 292 轮遗留 P3 复核

- **P3-292-8（F8 改写中无模式标识）— 复现。** 慢 mock 3000ms（实测 3005ms）期间面板只显示通用「Polishing...」（`07_f8_wait_polishing.png`）；普通按住面板（`09_normal_rctrl_panel.png`）也无模式字样。根因：`dictation.ts` `report()`/`status()` 对改写与普通润色都发同一个 `state:"polishing"`，`StatusPayload` 无 `rewrite` 标志；`panel.tsx` 仅按 `status.state` 取 `panel.transcribing/panel.polishing` 文案。建议：`status()` 加 `mode: this.rewriteTarget ? "rewrite" : "dictation"`，panel 在 rewrite 时显示「改写中…（原文保留，Esc 取消）」并在录音阶段显示「改写模式」徽标，五语补文案。保持 P3。
- **P3-292-10（ja 转录副标题 820 孤字）— 部分复现。** 副标题「音声ファイルをオフラインで文字化し、字幕をエクスポート」在 820 折成两行，第二行是两字 `ート`（y55/y83 字符范围证据），不是单字孤行；无裁切。建议改 ja 文案为更短的「音声ファイルをオフラインで文字起こし・字幕出力」或在 `、` 处允许优先断行（`<wbr>`），保持 P3 不升级。
- **P3-292-9（重启高度 -12px）— 未复现。** 三次 tray Quit → 重启：`mainWindowBounds` 820×652，native 836×660，CDP inner 820×652 全程一致；自定 956×620（inner 940×612）重启亦一致。292 轮的 -12 推测为把 native 外框高（含 8px 隐形边距）与存储高对比造成的度量误差；本轮已建立「三值同测」方法（见 SKILL）。建议关闭 P3-292-9。

### d) 下载中无 Cancel — 立案 P3-294-6（含「另一模型下载按钮静默无效」）
- 实测：Parakeet（encoder+decoder+tokens ≈660MB）在本 VM 首次下载 27–29s、二次 30s，2%→100% 全程无 Cancel（`2x_G2_parakeet_downloading_no_cancel.png`）。下载中切页进度保留、可删除其他已装模型（`2x_G2_delete_during_download.png`）、退出应用后 `.part` 保留可续传（a.1 已证）。
- **同时发现**：Parakeet 下载中切到未下载的 base-q5_1，其「Download」按钮是启用态，点击后无任何反馈、无 `.part` 产生（`2x_G2_other_download_noop.png`）。根因 `localasr.ts` `downloadLocalModel()` 首行 `if (status.downloading) return { ...status };` 直接返回当前（另一模型的）状态，renderer 端也没有针对「别的模型正在下载」的禁用/提示。
- **用户影响评估**：本 VM 带宽好，660MB 半分钟；家用 5–10 MB/s 要 1–2 分钟，弱网可能 10 分钟+。期间用户唯一的「取消」手段是退出应用（会同时中断正在使用的听写）；选错模型（例如想下 SenseVoice 却点了 Parakeet）只能干等。虽然退出后 `.part` 保留、不浪费流量，但「点错了没法撤回 + 另一个按钮点了没反应」组合起来是明显的可用性缺口。
- **判断：立案 P3（非 P2）**，理由：不丢数据、不卡死、有退出兜底，且续传完整；但属于 295 轮应做的完善项。设计建议：① `downloadLocalModel` 持有 `AbortController`，暴露 IPC `localasr:cancel`，abort 后保留 `.part/.part.json`（复用现有 stall abort 路径，UI 回到「Resume (x%)」）；② 下载中的模型卡显示「取消」（与转录页 Cancel 同款样式）；③ 其他未下载模型的 Download 按钮在 `status.downloading && status.model !== model` 时 disabled 并附 hint「正在下载 {{model}}，完成后可再下载」。

### e) 韩语 + Parakeet — PASS
- ko1.wav / SenseVoice / language=ko：Notepad 与 History text=raw 均为 `내일 오전 회의는 10시에 시작합니다 자료를 미리 준비해주세요.`，`durationMs=9874`。
- Parakeet 真源下载 → 重启 → en1.wav：`Please send the quarterly report to the finance team before Friday afternoon.` 逐字一致，`durationMs=8878`。
- Parakeet 选中时识别语言 `<select disabled>` 显示的是「Auto (English + 25 European languages)」的五语翻译而非残留的 ko（源码 `VoiceTab.tsx` `parakeetActive` 分支固定渲染 `settings.asrLanguageParakeetAuto`）；select 宽 zh-CN 237 / zh-TW 237 / en 294 / ja 227 / ko 225，clientWidth=scrollWidth，hint 完整换行无裁切。
- 模型切换 `sherpa worker stopped (model switched)` 后未出现 247 轮的 `gc already declared` 错误（本轮切换均在重启后进行，未刻意复现热切换）。

### f) 五语 × 浅/深抽查 — PASS
- History / Dictionary 空态 zh-TW、ja、ko × light/dark 共 12 变体全部本地化、无裁切、无浅/深布局位移（History 空态组 rect (240,140,548,40) 各变体一致；Dictionary ja 因上方多一段说明为 (240,474,…)，ko/zh-TW 为 (240,458,…)）。
- 对比度（空态标题 14px / 提示 12px，取有效祖先背景）：浅色 rgb(95,110,135) on rgb(247,247,249) = **4.83:1**；深色 rgb(141,151,174) on rgb(20,22,29) = **6.17:1**，均 ≥ WCAG AA 4.5:1。
- 深色 Home 三语粗看无未翻译/裁切（`2x_H_*_dark_home.png`）。
- toast × 免按面板：
  - Esc 退出免按：toast「Hands-free mode ended / Esc pressed…」出现时面板与字幕已立即隐藏（`2x_I_esc_toast_panel_hidden.png`），不存在同屏状态。
  - 免按中前台为 SpeakType 主窗（不可编辑）：toast「No text field in focus / Your words were saved to History…」与免按胶囊同屏（`2x_I_no_target_toast_panel.png`）；log `paste skipped: no input target (fg=1442590), text kept in history`。
  - 真 pasteBlocked：Notepad 前台、Alt+Q 后按住 Alt 11s 跨过 finalize → toast「Text not typed — a key was held down / It's on your clipboard…」，悬停 toast 暂停超时，下一循环字幕出现，toast + LIVE 字幕 + 波形同屏（`2x_I_pasteblocked_live_caption.png`）。
  - 几何：toast (380,412,520,92) 底 504；面板 (410,518,460,150) 顶 518；间隙 14px，无遮挡。与 `windows.ts` `TOAST_HEIGHT - 176` / `PANEL_HEIGHT - 12` 的常量推算一致（176-12-150=14）。

## 4. 自由发掘（~27 分钟，zh-CN / 浅色 / SenseVoice zh，全部复现两次）

通过项（不展开）：Home 四步引导与展开、麦克风电平测试；托盘菜单本地化、双击还原、单实例（连开两次 exe 主进程 PID 不变）；无边框窗最小化/最大化/关闭到托盘；热键捕获 F6/RightCtrl、改写键与按住键冲突警告；General 各开关与条件控件；Enhanced VAD 3MB 下载提示；人设增/改/删 + 应用规则（Notepad→自定人设）落 History `personaName`；词典同音纠正「方案→芳岸」两次听写命中；**自动学习**（手动把 Notepad 里的「方案」改成「芳岸」→ ~3s 学词 toast → 下一句自动用「芳岸」）；History 搜索/筛选/编辑/删除+撤销/筛选后 Markdown 导出（UTF-8 BOM、恰好 2 条）；MP3/M4A 真实 Explorer 拖放转录、TXT/SRT 导出（BOM、`00:00:00,000 --> 00:00:08,500`）；听写进 SpeakType 自己的 History 搜索框、Chrome 地址栏；80ms 短按忽略、180ms 与 12s 静音均「没听清」不入 History；3s 按住中 Alt+Q 收尾一句不残留面板；主窗 Tab/Shift+Tab 焦点环可见。main.log 全程无 `[error]`，warn 仅 Stage 1 故意停滞与 3 条故意的 `paste skipped: no input target`。

未测：真实云端润色/翻译/人设风格（无凭据）、语音命令实际执行、6 行字幕真实渲染、开机自启/登录后行为、MP3 的 SRT（只验了 M4A 的 SRT）、免按面板 6×10s 无声自动退出（本轮未跑满）。

## 5. 立案清单

### P2-294-1 连续两次按住说话，第二句被静默吞掉
- **复现**（2/2）：Notepad 前台，一条 SendInput 序列 `down:rctrl,8s,up:rctrl,150ms,down:rctrl,8s,up:rctrl`。只落第一句；第二段 8s 按住期间没有录音面板，无第二条 History（29→30、30→31），事后无残留面板。
```text
[2026-09-05 18:47:56.480] [info]  dictation finalize: durationMs=7869 maxPeak=32768 voicedMs=4000   ← 第 1 次序列唯一 finalize
[2026-09-05 18:48:36.034] [info]  dictation finalize: durationMs=7880 maxPeak=32768 voicedMs=4000   ← 第 2 次序列唯一 finalize
```
  截图 `3x_rapid_swallowed_1.png`、`3x_rapid_swallowed_2.png`。
- **根因（源码）**：`hotkey.ts` `pressHold()` 在 `holdDelayMs`(120ms) 后调用一次 `onHoldStart` → `dictation.start("hold")`；`dictation.ts` `start()` 首行 `if (this.busy) return;`。`busy` 从开录一直保持到 finalize（ASR 解码 + 粘贴 + 写 History）完成才清，第一句松手后 270ms 第二次 `start()` 到达时仍 busy → 直接返回，没有 toast、没有排队、也不会在 busy 清除后重试；随后松手 `stop()` 因 `!this.busy` 也返回。用户看不到任何反馈，以为自己说了却没落字。8s 长按也救不回来，因为 hotkey 层只在按下瞬间触发一次。
- **影响**：高频口述（说完一句紧接下一句）必丢句，且无感知；SenseVoice 快、体感间隔 <1s 就中招，whisper/云端 ASR 处理时间更长窗口更大。
- **建议修法**：① `start()` 遇 `busy && (state==="transcribing"||state==="polishing")` 时记 `this.pendingStart = mode`，并让 recorder 继续采集（`recorder:start` 不停），finalize 收尾 `report("idle")` 后若 `pendingStart` 且 hotkey 层仍按住（新增 `isHoldDown()`）则立即开新会话并把缓冲帧 `pushPcm`；② 最低限度：busy 时 `showToast(t("toast.busy"), t("toast.busyBody"))`（「上一句还在处理，请稍后再按」，2s 节流），让丢句可感知；③ 单测：`start()` 在 busy 期间连续调用两次，断言第二次要么排队要么发 toast。

### P2-294-2 人设新增/编辑弹窗不锁焦点，Tab 跑到背景、Enter 导航走
- **复现**（2/2）：Settings → 人设 → 「新增人设」→ 按 Tab：焦点环出现在被遮罩的背景按钮「配置 AI 润色」而非弹窗「名称」输入框；按 Enter → 跳到 Settings › AI 润色，弹窗被关闭，已输内容丢失。`3x_persona_focus_escape_1/2.png`、`3x_persona_focus_2.layout.json`（activeElement=背景按钮）、`3x_persona_background_navigation.png`。
- **根因（源码）**：`Personas.tsx` 242–290 行弹窗是普通 `<div className="fixed inset-0 z-50 …">`，无 `role="dialog"/aria-modal`、无 `autoFocus`、无焦点陷阱、无 Esc 关闭；背景仍可聚焦，Tab 顺序按 DOM 从弹窗前的元素继续。
- **建议修法**：改用原生 `<dialog>` + `showModal()`（浏览器自带焦点陷阱、Esc 关闭、背景 inert），打开时 `nameRef.current?.focus()`；或保留 div 但给 `<main>` 加 `inert`、加 `role="dialog" aria-modal="true"` 与 Tab 循环处理。其他 `fixed inset-0` 弹窗（如有）同步排查。键盘可访问性属于「能不能用」而不是打磨，故 P2。

### P3-294-3 History 条目「复制」无任何反馈
- **复现**（2/2）：History 搜索 → 点某条「复制」：按钮不变、无 toast；切到 Notepad 粘贴才发现已复制成功。`3x_history_copy_no_feedback_1/2.png`、`3x_history_copy_notepad.png`。
- **根因**：`History.tsx` 235 行 `onClick={() => void navigator.clipboard.writeText(item.text)}` 无状态；而 `Transcribe.tsx` 142 行同类按钮有 `copied` 态 + `transcribe.copied` 文案，两页不一致。
- **建议**：复用 Transcribe 的 1.5s `copied` 状态（文案 `history.copied` 五语，或直接用已有 `transcribe.copied`）。

### P3-294-4 ja History 工具栏「すべて消去」折行到「エクスポート」下（含 b.1 换行后导出组左对齐）
- **复现**：uiLanguage=ja、innerWidth 820、History 同时有听写与文件来源（出现来源 `<select>`）：clear.top 91 vs export.top 55.5；ko/zh-TW 同排。`2x_E3_ja820_history.png`。
- **根因**：`History.tsx` 工具栏 `flex-wrap` + `w-40` 搜索框 + 来源 select + ja 两个按钮（「エクスポート」6 字、「すべて消去」5 字，均带 `px-3`）合计超过 548-标题 宽；`flex-wrap` 让最后一项掉行是设计允许的，但只掉一个按钮观感是「错位」。
- **建议**：ja 文案缩短为「エクスポート」→「書き出し」、「すべて消去」→「全消去」；或搜索框在 `<820+…` 时 `w-32`；Transcribe 结果头导出组加 `ml-auto` 使换行后右对齐。

### P3-294-5 「自动落字」关闭时 Home 仍承诺「落到光标处」
- **复现**（2/2）：Settings › 通用 › 自动落字关 → 听写（正确只进 History，Notepad 空，面板给出仅保存到历史的提示）→ Home 副标题仍为「松开按键即自动整理并落到光标处」，四步引导第 4 步仍为「松开按键，文字自动落到光标处」。`3x_autopaste_off_home_1/2.png`。
- **根因**：`Home.tsx` 57–58 行只按 `hotkeyToggle` 选 `home.subtitle/subtitleNoToggle`，152 行固定 `home.steps.4`；均未读 `settings.autoPaste`。
- **建议**：`autoPaste=false` 时改用 `home.subtitleHistoryOnly`（「松开按键即整理并保存到历史（自动落字已关闭）」）和 `home.steps.4HistoryOnly`，五语补文案。

### P3-294-6 下载中无 Cancel；另一模型「Download」点击静默无效
见 §3.d：复现、根因（`downloadLocalModel` 无 AbortController、`if (status.downloading) return` 静默）、影响评估与三点设计建议。

### P3-294-7 导出「另存为」对话框标题显示 `blob:file:///…UUID`
- **复现**（2/2）：History「导出」（Dictionary 导出、Transcribe TXT/SRT 同路径）：系统保存对话框标题为 `blob:file:///…/<uuid>`。`3x_history_export_blob_1/2.png`。
- **根因**：`History.tsx` 113–118、`Dictionary.tsx` 50–53、`Transcribe.tsx` 35–38 用 `URL.createObjectURL + <a download>` 走 Chromium 默认下载流程；main 进程没有 `session.on("will-download")` 定制对话框，Chromium 以 URL 作标题。而 `index.ts` 456 行 `config:export` 已经用 `dialog.showSaveDialog` 正规实现。
- **建议**：统一走 IPC `file:saveText({defaultName, content, filters})` → `dialog.showSaveDialog({ title: t("export.title"), defaultPath: join(documents, name) })` + `writeFileSync`；或最小改动 `session.defaultSession.on("will-download", (_, item) => item.setSaveDialogOptions({ title, defaultPath }))`。

### 292 轮遗留处置建议
- P3-292-8 保留（复现）；P3-292-10 保留但降为文案微调（两字尾）；P3-292-9 建议关闭（三值同测未复现）。

## 6. 环境还原与约束核对

| 项 | 结果 |
|---|---|
| `app.asar` | 还原后 SHA-256 `3A280184A4FEA01FCC01F7ED80E2FE85338E85437C2D61174A44CEC271E91800`，36,598,138 B，与备份一致；Stage 2/3 末再核仍一致 |
| whisper tiny 模型文件 | SHA-256 `818710568DA3CA15689E31A743197B520007872FF9576237BDA97BD1B469C3D7`（= HF etag） |
| mock / 假源进程 | 18099（mock LLM）、18101（stall）、9333/9229/43117 均无监听；无残留 node 进程 |
| 应用 | 通过托盘 Quit 正常退出；profile：zh-CN、浅色、SenseVoice zh、autoPaste on、polish off、默认人设、词典/应用规则空；History 原 17 条逐字节未变（+17 条 QA 条目保留） |
| 产品代码 | 未改动；`git status` 仅 `docs/reviews/round294.md` 与 `.agents/skills/testing-speaktype-desktop/SKILL.md` |
| GitHub Actions | 未触碰，保持禁用；未建 PR |
| 禁区 | 未改 hosts、未开防火墙、未暴露任何 key/cookie |

## 7. 录屏与证据

- Stage 1（核心链路 + 真源续传 + 停滞落源）：`C:\Users\Administrator\screencasts\r294-stage1\r294-stage1-edited.mp4`
- Stage 2（820 布局 / 窗口持久化 / ko+Parakeet / 五语空态 / toast 遮挡）：`C:\Users\Administrator\screencasts\r294-stage2\r294-stage2-edited.mp4`；Explorer 真拖放补充：`C:\Users\Administrator\screencasts\r294-stage2-drop\r294-stage2-drop-edited.mp4`
- Stage 3（自由发掘，带标注剪辑 4m21s）：`C:\Users\Administrator\screencasts\r294-stage3\r294-stage3-edited.mp4`；完整 26m41s：`C:\Users\Administrator\screencasts\r294-stage3\r294-stage3-full.mp4`
- 截图/日志/history/CDP layout.json：`C:\Users\Administrator\tts\r294\stage{1,2,3}_evidence.zip`（截图前缀：Stage 1 数字序号、Stage 2 `2x_`、Stage 3 `3x_`）
- 注意：`C:\Users\Administrator\screencasts\round294\round294-edited.mp4` 是搭环境时的占位录制，不是证据。

## 建议下一轮（295）验收点

1. **P2-294-1**：`down:rctrl,8s,up,150ms,down:rctrl,8s,up` 两句都落字（或第二句有明确「稍候」toast）；再测 whisper tiny（处理更慢）与 Alt+Q 免按句间用 RightCtrl 插话；单测覆盖 busy 期间 `start()` 二次调用。
2. **P2-294-2**：人设弹窗打开即焦点在「名称」，Tab/Shift+Tab 循环不出弹窗，Esc 关闭，背景按钮不可激活；全仓 `fixed inset-0` 弹窗逐个复核（键盘 only）。
3. **P3-294-6**：下载中出现 Cancel，点击后 `.part/.part.json` 保留、UI 回「Resume (x%)」并可续传完成（真源 Parakeet）；下载中其他模型 Download 禁用带提示。
4. **P3-294-3/5/7**：History 复制有「已复制」；autoPaste 关时 Home 文案切换（五语）；导出对话框标题本地化，History/Dictionary/Transcribe 三处一致。
5. **P3-294-4 + b.1**：ja 820 History 三控件同排（含来源 select）；Transcribe 结果头换行后导出组右对齐；ja 副标题无两字孤尾。
6. **P3-292-8**：F8 改写等待期面板显示改写模式标识（慢 mock 3s 观察）。
7. 本轮未测补齐：全新 profile（zh-TW/HK/MO locale）首启 `localSimplified=false` 默认值；yue / auto（含假名、含谚文、纯汉字）三种 whisper 门控；404/5xx/网络错误三种下载文案；`.part`>total 分支；MP3 SRT 导出；免按 6×10s 无声自动退出。
8. 回归常规：RightCtrl / Alt+Q / Esc / F8（SenseVoice zh）+ whisper tiny ja 一句 + Parakeet en 一句；asar sha256、mock 停止、git 干净。
