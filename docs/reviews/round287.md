# 第 287 轮严格体验官报告（user-experience-officer + qa-engineer）

- 被测版本：`main@24cf503`（v0.17.0，PR #376 已合并：手机麦缺本地模型就地 amber 横幅 + 一键下载；PR #375 已合并）
- 被测产物：`desktop/release/win-unpacked/SpeakType.exe`（本机 `npm run pack:dir` 打包版，非 dev 模式）
- 测试环境：Windows Server 2022（1280×720）、Node v20.19.0、npm 10.8.2、Electron 43.3.0、electron-builder 26.15.3、系统 locale en-US、全新 `%APPDATA%\SpeakType`（首启走查）
- 手法：Chromium fake-mic（`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`）+ msedge-tts 生成的中文语料 + 本地 mock OpenAI 兼容服务（127.0.0.1:18099）+ 独立 Chrome for Testing fake-mic 配置模拟「手机」+ CDP（9333/9444）取证 + 记事本落字目标 + `main.log` / `speaktype.json` / `history.json` 交叉核对
- 录屏：`C:\Users\Administrator\screencasts\r287\r287-edited.mp4`（Part 1：A–C）、`C:\Users\Administrator\screencasts\r287-part2\r287-part2-edited.mp4`（Part 2：D–F）
- 截图/证据目录：`C:\Users\Administrator\screenshots\r287\`（约 300 张，本文件引用的关键图已随报告放入 `docs/reviews/round287/`）
- 约束遵守：未修改任何产品代码；未建 PR、未合并；GitHub Actions 保持禁用；仅推送 `review/round287-report` 分支（本报告 + 测试技能文档 SKILL.md 的经验补充）

## 0. 总体结论

**核心链路与 #376 新横幅全部实测通过，无 P0/P1/P2。** 本轮立案 6 条 P3（其中 1 条落在 #376 直接相关区域：横幅下载按钮白字对比度 3.20:1；其余为既有问题：模型切换时 Speech 卡片进度串号、自动学习对非同音改字承诺「下次自动纠正」但实际不会生效、手机页在电脑端结束/取消后状态标签滞留、en/ja/ko 通用页「静音自动退出」行开关被压扁、浅色提示文字/胶囊对比度不足），另 1 条仓库卫生问题（lockfile 版本号落后）。

| 专项 | 结论 |
| --- | --- |
| A 首启 / 模型 / 语言 | PASS |
| B 核心链路（RightCtrl / Alt+Q / Esc / F8） | PASS（4/4） |
| C #376 横幅边界（切模型 / 关开关 / 断网重试 / 续传 / 门控） | PASS（5/5），附带 1 条既有 P3 + 1 条 a11y P3 |
| D 设置页视觉走查（浅/深 × 5 语言 × 4 tab × 默认/最大化） | 无截断、无 select 裁切；2 条 P3（布局 + 对比度） |
| E 词典 / 自动学习闭环 | PASS（学入/纠正/负例/删除/撤销），1 条 P3 设计缺口 |
| F 免按 + 手机麦交替状态机 + 10 分钟 soak | PASS（F0–F7 + soak），1 条 P3 手机页表现 |

## 1. 构建与环境

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `npm install` | 成功 | EBADENGINE 警告（依赖要求 Node ≥22.12，本机 20.19）；`npm audit` 2 项（moderate `@xmldom/xmldom`、high `fast-uri`），本轮不动依赖；`node_modules/electron/dist` 缺失需补跑 `node node_modules\electron\install.js` |
| `npm run typecheck` | 通过 | 无错误 |
| `npm run build` | 通过 | electron-vite 产物正常 |
| `npm run pack:dir` | 通过 | `release/win-unpacked/SpeakType.exe`，`app.asar` ≈36.5MB，原生模块在 `app.asar.unpacked` |

环境偏差：VM 上历史测试资产（`C:\Users\Administrator\tts\*`、旧 wav、旧 `%APPDATA%\SpeakType`）全部不存在，本轮从零重建：`rkey.ps1`（完整 40 字节 x64 INPUT 结构的 SendInput 扫描码助手）、`launch287.ps1`、`gen287.mjs`（msedge-tts `zh-CN-YunjianNeural` → ffmpeg 16k mono）、`mock_llm.cjs`（支持 `MOCK_DELAY_MS`）、`cdp_phone_hold.cjs`（CDP 驱动手机页按住/松开）。语料：`sample287.wav`（8s 尾静音）、`hf287.wav`（4s 尾静音，免按循环用）、`rewrite287.wav`（F8 指令）、`learn287.wav`（含「答复」）。

## 2. A — 首启 / 模型 / 语言（PASS）

| 用例 | 结果 | 证据 |
| --- | --- | --- |
| 全新 AppData 首启，en-US 系统下首页为英文，提示下载模型 | PASS | `A_firstrun_home_en.png` |
| 一键下载 sensevoice-small（234MB） | PASS（本机网络缓存，~3s 完成） | `A_download_progress.png`、`A_model_downloaded_home.png` |
| 界面语言切 zh-CN、识别语言切 zh，重启后保留 | PASS | `A_ui_language_zhCN.png`、`A_recognition_language_zh.png`，`speaktype.json` `uiLanguage=zh-CN language=zh` |

## 3. B — 核心链路回归（PASS 4/4）

| ID | 用例 | 结果 | 一行证据 |
| --- | --- | --- | --- |
| B1 | RightCtrl 按住 8.8s 说话 → 记事本落字 | PASS | 记事本出现「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复。」；`dictation finalize: durationMs=8880 maxPeak=32767 voicedMs=3400`；history +1（provider local）。`B1_rctrl_notepad_result.png` |
| B2 | Alt+Q 进免按 → 胶囊+实时字幕 → 自动断句 3 句 → Alt+Q 退出 | PASS | 3 条 finalize（7830/9103/9439ms）= 3 条 history；退出 toast「免按模式已退出」，胶囊消失。`B2_handsfree_capsule_active.png`、`B2_handsfree_3_sentences.png`、`B2_handsfree_exit_toast.png` |
| B2-Esc | 免按中途（说话中）按 Esc | PASS | toast 退出，10s 内无新落字、无新 finalize。`B2_esc_capsule_midspeech_before_esc.png`、`B2_esc_nothing_landed_10s.png` |
| B3 | RightCtrl 按住 4s 后 Esc 取消 | PASS | toast「听写已取消 / 未落入任何文字」，无 finalize 行，记事本不变。`B3_cancel_toast.png`、`B3_notepad_unchanged.png` |
| B4 | F8 改写（mock LLM）：选中 `hello world test`，按住 F8 说「把这段话改成正式的语气。」 | PASS | 选区被替换为 `MOCK-REWRITE-OK`；mock 收到的请求同时包含原文与口述指令（`B4_mock_llm_request.txt`）；「测试连接」通过 `B4_mock_llm_test_connection_ok.png`。`B4_f8_rewrite_result.png` |
| B4-Esc | mock 延迟 8s，polishing 阶段按 Esc | PASS（#375 回归） | toast「已取消」，原文不变，`main.log` `[warn] rewrite: This operation was aborted`（预期的中止日志）。`B4_esc_during_polish_cancel_toast.png`、`B4_esc_during_polish_notepad_unchanged.png` |

B4 mock 请求原文（节选）：

```
POST /v1/chat/completions
{"model":"mock-model","temperature":0.3,"messages":[{"role":"user","content":"你按用户的口述指令改写下面这段文字…口述指令：\n\"\"\"把这段话改成正式的语气。\"\"\"\n\n原文：\n\"\"\"hello world test\"\"\""}]}
```

## 4. C — #376 手机麦缺模型横幅边界（PASS 5/5）

方法偏差（必须说明）：本机真实下载 3s 内完成，无法观察「下载中」态；为确定性复现，把 `app.asar` 里三处模型源地址打补丁指向本地限速服务器（2MB/s、支持 Range/206），测完后**恢复原始 app.asar 并验证重启正常**（`C4_original_asar_banner_download_99pct.png`）。「断网」用停掉该本地服务器模拟，走的是与真实断网相同的 `fetch failed` → 网络错误分支，但不是字面意义的物理断网。首次 asar 重打包把 unpacked 原生模块内联导致 sherpa worker 加载失败（`main.log` 23:54:37 `sherpa worker error … Could not find sherpa-onnx-node`），已用 `--unpack-dir` 重打包修正，该 warn 为测试手法造成而非产品缺陷。

| ID | 用例 | 结果 | 一行证据 |
| --- | --- | --- | --- |
| C0 | 删模型 + 本地识别 + 开手机麦 → amber 横幅出现（浅/深） | PASS | 「本地模型尚未下载，手机连上后说话也无法识别，请先下载。」+「下载模型」按钮；深色 `--color-amber-50→#332b1b` 可读。`C0_banner_light.png`、`C0_banner_dark.png`；开关关时无横幅 `C0_speech_tab_no_model_toggle_off.png` |
| C1 | 下载中横幅进度条 / 按钮 disabled | PASS | 「下载中 3%」→「40%」进度条推进，按钮禁用。`C1_banner_downloading_3pct_throttled.png`、`C1_banner_downloading_40pct.png` |
| C1-切模型 | sensevoice 下载中切 localModel 到 tiny-q5_1 | 横幅 PASS / 卡片 **P3-287-2** | 横幅正确对 tiny 重新评估显示「下载模型」；Speech 卡片仍显示 sensevoice 的「下载中 22%」。切回后横幅 69%、卡片 63% 一致。下载完成横幅消失 + toast。`C1_switched_to_tiny_banner_shows_download.png`、`C1_switched_to_tiny_card_shows_stale_22pct.png`、`C1_switched_back_banner_69pct.png`、`C1_download_done_banner_gone_toast.png` |
| C2 | 下载中关手机麦开关 → 横幅消失（卡片继续 9%）→ 再开 → 横幅回到「下载中 15%」 | PASS | `C2_toggle_off_banner_gone_card_9pct.png`、`C2_toggle_on_banner_downloading_15pct.png` |
| C2-续传 | 下载到 26% 时杀进程重启 → 横幅「继续下载（已完成 26%）」→ 点击后 Range 续传 → 完成无 `.part` 残留 | PASS | 限速服务器日志出现 `Range: bytes=N-`；`C2_relaunch_banner_resume_26pct.png`、`C2_resume_continues_29pct.png`、`C2_resume_complete_banner_gone.png` |
| C3 | 三个源全部失败 → 横幅内红字「下载失败：网络连不上，请检查网络后重试。」，按钮恢复可点，重试再次失败仍可读 | PASS | `main.log` 00:04:01/00:04:21 两轮 `download source failed … TypeError: fetch failed` + `local model sensevoice-small download failed`；Speech 卡片同文案。`C3_banner_network_error_red.png`、`C3_speech_card_same_network_error.png` |
| C4 | 模型已下载 + 开关开 → 无横幅；ASR 切 OpenAI 且无模型 → 无横幅；切回本地 → 横幅重现 | PASS | `C4_model_downloaded_toggle_on_no_banner.png`、`C4_openai_provider_no_model_no_banner.png`、`C4_back_to_local_banner_reappears.png` |

