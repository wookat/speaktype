# SpeakType 第 311 轮严格体验官验收报告（packaged 0.19.0 @ main 5086c0b）

> **给老板的结论（可直接转发）**：#420 更新链路 fail-closed 在打包版独立复核全部坐实——同尺寸篡改包、错误重定向、无哈希发布、安装前二次篡改四条攻击路径都被拒（含 #408 重启后缓存 ready 的「安装并重启」真的走到 `verifying → update install:`），真实 GitHub v0.19.0 安装包 sha256 与 `SHA256SUMS.txt` 一致，可以随 0.19.x 发布。三个外部 PR 中 #411 麦克风冷启动提示与 #419/#417 VAD 内置 + 依赖升级实测通过；**#415 FireRedASR 只能有条件接收**：普通话/粤语/三种方言样本落字正常、快语速不截断、静音兜底不落字，但英文输出全大写且缺字母（`SCHEDUL`/`TOORROW`），中文默认完全无标点——与「中英双语精度优先」的文案不符，建议先改文案并在选 FireRed 时引导开启增强标点。另发现 **官网仍分发 v0.17.2（带 310 轮 3 条 P1 的旧更新器）且只列 4 档模型**（P1-311-1），P2-310-1/-2 仍复现，本轮补齐 About 四态 + 开关 + 隐私文案五语设计稿。

---

## 0. 范围、环境与方法

| 项 | 值 |
|---|---|
| 被测版本 | `main` 5086c0b（v0.19.0，含 #408/#410/#411/#412/#415/#417/#418/#419/#420），`cd desktop && npm install && npm run typecheck && npm run build && npm run pack:dir` 全部成功（Node 20.19.0 EBADENGINE 警告忽略） |
| 被测二进制 | `desktop\release\win-unpacked\SpeakType.exe`，`main.log`：`SpeakType 0.19.0 starting (packaged=true)`；**未测 dev 模式** |
| 依赖实测 | `node_modules/sherpa-onnx-node` 1.13.7、`electron` 43.6.0、electron-builder 26.15.3 |
| 正式 asar | `resources\app.asar` sha256 `451b33cd754c2b95099767267f3505e706f911b46aa82d2d43c7fecf3992d81b`（36 754 472 B，mtime 00:44:14Z = 打包时刻，测毕复核未变；字节扫描 `https://api.github.com/` ×2、`githubusercontent\.com` ×1 均为原文） |
| 环境 | Windows Server 2022 (10.0.20348) VM，1280×720 @100%（DPI 125%/150% 本 VM 改不了 → **未测**），无真实麦克风 |
| 注入手法 | koffi→`user32!keybd_event`（`rkey.mjs`）、CDP 9333/9343/9353 150 ms 轮询 panel/toast（`cdppoll.mjs`）、假麦 `--use-file-for-fake-audio-capture`（kokoro TTS 生成 zh1/zh2/en1/zhen/fast/enfast + 公开 wav：粤语 sv-yue、四川/天津/河南 fr-3/4/5）、本地 mock GitHub API + objects + evil 三 host（`mockgh.mjs` 127.0.0.1:18990 / 127.0.0.2:18991 / 127.0.0.3:18992）、asar **等长字节补丁只打隔离副本 B**（`buildB.mjs`：`https://api.github.com/`→`http://127.0.0.1:18990/`，信任正则 `githubusercontent\.com`→`127\.0\.0\.[12]\|qqq\.z`），LAN WebSocket 手机模拟器（`phone.mjs`），portable 模式全新 profile，junction 模拟中文用户名路径。**未改防火墙/hosts/产品代码，无 PR，GitHub Actions 保持禁用** |
| 证据根目录（本机） | `C:\Users\Administrator\r311\evidence\`（截图 `NN_*.png`、`upd_*.log`、`batch_*.log`、`cdp_*.log`、`rss_*.csv`、`phone_*.log`、`netcap_default_60s.txt`、`real_gh_SHA256SUMS_v0.19.0.txt`）；harness 脚本在 `C:\Users\Administrator\r311\*.mjs|ps1` |
| 录屏 | `C:\Users\Administrator\r311\round311\round311-edited.mp4`（带 setup/test_start/assertion 注释；`round311-clean.mp4` 无注释版，`round311-raw-*.mkv` 原始分段全部保留） |

**证据分级约定**：PASS/FAIL 只引用打包版 runtime 一手证据（main.log 原文 / history.json 切片 / CDP 度量 / mock HTTP 日志 / 截图）；「未测」= 本轮没有 runtime 证据，不以源码阅读或 #420 评论中主控代理的结论替代。日志时间为 VM 本地时间（= UTC）。

**假麦注意**：Chromium 假音频文件到尾后**循环重放**，`batch_firered.log` 的 hold 比 wav 长 700 ms，因此 FireRed 批次每条尾部多出 1–2 字重复（`…给他答复帮我`）——这是 harness 伪影，不计入模型错误；SenseVoice 对照批次 hold = wav 长度，无此伪影。

---

## 1. 总览矩阵

### 1.1 核心链路回归（每轮必做）

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| C1 | RightCtrl 按住说话落字 Notepad（SenseVoice zh1） | **PASS** | `03_rightctrl_zh1_notepad.png`；history 01:13:56 `帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复帮` |
| C2 | 排队第二句：**两段不同 wav** zh1→zh2，`queued` + `resumed queued`，两条历史不同（闭环 P3-310-2） | **PASS** | main.log 01:14:41.488 `dictation start: previous session still finalizing, queued` → 01:14:41.880 `dictation start: resumed queued hold (frames=1, released=false)`；history 01:14:41 `帮我跟老板说，…给他答复` / 01:14:46 `今天下午3点的会议改到明天，记得提前把资料发给大家`；`04_queue_zh1_zh2_notepad.png` |
| C3 | Alt+Q 进出免按 | **PASS** | 01:17:14.313 `dictation handsFree exit: byToggle stage=recording elapsedMs=5125`；history 01:16:58 / 01:17:09 / 01:17:14 三段 |
| C4 | 录音中 Esc 取消（不弹开始菜单） | **PASS** | 01:15:50.603 `dictation cancel: byEsc=true stage=recording handsFree=false elapsedMs=1674`；`05_esc_cancel_no_startmenu.png` |
| C5 | F8 mock 改写 | **PASS** | history 01:19:44 text=`MOCK-REWRITE-OK` raw=`Please schedule a meeting with the design team for tomorrow morning.`；mock `chat.log` 收到 rewrite prompt；`07_f8_mock_rewrite.png` |
| C6 | 深色模式 | **PASS** | `08_dark_home.png`、`09_dark_toast_nofocus.png`（toast 深色底、无焦点提示可读） |
| C7 | 免按段落空行（停顿后分段） | **PASS** | `06_handsfree_paragraph_breaks.png`：两段之间空行；history 01:16:58 与 01:17:09 两条独立记录 |
| C8 | SenseVoice zh 一句 | **PASS** | 同 C1 |
| C9 | Parakeet int8 en 一句 | **PASS** | 02:20:38 `sherpa model loaded (parakeet-tdt-0.6b-v3) in 2228ms`；history 02:21:56 `Please schedule a meeting with the design team for tomorrow morning. Please schedule a meeting.`（尾部为假麦循环伪影）；**首词 `Please` 完整**（P3-310-3 的 `Ple` 本轮 1/1 未复现） |
| C10 | whisper base ja 一句 | **PASS** | 02:22:20 `download ok: huggingface.co -> ggml-base-q5_1.bin`，02:23:13 `local whisper-server starting (model=base-q5_1, port=64583)`；history 02:23:23 `うちの中学は弁当制で持っていけない場合は50円の学校販売のパンを買う` |
| C11 | 手机麦 owner 隔离 b-①②③（LAN） | **PASS** | §2.2：手机会话期间 RightCtrl 松开与 F8 均被忽略（`hold release ignored, phone session in progress` / `rewrite release ignored…`），history `source:"phone"`；Esc 取消手机会话 `dictation cancel: byEsc=true … elapsedMs=2957`，手机端收到 idle |
| C12 | 端口竞态 a-③ | **PASS** | 占用 43117 后 `remote mic listening at https://172.16.0.2:43118/?t=…` |

