# SpeakType 第 310 轮严格体验官验收报告（packaged 0.17.2 @ main 829f544）

> **给老板的结论（可直接转发）**：#406 的「下载完成后首按被吞」修复在打包版实测坐实有效——SenseVoice/fp32 各两轮删模重下后 24/24 次按住全部 `recorder:start (win=ready)`、首帧 PCM、`maxPeak=32767` 且落字，正常运行零 `starved`，三语「刚才没录上」toast 与鼠标侧键/中键按住键均可用。但 **#404 应用内自动更新不能随 0.17.3 发布**：下载下来的安装包没有任何 sha256/签名校验（同尺寸篡改的 exe 被静默执行、错误尺寸文件也显示「安装并重启」）、跟随跨域重定向、重启后「安装并重启」按钮是空操作，属 3 条 P1；另有启动即向 api.github.com 联网与官网「一切离线」表述不一致（P2）。核心链路回归、P2-308-1/2、308 补测项全部实测通过（细节见矩阵），F8 真实 LLM 改写与独立 `dictionary.json` 升级保留仍为未测。

---

## 0. 范围、环境与方法

| 项 | 值 |
|---|---|
| 被测版本 | `main` 829f544（含 #406/#407/#404），`cd desktop && npm install && npm run typecheck && npm run build && npm run pack:dir` 全部成功（EBADENGINE 警告忽略；`npm install` 在 `package-lock.json` 上留下 `hasInstallScript` 差异，已 `git restore`，未提交） |
| 被测二进制 | `desktop\release\win-unpacked\SpeakType.exe`，runtime 日志 `SpeakType 0.17.2 starting (packaged=true)`，Authenticode `NotSigned`；**未测 dev 模式** |
| 正式 asar / whisper-server.exe SHA-256 | `51659E86…768A91` / `9E581A4A…464D89`，测前测后一致（见 §11） |
| 环境 | Windows Server 2022 VM，1280×720 @100%（DPI 125%/150% 本 VM 改不了 → **未测**），Node 20.19.0，Electron 43.3.0，electron-builder 26.15.3 |
| 注入手法 | koffi→`user32!keybd_event`（RightCtrl 用 `Control_R`）、`--inspect=9229` busy-loop、CDP 9333 150ms 轮询（panel/toast/settings）、假麦 WAV 循环、LAN WebSocket 手机模拟器、本地 mock GitHub Releases（8990/8991）+ dlproxy（8981）+ 延迟 OpenAI-compatible mock；asar 只改**隔离副本 B**（`C:\Users\Administrator\r310\B\`），正式包不改；**未改防火墙/hosts/产品代码，无 PR** |
| 证据根目录（本机） | `C:\Users\Administrator\r310\`，截图 `shots\`；两阶段原始报告 `phase1.md`（1420 行）、`phase2.md`（11729 行，含全部 150ms transcript、CDP 几何、HTTP 抓包） |
| 录屏 | 全程原速：`C:\Users\Administrator\r310\phase1-full-recording.mp4`（24m18s）、`C:\Users\Administrator\r310\phase2-full-recording.mp4`（51m41s，ffmpeg 全解码 0 错误）；带注释精简版：`C:\Users\Administrator\screencasts\r310-phase1\r310-phase1-edited.mp4`、`...\r310-phase2\r310-phase2-edited.mp4`；原始 MKV 分段全部保留 |

**证据分级约定**：本报告每个 PASS/FAIL 均引用打包版 runtime 一手证据（main.log 原文 / history.json 切片 / CDP 度量 / HTTP 日志 / 截图）；「未测」= 本轮没有 runtime 证据，不以源码或 #406 评论中的 309 轮结论替代。每步 `.main.log` 为当时累计快照，「无 starved」只对各有效区间判定。

---

## 1. 总览矩阵

### 1.1 核心链路回归

| # | 项 | 结果 | 关键证据 |
|---|---|---|---|
| 1 | RightCtrl 按住说话落字 Notepad | **PASS** | `D_rightctrl.png`，`D_sv_full.history.json` 文本 `帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复` |
| 2 | 排队第二句（真正重叠，`queued`+`resumed queued`） | **PASS（机制）/ FAIL（原配方两段不同文本）** | 22:30:31.504 `previous session still finalizing, queued` → .821 `resumed queued hold (frames=1, released=false)`；2s+80ms+2s 两条历史 ID 不同但文本同为 `帮我跟老板说那个`；改第二段 3s 后得到 `帮我跟老板说，那个方案需要再`（见 §10 P3-310-2） |
| 3 | Alt+Q 进出免按 | **PASS** | 22:31:06.537 `dictation handsFree exit: byToggle stage=recording elapsedMs=5017` → `.544 finalize durationMs=5024 maxPeak=32767` |
| 4 | 录音中 Esc 取消（无历史、无粘贴、开始菜单不弹） | **PASS** | 22:29:35.229 `dictation cancel: byEsc=true stage=recording handsFree=false elapsedMs=2371`；`D_esc.png` 无开始菜单 |
| 5 | F8 mock 改写 | **PASS（mock 链路）/ 未测（真实 LLM）** | 本地延迟 OpenAI-compatible mock 收到请求、原地替换并恢复剪贴板（`P2_d_f8_success_*`）；fresh profile 无 LLM 配置时按 F8 打开 AI 润色配置页（`D_f8.png`） |
| 6 | 深色模式 | **PASS** | `D_dark_all.png`（设置/主页/About 深色，无白块） |
| 7 | 免按段落空行（≥4s 停顿） | **PASS** | `D_paragraph.png` 两段之间空行；`D_paragraph.history.json` 两 segment；`paragraphBreakMs=4000` |
| 8 | SenseVoice zh | **PASS** | 同 #1 |
| 9 | Parakeet int8 en | **PASS（链路）/ 异常（准确性）** | `D_int8_en.history.json`：`Ple schedule the meeting for tomorrow at three in the afternoon.`（句首非 `Please`；fp32 同 fixture 得 `Please schedule…`，见 P3-310-3） |
| 10 | whisper base ja | **PASS** | 22:35:33.525 `local whisper-server starting (model=base-q5_1, port=60125)`，`D_whisper_ja.png` 日文落字 |
| 11 | 手机麦 owner 隔离 b-①②③（LAN） | **PASS（本机 LAN WebSocket 模拟器）** | 22:38:10.318 `dictation stop: hold release ignored, phone session in progress`；22:38:35.497 `rewrite release ignored, phone session in progress`；手机 Esc → `cancel byEsc=true`，socket terminate → `cancel byEsc=false`，历史 47 条不变；history `source: "phone"` |
| 12 | 端口竞态 a-③ | **PASS（bind 冲突→重试）/ 未测（`freePort()`→`spawn()` 微秒 TOCTOU）** | 22:36:56.273 `whisper-server starting (... port=60125)` → stderr `couldn't bind to server socket: hostname=127.0.0.1 port=60125` → 22:37:02.151 `starting (... port=60130)` → 日文落字 `E_port_collision.png` |