## 5. D — 设置页视觉走查（浅/深 × zh-CN/zh-TW/en/ja/ko × 通用/语音识别/AI 润色/关于 × 默认 1100×680/最大化）

- 全部 80 个组合截图 `D_<lang>_<theme>_<default|max>_<n>.png`，CDP 扫描 JSON `D_scan_*.json`（检查 `scrollWidth>clientWidth` 的 button/label/span/option/select、select 选中项是否裁切、文字/背景 WCAG 对比度）。
- **无文字截断/省略、无 select 选中项裁切**（所有语言 × 主题 × tab）；深色下原生 select 弹出框为深底浅字（`optBg rgb(35,39,52)` / `optColor rgb(228,232,241)`），`D_*_dark_select_*_popup.png` 逐个抽查可读；#376 amber 横幅深色可读。
- 发现 2 条 P3：
  - **P3-287-4** 通用页「长时间静音自动退出（免按）」行在 en/ja/ko 下 hint 文字过长，`Toggle` 组件按钮没有 `shrink-0`，被 flex 压扁（按钮 `clientWidth` 38/33/34 < `scrollWidth` 42），滑块溢出、右边缘不对齐；浅/深、默认/最大化均复现，zh-CN/zh-TW 不复现（文字短）。`D_en_light_default_general_autoexit_toggle_squeezed_ZOOM.png`、`D_ko_light_default_general_autoexit_toggle_squeezed_ZOOM.png`、`D_ja_light_max_general_autoexit_toggle_squeezed_ZOOM.png`；扫描 `D_scan_en_*`/`D_scan_ja_*`/`D_scan_ko_*` 的 `overflow` 字段。
  - **P3-287-5** 对比度（汇总见 `round287/D_contrast_summary.txt`，按 `fg/bg/class` 去重）：
    - 浅色 12px `text-slate-400`（`#90a1b9`）提示/hint 文字 on `#fdfdfd`/`#fff`：**2.58–2.63:1**，五语言所有 tab 都有（设置项说明、「GitHub · MIT」、版本号）
    - 浅色 12px amber 状态胶囊「未配置」（`#e17100` on `#fffbeb`）：**3.09:1**
    - 浅色 12px **#376 横幅 / Speech 卡片「下载模型」按钮白字 on `bg-amber-600`（`#e17100`）：3.20:1**（本轮新增 UI 直接相关，同时影响 Speech 卡片）
    - 深色 14px About 页链接 `text-indigo-500`（`#615fff` on `#1c1f2a`）：**3.59:1**
    - 「清除全部数据」红字：浅色 3.81:1、深色 4.31:1
    - 深色下 hint 文字与 emerald/sky 胶囊未被扫描判为不达标（本轮扫描器阈值 4.5:1，仅记录上述条目）

