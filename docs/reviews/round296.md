# SpeakType 第 296 轮严格体验官报告（打包版 0.17.2 @ main 32301c7 / PR #386）

> 角色：user-experience-officer + qa-engineer。测试对象：Windows VM 上从 main 全新 clone → `cd desktop && npm install && npm run typecheck && npm run build && npm run pack:dir` 产出的 `desktop/release/win-unpacked/SpeakType.exe`（不测 dev）。全程真实本地模型（SenseVoice / whisper tiny-q5_1 / Parakeet 0.6B v3）+ 真源下载（huggingface.co）；mock 仅两处：F8 改写用的本地 OpenAI 兼容服务（`http://127.0.0.1:18081/v1`，可调 ok/500/empty/timeout/delay）、下载错误文案用的本地 MITM 代理（`127.0.0.1:18082`，仅通过 `HTTPS_PROXY` 环境变量导流主进程，**未改 hosts / 防火墙 / asar**）。
> 证据目录（VM 本地，未入库）：截图/日志/history 切片 `C:\Users\Administrator\tts\shots\`；分阶段原始报告 `C:\Users\Administrator\tts\report-phase{1,2,3}.md`。录屏见 §7。
> 判定口径：**PASS/FAIL = 打包版实测**；「源码核对」「推断」「未测」单独标注，不与实测混写。

## 给老板的结论（可直接转发）

1. #386 的七项修复在打包版全部实测生效：连续按住排队（150ms 间隔两句、三连按住三句按序落字，whisper tiny 下同样成立）、人设弹窗原生 `<dialog>` 焦点陷阱（16/17 站 Tab 循环、Shift+Tab、Esc 全过）、真源 Parakeet 660MB 下载中 Cancel → 「继续下载 (x%)」→ 续传完成 → 落字、四入口跨模型禁用、四路导出原生另存（BOM + CJK + 覆盖 + 只读目录 toast 五语中三语实测）、改写徽标五种终态全部消失、免按 6×10s 无声 61.0s 自动退出。核心链路（RightCtrl / Alt+Q / Esc / F8）zh/en/ja 全绿，无 P0/P1。
2. 新立 **5 个 P2**（均为边界/竞态，日常单句听写不受影响）：① 排队中按 Esc 落在上一句润色/粘贴窗口时，上一句照常落字、排队句被静默丢弃且**无任何提示**；② 排队期间按住 F8，F8 松手会把仍按着的 RightCtrl 排队句「视为已松手」→ 0 帧空句 +「没听清」；③ 两步确认（删模型/清词典/重置设置）无最短停留时间，双击即执行，且下载完成瞬间 Cancel 原位变 Delete，实测双击误删刚下完的 Parakeet；④ Settings 文本框快速连打（~6ms/字）丢字（`mock`→`mok`），根因是主进程回推 settings 覆盖了渲染端更新的输入框；⑤ whisper tiny 选「粤语」输出英文翻译且无提示。另 4 个 P3。
3. 判断：**可继续发布迭代**；建议 297 轮优先修 P2-296-1/2（排队交叉路径）与 P2-296-3（双击误删），其余 P2 可并入。

---

## 0. 环境与构建

| 项 | 结果 |
|---|---|
| 源码 | `git clone https://github.com/wookat/speaktype` main，HEAD `32301c78c52f0c3165d63f459b5018c5adc66e31`（PR #386 合并提交） |
| Node / OS | Node 20.19.0 / npm 10.8.2，Windows Server 2022，1280×720，系统 culture `en-US`，无物理麦克风（全程 `--use-file-for-fake-audio-capture`） |
| `npm install` | 成功；EBADENGINE 警告（electron 43.3.0 / node-abi 要 Node ≥22.12）按指示忽略；npm audit 2 条未处理（非本轮范围） |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过（electron-vite main/preload/renderer） |
| `npm run pack:dir` | **产物完整但进程退出码 1**：`win-unpacked/SpeakType.exe` + `resources/app.asar` 已生成，之后 electron-builder 对 `resources/whisper/whisper-server.exe` 与 `SpeakType.exe` 做签名步骤失败退出。未改任何签名/安全配置绕过；以生成的 unpacked 产物作为验收对象。**若 CI/发布流程依赖 pack 退出码，需在 297 轮核查签名配置**（294 轮报告未提及此现象，可能与本 VM 无证书环境有关，未定位）。 |
| app.asar | 36,615,609 B，SHA-256 `88CDEBEBAD8C7A64B8A5996AFCBD2394B41A9EBFD1E8E0C2DF6AC724E0411F00`；**全程未改**，测毕复核一致（备份 `C:\Users\Administrator\tts\app.asar.orig`） |
| 启动参数 | `--no-proxy-server --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav> --remote-debugging-port=9333`；下载错误文案段额外 `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:18082 NODE_TLS_REJECT_UNAUTHORIZED=0 NO_PROXY=127.0.0.1,localhost`（仅该段，其余段清空） |
| 音频夹具（Edge TTS → 16k mono s16，前 0.6s / 后 1.2s 静音） | `zh.wav`「今天天气很好，我们一起去公园散步吧。」/ `en.wav`「The quick brown fox jumps over the lazy dog.」/ `ja.wav`「今日はとても良い天気ですね。」/ `ko.wav` / `yue.wav`（粤语 TTS，≈7s）/ `silence30.wav` / `speech4.mp3`（zh+en+ja+zh 拼接 21.4s，MP3 转录用） |
| 键盘注入 | 自写 `rkey.ps1`（SendInput）。**初版 x64 INPUT 结构体 32 字节 → 静默注入失败**，修为 40 字节后才有效；修复前的「无响应」全部剔除，不计入产品结论 |
| main.log 打包态证明 | `[2026-09-05 21:00:33.725] [info]  SpeakType 0.17.2 starting (packaged=true)` |

## 1. 总览矩阵