### 1.2 专项 a）#420 + #408 更新链路独立复核（自建 mockgh + 副本 B，不复用主控补丁）

| # | 场景 | 期望 | 结果 | 证据（`upd_*.log` / 截图） |
|---|---|---|---|---|
| A1 | latest 带正确 `digest` → 下载 | ready「安装并重启」 | **PASS** | `upd_A1_digest_ok.log`：card `Install & restart`；main.log `update installer ready: SpeakType-Setup-0.19.1.exe`；`20_upd_A1_ready_en.png` |
| A2 | 同尺寸篡改包（45 056 B，另一 sha） | error、无 ready | **PASS** | `upd_A2_tamper_same_size.log`：card `Retry … Download failed: sha256 mismatch (127.0.0.1:18990)`；main.log `update download failed Error: sha256 mismatch`；`updates\` 无残留 exe |
| A3 | API `size` 错（99999）但正文正确 | — | **PASS（行为需知悉，见 P3-311-1）** | 同会话仍 ready（digest 匹配即 ready，size 不参与下载校验）；`upd_A3b_wrong_size_restart.log` 重启后 `installerReady()` 尺寸不符 → 回到「Download installer」，旧文件残留；按钮显示 `(0MB)` |
| A4 | 无 `digest`、有 `SHA256SUMS.txt` | 仍可更新 | **PASS** | `upd_A4_sums_fallback.log`：mockgh `GET /download/v0.19.1/SHA256SUMS.txt` → ready；`23_upd_A4_sums_ready_en.png` |
| A5 | 两者皆无 | 无下载按钮，只剩 Releases 提示 | **PASS** | card `New version v0.19.1 is available: Releases`（无按钮）；B main.log `update v0.19.1: no sha256 for SpeakType-Setup-0.19.1.exe (asset digest / SHA256SUMS.txt), in-app update disabled`；`24_upd_A5_nodigest_en.png` |
| A6 | 302 → 本地另一 host（127.0.0.3，不在白名单） | 立即 error、无 `.part` | **PASS** | `upd_A6_redirect_evil.log`：card `Download failed: redirect to untrusted host 127.0.0.3`；mockgh `302 -> 127.0.0.3:18992 (untrusted)`；`updates\` 空 |
| A7 | 两级 host 模拟 github.com→objects.githubusercontent.com | 正常 ready | **PASS** | `upd_A7_redirect_trusted_2hop.log`：mockgh `302 -> 127.0.0.2:18991 (trusted)` → `OBJ sent 45056B (good)` → ready |
| A8 | 缓存 ready 重启后点「安装并重启」（#408） | `verifying` → `update install:` | **PASS** | `upd_A8_cached_ready_install.log` + 补跑 `upd_A8b_cached_ready_install_log.log`：card `100% · Verifying…`；B main.log 02:55:02.552 `update install: quitting and running C:\…\B\SpeakType-data\updates\SpeakType-Setup-0.19.1.exe`（mock 包为 45 KB 无害 MZ 桩，**未做真实覆盖安装**） |
| A9 | 手删 `updates\*.exe` 后重启（ready 缓存已失效） | 不得静默 | **PASS** | `upd_A9_delete_then_install.log`：重启后 `installerReady()` 为 null → 直接回到「Download installer」，无空转 |
| A9b | 同会话 ready 后手删再点安装 | error + 可重下 | **PASS（错误串技术化，归 P2-311-3）** | `upd_A9b_same_session_delete.log`：card `Retry … Download failed: ENOENT: no such file or directory, open 'C:\…\updates\SpeakType-Setup-0.19.1.exe'`；main.log `update install verify failed Error: ENOENT`；点 Retry → 重下 → ready |
| A10 | 点「安装并重启」前把文件换成同尺寸篡改包 | 拒装、进程不退 | **PASS** | `upd_A10_tamper_before_install.log`：card `Download failed: sha256 mismatch (installer)`；`updates dir:` 空（文件已删）；`B still running: true`；`30_upd_A10_install_tamper_refused_en.png` |
| A11 | 五语 820px ready / error / 无按钮三态 | 无截断 | **PASS** | `31_upd_820_{en,zh-CN,zh-TW,ja,ko}_ready.png`、`32_…_error.png`、`33_…_nobutton.png`（`upd_A11_820_*.log` 记录 `viewport width 820`，zh-CN 例：`新版本 v0.19.1 已发布，前往下载： 重试 Releases 下载失败：sha256 mismatch (installer)` 单行未折断） |
| A12 | 真实 GitHub 路径一次 | digest + 302 到 `release-assets.githubusercontent.com` | **部分 PASS** | API `releases/latest` 本 IP 403 限额 → 未拿到真实 `digest` 字段（**未测**）；直连安装包：302 → `release-assets.githubusercontent.com` → 200，103 340 522 B，sha256 `4af85aa14ed4f0cba2051ed2d535ceea341c2bed12d28f7b1c49973bba41ee81`，与官方 `SHA256SUMS.txt`（`real_gh_SHA256SUMS_v0.19.0.txt`）一致 |
| A13 | 请求与更新日志抓取 | — | **PASS** | 每场景 `upd_*.log` 含 mockgh 请求行 + main.log 切片；更新请求 `useSessionCookies:false`、`cache:"no-store"`（源码 `download.ts`） |

### 1.3 专项 b）#415 FireRedASR 首次验收

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| B1 | 模型页四→五档展示、体积、说明五语 | **PASS（文案见 P3-311-3）** | `50_models5_{zh-CN,en,zh-TW,ja,ko}.png`、`shot5_models.txt`：`SenseVoice Small (234MB) / FireRedASR (740MB) / Parakeet (660MB) / Parakeet 原精度 (2.5GB) / Whisper tiny/base/small`，FireRed 说明五语齐全 |
| B2 | 真源下载 | **PASS** | 01:25:13 `download ok: huggingface.co -> model.int8.onnx in 59.0s`（775 861 420 B）+ `tokens.txt`；`rss_firered_download.csv` |
| B3 | dlproxy 停滞换源一次 | **未测** | 本轮 FireRed 只走真源；停滞换源逻辑属 293 轮已验的 `download.ts` 公共路径，未针对 FireRed 重跑 |
| B4 | 加载时长 | **PASS** | `sherpa model loaded (fire-red-asr2-ctc-zh-en-int8) in 1491ms / 1526ms / 1623ms`（三次），SenseVoice 1103–1352 ms，Parakeet 2228 ms |
| B5 | RSS 对照（`rss.ps1`） | **PASS（记录）** | `rss_clean_SenseVoice.csv` WS 734–764 MB / Private max 724 MB；`rss_clean_FireRedASR.csv` WS 1203–1228 MB / Private max 1217 MB（+~470 MB） |
| B6 | 普通话 zh1/zh2 | **PASS** | history 01:27:06 `帮我跟老板说那个方案需要再改一下明天上午之前给他答复[帮我]`、01:27:19 `今天下午三点的会议改到明天记得提前把资料发给大家[今天]`（[] 为循环伪影）；**无标点**、`3点`→`三点`未规范化（P2-311-2） |
| B7 | 中英混（zhen） | **FAIL（质量）** | FireRed `我们明天用松开会记得把 B D和 EXL表格发到萨群里`；SenseVoice `我们明天永松开会，记得把BBD和excel表格发到萨群里`——Zoom/PPT/Slack 两模型都错，FireRed 英文缩写更差（`EXL`） |
| B8 | 英文 en1 / enfast | **FAIL（质量，P2-311-1）** | `PLEASE SCHEDUL A MEETING WITH THE DESIGN TEAM FOR TOORROW MORNING`；`SCHEDLE THE QUARTER REVIEW MEETING … TOMROW MORNING AT N AND SEND THE AEN TO EVERYONE`；SenseVoice 同句 `Please schedule a meeting with the design team for tomorrow more.` / Parakeet 全对 |
| B9 | 粤语 sv-yue | **PASS** | FireRed 与 SenseVoice 同为 `呢几个字都表达唔到我想讲嘅意思`（下拉说明却写「粤语请换回 sensevoice-small」，文案偏保守） |
| B10 | 四川 / 天津 / 河南样本 | **PASS** | 01:28:17 `自己就是在那个在那个就是在情节里面就是感觉是演的特别好就是好像很真实一样你知道吧`；01:28:34 `其实他就是话嘛每个人就可以守法就这意思法律意识太单薄了，而且就是也不顾及到别人的感受`；01:28:50 `它这个管一向都通到有时候都通到七八层楼高，然后它的管一向就可以浇到那那柱子上`——与 SenseVoice 字级差异 ≤3 字，无一方明显更优 |
| B11 | 快语速 ≥8 字/s 不截断（1.13.5） | **PASS** | `fast.wav` 47 字 / voiced 5.2 s ≈ 9 字/s：FireRed `把这关于三季度市场推广预算的详细报告在今天下班之前发送给财务部和场部的所有负责人并且抄送给我` 到句尾；SenseVoice `马这峰关于…并且抄送给` 丢句尾「我」；`fast300`/`enfast300` 亦到尾。两模型句首 `请把这份` 均错（TTS 伪影，不判） |
| B12 | 识别语言下拉禁用态文案 | **PASS** | `11_firered_language_dropdown_disabled_en.png`：下拉 disabled，值 `自动（中英双语，含中文方言）`，说明五语齐全 |
| B13 | `<sil>` 兜底：静音 hold | **PASS** | 数字静音（maxPeak=0）：#411 面板提示 + `No mic input` toast，不落字不入历史（`cdp_firered_silence.log`，history 47→47）；低幅噪声（maxPeak=1388）：`Transcribing…` → `Didn't catch that No speech detected — try again`，不落字不入历史（`cdp_firered_noise_sil.log`） |
| B14 | 切 FireRed↔SenseVoice 期间按住 | **PASS** | `cdp_switch_model.log`：切换中按住 → 模型加载完 `sherpa model loaded (fire-red-asr2-ctc-zh-en-int8) in 1526ms` → `Transcribing…` → 正常落字，无卡死/无空 toast |
| B15 | 出字用时（finalize→history） | **记录** | FireRed 1.46–2.51 s（8.4 s 音频 2.41 s，RTF≈0.29）；SenseVoice 0.60–0.69 s（流式已预处理）。文案「10 秒语音约 2 秒」在本 VM 略乐观（≈3 s） |
| B16 | 首词完整性对照（P3-310-3） | **PASS** | FireRed/SenseVoice/Parakeet 三模型 zh1/en1 首词 `帮我`/`Please`/`PLEASE` 均完整 |
| B17 | 真实麦克风口语 | **未测** | VM 无麦，全部经假音频设备 |

