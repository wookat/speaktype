# 第 289 轮严格体验官验收报告（user-experience-officer + qa-engineer）

- 被测版本：`main@c740374`（v0.17.0，含 PR #377 六个 P3 修复 + PR #378 日文窄窗/History 对比度/Alt+Q 退出文案分离）
- 被测形态：`desktop/release/win-unpacked/SpeakType.exe` 打包版（本机 `npm install → typecheck → build → pack:dir` 产出，非 dev）
- 环境：Windows Server 2022，1280×720，Node v20.19.0 / npm 10.8.2（EBADENGINE 警告，Electron 要求 ≥22.12，构建仍成功），Electron 43.3.0，electron-builder 26.15.3，系统 locale en-US，`%APPDATA%\SpeakType` 从零开始
- 手法：Chromium fake-mic（`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`，wav 为 msedge-tts 生成 + 1s 头/10s 尾静音 padding）+ SendInput 扫描码合成热键（`rkey.ps1`，RightCtrl 用 `Control_R` 扩展码）+ 本地 mock OpenAI（127.0.0.1:18099）+ 改 `app.asar` 三源 URL 指向 `127.0.0.1:1`（测后哈希还原）+ Chrome for Testing 扮演手机页（CDP `Input.dispatchMouseEvent`，Notepad 不失焦）+ CDP 轮询 toast 窗 DOM 度量 + `main.log` / `speaktype.json` / `history.json` 落盘证据
- 录屏（三段连续、带标注）：`C:\Users\Administrator\screencasts\round289-phase1\round289-phase1-edited.mp4`（核心回归 + 专项 a）、`...\round289-phase2\round289-phase2-edited.mp4`（专项 b + d）、`...\round289-phase3\round289-phase3-edited.mp4`（专项 c）
- 全量证据 172 件在 `C:\Users\Administrator\evidence289\`；关键 56 件随本报告提交到 `docs/reviews/round289/`
- 未改产品代码、未建 PR、GitHub Actions 保持禁用、防火墙未开启、hosts 未动；仅推报告分支 `review/round289-report`（含 SKILL.md 第 289 轮学习）

## 0. 结论

**c740374 打包版本轮全部专项与核心链路实测通过，无 P0/P1；新立 1 个 P2（ja 820px History 页头折行）+ 8 个 P3。** #377 的三项被点名验证均成立：模型下载错误按模型隔离（SenseVoice/Parakeet 双向互不污染）、真残片 Resume 百分比正确且续传后哈希一致、官方 relay 手机页在桌面 finalize / error / Esc 取消 / busy 各终态下均不再停留"识别中"（释放→空闲 831ms，Esc 取消→按钮复位 56ms）。#378 的 Alt+Q（`handsFreeEndByToggle`）与其他热键（`handsFreeEndByKey`）两套退出文案在 zh-TW / ja / ko 均正确区分，toast 窗无截断（ja ByKey 三行恰好触顶 line-clamp-3，但 sh==ch 无溢出、无省略号）。#274/#275 的 ko 截断未复现。

| 区块 | 结果 |
| --- | --- |
| 构建 / 打包 / 首启下载 SenseVoice | PASS（HF 直连约 9s，进度条 54% 截图） |
| 核心链路（RightCtrl / Alt+Q 进出 / Esc / F8 mock 改写 / 空闲 Esc 透传） | PASS（6/6），附 1 条冷启动首句缺尾观察（P3-289-9 待复现） |
| 专项 a 下载三源全屏蔽报错 / 可重试 / 真残片 Resume / 单模型 error 过滤（双向） | PASS（6/6），存储错误路径未测 |
| 专项 b zh-TW / ja / ko × Alt+Q 句间 / Alt+Q 句中 / RightCtrl / Esc 退出 toast | PASS（12/12），像素 + DOM 度量均无截断 |
| 专项 c 官方 relay 手机页 配对 / 成功 / 无焦点 / 无模型 / 桌面 Esc / busy / 断连重连 | PASS（8/8） |
| 专项 d 深色 + ja/ko 五页走查 + 820px + 词典增删 + 转录 + 托盘 + 键盘焦点 | 1 P2 + 7 P3（见第 7 节） |

## 1. 构建与环境

| 步骤 | 结果 | 备注 |
| --- | --- | --- |
| `npm install` | 通过（退出码 1） | 428 包；EBADENGINE（Node 20.19 < 22.12）；audit 2 漏洞（moderate `@xmldom/xmldom`、high `fast-uri`）未处理；`node_modules/electron/dist` 缺失，补跑 `node node_modules\electron\install.js` |
| `npm run typecheck` | 通过 | 无错误 |
| `npm run build` | 通过 | electron-vite `✓ built in 2.49s / 2.28s` |
| `npm run pack:dir` | 通过 | `SpeakType.exe` 225,497,088 B，`app.asar` 36,514,134 B（sha256 `3A0DD2E0…D001FC`） |

历史测试资产目录 `C:\Users\Administrator\tts` 在本 VM 已不存在，本轮重建：`launch289.ps1`（打包版 + fake-mic + CDP 9333）、`rkey.ps1`（40 字节 x64 INPUT 联合体 SendInput）、`tts289.mjs`（msedge-tts zh/en/ja/ko × ffmpeg 16k mono padding）、`mock_llm.cjs`、`toastpoll.cjs`、`cdp_phone.cjs`、`hf_exit.ps1`、`asar_swap.ps1`、`resize.ps1`、`fgwin.ps1`。这是环境差异，不是产品问题。

## 2. 核心链路回归（PASS 6/6）

| ID | 步骤 | 结果 | 证据 |
| --- | --- | --- | --- |
| T1 | 首启 → 设置·语音 → 下载 sensevoice-small | PASS | 点击 10:37:56.9 → `local model sensevoice-small downloaded` 10:38:05.774，`download source failed` 0 条（HF 直连成功）；`model.int8.onnx` 239,233,841 B、`tokens.txt` 315,894 B；`T1_downloading_54pct.png`、`T1_model_ready.png` |
| T2a | RightCtrl 按住 ~6s → Notepad | PASS | 第 2 次完整落字 `帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复。`；`dictation finalize: durationMs=6919 voicedMs=4000`；history `d81a576d…`；`T2a_rightctrl_notepad_second_full.png`。第 1 次（冷启动）缺尾句，见 P3-289-9，`T2a_rightctrl_notepad.png` |
| T2b | Alt+Q 进入 → 落 2 句 → Alt+Q 退出 | PASS | 退出 toast `Hands-free mode ended / Continuous dictation stopped…` 10:42:00.876→04.825（en UI）；退出 12s 后 Notepad 不再变化；`T2b_handsfree_exit_toast.png` |
| T2c | 会话中 Esc | PASS | Notepad 为空、toast `Dictation canceled / Nothing was typed` 2.5s、无 finalize、history 数不变；`T2c_esc_cancel_toast.png` |
| T2c' | 空闲时 Esc 透传 | PASS | Notepad File 菜单被 Esc 关闭，无 toast、无日志 |
| T2d | 选中 `hello world rewrite me` → 按住 F8 说指令 → 释放（mock LLM） | PASS | 选区被替换为 `MOCK-REWRITE-OK-289`；mock 收到的 prompt 含选区原文 + 口述指令（`T2d_mock_request.json`）；`polishEnabled=false` 下 F8 仍走 `polishBaseUrl`；`T2d_f8_before_selected.png`、`T2d_f8_after_mock_rewrite.png` |

## 3. 专项 a：本地模型下载失败 / 续传 / 单模型 error 过滤（PASS 6/6）

屏蔽手法：解包 `app.asar` → `out/main/index.js` 中 `https://huggingface.co/`、`https://hf-mirror.com/`、`https://github.com/wookat/speaktype/releases/download/models-v1/` 三前缀替换为 `https://127.0.0.1:1/...` → `asar pack --unpack-dir` 重打 → 换入 → 测后换回原包并 `Get-FileHash` 比对一致（`T3_asar_restore.txt`）。未用 hosts、未用防火墙。