| # | 项目 | 结论 | 主要证据 |
|---|---|---|---|
| 核心-1 | RightCtrl 按住说话落字 Notepad（SenseVoice zh） | **PASS** | `C2-sensevoice-hold.png`；`dictation finalize: durationMs=4913 maxPeak=32767 voicedMs=2620`；history `今天天气很好，我们一起去公园散步吧` |
| 核心-2 | Alt+Q 进/出免按（SenseVoice zh，3 句） | **PASS** | `C2-handsfree-live-panel.png` / `C2-handsfree-exit.png` / `C2-handsfree-ended-toast.png`；三条 finalize + 三条 history（§2.2） |
| 核心-3 | 录音中 Esc 取消 | **PASS** | 「Dictation canceled / Nothing was typed」toast；history 前后字节一致；无 finalize 行 |
| 核心-4 | F8 mock 改写（选中 `hello world`） | **PASS** | `C2-rewrite-before.png` / `C2-rewrite-after.png`；mock 21:11:26.549Z 收到 1 条 user（改写规则 + 口述指令 + 原文）；选区被替换 |
| 核心-5 | Parakeet en 一句 | **PASS（5s 按住）** | `C1-parakeet-5s.png`；`The quick brown fox jumps over the lazy dog.` 与夹具逐字一致；3s 按住切掉尾词 `dog`（夹具时长问题，非产品缺陷，§2.5） |
| 核心-6 | whisper tiny ja 一句 | **PASS** | `C3-whisper-japanese.png`；`今日はとても良い天気ですね`；finalize→Notepad 出字 437ms |
| a① | whisper tiny：`down:rctrl,3s,up,150ms,down:rctrl,3s,up` 两句按序落字 | **PASS** | log `queued` → `resumed queued hold (frames=2, released=false)`；history 两条 at 差 3139ms（§3.a） |
| a② | 三连按住（第三句在第二句排队时按下） | **PASS（行为=丢弃第三次按下，见设计判断）** | 供给 150ms 间隔三连 → 三句全落；30/200/30ms 极端序列 → 第三次按下无任何日志、被 `if (this.pendingStart) return` 吃掉 |
| a③ | 排队中按 Esc | **早 Esc PASS / 晚 Esc FAIL → P2-296-1** | 早（第二句按住 180ms 内 Esc）：两句均取消 + 取消 toast + 0 落字 + 无迟到 finalize；晚（第二句按住 600ms 后 Esc）：上一句照常落字、排队句静默丢弃、**无 toast** |
| a④ | 排队中 Alt+Q | **PASS（观察）** | Alt+Q 不进免按（`toggle` 不排队）；排队句 resumed `released=true` → 535ms 空句、无 toast、无免按延续 |
| a④ | 排队中 F8（按住 ≥120ms） | **忙时不改写 PASS；F8 松手副作用 FAIL → P2-296-2** | 「Still finishing the last one」toast 正确；但 F8 key-up 触发 `dictation.stop()`，把仍按着的 RightCtrl 排队句标记 released → `resumed (frames=0, released=true)` → 590ms 空句 +「Didn't catch that」 |
| a④ | 排队中手机麦按住 | **未测** | 手机麦未配对（需局域网手机端） |
| a⑤ | 免按句间 RightCtrl 插话 | **不排队 PASS；不破坏免按 FAIL（现有设计：其他热键结束免按）→ P3-296-6 设计争议** | 两次实测：RightCtrl 松手时免按结束 +「Hands-free mode ended」toast，第二句照常落字；无 `queued` 日志 |
| a⑥ | 排队句与上一句在 History 的顺序与 source | **PASS** | history 数组 newest-first，`at` 单调递增；两条均 `provider: "local"`，本地路径无 `source` 字段（源码：`source: this.remoteSource ? "phone" : undefined`） |
| b-1 | 真源 huggingface.co 下载 Parakeet 660MB 中途 Cancel → 「继续下载 (x%)」 | **PASS** | `B1-part-cancel.png`「Resume download (1% done)」；`encoder.int8.onnx.part` 11,145,177 B + `.part.json`（url=huggingface.co…，etag=acfc2b44…，total=652,184,281）；log `download cancelled` |
| b-2 | 继续 → 完成 → 用 Parakeet 落字 | **PASS（续传保留字节）/ 「取消后 <200ms 立即再点」严格时序未测** | 续传后 .part 11,145,177 → 27,068,490（未重头）；完成后四文件 SHA-256 与源码清单一致（§3.b）；C1 Parakeet 落字 |
| b-3 | 取消瞬间连点两次 | **PASS（Home 页）/ Settings 页暴露 P2-296-3** | Home 双击 Cancel：一条 cancel 日志、.part 保留、可继续；Settings 页在下载完成瞬间双击 → `downloaded 21:03:04.559` → `deleted 21:03:04.799` 误删 |
| b-4 | 下载中切到其他模型再回来 | **PASS** | `B5-switch-back-progress.png`：切 SenseVoice 再切回，进度 23% 继续 |
| b-5 | 下载中关主窗口到托盘再打开 | **PASS** | `B6-tray-reopen95.png`：托盘菜单 + 重开后 95% 继续，进程未退出 |
| b-6 | 跨模型禁用四入口（Home / VoiceTab / MicSection / Transcribe） | **PASS** | `B4-home-busy.png` / `B4-voice-busy.png` / `B4-mic-busy.png` / `B4-transcribe-busy.png`；CDP `disabled=true`；文案含 `parakeet-tdt-0.6b-v3` |
| b-7 | UI 状态与 main.log 一致 | **PASS（有日志覆盖范围限制）** | 本构建只打 `download cancelled / downloaded / deleted / download source failed`，**无** Range/进度/SHA 成功行；用 .part.json + 文件哈希替代核对 |
| c-1 | 人设弹窗 Tab 循环 / Shift+Tab / Esc / 自动聚焦 | **PASS** | 新建 16 站、编辑 17 站 Tab 回到名称框、未跑出弹窗；Shift+Tab 反向到 Cancel；Esc 关闭；`P3-C-persona-*-tabtrace.json` |
| c-2 | 全仓其他覆盖层键盘 only | **源码核对：无其他 `fixed inset-0`/`role=dialog`；均为行内两步确认** | History Clear all：Enter 后焦点落 `BODY`、Esc 不撤销 → **P3-296-7**；重置设置 / 删模型 / 清词典：可键盘操作，但双击/双 Enter 即执行 → **P2-296-3**；恢复出厂 4001ms 自动复位 PASS（未执行） |
| d | 四路导出：默认名 / 过滤 / 取消 / 覆盖 / BOM+CJK | **PASS ×4** | `speaktype-history-2026-09-05.md` (Markdown) / `speaktype-dictionary-2026-09-05.txt` (Text) / `speech4.txt` (Text) / `speech4.srt` (SubRip)；四文件首 3 字节 `EF BB BF`；覆盖后 mtime 变、hash 不变；取消前后 Documents 清单一致 |
| d | 只读目录错误提示 `toast.exportFailed` | **PASS（en ×4 / zh-CN / ja 实测；zh-TW / ko 未测）** | 静态只读目录被 Windows 原生对话框先拦；改为「确认覆盖时对目标文件加 deny」触发应用层 EPERM：log `save text failed (…race.srt) Error: EPERM`，toast「Couldn't save file / 保存文件失败 / ファイルを保存できませんでした」 |
| e | 改写徽标：录音→转写→改写中→ 完成 / 500 / 超时 / 空结果 / Esc | **PASS ×5 终态徽标消失** | CDP `/panel.html` 采样：录音/转写/润色态 `badge exists`，终态 `badge absent; idle`；500/空结果润色态太短未采到（delay 模式覆盖） |
| e | 普通听写 / 免按不显示徽标 | **PASS** | `P2-E-plain-no-badge`、A5 两次、F 六轮全程 `badge=null` |
| e | 深/浅色对比度 | **PASS（两主题同色）** | 徽标 bg rgba(255,155,0,.2) / 文字 rgb(255,210,48) / 悬浮条 #292929@.95，合成后对比度 ≈ 5.96:1（>4.5:1）；两主题计算样式逐字节相同（悬浮条固定深色） |
| f-1 | 全新 profile zh-TW/HK/MO 首启 `localSimplified=false` | **PASS（真实系统 culture）** | `Set-Culture zh-TW/zh-HK/zh-MO` + 新进程 + 空 profile：`{localSimplified:false, language:"zh", localModel:"sensevoice-small"}`；zh-CN → `true`；`--lang=` 参数**不**影响默认值（`Intl` 取的是系统 culture，测试手法记录进 SKILL） |
| f-2 | whisper 门控：zh / yue / auto(假名) / auto(谚文) / auto(纯汉字) | **zh、auto×3 PASS；yue 门控未测（whisper tiny 选 yue 输出英文）→ P2-296-5** | `whisper t2cn applied (language=zh): 3/18`；auto+ja 假名原样、auto+ko 谚文原样、auto+zh `3/18 chars changed`；`language=zh + yue.wav` 关简体得 `氣/滿/園`、开得 `气/满/园`（3/16） |
| f-3 | 下载 404 / 5xx / 网络错误文案 | **PASS（en / zh-CN / ja ×3 = 9 例）** | 本地 MITM 代理；log `HTTP 404 (huggingface.co)` → `HTTP 404 (hf-mirror.com)`；**只尝试两个源**：`base-q5_1` 无已知 SHA 的 GitHub Release 资产，`hfSources()` 不追加 GitHub（源码核对，非三源） |
| f-4 | MP3 SRT 导出 | **PASS** | `speech4.mp3` 21.4s → `file transcribe done (4 segments)` → 4 段 SRT 时间轴（§3.f） |
| f-5 | 免按 6×10s 无声自动退出 | **PASS** | 六条 `finalize: durationMs≈10040 maxPeak=0 voicedMs=0` → 「Hands-free mode ended」toast，首个 recording 状态到 toast 61.028s，0 history |
| g | 自由发掘（23m25s + 前两阶段穿插约 15 分钟） | 1 P2 + 3 P3 | §4 |