### 1.4 专项 c）#411 麦克风冷启动可见化

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| M1 | 假麦静音源触发面板提示 | **PASS** | `cdp_micsilent_timing.log`：`down:rctrl` 02:27:35.758 → 02:27:37.489 Panel `No microphone input detected — the device may be sleeping; press again`（**+1731 ms**，源码 `MIC_SILENT_HINT_MS=1500` + 150 ms 轮询 + 首帧 ~230 ms）；`10_mic_silent_panel_hint_en.png` |
| M2 | 真正无输入设备 | **PASS（不同路径）** | `cdp_nodevice.log`：`Microphone unavailable No microphone found` toast，main.log `dictation cancel: byEsc=false stage=recording … elapsedMs=13`——设备不存在走既有「不可用」路径，不出 #411 提示（合理：#411 针对「设备在但静音」） |
| M3 | 与「没听清」/starved toast 关系 | **PASS** | 松开后面板提示消失、出 `No mic input …` toast（02:27:39.302）；低幅噪声时不出面板提示、只出 `Didn't catch that`（B13）——两套提示按 `maxPeak` 阈值互斥，无叠加 |
| M4 | 五语文案 | **PASS（源码 + en runtime）** | en runtime 见 M1；zh-CN/zh-TW/ja/ko 字串在 `locales/*.ts` 存在，**runtime 只截了 en**（其余四语未截图 → 部分未测） |
| M5 | 正常说话不误报 zh×5 / en×5 | **PASS** | `batch_firered_fp.log` zh1/zh2 ×5、en1 ×5，`cdp_falsepos_firered.log` 全程 0 条 `No microphone input`；SenseVoice 对照批 9 条正常语音 0 误报（唯一一条出现在 `silence` fixture） |
| M6 | 免按模式下静音源 | **观察（P3-311-4）** | `cdp_vad_handsfree.log` 02:15:05.781：段落结束后假麦回到数字静音 1.5 s，面板再次出现 `No microphone input detected`——真实麦有底噪不易触发，静音/被独占的麦在免按下会反复闪提示 |