| ID | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| A1 | Parakeet 三源全失败 | PASS | <1s 卡片红字 `Download failed: network error — check your connection and try again.`；main.log 10:47:22.070–.073 三条 `download source failed: https://127.0.0.1:1/{hf,mirror,gh}/…encoder.int8.onnx TypeError: fetch failed` + `local model parakeet-tdt-0.6b-v3 download failed`；`T3a_parakeet_error_first.png` |
| A2 | 点重试 | PASS | 10:47:46.303 再次三源失败、同一错误文案，按钮仍可点；`T3a_parakeet_error_after_retry.png` |
| A3 | Parakeet 失败时 SenseVoice 卡片 / 首页 / 转录页 | PASS（过滤生效） | SenseVoice 卡 `Model ready` 无红字，首页无横幅，转录页无横幅；`T3a_sensevoice_card_clean_after_parakeet_error.png`、`T3a_home_clean.png` |
| A4 | 反向：SenseVoice 目录移走 → SenseVoice 三源失败 | PASS | 首页横幅显示 SenseVoice 的错误；切到 Parakeet chip 错误行消失；设置页 Parakeet 卡为干净的 `Download model`，SenseVoice 卡保留自己的错误；`T3a2_home_sensevoice_error.png`、`T3a2_parakeet_card_clean.png`、`T3a2_sensevoice_card_own_error.png` |
| A5 | 真残片 Resume 百分比 | PASS | 本 VM 下载约 130MB/s（Parakeet 670MB 约 20s）无法中途杀进程，改为：完整下载并哈希 `encoder.int8.onnx` 后截取前 200,000,000 字节为 `.part` + `.part.json {"url":<HF url>,"total":652184281}`，删除其余 3 文件重启 → 首页与设置均显示 `Resume download (29% done)`（= floor(200,000,000 / 670,478,772 × 100)，按 4 文件总大小加权）；`T3b_home_resume_29pct.png` |
| A6 | 续传正确性 | PASS | 点 Resume 首帧进度 42%（≥29%，未从 0 开始）；`.part` 200,000,000 → 586,562,484 → 652,184,281；`.part.json` 被回写 `etag`=HF sha256；10:53:29.134 `downloaded`；续传后 `encoder.int8.onnx` sha256 `ACFC2B44…2247` 与截断前完全一致；`T3b_resume_first_progress_42pct.png`、`T3b_parakeet_ready_after_resume.png` |
| A7 | 存储错误（EACCES/ENOSPC）立即抛出 | 未测 | 可选项，本轮略 |