### 1.2 专项 a）#406 独立复核

| # | 项 | 结果 | 关键证据 |
|---|---|---|---|
| a1 | 删除→重下 SenseVoice，就绪后 1.2–1.5s×5 + 3s 对照×3 | **PASS（两轮干净：A_sv2、A_sv3）** | A_sv2：`downloaded` 22:19:12.605 → `sherpa worker started` .614（**9ms**）→ 首按 `hold: down` .684 → `recorder:start (win=ready)` .818 → `pcm: first frame after 241ms` → `finalize durationMs=1175 maxPeak=32767 voicedMs=740`；8/8 次同模式，文本 `帮我跟老板说`；有效区间 `starved`=0。A_sv1 被 computer-use 点击释放修饰键污染（594ms/maxPeak=0）判作废并保留 `A_sv1_contaminated.*` |
| a2 | 删除→重下 Parakeet fp32，同上 | **PASS** | `A_fp32.main.log` 8/8 `win=ready`、首帧、`maxPeak=32767`、落字；`starved`=0 |
| a3 | 主线程忙时长按（对照） | **PASS** | 22:26:13.857 `down` → .979 `start` → .985 `recorder:start (win=ready)` → 22:26:17.464 `up (timer=false active=true held=3500ms)` → `finalize maxPeak=32767` |
| a4 | busy-loop starved ×3 语 toast（toastgeo 无截断） | **PASS** | zh-TW 22:24:38.903 / ja 22:25:16.914 / ko 22:25:49.811 `[warn] hotkey hold: starved (held 15xxms, timer never fired)`，前一行 `up (timer=true active=false held=1500ms)`；toast 标题/正文 `scrollWidth<=clientWidth && scrollHeight<=clientHeight`（`B_tw.png`/`B_ja.png`/`B_ko.png`；仅 1280×720） |
| a5 | 鼠标按住键：录入中键/侧键 | **PASS** | 设置捕获接受 Middle / MouseBack / MouseForward（`C_middle_capture.png` 等） |
| a6 | 鼠标侧键长按落字 | **PASS（指针需在编辑区）** | `C_mouse_hold_target.*` 2.5s 落字；首次指针在任务栏 → `paste skipped: no input target (fg=?)` 仅历史（方法偏差，保留 `C_mouse_hold.*`） |
| a7 | 鼠标侧键短敲 | **PASS** | 62ms 不录音/无历史/Notepad 不变；日志 `hotkey hold: up (timer=true active=false held=62ms)` —— 读 `hotkey.ts releaseHold()`：只有**孤儿 keyup**（无 down）不记日志（#407），真实短敲记 `up` 属设计行为，`held<320ms` 不触发 starved（phase1.md 曾按更严的口头预期记 FAIL，本报告以源码为准修正为 PASS） |
| a8 | 鼠标侧键 busy-loop starved | **PASS** | 22:28:43.895 `[warn] hotkey hold: starved (held 1516ms, timer never fired)` + 本地化 toast `C_mouse_starved.png` |
| a9 | 「刚才没录上」文案是否可行动 | **基本清楚（P3-310-5）** | 三语正文都指示「再按住说一次」；改映射为鼠标键后文案仍只说「按住」，不提当前映射的键 |

### 1.3 专项 b）P2-308-1 / P2-308-2 独立复核

| # | 项 | 结果 | 关键证据 |
|---|---|---|---|
| b1 | `stall-hf`+`mirrorDelayMs=4000`，zh-TW/ja/ko，150ms 全程无「第 1/3 个源」 | **PASS** | `P2_b_stall-hf_{zh-TW,ja,ko}.jsonl/.log`：首源停滞只显示本地化「连接中断，正在重试…」；`retrying` 相位 index=0 时 `sourceAt` 被 `download.ts` 抑制（`phase === "retrying" && index === 0 ? undefined : sourceAt(index)`） |
| b2 | 切到第 2 源后持续显示 2/3(host) | **PASS（host 为 `127.0.0.1:8981`，正式域名文案未测）** | 三语 mirror 头延迟 4s 期间持续 `2/3`（`P2_b_stall-hf_*_mirror.png`），字节恢复后才消失；23:26:24.309 `stalled: no data for 30s (127.0.0.1:8981)` → 23:26:33.168 `download ok` |
| b3 | 第 3 源一次 | **PASS** | `fail-hf`：hf/mirror 均 `net::ERR_EMPTY_RESPONSE` → `3/3`（`P2_b_fail-hf_zh-CN_visible_third_panel.png`）→ 23:29:26.453 `download ok … model.int8.onnx` |
| b4 | fp32 冷启动首句「加载模型中…」→「转写中…」三语 | **PASS** | 23:30:33.637 `hold: start` → .648 `worker started (fp32)` → .649 `recorder:start (win=ready)` → 23:30:36.887 `model loaded in 3203ms` → 37.517 `up held=4016ms` → finalize；面板 `P2_b_cold_{zh-TW,ja,ko}_quick_loading_panel.png` → `_transcribing_panel.png` → 落字 |
| b5 | `downloaded` → `sherpa worker started` ≤1s | **PASS** | 23:26:33.303→.309（6ms）、23:27:43.481→.486（5ms）、23:28:49.477→.484（7ms）、22:19:12.605→.614（9ms） |
| b6 | 切模型 `model switched`→`model loaded` 期间按住说话有反馈 | **PASS（有加载反馈）/ 未测（干净落字完整性）** | 23:34:45.512 `sherpa worker stopped (model switched)` → .514 `started (parakeet-tdt-0.6b-v3)` → .734 `hold: start` → 47.318 finalize → .717 `model loaded in 2114ms`；面板显示加载中而非静默（`P2_b_switch_*_loading_panel.png`） |