## 6. E — 词典 / 自动学习真实闭环（PASS，1 条 P3 设计缺口）

前置：`autoLearn=true autoPaste=true polishEnabled=false language=zh hotwords=[]`（`E0_dictionary_empty_autolearn_on.png`）。语料 `learn287.wav`「这个项目的答复要在周五之前发给客户。」；改字用 `fixword.ps1` 逐键替换（每字 300ms）。

| ID | 用例 | 结果 | 时序 / 证据 |
| --- | --- | --- | --- |
| E1 | 落字后把「答复」改成「回执」 | PASS | 落字 01:02:19.121 → 开始改 +7.2s，改字耗时 621ms → 01:02:28.349 `auto-learn: "答复" -> "回执"`；toast「已学会新词 /「回执」已加入词典，下次自动纠正 / 撤销」；`hotwords=["回执"]`；词典页出现 chip；history `text` 更新为「…回执…」而 `raw` 保留「…答复…」。`E1_dictionary_chip_huizhi_after_learn.png`、`E1_history_text_updated_huizhi.png`、`E1_history_raw_vs_text_diff_ZOOM.png`、`E1_state.txt` |
| E2a | 再次听写同一句，期待「回执」生效 | **未生效（设计所致，立案 P3-287-3）** | 记事本仍为「这个项目的答复要在周五之前发给客户」。原因见 `desktop/src/main/hotwords.ts`：热词只按拼音同音/近音替换，「回执」与 ASR 输出「答复」读音不同，永远不会命中。`E2a_redictate_huizhi_NOT_applied_by_design_ZOOM.png` |
| E2b | 改用同音改字「答复」→「搭付」验证闭环 | PASS | 落字 01:06:16.300 → 改 +12.0s/635ms → `auto-learn` 01:06:30.412；再次听写 01:07:26 finalize，记事本与 history `text` 为「…搭付…」、`raw` 为「…答复…」→ 识别时纠正生效。`E1b_toast_learned_dafu_undo_*.png`、`E2b_notepad_dafu_applied_ZOOM.png`、`E2b_history_redictate_dafu_applied.png` |
| E3 | 负例：共字改「客户」→「用户」 | PASS（不学） | 改 +5.6s/624ms，15s 内无 `auto-learn` 行、无 toast、`hotwords` 不变。`E3_shared_char_edit_kehu_yonghu_no_toast.png` |
| E4 | 词典页 × 删除「搭付」→ 再听写 | PASS | chip 消失，`hotwords=["回执"]`，再听写回到「答复」。`E4_dictionary_dafu_chip_removed.png`、`E4_redictate_dafu_removed_answer_returns_ZOOM.png` |
| E5 | 再学一次 → 在 toast 生命周期内点「撤销」 | PASS | finalize 01:11:25.562 → 改 +12.2s/630ms → `auto-learn` 01:11:39.722 → ~01:11:42 点撤销 → toast「已撤销」，`hotwords` 移除，history `text` 还原为「答复」。`E5_toast_learned_dafu_before_undo_click.png`、`E5_toast_undone_dafu_removed.png` |