备注：main.log 不打印 Range 头，续传证据为"首帧进度 ≥ 残片百分比 + `.part` 从 N 增长 + 终态哈希一致"三角验证。

## 4. 专项 b：zh-TW / ja / ko 免按退出 toast（PASS 12/12）

toast 窗 520×92；标题 `shrink-0` 单行 24px，正文 `line-clamp-3 leading-5`（20px/行，上限 60px）。度量来自 CDP 轮询（`P2_toast_summary.txt`），截断判定同时看像素缩放图。`uiLanguage` 在设置页切换后主进程 toast 即时生效，无需重启。

| 语言 | 退出方式 | 标题（行数/宽） | 正文（行数 / sh=ch / 宽） | 截断 | 证据 |
| --- | --- | --- | --- | --- | --- |
| zh-TW | Alt+Q 句间空档 | `免按模式已退出` 1 行 100px | `連續聽寫已停止；再按免按熱鍵可重新開始` 1 行 20=20 272px | 无 | `P2_zhTW_toggle_gap_toast_zoom.png` |
| zh-TW | Alt+Q 句中 | 同上 | 同上（句中部分 `帮…` 作为一段落字） | 无 | `P2_zhTW_toggle_mid_*` |
| zh-TW | RightCtrl | 同上 | `按了其他熱鍵，連續聽寫已停止；再按免按熱鍵可重新開始` 1 行 372px | 无 | `P2_zhTW_rctrl_toast_zoom.png` |
| zh-TW | Esc | 同上 | ByKey 文案，无新落字 | 无 | `P2_zhTW_esc_*` |
| ja | Alt+Q 句间 / 句中 | `ハンズフリーモードを終了しました` 1 行 229px | `連続入力を停止しました。ハンズフリーキーで再開できます` 2 行 40=40 | 无 | `P2_ja_toggle_gap_toast_zoom.png` |
| ja | RightCtrl / Esc | 同上 | `他のホットキーが押されたため連続入力を停止しました。ハンズフリーキーで再開できます` **3 行 60=60**（恰达 clamp 上限，无省略号、三行全部可见在胶囊内） | 无 | `P2_ja_rctrl_toast_zoom.png`、`P2_ja_rctrl_toast_full.png` |
| ko | Alt+Q 句间 / 句中 | `핸즈프리 모드 종료` 1 行 123px | `연속 받아쓰기를 중지했습니다. 핸즈프리 단축키로 다시 시작할 수 있습니다` 2 行 40=40 361px | 无 | `P2_ko_toggle_gap_toast_zoom.png` |
| ko | RightCtrl / Esc | 同上 | `다른 단축키가 눌려 연속 받아쓰기를 중지했습니다. 핸즈프리 단축키로 다시 시작할 수 있습니다` 2 行 sw==cw | 无（#274/#275 未复现） | `P2_ko_rctrl_toast_zoom.png`、`P2_ko_rctrl_toast_full.png` |