### 1.5 专项 d）#419 VAD 内置 + #417 依赖升级回归

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| V1 | 全新 profile 开启增强人声检测立即「已就绪」 | **PASS** | `41_vad_fresh_profile_ready_immediately.png`（portable 全新 profile） |
| V2 | `%APPDATA%\SpeakType\vad` 不存在/不创建 | **PASS** | 正式 profile 目录列表无 `vad\`（§9） |
| V3 | 日志 `silero vad loaded <resourcesPath>\vad\silero_vad.onnx` | **PASS** | 02:19:26.486 `silero vad loaded C:\Users\Administrator\repos\speaktype\desktop\release\win-unpacked\resources\vad\silero_vad.onnx` |
| V4 | 免按真跑 Silero 分句 | **PASS** | `cdp_vad_handsfree.log` 逐句字幕 + `42_vad_silero_handsfree_notepad.png`；finalize `voicedMs=4672`（Silero 计时） |
| V5 | 旧 profile 带 `vad\silero_vad.onnx` 仍优先内置 | **PASS** | 先放 dummy、再放合法模型到 profile `vad\`，两次日志均加载 `…\resources\vad\silero_vad.onnx`（02:41:38.255），落字 zh2 正确 |
| V6 | 标点模型在中文用户名路径初始化（1.13.7） | **PASS** | junction `C:\Users\Administrator\r311\中文用户名` → portable profile；02:43:41 `punct model downloaded`（294 372 519 B）；02:47:24 finalize → 02:47:26.119 `punct worker started` → history 02:47:26 `帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复`（raw 无标点，与 manifest 原句逐字一致）；`punct_cjk_junction_main.log` |
| V7 | FireRed 在中文路径加载 | **PASS** | 02:43:05 `sherpa model loaded (fire-red-asr2-ctc-zh-en-int8) in 1623ms` |
| V8 | Electron 43.6.0 / sherpa 1.13.7 回归 | **PASS** | §1.1 全部核心链路在该组合上通过 |

### 1.6 专项 e）P2-310-1 / P2-310-2 复核

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| E1 | P2-310-1 About 无「检查中/已最新/检查失败」态 | **仍复现（FAIL）** | `51_about5_*.png`：About 只有版本、Releases、日志、开源、隐私区块；`checkUpdate()` 失败只 `log.warn("update check failed")` 返回 null，UI 无态（`updater.ts:143-147`）；A9b 错误串 `ENOENT: no such file or directory, open 'C:\…'` 直接上屏 |
| E2 | P2-310-2 启动自动请求 api.github.com 无开关 | **仍复现（FAIL）** | 全新默认 portable profile 启动 60 s netstat：唯一外联 `20.29.134.17:443 first=5.5s`（= `api.github.com`，`netcap_default_60s.txt`）；源码 `index.ts` `setTimeout(() => void fetchLatestTag()…, 5000)`，失败每 30 min 重试；正式 profile 01:48:58 `latest release prefetched: v0.19.0` 并写 `latest-release.json`；设置页无任何「自动检查更新」开关 |
| E3 | 官网隐私文案对照 | **不一致（并入 E2）** | `docs/zh/index.html:351`「一次性下载模型…之后**一切都离线运行**」、`:145`「识别默认在你的电脑上完成」；`docs/index.html:352`「…**everything runs offline**」、`:347`「SpeakType operates no servers and collects nothing」。启动即向 GitHub 发送含 IP/UA 的请求未披露 |
| E4 | 四态 + 开关 + 隐私文案五语设计稿 | **完成** | §10 |

### 1.7 专项 f）新用户自由发掘

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| F1 | 官网 → 下载 | **FAIL（P1-311-1）** | 本机 `curl https://speaktype.zalize.com/` 02:58Z：hero 下载链接 `releases/download/v0.17.2/SpeakType-Setup-0.17.2.exe`，「4 档离线模型」，与 `docs/index.html:90,94,130` 一致；最新 release 为 v0.19.0 |
| F2 | 首装 → 首页 → 选模型 → 首次落字 → About | **PASS** | `01_first_launch_home_en.png`、`02_sensevoice_download_verifying.png`（默认 SenseVoice，下载校验有进度）、`03_*`、`51_about5_en.png` |
| F3 | 选 FireRed 的引导 | **观察（P2-311-2 / P3-311-3）** | 说明文案建议「开启增强标点」，但选中 FireRed 后没有任何入口/提示直达增强标点（需自己向下找 281 MB 附加包）；服务商标签仍写「内置离线识别（SenseVoice / Parakeet）」 |
| F4 | 竞品「模型选择引导」对比 | **完成（二手资料）** | §11；Wispr Flow / Typeless 官方帮助中心为一手文档，讯飞语记未找到可靠一手资料 → 标注 |
| F5 | 连续 30 分钟探索 | **部分** | 以脚本 + 手动组合覆盖整条新用户路径，非连续 30 min 计时 |

### 1.8 未测清单（无 runtime 证据）

- DPI 125% / 150%（VM 不可改）
- 真实覆盖安装（按任务要求以 `update install:` 日志为终点）
- 真实 GitHub API `releases/latest` 的 `digest` 字段（403 限额；`SHA256SUMS.txt` 回退路径与安装包 sha256 已真实验证）
- FireRed dlproxy 停滞换源
- #411 面板提示 zh-CN/zh-TW/ja/ko 的 runtime 截图（仅 en）
- 真实麦克风 / 真人口语（含 FireRed 方言真人）
- 讯飞语记的模型选择引导一手体验
- macOS 预览版

---

## 2. 核心链路证据摘录

### 2.1 排队第二句（两段不同 wav）

```
[2026-09-09 01:14:35.582] [debug] escblock: hook installed                     ← zh1 hold
[2026-09-09 01:14:41.488] [info]  dictation start: previous session still finalizing, queued
[2026-09-09 01:14:41.880] [info]  dictation start: resumed queued hold (frames=1, released=false)
[2026-09-09 01:14:46.969] [debug] escblock: hook uninstalled                   ← zh2 release
```
history.json：`01:14:41.872 5669ms "帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复"` → `01:14:46.962 4882ms "今天下午3点的会议改到明天，记得提前把资料发给大家"`。

### 2.2 手机麦 owner 隔离 + 端口竞态

```
[02:30:44.109] dictation pcm: first frame after 4ms (session=true)             ← phone start
[02:30:48.561] dictation stop: hold release ignored, phone session in progress   ← b-① RightCtrl 松开被忽略
[02:30:50.173] dictation stop: rewrite release ignored, phone session in progress ← b-② F8 被忽略
[02:30:53.176] dictation finalize: durationMs=9071 maxPeak=11569 voicedMs=7740
history: {"text":"帮我跟老板说那个方案需要再改一下明天上午之前给他答复帮我跟老板说那个方案需要再改一","source":"phone","durationMs":9071}
[02:31:19.483] dictation pcm: first frame after 8ms (session=true)
[02:31:22.432] dictation cancel: byEsc=true stage=recording handsFree=false elapsedMs=2957  ← b-③ Esc 取消手机会话
TCP 0.0.0.0:43117 LISTENING （外部占用）
[02:31:55.065] remote mic listening at https://172.16.0.2:43118/?t=<token>     ← a-③ 顺延到 43118
```

---

## 3. 专项 a）更新链路证据摘录

