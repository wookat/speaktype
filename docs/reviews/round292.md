# 第 292 轮严格体验官验收报告（user-experience-officer + qa-engineer）

- 被测版本：`main@d18aa8f`（v0.17.0，含 PR #381：291 轮修复——ENOSPC 不崩、人设页 820px、Row warning、zhNorm 改 opencc-js t2cn 全表、转录取消态、免按 Esc 专用文案）
- 被测形态：`desktop/release/win-unpacked/SpeakType.exe` 打包版（本机 `npm install → typecheck → build → pack:dir` 产出，非 dev）
- 环境：Windows Server 2022，1280×720，Node v20.19.0 / npm 10.8.2，Electron 43.3.0，electron-builder 26.15.3，系统 locale en-US，`%APPDATA%\SpeakType` 本轮从零开始（全新用户）
- 手法：Chromium fake-mic（SAPI Huihui(zh) / Hanhan(zh-TW) / Haruka(ja) / Zira(en) 生成 16k wav + 3s 尾静音）+ `SendInput` 扫描码合成热键（`rkey.ps1`，RightCtrl=`Control_R`）+ **本地假 HuggingFace 源**（`fakesrc.js` 127.0.0.1:18080，302+X-Linked-ETag → /cdn Range/206，限速 1.5MB/s，逐请求记录 `range` 头与响应码；模式 ok/fail503/hang）+ mock OpenAI（127.0.0.1:18090）+ CDP 9333 仅做 DOM/样式/toast 文本取证 + `main.log` / `speaktype.json` / `history.json` 落盘证据
- 为把下载导向假源，**仅对打包产物** `resources\app.asar` 做了测试期字符串替换（三处源前缀 → 127.0.0.1:18080），测毕用备份原样还原并核对 sha256 一致（`DBCEA1C3…B9F8`，36,590,428 B）；未改任何产品源码
- 录屏（三段连续）：`C:\Users\Administrator\screencasts\r292-part1\r292-part1-edited.mp4`（专项 a + c：206 续传 / 下载边界 / Esc 文案）、`...\r292-part2\r292-part2-edited.mp4`（专项 b OpenCC + 核心链路）、`...\r292-part3\r292-part3-edited.mp4`（专项 d 820px 五语深色走查）
- 全量证据 196 张 PNG 在 `C:\Users\Administrator\tts\evidence\`，三份逐条笔记（含 main.log / fakesrc.log / history.json 原文切片）与关键 59 张图随本报告提交到 `docs/reviews/round292/`
- 未改产品代码、未建 PR、GitHub Actions 保持禁用、防火墙未开启（三 profile 均 Enabled=False）、hosts 未动（mtime 早于首次启动）、无 junction/VHDX；仅推报告分支 `review/round292-report`（含 SKILL.md 第 292 轮学习）

## 0. 结论

**d18aa8f 打包版核心链路 4/4 通过，291 轮两个"未证"项本轮均已实证（续传请求带 `Range: bytes=<offset>-` 且得到 206；ja/zh-TW Esc 文案实机无截断）。但 OpenCC 换全表暴露 1 个 P1：识别语言=日文时 whisper 输出的日文汉字被 t2cn 改成简体中文（東京→东京、公園→公园、後編→后编），默认开关 ON 使每个日文 whisper 用户都会中招；另立 3 个 P2、10 个 P3。** P1 未修前不建议对外宣称"支持日文听写"；P2-292-1（zh-TW 用户默认被转简体）与 P1 同根，建议一并修。

| 区块 | 结果 |
| --- | --- |
| 构建 / 打包 | PASS（npm install 首跑退出码 1 无可见原因、重跑通过；EBADENGINE 警告同 290/291 轮） |
| 核心链路（RightCtrl 落字 Notepad / Alt+Q 进出 / Esc 会话中取消 / F8 mock 改写） | PASS（4/4，本轮跑在 whisper tiny-q5_1 上，非 SenseVoice） |
| 专项 a-1 续传是否带 Range 得 206 | **PASS，已实证**：退出中断 / 断网中断 / 手工截断三种残片均发 `range=bytes=<.part 大小>-`，假源回 206 + 正确 `content-range`，终文件 32,152,673 B sha256 一致；真实 huggingface.co 对同一 offset 的 Range 请求也回 206（curl 佐证） |
| 专项 a-2 ja / zh-TW 免按 Esc 文案渲染 | PASS：ja 3 行、zh-TW 1 行，像素与 CDP（scrollWidth==clientWidth）均无截断；ja 第 3 行只剩一个「す」（P3） |
| 专项 b OpenCC 回归 | **FAIL 1（P1-292-1 日文被转）**；zh-TW 用户默认被转简体（P2-292-1）；History / 词典搜索对日文条目无误命中（PASS） |
| 专项 c-1 下载中途退出再启动 | PASS：`Resume download (74% done)` 与 floor(.part/total) 一致，续传成功 |
| 专项 c-2 .part 与 .part.json 不一致 | 截断（.part < total）PASS 从截断点续传；.part > total 功能正确（丢弃重下）但先显示「99% done」误导（P3-292-1） |
| 专项 c-3 三源全部失败 | 503 / 404 / 连接拒绝三种均 PASS（3 源都试、文案本地化、按钮即刻可重试）；文案三种情况完全相同（P3-292-2）；**源接受连接但不响应 → 「Downloading 0%」卡死 >80s 无取消无超时（P2-292-2）** |
| 专项 d 820px × 五语 × 深色走查 | PASS 为主；**ja 转录取消态徽标 + 「全文をコピー」按钮在 820px 折两行（P2-292-3）**；History「清空」确认行折行、转录 Cancel 按钮位置被导出行顶替（P3） |
| 专项 d Row warning（热键冲突提示，五语） | PASS：独占整行、五语翻译、无截断（ja 干净折 2 行） |
| 专项 d Personas 五语 | PASS：新增规则行五语单行、编辑 / 分配 / 两步删除并级联删规则 |
| 专项 d Transcribe 取消态五语 | PASS 4/5（en / zh-CN / zh-TW / ko 单行，日志 `file transcribe cancelled at 35% (28 segments)`，切页文件名保留）；ja FAIL（见上） |

## 1. 构建与环境

| 步骤 | 结果 | 备注 |
| --- | --- | --- |
| `npm install` | 通过（第 1 次退出码 1，输出被截断无可见错误；第 2 次退出码 0） | EBADENGINE：`@electron/get`、`@electron-internal/extract-zip` 等要求 Node ≥22.12，本机 20.19；`npm audit` 报 1 moderate + 1 high。环境问题非产品问题，但建议在 README 标明 Node 22 |
| `npm run typecheck` | 通过 | |
| `npm run build` | 通过 | |
| `npm run pack:dir` | 通过 | `app.asar` 36,590,428 B（sha256 `DBCEA1C3…B9F8`） |

测试资产 `C:\Users\Administrator\tts` 在本 VM 已不存在，本轮重建：`launch.ps1`、`rkey.ps1`、`mkwav.ps1`（SAPI，为此安装 `Language.TextToSpeech~~~zh-CN/ja-JP/zh-TW` 能力包）、`fixwav.js`（首版 wav 头损坏被 fake-mic 当静音播放，修复后 `tts\fixed\*.wav`）、`fakesrc.js`、`mockllm.js`、`cdp.js`、`patchsrc.ps1`。**一个 harness 事实**：本 build 中 `resources\app` 目录不会覆盖 `app.asar`（CDP 看到渲染层 URL 仍在 `app.asar/` 内），首次启动因此从真实 huggingface.co 下到了 tiny 模型（~7s）；随后改为直接改写 asar 并重置 `%APPDATA%\SpeakType` 重来。

## 2. 核心链路回归（PASS 4/4）

UI en，识别语言 中文，本地模型 whisper `tiny-q5_1`（强制简体 ON），fake-mic `fixed\zh.wav`（今天天气很好，我们一起去公园散步。），Notepad 前台。

| ID | 步骤 | 结果 | 证据 |
| --- | --- | --- | --- |
| C1 | RightCtrl 按住 9s → Notepad | PASS | 落字 `今天天气很好!我们一起去公园散步!`；`[15:03:54.043] dictation finalize: durationMs=8874 maxPeak=32768 voicedMs=3180`；history `{"text":"今天天气很好!我们一起去公园散步!","provider":"local"}`；`core-01-rctrl-hold-typed-zh.png` |
| C2 | Alt+Q 进入 → 连续落 5 句 → Alt+Q 退出 | PASS | 面板 waveform + X，段间显示 `Transcribing…`（`core-02a`）；5 条 finalize 间隔 ~9s；退出 toast `Hands-free mode ended / Continuous dictation stopped. Press the hands-free hotkey to start again.`（`core-04`）。退出瞬间把进行中的 partial 作为一段落字（与 290 轮一致，按设计） |
| C3 | RightCtrl 会话中 3s 时 Esc | PASS | toast `Dictation canceled / Nothing was typed`，Notepad 不变、无 finalize、history 无新条目；`core-05`。免按中 Esc 见 §3.2 |
| C4 | AI polish 配 mock（Base URL 127.0.0.1:18090/v1）→ Test connection → 选中 `hello world round 292` → 按住 F8 说指令 → 释放 | PASS ×3 | `Connected: mock-llm`（`core-06`）；选区被替换为 `[MOCK-REWRITE-R292] 你按用户的口述指令改写下面这段文字…`（mock 回显整段 prompt，`core-08`）；mock 收到单条 user 消息，含 `口述指令："""今天天气很好!我们一起去公园散步!"""` 与 `原文："""hello world round 292"""`（`mock-llm-rewrite-request.txt`）。未配模型时 F8 → toast `Rewrite needs a polish model` 并跳到 AI polish 设置；无选区 → toast `Nothing selected / Select the text first…`，不发请求（`core-09`） |

注：290/291 轮核心链路跑在 SenseVoice 上；本轮为覆盖 OpenCC（仅 whisper 通道生效）跑在 whisper tiny 上，SenseVoice 通道本轮**未测**。

## 3. 专项 a：291 轮两个未证项

### 3.1 续传请求是否带 Range 并得到 206 —— PASS，已实证

方法：假源逐请求记录 `range` 头与响应码。下载 `tiny-q5_1`（32,152,673 B）到 ~30% 时用三种方式制造残片，重启后点「Resume download」。

| 场景 | 中断时 .part | 重启后 UI 文案 | 续传请求 | 响应 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 下载中 kill 进程 | 23,855,104 B（`.part.json` `{url:…/hf/…,etag:8187…c3d7,total:32152673}`） | Home 与 Settings 均 `Resume download (74% done)`（=floor(74.2)） | `GET /hf/... range=bytes=23855104-` → 302 → `GET /cdn/... range=bytes=23855104-` | `206 content-range: bytes 23855104-32152672/32152673 content-length: 8297569` | 终文件 32,152,673 B，sha256 `8187…c3d7` ✓，`[14:05:57.456] local model tiny-q5_1 downloaded`，UI `Model ready` |
| 下载中假源进程被杀（断网） | 11,010,048 B | <1s 内 `Resume download (34% done)` + 红字网络错误（`a-206-05`） | `range=bytes=11010048-` | `206 …11010048-32152672/32152673` | ✓ 同上（`a-206-06`） |
| 手工截断 .part 至 5,000,000 B | 5,000,000 B | `Resume download (15% done)`（`a-206-07`） | `range=bytes=5000000-` | `206 …5000000-32152672/32152673` | ✓ |

真实源佐证：`curl -r 23855104- https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin` → 302（`X-Linked-ETag: "8187…c3d7"`，`Accept-Ranges: bytes`）→ CDN `206 Partial Content, content-range: bytes 23855104-32152672/32152673`（`real-hf-range-206-curl.txt`）。即代码路径（`download.ts` `headers.range = bytes=${offset}-` / `resumed = status===206 && offset>0`）与真实 HF CDN 行为均已验证；**未测**的仅是"应用在真实 HF 上的一次完整中断-续传"（main.log 不记响应码，无法从日志区分）。完整请求日志：`fakesrc-range-206.log`。

### 3.2 ja / zh-TW 免按 Esc 文案渲染 —— PASS

Alt+Q 进免按 → 落字 → Esc。toast 文本用 CDP 读 toast.html 原文并量 scrollWidth/clientWidth，像素用 3× zoom。

| UI | 标题 / 正文（实机原文） | 行数 | 度量 | 结论 |
| --- | --- | --- | --- | --- |
| ja | `ハンズフリーモードを終了しました` / `Esc が押されたため連続入力を停止しました。ハンズフリーキーで再開できます` | 3 行 | 正文 sw=cw=255，sh=ch=60（3×20px），`line-clamp-3` 恰好填满，`text-overflow: clip` | 无截断无省略（`a-esc-01/02`）；第 3 行仅一个「す」→ P3-292-6 |
| zh-TW | `免按模式已退出` / `已按 Esc，連續聽寫已停止；再按免按熱鍵可重新開始` | 1 行 | sw=cw=340，sh=ch=20 | 无截断（`a-esc-03/05`） |
| en / zh-CN | `Hands-free mode ended / Esc pressed, so continuous dictation stopped. Press the hands-free hotkey to start again.`；`免按模式已退出 / 已按 Esc，连续听写已停止；再按免按热键可重新开始` | 2 / 1 行 | — | 无截断 |

免按面板本身只有 waveform + X，无文字，五语无可截断项。若 Esc 落在一段正在转写时，toast 在落字后 1–2s 才出现（不丢，只延迟）。

## 4. 专项 b：OpenCC t2cn 全表回归

### 4.1 代码事实（已读源码核对）

- `shared/zhNorm.ts`：`toSimplified` = `opencc-js/t2cn` `Converter({from:"t",to:"cn"})`（TSCharacters 字级表）。
- `main/asr.ts` L263（live 听写 whisper 通道）与 `main/transcribe.ts` L240（文件转录）**完全相同**：`return settings.localSimplified !== false ? toSimplified(text) : text;` —— **不看 `settings.language`**，识别语言为 ja / ko / en / auto 时同样执行。sherpa 通道（SenseVoice/Parakeet）返回原文不转。
- `main/store.ts` L50 默认 `localSimplified: true`，与 uiLanguage / 系统 locale 无关。
- 识别语言下拉只有 自动 / 中文 / English / 日本語 / 한국어 / 粵語，**没有 zh-TW / 繁體选项**（`b-00`）。
- History.tsx / Dictionary.tsx 搜索两侧都过 `toSimplified` 再 `includes`；hotwords.ts 对含假名文本整体跳过 CJK 热词替换（L120/128）。
- main.log 只记 `dictation finalize: durationMs/maxPeak/voicedMs`，**不记识别文本**；`history.raw` 是转换后的文本 → 转换前的 whisper 原文无处可查（P3-292-7）。

确定性表查（node，`opencc-js/t2cn`）：日式简化字 `気 沢 広 価 経 対 変 発 実` 不在表中**保持不变**；但与繁体同形的汉字被转：`東京→东京 公園→公园 広島→広岛 関係→関系 図書館→図书馆 読書→読书 売買→売买 漢字とカタカナ→汉字とカタカナ こんにちは、東京へ行きます→こんにちは、东京へ行きます`；`臺灣的軟體工程師喜歡喝奶茶，網路速度很快。→台湾的软体工程师喜欢喝奶茶，网路速度很快。`（全表见 `notes-part2-opencc-core.md`）。

### 4.2 实机结果

| ID | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| B1-1 | UI 繁體中文 + 識別語言 中文 + 「強制簡體輸出」默认 ON，Hanhan 台湾腔 `臺灣的軟體工程師…` RightCtrl 9s | 落字 `台湾的软体工程师喜欢喝奶茶,网路速度很快`（全简体）；history text/raw 均简体 | `b-01`（开关与 hint）、`b-02` |
| B1-2 | 同上，开关 OFF | 落字 `台灣的軟體工程師喜歡喝奶茶,網路速度很快` —— **whisper 对台湾语音本就输出繁体**，开关不是空转，默认 ON 会静默把 zh-TW 用户的听写转成简体 | `b-03` → **P2-292-1** |
| B2-1 | UI 日本語 + 認識言語 日本語 + 「簡体字に強制変換」默认 ON（`b-05` 显示该开关在日文识别下仍 ON、hint 只提中文），Haruka `東京の空は広くて気持ちがいいです。沢山の人が公園に来ました。` | 落字 `东京の空は広くて気持ちがいいです。／たくさんの人が后编に来ました`（whisper 把 公園 听成 後編，二者都被转）；広 / 気 / 来 / 假名未变 | `b-04` → **P1-292-1** |
| B2-2 | 同上，开关 OFF | 落字 `東京の空は広くて気持ちがいいです。／たくさんの人が後編に来ました`，证明 whisper 原文是 東京 / 後編 | `b-06`（两次对照同屏） |
| B3-1 | 词典加入 `沢山 / 広島 / 東京` 后搜索 | `广岛` 无命中（広 不在表）、`泽` 无命中、`沢` 命中 沢山、`东京` 命中 東京（双向跨字形） | `b-07/08` |
| B3-2 | History 含 ja（東京…）与 zh-TW 条目，搜索 `沢 泽 広 广 気 气 东京 東京` | `泽/广/气` 均无命中（无误命中）；`広/気` 命中 2 条 ja；`东京` 与 `東京` 都命中同 2 条 ja | `b-16/17` |
| B3-3 | 词典有 `沢山/広島/東京` 时再听写 ja.wav（开关 OFF） | 落字与无热词时逐字相同，热词对含假名文本零影响（hotwords.ts 假名上下文整体跳过） | `b-19` |

结论：搜索侧**无误命中**（表里没有 shinjitai→简体映射，`東京↔东京` 双向命中对日文用户无害）→ 搜索 **建议不修**；ASR 侧转换未按语言门控 → **建议修（P1）**。

## 5. 专项 c：下载链路边界

| ID | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| c-1 | 下载 31% 时退出应用再启动 | PASS：Home 横幅与 Settings 按钮均 `Resume download (74% done)`，点后 Range/206 续传完成（§3.1） | `a-206-01/02/03/04` |
| c-2a | `.part` 截断到 5,000,000 B（json total 不变） | PASS：显示 15%，从 5,000,000 续传，sha256 ✓ | `a-206-07` |
| c-2b | `.part`（23.8MB）大于 json total（改为 1,000,000） | 功能 PASS：点击后 hash 不符 → 丢弃 → 无 Range 的 200 全量重下，终文件 ✓，无负数/卡 100%；**但先显示 `Resume download (99% done)`**（`partialProgress` 用 `min(size,total)` 得 100% 再 cap 99）→ P3-292-1 | `a-206-08` |
| c-3a | sensevoice-small 三源均 503 | PASS：fakesrc 收到 /hf /mirror /gh 各一次 503；main.log 3× `download source failed … HTTP 503` + `local model sensevoice-small download failed`；UI 红字 `Download failed: network error — check your connection and try again.`，按钮即刻恢复 `Download model`（即重试入口，无独立 Retry 字样） | `c-01` |
| c-3b | 三源均 404 | PASS：同一文案；重试可用 | `c-02` |
| c-3c | 三源连接拒绝（源进程停掉） | PASS：同一文案，`fetch failed` 未泄漏到 UI | `c-03` |
| c-3d | 源接受 TCP 连接但永不响应 | **FAIL（P2-292-2）**：按钮禁用 `Downloading 0%` 空进度条 >80s（14:15:04→14:16:30），无 Cancel、无超时、不落到 mirror/gh；重启假源令 socket 关闭才即时报错恢复 | `c-04` |

补充度量：`download.ts` 无 AbortSignal/超时；Node 20 原生 fetch（undici）默认 headersTimeout 实测 303.7s 后抛 `UND_ERR_HEADERS_TIMEOUT`（`undici-headers-timeout-node20.txt`）；Electron 内置 Node 版本不同，**推断**同为 5 分钟量级——即用户面对的是 5 分钟无反馈无取消，而不是永久卡死；但 body 阶段每个 chunk 之间的空闲同样只有 undici 默认 bodyTimeout 兜底（未实测）。

设计观察（代码读出，未复现）：`.part.json.url` 记录的是 hf URL；hf 流中断后 `downloadFile` 立刻落到 mirror，而 mirror URL ≠ meta.url → 不发 Range、`createWriteStream(part)` 截断重写 → **一个可用的镜像会把已下的残片全部丢掉从 0 重下**。本轮两源同时断故未触发。→ P3-292-3。

## 6. 专项 d：820px × 五语 × 深色走查

窗口最小宽 820（外框 836，请求 700 仍钳到 820）；主题选项 `Follow system / Light / Dark`。五语 × Home / History / Dictionary / Personas / Transcribe / Settings（General 含热键与免按、Speech 含模型与手机麦、AI polish、About）共 136 张 `d-*.png`（全量在 tts\evidence，关键项随报告提交）。**未发现**英文漏翻、混排、深色下不可见边框/焦点环、浅色残留。

| 重点 | 结果 | 证据 |
| --- | --- | --- |
| Row warning（热键冲突提示：改写键==按住键、免按键==按住/改写键） | PASS 五语：独占整行、翻译完整；CDP en/zh-CN/zh-TW/ko 506×16，ja 免按冲突 506×32（干净折 2 行），全部 scrollWidth==clientWidth；浅色主题对照 OK | `d-en/zhcn/zhtw/ja/ko-warning-both.png`、`d-ja-warning-both-zoom.png` |
| Personas | PASS 五语：默认卡片、新建 `QA292`（名称+提示词都填才可 Save）、2 条规则行单行（输入 + 人设 select + 删除）、分配 `notepad`、编辑、`Delete? Click again` 两步删除并级联删掉其规则（speaktype.json `personas` 空、仅剩无关 `code.exe` 规则） | `d-ko/ja/zhtw-personas-rules.png`、`d-en-personas-delete-confirm.png` |
| Transcribe 取消态 | 735.6s 音频（zh.wav ×80）35% 时 Cancel：琥珀 `Cancelled at 35% — partial result`，28 段，Copy all / TXT / SRT 可用（允许导出部分结果，合理）；`[16:11:31.376] file transcribe cancelled at 35% (28 segments)`；切 Settings 改语言再回来文件名 `long800.wav` 五语均保留。en / zh-CN `已取消（35%），以下为部分结果` / zh-TW `已取消（35%），以下為部分結果` / ko `35%에서 취소됨 — 일부 결과` 单行；**ja `35% でキャンセルしました（部分的な結果）` 折成 2 行且压到按钮下方，`全文をコピー` 断成 `全文を / コピー`，1100px 下单行** | `d-en-transcribe-cancelled-35pct.png`、`d-ja-transcribe-cancelled-35pct-badge-wraps-copybtn-2lines.png`、`d-ja-…-1100px-single-line.png` → **P2-292-3** |
| 自由发掘 | Home「First time? 4 quick steps」可展开、清晰；History / Dictionary 空态 en / zh-CN 翻译完整（其余三语未测）；托盘菜单五语随 UI 语言即时切换；About `SpeakType 0.17.0 (d18aa8f)`；深色焦点环可见；dark / en / 热键 / 模型经托盘 Quit 重启后保留 | `d-ko-tray-menu.png`、`d-en-history-clear-all-confirm-wraps.png` |

## 7. 立案清单

### P1

**P1-292-1 识别语言=日文时，whisper 输出的日文汉字被 t2cn 改成简体中文（默认 ON，所有日文 whisper 用户中招）**
- 复现：UI 日本語 → 設定 › 音声認識 › 認識言語=日本語，本地模型任一 whisper（tiny/base/small），「簡体字に強制変換」保持默认 ON → 对着麦说 `東京の空は広くて気持ちがいいです。沢山の人が公園に来ました。` → 落字 `东京の空は広くて…公园に来ました`（实机为 `后编`，因 tiny 听错但同样被转）。开关 OFF 则完好。文件转录同一路径（`transcribe.ts` L240）同样受影响（代码同源，未单独实测）。
- 证据：`b-04-ja-toggleON-typed-tokyo-converted.png`、`b-06-ja-toggleOFF-vs-ON-notepad.png`（两次同屏对照）、`b-05-ja-ui-force-simplified-toggle-on-lang-ja.png`、history.json `{"text":"东京の空は広くて気持ちがいいです。\nたくさんの人が后编に来ました"}`、node 表查 `東京→东京 公園→公园 関係→関系 図書館→図书馆 読書→読书 漢字→汉字`。
- 根因：`asr.ts` L263 / `transcribe.ts` L240 `settings.localSimplified !== false ? toSimplified(text) : text` 不看 `settings.language`；291 轮换成全表后与繁体同形的日文汉字全部命中。
- **建议修**：只在 `language ∈ {zh, yue}` 时转换；`auto` 下若文本含假名（`/[\u3041-\u30ff]/`）或谚文则跳过；同时在识别语言非中文时把开关置灰并说明"仅中文生效"。附带建议：把转换前原文写入 `history.raw`（当前 raw 已是转换后文本，见 P3-292-7），否则此类回归在线上无法诊断。

### P2

**P2-292-1 zh-TW 用户默认被强制转简体，且无 zh-TW 识别选项**
- 复现：UI 繁體中文，識別語言 中文，默认 ON，台湾腔听写 → 落字全部简体（`台湾的软体工程师…网路速度很快`）；OFF 才得 `台灣的軟體工程師…網路速度很快`。whisper 本就输出繁体，开关实际在"改写用户的母语文字"。
- 证据：`b-01`（开关 hint 「whisper 中文識別常出繁體，開啟後落字前自動繁→簡（僅對離線通道生效）。」把繁体当缺陷描述）、`b-02`、`b-03`、`b-00`（无繁体选项）。
- **建议修**：首启按 uiLanguage / 系统 locale 为 zh-TW/zh-HK 时默认 `localSimplified=false`；zh-TW 界面下 hint 改为中性表述（"whisper 中文輸出字形不固定；開啟後統一為簡體，關閉則保留原樣"）；Home 首次落字后若发生了繁→简转换给一次性提示。低成本、与 P1 同一处代码。

**P2-292-2 下载源接受连接但不响应时「Downloading 0%」无超时、无取消、不落备用源**
- 复现：任一模型点 Download，源端 accept 后不回响应头（本轮 fakesrc `hang`；现实对应 CDN 半开连接/被墙挂起）→ 按钮禁用 + 空进度条持续 >80s；只有 socket 被对端关闭才报错；下载中也没有任何 Cancel 控件。
- 证据：`c-04-sensevoice-hang-stuck-0pct.png`、fakesrc.log `[kyki1] >> GET /hf/... mode=hang (hanging)`、`download.ts` 无 AbortSignal；`undici-headers-timeout-node20.txt`（原生兜底 ~300s）。
- **建议修**：`fetch` 加 `AbortSignal.timeout(30s)` 取响应头 + 读 body 时 30s 无字节则 abort 并落下一源；Downloading 状态提供 Cancel（保留 .part 供续传）。

**P2-292-3 ja 转录取消态在 820px 折行并挤压按钮**
- 复现：UI 日本語，窗口 820px（最小宽），转录任意音频中途 Cancel → 徽标 `35% でキャンセルしました（部分的な結果）` 折 2 行并被 `全文をコピー` 按钮盖住一角，按钮本身断成 `全文を / コピー`；1100px 单行正常。
- 证据：`d-ja-transcribe-cancelled-35pct-badge-wraps-copybtn-2lines.png`、`d-ja-transcribe-cancelled-badge-zoom-wrap.png`、`d-ja-transcribe-cancelled-1100px-single-line.png`。
- **建议修**：结果头部改为可换行的两行布局（徽标独占一行 / 按钮 `shrink-0 whitespace-nowrap`），或 ja 文案缩短为 `35% で中断（部分結果）`。与 291 轮修的 en/zh-CN 同一组件，属回归盲区（291 只验了 zh/en）。

### P3

| ID | 观察 | 证据 | 建议 |
| --- | --- | --- | --- |
| P3-292-1 | `.part` 大于 `.part.json.total` 时显示 `Resume download (99% done)`，点后全量重下 | `a-206-08`、fakesrc.log `range=- → 200` | **建议修**（一行：`partialProgress` 在 `size > total` 时返回 null） |
| P3-292-2 | 503 / 404 / 连接拒绝三种失败文案完全相同 `network error — check your connection`；404（源已下架）重试永远无效，503 是服务端问题 | `c-01/02/03`、`downloadError.ts` 把 `HTTP \d{3}` 一律映射 errNetwork | **建议修**（5xx → "源暂不可用，稍后再试"；404 → "模型文件不存在，请升级或反馈"；连接类保留现文案） |
| P3-292-3 | hf 残片 + mirror 可用时，mirror URL ≠ `.part.json.url` → 丢弃残片从 0 重下（代码读出，未复现） | `download.ts` `meta.url === url` 判定 | **建议修**（用 etag/sha 作为续传键：任何源 206 且 X-Linked-ETag 一致即可续） |
| P3-292-4 | 转录完成瞬间导出行滑入 Cancel 的位置，Cancel 点击落到 SRT 弹出保存框 | `d-en-transcribe-cancel-click-hit-srt-dialog.png` | **建议修**（进度行与导出行同高占位，或完成后 300ms 内忽略该区域点击） |
| P3-292-5 | History「Clear all」确认态在 820px 折行、搜索框被压缩 | `d-en-history-clear-all-confirm-wraps.png` | **建议修**（确认按钮 `whitespace-nowrap` 或改弹层） |
| P3-292-6 | ja Esc toast 第 3 行只有一个「す」；正文 `line-clamp-3 + text-overflow: clip` 恰好填满，再长一点的 locale 会被无省略号切掉 | `a-esc-02-ja-toast-zoom.png`、CDP sh=ch=60 | **建议不修**当前（可读），若改文案建议缩到 2 行（如 `Esc で連続入力を停止しました。ハンズフリーキーで再開`） |
| P3-292-7 | 可观测性：main.log 不记识别文本、免按进出、Esc 取消、改写起止；`history.raw` 已是转换后文本 | notes-part2 §源码事实、C2/C3/C4 日志 | **建议修**（debug 级记录 whisper 原文长度/字形统计，raw 存转换前文本） |
| P3-292-8 | F8 按住期间面板与普通听写完全一样（waveform + X），无"改写模式"标识；LLM 调用中的状态因 mock 0.35s 返回未能观察（未测） | `core-08b/08c` | **建议修**（面板加 "改写中" 小标） |
| P3-292-9 | 手工 SetWindowPos 调整后首次重启窗口高度少 12px（692→680），第二次起稳定 | notes-part3 D5 bounds 记录 | **建议不修**（一次性，疑 outer/content bounds 混用；成本低可顺手看） |
| P3-292-10 | ja 转录页副标题 820px 折行留孤字「ト」 | `d-ja-transcribe-title-subtitle-orphan-zoom.png` | **建议不修**（`word-break: keep-all` 或缩短文案可顺手） |

### 观察项（不立案）

- 无独立 onboarding 向导：Home 顶部 `Not configured` + 下载横幅 + 可展开的 4 步指引（`ux-firstrun-home-en.png`）。对目标用户足够直接，**建议不修**。
- 取消的文件转录不进 History（只有完成的进）。部分结果已可导出，**建议不修**，但若用户反馈"找不到刚才的部分结果"再议。
- 转录进度百分比跳变粗（35%→81% 约 1s 内），whisper 分段推理天然如此，**建议不修**。
- 重复 `taskkill` 后托盘残留 ~10 个幽灵图标，托盘 Quit 正常退出无此现象，harness 产物，**不立案**。
- 291 轮修的 ko/en 热键冲突警告（Row warning）五语实测均独占整行，**已关闭**。测试员曾按"IME 警告"去找 RightAlt 相关提示——那是对任务描述的误读，不是产品缺失。
- 改写 prompt 为中文单条 user 消息、无 system 角色、与 UI 语言无关（`mock-llm-rewrite-request.txt`）。对主流 LLM 无碍，记录备查。

## 8. 实测通过 / 未测 边界

实测通过（见上各表）：构建打包；核心链路 4/4（whisper tiny）；Range/206 三种残片 + 真实 HF curl；ja/zh-TW/en/zh-CN Esc toast；zh-TW / ja 听写开关 ON/OFF 对照；词典/History 日文搜索；三源 503/404/拒绝；退出续传；截断/超长残片；820px 五语深色全页；Row warning 五语；Personas 五语 CRUD；Transcribe 取消态五语 + 日志 + 文件名保留；托盘五语；设置持久化；深色焦点环；环境还原核对。

**未测**：
- 应用在真实 huggingface.co 上的中断-续传（仅 curl 证实真实 CDN 回 206）；hf-mirror.com 真实行为。
- SenseVoice / Parakeet 通道的核心链路（本轮全部在 whisper tiny 上）；韩语听写。
- 文件转录路径的日文误转（与 live 同一行代码，未单独实测）。
- 下载 body 阶段中途停滞（fakesrc 逐请求读模式，无法在流中制造停滞）；undici 在 Electron 内的实际超时值。
- 改写/润色 LLM 调用中的面板状态（需慢 mock）。
- toast 与免按面板同时出现时的遮挡。
- History / Dictionary 空态 zh-TW / ja / ko；浅色主题只抽查了 Row warning 与转录取消态。
- ENOSPC / 只读目录（291 轮已验，本轮不重复）。

## 9. 环境还原核对

- `resources\app.asar` 由 `tts\app.asar.orig` 还原：36,590,428 B，sha256 `DBCEA1C3EEA4DDC1BD05CD6342D237A72B6ADCEEFAC1A5D16A3AF066EE96B9F8`（与打包时一致）；`resources\app` 已删除。
- `git status --porcelain` 仅 `.agents/skills/testing-speaktype-desktop/SKILL.md`（第 292 轮学习，随本分支提交）；`desktop/src` 无改动。
- hosts 未动（mtime 13:40 早于首启 14:04）、防火墙三 profile Enabled=False、`desktop\release` 下无 reparse point、未建 VHDX/junction。
- 假源 / mock 进程已停止；`%APPDATA%\SpeakType` 保留（tiny 模型 32,152,673 B，供下一轮复用）。

## 10. 建议的下一轮（293）验收点

1. P1-292-1 / P2-292-1 修后：ja / ko / en 识别语言下 whisper 输出逐字不变；zh-TW 首启默认 OFF；`auto` + 含假名文本不转；文件转录同验。
2. P2-292-2：hang 源 30s 内报错并落下一源；下载中 Cancel 保留 .part 可续传。
3. P2-292-3 / P3-292-4 / P3-292-5：ja 820px 取消态单行或两行整洁布局；Cancel 位置稳定；Clear all 不折行。
4. 用 SenseVoice 再跑一遍核心链路，补齐本轮的通道盲区。
