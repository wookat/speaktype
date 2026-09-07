# 第 302 轮体验官报告（Windows 打包版 · 严格验收）

> 角色：user-experience-officer + qa-engineer。测试对象：`desktop/release/win-unpacked/SpeakType.exe`（v0.17.2，**基线 commit `f4e2027` = PR #390 合并时的 main 快照**）。专项 e 回归另用 **`c25a05b`（PR #392 合并后 main）** 在独立 worktree 重新 `pack:dir` 的打包版。不测 dev。
> 本报告所有「实测」均为打包版 GUI 实机操作（测试代理录屏），「源码核对」为读 main 源码，「未测」逐项列出。

## 0. 给老板的结论（3 句）

第 302 轮打包版核心链路（RightCtrl/排队/Alt+Q/Esc/F8 改写/深色、SenseVoice zh / Parakeet en / whisper ja、手机麦 owner 隔离 LAN+relay、端口竞态）**全部 PASS**，#390 的下载传输层在直连 HF 5 次 + 660MB 经代理两次断流的续传、60 分钟免按 soak（412 句、无错误、无进程被判泄漏）下**未发现 P0/P1**。本轮唯一 FAIL 是自动学习纠错旧包 2/9，已由 #392 修复并在 `c25a05b` 打包版回归 **Notepad/Chrome 6/6 + 负例 2/2**（VS Code 仍 0/3，是 Monaco 无障碍模式限制，开启后 2/2）。新立 4 条 P3（Parakeet 文件转录首词 `Ple`、VS Code 自动学习不可读、悬浮条盖住底部光标、关闭 AI 仍显示「润色中…」），无阻塞发布项。

## 1. 环境与构建

| 项 | 值 |
|---|---|
| OS / 显示 | Windows Server 2022，1280×720（工作区 1280×680） |
| Node / npm / Git | 20.19.0 / 10.8.2 / 2.47.1 |
| 构建（`cd desktop`） | `npm install` exit 0（EBADENGINE 警告，2 vulnerabilities 提示）→ `npm run typecheck` exit 0 → `npm run build` exit 0 → `npm run pack:dir` exit 0 |
| 构建异常 | 两个 checkout 首次 `npm install` 后 `node_modules/electron/dist/electron.exe` 均不存在（electron postinstall 未落地），`node node_modules/electron/install.js` 后正常。建议 303 轮再观察是否稳定复现（环境问题，非产品缺陷） |
| 官方制品 sha256（测前=测后） | `SpeakType.exe` `8724DB5A…D926D`；`resources/app.asar` `117DE606…52617`；`resources/whisper/whisper-server.exe` `9E581A4A…64D89`（全值见 §8） |
| 测试副本 | `r302\portable\A`（原样 portable，fresh profile）、`B`（一次性副本，asar 内三处下载源改指 `127.0.0.1:8981` 本地 dlproxy，重打包带 koffi/sherpa-onnx-node/sherpa-onnx-win-x64/uiohook-napi unpack）、`C`（一次性副本，whisper-server.exe 换 mock）。**正式副本未改。** |
| 输入手法 | fake mic（Chromium fake-device 播放 Edge TTS 合成 wav：zh「开放时间早上9点至下午5点。」/ en「Please schedule the meeting for tomorrow at 3 in the afternoon.」/ ja「うちの中学は弁当制で…」）+ `rkey.ps1` 合成热键（RightCtrl 7500ms 按住）+ CDP 9333 |

## 2. 总览矩阵