A2 同尺寸篡改：
```
mockgh: 01:52:09.001 API sent 45056B (tamper) status=200
[2026-09-09 01:52:09.044] [warn]  update download failed Error: sha256 mismatch (127.0.0.1:18990)
card: New version v0.19.1 is available: Retry Releases Download failed: sha256 mismatch (127.0.0.1:18990)
```
A5 两者皆无：
```
[2026-09-09 02:01:58.332] [warn]  update v0.19.1: no sha256 for SpeakType-Setup-0.19.1.exe (asset digest / SHA256SUMS.txt), in-app update disabled
card: New version v0.19.1 is available: Releases        ← 无下载按钮
```
A6 / A7 重定向：
```
mockgh: 01:54:42.290 API 302 -> 127.0.0.3:18992 (untrusted)
[2026-09-09 01:54:42.282] [warn]  update download failed Error: redirect to untrusted host 127.0.0.3
mockgh: 01:54:53.218 API 302 -> 127.0.0.2:18991 (trusted)
mockgh: 01:54:53.226 OBJ sent 45056B (good) status=200
[2026-09-09 01:54:53.249] [info]  update installer ready: SpeakType-Setup-0.19.1.exe
```
A8 缓存 ready → 安装（#408）：
```
seeded C:/…/B/SpeakType-data/updates/SpeakType-Setup-0.19.1.exe (45056B)   ← 重启前缓存
card: New version v0.19.1 is available: Install & restart Releases            ← 重启后直接 ready
click: clicked Install & restart
card: New version v0.19.1 is available: Releases 100% · Verifying…
[2026-09-09 02:55:02.552] [info]  update install: quitting and running C:\Users\Administrator\r311\B\SpeakType-data\updates\SpeakType-Setup-0.19.1.exe
```
A9b 同会话删文件：
```
[2026-09-09 01:56:37.334] [warn]  update install verify failed Error: ENOENT: no such file or directory, open 'C:\…\updates\SpeakType-Setup-0.19.1.exe'
card: … Retry Releases Download failed: ENOENT: no such file or directory, open 'C:\Users\Administrator\r311\B\SpeakType-data\updates\SpeakType-Setup-0.19.1.exe'
click: clicked Retry → card: … Install & restart          ← 可重下
```
A10 安装前篡改：
```
replaced installer with tamper.exe (45056B)
card: New version v0.19.1 is available: Releases 100% · Verifying…
card: New version v0.19.1 is available: Retry Releases Download failed: sha256 mismatch (installer)
updates dir: (空)   B still running: true
```
真实 GitHub：`GET https://github.com/wookat/speaktype/releases/download/v0.19.0/SpeakType-Setup-0.19.0.exe` → 302 `release-assets.githubusercontent.com` → 200，103 340 522 B，sha256 `4af85aa1…1ee81` = `SHA256SUMS.txt` 对应行。

---

## 4. 专项 b）FireRed 证据摘录（同 fixture 三模型对照）

| fixture（原句） | FireRedASR | SenseVoice Small | 备注 |
|---|---|---|---|
| zh1 帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复 | 帮我跟老板说那个方案需要再改一下明天上午之前给他答复 | 帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复 | FireRed 无标点 |
| zh2 今天下午3点的会议改到明天，记得提前把资料发给大家 | 今天下午三点的会议改到明天记得提前把资料发给大家 | 今天下午3点的会议改到明天，记得提前把资料发给大家 | FireRed 数字未规范化 |
| en1 Please schedule a meeting with the design team for tomorrow morning. | PLEASE SCHEDUL A MEETING WITH THE DESIGN TEAM FOR TOORROW MORNING | Please schedule a meeting with the design team for tomorrow more. | Parakeet int8 全对 |
| zhen …用Zoom开会，记得把PPT和Excel表格发到Slack群里 | 我们明天用松开会记得把 B D和 EXL表格发到萨群里 | 我们明天永松开会，记得把BBD和excel表格发到萨群里 | 两者皆错 |
| sv-yue（粤语） | 呢几个字都表达唔到我想讲嘅意思 | 同 | 一致 |
| fast（47 字 / 5.2 s） | 把这关于三季度…并且抄送给我 | 马这峰关于三季度…并且抄送给 | FireRed 到句尾，SenseVoice 丢尾 |
| enfast | SCHEDLE THE QUARTER REVIEW MEETING … TOMROW MORNING AT N AND SEND THE AEN … | We scheduled the Qua review meeting … at nine and send the agenda … | FireRed 缺字母严重 |

RSS（`rss.ps1`，模型就绪后 60 s 采样）：SenseVoice WS 734–764 MB；FireRed WS 1203–1228 MB。

---

## 5. 专项 c）/ d）证据摘录

```
02:27:35.758 down:rctrl（静音源）
02:27:37.489 Panel: No microphone input detected — the device may be sleeping; press again   (+1731 ms)
02:27:39.263 up:rctrl
02:27:39.302 Toast: No mic input  No sound was captured: the mic may be asleep, muted, or held by another app. Pressing again usually wakes it; if it persists, check the input device in Settings → Speech
02:07:22.289 Toast: Microphone unavailable  No microphone found                               （真正无设备）
[2026-09-09 02:19:26.486] [info]  silero vad loaded C:\…\win-unpacked\resources\vad\silero_vad.onnx
[2026-09-09 02:43:03.856] [info]  sherpa worker started (fire-red-asr2-ctc-zh-en-int8)         （profile 在 …\中文用户名\）
[2026-09-09 02:43:41.490] [info]  punct model downloaded
[2026-09-09 02:47:26.119] [info]  punct worker started
history 02:47:26 "帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复" raw="帮我跟老板说那个方案需要再改一下明天上午之前给他答复"
```

---

## 6. 更新链路安全 / 隐私专节

### 6.1 完整性（P1-310-1 → 已修，PASS）
- 下载正文 sha256 ≠ `digest` → 删 `.part`、error（A2）；`digest` 缺失 → `SHA256SUMS.txt`（A4）；两者皆无 → 不提供应用内更新（A5，日志可查）。
- 安装前重算 sha256（A10）：同尺寸篡改被拒，文件删除，进程不退。
- 真实 v0.19.0 安装包哈希与官方 `SHA256SUMS.txt` 一致；`digest` 字段因限额未直接验证。
- 残余风险：`SHA256SUMS.txt` 与安装包同源同信道，能改 release 资产的人可同时改二者（设计已知，`digest` 优先即为此）；未签名（Authenticode `NotSigned`）仍是 SmartScreen 与「篡改后重新发布」的根本短板。

### 6.2 重定向（P1-310-2 → 已修，PASS）
- 每跳手动跟随、host 只允许 `*.github.com` / `*.githubusercontent.com`（A6/A7）。副本 B 仅把正则后半段替换为本地白名单，前半段 `github\.com` 原样保留。

### 6.3 缓存 ready 空转（P1-310-3 / #408 → 已修，PASS）
- 重启后 `installerReady()` 推导 `downloadedPath`，走 `verifying → update install:`（A8）；文件被删走 error + Retry（A9b）；尺寸不符回到下载态（A3b/A9）。