## 2. 核心链路回归

### 2.1 RightCtrl 按住（SenseVoice zh）— PASS
`rkey.ps1 down:rctrl,5000,up:rctrl`，Notepad 前台。
```text
[2026-09-05 21:09:31.120] [info]  dictation finalize: durationMs=4913 maxPeak=32767 voicedMs=2620
```
```json
{"text":"今天天气很好，我们一起去公园散步吧","raw":"今天天气很好，我们一起去公园散步吧。","personaName":"Default","durationMs":4913,"provider":"local"}
```
（Default 人设去掉句尾句号，与 294 轮一致。）

### 2.2 Alt+Q 免按 — PASS
`chord:lalt+q` 后夹具循环三遍，每句静音自动切分并落字，再 Alt+Q 退出。
```text
[2026-09-05 21:09:49.375] [info]  dictation finalize: durationMs=6009 maxPeak=32767 voicedMs=2640
[2026-09-05 21:09:54.975] [info]  dictation finalize: durationMs=4804 maxPeak=23573 voicedMs=2580
[2026-09-05 21:10:00.775] [info]  dictation finalize: durationMs=4988 maxPeak=23574 voicedMs=2600
```
history 三条 `今天天气很好，我们一起去公园散步吧。`（免按保留句号），at 1788642590012 / 595627 / 601398。截图 `C2-handsfree-live-panel.png`（实时字幕）、`C2-handsfree-ended-toast.png`。
未测：免按**进入**瞬间的模式标签文案未单独截到（退出 toast 已截）。

### 2.3 录音中 Esc — PASS
`down:rctrl,1500,tap:esc,300,up:rctrl`：toast「Dictation canceled / Nothing was typed」，`C2-cancel-before.history.json` 与 `C2-cancel-after.history.json` 字节一致，main.log 无新行（本构建不打 cancel 日志）。

### 2.4 F8 mock 改写 — PASS
Notepad 中选中 `hello world` → `down:f8,5000,up:f8`（zh.wav 作口述指令）。mock 服务日志：
```text
2026-09-05T21:11:26.549Z LLM ok len=278 user="你按用户的口述指令改写下面这段文字（可能是改写、润色、翻译、扩写、缩写等）。\n要求：\n1. 只输出改写后的正文…\n口述指令：\n\"\"\"今天天气很好，我们一起去公
```
选区被替换为 mock 回显 `[REWRITTEN] …`（`C2-rewrite-after.png`）。`polishEnabled=false` 下改写仍可用（改写只依赖润色模型配置，不依赖开关）——与源码一致。
说明：40ms 的 `tap:f8` 低于 `holdDelayMs=120` 阈值是 no-op（源码 `hotkey.ts pressRewrite` 定时器），F8 必须**按住** ≥120ms；这与 RightCtrl 一致，不算缺陷，但见 §4 体验差距。

### 2.5 Parakeet en / whisper ja — PASS
- Parakeet 5s：`The quick brown fox jumps over the lazy dog.`（`durationMs=4903 voicedMs=2120`）。3s 按住得 `…over the lazy.`（`durationMs=2871 voicedMs=1720`）：夹具语音在 2.9s 处尚未结束，属夹具/时长问题，不计缺陷；a① 的 3s 序列用 ja.wav（语音 1.8s 内结束）故不受影响。
- whisper tiny ja 5s：`今日はとても良い天気ですね`，`local whisper-server starting (model=tiny-q5_1, port=18717)` → finalize 21:12:28.945 → Notepad 首次观察到文本 21:12:29.382（40ms 轮询，**437ms**）→ history 写入 21:12:29.690。

## 3. 专项

### 3.a #386 排队按住边界（whisper tiny-q5_1 + ja.wav）

源码核对（`desktop/src/main/dictation.ts`）与实测覆盖对照：

| 分支 | 源码位置 | 实测覆盖 |
|---|---|---|
| `queueStart`: 仅 `hold` 且 `finalizing` 时排队，`toggle`/免按不排队 | L586–594 | a① / a④ Alt+Q / a⑤ ✅ |
| `queueStart`: `if (this.pendingStart) return`（第三次按下丢弃） | L587 | a② 极端序列 ✅（无第三次日志） |
| `onFrame`: `pendingStart && !released && < MAX_BUFFERED_FRAMES` 缓存帧 | L371–376 | a① `frames=2` ✅（未触及 MAX 上限，**未测**） |
| `stop()`: `pendingStart.released = true` 后帧丢弃 | L684–687 | a② short-middle `frames=1, released=true`、a④ ✅ |
| `resumeQueued`: `busy` 时 return、`state!=="idle"` 时清队 | L596–606 | `state!=="idle"` 分支（上一句 error 态时排队）**未测** |
| `start()` 带 `queued.at` 计时、carryFrames 回灌 | L482–489 | a① 第二句 `durationMs=2882≈3s`（含排队等待）✅ |
| `cancel()`: 清 `pendingStart` + `recorder:stop` | L717–723 | a③ 早/晚 ✅（暴露 P2-296-1） |
| 远程（手机麦）`remote=true` 分支 | L594/L722 | **未测** |

**a① — PASS**
```text
[2026-09-05 21:21:31.526] [info]  dictation finalize: durationMs=2914 maxPeak=32768 voicedMs=1820
[2026-09-05 21:21:31.812] [info]  dictation start: previous session still finalizing, queued
[2026-09-05 21:21:32.310] [info]  dictation start: resumed queued hold (frames=2, released=false)
[2026-09-05 21:21:34.694] [info]  dictation finalize: durationMs=2882 maxPeak=32768 voicedMs=1800
```
history（newest-first）：`at 1788643295419 (durationMs 2882)` / `at 1788643292280 (durationMs 2914)`，两条 `今日はとても良い天気ですね`，均 `provider:"local"`、无 `source`。Notepad 顺序落两句。