### 1.4 专项 c）#404 应用内自动更新（功能）—— 安全/隐私另见 §7

| # | 项 | 结果 | 关键证据 |
|---|---|---|---|
| c①-有新版 | 检查更新有新版两态 | **PASS** | mock `tag=v0.17.3`：About 卡片显示 v0.17.3 + 下载按钮；启动 toast 可点进 About（`P2_c_startup_toast.png`、`P2_c_toast_about.png`） |
| c①-无新版 | 无新版态 | **FAIL（UX）** | `api=same`（tag=v0.17.2）About 无「已是最新」提示、无手动「检查更新」按钮（`P2_c_same.*`，见 P2-310-1） |
| c②-进度/取消 | 下载进度、取消 | **PASS** | 进度递增；取消后 `.part` 保留、状态变为可续传（`P2_c_cancel.png`） |
| c②-杀进程续传 | 中途杀进程后重启续传 | **PASS** | 残片 `%APPDATA%\SpeakType\updates\SpeakType-Setup-0.17.3.exe.part`=7208960 B，`.part.json`=`{"url":"http://127.0.0.1:8990/download/v0.17.3/SpeakType-Setup-0.17.3.exe","etag":"","total":103300387}`；重启后请求 `Range: bytes=7208960-` → mock `206 Content-Range: bytes 7208960-103300386/103300387` → 23:04:08.240 `update installer ready` |
| c②-重启后 ready | 已下完文件重启后直接 ready、不重下 | **PASS（展示）/ FAIL（安装按钮空操作）** | 无新下载请求即显示「安装并重启」；点击后进程不退、无 `update install:` 日志（`P2_c_cached_install_noop.png/.main.log`；P1-310-3） |
| c③ | sha256/签名校验 | **FAIL（P1-310-1）** | 见 §7 |
| c④-静默安装 | `/S --force-run` 后新版自启、数据保留 | **PASS** | 23:06:01.365 `update install: quitting and running …\updates\SpeakType-Setup-0.17.3.exe`；`P2_c_install_process.log` 显示 `SpeakType-Setup-0.17.3.exe /S --force-run`；`%LOCALAPPDATA%\Programs` 下 0.17.3 自启；设置/历史/hotwords/模型存在性保留 |
| c④-真实升级 | 真实 v0.17.2 Setup（SHA-256 `66845d27…2ac4`）→ 首启 → 模型下载 → 首次落字 → `/S --force-run` 升到本次打包 0.17.3 | **PASS** | `P2_e_real172_firsttext.png` → `P2_c_real173_about.png`；`P2_c_real_before/after.settings.json` 相同、history 相同、两模型文件 hash 相同、`HKCU\…\Run\SpeakType` 值相同（`P2_c_preinstall.run.json`/`P2_c_postinstall.run.json`） |
| c④-词典 | 独立 `dictionary.json` 保留 | **未测** | 被测 profile `dictionaryFileExists=false`；只验证了存于 `speaktype.json` 的 UI hotwords |
| c⑤ | 断网/404/5xx/磁盘满报错 | **PASS（触发+重试）/ FAIL（可行动性）** | 23:10:02.622 `update download failed Error: HTTP 404 (127.0.0.1:8990)`；23:12:24.851 `HTTP 500`；23:12:48.735 `net::ERR_EMPTY_RESPONSE`；23:13:42.408 `stalled: no data for 30s`；23:24:28.540 `ENOSPC: no space left on device, write`（VHD+junction）；五语 820px 卡片无截断（`P2_c_{404,500,refuse,stall,disk-full}_{en,ja,ko,zh-CN,zh-TW}.png`）；但原文即技术串（P2-310-1）。`api-timeout`/`api-badjson` 只有 main.log `update check failed …`，UI **无任何错误卡** |
| c⑥ | portable 隐藏/禁用更新 | **PASS（portable 环境标记模拟）** | 便携提示 + 「打开所在文件夹」替代安装，点击打开 Explorer（`P2_c_portable_ready.png`、`P2_c_portable_explorer.png`）；未跑真实 portable stub 解包链路 |
| c⑦ | 出网审计 | **FAIL（与「一切离线」披露不一致，P2-310-2）** | 见 §7 |
| c⑧ | 下载 URL/重定向校验 | **FAIL（P1-310-2）** | 见 §7 |
| c⑨ | 深色/五语 About 布局 | **PASS（820/1040 × light/dark × 5 语，卡片几何无截断）/ FAIL（信息架构，P3-310-4）** | `P2_c_layout_{lang}_{light,dark}_{820,1040}.jsonl/.png`；About 有版本/Releases/GitHub/MIT/Issues，**无官网入口** |

### 1.5 专项 d）308 未测补测