### 6.4 隐私（P2-310-2 → 未修，仍复现）
- 默认设置、全新 profile、未开任何页面：启动 5.5 s 后唯一外联 `api.github.com:443`；60 s 内无其他 host。
- 无开关、无披露；官网 FAQ「一切都离线运行」（zh:351 / en:352）与之矛盾。见 §10 设计稿。

### 6.5 其他观察（非立案或 P3）
- About 打开一次向 `releases/latest` 发两次请求（3 ms 内，A3/A5/A9 mockgh 日志）：`checkUpdate()` 只缓存结果不去重在途请求 → 匿名配额 60/h 双倍消耗（P3-311-2）。
- 更新请求不带 session cookie、`no-store`（源码），UA 为 Chromium 默认。

---

## 7. 外部 PR 验收结论

| PR | 结论 | 依据 |
|---|---|---|
| **#408**（nghqqa，重启恢复 ready 态安装空转） | **验收通过** | A8/A8b `verifying → update install:`；A9/A9b 删文件后不静默；A3b 尺寸不符回到下载态 |
| **#411**（麦克风冷启动可见化） | **验收通过**（附 1 条 P3） | M1 +1.73 s 出提示，M3 与既有 toast 互斥不冲突，M5 zh×5/en×5 零误报；P3-311-4 免按模式静音源反复闪提示；四语 runtime 截图未补 |
| **#415**（FireRedASR v2 CTC int8） | **有条件通过——不建议以「中英双语精度优先」上架** | 通过：五档展示五语、下载/加载/切换、普通话/粤语/三方言落字、快语速不截断（1.13.5）、`<sil>` 兜底、下拉禁用文案。不通过：英文全大写且缺字母（P2-311-1）、中文默认无标点且无增强标点引导（P2-311-2）、服务商/简介文案未提 FireRed（P3-311-3）。建议：文案改为「中文（含方言）优先、英文实验性」或在识别层做英文小写化+拼写兜底；选 FireRed 时内联「开启增强标点」按钮 |
| **#417**（sherpa-onnx-node 1.13.7 + Electron 43.6.0） | **验收通过** | V6 中文路径标点初始化成功（1.13.7 修复点实测）、B11 快语速（1.13.5）、全部核心链路回归通过 |
| **#419**（Silero VAD 内置） | **验收通过**（附 1 条 P3） | V1–V5；P3-311-6：`EnhancedVad.tsx` 仍保留「按需下载 ~3MB」分支与文案（打包版不会走到，死代码） |
| **#420**（我方，fail-closed） | **独立复核通过** | §1.2 A1–A11 全 PASS，与主控 A–E 结论一致，本轮为独立 mock/副本 |

---

## 8. 环境还原核对（PASS）

| 项 | 状态 |
|---|---|
| 正式 `resources\app.asar` | sha256 `451b33cd…2d81b`、mtime 00:44:14Z（打包时刻）未变；字节扫描 URL/正则均为原文；副本 B 在 `C:\Users\Administrator\r311\B\`（仓库外） |
| `whisper-server.exe` | 未改动 |
| mock 进程 | `mockgh.mjs`(18990/18991/18992)、`mockchat.mjs`(18099)、临时 43117 监听、SpeakType 全部结束（`Get-Process node,SpeakType` 空） |
| junction | `r311\中文用户名`、`r311\中文用户` 已 `rmdir`；`punct_real` 已删 |
| `speaktype.json` | 本轮首次启动创建（VM 此前无 profile，`no legacy userData to migrate`），测毕 theme/uiLanguage=system、polishModel 清空、localModel=sensevoice-small |
| `history.json` / `dictionary.json` | 均为本轮测试产生（无历史备份可恢复），保留作证据；`dictionary.json` 未被本轮测试写入 |
| 模型文件 | 正式 profile `models\` 保留 SenseVoice/FireRed/Parakeet/whisper-base（下载产物，非改动） |
| `git status` | 仅 `docs/reviews/round311.md` + `.agents/skills/testing-speaktype-desktop/SKILL.md`（分支 `review/round311-report`） |

---

## 9. 立案清单

### P1-311-1 官网仍分发 v0.17.2，新用户拿不到 0.19.0（含 fail-closed 更新器）与 FireRed
- **复现**：本机 `curl https://speaktype.zalize.com/`（02:58Z）→ hero 按钮 `releases/download/v0.17.2/SpeakType-Setup-0.17.2.exe`，特性区「4 档离线模型」；仓库 `docs/index.html:90,94,130`、`docs/zh/index.html:89,93,129` 同值。
- **影响**：0.17.2 的更新器是 310 轮判定 3 条 P1 的版本（无哈希校验、跟随任意重定向）；新用户装上后靠它「自更新」到 0.19.0 恰恰经过不安全链路；FireRed 在官网不可见。
- **根因**：版本号与链接写死在静态页，发布流程无「官网同步」步骤（JSON-LD `downloadUrl` 已用 `releases/latest`，正文没用）。
- **建议**：hero 按钮改 `releases/latest/download/SpeakType-Setup.exe` 固定名或前端读 `releases/latest` API；`scripts/release` 加 docs 版本号断言；本次先手动改到 0.19.0 并加第五档模型。

### P2-311-1 FireRed 英文输出全大写且缺字母
- **复现**：选 FireRedASR，播放 `en1.wav`/`enfast.wav`（kokoro TTS 英文）→ `PLEASE SCHEDUL A MEETING … TOORROW MORNING` / `SCHEDLE … TOMROW … AEN`；同音频 Parakeet int8 全对，SenseVoice 仅尾词错。
- **根因（推断，未逐层验证）**：FireRedASR2 CTC 英文词表为大写 BPE，int8 量化 + CTC 贪心解码丢 token 后没有语言模型兜底；`asr.ts` 后处理未对 FireRed 英文做大小写/拼写规范化；文案却写「中英双语精度优先」。
- **建议**：① 文案改「中文（含 20 余种方言）优先，英文为实验性、全大写」；② 英文段落做 `toLowerCase` + 句首大写；③ 上游核对 sherpa-onnx 1.13.7 对 fire-red-asr2 的 tokens/decoder 是否漏 `<blank>` 处理；④ 中英混说场景仍推荐 SenseVoice。

### P2-311-2 FireRed 中文默认无标点、无数字规范化，且选中后无增强标点引导
- **复现**：FireRed zh1 → `帮我跟老板说那个方案需要再改一下明天上午之前给他答复`（无一处标点，`3点`→`三点`）；开启增强标点（281 MB）后 → 与原句逐字一致（V6）。
- **根因**：CTC 模型无标点；`punct.ts` 规则断句对无停顿 TTS 句不出手；「数字规范化（中文）」与 FireRed 输出的汉字数字不匹配；模型说明文案末尾建议「开启增强标点」，但选中 FireRed 后没有任何按钮/提示直达该开关。
- **建议**：选中 FireRed 时在模型卡下方内联「增强标点未开启 → 一键下载并开启」；或 FireRed 首次下载完成 toast 带「开启增强标点」动作；数字规范化对汉字数字生效。