**a② 三连按住 — 预期 / 实测 / 设计判断**
- 预期（读源码）：`pendingStart` 只有一个槽位，第三次按下若发生在第二句仍排队时被 `return` 丢弃，无提示。
- 实测 1（150ms 间隔三连）：第二句排队→恢复→finalize 后第三句再排队→恢复，**三句全落**（两对 queued/resumed 日志，history 3 条）。因为第二句恢复后就不再「排队」，第三次按下只是普通排队。
- 实测 2（`3000,up,30,down,200,up,30,down,3000,up`，第三次按下落在第二句仍 pending 时）：只有一对 queued/resumed，`resumed (frames=0, released=true)` → 586ms 空句 →「Didn't catch that」；**第三次按下完全无日志**，第三句丢失。
- 设计判断：真人手速下第三次按下几乎必然落在第二句已恢复之后（排队窗口只有 ~500ms 本地 ASR 时间），实测 1 是常态；实测 2 需要 <250ms 的双击级操作。**接受当前设计**，但建议 `queueStart` 在 `pendingStart` 已占用时至少打一行 log（现在完全静默，无法事后诊断）。不立案。

**a③ 排队中 Esc — 早 PASS / 晚 FAIL（P2-296-1）**
- 早 Esc（`3000,up,30,down,180,tap:esc,600,up`）：
  ```text
  [2026-09-05 21:24:56.472] [info]  dictation finalize: durationMs=2929 maxPeak=32768 voicedMs=1800
  [2026-09-05 21:24:56.623] [info]  dictation start: previous session still finalizing, queued
  ```
  之后 10s 无 resumed / finalize；toast「Dictation canceled」；0 落字、0 history；面板消失、状态 idle。松手后释放版（`…160,up,30,tap:esc`）同样 PASS。
- 晚 Esc（`3000,up,100,down,600,tap:esc,600,up`，Esc 约在上一句 finalize 后 0.7s）：
  ```text
  [2026-09-05 21:23:48.497] [info]  dictation finalize: durationMs=2922 maxPeak=32768 voicedMs=1800
  [2026-09-05 21:23:48.722] [info]  dictation start: previous session still finalizing, queued
  ```
  之后无 resumed；**上一句照常落字并入 history（1 条）**；**无任何 toast**；排队句消失。用户仍按着 RightCtrl 说话，松手后什么都没发生。见 §5 P2-296-1 根因。

**a④ 排队中交叉热键**
- Alt+Q（`…500,chord:lalt+q,1500,up:rctrl`）：不进入免按（`toggleHandsFree` 在 busy 下不排队，源码一致），排队句在 Alt+Q 后被标记 released → `resumed (frames=2, released=true)` → `finalize: durationMs=535 maxPeak=0` 空句，无 toast（`endedByKey` 路径）。第一句正常落字。判定 PASS（行为可解释），但用户视角「按了 Alt+Q 什么都没发生」——并入 P3-296-6 设计讨论。
- F8 按住 160ms（`…140,down:f8,160,up:f8,1500,up:rctrl`）：
  ```text
  [2026-09-05 21:26:30.802] [info]  dictation start: previous session still finalizing, queued
  [2026-09-05 21:26:31.391] [info]  dictation start: resumed queued hold (frames=0, released=true)
  [2026-09-05 21:26:31.392] [info]  dictation finalize: durationMs=590 maxPeak=0 voicedMs=0
  ```
  toast 顺序：「Still finishing the last one」（正确，忙时不改写）→「Didn't catch that」。**RightCtrl 此时仍按着**，却因 F8 松手被判 released、帧被丢弃。→ P2-296-2。
- F8 40ms 点按：no-op（低于阈值），排队正常恢复两句落字——记录为对照，不计缺陷。
- 手机麦按住：**未测**（未配对）。

**a⑤ 免按句间 RightCtrl 插话（SenseVoice zh）**
两次冷启动实测（进入免按 9s / 7.1s 后 `down:rctrl,2000,up`）：RightCtrl 按下期间免按继续录第二句；**松手瞬间免按结束**，toast「Hands-free mode ended」（其他热键结束文案），第二句（一次完整、一次半句）照常落字；无 `queued` 日志；之后 6s 保持 idle。
判定：「不排队」PASS；「不破坏免按」与实测相反，但这是产品既有明确设计（专门有「其他热键结束免按」文案）。作为 **P3-296-6 设计争议**记录：Wispr Flow 的 push-to-talk 与 toggle 是互斥模式、按住键会直接覆盖，我们的行为等价；建议保留但把 toast 改为可操作提示（「按 Alt+Q 重新进入」已有，OK）。不强推修改。

**a⑥ History 顺序与 source — PASS**：见 a① 切片；`history.json` 数组 newest-first（`history.slice(0,n)` 取最新），`at` 严格递增（92280 → 95419），`source` 仅手机麦写 `"phone"`，本地无该字段。

### 3.b #386 下载取消（真源 huggingface.co，Parakeet 652,184,281 B encoder）

- `.part.json` 原文（UTF-16 落盘，已转写）：`{"url":"https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/encoder.int8.onnx","etag":"acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247","total":652184281}`
- Cancel 后：`encoder.int8.onnx.part` 11,145,177 B，UI「Resume download (1% done)」（`B1-part-cancel.png`）。
- Resume（约 13s 后点击）→ 再 Cancel：.part 27,068,490 B，UI「4% done」——续传未从 0 开始（Range 请求本构建不打日志，用字节增长证明）。
- 完成后四文件 SHA-256 与 `download.ts` 清单一致：encoder `ACFC2B44…2247`、decoder `179E50C4…DB4E`、joiner `3164C13F…48B3`、tokens `D5854467…C35D`。
- main.log 下载相关全量（含测试者多次删/下）：
  ```text
  [2026-09-05 21:02:36.573] [info]  local model parakeet-tdt-0.6b-v3 download cancelled
  [2026-09-05 21:03:04.559] [info]  local model parakeet-tdt-0.6b-v3 downloaded
  [2026-09-05 21:03:04.799] [info]  local model parakeet-tdt-0.6b-v3 deleted      ← 双击误删（P2-296-3）
  [2026-09-05 21:03:19.052] [info]  local model parakeet-tdt-0.6b-v3 download cancelled
  [2026-09-05 21:03:32.267] [info]  local model parakeet-tdt-0.6b-v3 download cancelled
  [2026-09-05 21:04:05.609] [info]  local model parakeet-tdt-0.6b-v3 downloaded
  ```
  本 VM 到 huggingface.co 带宽高：从 4% 续传到完成（21:03:32 → 21:04:05）仅 33s，「中途」窗口很短——这也是为什么 Settings 页双击撞上了完成瞬间。
- 四入口禁用：Home / VoiceTab / MicSection（需先开手机麦才显示条幅）/ Transcribe，CDP 均 `disabled=true`，文案 `settings.localModelBusy` 含 `parakeet-tdt-0.6b-v3`（`B4-*.png`）。294 轮未截到的 Transcribe 条幅本轮已截（`B4-transcribe-busy.png`）。
- 未测：取消后 <200ms 内立即再点下载的严格竞态（实际间隔 ~13s）；`.part` 与服务器 ETag 不一致时的丢弃重下分支（源码 L`offset >= meta.total` 段）。