| # | 项 | 结果 | 关键证据 |
|---|---|---|---|
| d1 | Esc 在识别阶段 | **PASS** | 23:37:09.108 `dictation cancel: byEsc=true stage=transcribing handsFree=false elapsedMs=2438`；Notepad、sentinel 剪贴板、history 不变（`P2_d_esc_recognition_before/after.json`） |
| d2 | Esc 在改写阶段 | **PASS** | 23:37:37.592 `dictation cancel: byEsc=true stage=polishing … elapsedMs=2234`；原文/剪贴板/57 条历史不变 |
| d3 | F8 切窗（Alt+Tab）留剪贴板 | **FAIL（按 308 sentinel 要求）/ 与官网文档一致** | 原文不变；剪贴板 `ROUND310_CLIPBOARD_SENTINEL` → `Round310 mock rewrite completed.`，history 57→58（P3-310-1，需产品定契约） |
| d4 | 重置设置 | **PASS** | `learnInaccessibleDismissed` true→false，Run 移除；history 48 条、12 个模型文件保留，模型页可用（`P2_d_reset_settings_*`） |
| d5 | 清除全部数据 | **PASS** | flag false、Run 移除、history 48→0、模型文件 12→0，模型页回到下载态（`P2_d_reset_factory_*`） |
| d6 | 历史清空 | **PASS** | 48→0；flag、Run、12 模型文件保留（`P2_d_reset_history_*`） |
| d7 | 双击进免按 | **PASS** | 23:38:35.049/.214 两次 `up (timer=true active=false held=78/63ms)` → .223 `recorder:start (win=ready)`；双击退出 23:38:37.685 `handsFree exit: byToggle stage=recording elapsedMs=2470` |
| d8 | 语音命令 换行/另起一段/删除上一句 | **PASS（连续免按 fixture 一次）** | Notepad 保留前两句 + 单换行 + 空段，最后一句被删除；history 保留听写语句、命令不入正文（`P2_d_voice_1..7.png`、`P2_d_voice_after.json`）；未做三个独立短 hold |

### 1.6 专项 e）自由发掘

| # | 项 | 结果 | 关键证据 |
|---|---|---|---|
| e1 | 官网 `/` 与 `/zh/` 点下载 → 安装 → 首次落字 | **PASS** | Chrome 下载 `SpeakType-Setup-0.17.2.exe` 完成（`P2_e_browser_download.png`），真实安装 → 首启 → SenseVoice 下载 → Notepad 首段（`P2_e_real172_firstlaunch/modelready/firsttext.png`） |
| e2 | 下载链接指向与版本一致 | **PASS（一致）/ P3-310-6（固定版本 URL）** | 公开 latest = v0.17.2（API `digest sha256:66845d…`，size 103283961）；官网 badge v0.17.2；hero CTA = `…/releases/download/v0.17.2/SpeakType-Setup-0.17.2.exe`（非 `/latest`），portable 同理 |
| e3 | 390px 无溢出 | **PASS** | `P2_e_web_en_390.json`/`_zh_390.json`：`innerWidth=390, documentElement.scrollWidth=390` |
| e4 | 无障碍 Tab 焦点顺序 | **PASS（抽样 38 步）** | Skip to content → header → 下载 → FAQ；`focus-visible=true`、2px cyan outline；中文 FAQ Enter 可展开（`P2_e_tabs_{en,zh}_native_step*.png`）；未做完整 ARIA/读屏 audit |
| e5 | About 版本/更新/官网/开源清晰度 | **部分 FAIL** | 版本、开源、Issues 清楚；缺官网入口、缺「已是最新」态（P3-310-4 / P2-310-1） |
| e6 | 模型页四档 + 预热后的困惑等待 | **PASS** | 四档 + Whisper 子型号可辨认；预热有「加载模型中…」反馈；`sherpa model loaded` 1.1–1.6s（SenseVoice）/ 3.2–3.4s（fp32）；发现的唯一等待是 fp32 冷启动首句 ≈3.3s，已有可见提示 |
| e7 | 官网离线表述 | **FAIL（披露）** | FAQ「一切都离线运行」未说明启动会请求 GitHub Releases 元数据（见 §7） |

### 1.7 未测清单（无 runtime 证据）

1. F8 **真实 LLM** 成功改写（fresh profile 无授权 LLM 配置；仅 mock 链路）。
2. 独立 `dictionary.json` 升级保留（被测 profile 无该文件）。
3. `freePort()`→`spawn()` 微秒级 TOCTOU（仅测 bind 失败后重试）。
4. 正式域名（`hf-mirror.com`/`github.com`）在 2/3、3/3 文案中的显示（副本 B host 为 `127.0.0.1:8981`）。
5. DPI 125%/150% 下 toast/About 几何。
6. `api=404`/`api=500`（检查接口本身 4xx/5xx）的独立 UI 表现；`api-weird` 恶意 tag/name 字符组合穷举。
7. 每个下载错误 × 每种语言的逐项重试矩阵（只抽样 404 恢复与 disk-full 恢复）。
8. 实体手机 / 跨设备网络（用的是本机 LAN WebSocket 模拟器）。
9. 真实 portable stub 解包链路（用 `PORTABLE_EXECUTABLE_FILE` 环境标记模拟）。
10. 语音命令三个独立短 hold 用例（只跑了一个连续 fixture）。

---

## 2. 核心链路回归证据摘录

排队（原配方 2s+80ms+2s）：

```text
[2026-09-07 22:30:31.504] [info]  dictation start: previous session still finalizing, queued
[2026-09-07 22:30:31.821] [info]  dictation start: resumed queued hold (frames=1, released=false)
[2026-09-07 22:30:31.822] [info]  dictation pcm: first frame after 318ms (session=false)
```

`D_queue.history.json` 最新两条 ID 不同、`text` 均为 `帮我跟老板说那个`；`D_queue_varied.history.json`（第二段 3s）第二条为 `帮我跟老板说，那个方案需要再`。

Alt+Q / Esc：

```text
[2026-09-07 22:29:35.229] [info]  dictation cancel: byEsc=true stage=recording handsFree=false elapsedMs=2371
[2026-09-07 22:31:06.537] [info]  dictation handsFree exit: byToggle stage=recording elapsedMs=5017
[2026-09-07 22:31:06.544] [info]  dictation finalize: durationMs=5024 maxPeak=32767 voicedMs=3620
```