### P2-311-3（延续 P2-310-1）About 缺四态、错误串技术化
- **复现**：`51_about5_*.png` 无「检查中/已是最新/检查失败」；A9b 上屏 `ENOENT: no such file or directory, open 'C:\Users\…'`；A2 `sha256 mismatch (127.0.0.1:18990)`。
- **根因**：`updater.ts:143-147` 检查失败只 `log.warn` 返回 null；`UpdateState.error` 原样透传到 `settings.about.updateFailed`。
- **建议**：§10 四态；error 分类映射（`ENOENT`→「安装包已被移动或删除，请重新下载」、`sha256 mismatch`→「安装包校验未通过，已删除，请重新下载」、`untrusted host`→「下载被重定向到非 GitHub 地址，已中止」、网络→「无法连接 GitHub」），技术串放「详情」折叠。

### P2-311-4（延续 P2-310-2）默认启动 5.5 s 自动请求 api.github.com，无开关，与官网「一切离线」不一致
- **复现**：全新默认 profile 启动 60 s netstat 唯一外联 `20.29.134.17:443 first=5.5s`（`api.github.com`）；`index.ts` `setTimeout(fetchLatestTag, 5000)`，失败每 30 min 重试。
- **建议**：§10 开关 + 隐私文案；官网 FAQ 加「除检查更新（可关闭）外不联网」。