### 3.c 弹窗与键盘

源码核对：渲染端只有 `Personas.tsx` 一处真正的弹窗（原生 `<dialog>.showModal()`），其余「确认」全是行内两步按钮（VoiceTab 删模型、GeneralTab 重置/恢复出厂、Personas 删人设、History Clear all、Dictionary 清空），`grep -r "fixed inset-0\|role=\"dialog\"\|aria-modal"` 无其他命中。词典导入是原生文件选择器，转录取消是行内按钮，无覆盖层。

| 项 | 结果 |
|---|---|
| 人设新建：自动聚焦名称框；Tab 16 站（名称 + 13 图标 + 说明 + Cancel；空名时 Save disabled 被跳过）回到名称框，从未跑到侧栏 | PASS |
| 人设编辑：17 站（含 Save）循环 | PASS |
| Shift+Tab 从名称框反向到 Cancel | PASS |
| Esc 关闭 | PASS |
| 名称框 Enter 不提交（需 Tab 到 Save） | 观察，可用性选择，不立案 |
| History Clear all：Tab 到按钮 Enter → 出现「Clear all history? / Clear / Cancel」，但 `document.activeElement === BODY`；Esc 不撤销 | **P3-296-7** |
| Dictionary 清空 / 删模型 / 重置设置：Enter 两次或双击即执行，无最短停留 | **P2-296-3**（实测各执行一次，已恢复） |
| 恢复出厂：第一次 Enter 进入确认，4001ms 后自动复位为按钮文案；未执行第二次 | PASS（有意不执行） |

### 3.d 导出

| 入口 | 默认名 / 过滤器 | 取消无副作用 | 保存 BOM+CJK | 覆盖 | 只读（应用层 EPERM） |
|---|---|---|---|---|---|
| History Markdown | `speaktype-history-2026-09-05.md` / Markdown | PASS | PASS `EF BB BF`，5455 B | PASS mtime 变 hash 不变 | PASS toast |
| Dictionary TXT | `speaktype-dictionary-2026-09-05.txt` / Text | PASS | PASS `深度学习\n東京\n` | PASS | PASS |
| Transcribe TXT | `speech4.txt` / Text | PASS | PASS 四段 zh/en/ja/zh | PASS | PASS |
| Transcribe SRT | `speech4.srt` / SubRip | PASS（重跑；首轮误点保存已披露） | PASS | PASS | PASS（zh-CN / ja 也在此入口实测） |

- 过滤器名来自 `filterName`，扩展名取自默认文件名（源码 `index.ts file:saveText`）；Explorer 隐藏已知扩展名，文件名框显示无扩展名基名（截图 `P3-D-*-dialog.png`）。
- 只读目录：对**目录**加 WRITE deny 时，Windows 原生另存对话框自己弹「You don't have permission to save in this location」并不返回路径，**应用层 toast 不会触发**（这是正确行为）。为触发 `toast.exportFailed`，改为在覆盖确认弹出时对**目标文件**加 deny 再确认：
  ```text
  [2026-09-05 22:01:03.842] [error] save text failed (C:\Users\Administrator\tts\ro\race.srt) Error: EPERM: operation not permitted, open 'C:\Users\Administrator\tts\ro\race.srt'
  ```
  toast 标题 en「Couldn't save file」/ zh-CN「保存文件失败」/ ja「ファイルを保存できませんでした」，正文为原始英文 EPERM 信息（五语中 zh-TW / ko **未测**）。→ **P3-296-8**：toast 正文直接暴露 `EPERM: operation not permitted, open 'C:\…'`，非用户语言。
- Notepad 打开四文件 CJK 均正常（`P3-D-*-notepad.png`）。

### 3.e 改写徽标全路径（mock 模式：delay 8s / ok / 500 / empty / timeout / Esc）

| 模式 | 录音 | 转写 | 改写中 | 终态 | toast |
|---|---|---|---|---|---|
| delay 8000ms | 徽标 | 徽标 | 徽标（文案 Rewriting…） | 消失 / idle，选区被替换 | — |
| ok | 徽标 | 徽标 | 徽标 | 消失，替换 | — |
| 500 | 徽标 | 徽标 | 太短未采到 | 消失，原文保持选中 | 「Rewrite failed」（`rewrite: endpoint returned HTTP 500`） |
| empty | 徽标 | 徽标 | 太短未采到 | 消失，原文保持 | 「Rewrite failed」（model returned nothing） |
| timeout | 徽标 | 徽标 | 徽标 | 消失，原文保持 | 「Rewrite failed」；polishing→toast 30.006s（`rewrite: The operation was aborted due to timeout`） |
| Esc（松 F8 后 1.5s） | 徽标 | 徽标 | 徽标 | 消失，原文保持，10s 内无迟到替换 | 「Dictation canceled」（`rewrite: This operation was aborted`） |

普通 RightCtrl 听写、A5 免按两次、F 六轮无声：徽标节点全程不存在。
深/浅色：Settings 切换 Theme 后重测 delay 模式，`getComputedStyle` 徽标 `background: oklab(0.769 0.064 0.177 / 0.2)` = rgba(255,155,0,.2)、`color` = rgb(255,210,48)、悬浮条 rgb(41,41,41)@.95，**两主题逐字节相同**（悬浮条不随主题变）。白底 Notepad 上合成后徽标文字对深色条对比度 ≈ 5.96:1。

### 3.f 294 轮未测补齐

- **f-1 locale 默认值**：`--lang=zh-TW` 等参数下 `Intl.DateTimeFormat().resolvedOptions().locale` 仍是系统 culture（en-US），四个 `--lang` 值全部得到 `{localSimplified:true, language:"en", localModel:"parakeet"}`——**这是测试手法错误，不是产品缺陷**。改用 `Set-Culture` + 新 PowerShell 进程 + 空 profile：zh-TW / zh-HK / zh-MO → `localSimplified:false, language:"zh", localModel:"sensevoice-small"`；zh-CN → `true`。Settings 中切到 whisper 后简体开关显示为关（`F1-TW-simplified-toggle-off.png`）。culture 已还原 en-US。
- **f-2 whisper 门控**（tiny-q5_1，5–7s 按住，Notepad + history + debug 日志三方核对）：

  | language + 夹具 | 简体开关 | 结果 |
  |---|---|---|
  | zh + zh.wav | on | `今天天气很好,我们一起去公园散步吧!`，`whisper t2cn applied (language=zh): 3/18 chars changed` ✅ |
  | auto + zh.wav | on | 同上，`(language=auto): 3/18` ✅ |
  | auto + ja.wav | on | `今日はとても良い天気ですね` 原样，无 t2cn 日志 ✅（假名门控） |
  | auto + ko.wav | on | `오늘 날씨가 정말 좋네요? …` 原样，无 t2cn 日志 ✅（谚文门控；识别有错字，不评准确率） |
  | **yue** + yue.wav | on / off / 7s 全长 | 全部输出**英文**：`(S) The day is very hot. I will go to the park. (S)` / `Hello, my name is Heng Ha.` → **P2-296-5**；yue 门控本身因无汉字输出而**未测** |
  | zh + yue.wav（替代验证） | off → on | off：`今天天氣好好,我滿一起去公園行下`（繁体保留）；on：`今天天气好好,我满一起去公园行下`，`(language=zh): 3/16` ✅ |

  另用 asar 内已构建 `zhNorm` 直接执行 9 组输入（zh/yue/auto×{纯汉字,假名,谚文}/ja/关闭/空语言），与源码 `simplifyWhisperOutput` 预期逐条一致（`gating_result.txt`）——这是**单元级执行**，不替代运行时。