手机 owner 隔离 / 端口碰撞：

```text
[2026-09-07 22:38:10.318] [info]  dictation stop: hold release ignored, phone session in progress
[2026-09-07 22:38:35.497] [info]  dictation stop: rewrite release ignored, phone session in progress
[2026-09-07 22:36:56.273] [info]  local whisper-server starting (model=base-q5_1, port=60125)
couldn't bind to server socket: hostname=127.0.0.1 port=60125
[2026-09-07 22:37:02.151] [info]  local whisper-server starting (model=base-q5_1, port=60130)
```

---

## 3. 专项 a）#406 证据摘录

A_sv2 首按（`downloaded` → 首按结束）：

```text
[2026-09-07 22:19:12.605] [info]  local model sensevoice-small downloaded
[2026-09-07 22:19:12.614] [info]  sherpa worker started (sensevoice-small)
[2026-09-07 22:19:12.684] [info]  hotkey hold: down
[2026-09-07 22:19:12.812] [info]  hotkey hold: start
[2026-09-07 22:19:12.818] [info]  dictation start: recorder:start (win=ready)
[2026-09-07 22:19:13.054] [info]  dictation pcm: first frame after 241ms (session=true)
[2026-09-07 22:19:13.987] [info]  hotkey hold: up (timer=false active=true held=1312ms)
[2026-09-07 22:19:13.988] [info]  dictation finalize: durationMs=1175 maxPeak=32767 voicedMs=740
[2026-09-07 22:19:14.178] [info]  sherpa model loaded (sensevoice-small) in 1288ms, 1564ms after worker start
```

| Hold | down | start | up | 首帧 ms | durationMs / peak / voicedMs | history |
|---|---|---|---|---:|---|---|
| 1–5 | 22:19:12.684 … 22:19:31.915 | +127–133ms | +1297–1312ms | 198–241 | 1173–1178 / 32767 / 740 | `帮我跟老板说` ×5 |
| CTRL1–3 | 22:19:39.736 … 22:19:49.358 | +126–130ms | +1300ms | 199–201 | 1171–1177 / 32767 / 740 | `帮我跟老板说` ×3 |

busy-loop starved（zh-TW 示例；ja/ko 同模式）：

```text
[2026-09-07 22:24:38.901] [info]  hotkey hold: down
[2026-09-07 22:24:38.902] [info]  hotkey hold: up (timer=true active=false held=1500ms)
[2026-09-07 22:24:38.903] [warn]  hotkey hold: starved (held 1500ms, timer never fired)
```

Toast 原文（均单行 20px，未触发 line-clamp）：zh-TW `剛才沒錄到 / 程式剛忙了一下，請再按住說一次`；ja `今の録音は開始できませんでした / 一瞬処理が遅れました — もう一度キーを押し続けてください`；ko `이번 누름이 녹음되지 않았습니다 / 잠시 처리가 지연되었습니다 — 키를 다시 길게 눌러 주세요`。

**文案评价**：普通用户能明白「再按住说一次」，但不知道「为什么」也不必知道；改成鼠标键后仍说「按住」不提当前键位，轻微。

---

## 4. 专项 b）证据摘录

150ms transcript（zh-TW `stall-hf`，change-only）：首源停滞阶段全部样本只出现「連線中斷，正在重試…」类文案，**无 `1/3`**；30s 后 `stalled: no data for 30s` → 换第 2 源，mirror 头延迟 4s 内持续 `2/3（127.0.0.1:8981）`；字节到达后回到百分比。完整 transcript：`P2_b_stall-hf_{zh-TW,ja,ko}.log`。

fp32 冷启动首句（zh-TW；ja/ko 同模式）：

```text
[2026-09-07 23:30:33.637] [info]  hotkey hold: start
[2026-09-07 23:30:33.648] [info]  sherpa worker started (parakeet-tdt-0.6b-v3-fp32)
[2026-09-07 23:30:33.649] [info]  dictation start: recorder:start (win=ready)
[2026-09-07 23:30:36.887] [info]  sherpa model loaded (parakeet-tdt-0.6b-v3-fp32) in 3203ms, 3239ms after worker start
[2026-09-07 23:30:37.517] [info]  hotkey hold: up (timer=false active=true held=4016ms)
[2026-09-07 23:30:37.518] [info]  dictation finalize: durationMs=3880 maxPeak=32767 voicedMs=2720
```

`_quick` 组（2.5s hold，松手早于 `model loaded`）面板轮询顺序：`加载模型中…`（本地化）→ `转写中…` → 落字，与 `sherpa model loaded` 时间戳交叉一致。

---

## 5. 专项 c）#404 功能链路证据摘录

续传 HTTP（mockgh.log）：

```text
2026-09-07T23:03:32.224Z REQ GET /download/v0.17.3/SpeakType-Setup-0.17.3.exe range=- ua=... SpeakType/0.17.2 Chrome/150... Electron/43.3.0
2026-09-07T23:03:32.224Z   <- 200 content-length=103300387
2026-09-07T23:04:07.925Z REQ GET /download/v0.17.3/SpeakType-Setup-0.17.3.exe range=bytes=7208960-
2026-09-07T23:04:07.925Z   <- 206 content-length=96091427 content-range=bytes 7208960-103300386/103300387
[2026-09-07 23:04:08.239] [info]  download ok: 127.0.0.1:8990 -> SpeakType-Setup-0.17.3.exe in 0.3s
[2026-09-07 23:04:08.240] [info]  update installer ready: SpeakType-Setup-0.17.3.exe
```

安装与真实升级：

```text
[2026-09-07 23:06:01.365] [info]  update install: quitting and running C:\Users\Administrator\AppData\Roaming\SpeakType\updates\SpeakType-Setup-0.17.3.exe
```

`P2_c_preserved.json`：settings 相同、history 相同、`sensevoice-small` 两文件 SHA-256 相同、Run 值相同、`dictionaryFileExists=false`。