| # | 项目 | 结果 | 证据（`C:\Users\Administrator\r302\evidence\`） |
|---|---|---|---|
| 核心-1 | RightCtrl 按住说话落字 Notepad | PASS | `p2_01_hold.png`、`p2_01_*_notepad.txt` |
| 核心-2 | 排队第二句 | PASS | `p2_01_queue.png`；log `dictation start: previous session still finalizing, queued` → `resumed queued hold (frames=2, released=false)` |
| 核心-3 | Alt+Q 进/出免按 | PASS | `p2_02_handsfree_end.png` |
| 核心-4 | 录音中 Esc 取消 | PASS | `p2_03_esc.png`、`p2_03_esc_main.log` |
| 核心-5 | F8 mock 改写（OpenAI 兼容 mock） | PASS | `p2_04_selection_before.png` → `p2_04_rewrite.png` |
| 核心-6 | 深色模式（主窗/toast/panel） | PASS | `dark_main.png`、`dark_toast.png`、`dark_panel.png` |
| 核心-7 | SenseVoice zh / Parakeet en / whisper base ja | PASS ×3 | `p2_01_hold.png`、`p2_06_parakeet.png`、`p2_06_whisper.png` |
| 核心-8 | 端口竞态 a-③ | PASS | `p2_07_port_error.png`、`p2_07_recovered.png`（§3.8） |
| 核心-9 | 手机麦 owner 隔离 LAN b-①②③ | PASS | `p2_09_lan_local_owner_retry.png`、`p2_09_lan_paste.png`（§3.9） |
| a-1 | 直连 HF 下载 SenseVoice ×5（fresh profile，net-log） | PASS | `a1_summary.md`、`a1_headers.json`、`netlog_run1..5.json` |
| a-2 | Parakeet 660MB 经 dlproxy（Connection: close）30%/70% 各切 10s 续传 | PASS（含一处需人工 Resume，见 §4.1） | `a2_main.log`、`a2_cuts.log`、`dlproxy.log` |
| b-① | relay 模式手机推流中本机 Alt+Q → busy | PASS | `p2_09_relay_busy.png`、`p2_09_relay_paste.png` |
| b-② | whisper 就绪等待期 Esc → 立刻 RightCtrl 下一句 | PASS（部分，见 §4.2） | `p2_08_idle.png`、`p2_08_second_recording.png`、`p2_08_mock_ok.png` |
| b-③ | `net::ERR_*` 人话文案 zh-TW/ja/ko | PASS | `b3_zhTW.png`、`b3_ja.png`、`b3_ko.png` |
| c | 首词吞字 A/B（±500ms 前导静音 ×2 模型 ×5） | PASS（20/20 首词完整，不立案） | `c_summary.md`、`c_notepad.txt` |
| d | 60 分钟免按内存 soak | PASS（无进程达升级判据，见 §4.4 注） | `d_memory_table.csv`、`d_rss.csv`、`d_*_t05/t60.heapsnapshot` |
| e（旧包 f4e2027） | 自动学习 Notepad/VS Code/Chrome 各 3 次 | **FAIL 2/9** → 已立案并由 #392 修复 | `e_results.json`、`e_*_t*.json` |
| e 回归（`c25a05b`） | 同上 | **PASS Notepad 3/3、Chrome 3/3、负例 2/2**；VS Code 0/3（P3-302-2） | `e2_results.json`、`e2_*.png`、`e3_vscode_a11y_t1/2.json` |
| f | History 删除 Undo 栏（窗高 ≤ 屏高） | PASS | `f_undo_bar.png`、`f_undo_restored.png` |
| g | 30 分钟自由探索 | 完成（约 26 分钟），4 条发现（§4.7） | `g_*.png/json/log` |

## 3. 核心链路回归（基线 f4e2027）

1. **RightCtrl 落字**：SenseVoice zh，Notepad 收到「开放时间早上9点至下午5点」；history 条目 `durationMs≈7370, provider=local`。
2. **排队第二句**：第一句 finalizing 期间再按住，log `dictation start: previous session still finalizing, queued` → `dictation start: resumed queued hold (frames=2, released=false)`，两句依次落字。
3. **Alt+Q**：进入免按后循环样本连续落字；再按 Alt+Q toast「免按模式已退出」。观察到相同句子重复落字不去重——源码核对 `dictation.ts` `lastHandsFreePasted` 只服务语音命令删除，不做去重，属设计，不立案。
4. **Esc**：录音中 Esc → 面板回 idle、无落字、无 history。
5. **F8 mock 改写**：选中「Hey team, we need to get this done soon.」按住 F8 说 "Rewrite this paragraph in a more formal tone." → mock LLM 返回正式文体并替换选区。注意：mock 服务必须 `python -X utf8` 启动，否则 Windows 默认编码打印中文请求体会崩（测试工具问题）。
6. **深色**：主窗、toast、悬浮条三者均随系统深色切换。
7. **三模型**：Parakeet en → `Please schedule the meeting for tomorrow at three in the afternoon.`；whisper base ja → 日文句完整（`p2_06_whisper.png`）。
8. **端口竞态 a-③（实际复现）**：占住 `freePort()` 分到的端口后，whisper-server stderr `couldn't bind to server socket: hostname=127.0.0.1 port=65164`，log
   ```
   [07:59:45.298] local whisper-server starting (model=base-q5_1, port=65164)
   [07:59:45.421] local whisper-server exited (1)
   [08:00:00.102] local whisper-server starting (model=base-q5_1, port=65166)
   ```
   下一句换端口拉起成功并落字（`p2_07_recovered.png`）。