- **f-3 下载错误文案**（Settings > Voice 选未下载的 `base-q5_1`，代理按 `dl-mode.txt` 切 404/500/neterr；en / zh-CN / ja 各三例）：
  ```text
  [2026-09-05 21:42:03.524] [warn]  download source failed: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin Error: HTTP 404 (huggingface.co)
  [2026-09-05 21:42:03.534] [warn]  download source failed: https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin Error: HTTP 404 (hf-mirror.com)
  [2026-09-05 21:42:28.408] [warn]  download source failed: https://huggingface.co/…/ggml-base-q5_1.bin Error: HTTP 500 (huggingface.co)
  [2026-09-05 21:42:44.610] [warn]  download source failed: https://huggingface.co/…/ggml-base-q5_1.bin TypeError: fetch failed
  ```
  代理日志同步（`CONNECT 404 huggingface.co:443` → `DL 404 tls GET …`）。UI 分别显示 `download.errNotFound` / `errServer` / `errNetwork` 三类文案（`P3-F-download-{en,zhCN,ja}-{404,500,neterr}.png`），Home 与 Transcribe 条幅同步显示网络错误（`P3-F-download-home-neterr.png` / `-transcribe-neterr.png`）。
  **注意**：只尝试了 huggingface.co 与 hf-mirror.com 两个源。源码 `hfSources()` 仅当 `knownSha256(gh)` 非空才追加 GitHub Release，`base-q5_1` 不在 `GH_ASSET_SHA256` 清单中，所以 GitHub 兜底对该模型**不存在**（非 bug，但意味着 whisper base/small 用户在 HF 全挂时没有第三源）。
- **f-4 MP3 SRT**：`speech4.mp3` → `file transcribe started (21.4s, model=tiny-q5_1)` → `done (4 segments)`：
  ```text
  1
  00:00:00,000 --> 00:00:05,150
  今天天气很好,我们一起去公园散步吧!

  2
  00:00:05,150 --> 00:00:10,250
  The Quick Brown Fox jumps over the lazy dog.
  …
  4
  00:00:15,100 --> 00:00:21,432
  ```
- **f-5 免按无声退出**（`silence30.wav`，vadAutoStop=true）：
  ```text
  [2026-09-05 21:33:51.379] [info]  dictation finalize: durationMs=10035 maxPeak=0 voicedMs=0
  … ×6（10045 / 10048 / 10046 / 10048 / 10046）
  [2026-09-05 21:34:42.381] [info]  dictation finalize: durationMs=10046 maxPeak=0 voicedMs=0
  ```
  第 6 轮后 toast「Hands-free mode ended」，首个 recording 状态事件到 toast 事件 61.028s，面板消失、0 history。无声期间 Esc：toast「…Esc pressed, so continuous dictation stopped…」，同一 40ms 内回 idle，无 finalize。

## 4. 自由发掘（真实用户视角，~23 分钟 + 前两阶段穿插）

走过：Notepad / Chrome textarea 听写、History 搜索/来源筛选/原文展开/复制/纠正/删除撤销/失败重试、词典增删、人设 Alt+1/Alt+2 切换、托盘菜单（ja）、最小化恢复、开机自启开关（注册表实测增删）、autoPaste 关（无落字、剪贴板可用）、820×560 最小窗口 zh-CN/ja 布局、日文润色连接测试（mock）。无崩溃、无卡死。

让我「不想继续用」的点：
1. **Settings 文本框快速输入丢字**（P2-296-4）：API Key 连打 `mock` 存成 `mok`；Model 框 `…mnopqrstuvwxyz…` 丢 `r`。被动 `input` 事件跟踪显示每个字符都到达了 DOM，但值随后被回退（`moc` → 下一键后 `mok`）。~6ms/字符的合成输入必现；~110ms/字符人手速度与整段粘贴不复现。真人在快速粘贴+补打、或输入法上屏一串字符时可能命中；且 API Key 是密码框看不见，错了只能靠测试按钮发现。
2. **失败重试文案叠加**（P3-296-9）：识别失败条目上再次 Retry 仍失败时，长错误文案在同一行重复出现一次，「重试」两字被挤成竖排（`P3-G-retry-error-wrap.png`，1280×720 下即复现）。
3. **两步确认无防误触**（P2-296-3）：删模型 / 清空词典 / 重置设置都是「点一下变红字、再点一下执行」，双击就直接执行；下载完成瞬间 Cancel 按钮原位变成 Delete，本轮真的双击误删了刚下完的 660MB。
4. 人设图标选择器在日文界面没有任何悬停说明，可访问名是英文标识符（sparkles/briefcase…）（观察，不立案）。

### 与 Wispr Flow / Typeless / Handy 的三项体验差距（按「日常命中频率 × 缺失严重度 × 竞品普遍性」排序）

依据：Wispr Flow 官网 features 页与帮助中心（Command Mode、dictionary auto-add、edits while you speak）、Typeless 官网（auto-remove filler / mid-sentence self-correction / auto-format / speak-and-translate）、Handy GitHub README（Whisper GPU 加速、Parakeet V3、Silero VAD、Win/mac/Linux）。均为 2026-09 公开页面描述，未逐项实机对比。

| 排序 | 差距 | 我们现状 | 竞品 | 排序理由 |
|---|---|---|---|---|
| 1 | **开箱即用的 AI 清理**（去口癖、句中自我修正只留最终意图、列表自动格式化） | 需用户自带 OpenAI 兼容 key 并开「AI 润色」；默认关，本地模型直出 raw + 人设规则 | Wispr Flow / Typeless 默认开且托管；Handy 无（与我们同档） | 每一句都命中；付费竞品的核心卖点；我们的 Persona/翻译人设已具备提示词框架，缺的是无 key 可用的默认通道（本地小模型或托管代理） |
| 2 | **边说边出字**（实时插入而非松手后整段粘贴） | 悬浮条有实时字幕，但正文在松手 → finalize → ASR → 润色后一次性粘贴（本轮 whisper ja：finalize → Notepad 出字 437ms、→ history 落盘 745ms；开润色后再加 LLM 往返） | Wispr Flow「edits while you speak」；Typeless 宣称 real time | 每句命中，但我们的延迟在可接受区；差距是感知而非功能，且流式插入对撤销/纠错有复杂度 |
| 3 | **交叉操作的可预期性与反馈**（排队/取消/切模式时永远有提示） | 本轮 P2-296-1/2、a④ Alt+Q 三条路径都出现「用户做了动作、系统没有任何反馈」 | Wispr Flow 文档明确：Esc/Backspace 随时取消、极短按住直接 dismiss，并有可见提示 | 低频但一旦命中就是「丢了一句话且不知道为什么」；#386 引入排队后新增的面，修复成本低（补 toast + 修 F8 路径） |