### P3-311-1 API `size` 与实际不一致时的状态漂移
- **复现**：`size:99999`（实际 45 056）→ 同会话下载后 ready（digest 匹配）；重启后 `installerReady()` 因尺寸不符返回 null → 回到「Download installer」，旧文件残留 `updates\`；按钮 `(0MB)`（`Math.round(size/1MB)`）。
- **根因**：下载校验只看 sha256，`installerReady()` 只看 size，两处标准不一。
- **建议**：`installerReady()` 改为校验 sha256（或同时缓存 sha 到 `.json`），尺寸不符时删除残留；体积 <1MB 显示 KB。

### P3-311-2 `checkUpdate()` 无在途去重，About 打开一次发两次 API 请求
- **复现**：A3/A5/A9 mockgh 日志 `GET /repos/wookat/speaktype/releases/latest` 两条相隔 3 ms。
- **根因**：`cached` 只在响应后写入，并发调用者（About 挂载 + 更新状态订阅）各自 fetch。
- **建议**：`let inflight: Promise<UpdateInfo|null> | null`，并发复用。

### P3-311-3 语音识别页文案未纳入 FireRed
- **复现**：`shot5_models.txt` 五语：服务商项「内置离线识别（SenseVoice / Parakeet）」、简介「sensevoice / parakeet 模型录音中实时显示字幕」；FireRed 下拉说明「粤语请换回 sensevoice-small」但 B9 粤语样本 FireRed 正确。
- **建议**：服务商项改「内置离线识别（本地模型）」；简介补「FireRedASR 为整句识别」；粤语说明改为「粤语两者皆可，日韩请用 SenseVoice」或实测后再定。

### P3-311-4 免按模式下静音源反复触发「未检测到麦克风输入」
- **复现**：`cdp_vad_handsfree.log` 02:15:05.781 段落结束 1.5 s 后再次出现提示（假麦数字静音）。
- **根因**：`panel.tsx` 以 `recStartRef` 为起点、`maxLevelRef < 0.003` 判静音，免按每段重置。
- **建议**：免按模式下只在本次会话首段判定一次，或 `maxLevelRef` 在免按会话内不重置。

### P3-311-5 免按模式 SenseVoice 分句处误识（样本 1）
- **复现**：hold 模式 zh2 正确；免按同音频 → `今天下午3点的会议盖到，明天记得提前把资疗法给大家。`（`改到`→`盖到`、`资料发`→`资疗法`，恰在分句边界）。
- **建议**：下一轮用 5 段固定音频对照 hold/免按错字率，确认是否为分段边界截断上下文。

### P3-311-6 `EnhancedVad.tsx` 残留下载分支与「~3MB 按需下载」文案（死代码）
- **建议**：#419 后删除 `vadDownload` 分支与 `settings.enhancedVadDownload*` 文案，避免翻译维护与误解。

---

## 10. About 四态 + 「自动检查更新」开关 + 隐私文案设计稿（五语初稿）

### 10.1 线框（About 顶部「版本」卡）

```
┌ 版本 ──────────────────────────────────────────────┐
│ SpeakType 0.19.0 (5086c0b)              [检查更新]  │
│ ⟳ 正在检查更新…                                     │   ← 态 1 checking（按钮 disabled）
│ ✓ 已是最新版本 · 上次检查 3 分钟前                  │   ← 态 2 upToDate
│ ↑ 新版本 v0.19.1 已发布  [下载安装包 (98MB)] Releases│   ← 态 3 available（现有）
│ ⚠ 无法检查更新：连不上 GitHub  [重试]  详情 ▸        │   ← 态 4 failed（技术串折叠）
│ ☐ 启动时自动检查更新（每次向 api.github.com 发送一次匿名请求）│  ← 开关，默认建议：安装版开 / 绿色版关
└──────────────────────────────────────────────────────┘
```

### 10.2 文案键（建议新增 `settings.about.update*`）

| key | zh-CN | en | zh-TW | ja | ko |
|---|---|---|---|---|---|
| `updateCheck` | 检查更新 | Check for updates | 檢查更新 | 更新を確認 | 업데이트 확인 |
| `updateChecking` | 正在检查更新… | Checking for updates… | 正在檢查更新… | 更新を確認しています… | 업데이트 확인 중… |
| `updateUpToDate` | 已是最新版本 · 上次检查 {{ago}} | You're up to date · checked {{ago}} | 已是最新版本 · 上次檢查 {{ago}} | 最新版です · 最終確認 {{ago}} | 최신 버전입니다 · 마지막 확인 {{ago}} |
| `updateCheckFailed` | 无法检查更新：{{reason}} | Couldn't check for updates: {{reason}} | 無法檢查更新：{{reason}} | 更新を確認できません：{{reason}} | 업데이트를 확인할 수 없습니다: {{reason}} |
| `updateReasonOffline` | 连不上 GitHub，请检查网络 | Can't reach GitHub — check your connection | 連不上 GitHub，請檢查網路 | GitHub に接続できません。ネットワークを確認してください | GitHub에 연결할 수 없습니다. 네트워크를 확인하세요 |
| `updateReasonRateLimit` | GitHub 请求过于频繁，请稍后再试 | GitHub rate limit reached — try again later | GitHub 請求過於頻繁，請稍後再試 | GitHub のリクエスト上限に達しました。しばらくしてから再試行してください | GitHub 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요 |
| `updateReasonNoHash` | 该版本未提供校验信息，请前往 Releases 手动下载 | This release has no checksum — download it from Releases | 該版本未提供校驗資訊，請前往 Releases 手動下載 | このリリースにはチェックサムがありません。Releases から手動でダウンロードしてください | 이 릴리스에는 체크섬이 없습니다. Releases에서 직접 다운로드하세요 |
| `updateErrMissing` | 安装包已被移动或删除，请重新下载 | The installer was moved or deleted — download again | 安裝包已被移動或刪除，請重新下載 | インストーラーが移動または削除されました。再ダウンロードしてください | 설치 파일이 이동되거나 삭제되었습니다. 다시 다운로드하세요 |
| `updateErrChecksum` | 安装包校验未通过，已删除，请重新下载 | Installer failed verification and was removed — download again | 安裝包校驗未通過，已刪除，請重新下載 | インストーラーの検証に失敗したため削除しました。再ダウンロードしてください | 설치 파일 검증에 실패하여 삭제했습니다. 다시 다운로드하세요 |
| `updateErrRedirect` | 下载被重定向到非 GitHub 地址，已中止 | Download was redirected off GitHub and stopped | 下載被重新導向到非 GitHub 網址，已中止 | ダウンロードが GitHub 以外へリダイレクトされたため中止しました | 다운로드가 GitHub 외부로 리디렉션되어 중단했습니다 |
| `updateDetails` | 详情 | Details | 詳情 | 詳細 | 자세히 |
| `autoCheckUpdates` | 启动时自动检查更新 | Check for updates on startup | 啟動時自動檢查更新 | 起動時に更新を確認 | 시작 시 업데이트 확인 |
| `autoCheckUpdatesDesc` | 开启后每次启动向 api.github.com 发送一次匿名请求（不含语音、文本或任何标识）；关闭后只有你点「检查更新」时才联网。 | Sends one anonymous request to api.github.com at startup (no audio, text or identifiers). Turn it off and SpeakType only goes online when you click "Check for updates". | 開啟後每次啟動向 api.github.com 發送一次匿名請求（不含語音、文字或任何識別碼）；關閉後只有你點「檢查更新」時才連網。 | オンにすると起動時に api.github.com へ匿名リクエストを 1 回送信します（音声・テキスト・識別子は含みません）。オフにすると「更新を確認」を押したときだけ通信します。 | 켜면 시작 시 api.github.com에 익명 요청을 한 번 보냅니다(음성·텍스트·식별자 없음). 끄면 「업데이트 확인」을 누를 때만 인터넷에 연결합니다. |

### 10.3 开关落点与默认值
- 位置：About「版本」卡内，四态行正下方（与被控制的行为同屏，用户在看到「正在检查」时立即能找到关掉它的开关）；General 页不再重复。
- 默认：安装版 **开**（安全更新价值 > 一次匿名请求），绿色版 **关**（portable 用户偏离线、且无法应用内安装）；首次启动 onboarding 隐私页用一句话披露并给复选框。
- 实现点：`settings.autoCheckUpdates`（默认按 `PORTABLE_EXECUTABLE_DIR` 判定）；`index.ts` 的 `setTimeout(fetchLatestTag,5000)` 与 30 min 重试受该开关控制；`checkUpdate()` 返回 `{state:"upToDate"|"available"|"failed", reason}` 而不是 `null` 二义。

### 10.4 隐私文案改法
- `settings.about.privacyDesc` 末尾追加（zh-CN）：「唯一的自动联网是启动时向 GitHub 检查新版本，可在上方关闭。」/（en）"The only automatic network call is the startup update check to GitHub, which you can turn off above."
- 官网 FAQ `docs/zh/index.html:351` 「之后一切都离线运行」→「之后识别、标点、学习全部离线；应用只在检查更新时（可关闭）访问 GitHub」；`docs/index.html:352` 同步。

---

## 11. 新用户路径与竞品「模型选择引导」对比

**本轮实走**（假麦、全新 profile）：官网（拿到的是 0.17.2 → P1-311-1，实际用 0.19.0 本地包继续）→ 首次启动 onboarding → 首页默认 SenseVoice 一键下载（3.6 s，带「校验中」）→ RightCtrl 首次落字成功 → Settings→Speech 看到五档模型 → 选 FireRed（740 MB，59 s）→ 落字无标点 → 需自行发现「增强标点」→ About 只有版本号与链接。

| 维度 | SpeakType 0.19.0 | Wispr Flow（官方 Setup Guide，一手） | Typeless（官方 Installation & Setup / First Dictation，一手） | 讯飞语记 |
|---|---|---|---|---|
| 是否让用户选模型 | 是：7 个本地模型 + 3 类云端，靶向说明每档体积/语言/速度 | 否：云端单模型，onboarding = 登录→权限→麦克风测试→快捷键→语言→Try it 演示 | 否：登录→Accessibility/麦克风权限→首次口述教程；「语言」在设置 | 未取得一手资料（**未测**） |
| 首次落字前步骤 | 下载 234 MB 模型（默认已选好） | 5 分钟内，无下载 | 三步，无下载 | — |
| 引导方式 | 文案密度高、无「按需求推荐」 | 问「你想用 Flow 做什么」后裁剪流程；Try It Yourself 演示句 | 首次口述有交互式教程与音效反馈 | — |

**Top3 差距（SpeakType 相对竞品）**：
1. **缺「按需求选模型」的决策引导**：竞品根本不让用户面对模型清单；SpeakType 让新用户在 7 档里读 5 段技术文案自选。建议首页/onboarding 用两问（主要语言？中文方言/英文为主？电脑内存？）直接推荐一档，其余折叠到「高级」。
2. **缺「首次落字演示句」闭环**：Flow/Typeless 都在 onboarding 内用一句示例让用户当场说、当场看到结果与纠错；SpeakType 下载完只有一条 toast「按住说第一句」，没有示例句/成功反馈页。
3. **模型切换的后果不可见**：选 FireRed 后「无实时字幕、无标点、需 281 MB 增强包」只在说明文里，切换后没有状态条/内联引导（P2-311-2）；竞品单模型无此问题，SpeakType 既然给选择就要把选择的代价与补救放到选中那一刻。

---

## 建议下一轮（312）验收点

1. **P1-311-1 官网**：实测 `speaktype.zalize.com` hero 链接指向 v0.19.x（或 `releases/latest`），特性区五档模型含 FireRed；en/zh 两页。
2. **#415 FireRed 整改**：英文小写化/拼写兜底或文案降级；选中 FireRed 后内联「开启增强标点」；用本轮 `en1/enfast/zhen` 同 fixture 复测，目标英文 WER 不劣于 SenseVoice；补真人麦克风方言样本。
3. **P2-310-1/-2 修复验收**：About 四态 runtime 五语截图（含 820px）；开关关闭后 60 s netstat 零外联；错误串映射（ENOENT / sha256 / untrusted host / 离线各一例）。
4. **更新器补漏**：`installerReady()` 改 sha256 校验后复测 A3/A3b（尺寸不符不再残留）；`checkUpdate()` 在途去重（mockgh 只见 1 次请求）；真实 GitHub API `digest` 字段在配额允许时验一次。
5. **#411 补测**：面板提示 zh-CN/zh-TW/ja/ko runtime 截图；免按模式静音源不再反复闪提示（P3-311-4）。
6. **免按分句质量**：5 段固定音频 hold vs 免按错字率对照（P3-311-5）。
7. **FireRed dlproxy 停滞换源**一次；`EnhancedVad.tsx` 死代码删除后五语文案无残留（P3-311-6）。
8. 固定项：核心链路（两段不同 wav 排队）、手机麦 b-①②③、端口竞态 a-③、DPI 125%/150%（若换 VM）。