## 7. F — 免按 + 手机麦交替状态机 + 10 分钟 soak（PASS）

手机模拟：Chrome for Testing 独立 profile + fake-mic flags 打开 `main.log` 中的 `remote mic listening at https://172.16.17.2:43117/?t=…`，用 CDP 对 `#talk` 派发 mousedown/mouseup（不抢桌面焦点，落字目标始终是记事本）。手法陷阱（非产品缺陷）：手机页复用一次打开的麦克风流，fake-audio 文件循环播放，第二次按住可能落在语料尾静音里得到 `maxPeak=0 voicedMs=0`；正式计数的运行均在每次按住前 reload 页面。

| ID | 用例 | 结果 | 一行证据 |
| --- | --- | --- | --- |
| F0 | 手机当麦克风 ON（局域网直连），手机端配对 | PASS | 设置页「已连接 1 台设备」。`F0_phone_mic_on_1_device_connected.png` |
| F2 | 手机单独按住 6s | PASS | `finalize durationMs=5937 maxPeak=32767 voicedMs=3404`，history `source:"phone"`，记事本落字。`F2_phone_hold_alone_text_in_notepad.png` |
| F1 | 免按 30s 期间手机按住 | PASS | 手机端被拒：页面「电脑端正在录音，请稍候」、按钮未变红、桌面回 `busy`；免按不受影响（6 finalize = 6 history），Alt+Q 正常退出。`F1_handsfree_active_capsule_phone_mirrors_state.png`、`F1_altq_exit_toast_6_sentences.png`、`F1_after_exit_capsule_gone.png` |
| F3 | 手机按住中按 Alt+Q | PASS（语义 = 停止） | 立即 finalize 手机会话（5799ms）并落字，**不会**误开免按（无胶囊）；松手后 idle。手机页标签滞留见 P3-287-6。`F3_altq_during_phone_hold_finalizes_text_lands.png` |
| F4 | 手机按住中按 RightCtrl | PASS | rctrl down 被忽略（busy），rctrl up 结束手机会话，恰好 1 条 finalize、1 条 history、1 句落字，松手无额外输出。`F4_rctrl_during_phone_hold_single_finalize_text_landed.png` |
| F5 | 手机按住中按 Esc | PASS | toast「听写已取消 / 未落入任何文字」，无 finalize、无 history、记事本不变。`F5_esc_during_phone_hold_cancel_toast.png` |
| F6 | 5× 循环（Alt+Q 8s → 退出 → 手机 5s → RightCtrl 5s） | PASS | 15 finalize（全部有声）= 15 history（5 条 phone）；新增 error/warn 0；进程数 9→9；主进程 pid 4648 private 486.0→485.3MB。`F6_procmem_before_after.txt`、`F6_after_5_loops_no_orphan_capsule.png` |
| F7 | 手机按住 2.9s 时杀掉手机 Chrome | PASS | 会话静默取消（无 finalize/history/error），设置页回「等待手机连接…」；随后 RightCtrl 6s 正常落字（5875ms）。`F7_chrome_killed_mid_hold_no_crash.png`、`F7_rctrl_after_disconnect_text_landed.png`、`F7_settings_waiting_for_phone_0_devices.png` |
| Soak | 免按连续 10 分钟（01:33:50–01:44:00，hf287 循环） | PASS | 61 finalize（全部有声）= 61 history（38→99）；记事本到第 117 行；退出时半句「帮我跟老板说。」按设计提交（voicedMs=900）；新增 error/warn 0；进程 9→9；主进程 private 485.5→488.4（中段）→489.8MB，WS 341→346MB；胶囊/字幕 10 分钟后仍正常，Alt+Q 退出后消失。`F_soak_start_capsule_caption.png`、`F_soak_10min_capsule_still_ok_line117.png`、`F_soak_altq_exit_capsule_gone.png`、`F_soak_procmem_before_after.txt` |