设计余量提示（非缺陷）：ja ByKey 正文已用满 3 行，若日后再加长该文案或在 ja 下加入 action 按钮会触发 `line-clamp` 省略。

## 5. 专项 c：官方 relay 手机页终态同步 E2E（PASS 8/8）

线上页 `https://speaktype.zalize.com/relay/app` 源码含 `let acked = false`（#377 已部署，`P3_relay_app_deployed.html`）。桌面端设置·手机麦克风 = 官方中转，配对码 `4ae9b10c9f08`（= `settings.remoteRelayRoom`），main.log `remote mic relaying via https://speaktype.zalize.com/relay/m/4ae9b10c9f08?lang=zh-CN`。手机 = Chrome for Testing（fake-mic `zh_pad.wav`，420×800），按住/释放经 CDP 鼠标事件注入，`cdp_phone.log` 每 150ms 记录 `#state/#partial/#talk/rec`。

| ID | 场景 | 结果 | 关键时序 / 证据 |
| --- | --- | --- | --- |
| C0 | 配对 | PASS | 手机 `已连接电脑` 按钮可用；桌面 `已连接 1 台设备`；`P3_desktop_pairing_qr_code.png`、`P3_C0_paired_*` |
| C1 | 成功：按住 7s → 释放（Notepad 焦点） | PASS | mousedown +148ms `录音中…`；partial 每 ~1.2s 流式更新 4 次至整句；mouseup 11:46:47.778 → `转写中…` .840 → `润色中…` 48.149 → `已连接电脑` 48.609（**释放→空闲 831ms**），按钮回 `按住说话` rec=false；Notepad 落整句；history `source:"phone"`；`P3_C1_success_phone_idle_notepad_landed.png`、`P3_C1_cdp_phone.log` |
| C2 | 失败：无可输入窗口（前台 `Progman`） | PASS | 桌面 toast `当前没有可输入的窗口 / 内容已保存到历史，可从历史页复制。` 4s；history 新增 phone 条目；手机 `转写中…` → `已连接电脑`（释放后 379ms），按钮复位，任何窗口未落字；`P3_C2_notarget_toast_phone_idle.png`、`P3_C2_cdp_phone.log` |
| C3 | 失败：无模型（运行中移走 SenseVoice 目录） | PASS | 按下 143ms 内手机 `#state` = `本地模型还没下载：请在设置 → 语音识别中点“下载模型”`（桌面 `m.message` 透传）且按钮在仍按住时即复位；桌面 toast `语音识别尚未配置 / 本地离线模型还没下载 / 去下载模型`；~5s 后手机回 `已连接电脑`；`P3_C3_nomodel_phone_error_desktop_toast.png`、`P3_C3_cdp_phone.log` |
| C4 | 桌面 Esc 打断手机按住（9s 中第 5.7s） | PASS | 桌面 `听写已取消 / 未落入任何文字` 11:54:07.250 → 手机按钮复位 + `已连接电脑` 07.306（**56ms**，早于 mouseup 3.3s）；仅 1 次取消 toast、无 finalize、Notepad 不变；`P3_C4_esc_cancel_toast_phone_reset.png`、`P3_C4_cdp_phone.log` |
| C4b | 紧接第二次按住 | PASS | 完整 C1 序列，释放→空闲 880ms，无 busy 拒绝；`P3_C4b_*` |
| C5 | busy：桌面 RightCtrl 会话中手机按住 | PASS | 手机 148ms 内 `电脑端正在录音，请稍候` 并立即复位按钮（`endHold(true)`）；桌面会话不受影响并落字；`P3_C5_busy_phone_during_desktop_rctrl.png` |
| C6 | 桌面手机麦关/开 | PASS | 关 → 手机 `已连接中转，等待电脑…` 按钮禁用；开 → `已连接电脑` 可用，main.log 新 `relaying via` 行；`P3_C6_remote_off_*.png`、`P3_C6_remote_on_*.png` |

产品行为观察（按设计，供决策参考）：(1) busy 提示停留到桌面会话下一条文字态（`转写中…`，本例 ~7s）而非固定 3s——`recording` 状态在手机页无文案映射；(2) 手机页会显示桌面自身 RightCtrl 会话的 partial（`broadcastToPhones` 不区分来源）；(3) main.log 对"无模型"与"无焦点"两条错误路径均无日志行，取证只能靠 toast/history（P3-289-8）。

## 6. 专项 d：深色 + ja / ko 五页走查（1 P2 + 7 P3）