错误矩阵原文（zh-CN，其余四语同义，820px 卡片 `scrollWidth<=clientWidth`）：`HTTP 404 (127.0.0.1:8990)` / `HTTP 500 (127.0.0.1:8990)` / `net::ERR_EMPTY_RESPONSE` / `stalled: no data for 30s (127.0.0.1:8990)` / `net::ERR_TOO_MANY_REDIRECTS` / `ENOSPC: no space left on device, write`。

---

## 6. 专项 d）/ e）证据摘录

```text
[2026-09-07 23:37:09.108] [info]  dictation cancel: byEsc=true stage=transcribing handsFree=false elapsedMs=2438
[2026-09-07 23:37:37.592] [info]  dictation cancel: byEsc=true stage=polishing handsFree=false elapsedMs=2234
[2026-09-07 23:38:35.049] [info]  hotkey hold: up (timer=true active=false held=78ms)
[2026-09-07 23:38:35.214] [info]  hotkey hold: up (timer=true active=false held=63ms)
[2026-09-07 23:38:35.223] [info]  dictation start: recorder:start (win=ready)
[2026-09-07 23:38:37.685] [info]  dictation handsFree exit: byToggle stage=recording elapsedMs=2470
```

三档重置（`P2_d_reset_*_before/after.json`）：

| 档 | `learnInaccessibleDismissed` | Run | history | 模型文件 |
|---|---|---|---|---|
| 重置设置 | true→false | 移除 | 48 保留 | 12 保留 |
| 清除全部数据 | true→false | 移除 | 48→0 | 12→0 |
| 历史清空 | true 保留 | 保留 | 48→0 | 12 保留 |

官网（`P2_e_web_en_390.json`）：hero 下载 `https://github.com/wookat/speaktype/releases/download/v0.17.2/SpeakType-Setup-0.17.2.exe`；版本 badge → `…/releases/latest`；公开 latest API：`v0.17.2`，`SpeakType-Setup-0.17.2.exe` 103283961 B `sha256:66845d278c1f4e0ab9fd77770aa54e55766c4ba524d60e466cc2c92fb22c2ac4`。

---

## 7. #404 安全 / 隐私专节

### 7.1 完整性：下载的 exe 无任何校验即静默执行（P1-310-1）

**runtime 证据**

- `.part.json` 恒为 `"etag":""`：`download.ts` 的 sha256 校验只在 `X-Linked-ETag`（HF）或 `knownSha256()`（models-v1 清单）存在时执行，安装包 URL 两者皆无 → `expected=""` → 跳过 `verifying`。
- `wrong-bytes`：mock 返回 108387 字节（非 103300387）→ 23:05:28.353 `update installer ready`，UI 显示「安装并重启」（`P2_c_wrongbytes.png`）。**未执行**该文件。
- 同尺寸篡改：正确包 SHA-256 `194F17D7…240F7`，替换为 103300387 字节 padded `win32calc.exe`（SHA-256 `64D11B8B…1E24`）→ 点「安装并重启」→ 计算器 PID 1252 启动（`P2_c_tamper.log`、`P2_c_tamper_calc.png`）。仅使用系统自带良性二进制。

**根因（源码）**

- `updater.ts:126-129 installerReady()` 只比 `statSync(dest).size === info.size`；`downloadUpdate()` 成功路径（L174-176）连这个 size 也不比，直接 `ready`。
- `ReleaseAsset`（L42-46）只取 `name/browser_download_url/size`，忽略 GitHub API 已返回的 `digest`（本轮实测公开 latest 的资产带 `digest: sha256:66845d…`），L143 注释「发布资产没有官方 sha256」与事实不符。
- `installUpdate()`（L207）`spawn(downloadedPath, ["/S","--force-run"])` 直接执行；安装包本身 `NotSigned`，无 Authenticode 可兜底。

**建议修法**

1. `ReleaseAsset` 增加 `digest?: string`，`checkUpdate()` 解析 `sha256:` 前缀写入 `UpdateInfo.sha256`；`downloadUpdate()` 把它作为 `downloadFile` 的期望值（复用 `download.ts` 已有的 `verifying`/`hashFile` 路径），无 digest 时**拒绝进入 ready**（fail-closed），并在 `installerReady()` 里对缓存文件重新 hash。
2. 下载后校验 `size === info.size`，不符删除残片并报本地化错误。
3. 中期：对安装包做 Authenticode 签名并在 `installUpdate()` 前用 `Get-AuthenticodeSignature`/WinVerifyTrust 校验签名者，或发布 `latest.yml` 走 electron-updater。

### 7.2 重定向无 host 白名单（P1-310-2）

**runtime 证据**：`redirect-other` 模式下 8990 → 302 → `127.0.0.1:8991`，mockgh.log `23:20:51.265Z EVIL GET /evil/SpeakType-Setup-x.exe ua=... SpeakType/0.17.2`，随后 UI 显示 ready（`P2_c_redirect-other_*.png`）；**未点安装**。`redirect-loop` → `net::ERR_TOO_MANY_REDIRECTS` 报错（PASS）。

**根因**：`download.ts:176-179` `req.on("redirect", …) { linkedSha256 ||= …; req.followRedirect(); }` 对任意目标无条件跟随；`updater.ts` 也未校验 `browser_download_url` 的 host（当前直接拼 `https://github.com/wookat/speaktype/releases/download/${tag}/${fileName}`，tag/fileName 来自 API JSON，未做字符白名单）。

**建议修法**：在 redirect 回调校验目标 host ∈ {`github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`}（模型下载再加 HF/镜像白名单），否则 `req.abort()` 并报错；`tag`/`fileName` 用 `^v?\d+\.\d+\.\d+$` / `^SpeakType-Setup-[\d.]+\.exe$` 校验。与 7.1 叠加后即使重定向被劫持也无法执行未验证字节。

### 7.3 重启后缓存 ready 的「安装并重启」为空操作（P1-310-3，功能）