9. **LAN owner 隔离**：① 手机推流中本机 RightCtrl 松开 → `dictation stop: hold release ignored, phone session in progress`（两次），手机句完整落字；② 本机录音中手机 start → 手机端收到 `{"type":"busy"}`；③ 本机 Alt+Q → `dictation toggle: ignored, phone session in progress` + busy toast。

## 4. 专项

### 4.1 a) P1-300-1 真源定级

**a-1 直连（无代理，fresh portable profile ×5）**：5/5 存活、无 `download source failed`、无 uncaughtException。`download ok` 全部来自 `huggingface.co`（302 → 最终 `us.aws.cdn.hf.co`，HTTP/1.1 200），耗时 model.int8.onnx **4.1 / 4.3 / 5.0 / 5.3 / 5.8 s**，tokens.txt 0.1–0.5 s。net-log 显示最终响应头 **既无 `Connection` 也无 `Keep-Alive`**——**不能据此判定真源是否 `Connection: close`**（HTTP/1.1 默认 keep-alive，但 CDN 行为未显式声明）；#390 换 `net.request` 后，无论对端如何关连接都不再走 undici 断言路径，这一点由 a-2 的代理强制 `Connection: close` 场景覆盖。模型 sha256 `c71f0ce0…2cd51` 与要求一致。

**a-2 Parakeet 660MB 经 dlproxy（强制 `Connection: close`，30%/70% 各切 10s）**（一次性副本 B）：
- 30% 切（`.part` 196,673,536 B，代理在 206,831,616 B 关流）→ 主源 `net::ERR_CONNECTION_RESET` → 镜像源被代理拒绝，app 等到 **`stalled: no data for 30s`** 才换源 → GitHub 源 `Range: bytes=206831616-` 得 206，**自动续传**。
- 70% 切（`.part` 458,620,928 B）→ 最后一源也 RESET → `local model parakeet-tdt-0.6b-v3 download failed Error: net::ERR_CONNECTION_RESET`，UI 显示人话网络错误 + **「Resume 68%」**，人工点 Resume → `Range: bytes=459931648-` 206 → `download ok: 127.0.0.1:8981 -> encoder.int8.onnx in 7.5s`，`.part` 清除，encoder sha256 `acfc2b44…d2247`。
- 结论：传输层在两次断流 + 多源回退下**无崩溃**；源耗尽后需人工 Resume 是 `download.ts` `downloadFile` 的设计（源列表遍历一轮即抛）。观察：镜像源「拒绝」时走的是 30s 停滞守卫而非即时失败，用户会多等 30s（#391 已加「正在重试…」文案，本轮旧包未见该态，不立案）。

### 4.2 b) #390 未复跑项

- **b-① relay**（官方 `speaktype.zalize.com/relay`）：`remote mic relaying via https://speaktype.zalize.com/relay/m/<room>?lang=en`；手机推流中本机 Alt+Q → busy toast，log `dictation toggle: ignored, phone session in progress`，手机句完整落字。PASS。
- **b-② whisper 就绪等待期 Esc**（副本 C，mock whisper-server 先不就绪）：Esc 后面板立即 idle，随即 RightCtrl 第二句进入录音并被正常排队/识别（`p2_08_second_recording.png`、`p2_08_mock_ok.png`）；后台旧探测按预期跑满 60s 后 `whisper-server stderr (not ready after 60s)`。**未测**：无法从外部证明「旧代 gen 的探测结果不会污染新代」——只观察到用户可见行为正确；源码核对 `localasr.ts` `launchGen` 递增 + `ready=null/port=0` 复位逻辑与预期一致。
- **b-③** zh-TW/ja/ko 状态卡显示本地化网络错误文案（原始 `net::ERR_CONNECTION_REFUSED` 只在 log）。PASS。

### 4.3 c) 首词吞字 A/B

