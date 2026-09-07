# SpeakType 第 300 轮严格体验官报告（打包版 0.17.2 @ main 73ff642，验收 #388 手机 owner 隔离 / whisper 动态端口 / 损坏模型分类 + 长会话 / 首装 / 竞品）

> 角色：user-experience-officer + qa-engineer。测试对象：Windows Server 2022 VM 上 main（HEAD `73ff642`，含 #388 修复与 #389 测试经验）全新 `cd desktop && npm install && npm run typecheck && npm run build && npm run pack:dir` 产出的 `desktop/release/win-unpacked/SpeakType.exe`（`main.log` 首行 `SpeakType 0.17.2 starting (packaged=true)`；不测 dev）。ASR 全程真实本地模型（SenseVoice small int8 / Parakeet-TDT 0.6B v3 / whisper base-q5_1）。mock 仅三处且均在报告中逐处注明：① F8 改写与润色用的本地 OpenAI 兼容服务 `127.0.0.1:8975`（`mock_llm.py`，回 `[MOCK-REWRITE-OK] ` + 收到的 user 消息前 200 字，用于证明请求体确实带了「口述指令 + 选中原文」）；② 专项 a-②/③ 用一个可控 `mockws.exe` 冒充 `resources/whisper/whisper-server.exe`（测毕已还原，sha256 见 §11）；③ 专项 e-② 用只在**临时 portable 副本 B** 里把 asar 内下载源改指本地代理 `127.0.0.1:8981`（SKILL.md Round 293 手法，正式打包目录未动）。**未改 hosts / 防火墙 / 产品源码，未建 PR，Actions 保持禁用。**
> 证据目录（VM 本地，未入库）：`C:\Users\Administrator\r300\evidence\`（`core_*.log` / `a1_*.png|json` / `a2_*` / `a3_*` / `lan_*` / `relay_*` / `*_history.json` / `phase4_*` / `f_findings.md` 等）；打包 `r300_shareable_evidence.zip`。录屏：`C:\Users\Administrator\screencasts\speaktype-r300-core\speaktype-r300-core-edited.mp4`（核心 + 专项 a/b）与 `C:\Users\Administrator\screencasts\speaktype-r300-phase4\speaktype-r300-phase4-edited.mp4`（专项 d/e/f）；各阶段 `*-annotations.json` 为标注时间轴。
> 判定口径：**PASS/FAIL = 打包版实机实测**；「源码核对」「推断」「未测」单独标注，不把"有代码"当"验证过"。

## 给老板的结论（可直接转发）

1. #388 三项修复在打包版实测生效：手机麦会话中桌面连按两次 RightCtrl 都被忽略、不排队（LAN 与官方 relay 各 2/2，日志 `hold release ignored, phone session in progress`，手机句 8008ms 完整）；手机 stop 后 +87ms/+95ms 本机按住 RightCtrl 正常排成本地句（`queued → resumed`）；本地录音中/排队中手机 start 都收 `busy`；whisper 端口每次运行随机取、启动失败换端口、第三方抢占端口后下一句自动换端口恢复（59152→59154 被占 → 59160 成功）；坏模型 zh-TW/ja/ko 三语文案在状态条与 History 实机显示正确无乱码。核心链路（RightCtrl / 排队 / Alt+Q / Esc / F8 mock / 深色，SenseVoice zh + Parakeet en + whisper base ja）全绿。
2. 新立 **1 个 P1 + 1 个 P2 + 4 个 P3**，无 P0：**P1-300-1 首次安装下载模型时 app 整体崩溃**（Electron 原生「A JavaScript error occurred in the main process」，`AssertionError: assert(!this.paused)`：下载连接在 app 正写盘时被对端关闭就可能触发，根因是 Electron 43 内置 undici 7.29 的已知不可捕获断言 nodejs/undici#5360，应用层 try/catch 接不住，建议下载改走 Electron `net.request`）：经本地代理（响应后关连接）的 4 次完整响应中 2 次崩，第二次还把模型目录留在不可用状态；断网 10s 本身的换源 + Range 续传 2/2 按设计工作（真源直连是否会关连接本轮未测，若不会可降 P2）。P2-300-1 whisper-server「进程活着但不回应」时健康探测 `fetch()` 没有超时（Node 实测 300.8s 才失败），设计中的「60s 判定引擎故障」路径实际到不了，用户看到的是永久 `Transcribing…`、Esc 也退不出，只能重启；其余为 History 失败条目 Retry 后同一错误并排两遍双双截断（ja/ko 820px 下行动指引看不到）、手机录音中桌面 Alt+Q 会切断手机那句、侧栏切页继承上一页滚动位置、免按 20 分钟一个渲染进程内存 +0.5 MB/min 待定性。免按 20 分钟 139/139 句全落字、零 error、主进程内存平稳。
3. 判断：**本版不建议作为面向新用户的正式发布**，必须先修 P1-300-1（新用户首次下载 240–660 MB 模型，只要链路上有一层在响应后/中途关连接就可能看到崩溃框）；已安装用户日常听写链路不受影响。建议 301 轮连同 P2-300-1（探测加 `AbortSignal.timeout` + 总超时）、P3-300-2（Retry 后错误文案去重换行）一起修；导出格式与 Time saved 的设计结论见 §5（导出：建议做 VTT+纯文本带时间戳两项、不做 CSV/JSON；Time saved：改做「口径可解释 + 与 Wispr 同口径 150 vs 40 WPM」，不做团队看板）。

---

## 0. 环境与构建

| 项 | 结果 |
|---|---|
| 源码 | `wookat/speaktype` main HEAD `73ff642`（`docs(skill): 第 299 轮测试经验沉淀 (#389)`），含 #388 |
| Node / OS | Node 20.19.0 / npm 10.8.2 / Git 2.47.1；Windows Server 2022；无物理麦克风（全程 `--use-file-for-fake-audio-capture`） |
| `npm install` | 428 packages，成功（EBADENGINE 警告按任务说明忽略） |
| `npm run typecheck` / `npm run build` | 通过 / `✓ built in 1.88s` |
| `npm run pack:dir` | `win-unpacked` 产出完整并可运行；但 electron-builder 末尾 `signing with signtool.exe path=release\win-unpacked\SpeakType.exe … Exit code: 1`（VM 无签名证书环境，signtool 步骤失败，未影响产物）。**产物未签名**，与正式发布产物的差别仅在签名，记为 §10 口径说明，不立案 |
| Electron / builder | Electron 43.3.0 / electron-builder 26.15.3 |
| 关键文件 sha256（起止一致，见 §11） | `resources/app.asar` `E1FF0986…7575605`；`resources/whisper/whisper-server.exe` `9E581A4A…464D89`；`SpeakType.exe` `6BC035C6…47DFED` |
| 模型 | SenseVoice `model.int8.onnx`+`tokens.txt`；Parakeet encoder/decoder/joiner/tokens；whisper `ggml-base-q5_1.bin`（sha256 `422f1ae4…f01a8898`）——由上一轮缓存复制到 userData 模型目录，e 专项另走真源下载 |
| 音频夹具（TTS → ffmpeg 16k mono s16） | `hold_zh.wav`「开放时间早上9点至下午5点。」/ `hold_en_src.wav`「Please schedule the meeting for tomorrow at 3 in the afternoon.」/ `hold_ja.wav`「うちの中学は弁当制で持っていない場合は50円の学校販売のパンを買う。」/ `soak_zh.wav`（8.592s，免按循环）/ `hold_ko.wav` |
| 键盘注入 | `rkey.ps1`（SendInput 扫描码，`INPUT` 联合体需补到 32 字节否则返回 0——见 SKILL 追加节） |
| 手机麦模拟 | `phone.mjs`：LAN `wss://<lan>:<port>/ws?t=<token>` 与官方 relay 两种入口，`{"type":"start"}` → 20ms PCM 帧 → `{"type":"stop"}`，全程时间戳日志 |
| mock whisper-server | `mockws.exe`（C#）：`corrupt`（打印 `whisper_model_load: invalid model data (bad magic)` / `error: failed to initialize whisper context` 后 exit 1）、`hang`（listen 后 accept 不响应）、`noisy`（先喷 45 行 `mock-stderr-line-N (tail-check)` 再正常服务） |
| CDP | `--remote-debugging-port=9333`（正式包）/ `9223`（portable B）；`cdp.mjs` 抓 DOM 尺寸、`title`、`getComputedStyle`、`performance.memory` |

## 1. 总览矩阵

| # | 项目 | 结论 | 主要证据 |
|---|---|---|---|
| 核心-1 | RightCtrl 按住落字 Notepad（SenseVoice zh） | **PASS** | `03:42:01.907 finalize durationMs=2374 voicedMs=1220`；按住 2.4s 只播到夹具前四字，History `raw`「开饭时间。」→ `text`「开饭时间」（长按模式按设计去 CJK 尾句号，`polish.ts:208-210`），Notepad 同步落字 |
| 核心-2 | 排队第二句 | **PASS** | `03:42:30.691 previous session still finalizing, queued` → `03:42:31.029 resumed queued hold (frames=1, released=false)` → `03:42:33.073 finalize`，两句均落字 |
| 核心-3 | Alt+Q 进/出免按 | **PASS** | `03:43:54 / 03:44:03 / 03:44:11 / 03:44:15` 四条 finalize（最后一条 3420ms 为 Alt+Q 退出时收尾的半句「开饭时间早上9。」）；免按结束 toast |
| 核心-4 | 录音中 Esc | **PASS** | `core_esc_toast.png` toast「听写已取消 / 未落入任何文字」，`core_esc_history.json` 与取消前一致（无新增条目），Notepad 无新落字 |
| 核心-5 | F8 mock 改写 | **PASS** | `mock_llm.log 03:45:28` 请求 user 消息含 `Spoken instruction: """Rewrite this paragraph in a more formal tone."""` + `Original text: """Hey team, we need to get this done soon."""`；Notepad 选区被替换为 `[MOCK-REWRITE-OK] Rewrite the text below…`（mock 回显契约） |
| 核心-6 | 深色模式 | **PASS** | `theme=dark` 后 CDP：主窗 `body` 背景 `rgb(20,22,29)`、悬浮面板 `rgb(41,41,41)`；截图 `core_dark_*.png`；测毕还原 `system` |
| 核心-7 | SenseVoice zh | **PASS** | 核心-1/2/3 全部 SenseVoice；免按 8s 整句 `raw`=`text`「开饭时间早上9点至下午5点。」（免按保留句号，与设计一致）；夹具「开放时间」在长按短句、免按整句、手机 8s 句里都多次被识为「开饭时间」（免按 4/4、手机 4/6）——出现在整句中段而非仅句首，判定为 TTS 发音/模型同音混淆，与首词吞字观察无关 |
| 核心-8 | Parakeet en | **PASS（带观察）** | `03:47:05 finalize durationMs=4690`；History `Ple schedule the meeting for tomorrow at 3 in the afternoon.` ——首词 `Please` 吞成 `Ple`，其余逐字一致；夹具无前导静音而 fake mic 需 400–600ms 起转（SKILL Round 295 已记录的环境延迟），判为环境因素，见 §10 |
| 核心-9 | whisper base ja | **PASS** | `03:47:59 local whisper-server starting (model=base-q5_1, port=58998)` → `03:48:07 finalize`；History `raw`「うちの中学は弁当制で持っていない場合は50円の学校販売のパンを買う。」与夹具逐字一致（`text` 按长按规则去尾句号） |
| a-①-1 | 坏模型 zh-TW / ja / ko 状态条 | **PASS** | §3.a：三语悬浮条文案 = i18n 原文，无乱码 |
| a-①-2 | History 失败条目 820px / 1200px | **PASS（首次显示）/ FAIL 局部 → P3-300-2（Retry 后）** | 未 Retry 时三语在 820/1200 都两行内完整；点 Retry 后同一句错误并排出现两次，各被 `line-clamp-2` 截断（ja 820px 64→32 字符），行动指引「設定 → 音声認識 で削除して再ダウンロード」被截掉 |
| a-①-3 | Retry tooltip | **PASS（现状）+ 观察** | 错误 span `title` = 全文（CDP `titles` 采样）；Retry 按钮本身无 `title`，悬浮面板 `titles: []` |
| a-②-1 | whisper 活着但 60s 未就绪 → `localServerFailed` | **FAIL → P2-300-1** | `03:53:26.980 starting (port=59106)`，mock `hang: accepted, not responding`；74.8s / 89s 仍 `Transcribing…`，Esc 无效；`hangfetch.mjs` 实测 Node 20 `fetch` 对此类服务 300.8s 才抛 `UND_ERR_HEADERS_TIMEOUT` |
| a-②-2 | 杀掉挂起 mock 后归为 `localServerFailed`（非 corrupt） | **PASS** | `03:54:56.374 exited (4294967295)` → History `Local recognition engine failed to start: check main.log via About → Open log folder…` |
| a-②-3 | stderr 尾 30 行入日志 | **PASS** | `noisy` 模式 45 行 + 2 行请求日志 → main.log 保留最后 30 行（`mock-stderr-line-18` ~ `-45` + `mock: request GET /` + `POST /inference`），前 17 行被丢 |
| a-②-4 | 失败后下一次听写换新端口 | **PASS** | 59106（hang）→ 杀掉后下一句 `starting (port=59117)`；a-③ 中 59152→59154→59160 |
| a-③ | 端口竞态：取到端口后被第三方占住 | **PASS** | `a3_real_bind.log`：真 whisper-server 两次 `couldn't bind to server socket … port=59152 / 59154` exit 1 → 该句 History `localServerFailed`；下一句 `03:57:22 starting (port=59160)` → `03:57:30 finalize` 落字 |
| b-① | 手机会话中本机连按 RightCtrl 两次（LAN） | **PASS** | `03:58:38.551 / 03:58:41.571 hold release ignored, phone session in progress`；无 `queued`；手机句 `finalize durationMs=8008`（= 手机 stop 时刻） |
| b-② | 手机 stop 后 finalize 中本机按住 RightCtrl（LAN，+87ms） | **PASS** | `03:59:23.116 finalize(手机 6009ms)` → `03:59:23.194 down rctrl` → `.326 queued` → `.767 resumed queued hold (frames=1)` → `03:59:25.711 finalize 2385ms` 本地句落字 |
| b-③-i | 本地 RightCtrl 中手机 start | **PASS** | `lan_b3i_phone.log 03:59:49.279 recv {"type":"busy"}`；本地句 `03:59:51.355 finalize 2907ms` 不受影响 |
| b-③-ii | 本地排队中手机 start | **PASS（也 busy）** | `04:00:05.557 queued` → `04:00:05.712 recv {"type":"busy"}`（`isBusy()` 在 finalize 期间为 true） |
| b-④ | 手机会话中 Alt+Q | **观察 → P3-300-3** | `04:00:46.032 press q` → `04:00:46.033 finalize durationMs=3068`：Alt+Q 把手机 8s 那句在 3.07s 处切断收尾，且未进入免按；随后本机 RightCtrl 正常 `2353ms` |
| b-⑤ | relay 模式重跑 ①② | **PASS** | `relay_b1.log 04:01:38.416 / 04:01:41.422 ignored`，手机句 8008ms；`relay_b2 04:02:21.195 queued (+95ms) → .645 resumed (frames=2)`；与 LAN 行为一致，仅多 1 帧缓冲 |
| c-1 | Transcribe 导出仅 TXT/SRT 设计论证 | 完成 | §5.1：建议**做**（VTT + 带时间戳纯文本），不做 CSV/JSON/DOCX |
| c-2 | Home「Time saved」设计论证 | 完成 | §5.2：建议**改做**（口径可解释、150 vs 40 WPM 对齐 Wispr；hint 补「口述 150 词/分」一半口径） |
| d | 免按 20 分钟长会话 | **PASS**（139/139 句、零 error、主进程 PB 斜率 −0.11 MB/min）/ **待定 → P3-300-4**（renderer 5640 PB +0.50 MB/min） | §6 |
| e-1 | portable fresh profile 引导 → 真源下载 SenseVoice → 第一句 | **PASS** | §7.1：启动 → 首句落字 131s（含 660MB+234MB 两次真源下载 34s），`e1_history.json sessions:1 words:7`；3 条引导观察 |
| e-2 | 下载中断 10s 续传/换源 | **FAIL → P1-300-1**（换源+Range 续传子项 2/2 PASS） | §7.2：续传完成瞬间 `assert(!this.paused)` 崩溃 2 次，`e2_02_after_cut_error.png`；中断 34s 内 UI 无任何反馈 |
| f | 30 分钟自由发掘 + 三项竞品差距 | **完成**（28m23s；1 项立案 P3-300-5 切页滚动残留，3 项观察；3 项竞品差距均附官方文档/源码一手依据） | §8 / §8.1 |

## 2. 核心链路回归

序列全部用 `rkey.ps1` 注入、Notepad 前台、fake mic 播放对应夹具，`main.log` 与 Notepad 内容双证：

```text
[03:41:03.965] SpeakType 0.17.2 starting (packaged=true)
[03:41:07.102] sherpa worker started (sensevoice-small)
[03:42:01.907] dictation finalize: durationMs=2374 maxPeak=32768 voicedMs=1220        ← 核心-1
[03:42:30.691] dictation start: previous session still finalizing, queued            ← 核心-2
[03:42:31.029] dictation start: resumed queued hold (frames=1, released=false)
[03:42:33.073] dictation finalize: durationMs=2382 maxPeak=32768 voicedMs=1220
[03:43:54.525] dictation finalize: durationMs=7835 maxPeak=32768 voicedMs=4080        ← 核心-3 免按 4 句
[03:44:03.124] dictation finalize: durationMs=7734 maxPeak=28532 voicedMs=4120
[03:44:11.524] dictation finalize: durationMs=7511 maxPeak=28533 voicedMs=4160
[03:44:15.848] dictation finalize: durationMs=3420 maxPeak=28535 voicedMs=2000
```

F8：Notepad 内先用 SenseVoice 落字 `Hey team, we need to get this done soon.`（英文句由 zh 模型识别，用作选区素材），Ctrl+A 后按住 F8 播「Rewrite this paragraph in a more formal tone.」；`mock_llm.log` 两次请求（`03:44:58` 首次口述被截为 `…in a more`，重跑 `03:45:28` 完整），请求体结构如下，说明改写 prompt 把口述指令与选中原文分别放入 `Spoken instruction` / `Original text`：

```text
Rewrite the text below according to the user's spoken instruction (rewrite, polish, translate, expand, shorten, etc.).
Rules: 1. Output only the rewritten text … 3. Preserve the original line breaks and list structure.
Spoken instruction: """Rewrite this paragraph in a more formal tone."""
Original text: """Hey team, we need to get this done soon."""
```

Parakeet / whisper 段各自重启进程换夹具（`core_parakeet.log 03:46:39` / `core_whisper_ja.log 03:47:22`）。Parakeet 输出 `Ple schedule…`（首词吞字，见 §10 观察），whisper ja 完整。

## 3. 专项 a：#388 未复跑项

### 3.a ① 坏模型分类三语实机（`a1_*`）

方法：把 `ggml-base-q5_1.bin` 换成 4KB 随机字节（真 whisper-server 因此 `whisper_model_load: invalid model data (bad magic)` / `error: failed to initialize whisper context` exit 1，与 #388 关键词正则命中），`uiLanguage` 依次 `zh-TW` / `ja` / `ko`，窗口内宽 820 与 1200 各截一次，CDP 抓 History 失败条目 span 与 Retry 按钮几何。

```text
[03:50:05.663] local whisper-server starting (model=base-q5_1, port=59029)
[03:50:05.836] local whisper-server exited (1)
[03:50:05.837] whisper-server stderr (exit 1):
whisper_model_load: invalid model data (bad magic)
error: failed to initialize whisper context
```

| 语言 | 状态条 / History `error`（实测原文） | 820px | 1200px |
|---|---|---|---|
| zh-TW | `本地模型檔案損壞（多為下載不完整）：請在設定 → 語音識別中刪除該模型後重新下載` | 两行内完整，Retry `再試行`（ja 界面）/ `重試` 不挤压 | 一行完整 |
| ja | `ローカルモデルのファイルが破損しています（ダウンロード不完全の可能性）：設定 → 音声認識 で削除して再ダウンロードしてください` | 两行完整（64 字符 span 全显） | 两行完整 |
| ko | `로컬 모델 파일이 손상되었습니다(다운로드가 불완전했을 수 있음): 설정 → 음성 인식 에서 삭제 후 다시 다운로드하세요` | 两行完整 | 两行完整 |

**Retry 之后**（`a1_ja_820.png` 顶部条目、`a1_ja_1200.png` 顶部条目）：`History.tsx` 同一行内并排渲染 `failedEntry: {item.error}` 与 `retryError.msg`（同一句错误），两者都 `line-clamp-2`，Retry 按钮夹在中间；ja/ko 在 820px 下左侧 span 只剩「…ファイルが破損しています（ダウンロード…」，右侧只剩「…設定 → 音声認識 で削除して…」，**行动指引（去设置删模型重下）两边都看不全**；1200px 下 ja 仍两侧截断。`title` 悬停可见全文，但 Retry 按钮无 `title`。→ **P3-300-2**。

另一观察：第一条坏模型失败条目在 History 页停留时**没有即时出现**，切到别页再切回才刷新（1 次观察，`a1_zhtw_820.png` 前后对比）；未能稳定复现，记入 §10 待 301 复核。

### 3.b ② whisper 活着但不响应（`a2_*`，mock `hang`）

```text
03:53:27.107 start mode=hang port=59106      ← mockws 从 argv 拿到 app 传入的端口
03:53:27.369 listening 59106
03:53:27.506 hang: accepted, not responding   ← app 第一次健康探测 GET / 被 accept 后挂住
[03:53:26.980] local whisper-server starting (model=base-q5_1, port=59106)
```

- 74.8s（`a2_hang_74s.png`）与 ~89s（`a2_hang_queue_esc`）悬浮条仍 `Transcribing…`；期间再按住 RightCtrl 被 `queued`，Esc 只能 `queued hold dropped`，**第一句仍卡在 Transcribing…**（`a2_hang_after_second_esc.png`）。
- 手动杀 mock 后立即走 `close` 分支：`[03:54:56.374] local whisper-server exited (4294967295)` → stderr 空 → `exitCorrupt=false` → History `error = Local recognition engine failed to start…`（`localServerFailed`，**分类正确**），下一句换端口 `59117`。
- 根因（`localasr.ts:433-444`）：`waitHealthy` 用 `await fetch(...)` 无 `signal`，每次探测由 undici 默认 `headersTimeout`（300s）兜底；`hangfetch.mjs` 在同机 Node 20.19 复现：`rejected after 300.8s: TypeError fetch failed cause=UND_ERR_HEADERS_TIMEOUT`。因此「120 次 × 500ms = 60s」只对「连接被拒」成立，对「accept 不答」最坏 120 × 300s。Electron 43 内嵌 Node 22 的 undici 默认值同为 300s（Node 文档，未在 app 内等到 300s）。
- 60s 分类路径（`not ready after 60s`）**本轮实机未到达**；`localServerFailed` 分支由「杀进程」路径证明。→ **P2-300-1**。

### 3.c ② stderr 尾 30 行（mock `noisy`）

`03:55:25 start mode=noisy port=59117`：先输出 45 行 `mock-stderr-line-N (tail-check)`，再正常服务；随后切 `hang` 模式复用同端口、杀掉后 main.log：

```text
whisper-server stderr (exit 4294967295):
mock-stderr-line-18 (tail-check)
…（共 30 行）
mock-stderr-line-45 (tail-check)
mock: request GET / HTTP/1.1
mock: request POST /inference HTTP/1.1
```

= 最后 30 个非空行（`STDERR_TAIL=30`，`localasr.ts:459-465`），PASS。

### 3.d ③ 端口分配竞态（`a3_*`，真 whisper-server + 真模型）

监听脚本轮询 main.log 的 `starting (… port=NNNN)`，7ms 内 `net.createServer().listen(NNNN)` 抢占。真 whisper-server 是**先加载模型再 bind**（stderr 尾部 `whisper_init_state: compute buffer (decode) = 96.37 MB` 之后才 `couldn't bind to server socket`），所以抢占窗口约 120ms，脚本两次都抢到：

```text
[03:56:53.817] starting (model=base-q5_1, port=59152)   ← 录音开始时预热
[03:56:53.939] exited (1)  … couldn't bind to server socket: hostname=127.0.0.1 port=59152
[03:56:56.183] dictation finalize: durationMs=2378
[03:56:56.188] starting (model=base-q5_1, port=59154)   ← 收尾时自动换端口重试
[03:56:56.308] exited (1)  … couldn't bind … port=59154
→ 该句 History failed: localServerFailed（非 corrupt，stderr 无 bad magic）
[03:57:22.398] starting (model=base-q5_1, port=59160)   ← 停止抢占后下一句
[03:57:30.265] dictation finalize: durationMs=7873      ← 落字「うちの中学は…」
```

PASS：失败 → 换端口 → 恢复，且分类为引擎故障而非模型损坏。补充观察：同一句内 app 自己重试了一次（预热失败 + 收尾再起），这是 `port=0` 复位后 `ensureLocalServer` 再调用的自然结果，不是显式重试逻辑。

## 4. 专项 b：手机麦 owner 隔离深挖

`remotemic.ts:310-323`：`start` 时 `isBusy()` → `busy`；`stop`/`cancel` 只接受 `activeWs === ws`；`broadcastToPhones` 在 `idle|error` 时释放 `activeWs`。`dictation.ts stop(owner)`：`if (owner && this.remoteSource) { log…ignored; return }`；`remoteSource` 在 `start()` 里随新会话赋值——所以 b-② 的关键是「手机 stop 后、finalize 中」`busy=true` 仍为真、`queueStart` 走 `finalizing` 排队分支，排队句 `resumeQueued()` → `start(mode, remote=false)` 重新赋 `remoteSource=false`，不会被残留误忽略（源码核对 + 实测一致）。

| 用例 | LAN | relay（官方 `speaktype.zalize.com/relay`） |
|---|---|---|
| ① 手机 8s 句中本机 RightCtrl 按住 1.5s ×2 | `03:58:38.551 / 41.571 ignored`，无 queued，手机 `finalize 8008ms`，手机端 partial 一路更新到「开饭时间早上9点至下午5点。」 | `04:01:38.416 / 41.422 ignored`，`8008ms`，同上 |
| ② 手机 stop → +Δ 本机按住 2.5s | Δ=+87ms（`.116 finalize` → `.194 down`）→ `queued` → `resumed (frames=1)` → 本地句「开饭时间」落字 | Δ=+95ms → `queued` → `resumed (frames=2)` → 本地句「开放时间」落字 |
| ③-i 本地录音中手机 start | `busy` | — |
| ③-ii 本地排队中手机 start | `busy`（`04:00:05.557 queued` → `.712 busy`） | — |
| ④ 手机会话中 Alt+Q | 手机句被切断收尾（3068ms），无免按、无 toast 提示手机 | — |

要求的「+50ms」精确窗口：两次实测分别 +87/+95ms（SendInput 调度抖动），更早的窗口**未测**；但 +87ms 时 `busy` 仍为 true（finalize 在 polish 之后才结束，实测 finalize 到 idle 约 640ms），逻辑上 +50ms 落在同一 `finalizing` 分支，属源码推断。

④ 的判定：#388 说明中手机那句「只由手机端 stop/cancel/断线/桌面 Esc 结束」，Alt+Q 不在列表；实测 `toggleHandsFree()` 在 `busy` 时直接 `stop()`（owner 为 null）→ finalize 手机句。对手机端用户来说是「话没说完被电脑上的一个键打断」，且手机端只看到 `transcribing`，不知原因。→ **P3-300-3**（与 P3-298-1 同源：本地热键动作未区分会话所有者）。

## 5. 专项 c：设计论证（不改代码）

### 5.1 Transcribe 导出仅 TXT / SRT

**现状**（`Transcribe.tsx:304-310` 源码 + 实机 f 段导出实测）：`exportTxt` 把 segments 用 `\n` 拼接；`exportSrt` 生成标准 SRT。无 VTT、无带时间戳文本、无 JSON/CSV/DOCX。

**竞品一手核实（官方文档，2026-09-06 访问）**：

| 产品 | 导出格式（官方文档原文/页面） | 来源 |
|---|---|---|
| Buzz（开源，Whisper GUI） | 文件导入页 `Export As: TXT / SRT / VTT` + `Word-Level Timings` 开关；查看器导出菜单 `SRT, VTT, TXT, JSON, and more` | https://chidiwilliams.github.io/buzz/docs/usage/file_import 、 https://chidiwilliams.github.io/buzz/docs/usage/transcription_viewer |
| MacWhisper | 官方 CLI 文档 `--format`：免费 `txt / srt / vtt / csv`，Pro `json / md / html / avid`；`--style transcript|subtitles|segments`（与 app 导出面板同） | https://docs.macwhisper.com/article/57-macwhisper-command-line-tool |
| Handy（开源，Rust） | 无文件转写导出；History 仅 copy / save-star / retry / delete / re-transcribe（源码 `src/components/settings/HistorySettings.tsx`，本轮 clone 检查） | https://github.com/cjpais/Handy |
| Wispr Flow / Typeless | 定位为实时听写，无文件转写导出功能（官方 docs 无该页） | https://docs.wisprflow.ai / https://typeless.com |

**用户价值 / 复杂度**：VTT 是网页 `<track>` 与 YouTube/Vimeo 字幕上传的通用格式，与 SRT 只差头部 `WEBVTT` 与毫秒分隔符 `.`；「带时间戳纯文本」（`[00:01:23] 文本`）是会议纪要最常粘贴的形态。两者各 <20 行渲染端代码、无新依赖。CSV/JSON 面向开发者，DOCX 需新依赖，用户群（听写用户）价值低。

**结论：建议做**——301 轮加 VTT 与「带时间戳 TXT」两个导出项（同一 `saveText` 通道），**不做** CSV/JSON/DOCX；并把导出按钮改成下拉/分段控件避免 4 个并排按钮在 820px 挤压（现 2 个按钮在 820px 下正常）。

### 5.2 Home「Time saved」

**现状**（`Home.tsx:35`、`store.ts countWords/addStats`）：`saved = max(0, round(words/40 × 60000) − durationMs)`，即「按 40 WPM 手打所需时间 − 实际说话时长」；`countWords` CJK 每字 1 词、拉丁串 1 词；hint 文案 `home.stat.savedHint` = 「按 40 字/分钟手打速度估算」（en「Estimated at 40 words/min typing speed」，5 语均有）。298 轮看到「0s」是因为当时 `words` 少而 `durationMs`（含按住时间与静音）大，公式取 0。本轮实机（`f_820_home.txt`，免按 20 分钟后）：协作次数 169 / 生成文本 2163 / 累计语音输入 20 分钟 / **节省时间 33 分钟**：2163 字 ÷ 40 = 54.1 分钟手打 − 20.4 分钟录音 ≈ 33.7 分钟，与公式一致；短句场景数值很小甚至为 0（e-1 fresh profile 第一句 7 字，首页「节省时间 7 秒」，见 §7；7 字按 40 字/分手打上限只有 10.5s，说 3s 以上就归零）。

**竞品一手核实**：Wispr Flow 官方帮助中心「Team Insights」页原文：*"Time Saved card … Savings are computed from total dictated words, comparing typing at 40 WPM to dictation at 150 WPM. Hover the info tooltip on the Time Saved card to see this explanation in-product."*（https://docs.wisprflow.ai/articles/5936327641-team-insights-measuring-the-impact-of-wispr-flow-rollout-admin-usage-page ）——即**口径只依赖词数，不依赖录音时长，且在产品内 tooltip 解释口径**；个人版 Insights 展示 WPM / total words / apps / streak。Typeless 官网强调 filler 去除、修正、本地历史，未见 time-saved 看板。Handy 无统计页。

**问题**：① 我们用「实际录音时长」而非「150 WPM 口述时长」做减数——录音时长包含按住键的空白、思考停顿和 ASR 收尾，所以短句/慢说场景会被算成 0，与用户直觉（「我确实比打字快」）相悖；② 口径半透明：hint 说了「40 字/分手打」但没说减数是实际录音时长，用户无法理解为什么说了一句节省是 0；③ CJK 按字算词、40 WPM 是英文口径，中文手打 40 字/分明显偏低（中文拼音输入常见 60–80 字/分），会把中文用户节省时间算高。

**结论：改做 X**——(a) 分子改为 `words × (1/40 − 1/150) × 60000` 的纯口径估算（与 Wispr 同口径、可解释，永不为 0 只要有字）；(b) hint 从「按 40 字/分钟手打速度估算」改为「按手打 40 词/分、口述 150 词/分估算」，中文界面用「字/分」并把手打基线调到 60 字/分；(c) 不做团队看板 / 周报（Wispr Team Insights 是付费团队功能，与 SpeakType 本地优先定位不符）。复杂度：主/渲染各 <10 行 + 5 语 i18n。

## 6. 专项 d：免按 20 分钟长会话

**方法**：zh-CN + SenseVoice，`--use-file-for-fake-audio-capture=soak_zh.wav`（8.592s，`ffprobe`）循环；Notepad 前台，`rkey.ps1` 在 `04:13:52.018` 发 Alt+Q 进入免按，定时 `1200.011s` 后再发 Alt+Q 退出；全程不碰桌面；`rss.ps1` 每 60s 对 8 个 SpeakType 进程采 WorkingSet/PrivateBytes（`soak_rss.csv`，21 个采样点）。

**落字与句数**（`soak_metrics.json` / `soak_main.log` / `soak_notepad.txt` / `soak_history_after.json`）：

| 指标 | 值 |
|---|---|
| 期望句数 | 1200.011 / 8.592 = **139.66** |
| `dictation finalize` 行数 | **139** |
| History 新增条目 | **139**（`soak_history_before.json` → `after`） |
| Notepad 非空行 | **139** |
| 节拍 | mean 8.640s / median 8.6005s / min 6.179s / max 9.949s |
| 逐字完整句 | **136 / 139**：`开饭时间早上9点至下午5点。`×78 + `开放时间早上9点至下午5点。`×58 |
| 非完整句 | 3：`开饭时间早上9点至下午5。`（最后一句，Alt+Q 落在句尾 `durationMs=5277`，预期截断）、`开放上9点至下午5点。`（缺「时间早」）、`放时间早上9点至下午5点。`（缺「开」）——2/139 = 1.4% 中途丢字 |
| `[error]` / `[warn]` | **0 / 0**（`soak_errors.txt count=0`，20 分钟窗口内 main.log 仅 finalize/paste 信息行） |
| 静默自动退出 / 重入 | 未触发（139 句连续，无「长时间未检到人声」toast） |

**内存**（`soak_rss.csv`，最小二乘斜率，MB/min；稳定窗取 301s–1142s 共 15 点，排除 0–241s 模型加载回落段与 1200s 停止瞬间的采样）：

| 进程 | PID | 起点(0s) WS/PB | 5min WS/PB | 19min WS/PB | 稳定窗斜率 WS / PB |
|---|---|---|---|---|---|
| main | 7576 | 439.26 / 386.11 | 315.54 / 413.24 | 323.55 / 411.47 | +0.528 / **−0.108** |
| renderer | 5640 | 98.88 / 45.15 | 32.39 / 46.33 | 32.39 / 54.02 | +0.025 / **+0.500**（单调：46.3→47.1→49.4→48.1→48.2→49.6→49.5→50.2→50.7→51.2→51.8→52.6→52.5→53.4→54.0） |
| renderer | 3064 | 92.03 / 51.94 | 37.89 / 72.85 | 30.91 / 68.34 | −0.182 / +0.287（锯齿 60↔73，无单调） |
| renderer | 5764 | 103.39 / 57.98 | 50.21 / 62.70 | 49.36 / 62.86 | −0.040 / +0.014 |
| renderer | 1280 | 91.09 / 50.38 | 32.76 / 50.47 | 32.26 / 50.40 | −0.040 / −0.003 |
| gpu / utility×2 | 1544 / 2688 / 2016 | — | — | — | 全部 ≈0（±0.05） |
| **全进程合计** | 8 进程 | 1000.4 / 629.0 | 567.3 / 682.9 | 565.3 / 684.3 | **+0.161 / +0.68** |

**结论**：
- 落字、句数、日志三项 **PASS**（139/139/139 vs 期望 139.66；0 error）。
- 内存：主进程 PrivateBytes 稳定窗斜率 −0.108 MB/min（412–417 MB 平台），**PASS**；全进程 WorkingSet 合计 +0.161 MB/min，与 #285 基线口径（round 230/234 用全进程 WS 合计 ≤0.15）**持平于阈值边缘**——WS 受 OS 修整噪声大（main WS 0→5min 从 439 掉到 316 是 Windows 对后台窗口的工作集修整，单点 315↔336 摆动），不作为主判据。窗口选择敏感：改用「≥5min 至终点全 16 点」拟合，main PB −0.04 / WS +0.77，renderer 5640 PB +0.52，renderer 3064 PB +0.22（锯齿）；测试代理独立算得 main WS +1.38 / PB +0.21、renderer 1280 WS +0.87——PB 结论一致（主进程平、5640 单调涨），WS 数值因窗口/取点不同差异大，因此 301 起以 PrivateBytes 为唯一判据并把窗口写死为「5min→停止前 1 点」。
- **待定 → P3-300-4**：渲染进程 PID 5640 的 PrivateBytes 15 个采样点单调上升 +0.5 MB/min（46→54 MB，14 分钟 +7.7 MB），与 round 188/189 记录的「悬浮条/实时字幕窗口每句累积」形态一致；本轮 20 分钟窗口按 SKILL round 189c 方法论不足以定案（要求 ≥15 分钟稳定窗全量拟合且排除锯齿），且未定位 5640 对应哪个窗口（app 已按流程退出，无法再用 CDP 反查）。按 +0.5 MB/min 外推 8 小时免按 ≈ +240 MB，不致崩溃但应在 301 轮 60 分钟复测定性。

## 7. 专项 e：首次安装体验（portable fresh profile）

**方法**：`mkportable.ps1` 从 `win-unpacked` 复制两份便携副本。**A**：原样 asar，`SpeakType-data` 空目录（fresh profile），直连真源，用于 e-1；**B**：asar 内下载源三条（HF / mirror / GitHub）改指向本机 `dlproxy`（`127.0.0.1:8981`，透传真源、可 `cut`），用于 e-2；B 的 asar 已改，只用于下载路径，不用 B 做听写。两份都在 §11 删除。

### 7.1 e-1 fresh profile → 引导 → 下载 → 第一句（A，`e1_*`）

| 时刻（UTC） | 步骤 | 用户此刻知道下一步吗 |
|---|---|---|
| 04:34:36.0 | 双击 `SpeakType.exe`（portable mode, userData 在副本目录） | — |
| ≤04:34:55.8 | 主窗出现（首帧观察上界 19.8s，窗口句柄计时器失效，精确值需看录屏帧） | 首屏（`e1_01_first.png` / `e1_first_dom.txt`）：顶部「Hold RightCtrl to start voice typing」+ 「Download the offline speech model · One-time download (~660MB)」+ 两个模型选项（CJK+英 234MB / 英+25 欧语 660MB）+ Download 按钮 + 「First time? 4 quick steps」。**知道**：唯一主按钮就是 Download |
| 04:35:09.5 → 04:35:38.8 | 按默认（系统 en → `language=en`、`localModel=parakeet-tdt-0.6b-v3`）直接点 Download → 进度条 0%→99% → 28.1s 后消失，main.log `local model parakeet-tdt-0.6b-v3 downloaded`（660MB，VM 到真源带宽好） | 进度条 + Cancel 可见（`e1_parakeet_04_progress.png`）。**知道** |
| 04:35:38 → 04:36:13 | 下载完成后模型区块整块消失（`e1_parakeet_05_done.png`），首页只剩 4 步引导；测试者要中文，需 Settings → Speech → 选 SenseVoice → 回 Home 才再次出现「Download ~234MB」 | **半知道**：想换语言的用户不知道模型选择在哪；首屏没说「下载后可在设置更换」 |
| 04:36:16.9 → 04:36:22.1 | SenseVoice 234MB 5.3s 下载完成（`e1_04_progress.png` / `e1_05_done.png`） | 知道 |
| 04:36:42.3 → 04:36:47.3 | Notepad 前台，RightCtrl 按住 4000ms（fake mic `hold_zh.wav`）→ `sherpa worker started (sensevoice-small)` → `finalize durationMs=3881` → 落字「开放时间早上9」（4s 只覆盖夹具前半句，属测试参数）（`e1_06_first_paste.png`） | 4 步引导第 3/4 步照做即可。**知道** |
| 04:36:47 | Home：Sessions 1 / Words 7 / Voice input 4s / Time saved 7s（`e1_home_after.png`）；引导卡仍原样显示（未因首句完成而收起或打勾） | — |

- **计时**：启动 → 首句落字 **131s**（含 660MB+234MB 两次下载 34s、切模型 5 次点击）；若首屏就点 234MB 选项，预计 <60s。首屏 → 第一句所需点击：Download①（默认 660MB）→ Settings② → Speech③ → 选模型④ → Home⑤ → Download⑥ → Notepad⑦。
- **e-1 判定：PASS**（引导可发现、下载可完成、首句落字、`e1_history.json` `sessions:1 words:7 durationMs:3881`）。
- **观察（不立案）**：① 首屏模型两选项默认跟随系统语言（`store.ts:11-12` `CJK_LOCALE = /^(zh|ja|ko|yue)/` → SenseVoice，否则 Parakeet；源码核对，中文 Windows 未实测），本 VM 为 en 系统故默认 660MB 不算缺陷；但「下载后模型选择去了哪」缺一句提示（建议 done 态保留一行「已安装 X · 在设置 → 语音识别可更换」）。② 首句完成后 4 步引导不收起、不打勾，与 Home 上方统计 `Sessions 1` 并存略冗余。③ main.log 只记 `downloaded`，不记成功源与耗时，出问题时无法从日志判断走的是 HF / mirror / GitHub（建议 `downloaded from <host> in <s>`）。④ 首帧出现时间只拿到 ≤19.8s 上界，无法与 Round 29x 的冷启动基线对比，301 用录屏帧或 `app.on('ready')` 日志时间戳补。

### 7.2 e-2 下载中断 10s（B，`e2_latecut_*` / `e2_*`）

`cut10.ps1`：监控 `dlproxy.log` 转发字节数到阈值后把代理切到 `cut`（活动流 SO_LINGER=0 关闭、新连接直接关）10.0s 再恢复。两次：

| 次 | 切断点 | 换源/续传 | 结果 |
|---|---|---|---|
| ① `latecut` | 触发 26.63%、实际 **91.6%**（PowerShell 启动延迟，219,152,384/239,233,841） | `04:37:23.930 download source failed: …/hf/… TypeError: terminated` → mirror 被拒、`04:37:53.960 stalled: no data for 30s` → `04:37:53.966 REQ gh … range=bytes=219152384-` → `RESP 206 len=20081457` → `04:37:57.660 local model sensevoice-small downloaded` | **PASS**：自动换源 + Range 续传，只重下 20,081,457 B（重复字节 0），hash `C71F0CE0…2CD51` 正确，`.part/.part.json` 清理。**UI 侧**：切断到恢复的 34s 内进度条**不变、无任何提示**（`e2_latecut_01_cut_ui_*.png` 4 张一致、`e2_latecut_after60_dom.txt`），用户不知道在等 30s stall 超时 |
| ② 正式 | 触发 25.40%、实际 **30.57%**（73,138,176 B 已转发 / 72,417,280 B 已落盘） | `04:39:45.322 terminated` → mirror `04:40:15.705 stalled 30s` → `04:40:15.710 REQ gh range=bytes=72417280-` → `206 len=166816561` → `04:40:20.757 DONE` | **FAIL → P1-300-1**：`DONE` 后 12ms 主进程 `uncaughtException AssertionError assert(!this.paused)`（`e2_02_after_cut_error.png`，`e2_crash_main.log`），原生错误框、app 退出。重开 B（`04:42:21`）Home「Resume 99%」一键把已齐字节的 `.part` 校验提为成品（hash 正确），随后 tokens.txt 完成瞬间 `04:42:37.904` **再次同样崩溃**，目录缺 `tokens.txt`（`e2_model_files.txt`）。第三次重开（`05:11:40.665`）Home 仍 Resume 99%（`e2_03_relaunch_incomplete.png`），点一次后 tokens.txt 的 `.part`（字节已齐）本地校验提为成品、「离线模型已就绪」toast（`e2_04_third_try.png`、`e2_relaunch_main.log`），model/tokens 两 hash 均与真源一致、无残留 `.part`、无新 HTTP 请求——即**用户要经历 2 次崩溃 + 3 次启动 + 2 次手点才装完一个模型**。 |

- 续传机制本身（`download.ts` `.part` + `.part.json` + `Range` + `X-Linked-ETag` 校验）两次都按设计工作，2/2；崩溃是 undici 层，在续传成功之后。
- **e-2 判定：FAIL（P1-300-1）**；自动续传/换源子项 PASS；「断网期间用户可感知」子项 **FAIL 局部**（34s 无反馈，未单独立案，并入 P1 修复时一起做：stall 期间进度条改为「连接中断，正在重试…」）。

## 8. 专项 f：自由发掘 30 分钟 + 竞品差距

**方法**：正常打包版 + 正常 profile、中文 UI，`f_timeline.txt` 04:42:57.614 起、05:11:21 止（28m23s，在 30 分钟时间盒内），以真实用户身份走完六个页面 + 托盘 + 键盘导航，`f_main.log` 为该窗口 main.log 切片（0 error）。逐流程实测：

| 流程 | 实测 | 证据 |
|---|---|---|
| 切模型后首句（松键→History 出现） | SenseVoice 0.632s / Parakeet 0.806s / whisper base 1.172s（含模型已就绪，不是冷加载基准） | `f_cold_timings.txt`、`f_cold_*_history.json`、`f_cold_*.png` |
| 无焦点输入框时听写 | toast「当前没有可输入的窗口 / 内容已保存到历史，可从历史页复制」，History 有条目、未落字；main.log `paste skipped: no input target` | `f_unfocused_toast.txt/.png`、`f_unfocused_history.json` |
| 词典手动加词 → 下一句 | 加「开放时间」后同一夹具由「开饭时间…」变为「开放时间…」，即时生效 | `f_hotword_added.png`、`f_hotword_paste.png`、`f_hotword_history.json` |
| 落字后手动改词（自动学习） | 在 Notepad 把落字「开放时间」改成「开放时段」，等待后词典仍只有 1 条热词、无「已学会新词」toast——**未能验证学到**（见下观察 ③） | `f_autolearn_manual_edit.png`、`f_autolearn_no_new_word.png`、`f_820_dictionary.txt`（`1/300 热词`） |
| History 搜索 / 复制粘贴 / 纠错入词典 / Retry 到剪贴板 | 全部可用；无结果态有空状态文案；「纠错」把修改写入词典 | `f_history_search.png`、`f_history_copy_paste.png`、`f_correction_added_dictionary.png`、`f_history_retry_*.png`、`f_history_no_results.png` |
| History 单条删除 | 条目即刻消失；截图窗口内**没看到** Undo 栏（见观察 ①） | `f_history_deleted_no_undo.png`、`f_history_after_delete.json` |
| 侧栏切页 | History 下滚后点「人设」，人设页从中间打开、看不到标题与概览（观察 ②） | `f_navigation_retained_scroll.png` |
| 文件转录 | 资源管理器真拖放 `hold_zh.wav` → 1 段；导出 TXT / SRT 走系统对话框成功；SRT 单段 0.000→6.592s 在 6.592s 音频内 | `f_transcribe_*.png`、`f_transcribe.txt/.srt`、`f_export_check.txt` |
| 设置页新手提示 | 按住键 / 免按 / 自动粘贴 / 语言模型 / 主题 5 项均有 hint 文案 | `f_settings_hints_dom.txt`、`f_settings_*_hints.png` |
| 纯键盘导航 2m17s | Tab/Shift+Tab/Enter/Esc 可达设置、识别、拖放区、导出对话框、History 搜索与纠错，焦点环可见 | `f_keyboard_timeline.txt`、`f_keyboard_*.png` |
| 关闭「自动粘贴」 | 听写只进 History 不落字；重开后恢复 | `f_autopaste_off_*.png/.json`、`f_autopaste_on_home.png` |
| 820px 六页 | `scrollWidth == innerWidth == 820`，无横向溢出 | `f_820_*.txt/.png` |
| 托盘菜单 | 可打开 | `f_tray_menu.png` |

**「让我不想继续用」的点**（诚实结论：30 分钟内没有找到 3 个独立的「弃用级」阻断；核心听写链路顺手。以下按影响排序，只有 ② 立案）：

1. **首次安装可能崩溃 + 断网 34s 无反馈**（跨专项，已立 P1-300-1）——作为新用户我看到的是一个 JS 报错框，这是本轮唯一会让我卸载的时刻。
2. **切页继承上一页滚动位置 → P3-300-5**：从滚到底的 History 点「人设」，人设页从第 2 张卡片开始显示、标题与说明不可见，第一反应是「这页坏了」。根因 `App.tsx:180` 六页共用一个 `<main className="… overflow-y-auto">` 滚动容器，`setPage` 只换子树不重置 `scrollTop`。修法：`useEffect(() => mainRef.current?.scrollTo(0, 0), [page])`（3 行）。
3. **自动学习纠错完全不可感知**（观察 ③，未立案）：词典页的开关文案「落字后你在输入框里手动改对的词，自动学进词典」承诺了行为，但改完词后既没有「正在观察」也没有「没学到/为什么没学到」的反馈。源码（`watchedit.ts`）学到时会弹「已学会新词」toast 并带撤销，本轮**一次都没弹**；限制条件很多（轮询 700ms、单次新增 ≤11 字符、变化段 ≤20 字符、停顿 1.5s 判定、观察 45s/最长 300s、焦点须留在同一控件、Win32 Notepad 走 `Name` 兜底）——这次改「时间→时段」的按键方式（逐键 / 整段替换）测试代理未记录，未学到的原因本轮没定位，**不能据此断言功能失效**，列入 301 用 Notepad / VS Code / Chrome 三种控件各 3 次定性。
4. **History 删除后没看到 Undo**（观察 ①，**未立案**）：源码 `History.tsx:401-416` 有 15s 倒计时的 Undo 栏（`fixed bottom-6 right-6`），而截图里 app 窗口下沿被任务栏盖住（1280×720 VM，截图里窗口底部的列表项被任务栏截断），Undo 栏很可能在屏外——环境因素为主；但产品侧「Undo 栏在右下角、删除按钮在列表顶部」的距离感值得 301 在整窗可见时复核一次。
5. 导出 TXT/SRT 成功后没有「已保存到 …」的持久确认（对话框关了就结束），配合 §5.1 导出改造一起做。

### 8.1 对照 Wispr Flow / Typeless / Handy 的 3 项差距（一手依据，2026-09-06 访问/克隆）

排序依据：① 是否落在新用户首日必经路径；② 本轮实测是否亲历；③ 竞品是否有**已发布**的对应能力（官方文档/源码，不引旧报告）。

| # | 差距 | 我们现状（本轮实测/源码） | 竞品一手依据 | 建议 |
|---|---|---|---|---|
| 1 | **下载链路健壮性与可观测性** | P1-300-1 崩溃；stall 30s 内 UI 零反馈（§7.2）；`download.ts` 有 `.part`+Range+sha256，无「校验中」状态；log 不记成功源/耗时 | Handy `src-tauri/src/managers/model/download.rs`（main，本轮 raw 拉取）：`HTTP_CONNECT_TIMEOUT 15s`、`DOWNLOAD_STALL_TIMEOUT 60s`、Range 续传 + 416/200-on-Range 分支处理、sha256 校验前后发 `model-verification-started/completed` 事件给 UI、reqwest 栈（无 undici 断言类风险） | 修 P1 时一并：stall 期间进度条文案「连接中断，正在重试…」、完成后「校验中」态、log 记源与耗时 |
| 2 | **自动学习的可解释性** | `autoLearn` 开关 + 学到才弹 toast；词典里学来的词与手加的词无区分；本轮 1 次未学到且无解释（§8 ③） | Wispr Flow Help Center「Teach Flow your words with the dictionary」：`Auto-add to dictionary` 在 Settings → System → Extras，**自动学到的词带 ✨ 标记**，「常用词自动过滤」写在文案里；auto-learn 只产生词汇项、不产生替换规则（https://docs.wisprflow.ai/articles/4052411709-teach-flow-your-words-with-the-dictionary ） | 词典条目加「自动学到」标记与来源句；学习窗口结束若无所得且检测到编辑，给一次性 toast「这次改动没学到（改动过大/离开了输入框）」 |
| 3 | **无 LLM 时的口语整理** | 本地只删 `嗯/呃/那个那个/就是就是/然后然后`（`polish.ts:9`）；Home 明示「人设只在配置了 AI 润色模型后才会影响落字」（`f_820_home.txt`），即自我改口（「明天，不，后天」）、列表自动分条等默认没有 | Typeless 官方 Key Features：「Auto-edits when you change your mind」「removes filler words」「Auto-formats lists」为默认能力（https://www.typeless.com/help/quickstart/key-features ）；Handy 与我们同为本地、需自配 post-processing API（源码树 `src/components/settings/PostProcessingSettingsApi/`，本轮 clone） | 不做云端 LLM 默认开；做本地规则层扩展：中/英改口模式（`不是 X 是 Y`、`no, I mean`）、英文 filler（`um/uh/you know`）；效果需 301 用 20 句改口夹具 A/B 后再定 |

Handy 另有两点我们已领先：Handy History 只有 copy/star/retry/delete/re-transcribe、无搜索（`src/components/settings/HistorySettings.tsx`，本轮 clone）；无文件转录导出（§5.1）。

## 9. 立案清单

### P2-300-1 whisper-server「活着但不响应」时无超时，用户永久卡 `Transcribing…`

- 复现：让 `resources/whisper/whisper-server.exe` 监听 app 传入的 `--port` 但对 `GET /` 不回应（`mockws.exe hang`），选 whisper 模型按住 RightCtrl 说一句 → 悬浮条 `Transcribing…` 持续 >89s，Esc 不能退出，再按 RightCtrl 只会 `queued`/`dropped`，直到进程被杀或 app 重启。
- 根因（`localasr.ts:433-444`）：`waitHealthy` 的 `fetch()` 无 `AbortSignal`，单次探测由 undici `headersTimeout`（默认 300s，本机 Node 20 实测 300.8s）兜底，「120 × 500ms」只在连接被拒时成立；`ensureLocalServer` 的调用方也没有总超时。
- 建议修法：① `fetch(url, { signal: AbortSignal.timeout(1000) })`；② `waitHealthy` 改为以 `Date.now()` 计的 60s 硬上限，超时 `child.kill()` 并抛 `startupError("not ready after 60s")`（现有分类逻辑不动）；③ Esc（`cancel()`）在 `state=transcribing` 且 `ready` 挂起时也能中止等待（reject 挂起的 `ready`）。补一条 SKILL 用例：mock `hang` 模式必须在 ≤61s 内看到 `localServerFailed`。

### P3-300-2 History 失败条目点 Retry 后同一错误并排显示两遍、双双截断（ja/ko 820/1200px）

- 复现：任一本地模型损坏 → History 出现失败条目 → 点「Retry」再失败 → 同一行内左 `失败: <error>`、中 Retry、右 `<error>`，ja/ko 在 820px 下两侧各只剩一半，行动指引不可见；1200px 下 ja 仍截断。
- 根因（`History.tsx:275-296`）：`retryError.msg` 与 `item.error` 同源却分别渲染在同一 `flex items-center` 行内，两者都 `line-clamp-2 min-w-0`，宽度被均分。
- 建议：`retryError.msg === item.error` 时不重复渲染；否则 `retryError` 换到第二行（`flex-wrap` + `basis-full`）；给 Retry 按钮加 `title={t("history.retry")}`；1200px 以上放宽 `line-clamp-3`。

### P3-300-3 手机麦会话中桌面 Alt+Q 会截断手机那句且不进入免按

- 复现：手机 start 并推流 8s；3s 时桌面按 Alt+Q → main.log 立刻 `finalize durationMs=3068`，手机端只看到 `transcribing`，随后 Alt+Q 未进入免按（无「Hands-free」toast）。
- 根因：`toggleHandsFree()`（`dictation.ts`）在 `busy` 时无条件 `stop()`（owner=null），未检查 `remoteSource`；#388 只在 `stop(owner)` 有 owner 时保护。
- 建议：`remoteSource && busy` 时 Alt+Q 走「忽略 + toast 提示手机正在录音」（复用 `toast.busy` 类文案）；或明确产品口径「桌面任何热键都可终止手机句」并在手机端给出 `message`，二选一在 301 定。

### P1-300-1 模型下载连接在 app 写盘时被对端关闭 → 整个 app 崩溃（undici 不可捕获断言，Electron 43 内置 7.29 未修）

- 现象（专项 e-2 第二次复现，portable B 新 profile，真源经本地代理 `dlproxy`）：SenseVoice 下载到 **30.57%**（代理已转发 73,138,176 B，app 已落盘 72,417,280 B）时切断 10.0s。切断本身被正确处理（HF `terminated` → mirror 30s stall → GitHub `Range: bytes=72417280-` / 206，只重下 720,896 B），但在 GitHub 那条续传连接**正常发完最后一字节并关闭**的 12ms 后，主进程弹出 Electron 原生 **「A JavaScript error occurred in the main process」**（`e2_02_after_cut_error.png`）：
  ```text
  04:40:15.710 REQ gh …model.int8.onnx range=bytes=72417280-      ← dlproxy.log
  04:40:15.976 RESP 206 len=166816561
  04:40:20.757 DONE sent=166816561
  [04:40:20.769] [error] uncaughtException AssertionError [ERR_ASSERTION]:   ← main.log
    assert(!this.paused)
      at Parser.finish (node:internal/deps/undici/undici:7388:9)
      at Socket.onHttpSocketEnd (node:internal/deps/undici/undici:7827:34)
      at endReadableNT (node:internal/streams/readable:1729:12)
  ```
  关闭对话框后 app 退出，`.part` 239,233,841 B（字节已齐）+ `.part.json` 留在盘上。重开 B，Home 显示 Resume 99%，点一次 → `.part` 校验 sha256 后提为 `model.int8.onnx`（hash `C71F0CE0…2CD51`，与真源一致），接着拉 `tokens.txt`（315,894 B）——**再次在 `DONE sent=315894` 后 10ms 同样断言崩溃**（`04:42:37.904`），目录留下 `model.int8.onnx` + `tokens.txt.part` + `tokens.txt.part.json`，没有 `tokens.txt`，模型不可用。第三次启动再点一次 Resume 才把 tokens.txt 本地提为成品（无网络请求，`e2_03/e2_04*.png`、`e2_relaunch_main.log`）。
- 复现步骤：fresh profile → Home 一键下载 SenseVoice，下载源为任何在响应体结束后关闭 TCP 连接的 HTTP/1.1 服务（`Connection: close`，本轮 `dlproxy` 如此；不需要断网）。本轮经代理跑完的 4 次响应（latecut GitHub 206 / latecut tokens.txt / 本次 GitHub 206 / 本次 tokens.txt）中 2 次崩溃，均在响应完成瞬间；被切断的 2 次 HF 200 响应都正常走到 `terminated` 换源。上游 issue 给出的触发条件：undici HTTP/1 解析器正处于 **backpressure 暂停**（消费者没在 pull，对应本 app 正 `await drain` 写盘）时收到 socket `end` → `Parser.finish` 断言；是否命中取决于关连接的瞬间 app 是否在等磁盘，所以非 100%。**未测**：直连 HF / GitHub CDN（无代理）是否会在响应后关连接——一旦用户处在企业代理 / hf-mirror / 任何 `Connection: close` 的中间层后面，条件就成立；若 301 证明真源直连不可触发，可降为 P2。
- 根因（读源码 + 上游核实）：
  - `download.ts:228-240` 用 `fetch()`（Node 内置 undici）`getReader()` 逐块读，写盘 `out.write()` 返回 false 时 `await drain`（`:236-238`）；等待期间不再 `read()`，undici 解析器进入 `paused`。此时对端关闭连接，undici `client-h1.js` 的 `onHttpSocketEnd → Parser.finish()` 执行 `assert(!this.paused)`——断言在 socket `'end'` 事件处理器里抛出，**任何 try/catch、`reader.cancel()`、`AbortSignal` 都接不住**，直接成为进程级 `uncaughtException`。`download.ts:224-227` 只为磁盘错误接了 `out.on("error")`，网络侧没有对应保护（也不可能在应用层接住）。崩溃发生在 `renameSync(part, dest)` 之前，所以盘上留下字节已齐的 `.part`；下次启动能靠 `offset >= meta.total` 分支（`:167-180`）校验后提为成品，这是重开后「Resume 99%」能一键完成的原因——但每个后续文件（tokens.txt）都再赌一次。
  - 上游 bug：[nodejs/undici#5360](https://github.com/nodejs/undici/issues/5360)「Uncatchable AssertionError: assert(!this.paused) on socket end」，修复 [#5474](https://github.com/nodejs/undici/pull/5474) 进 undici **8.6.0**；7.x 回港 [#5553](https://github.com/nodejs/undici/pull/5553) 至本报告日仍 open。本包 `ELECTRON_RUN_AS_NODE=1 SpeakType.exe -p process.versions` → `node 24.18.1 / undici 7.29.0 / electron 43.3.0`，即**内置 undici 未含修复**，升级 Electron 短期内也无解。
- 影响：首次安装的必经路径（660 MB Parakeet 默认下载 / 239 MB SenseVoice）上，只要下载链路中有一层在响应后关连接（或中途关连接），每个文件都有概率把 app 整个杀掉，且弹的是开发者向的 JS 错误框，用户无法理解——这是本轮唯一的 P1。
- 建议修法（三选一，推荐 ①）：
  1. **模型下载改走 Electron `net.request`**（Chromium 网络栈，不经 undici）：`redirect: "manual"` + `'redirect'` 事件拿到 `responseHeaders`（可继续抓 `X-Linked-ETag`）后 `followRedirect()`；`IncomingMessage` 是标准 Node Readable，直接 `pipeline(res, out)`，背压由 Node stream 处理，socket 中断变成可捕获的 `'error'`。改动面：`fetchFollow` + `downloadFromUrl` 约 60 行，`stallGuard` 语义保留（用 `request.abort()`）。
  2. 主进程注册 `process.on("uncaughtException")` 兜底：匹配 `code === "ERR_ASSERTION" && /client-h1|Parser.finish/.test(stack)` 时转成当前下载任务失败（走既有换源/续传），其余原样 rethrow。见效快但属于打补丁，且上游任何栈名变化都会失效。
  3. 应用层引入 `undici` npm 包 ≥8.6.0，其 `fetch` 仅用于模型下载，主进程其余 `fetch` 不动（多一份依赖体积，需 `npm run pack:dir` 后核实）。
- 301 验收：`dlproxy` 在 10/30/50/70% 各切一次 + 在写盘慢（`out.write` 返回 false 时人工 `setTimeout` 2s）的条件下切一次，app 全部存活且 `download source failed … / resumed Range` 正常；无原生错误框。

### P3-300-4 免按长会话中单个渲染进程 PrivateBytes 单调增长（+0.5 MB/min，待 60 分钟复测定性）

- 现象：§6 20 分钟免按，renderer PID 5640 PrivateBytes 46.3 → 54.0 MB，15 个采样点中仅 2 次 ≤1.3 MB 的回落、整体单调；其余 3 个渲染进程与主进程平稳。
- 复现：zh/SenseVoice 免按 + fake mic 循环 8.6s 句 ≥20 分钟，`rss.ps1` 每 60s 采样。
- 根因：未定位（本轮未在 app 存活时把 PID 映射到窗口）。参照 round 188（悬浮条/实时字幕窗口每句累积）与 189c（recorder 窗口 MessagePort 结构化克隆）两种历史形态，候选是悬浮面板每句 `partial`/toast DOM 或 recorder 窗口帧队列。
- 建议：301 用 `--inspect` / CDP `performance.memory` 逐窗口对照 60 分钟；若确认为悬浮面板，检查每句 `partial` 更新是否留下未卸载的 React 节点/定时器。不阻塞发布。

### P3-300-5 侧栏切页继承上一页的滚动位置，新页从中间打开

- 现象（§8 实机，`f_navigation_retained_scroll.png`）：History 向下滚到底后点侧栏「人设」，人设页从第 2 张卡片开始显示，页题与当前人设概览在视口外（只实测了 History→人设 这一对，其余页对由源码推断同理）。
- 复现：任一可滚动页面滚到底 → 点侧栏另一页。
- 根因（`App.tsx:180`）：六页共用同一个 `<main className="mt-10 flex-1 overflow-y-auto …">` 滚动容器，`page` 切换时只替换子树（`{page === "personas" && …}`），容器 `scrollTop` 不重置；渲染层全仓无 `scrollTo/scrollTop` 调用（仅 `panel.tsx:61` 为悬浮条自动滚底）。
- 建议：`main` 加 `ref`，`useEffect(() => mainRef.current?.scrollTo({ top: 0 }), [page])`；若希望 History 返回时保位，按 `page` 存 `Map<Page, number>` 恢复各自位置。

## 10. 未测项与口径说明

- **未测**：b-② 精确 +50ms 窗口（实测 +87/+95ms，更早窗口靠源码推断）；a-② 「60s 自然超时」分类路径（实机 300s 兜底未等到，用杀进程路径证明分类分支）；relay 模式下 b-③/④（LAN 已测，relay 只跑 ①②）；ja/ko 状态条**悬浮面板**在 820px 的截断（面板宽度固定不随窗口，未单独量）；正式签名产物（VM 无证书，见 §0）；**e-2 真源直连**（无代理）下 HF/GitHub CDN 是否会在响应后关连接、从而 P1-300-1 在无中间层环境能否触发；e-1 中文 Windows 下默认模型为 SenseVoice（源码 `CJK_LOCALE` 核对，VM 为 en 系统）；e-1 首帧出现时间（仅 ≤19.8s 上界）；e-1 首句为 4s 长按的部分句，整句落字在常规 profile 验证；d 的 P3-300-4 定性（60 分钟 + PID→窗口映射）；f 中自动学习纠错“为什么没学到”与 History Undo 栏可见性（窗口被任务栏盖）；f 切页滚动残留仅实测 History→人设 一对；真实麦克风全程未测（VM 无麦，fake mic）。
- **观察（不立案）**：Parakeet `Please → Ple`：夹具 `hold_en_src.wav` 第 0ms 就是语音，而 fake mic 需 400–600ms 起转（SKILL Round 295），首 100–200ms 落在起转窗口被丢的可能性最大（Round 295 记录 ≤400ms 长按只得 1 帧静音）。真实麦克风上「按下即说」是否吞首字**本轮未测**（VM 无麦），建议 301 用带/不带 500ms 前导静音的两版夹具 A/B，若不带版稳定吞字且 `voicedMs` 不减，再评估 recorder 300ms 预滚环形缓冲；长按句 `text` 去 CJK 尾句号、免按句保留（`polish.ts:208-212`，设计如此，实测一致）；History 首条失败条目一次未即时刷新（1/3，未稳定复现）；`pack:dir` signtool 退出码 1 属 VM 环境。
- mock 的边界：F8 结果字串为 mock 回显，只证明请求体与替换链路，不证明 LLM 质量；`mockws.exe` 只替代 whisper-server 二进制，sherpa/SenseVoice/Parakeet 路径全真。

## 11. 环境还原（测毕核对）

测试代理清理（`phase4_cleanup.json`，05:12:48 UTC）+ 本人独立复核（提交前）：

| 项 | 结果 |
|---|---|
| 进程 | SpeakType / whisper-server / mockws / python（mock LLM、dlproxy）/ node（phone.mjs、cdp.mjs）全部为 0；`127.0.0.1:8981` 无监听；端口竞态 listener 已退出 |
| `resources/app.asar` | `E1FF098681C66A896902FB88343C475C8901E17041FE0414B74F37697B575605`，与 §0 起点一致（正式副本全程未改，仅 portable B 副本改过、已删） |
| `resources/whisper/whisper-server.exe` | `9E581A4A2B7BD5AEC0993F5794FEA3D65AF2D7F5921CF51C2A4E4B5A3A464D89`，一致（mockws 替换期间的原件已回填） |
| `SpeakType.exe` | `6BC035C61F73B9A672004142BB39FA58A60E7A0D7C737E2B0E9726E88B47DFED`，一致 |
| 模型文件 | whisper `ggml-base-q5_1.bin` / Parakeet 4 文件 / SenseVoice 2 文件 共 7 件 sha256 与参考值全部一致（坏模型测试的损坏副本已还原） |
| `speaktype.json` / `history.json` | 由测前备份逐字节恢复：language `en`、模型 Parakeet、UI `system`、主题 `system`、远程麦 **关**、自动粘贴 开；History 回到基线 30 条（恢复前 177 条，新增 147、原条目丢失 0） |
| portable A / B | 已删除（含 B 的 `app.asar.orig` 备份） |
| 防火墙 / hosts | 未动 |
| Git | `main` `73ff642` 工作区干净，产品源码零改动；本报告与 SKILL.md 追加推 `review/round300-report`，无 PR，Actions 保持禁用 |
| 保留（未入库） | `C:\Users\Administrator\r300\{evidence,tools}`、`screencasts\speaktype-r300-*`、`desktop/release/win-unpacked`（本轮构建产物，供 301 复用） |

## 12. 建议下一轮（301）验收点

0. **P1-300-1**：修前先定级——fresh profile 直连 HF/GitHub（无代理）下载 SenseVoice 5 次，用 `netsh trace`/Wireshark 或 `NODE_DEBUG=undici` 看真源是否 `Connection: close`，以及 5 次是否全部存活；修后——`dlproxy`（`Connection: close`）完整下载 5 次 + 在 10/30/50/70% 各切 10s 一次 + 一次在人为慢写盘（拖慢 `out.write`）时切，app 全部存活、无原生错误框，`download source failed` → `Range`/206 续传正常，每个模型文件（含 tokens.txt）都落成成品、sha256 一致、无残留 `.part`。另加一次 Parakeet 660 MB 默认模型的同样切断。
1. P2-300-1 修复后：mock `hang` 模式 ≤61s 内出现 `localServerFailed` 悬浮条与 History 条目，Esc 在挂起期间可中止；下一句自动换端口。
2. P3-300-2：ja/ko/zh-TW 三语 820px 下 Retry 两次后行动指引完整可见（CDP `scrollHeight <= clientHeight`）。
3. P3-300-3：手机推流中 Alt+Q 的产品口径落地（忽略+toast 或 手机端 message），LAN + relay 各 1 次。
4. 首词吞字观察：带/不带 500ms 前导静音的 Parakeet / SenseVoice 首词 A/B，各 5 次统计首词完整率，判定是否纯环境因素。
5. §5.1/5.2 若采纳：VTT / 时间戳 TXT 导出在 820px 的布局；Time saved 新口径 5 语文案 + 中文「字/分」基线。
6. P3-300-4 定性：免按 60 分钟，`rss.ps1` 每 60s 采样，app 存活时用 CDP `Browser.getWindowForTarget`/`process.pid` 把每个 renderer PID 映岄到窗口；判据固定为 PrivateBytes、窗口「5min→停止前 1 点」，任一进程 >0.15 MB/min 且单调则升 P2。
7. P3-300-5 修后：History 滚底→人设 / 词典 / 设置 三页，CDP `main.scrollTop === 0`。
8. 自动学习纠错定性：Notepad / VS Code / Chrome 各 3 次逐键改词（记录按键方式），统计「已学会新词」toast 出现率；若 <2/3 立案，并评估§8.1#2 的「为什么没学到」反馈。
9. History 删除 Undo 栏：窗口高度 ≤ 屏高时复核 15s Undo 可见且可恢复（本轮因 720p VM 窗口下沿被盖未确认）。
10. 回归：核心链路 + b-①②③（LAN/relay）+ a-③ 端口竞态，作为每轮固定项。