**runtime 证据**：完整下载后退出→重启→About 直接显示「安装并重启」（无新 HTTP 请求）→ 点击无反应、无 `update install:` 日志（`P2_c_cached_install_noop.*`）；同进程内重新下载一次后点击即正常执行。

**根因**：`updateState()`（L132-140）根据磁盘 `installerReady(info)` 返回 `{phase:"ready"}`，但模块变量 `downloadedPath` 只在 `downloadUpdate()` 内赋值；`installUpdate()` 第一行 `if (!downloadedPath) return;` 静默返回。用户在此状态没有重新下载入口。

**建议修法**：`installUpdate()` 内 `downloadedPath ??= currentInfo ? installerReady(currentInfo) : null`（并在 7.1 修复后先 hash 校验）；或 `updateState()` 返回 ready 时同步设置 `downloadedPath`；`installUpdate()` 找不到文件时切到 error 态给「重新下载」。

### 7.4 启动即出网与隐私披露（P2-310-2）

**runtime 证据**：删除 `latest-release.json` 后启动正式包、**不打开 About**：`P2_c_network_formal.log` +2s 出现 `TCP 172.16.5.2:61725 → 140.82.116.5:443 ESTABLISHED (PID 7732)`，main.log `latest release prefetched: v0.17.2`；副本 B 同样在无操作时请求 mock `latest`。设置页无关闭开关；官网 FAQ「一切都离线运行」未提及。此请求只含 GitHub API 默认头（UA/accept），**不是音频或遥测上传的证据**。

**根因**：`index.ts:592` `setTimeout(() => void fetchLatestTag().then(announceUpdateToast), 5000)` 无条件执行，缓存 24h。

**建议修法**：加设置项「自动检查更新」（默认开或关由产品定），关闭时不发请求；官网 FAQ/README 隐私段补一句「启动后最多每 24h 向 GitHub 查询一次版本号，不含任何用户数据，可在设置中关闭」。

### 7.5 其他安全观察（非立案）

- `checkUpdate()`（`updater.ts`）与 `fetchLatestTag()`（`index.ts`）各自请求同一 API，About 打开时同一毫秒出现两条 `latest` GET（mockgh.log 23:20:50.706Z ×2）；匿名限额 60/h/IP，共享出口易 403 → P3-310-7。
- `update:download`/`update:install` IPC 不吃渲染层入参（好）；`pruneOldInstallers()` 只清 updates 目录（好）。
- `api-weird`（tag/name 异常字符）可渲染出 `v0.17.3 / 0MB` 卡片，说明 tag/name 未做格式校验（并入 7.2 建议）。

---

## 8. 专项 c）UX（非安全）

- 无「已是最新」态、无手动检查按钮：`AboutTab.tsx` mount 时 `updateCheck()` 返回 null 就什么都不渲染；用户无法区分「没新版」与「检查失败」。
- 检查失败（timeout / 非法 JSON）无 UI 反馈：`checkUpdate()` catch 后 `log.warn("update check failed")` 返回 null。
- 下载错误原文直出：`t("settings.about.updateFailed", { error })` 把 `HTTP 404 (127.0.0.1:8990)` / `net::ERR_EMPTY_RESPONSE` / `ENOSPC…` 原样显示，五语均如此；有「重试」按钮但无原因解释。

---

## 9. 环境还原核对（PASS）

| 项 | 结果 |
|---|---|
| SpeakType / whisper-server / mock node 进程 | 0 / 0 / 0 |
| 测试安装的 0.17.2 / 0.17.3 | 已卸载，`%LOCALAPPDATA%\Programs` 无残留，Run 值 absent（与基线一致） |
| VHD / `updates` junction | detached / 移除 |
| `%APPDATA%\SpeakType`（speaktype.json / history.json / models 等 73 文件） | 从备份恢复，逐文件 SHA-256 mismatches=0（`P2_cleanup_profile_hashes.json`）；`dictionary.json` 基线不存在 |
| 正式 `app.asar` / `whisper-server.exe` | `51659E86326B36CD645DD858E3D7C2095DCAD8F2E000A0D756843CB54D768A91` / `9E581A4A2B7BD5AEC0993F5794FEA3D65AF2D7F5921CF51C2A4E4B5A3A464D89`，与测前一致 |
| 防火墙 / hosts / 产品代码 / GitHub Actions | 未改 / 未改 / 未改 / 保持禁用 |
| `git status` | 仅 `docs/reviews/round310.md` 与 `.agents/skills/testing-speaktype-desktop/SKILL.md`（`desktop/package-lock.json` 的 npm 副作用已 restore） |

---

## 10. 立案清单