| 条件 | 首词完整 | voicedMs 均值 |
|---|---:|---:|
| Parakeet en 带 500ms 前导 | 5/5 | 2780 |
| Parakeet en 不带 | 5/5 | 2860 |
| SenseVoice zh 带 | 5/5 | 2384 |
| SenseVoice zh 不带 | 5/5 | 2744 |

20/20 首词完整，voicedMs 不带版反而更长（zh 不带版 wav 比 7.5s 按住短，4/5 次尾部循环污染多出几字，是夹具混淆而非产品问题）。**判定：在 fake-mic 路径下未复现吞字，不足以支持 recorder 预滚缓冲需求，不立案。** 第 300 轮核心-8 看到的 `Ple` 现象本轮在文件转录路径复现并定位（见 P3-302-1），与 recorder 无关。

### 4.4 d) P3-300-4 免按 60 分钟 soak

08:40:05 → 09:40:32（60m26s），History 47→459（412 句成功落字，Notepad 412 行），log 无 warn/error/`paste skipped`/uncaughtException，主窗一直可见。`rss.ps1` 60s 采样 + CDP `Browser.getWindowForTarget`/`SystemInfo.getProcessInfo` 映射 PID→窗口：

| 进程 | 5min → 末点 PrivateBytes | 斜率 MB/min | 下降次数/57 |
|---|---|---:|---:|
| main | 417.2 → 419.8 | 0.047 | 25 |
| renderer 主窗 | 47.7 → 57.1 | **0.170** | 12 |
| renderer Panel | 60.8 → 62.9 | 0.038 | 25 |
| renderer Toast | 45.3 → 46.2 | 0.016 | 0 |
| renderer Recorder | 63.7 → 59.6 | −0.074 | 18 |

判据「>0.15 MB/min **且单调**」：主窗 renderer 斜率 0.170 超阈值但 57 点中 12 次下降，**非单调，不升级 P2**。heap snapshot（`d_heapdiff_main.txt`）主窗 JS 堆 8.28→8.54 MiB，增量以 string / V8 system 结构为主，无明显对象累积线索。**如实说明**：+9.4 MB/小时的趋势存在但未证实为泄漏，建议 303 轮做 3 小时 soak 复核。测试工具异常：收尾脚本编码名 `utf8-sig` 拼错导致一次 LookupError，人工完成收尾，不影响数据。

### 4.5 e) 自动学习纠错

**旧包 f4e2027（原始实测）**：Notepad 1/3、VS Code 0/3、Chrome 1/3 = **2/9**，唯一成功 `auto-learn: "老板" -> "领导"`；`答复→回复`、`方案→提案` 均不学。离线复现（`autolearn_check.mjs` 直接跑 `watchedit.ts`）：`extractCorrections` 把「答复→回复」缩成单字 diff `{"wrong":"答","right":"回","learn":null}`，被 `learnableWord` 中文右侧长度 2–6 规则拒绝。**状态：已立案并由 #392（`c25a05b`）修复（ICU `Intl.Segmenter` 定词边界）。**

**回归（`c25a05b` 打包版，本轮实测）**：按键方式 = RightCtrl 7500ms 落字 → 等 4s → Ctrl+End+←定位 → Backspace×2 → Unicode SendInput 逐字 50ms/字（非剪贴板/IME）。

| 应用 | 答复→回复 | 方案→提案 | 老板→领导 | 负例 |
|---|---|---|---|---|
| Notepad | PASS | PASS | PASS | 整句重打 → 不学 PASS |
| Chrome textarea | PASS | PASS | PASS | 仅加 `!!!` → 不学 PASS |
| VS Code（默认设置） | FAIL | FAIL | FAIL | — |
| VS Code（`editor.accessibilitySupport: on`） | PASS | PASS | 未测 | — |

6 次正例均见「已学会新词」toast + `auto-learn:` 日志 + hotwords 单项新增 + 同 ID History 更新；edit→learn 耗时 1630–2132 ms（5 次有完整时间戳）。**#392 修复确认有效。** VS Code 见 P3-302-2。

「没学到时的一次性解释 toast」评估：修复后 Notepad/Chrome 不再有「合理编辑却不学」的样本，只剩 VS Code 一类「读不到文本」的场景；建议做成**针对可判定原因**的一次性提示（如读到 Monaco 无障碍提示串时提示开启 Shift+Alt+F1），而不是泛化的「没学到」toast（无法区分用户本就不想学）。

### 4.6 f) History 删除 Undo 栏