覆盖：ja → ko 各自 首页（含 4 步引导展开）/ 设置 4 tab 全滚动（AI 润色开/关）/ 历史（注入 失败·手机·文件 三类条目，筛选、再试、导出）/ 词典（增 2 删 1 再增）/ 转录（`ja_pad.wav` / `ko_pad.wav` + 非音频 `.cjs`）/ 820×690 最小宽 / 托盘菜单 / Tab 焦点环。无漏翻英文串、无 key 泄漏；ja 转录整句正确；非音频文件报本地化解码错误且不崩、保留上次结果；托盘 ja `SpeakType を開く / 音声認識の設定 / 終了`、ko 同等正确；深色下焦点环可见。问题见第 7 节。

## 7. 立案清单

无 P0 / P1。

### P2

**P2-289-1 ja 下 History 页头在最小宽度 820px 折行：`履歴` 竖排两行，`エクスポート` / `すべて消去` 词中断行**
- 复现：uiLanguage=ja，窗口缩到 820px（`minWidth`），历史中同时存在 ≥2 种来源（出现来源筛选 `<select>`）→ 打开 履歴。
- 现象：`P4_ja_narrow_history_ISSUE_header_wrap.png` / `_zoom.png`。ko 同宽度可单行（`P4_ko_narrow_history.png`）。
- 根因：`History.tsx:145-201` 页头 `flex justify-between`，`<h1>` 与右侧按钮均无 `shrink-0` / `whitespace-nowrap`；ja 按钮文案更长，flex 收缩时 h1 与按钮被压折。
- 建议：h1 `shrink-0`、按钮 `whitespace-nowrap shrink-0`，右侧工具栏允许换行（`flex-wrap`）或搜索框 `min-w-0 flex-1`。

### P3

**P3-289-2 首页统计卡时长单位硬编码英文 `min` / `h` / `s`（所有语言）**
- `P4_ja_home.png`、`P4_ko_home.png` 显示 `2min` / `9min`；`renderer/src/lib/format.ts:3-9` `fmtDuration(ms, t)` 收了 `t` 却未使用。建议改为 i18n 单位（ja `分`、ko `분`、zh `分钟`）。

**P3-289-3 首页人格卡右侧提示 `Alt+1..9 で切り替え` / `Alt+1..9 로 전환` 在 820px 末字折到第二行**
- `P4_ja_narrow_home.png`（`え` 单独成行）、`P4_ko_narrow_home.png`。建议 `whitespace-nowrap` 或给该列固定最小宽。

**P3-289-4 词典 ja 假名提示在删除全部词后仍残留；ko 谚文无对等提示**
- 加入日文词显示 `1語にかなが含まれています。保存されましたが、自動補正は現在中国語と英単語のみ対応しています。`（诚实提示，OK），但删到 0/300 后提示不消失直到页面重渲染（`P4_ja_dictionary_all_removed_stale_notice.png`）；加入韩文词无任何提示（`P4_ko_dictionary_added_2.png`），而韩文同样不在自动纠正覆盖范围。建议提示随词表变化重算，并对 Hangul 给同等提示。

**P3-289-5 SenseVoice 韩语转录输出词内空格：`내일 오전 까지, 이 제안서 를 수 정해서 팀 장님 께 답변해 주세요.`**
- `P4_ko_transcribe_result.png`。`localasr.ts:269-275 collapseCjkSpaces` 有意不处理韩语（空格属正字法），但模型输出把助词 `를/께/까지` 和词干 `수 정` 拆开，对韩语用户是可见质量问题。同一句经免按听写落字为 `내일 오전까지 이 제안서를 수정해서 팀.`（`P2_ko_toggle_mid_partial_landed.png`），说明与分段/上下文相关。建议：韩语后处理合并"单字 + 助词"空格（`\s(?=[를을이가께는도까지])`）或走 LLM 润色兜底；模型层问题，不阻塞发布。

**P3-289-6 History 人格名按落字时的 UI 语言持久化，切换语言后列表混用 `預設風格 / デフォルト / 기본`**
- `P4_ja_history_2_mixed_persona_names.png`。建议存 `personaId`，渲染时再本地化（内置人格），自定义人格保留原名。

**P3-289-7 标点/间距细节**：ja 语音 tab `字幕を表示; whisper 系は…` 使用半角 `;`（`P4_ja_settings_speech_1.png`）；ko `입력됩니다(오디오는` 括号前无空格。建议 ja 用 `；`/`。`，ko 括号前加空格。

