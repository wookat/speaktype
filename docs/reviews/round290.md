# 第 290 轮严格体验官验收报告（user-experience-officer + qa-engineer）

- 被测版本：`main@f1e651d`（v0.17.0，含 PR #380：ja 820px History 页头折行修复 + 6 个 P3）
- 被测形态：`desktop/release/win-unpacked/SpeakType.exe` 打包版（本机 `npm install → typecheck → build → pack:dir` 产出，非 dev）
- 环境：Windows Server 2022，1280×720，Node v20.19.0 / npm 10.8.2，Electron 43.3.0，electron-builder 26.15.3，系统 locale en-US，`%APPDATA%\SpeakType` 本轮从零开始（首启下载 SenseVoice）
- 手法：Chromium fake-mic（`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`，wav 为 Windows SAPI 语音 Huihui(zh)/Heami(ko)/David(en) 生成 + 1s 头/10s 尾静音）+ `SendInput` 扫描码合成热键（`rkey.ps1`，RightCtrl 用 `Control_R`）+ 本地 mock OpenAI（127.0.0.1:18099）+ CDP 9333 仅做 DOM/样式取证与 `DOM.setFileInputFiles` 选文件 + `main.log` / `speaktype.json` / `history.json` / 导出文件落盘证据
- 录屏（三段连续）：`C:\Users\Administrator\screencasts\r290-phase1\r290-phase1-edited.mp4`（核心回归 + 专项 a）、`...\r290-phase2\r290-phase2-edited.mp4`（专项 b + c）、`...\r290-phase3\r290-phase3-edited.mp4`（专项 d）
- 全量证据在 `C:\Users\Administrator\r290\{phase1,phase2,phase3}\`（含各 phase 计划/结果/CDP 度量/日志切片）；关键 44 件随本报告提交到 `docs/reviews/round290/`
- 未改产品代码、未建 PR、GitHub Actions 保持禁用、防火墙未开启、hosts 未动；仅推报告分支 `review/round290-report`（含 SKILL.md 第 290 轮学习）

## 0. 结论

**f1e651d 打包版核心链路与 #380 全部边界实测通过，两个遗留观察项均以 ≥ 要求样本量取证并给出建议；但新立 1 个 P1（模型下载遇磁盘满 ENOSPC 直接 uncaughtException 弹原生错误框并退出进程，未走本地化存储错误提示，残留 .part）、1 个 P2（人设页「新增規則」按钮 820px 下竖排 4 行）、6 个 P3。** P1 未修前不建议对外发布"存储错误已处理"的说法；其余不阻塞发布。

| 区块 | 结果 |
| --- | --- |
| 构建 / 打包 / 首启下载 SenseVoice | PASS（HF 直连 ~9s，sha256 与上轮一致） |
| 核心链路（RightCtrl / Alt+Q 进出 / Esc 会话中 / Esc 免按中 / F8 mock 改写） | PASS（5/5） |
| 专项 a-1 冷启动首句完整性 ×3（+3 次热启对照） | PASS 3/3 完整 → **P3-289-9 建议不修（未复现）** |
| 专项 a-2 韩语词内空格 7 条真实样本 | 终稿 0/7 有词内空格 → **P3-289-5 建议不修（终稿不系统；实时字幕有拆分，见观察）** |
| 专项 b zh-TW/ko 词典提示 2→1→消失、时长 key 三档、自定义人设显示/搜索/导出/切语言、旧新混排导出 | PASS 13/14，1 FAIL（简体搜索 `自定义` 搜不到 `自定義`，P3-290-4） |
| 专项 c-1 只读目录（DENY ACL）下载错误文案四语 + 免重启恢复 | PASS |
| 专项 c-1 磁盘满（20MB VHDX）下载 | **FAIL → P1-290-1** |
| 专项 c-2 History「糾錯/教정/Correct/修正」五语链路 | PASS（5/5） |
| 专项 d 820px 深色 zh-TW/ko 设置 4 tab + 五页走查 | PASS，1 P2（人设页按钮） |
| 专项 d 转录页 18 分钟音频 进度 / 取消 / 切页回来 / TXT·SRT 导出 | PASS，2 P3（切页回来丢文件名；取消后无「已取消/部分」标识） |
| 自由发掘 | 2 P3（听写进行中 `<select>` 无法展开；ko 热键冲突提示 90px 窄列 5 行） |

## 1. 构建与环境

| 步骤 | 结果 | 备注 |
| --- | --- | --- |
| `npm install` | 通过（退出码 1） | EBADENGINE（`@electron/get`、`@electron-internal/extract-zip` 要求 Node ≥22.12，本机 20.19）；`node_modules/electron/dist` 缺失，补跑 `node node_modules\electron\install.js` 后正常。与 289 轮相同，环境问题非产品问题 |
| `npm run typecheck` | 通过 | 无错误 |
| `npm run build` | 通过 | electron-vite |
| `npm run pack:dir` | 通过 | `SpeakType.exe` 225,497,088 B，`app.asar` 36,529,079 B（sha256 `D4F7C617…9A74`） |
| 首启下载 `sensevoice-small` | 通过 | `model.int8.onnx` 239,233,841 B（sha256 `C71F0CE0…`，与 `.part.json` 回写的 HF etag 一致），`tokens.txt` 315,894 B |

历史测试资产 `C:\Users\Administrator\tts` 在本 VM 已不存在，本轮重建：`launch.ps1`、`rkey.ps1`（x64 40 字节 INPUT 联合体）、`maketts.ps1`+`texts.json`（SAPI 生成 zh/ko/en wav；为此安装 `Language.TextToSpeech~~~zh-CN/ko-KR` 能力包）、`mock-llm.cjs`、`cdp.cjs`、`cdpfile.cjs`、`winmin.ps1/winfix.ps1/winrestore.ps1`。

## 2. 核心链路回归（PASS 5/5）

UI en（首启系统语言），识别语言 zh，SenseVoice；Notepad 前台焦点每次先截图确认。

| ID | 步骤 | 结果 | 证据 |
| --- | --- | --- | --- |
| T1 | RightCtrl（`Control_R`）按住 ~9s → Notepad | PASS | 落字 `帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复。`（`rctrl` 与 `Control_R` 两种注入各一次）；`dictation finalize: durationMs=8911 voicedMs=4340`；`T1_rightctrl_notepad_landed.png` |
| T2 | Alt+Q 进入 → 连续落 4 句 → Alt+Q 退出 | PASS | 5 条 finalize 间隔 ~8.6s；退出 toast `Hands-free mode ended`；退出后 10s Notepad 无新增；`T2_altq_exit_toast.png`。退出瞬间把进行中的 partial `…明天。` 作为一段落字（finalize-on-stop，与 289 轮一致，按设计） |
| T3 | RightCtrl 会话中 Esc | PASS | toast `Dictation canceled / Nothing was typed`，无 finalize、Notepad 不变；`T3_esc_cancel_toast.png` |
| T3b | 免按模式中 Esc | PASS | toast 走 `handsFreeEndByKey`（"按了其他热键"）文案，免按结束、无落字；`T3b_esc_in_handsfree_toast.png`。文案观察见 §7 P3-290-8 |
| T4 | 选中 `hello this is the original line to be rewritten` → 按住 F8 说指令 → 释放（mock LLM，`polishEnabled=false`） | PASS | 选区替换为 `MOCK-REWRITE-OK`；mock 收到 prompt 含原文 + 口述指令（`T4_mock_llm_request.txt`）；`T4_f8_mock_rewrite_ok.png`。口述指令被截为 `…明天上午之前。`（hold 5.6s < 音频 6.5s，harness 时序，非产品） |

## 3. 专项 a：遗留观察项取证

### 3.1 P3-289-9 冷启动首句缺尾 —— 3/3 完整，**建议不修**

方法：每次 `taskkill` 全部 SpeakType 进程 → `launch.ps1` 冷启 → 等 `sherpa worker started` → Notepad 聚焦 → RightCtrl 按住 8.9s（`zh_pad.wav` 1s 头静音 + 4.46s 语音 + 10s 尾静音）→ 再做一次热启对照。

| run | 启动→worker | worker→按键 | 冷启首句 | 完整 | 热启对照 | 完整 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 5388ms | 27.3s | `帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复` | 是 | 同 | 是 |
| 2 | 5314ms | 18.5s | 同 | 是 | 同 | 是 |
| 3 | 5297ms | **2.7s** | 同 | 是 | 同 | 是 |

finalize：冷 `durationMs=8891/8910/8895 voicedMs=4460/4460/4460`，热 `8890/8894/8896 voicedMs=4460/4460/4440`——冷热 voicedMs 无差异。run3 特意在 worker 就绪后 2.7s 即按键（接近 289 轮"worker 在按键后 2.2s 才起"的场景）仍完整。289 轮 1/2 的缺尾更可能是 fake-mic 循环相位 + 首次会话音频管线未热（289 轮 `voicedMs=3400 vs 4000`），本轮 3 次未复现，**建议不修**；若真机用户反馈仍出现，需 `voicedMs` 显著小于正常值的日志佐证再立案。证据：`A1_coldstart_table.txt`、`A1_coldstart_run{1,2,3}_first_sentence.png`。

### 3.2 P3-289-5 SenseVoice 韩语词内空格 —— 终稿 0/7，**建议不修（模型层，非系统性）**

方法：7 条不同韩语句子由 Heami(ko-KR) SAPI 生成，`language=ko`，RightCtrl 7s 落 Notepad；比对 Notepad 文本、`history.json.raw/text`（三者逐字一致）。

| # | 期望 | 终稿 | (a) 词内多余空格 | (b) 词间缺空格 | (c) 错音节 |
| --- | --- | --- | --- | --- | --- |
| ko1 | 내일 오전에 회의가 있으니까 자료를 미리 준비해 주세요 | 내일 오전에 회의가 있으니까 자료를 미리 준비해주세요. | 0 | 1（준비해주세요，合写可接受） | 0 |
| ko2 | 오늘 날씨가 정말 좋아서 공원에서 산책을 했습니다 | 完全一致 | 0 | 0 | 0 |
| ko3 | 이 프로젝트의 마감일은 다음 주 금요일입니다 | 完全一致 | 0 | 0 | 0 |
| ko4 | 저는 한국 음식 중에서 김치찌개를 가장 좋아합니다 | 完全一致 | 0 | 0 | 0 |
| ko5 | 회의록을 정리해서 오늘 저녁까지 이메일로 보내 주세요 | 페이록을 정리해서 … 보내주세요. | 0 | 1 | 2（회의록→페이록） |
| ko6 | 새로운 기능을 추가하기 전에 사용자 피드백을 먼저 확인해야 합니다 | 完全一致 | 0 | 0 | 0 |
| ko7 | 지하철역에서 만나서 함께 점심을 먹으러 갑시다 | … 먹으러 갑시라라. | 0 | 0 | 2（갑시다→갑시라라） |

- 终稿（落字 + history）**7/7 无词内多余空格**，4/7 逐字正确，2 条有音节识别错误（模型/合成语音口音问题，与空格无关）。`language=auto` 重跑 ko1 结果与 `ko` 相同。
- **实时字幕（partial）确有词内拆分**：ko1 `내일 오전 에 회의가.`、ko3 `프로젠트 의 마감 일은은 다음 음 주 금요일`、ko6 `기능 을 … 전 에 … 피드백 을`、ko7 `지하철역 에서 만 나서`——这是 SenseVoice 流式中间结果的特征，最终 decode 会收敛。289 轮看到的空格样本来自转录页（`transcribe.ts` 按静音切片后逐片 decode，短片段更接近 partial 行为），本轮转录页未跑韩语长音频，**该路径仍未覆盖**。
- 结论：听写终稿不系统 → **建议不修** `collapseCjkSpaces` 对韩语的豁免；不建议加"单字+助词合并"正则（会误伤正字法空格）。若要改善观感，方向是字幕层（partial）不做处理、转录页对 ≤2 音节碎片做合并，需先在转录页跑 ≥10 条韩语长音频量化再定。证据：`A2_korean_table.txt`、`A2_korean_all_raw_text.json`、`A2_korean_ko1-7_notepad_final_zoom.png`、`A2_korean_ko3_live_caption_split.png`。

## 4. 专项 b：#380 未覆盖边界（PASS 13/14）

| ID | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| B1 | zh-TW 词典加 2 个谚文词 → 提示 `2` → 删 1 → `1` → 删完 → 消失 | PASS | `dict.notCorrected` 实时计数；`B1_zhTW_dict_hint_count2_zoom.png` |
| B1 | ko 同流程 | PASS | `B1_ko_dict_hint_count2_zoom.png` |
| B2 | 注入 durationMs = 8s / 2min / 1h2m 三条 → zh-TW History | PASS | `8 秒 / 2 分鐘 / 1 小時 2 分`；`B2_zhTW_duration_1h2m_zoom.png` |
| B2 | 同 → ko | PASS | `8초 / 2분 / 1시간 2분`；`B2_ko_duration_1h2m_zoom.png` |
| B2 | 首页统计卡单位 zh-TW/ko | PASS | `2 分鐘 / 10 秒`、`2분 / 10초`（289 轮 P3-289-2 已修） |
| B2 | legacy 无 `personaId` 条目名 `默认风格` 在 zh-TW/ko 下 | PASS | 保持存储名 `默认风格`；内置 `personaId=default` 显示 `預設風格` / `기본` |
| B3 | 新建自定义人设 `QA自定義人設290` → 选中 → 落字 → History 元信息 | PASS | `18:32 · QA自定義人設290 · 9 秒 · 本地離線`；`B3_custom_persona_history_meta_zoom.png` |
| B3 | 搜索 `QA自定` / `自定義` | PASS | 均命中 |
| B3 | 搜索简体 `自定义` | **FAIL** | 无结果；对照 `人设`→`人設` 命中。`zhNorm.ts` PAIRS 无 `義→义`（有 `設→设`）→ P3-290-4；`B3_search_simplified_zidingyi_NO_MATCH.png` |
| B3 | 导出 zh-TW / en / ko | PASS | 自定义名三语原样 `QA自定義人設290`；`B3_export_ko.md` |
| B3 | 切 UI 语言 en / ko 后 History/人设页 | PASS | 自定义名不变，内置名随语言 |
| B3 | 重命名人设 → History 旧记录 | 观察 | 仍显示旧名 `QA自定義人設290`（`personaName` 落字时快照）。按设计"记录当时用的人设"可接受；但用户改名后历史不跟随，是否要按 `personaId` 反查现名值得产品拍板（见 §7 观察） |
| B3 | 删除人设 → History | PASS | 名字保留，`settings.personaId` 回落 `default` |
| B4 | 旧 history（3 条无 personaId `默认风格` + 23 条 `personaId=default` + 1 条自定义）zh-CN / en 导出全文 | PASS | zh-CN：26×`默认风格`+1 自定义；en：3×`默认风格`(legacy 原样)+23×`Default`+1 自定义；BOM `EF BB BF`；`B4_export_mixed_legacy_en.md` |

## 5. 专项 c：存储错误路径 + History 修正五语

### 5.1 模型下载存储错误

| ID | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| C1a | 备份并移走 SenseVoice 目录，对 `models\` 加 `icacls /deny Administrators:(OI)(CI)W` → 点下载 | PASS | <1s 卡片红字，四语文案逐字正确：zh-CN `下载失败：无法写入模型目录，请检查磁盘空间与文件夹权限。` / zh-TW `下載失敗：無法寫入模型目錄…` / ko `다운로드 실패: 모델 폴더에 쓸 수 없습니다…` / en；切 UI 语言时错误行即时重译无需重试；main.log 仅 1 条 `download source failed` + `local model sensevoice-small download failed`（存储错误短路，不再试第 2/3 源，符合 `isStorageError` 设计）；无 `.part` 残留；`C1_zhTW_errStorage_zoom.png`、`C1_ko_errStorage_zoom.png` |
| C1b | 去掉 DENY → 不重启直接点重试 | PASS | ~3s 下载完成、sha256 一致、`sherpa worker started`、RightCtrl 落字成功 |
| C1c | 20MB VHDX 挂为 `X:`，`models` 目录 junction → `X:\models` → 点下载 | **FAIL → P1-290-1** | 进度到 3% 时弹 Electron 原生 `Error` 框 `ENOSPC: no space left on device, write / Log: …main.log`，点 OK 后**进程退出**；卡片从未显示本地化 `download.errStorage`；main.log 只有 `[error] uncaughtException Error: ENOSPC…`，**没有** `download source failed` / `download failed`；残留 `model.int8.onnx.part`(9,549,247 B) + `.part.json`。`P1_ENOSPC_native_errorbox.png`、`P1_ENOSPC_after_OK_app_exited.png`、`P1_ENOSPC_mainlog.txt`、`P1_ENOSPC_leftover_part.txt` |
| 还原 | 移除 junction、detach VHDX、删 DENY、目录/文件还原、哈希比对、重启 worker | 已核对 | `hash_final.txt`、`icacls_final.txt`（在 `r290\phase2\C1_download\`） |

### 5.2 History「修正」五语（PASS 5/5）

en `Correct` / zh-CN `纠错` / zh-TW `糾錯` / ja `修正` / ko `교정`。每语：点按钮 → textarea 自动聚焦、预填原文 → 改一个 2-6 字中文词 → 保存 → 出现 `history.hotwordAsk` 紫色 chip（词精确）→ 点"加入词典" → `settings.hotwords` 新增；Esc / 取消 / 未改动保存 三种退出均不改数据、不出 chip。ko 下修正韩语条目（`페이록`→`회의록`）保存成功但**不出 chip**——`suggestHotword` 只识别 `[\u4e00-\u9fff]{2,6}` 与 ASCII 词，按设计（韩语不在自动纠错范围，与词典提示一致），无解释文案属可接受。证据：`C2_ja_correct_chip.png`、`C2_ko_korean_entry_no_chip.png`，全量在 `r290\phase2\C2_correct\`。

## 6. 专项 d：820px 深色 zh-TW/ko 走查 + 转录长音频 + 自由发掘

### 6.1 设置 4 tab + 五页（820×720，theme=dark）

| 项 | 结果 | 备注 |
| --- | --- | --- |
| zh-TW 通用 / 語音識別 / AI 潤色 / 關於 全滚动 | PASS | tab 条单行；无截断/重叠；`關於` 显示 `SpeakType 0.17.0 (f1e651d)` |
| ko 4 tab 全滚动 | PASS | `D1_ko_dark820_settings_general.png` |
| `select option` 深色可读性（界面语言/主题/热键下拉） | PASS | option bg `rgb(35,39,52)` fg `rgb(228,232,241)` |
| 焦点环 / 琥珀·紫色提示块深色重映射 | PASS | 人设页琥珀提示 fg `oklch(0.8 0.13 80)` bg `rgb(51,43,27)` |
| 词典谚文提示深色 zh-TW/ko | PASS | fg `rgb(163,173,195)` bg `rgb(43,48,64)`，2 行 |
| 首页 Alt+1..9 提示 zh-TW/ko | PASS | 单行（289 轮 P3-289-3 已修） |
| History / 转录 页 zh-TW/ko | PASS | |
| 人设页「依應用程式自動切人設」区块按钮 | **FAIL → P2-290-2** | `新增規則` 46×78px 竖排 4 行（每行 1 字）；ko `규칙 추가` 48×78；en `Add rule` 48×46 两行；浅色同样复现 |

### 6.2 转录页 18 分钟音频（`zh_pad.wav`×65 = 1080.3s，UI zh-CN，SenseVoice）

| 项 | 结果 | 备注 |
| --- | --- | --- |
| 解码态文案 `正在解码音频…` | 未测（<1s 不可观察） | |
| 进度单调、运行中 ≤99、完成 100；进度条宽度 == 文案百分比 | PASS | 8→42→56→71→85→100，段数 5→28→37→47→56→65 实时增长；18 分钟音频 ~37s 完成；`D2_transcribe_progress_samples.txt`、`D2_transcribe_working_76pct.png` |
| 完成态 | PASS | `共 65 段 long_zh_18min.wav · 2026/9/3 19:23:26`；main.log `file transcribe started (1080.3s, model=sensevoice-small)` / `done (65 segments)`；history +1 条 `source=file durationMs=1080280`；`transcribe-last.json` 65 段 |
| TXT / SRT 导出 | PASS | 走原生另存为对话框；两文件 BOM `EF BB BF`；SRT 65 条序号连续、`HH:MM:SS,mmm`、start<end 单调 |
| 21% 时点「取消」 | PASS（有 P3-290-6） | <1s 进度行消失、无错误、无 `done` 日志、history 不变、`transcribe-last.json` mtime 不变；页面立即可用。但页面显示 `共 15 段 long_zh_18min.wav`，**无任何"已取消 / 部分结果"标识**，与完成态仅差一个时间戳；`D2_transcribe_after_cancel_partial_kept.png` |
| 运行中切到首页 ~10s 再回来 | PASS（有 P3-290-5） | 接上 `转录中… 45%` 30 段并跑完；但拖放框副标题显示格式提示 `支持 mp3 / wav / …` 而非文件名；`P3_transcribe_reattach_no_filename_zoom.png` |
| 超时长（>3h）守卫 | 未测 | 非必做 |

### 6.3 自由发掘

| 项 | 结果 | 备注 |
| --- | --- | --- |
| ko 深色 人设 新建 `QA다크290` → 改名 → 两步确认删除 | PASS | 弹窗/输入框可读、焦点环可见，`personas=0` |
| 热键冲突：改写键设为 RightCtrl（= 按住说话键） | PASS（有 P3-290-7） | 行内琥珀警告 `누른 채 말하기 키와 같아 다시 쓰기가 비활성화됩니다. 다른 키를 선택하세요.`，值持久化；但 ko 下该警告落在 90px 窄列、12px 字 5 行；`D3_ko_hotkey_conflict_warning_zoom.png` |
| 免按听写进行中修改「認識語言」下拉 | **未能执行 → P3-290-3** | SpeakType 前台 + Alt+Q 免按运行时，连点 3 次 `<select>` 均不展开（`document.activeElement` 保持 `BODY`），侧栏导航点击正常；退出免按后下拉正常。`P3_select_not_opening_during_dictation.png` |
| 免按 + SpeakType 自身前台 | 按设计 | 每句 `paste skipped: no input target (fg=…), text kept in history` + toast `입력할 수 있는 창이 없습니다`，100s 内 12 条历史（#380 新增 warn 日志实测出现） |
| 词典页重进（已存 2 个谚文词） | 观察 | 不显示"不参与自动纠错"提示——提示只对本次保存新增的词计数（#380 设计），已有词无提示。可接受，但对"打开词典才发现韩语词没生效"的用户不友好（见 §7 观察） |
| 窗口最小尺寸 | PASS | `MoveWindow(700×500)` 被钳到 client 820×560，布局完好。（`SetWindowPos` 同参数得到 65535 高的窗口——Win32/Electron 无边框窗口怪癖，用户拖拽不可达，不立案） |

## 7. 立案清单

### P1

**P1-290-1 模型下载遇磁盘满（ENOSPC）→ 主进程 uncaughtException → 原生错误框 → `app.exit(1)`，未走本地化存储错误提示，残留 `.part`**
- 复现：让 `%APPDATA%\SpeakType\models` 落在剩余空间 < 模型大小的卷上（本轮 20MB VHDX + junction）→ 设置·语音 → 下载 sensevoice-small。
- 现象：进度 3% 时弹 `Error / SpeakType / ENOSPC: no space left on device, write / Log: …main.log`，点 OK 进程退出。`P1_ENOSPC_native_errorbox.png`、`P1_ENOSPC_after_OK_app_exited.png`。main.log 仅 `[error] uncaughtException Error: ENOSPC: no space left on device, write`，无 `download source failed`（`P1_ENOSPC_mainlog.txt`）。残留 `model.int8.onnx.part` 9,549,247 B + `.part.json`（`P1_ENOSPC_leftover_part.txt`）。
- 根因（源码核对）：`download.ts:162` `const out = createWriteStream(part, …)` 之后只 `try/catch` 了 `reader.read()` / `out.write()` 的同步返回与 `out.end(cb)`，**未监听 `out.on("error")`**；ENOSPC 由 fs 异步回调抛出，WriteStream 触发 `error` 事件无监听 → Node 抛到 `process.on("uncaughtException")`（`index.ts:73`）→ `dialog.showErrorBox` + `app.exit(1)`。`isStorageError` / `download.errStorage` 整条设计好的路径都没机会执行。只读目录（EPERM）之所以通过，是因为 `createWriteStream` 打开文件时就同步失败被 catch 到。
- 建议：`downloadFromUrl` 内把 WriteStream 包成 Promise（`out.once("error", reject)`，写循环里 `await Promise.race([drain, error])`），错误后清理 `.part`（或保留供续传但至少不崩）；同时 `uncaughtException` 兜底不应对下载类错误 `app.exit`。修后用同样 VHDX 手法回归四语文案。

### P2

**P2-290-2 人设页「依應用程式自動切人設 / 新增規則」按钮在 820px 竖排 4 行（zh-TW/ko），en 2 行**
- 复现：任意主题，窗口缩到 820px，人设页滚到「按应用自动切换人设」区块。
- 现象：`新增規則` 46×78px 每行一字；`규칙 추가` 48×78；`Add rule` 48×46 两行。`P2_zhTW_personas_addRule_wrap_zoom.png`、`P2_ko_personas_addRule_wrap4lines.png`、`P2_en_personas_addRule_wrap2lines.png`；CDP 度量 `r290\phase3\D1_dark820\*_personas_addRuleBtn_cdp.txt`。
- 根因：`Personas.tsx:106` 按钮 `rounded-xl border … px-3 py-1.5 text-xs` 无 `shrink-0 whitespace-nowrap`，左侧标题+长说明列把行宽吃满后 flex 收缩按钮。与 289 轮 P2-289-1（History 页头）同类，#380 只修了 History。
- 建议：按钮加 `shrink-0 whitespace-nowrap`，左列 `min-w-0`；顺手全仓 grep `flex items-center justify-between` 下无 `shrink-0` 的按钮一次性收口。

### P3

**P3-290-3 听写进行中主窗口 `<select>` 无法展开（中等置信度，产品侧）**
- 复现：SpeakType 主窗前台 → Alt+Q 进入免按 → 设置·語音 → 点「認識語言」下拉。3 次点击均不展开，`activeElement=BODY`；侧栏导航可点；退出免按后正常。`P3_select_not_opening_during_dictation.png`、`r290\phase3\D3_explore\langswitch_*`。
- 推断：字幕面板 `panelWin.showInactive()` 与每句 `toastWin.showInactive()`（`index.ts:146/162`，always-on-top `screen-saver` 级）反复出现，Chromium 的原生下拉 popup 在窗口失活/其他顶层窗显示时自动关闭。fake-mic 不影响窗口焦点，故判产品侧；但未用真机麦复验，故中等置信度。
- 影响：用户在听写中想改识别语言/麦克风/模型做不到，且没有任何提示。建议：要么听写中把设置页相关控件 `disabled` 并给一句"听写进行中不可更改"，要么 toast/panel 在主窗前台时不重复 show（或用非 popup 的自绘下拉）。

**P3-290-4 History 搜索简繁互通表缺高频字 `義`：搜 `自定义` 搜不到 `自定義`**
- `B3_search_simplified_zidingyi_NO_MATCH.png` vs `B3_search_traditional_zidingyi_match.png`。`shared/zhNorm.ts` PAIRS 为手工高频表（fail-open），缺 `義/义`（`意義/會議/定義/主義` 都常见），同批抽检 `設→设` 在表。
- 建议：主进程已依赖 `opencc-js/t2cn`（`main/asr.ts`、`main/transcribe.ts` 的强制简体），渲染层搜索归一直接复用 `t2cn` 全表，删掉手工表；或最少补 `義义`，并用 opencc 全表 diff 一次找出手工表其余缺字。

**P3-290-5 转录页运行中切页再回来，拖放框副标题丢失文件名**
- `P3_transcribe_reattach_no_filename_zoom.png`：回来后 `转录中… 45%` 下方显示 `支持 mp3 / wav / m4a / ogg / flac 等…` 而非 `long_zh_18min.wav`。`Transcribe.tsx:241` 用组件本地 `fileName`（重挂载后为空）而非 `state.fileName`。建议 `state.fileName || fileName`。

**P3-290-6 转录取消后无「已取消 / 部分结果」标识，与完成态几乎不可区分**
- `D2_transcribe_after_cancel_partial_kept.png`：21% 取消后显示 `共 15 段 long_zh_18min.wav` + 复制/TXT/SRT，与完成态只差末尾时间戳；`cancelTranscribe()` 只 `push({running:false})`，percent 停在 21 却不再渲染进度条；main.log 也没有 cancel 行（只有 `started` 没有 `done`）。用户很容易把 15 段当成全文导出。建议：取消后头部加 `（已取消，21%）` 或 `transcribe.partial` 标签，并 `log.info("file transcribe cancelled at N%")`。

**P3-290-7 ko 热键冲突警告在 90px 窄列 5 行 12px**
- `D3_ko_hotkey_conflict_warning_zoom.png`、`ko_hotkey_conflict_warning_cdp.txt`（fg `oklch(0.76 0.15 70)` on `rgb(28,31,42)`，对比度足够）。警告挂在右侧 `<select>` 所在列下方，被列宽限制。建议警告块跨整行（`col-span-2` / 放到下一行 `basis-full`）。

**P3-290-8 免按模式中按 Esc 使用「按了其他熱鍵…」文案**
- 行为正确（免按结束、无落字），但 Esc 在产品语义里是"取消"，用户按 Esc 期望看到"已取消"，看到"按了其他热键"会疑惑是不是误触。`dictation.ts cancel()` 对 `wasHandsFree` 直接复用 `handsFreeEndByKey`。建议给 Esc 单独一条 `handsFreeEndByEsc`（"已按 Esc 结束免按模式"）；低成本，五语各加一句。

### 附：本轮确认的"按设计 / 不立案"行为与待产品拍板项
- Alt+Q 句中退出把进行中 partial 作为一段落字（finalize-on-stop）。
- 免按 + SpeakType 自身前台 → 每句 `paste skipped` + toast + 入历史（#380 日志实测出现）。
- 词典提示只对"本次保存新增的假名/谚文词"计数，页面重进不显示（#380 设计）。**建议产品考虑**：已有假名/谚文词在词条 chip 上加小标识（如灰色 `未纠错`），比一次性提示更诚实。
- 自定义人设改名后历史旧记录仍显示旧名（`personaName` 快照）。**建议产品拍板**：是"记录当时名字"还是"按 personaId 反查现名"，二者都合理但应在导出说明里写清。
- 韩语修正不出词典建议 chip（`suggestHotword` 只认中文/ASCII），与词典"不参与自动纠错"一致。
- `SetWindowPos` 700×500 得到 65535 高窗口：Win32/Electron 无边框窗口对小于 minHeight 的 `SetWindowPos` 的怪癖，用户拖拽不可达，`MoveWindow` 正常钳制；不立案，记入 SKILL。

## 8. 未测 / 局限

- 韩语**转录页**长音频空格统计（289 轮样本来源）本轮未跑，仅覆盖听写终稿；建议下轮 ≥10 条韩语长音频过转录页再决定是否做碎片合并。
- ENOSPC 在 Parakeet / VAD / 标点增强包下载路径未单独复现（同一 `downloadFromUrl`，推断同样受影响，未实测）。
- 转录页 `正在解码音频…` 态、>3h 守卫、mp3/m4a 解码路径未测（仅 WAV）。
- P3-290-3（听写中下拉不展开）未用真机麦复验。
- 首启引导流只在 Phase 1 首次启动看了一眼（英文首页 + 下载按钮），未做五语走查。
- 冷启动 3 次均在本 VM（SSD、无杀软扫描），慢盘/杀软环境的 worker 冷启时间未覆盖。
- `npm install` 的 audit 结果本轮未记录。

## 9. 清理与还原（已核对）

- 模型：`models\sensevoice-small` 仅一份，`model.int8.onnx` sha256 `C71F0CE0…` 与下载时一致；DENY ACL 已移除（`icacls_final.txt`）；junction 已删、VHDX 已 detach 并删除；`X:` 不存在。
- hosts 未修改；Windows 防火墙未开启；`app.asar` 未动（哈希同 §1）。
- `history.json` 还原为注入/测试前版本（sha256 一致，23 条，0 条 file 来源）；`transcribe-last.json` 删除（测前不存在）；hotwords 0、personas 0、`personaId=default`、`hotkeyRewrite=F8`、`theme=system`、`uiLanguage=zh-CN`、`language=zh`、`localModel=sensevoice-small`、`polishEnabled=false`；窗口尺寸还原 1100×688。
- 测试导出（Downloads）、18 分钟长 wav、测试人设/热词全部删除；mock LLM 已停；应用最终重启 `sherpa worker started (sensevoice-small)` 无 error/warn（`r290\phase3\mainlog_final_relaunch.txt`）。
- GitHub Actions 保持禁用（未触碰 `.github`）。

## 10. 下一步 / 需注意

- 下一步（建议第 291 轮修复项）：**P1-290-1** 必修（WriteStream error 监听 + 不 `app.exit`），修后用 VHDX 手法回归 zh-CN/zh-TW/ko/en 四语文案与 `.part` 清理；P2-290-2 与 P3-290-5/6/7/8 均为小改可同 PR；P3-290-4 建议直接换 opencc `t2cn`；P3-290-3 先用真机麦复验再定方案。
- 需注意：`main.log` 对"取消转录"无记录、对 ENOSPC 无下载侧 warn，排障只能靠 uncaughtException 行；Node 20 与 Electron 43 engines 声明不符依旧（建议 CI-less 环境统一 Node ≥22）。

## 11. 附带提交

- `.agents/skills/testing-speaktype-desktop/SKILL.md` 新增"Round 290 learnings"：SAPI 语音包生成 zh/ko wav、VHDX+junction 造 ENOSPC 与 DENY ACL 造 EPERM 的配方与还原顺序、Electron CDP 无 `Browser.setWindowBounds` 改用 Win32 `MoveWindow`（勿用 `SetWindowPos`）、`DOM.setFileInputFiles` 喂转录页文件、导出走原生另存为、听写中 `<select>` 不展开的规避、韩语终稿 vs partial 的判读原则。