默认窗口 1100×740 在 1280×680 工作区被 Windows 钳到外框 1116×688 / 内 1100×680（CDP 实测），删除后 `fixed bottom-6 right-6` Undo 胶囊完整可见；15s 内点 Undo → 计数 18→17→18，条目 ID 与原 index 一致，恢复后 history.json 与删除前完全相同。最大化 1280×680 同样可见。PASS。

### 4.7 g) 30 分钟自由探索（旧包 f4e2027，fresh portable A）

覆盖：首次运行引导（en 系统语言默认选 660MB Parakeet；切 234MB SenseVoice 下载成功；launch→首条 History 53s，四步引导足够）、Transcribe 导入/识别/导出 TXT+SRT、Home 统计、459 条 History 滚动/搜索/过滤/Copy/Clear-all 确认、Settings 四 tab 中英文、热键改 F2 再改回、词典增删、AI 地址错误 F8、混合语言落 Chrome、无边框窗口拖动/缩放/最小化/托盘、Tab 焦点环。以上均 PASS。发现：

1. **Parakeet 文件转录首词 `Ple`（2/2 复现）** → P3-302-1。
2. **悬浮条盖住 Notepad 底部光标区域** → P3-302-3。
3. **关闭 AI 后处理阶段仍显示「润色中…」** → P3-302-4。
4. **Home 统计可解释性（对照观察，不立案，供 #391 后续参考）**：Words generated 6224 = 5220 个 CJK 字 + 1004 个英文/数字词项，UI 未说明混合口径；Sessions 不含文件转录（History 468 vs Sessions 463），未提示统计范围；「节省时间」旧口径按 40 wpm 对中文也套用且把 soak 重复句全算入——**#391 已改口径，本轮不立案**。
5. **导出对照（不立案）**：旧包仅 TXT/SRT 两按钮（#391 已加 VTT/带时间戳 TXT）；保存成功后无「已保存到…/打开」反馈，是 #391 之外仍可考虑的小改进；Transcribe 页写 `mp3 / wav / m4a / ogg / flac and more`，系统 picker 只显示 Custom Files/All Files，看不到完整扩展名集合。
6. **下载中/校验中对照**：SenseVoice 直连约 5s 完成，只见百分比+进度条+Cancel，未见独立「校验中」态（#391 已加，旧包不立案）。

## 5. 立案清单

### P3-302-1 Parakeet 文件转录首词 `Ple schedule…`（Transcribe 页，2/2 复现）

- **复现**：Transcribe 页导入 `hold_en_lead.wav`（16k mono，0.55s 前导静音 + "Please schedule…"），模型 Parakeet → 结果、TXT、SRT 均为 `Ple schedule the meeting for tomorrow at three in the afternoon.`；同文件 SenseVoice 正确；同 wav 经 fake mic 实时听写 Parakeet 10/10 正确（§4.3）。截图 `g_transcribe_en_repeat.png`、`g_transcribe_en_txt_open.png`。
- **根因（实测 + 源码核对）**：
  - 用 `desktop/node_modules/sherpa-onnx-node` + 同一 int8 Parakeet 模型离线解码（`parakeet_probe*.cjs`，输出 `g_parakeet_probe*.txt`）：原始 wav 整段/`transcribe.ts` 完全相同的切段 `[0, 5.6s]` → `Please`；**在 Chrome `AudioContext({sampleRate:16000}).decodeAudioData` 复现渲染进程解码路径后**（`decode_via_chrome.mjs`，样本与原始最大差 1.4e-5）同一切段 → `Ple`；在切段上加 ±1e-5 随机噪声 20 次 → **`Ple` 7/20**；另两条英文 fixture（"Hey team…"、"Rewrite this…"）同样扰动 **20/20 稳定**。
  - 即：`transcribe.ts` 切段、`Transcribe.tsx` 解码均无 bug，是 **int8 Parakeet TDT 在该发音的起始 token 上处于判定边界**（tokens.txt 无整词 `Please`，需拼 `ple`+`ase`，丢的是 `ase` 1605），对 1e-5 级输入扰动就翻转——推断为 TDT 的 duration/skip 判定所致（推断，未读模型内部）。第 300 轮核心-8 的 `Ple` 应为同一现象。