**P3-289-8 "无模型" / "无可输入窗口" 两条错误路径 main.log 无任何记录**
- 专项 c C2/C3 均只能靠 toast 与 history 取证。建议在 `dictation.ts` 这两条分支各加一行 `log.warn`，便于用户反馈时排障。

**P3-289-9（待复现，1/2 次）冷启动首句缺尾：`帮我跟老板说，那个方案需要再改一下，明天上午之前`（缺 `给他答复`）**
- 首次 RightCtrl（下载完模型后的首个会话）`sherpa worker started` 出现在按键后 2.2s，`finalize durationMs=8792 voicedMs=3400`；第二次同一音频 `voicedMs=4000` 整句完整。`T2a_rightctrl_notepad.png` vs `T2a_rightctrl_notepad_second_full.png`。fake-mic 循环位置与 worker 冷启动均可能是原因，建议下一轮在真机麦/冷启动条件下专门复现 3 次再定性；本轮不判为缺陷。

### 附：本轮确认的"按设计"行为（不立案）
- Alt+Q 句中退出会把进行中的 partial 作为一段落字（finalize-on-stop），三语言一致。
- 手机 busy 提示持续到桌面会话下一条文字态而非固定 3s；手机页可见桌面自身会话 partial。
- 词典页无"编辑"操作（只能删后重加）。

## 8. 未测 / 局限

- 存储错误（EACCES/ENOSPC）下载路径；首启引导流（APPDATA 在 Phase 1 之后已非空）；History 条目"修正"按钮；ja 转录进度态（11s wav <1s 完成不可观察，ko 抓到 `전사 중… 0%`）。
- 核心回归 T2b 的 Alt+Q toast 文案在 en UI 下验证（zh-CN 上轮已测）；zh-TW/ja/ko 见专项 b。
- 手机端音频来自 Chrome fake-mic 文件循环（页面只 `getUserMedia` 一次），每次按住前需 reload 页面复位循环，否则可能落在尾部静音（Phase 3 第一次 C2 即因此得到 `没听清`，已判为 harness 问题并重测）。
- 真残片来源为"完整文件哈希后截断"，非中途断网产生；续传逻辑一致但网络中断瞬间的 `.part.json` 写入时序未覆盖。

## 9. 清理与还原

- `release\win-unpacked\resources\app.asar` 已换回原包，sha256 `3A0DD2E02BFA1D6FD9D56A757EC3353FE94464C6D9A48096A3B9CFC2A2D001FC` 与打包产物一致（`T3_asar_restore.txt`）。
- hosts 未修改（sha 未变）；Windows 防火墙三 profile 均为关闭。
- SenseVoice 模型目录还原（大小精确一致）；测试用 Parakeet 目录删除。
- `history.json` 还原为注入前版本（哈希一致，注入版留存 `P4_history_injected_final.json`）；`remoteMicEnabled=false`；mock/CDP/Chrome for Testing/Notepad/SpeakType 全部退出。
- 最终 `speaktype.json`：`uiLanguage=zh-CN language=zh localModel=sensevoice-small asrProvider=local theme=dark remoteMicMode=relay remoteRelayRoom=4ae9b10c9f08 polishEnabled=false`。

## 10. 下一步 / 需注意

- 下一步（建议第 290 轮）：修 P2-289-1 与 P3-289-2/3/6/8（均为小改），随后在 820px × ja/ko/en 三语言回归 History 页头与首页人格卡；P3-289-9 冷启动缺尾用真机麦冷启动复现 3 次定性；P3-289-5 韩语空格先做 10 句样本量化再决定后处理规则（勿拍脑袋加正则）。
- 需注意：`npm install` audit 报 1 high（`fast-uri`）1 moderate（`@xmldom/xmldom`），本轮未动依赖，建议开发侧评估；Node 20 与 Electron 43 engines 声明不符，构建仍通过但建议 CI-less 环境统一到 Node ≥22。

## 11. 附带提交

- `.agents/skills/testing-speaktype-desktop/SKILL.md` 新增"Round 289 learnings"：asar 三源屏蔽/`--unpack-dir` 重打包配方、高速网络下用哈希截断法造真残片、模型目录还原嵌套坑、受控输入丢字用剪贴板、三语 toast 度量基线、PowerShell `$h`/`-H` 大小写陷阱、官方 relay 手机页 CDP 驱动全流程与 fake-mic 循环 reload 坑、history.json 内存覆盖坑、ja/ko 深色走查待复查项。