| ID | 级别 | 标题 | 复现 | 根因 | 建议 |
|---|---|---|---|---|---|
| **P1-310-1** | P1 | 更新安装包无 sha256/签名校验，错误尺寸与同尺寸篡改文件均进入 ready 并可静默执行 | mock latest 返回新版；① 服务端返回 108387B → 显示「安装并重启」；② 正确下载后用同尺寸 padded calc 覆盖 `updates\SpeakType-Setup-0.17.3.exe` → 点安装 → 计算器启动 | §7.1：`installerReady()` 仅比 size 且下载成功路径不比；忽略 API `digest`；`spawn` 直接执行 | §7.1 建议 1–3（fail-closed digest 校验 + size 校验 + 签名） |
| **P1-310-2** | P1 | 下载重定向无 host 白名单，可被引到任意 origin 并接受其字节 | mock 对 `/download/...` 返回 302 → 其他端口 → `EVIL GET` 出现 → UI ready | §7.2：`download.ts` redirect 回调无条件 `followRedirect()`；tag/fileName 无格式校验 | host 白名单 + tag/fileName 正则 |
| **P1-310-3** | P1 | 完整下载后重启，About 显示「安装并重启」但点击无任何反应，用户被卡死 | 下载完成 → 不点安装 → 退出 → 重启 → About → 点「安装并重启」 | §7.3：`updateState()` 从磁盘判 ready 而 `downloadedPath` 未赋值，`installUpdate()` 首行 `return` | `installUpdate()` 回退 `installerReady()`（先 hash）；缺文件转 error 态 |
| **P2-310-1** | P2 | 更新错误/发现 UX：无「已是最新」与手动检查；检查超时/坏 JSON 零反馈；下载错误原文为技术串 | `api=same` / `api-timeout` / `api-badjson` / 404/500/ENOSPC | §8：`AboutTab` null 即不渲染；`checkUpdate()` catch 仅记日志；错误串直接 `t()` 插值 | 增加 idle/checking/upToDate/checkFailed 四态；错误码映射为五语可行动文案（如「网络不可用，请检查连接后重试」「磁盘空间不足，需约 100MB」），技术串留日志 |
| **P2-310-2** | P2 | 默认设置启动 5s 后自动请求 api.github.com，无开关；官网「一切离线」未披露 | 删 `latest-release.json`，启动不动 UI，netstat 抓 `140.82.116.5:443` | §7.4：`index.ts:592` 无条件 prefetch | 设置开关 + 隐私文案 |
| **P3-310-1** | P3（需产品定契约） | F8 后 Alt+Tab：原文不变，但剪贴板留下改写结果、history +1 | 选中文字 → F8 → 改写返回前 Alt+Tab | 焦点变化时走「结果留剪贴板」兜底（官网 FAQ 明文描述） | 若维持文档行为，308 的 sentinel 恢复要求应撤销；若要恢复原剪贴板，需在兜底路径末尾 `restoreClipboard()` 并 toast 说明 |
| **P3-310-2** | P3（观察） | 原配方 2s+80ms+2s 排队两句得到相同文本 | 循环假麦 fixture，两次等长 hold | 假麦每次录到相同开头是主要可能；`queued`/`resumed queued` 机制与不同时长结果均正常 | 下一轮换两段不同 wav 的 fixture 复测后再决定是否立案 |
| **P3-310-3** | P3 | Parakeet int8 句首 `Ple schedule…`（fp32 同 fixture 为 `Please…`） | int8 + `en1.wav` 2.5s hold | 未隔离（假麦起始帧 vs int8 量化） | 用真麦/更长前导静音复测；若稳定复现考虑首帧 padding |
| **P3-310-4** | P3 | About 无官网入口；「版本/更新/开源」信息尚可 | 打开 About | `AboutTab.tsx` 仅 Releases/GitHub/MIT/Issues 链接 | 加 `speaktype.zalize.com`（按界面语言 `/zh/`） |
| **P3-310-5** | P3 | 「刚才没录上」文案在鼠标键映射下仍说「按住」，不提当前键 | 映射侧键 → busy-loop starved | toast 文案静态 | 插值当前按住键名（如「请再按住 侧键 说一次」） |
| **P3-310-6** | P3 | 官网 hero 下载 CTA 固定 `v0.17.2` 直链而非 `releases/latest`，发版后需同步改站 | 查看 `/` 与 `/zh/` CTA href | #405 版式写死版本 | 用 `/releases/latest/download/<name>` 需固定文件名，或构建时注入版本并加 CI-free 校验脚本 |
| **P3-310-7** | P3 | 同一 API 被 `fetchLatestTag()` 与 `checkUpdate()` 各请求一次，About 打开即两条 GET | 启动后开 About，看 mock 日志 | 两处独立缓存 | `checkUpdate()` 复用 `fetchLatestTag` 结果或共享 24h 缓存 |

---

## 11. 与 309 轮主控结论的对照

- 309 轮 A–H「全绿」中的 #406 项（首按不被吞、starved toast、retry 相位、cold-load 提示、prewarm）本轮**独立复现全部成立**，且补齐了 309 未测的鼠标按住键（中键/侧键长按、短敲、starved 三项通过）。
- 309 轮未覆盖的 #404 是本轮全部 P1 的来源；外部贡献代码的功能骨架（检查/进度/续传/静默安装/真实升级/portable/五语布局）实测可用，缺的是安全闭环与两个边缘态。

---

## 建议下一轮（311）验收点

1. **P1-310-1 修复验证**：mock 返回带 `digest` 的 latest → 正确包 ready；篡改同尺寸/错误尺寸/无 digest 三例均**拒绝 ready** 并有五语可行动文案；`.part.json` 出现非空 `etag`；缓存文件重启后重新 hash。
2. **P1-310-2**：`redirect-other` 必须 abort 并报错，无 `EVIL GET` 之后的 ready；github.com → objects.githubusercontent.com 正常路径仍成功（用副本 B 改成两级本地 host 模拟）。
3. **P1-310-3**：完整下载 → 重启 → 点「安装并重启」→ 出现 `update install:` 日志并升级成功；手删 `updates\*.exe` 后点击应转错误态并可重下。
4. **P2-310-1/2**：About 四态（检查中/已最新/有新版/检查失败）五语 820px；「自动检查更新」开关关闭后启动 60s netstat 无外联；官网 FAQ 隐私段落更新。
5. 独立 `dictionary.json`：先制造真实自学习词条（Round 282 配方），再走 0.17.2→新版真实升级核对文件 hash。
6. 真实 LLM F8：老板授权一个可用配置后补测成功改写 + Alt+Tab 契约（按 P3-310-1 决定）。
7. 排队两句改用两段不同 wav（`zh1.wav`/`zh2.wav`）复测 P3-310-2；Parakeet int8 句首 P3-310-3 用真麦复测。
8. 正式域名文案：不改 URL、用 dlproxy 仅做 TCP 层停滞（或 `hf-mirror.com` 真实慢源），确认 2/3 显示 `hf-mirror.com`。
9. DPI 125%/150%（若能拿到可改 DPI 的 VM）下 toast/About/悬浮条几何。
10. 手机麦：真实手机跨设备一次；`freePort()` TOCTOU 用 `--inspect` 断点在 `freePort()` 返回后占端口复现。