- **影响**：特定发音的首词错误，用户无法从 UI 得知；不影响实时听写主链路。
- **建议**：① 不建议做 recorder 预滚/静音填充（+1.0s 静音同样得 `Ple`，+0.5/0.9/1.5s 得 `Please`，不稳定）；② 在 sherpa `OfflineRecognizer` 上试 `blankPenalty`（transducer 支持）或换 fp16/非 int8 encoder，用本轮 probe 脚本做 20 次扰动 A/B 作为验收；③ 短期可在文件转录对每段首 token 做二次解码一致性校验（成本翻倍，仅作备选）。

### P3-302-2 VS Code 中自动学习纠错 0/3（新旧包一致）

- **复现**：VS Code 默认设置下听写落字后逐字改词，无 toast/日志/hotword；`e2_vscode_positive_t1..3.png`。
- **根因（实测 + 源码）**：`watchedit.ts` 通过 UIA 读焦点控件 `ValuePattern.Value` → `TextPattern.DocumentRange.GetText` → `Name`；VS Code 焦点元素是 Monaco 隐藏输入区，默认返回 Value 空、Text = `The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Alt+F1`（`e2_vscode_*_result.json`）。开启 `"editor.accessibilitySupport": "on"` 后 `native-edit-context` 的 Value/Text 均为完整句子，**2/2 学会**（`e3_vscode_a11y_t1/2.json`）。
- **建议**：在 `watchedit.ts` 识别到该提示串（或 Value 空且 Text 为 accessibility hint）时，一次性 toast「VS Code 需开启屏幕阅读器优化模式（Shift+Alt+F1）才能自动学习」并停止本次 watch；文档 FAQ 同步。

### P3-302-3 悬浮条固定屏幕底部居中，盖住底部光标

- **复现**：Notepad 最大化，光标放最后一行（屏幕底部中央），RightCtrl 录音 → 悬浮条覆盖光标所在区域，处理中仍短暂遮挡；拖动无效。`g_caret_before.png` / `g_caret_recording.png`。
- **根因（源码）**：`windows.ts` `dockPanel()` 只按鼠标所在显示器 `workArea` 底部居中（`y = area.height - PANEL_HEIGHT - 12`），不感知光标；面板无 `-webkit-app-region: drag`。
- **建议**：`activeapp.ts` 已绑定 `GetGUIThreadInfo`，可取 `rcCaret` 转屏幕坐标，若与面板矩形相交则改停到顶部居中（或左/右下角）；或允许拖动并记住位置。

### P3-302-4 关闭 AI 润色仍显示「润色中…」

- **复现**：`polishEnabled=false`、本地模型听写，识别结束到落字之间面板短暂显示「润色中…」。
- **根因（源码）**：`dictation.ts` 在 ASR 结束后无条件 `this.report("polishing")`（约 L1064），renderer `panel.tsx` 把 `polishing` 映射为 `panel.polishing`「润色中…」；`RecordState` 无「处理文本」态。
- **建议**：仅在 `rewriteTarget || settings.polishEnabled` 时 report `polishing`，否则保持 `transcribing`（或新增 `finalizing` 态 + 文案「整理文本…」）。强调离线的用户会误以为在调 AI。

### 已关闭 / 移交

- 自动学习 2/9（旧包）：**已立案并由 #392 修复，本轮回归 Notepad/Chrome 6/6 通过**。
- 导出 / 节省时间 / 下载「正在重试…」「校验中…」：以 #391 为准，不立案。

## 6. 未测 / 限制（如实列出）

- b-② 旧代健康探测与新代的内部隔离只有用户可见行为 + 源码核对，未做多代并发注入实验。
- a-1 真源 `Connection: close` 与否**无法判定**（响应头无 Connection/Keep-Alive）。
- c 项 fake mic 不能代表真实麦克风的起转/AGC；真实麦克风、权限拒绝路径全程未测。
- d 项仅 60 分钟；主窗 renderer +0.17 MB/min 趋势未证实/未排除泄漏。
- e 回归：VS Code 开启无障碍模式后只做 2 次；IME 输入、剪贴板整词替换未覆盖。
- g：Transcribe 仅验证 WAV（其他格式只看了提示）；失败条目 Retry 无样本；History 滚动流畅度为主观判断未测 FPS；SRT 时间轴未逐采样核对。
- #391 的导出/节省时间/下载文案：按指示不补测。

## 7. 证据索引