未列入前三但值得记：Handy 的 Whisper GPU 加速（我们 whisper-server/sherpa 走 CPU int8，本 VM 无 GPU 未比）、Wispr Flow 词典跨设备同步（我们只有 config 导出）、Linux 版（Handy 有）。

## 5. 立案

### P2-296-1 排队中「晚 Esc」：上一句照常落字、排队句被静默丢弃且无提示
- 复现：whisper tiny，`down:rctrl,3000,up:rctrl,100,down:rctrl,600,tap:esc,600,up:rctrl`（Esc 落在上一句 finalize 后 ~0.7s，即本地 ASR 已返回、正在润色/粘贴）。结果：第一句落字 + 入 history；无 toast；第二句无 resumed / finalize；松手无反应。
- 根因（`dictation.ts cancel()` L705–754）：Esc → `cancelByKey` → `cancel(true)`。L717–723 先清掉 `pendingStart`/`pendingFrames` 并 `recorder:stop`；随后 `this.session` 已为 null（finalizeSession 开头置空）走 L732 分支：`finishing` 已 null（ASR 完成）、`rewriteAbort` 为 null（非改写）→ 落到 L741 `this.pendingEnd = "cancel"`——这个字段只在连接建立期被 `flushPendingEnd` 消费，对正在 `polishText`/粘贴的上一句**无效**，也**不弹 toast**（L753 只在 `session` 存在分支）。于是：上一句不可取消（可接受，结果已定），但排队句被丢时用户零反馈。
- 建议修法：在 L717 清队分支里，若 `!this.session`（即当前只有排队句可取消），显式 `this.deps.showToast(t("toast.canceled"), t("toast.canceledBody"))`；并在 `finalizeSession` 的润色阶段增加 `pasteCancelled` 标志（Esc 时置位，粘贴前检查），让「晚 Esc」也能拦住尚未粘贴的上一句，与 `finishCancelled` 对称。

### P2-296-2 排队期间按住 F8：F8 松手把仍按着的 RightCtrl 排队句判为已松手
- 复现：`down:rctrl,3000,up:rctrl,30,down:rctrl,140,down:f8,160,up:f8,1500,up:rctrl`。log：`queued` → `resumed queued hold (frames=0, released=true)` → `finalize: durationMs=590 maxPeak=0` → toast「Didn't catch that」；第二句丢失，而 RightCtrl 直到 1.5s 后才松。
- 根因：`hotkey.ts pressRewrite` 120ms 后置 `rewriteActive=true` 并调 `onHoldStart(true)` → `dictation.startRewrite()` 因 busy 弹「上一句还在处理」并返回（正确）；但 `releaseRewrite` 只看 `rewriteActive`，仍调 `onHoldEnd(true)`；`index.ts` 把 `onHoldEnd` 一律映射为 `dictation.stop()`（忽略 rewrite 参数）；`stop()` L684–687 见 `pendingStart` 就置 `released=true`。即 F8 松手替 RightCtrl 松了手。同理，普通状态下按住 F8 被拒后松开也会 `stop()` 当前 RightCtrl 会话（本轮未单测该变体）。
- 建议修法：`onHoldStart(rewrite)` 返回是否真正开始；`HotkeyManager` 仅在返回 true 时置 `rewriteActive`；或在 `dictation.stop(rewrite: boolean)` 中忽略与当前会话/排队 owner 不匹配的释放（记录 `pendingStart.owner: "hold" | "rewrite"`）。

### P2-296-3 两步确认无最短停留：双击/双 Enter 即执行删模型、清词典、重置设置；下载完成瞬间 Cancel 原位变 Delete
- 复现 1（真实误伤）：Settings > Voice，Parakeet 下载至 ~97% 时双击 Cancel → 第一击时下载已完成、按钮已变 Delete → 第二击确认：`21:03:04.559 downloaded` → `21:03:04.799 deleted`（240ms）。
- 复现 2：Dictionary「清空」双击 → 立即清空；General「重置设置」双击 / Tab+Enter×2 → 立即重置；Voice「删除模型」双击 → 立即删除 tiny（均已恢复）。
- 根因：`VoiceTab.tsx L37–43`、`GeneralTab.tsx L20–25`、`Dictionary.tsx L21–26` 的 `confirmX` 状态只有 4s 自动复位，没有「进入确认态后 N ms 内忽略点击」；且下载完成后 `!local.downloading && local.downloaded` 让同一坐标的按钮从 Cancel 变为 Delete（`VoiceTab.tsx L165–190`）。
- 建议修法：确认态进入后 `setTimeout` 400–600ms 内 `disabled`（或用 `pointer-events:none` + `aria-disabled`）；下载完成后把 Delete 从原 Cancel 位置移开或先渲染一帧「已就绪」再显示 Delete；恢复出厂已有更强的两步，可复用其模式。

### P2-296-4 Settings 文本框快速输入丢字（主进程 settings 回推覆盖本地输入）
- 复现：Settings > Speech > OpenAI-compatible，API Key 框以 ~6ms/字符连打 `mock` → 持久化 `mok`；Model 框连打 `P3-typing-abcdefghijklmnopqrstuvwxyz-0123456789` → 丢 `r`。被动 `input` 监听：`value:"moc" data:"c"` 之后下一事件 `value:"mok" data:"k"`，即 `c` 到达后值被回退到 `mo`。~110ms/字符与整段粘贴不复现。
- 根因：`App.tsx L107–110 update()` 乐观 `setSettings({...settings, ...patch})` 后 `api.updateSettings(patch)`；主进程 `applySettingsPatch` → `pushSettings()`（`index.ts L302–308`）把**完整 settings 回推给发起窗口自身**；`App.tsx L69–73 onSettings` 无条件 `setSettings(s)`。当第 N 次回推抵达时渲染端已应用第 N+1 次输入，受控 `<input value>` 被回退到旧值，下一击在旧值上追加 → 丢字。每次 patch 还同步写盘（`writeFileSync`），磁盘慢时窗口更大。
- 建议修法（任一）：主进程回推时跳过 `event.sender`（其余窗口仍收）；或渲染端维护 `inflight` 计数，`inflight>0` 时忽略回推、以 `updateSettings` 的返回值为准；或文本类字段改为本地 draft state + `onBlur`/300ms debounce 提交。

### P2-296-5 whisper tiny/base/small 可选「粤语」，实际输出英文翻译且无提示
- 复现：localModel=tiny-q5_1，language=yue，yue.wav 5s/7s、简体开关开/关四次 → 全部英文（`(S) The day is very hot. I will go to the park. (S)`、`Hello, my name is Heng Ha.`），无 warn 日志、无 UI 提示；同一音频 language=zh 得正确粤语汉字。
- 根因：VoiceTab L336 对所有非 Parakeet 模型都提供 `yue` 选项；`asr.ts` 原样把 `language=yue` 发给 whisper-server。**推断（未在 whisper.cpp 源码中逐行核实，需 297 轮确认）**：whisper.cpp 的 `yue` 语言 id=99 只在 large-v3 词表（51866）里有对应 token；tiny/base/small 词表 51865 中 `sot+1+99` 恰是 `<|translate|>` token，于是提示序列变成「翻译成英文」。whisper-server stderr 在打包版被 `stdio:"ignore"` 丢弃，无法拿到直接证据。
- 建议修法：whisper 家族非 large-v3 时隐藏 `yue`（或映射为 `zh` 并在 hint 说明「粤语按中文识别」）；SenseVoice 原生支持 yue 不受影响。同时把 whisper-server stderr 接到 main.log（debug 级）便于诊断。