soak 汇总行（原文）：`SUMMARY: hands-free 01:33:50-01:44:00; finalize delta 102-41=61 (all voiced); history delta 99-38=61; new err/warn=0; procs 9->9; main pid 4648 priv 485.5->489.8MB ws 341.2->346MB`

## 8. 立案清单

| ID | 级别 | 标题 | 复现 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- |
| P3-287-1 | P3 | #376 横幅「下载模型」按钮（`bg-amber-600 text-white text-xs`）白字对比度 3.20:1，低于 WCAG AA 4.5:1；Speech 卡片同款按钮同样不达标 | 设置 → 语音识别 → 开手机麦 + 无模型（浅色） | `C0_banner_light.png`、`D_contrast_summary.txt` 第 20 行 | 与 #376 直接相关。深色下 `global.css:36` 把 `--color-amber-600` 重映射为更浅的 `oklch(76% 0.15 70)`，白字对比度按 oklch 亮度估算约 2.1:1（**推断，未实测**：D 走查时模型已在，横幅未出现在扫描里） |
| P3-287-2 | P3 | 模型 A 下载中切换本地模型到 B，Speech 卡片继续显示 A 的「下载中 x%」（横幅正确） | 1) 删除所选模型 2) 点下载 3) 进度中切 localModel 下拉 | `C1_switched_to_tiny_card_shows_stale_22pct.png`、`C1_tiny_selected_card_still_41pct_sensevoice.png` | 既有问题。代码线索：`VoiceTab.tsx:31` `api.onLocalModel(setLocal)` 未按 `st.model === localModel` 过滤（`MicSection.tsx:119-121`、`Transcribe.tsx:103-105` 有过滤）；`Home.tsx:39` 同样无过滤——**首页卡片未实测**，仅为代码推断 |
| P3-287-3 | P3 | 自动学习对非同音改字（答复→回执）弹 toast「已加入词典，下次自动纠正」，但热词替换仅按拼音同音/近音匹配，该词永远不会在识别时生效；语义改写被当作识别纠错学入，占用 300 条词典上限 | E1→E2a 步骤 | `E1_history_raw_vs_text_diff_ZOOM.png`、`E2a_redictate_huizhi_NOT_applied_by_design_ZOOM.png`、`E1_state.txt` | `dictation.ts:762 learnCorrections` 只存 `item.right`，学入前不校验左右读音是否近音；`hotwords.ts` 只做同音替换。属设计缺口/文案承诺不实，非崩溃 |
| P3-287-4 | P3 | 通用页「长时间静音自动退出（免按）」行在 en/ja/ko 下 Toggle 被 flex 压扁（38/33/34px < 42px），滑块溢出、右缘错位 | 界面语言切 en/ja/ko → 设置 → 通用 → 滚到该行（浅/深、默认/最大化均复现） | `D_en_light_default_general_autoexit_toggle_squeezed_ZOOM.png`、`D_ko_light_default_general_autoexit_toggle_squeezed_ZOOM.png`、`D_scan_en_*_alltabs.json` `overflow` | `components/Toggle.tsx` / `Row.tsx` 按钮缺 `shrink-0`、文字容器缺 `min-w-0`/间距 |
| P3-287-5 | P3 | 浅色主题 12px `text-slate-400` 提示文字 2.58–2.63:1、amber「未配置」胶囊 3.09:1、深色 About 链接 3.59:1、「清除全部数据」红字 3.81/4.31:1 | 任意语言设置页 | `D_contrast_summary.txt`、`D_*_light_*_*.png` | 既有；五语言一致；仅 a11y，非功能问题 |
| P3-287-6 | P3 | 电脑端在手机按住期间结束/取消会话（Alt+Q、RightCtrl、Esc）时，手机页仍显示「松手结束」+「录音中…/润色中…」直到松手，松手后状态标签滞留「润色中…」直到下一次 status 广播 | 手机按住 → 桌面按 Alt+Q → 看手机页 | `F3_after_release_idle_phone_label_stale_polishing.png` | `remotemic.ts:192` 页面脚本仅在 `state==="idle" && !holding` 时重置标签；状态机本身正确（下一次按住正常） |
| HYG-287-1 | 卫生 | `desktop/package-lock.json` 顶部 `version` 仍为 0.15.1，`package.json` 已是 0.17.0；`npm install` 会产生 lock 的 2 行 diff | `cd desktop && npm install && git diff --stat` | 本轮工作区 `M desktop/package-lock.json`（未提交） | 建议下次发版随手同步 |