- 目录：`C:\Users\Administrator\r302\evidence\`（截图/log/json/heapsnapshot），工具：`C:\Users\Administrator\r302\tools\`（`launch.ps1`、`rkey.ps1`、`mkwav.ps1`/`tts.mjs`、`mock_llm.py`、`mockws.cs`、`phone.mjs`、`dlproxy.py`、`cdp.mjs`、`rss.ps1`、`mkportable.ps1`、`autolearn_check.mjs`、`heapdiff.mjs`、`parakeet_probe*.cjs`、`decode_via_chrome.mjs`），均不在仓库。
- 录屏（`C:\Users\Administrator\screencasts\`）：
  - `r302_phase1\r302_phase1-edited.mp4`（a-1/a-2/b-③ 下载与文案）
  - `r302_phase2_core\r302_phase2_core-edited.mp4`（核心 1–7）
  - `r302_phase2_lifecycle_phone_undo\r302_phase2_lifecycle_phone_undo-edited.mp4`（a-③ 端口、b-①② 、LAN/relay owner、f Undo）
  - `r302_phase3_firstword\r302_phase3_firstword-edited.mp4`（c）
  - `r302_phase3_autolearn\r302_phase3_autolearn-edited.mp4`（e 旧包）
  - `r302_phase4_60min_soak\r302_phase4_60min_soak-edited.mp4`（d）
  - `r302_phase5_exploration\r302_phase5_exploration-edited.mp4`（g）
  - `r302_phase6_autolearn_regress\r302_phase6_autolearn_regress-edited.mp4`（e 回归 c25a05b）
  - `r302_phase7_vscode_a11y\r302_phase7_vscode_a11y-edited.mp4`（VS Code 无障碍模式 2/2）

## 8. 环境还原核对

- 官方 `win-unpacked` 三制品 sha256 测前=测后：`SpeakType.exe` `8724DB5A2AF656FC256A22373CF55FB59828426B4CF6033ADA2F1DEA543D926D`；`app.asar` `117DE606EDFDF0493BA1C4DF74F42750908F4369796E13844C1E5AF699152617`；`whisper-server.exe` `9E581A4A2B7BD5AEC0993F5794FEA3D65AF2D7F5921CF51C2A4E4B5A3A464D89`（asar/whisper 替换只在一次性副本 B/C）。
- `%APPDATA%\SpeakType\speaktype.json`/`history.json` 每阶段备份并字节级恢复（`g_settings_diff.txt`、`e2_settings_restored.json`、`e3_cleanup.json`）；模型文件保留；VS Code settings.json 恢复为不存在。
- 进程：SpeakType / whisper-server / mock LLM / mockws / dlproxy / Chrome / Notepad / Code 均为 0；8981/9333/9444/43117 无监听。
- 仓库：仅新增本报告与 SKILL.md 追加一节；产品代码零改动；GitHub Actions 保持禁用（公司规则：本地验证为验收标准）。

## 9. 建议下一轮（303）验收点

1. P3-302-1：Parakeet `blankPenalty` / 非 int8 encoder A/B，用 `parakeet_probe4.cjs` 的 20 次 ±1e-5 扰动法验收「Please」稳定率，并在 Transcribe 页实机复跑 `hold_en_lead.wav`。
2. P3-302-2：VS Code 无障碍提示一次性 toast；验收 VS Code 默认设置下出现提示、开启后 3/3 学会。
3. P3-302-3：悬浮条避让光标（`rcCaret`）或可拖动；验收 Notepad 最大化底行光标不被遮挡。
4. P3-302-4：无 AI 时不显示「润色中…」；验收 `polishEnabled=false` 全程面板文案。
5. #391 三项在打包版上的体验官视角复核：VTT/时间戳 TXT 导出、节省时间口径说明是否可理解、下载「正在重试…」（结合 a-2 镜像源 30s 停滞场景）与「校验中…」是否肉眼可见。
6. d 项延长到 3 小时 soak，重点主窗 renderer PrivateBytes 趋势 + heap 对象 diff。
7. b-②：设计多代并发注入（旧 gen 探测返回时新 gen 正在跑）验证 `launchGen` 隔离。
8. Home 统计范围提示（Sessions 不含文件转录；Words 混合口径）与导出后「已保存/打开」反馈，作为 #391 的后续 UX 小项。
9. 环境：确认 `npm install` 后 electron 二进制缺失是否稳定复现（两 checkout 均出现）。