### P3-296-6 免按句间 RightCtrl / 排队中 Alt+Q：动作有效但无「为什么」的反馈（设计争议）
- 现状：RightCtrl 松手结束免按（toast 有）；排队中 Alt+Q 不进免按、且把排队句判为已松手 → 空句无 toast。
- 建议：保留互斥设计；排队/忙碌时 Alt+Q 复用「上一句还在处理」toast（`toast.busy*`），与 F8 一致。

### P3-296-7 History「Clear all」确认态：焦点落 BODY、Esc 不撤销
- 复现：Tab 到 Clear all → Enter → 出现「Clear all history? / Clear / Cancel」，`document.activeElement` 为 BODY；Esc 无效；键盘用户需重新 Tab 一遍。
- 根因：`History.tsx L164–186` 条件渲染把原按钮卸载、新按钮挂载，未 `ref.focus()`；无 `onKeyDown` Esc 处理；也没有其他页面那种 4s 自动复位 `useEffect`。
- 建议：确认态挂载后 `autoFocus` 到 Cancel（安全默认）；`onKeyDown` Esc → `setConfirmClear(false)`；补 4s 自动复位与其他页面一致。

### P3-296-8 导出失败 toast 正文为原始英文 EPERM 信息
- 现状：标题已本地化，正文 `EPERM: operation not permitted, open 'C:\…\race.srt'`（`index.ts L485 showToast(t("toast.exportFailed"), error.message)`）。zh-TW「儲存檔案失敗」/ ko「파일을 저장하지 못했습니다」为源码 locale 文案，未实测。
- 建议：复用 `humanDownloadError` 思路映射 EACCES/EPERM/ENOSPC → 本地化 `download.errStorage` 类文案，路径放第二行。

### P3-296-9 失败条目再次 Retry 仍失败时错误文案叠加、「重试」竖排
- 复现：History 失败条目（ASR 端点不可达）→ Retry 仍失败 → 同行出现两段长错误文案，「重试」按钮宽度被压成两字竖排（1280×720、zh-CN）。`P3-G-retry-error-wrap.png`。
- 建议：错误文案区 `truncate`/`line-clamp-2` + 完整文案放 title；按钮 `shrink-0 whitespace-nowrap`。

## 6. 未测 / 边界如实清单

- a④ 手机麦（远程 `remote=true`）排队分支；`MAX_BUFFERED_FRAMES` 上限；`resumeQueued` 的 `state!=="idle"`（上一句 error）分支。
- b 取消后 <200ms 立即再点下载的严格竞态；`.part` ETag 不一致时丢弃重下。
- c 屏幕阅读器实际朗读；恢复出厂第二步（有意不执行）。
- d 只读 toast 的 zh-TW / ko 文案；目录级只读由 Windows 原生对话框拦截，应用 toast 不触发属正常。
- e 500 / empty 模式的「改写中」态 DOM 采样（太短）。
- f yue 门控本身（whisper 输出英文，无汉字可门控）；下载三源中 GitHub 兜底（对 `base-q5_1` 不存在）；whisper-server stderr（打包版丢弃）。
- 本构建 main.log 不打 Range / 进度 / 校验成功 / 粘贴 / 取消 / 免按进出行，凡以此为断言的项均改用文件字节、哈希、history 时间戳、Notepad 轮询替代，报告中未出现的日志行即不存在。
- 竞品对比基于公开页面描述，未实机安装对比。
- pack:dir 签名步骤退出码 1 的原因未定位。

## 7. 录屏与证据

- Phase 1（构建后核心链路 + 下载 + locale）：`C:\Users\Administrator\screencasts\round296-phase1\round296-phase1-edited.mp4`
- Phase 2（排队边界 + 徽标 + 免按无声）：`C:\Users\Administrator\screencasts\round296-phase2\round296-phase2-edited.mp4`
- Phase 3（下载文案 + whisper 门控 + 导出 + 键盘 + 自由发掘）：`C:\Users\Administrator\screencasts\round296-phase3\round296-phase3-edited.mp4`
- 截图 / `.result.json` / 隔离 main.log / history 切片：`C:\Users\Administrator\tts\shots\`（文件名已在各节标注）；阶段原始报告 `C:\Users\Administrator\tts\report-phase{1,2,3}.md`。
- 测试手法已追加到 `.agents/skills/testing-speaktype-desktop/SKILL.md`（同分支）。

## 8. 环境还原

- app.asar 未改，SHA-256 复核 `88CDEBEB…1F00` 一致；`SpeakType.exe` 未改。
- mock LLM（18081）与 MITM 代理（18082）进程已停止；`HTTPS_PROXY` 等仅在该次启动的子进程环境中，未写入系统。
- Windows culture 还原 `en-US`；测试 ACL deny 全部移除（递归 icacls 无 DENY）；测试导出文件（`Documents\P3-*.{md,txt,srt}`、`Documents\speech4.srt`）已删除。
- 应用 profile 恢复：SenseVoice / language=zh / 简体开 / autoPaste 开 / 润色关 / 自定义 ASR 字段清空 / 默认人设 / 三模型保留；开机自启关。
- `git status` 仅 `docs/reviews/round296.md` 与 `.agents/skills/testing-speaktype-desktop/SKILL.md`。

## 建议下一轮（297）验收点

1. P2-296-1/2 修复后重跑 §3.a 全部序列（早/晚 Esc、F8 按住、Alt+Q），要求每条路径都有 toast，且「晚 Esc」能拦住尚未粘贴的上一句；补测手机麦排队与 `state!=="idle"` 分支。
2. P2-296-3：所有两步确认加最短停留后，用 `double_click` 与 `Enter×2` 回归六处（删模型 / 清词典 / 重置 / 恢复出厂 / 删人设 / History 清空）；下载完成瞬间双击 Cancel 不得删模型。
3. P2-296-4：主进程回推不再覆盖发起窗口，用 6ms/字符合成输入回归 API Key / Model / Base URL / 润色三字段，持久化值逐字一致。
4. P2-296-5：whisper 非 large-v3 隐藏或映射 `yue`；把 whisper-server stderr 接入 main.log 后，用 yue.wav 复核 SenseVoice yue 与 whisper zh 的输出。
5. 排查 `pack:dir` 签名步骤退出码 1（本 VM 复现），确认正式发布链路不受影响。
6. 竞品差距 #1：给出「无 key 默认清理通道」的设计论证（本地小模型 vs 托管代理 vs 规则），先论证再开发。
7. 补 zh-TW / ko 导出失败 toast、P3-296-8 本地化正文、P3-296-7/9 修复后的 820×560 与 1280×720 双分辨率截图。