无 P0 / P1 / P2。

## 9. 未测 / 局限（如实声明）

- 「断网」为本地限速源停服模拟的 `fetch failed`，未做物理断网/DNS 失败/HTTP 5xx 分支。
- 真实 Android/iOS 手机浏览器未测（Chrome for Testing fake-mic 模拟）；公网中转（relay）连接方式未测，仅局域网直连。
- 首页（Home）模型卡片在「下载中切模型」下的表现未实测（P3-287-2 备注中为代码推断）。
- 深色主题下 emerald/sky 状态胶囊与 hint 文字的对比度由扫描器按 4.5:1 阈值自动判定为通过，未逐一人工复核。
- 自动学习仅测中文；英文热词（ASCII near-match）路径未测。
- 打包安装器（NSIS `pack`）未构建，仅 `pack:dir`；自动更新未测。
- 真实麦克风/系统音频设备切换未测（全程 fake-mic）。

## 10. 清理与最终状态

- `%APPDATA%\SpeakType\speaktype.json`：`uiLanguage=zh-CN language=zh theme=system remoteMicEnabled=false polishEnabled=false autoLearn=true autoPaste=true hotwords=[] asrProvider=local localModel=sensevoice-small polishBaseUrl=http://127.0.0.1:18099/v1`
- 模型 `models\sensevoice-small\model.int8.onnx` 239,233,841 B，无 `.part` 残留；原始 `app.asar` 已恢复并重启验证（`C4_original_asar_banner_download_99pct.png`、`Z_final_state_model_ready_toggle_off.png`）
- 手机 Chrome 进程 0；手机麦开关 OFF；词典 0/300（`Z2_cleanup_phone_mic_off_model_ready.png`、`Z2_cleanup_hotwords_cleared.png`）
- history 保留 99 条（其中 phone 8 条）；`main.log` 共 102 条 `dictation finalize`，与 history 差值为无声 finalize（设计上不入历史）
- 仓库：产品代码零改动；工作区仅 `.agents/skills/testing-speaktype-desktop/SKILL.md`（本轮测试经验，随报告分支提交）与 `desktop/package-lock.json`（npm install 副产物，不提交）

## 11. 方法沉淀（已写入 SKILL.md「Round 287 learnings」）

限速本地模型源 + Range 续传的确定性下载测试；asar 重打包必须 `--unpack-dir` 保留原生模块；手机页 CDP 驱动（隐藏窗口忽略 CDP 鼠标事件、fake-audio 循环需 reload）；免按/手机/热键的观测到的状态机语义；finalize 与 history 的对账口径（无声 finalize 不入库、按 epoch 过滤）；进程 pid 会回收、比对进程数与主进程内存而非 pid 集合。
