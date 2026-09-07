# SpeakType 第 306 轮严格体验官 + QA 验收报告（打包版实测）

- 被测版本：main `a00783e`（含 #396 第 305 轮修复、#397 测试经验），`desktop/release/win-unpacked/SpeakType.exe`（v0.17.2，`packaged=true`），**不测 dev**
- 测试环境：Windows Server 2022 VM（1280×720、DPI 100%、无真实声卡，`--use-fake-device-for-media-stream` + 合成 wav 喂麦）、Node v20.19.0 / npm 10.8.2、ffmpeg 6、Chrome for Testing（Monaco 目标）
- 测试者：Devin（user-experience-officer + qa-engineer 双角色），UI 操作全部走原生输入（SendInput 合成 RightCtrl/Alt+Q/Esc/F8、鼠标点击），CDP 仅用于只读度量
- 测试时间：2026-09-06 19:5x–21:4x UTC，连续约 2 小时打包版实测；分两个 Phase 录屏
- 证据根目录（本机）：`C:\r306\evidence\`（545 张截图 + 420 个 log/json/txt），打包 `C:\r306\r306-evidence.zip`（31.2 MB）
- 录屏：`C:\Users\Administrator\screencasts\r306-phase1\r306-phase1-edited.mp4`（核心链路 + 手机麦 + 统计 + int8 内存，15.4 MB）、`C:\Users\Administrator\screencasts\r306-phase2\r306-phase2-edited.mp4`（fp32 全链路 + 下载三阶段 + toast/导出 + 悬浮条 + VTT + 五语排版，39.6 MB）

## 0. 给老板的结论（可直接转发）

第 306 轮对 main `a00783e` 打包版做了 60 项实测：核心链路、手机麦、fp32 Parakeet 真实下载（真源 2.5 GB，含中途取消/续传）、8 个 303 轮 fixture 对照（fp32 0/8 Ple、int8 复现 2/8）、下载三阶段五语文案、toast/导出、统计/VTT、悬浮条、内存全部通过，**无 P0/P1**。立案 5 条 P2/P3：悬浮条 `auto` 只按「光标矩形」判相交，光标在行尾时悬浮条仍盖住当前行左侧文字（P2）；Copy All 反馈是按钮内嵌文字而非 toast（与 #396 描述不符，P3）；Esc 取消无 main.log 记录（P3）；fp32 提示未说明速度代价、模型 ID 对新用户不友好（P3）；Home「节省时间」向下取整（P3）。未测 3 项（125%/150% DPI、Monaco/VS Code `learnInaccessible`、第 2 源切源文案肉眼可读性）均因 VM 环境限制，已如实标注。**结论：a00783e 可发布，建议 307 轮合入 P2 修复后复测悬浮条 auto。**

## 1. 总览：PASS / FAIL / 未测 计数

| 类别 | PASS | FAIL | 未测 | 说明 |
|---|---:|---:|---:|---|
| g) 环境（干净 clone → pack:dir） | 3 | 0 | 0 | |
| 核心链路回归 A1–A11 | 15 | 0 | 0 | A4 Esc 取消 UI 通过，但无日志（P3-306-3） |
| a) fp32 真实路径 B1–B9 | 12 | 0 | 0 | 真源下载，非代理 |
| b) 下载三阶段 F1–F3 | 6 | 0 | 1 | 第 2 源文案一闪而过，未能肉眼确认 |
| c) toast/导出/复制/DPI C1–C3 | 6 | 1 | 2 | Copy All 非 toast；DPI 125/150、a11y toast 未测 |
| d) 统计与 cue D1–D2 | 7 | 0 | 0 | |
| e) 悬浮条位置 E | 8 | 1 | 1 | 光标行尾时不避让（P2-306-1）；免按段间「底左→顶」直接用例未测 |
| f) 内存 P2/B7 | 2 | 0 | 0 | 一次性台阶，非每段增长，不立 P2 |
| h) 自由发掘 H | 观察 | — | — | 见 §9 |
| **合计** | **59** | **2** | **4** | |

## 2. g) 环境：干净 clone → npm install → pack:dir（PASS）

| 项 | 结果 | 证据 |
|---|---|---|
| `git clone` main → `a00783e` | PASS | `git log -1` = `a00783e docs(skill): 第 305/305b 轮测试经验沉淀 (#397)` |
| `npm install` 一次成功（含 `postinstall: node scripts/ensure-electron.mjs`） | PASS | 仅 Node 20.19 EBADENGINE 警告（要求 >=22.12），`node_modules/electron/dist/electron.exe` 存在；ensure-electron 因二进制已在则静默 |
| `npm run typecheck && npm run build && npm run pack:dir` 一次成功 | PASS | 产出 `release/win-unpacked/SpeakType.exe`；`app.asar.unpacked` 含 `koffi / sherpa-onnx-node / sherpa-onnx-win-x64 / uiohook-napi` |
| 正式副本 SHA-256 | 记录 | `app.asar` `12D93BE43BE74404377CC9CF581AC3E200EC11213A1D109CEC02B022ADABB042`；`whisper-server.exe` `9E581A4A2B7BD5AEC0993F5794FEA3D65AF2D7F5921CF51C2A4E4B5A3A464D89`（测毕复核一致，见 §11） |

备注：npm 10.8.2 的 `npm install` 会往 `desktop/package-lock.json` 根条目写入 `"hasInstallScript": true`（因新增 postinstall），产生一处 lock 漂移；本轮已还原不提交。建议维护者用与 lock 同版 npm 重生成一次 lock，否则每台机器 `npm install` 后 `git status` 都会脏（P3-306-6，仅记录）。

首启（`A0-startup.log`）：
```
[2026-09-06 19:58:13.396] [info]  no legacy userData to migrate
[2026-09-06 19:58:13.428] [info]  SpeakType 0.17.2 starting (packaged=true)
[2026-09-06 19:58:18.697] [info]  latest release prefetched: v0.17.2
```
三个基础模型真源下载（`A0-downloads.log`）：sensevoice `model.int8.onnx` 6.4s、parakeet int8 `encoder.int8.onnx` 29.0s、whisper `ggml-base-q5_1.bin` 1.6s，进度条截图 `shots/A0-*-progress.png`。

## 3. 核心链路回归（Phase 1，全部 PASS）

| # | 用例 | 结果 | 关键证据 |
|---|---|---|---|
| A1 | RightCtrl 按住说话 → Notepad 落字（SenseVoice，en wav） | PASS | `shots/A1-rctrl-landed.png`；`A1-history.json`：`Please schedule a meeting for tomorrow with three in the afternoon.` dur=4889 |
| A2 | 排队第二句：两段**不同**句子（en1 → en2），第二次落字 ≠ 第一次 | PASS | `A2-main.log`：`dictation start: previous session still finalizing, queued` → `dictation start: resumed queued hold (frames=1, released=false)`；`A2-history.json` 两条：`The quarterly report is ready for review and needs your signature.`(5383ms) 与 `Please schedule a meeting for tomorrow at three in the afternoon.`(4375ms)；`shots/A2-queued-distinct.png` |
| A3 | Alt+Q 免按进入 → 说一句 → Alt+Q 退出 | PASS | `A3-main.log` `dictation finalize: durationMs=6011 … voicedMs=2680`，退出 toast `shots/A3-exit-001.png`，进入 `shots/A3-handsfree-009.png` |
| A4 | 录音中 Esc 取消 | PASS（UI）/ 观察 | 取消 toast `shots/A4-cancel-001.png`，Notepad 无落字，`A4-before/after-history.json` 相同；**`A4-before/after-main.log` diff 为空**——普通 Esc 取消无任何日志（P3-306-3） |
| A5 | F8 选中文本 + 口述指令 → mock LLM 改写 | PASS | `A5-mock_llm.log` 收到 `POST /v1/chat/completions`（prompt 含 `Spoken instruction: Please schedule a meeting…` / `Original text: This is the selected original sentence.`），Notepad 替换为 `[MOCK-REWRITE-OK-306]`，`shots/A5-rewrite-009.png` |
| A6 | 深色模式 Home/Settings/Transcribe | PASS | `shots/A6-dark-home.png`、`A6-dark-settings.png`、`A6-dark-transcribe.png`，无白底闪烁/未染色控件 |
| A7 | SenseVoice zh 一遍 | PASS | `A7-history.json`：`帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复` dur=6884；`shots/A7-zh-006.png` |
| A8 | Parakeet int8 en 一句 | PASS | `Please schedule the meeting for tomorrow at three in the afternoon.` dur=4876；`shots/A8-parakeet-011.png`；切模型 `sherpa worker stopped (model switched)` → 下一次听写 `sherpa worker started (parakeet-tdt-0.6b-v3)` |
| A9 | whisper base ja 一句 | PASS | `A9-history.json`：`明日の午前中までに、この資料を確認してください` dur=5874；`shots/A9-whisper-019.png` |
| A10-b① | 手机麦 owner 隔离：手机录音中桌面按 RightCtrl 不抢占 | PASS | `A10-owner-retry-simulator.log`：手机端持续收到 `recording` partial，`sent stop` → `transcribing` → `idle`；桌面 RightCtrl 未产生第二条 history（`A10-owner-retry-history.json`），`shots/A10-owner-retry-landed.png`（`source=phone`） |
| A10-b② | 手机录音中桌面 Esc → 只对手机会话生效并提示 | PASS | `shots/A10-esc-toast-002.png`，`A10-esc-simulator.log` 收到 `idle`，history 不新增 |
| A10-b③ | 手机端 cancel / 断开（close 1005） | PASS | `A10-phonecancel-toast-034.png`、`A10-close-toast-034.png`；`A10-close-simulator.log` `close 1005`，桌面回 idle，无残留录音态 |
| A11-a③ | 端口竞态：外部进程占 `0.0.0.0:43117` → 应用回退 43118 | PASS | `A11-port-owners.txt`：`0.0.0.0 43117 PID 6480`（占位 node）/`0.0.0.0 43118 PID 5056`（SpeakType）；`A11-main.log` `remote mic listening at https://172.16.19.2:43118/?t=[REDACTED]`；手机模拟器连 43118 落字 `shots/A11-port43118-landed.png` |

手法注记（已沉淀到 SKILL.md）：fake-mic 每次 getUserMedia 会从 wav 头重放，A2 需用临时 `capture.wav` 在松手后、排队按下前换成第二段；占端口的 node listener 必须显式 bind `0.0.0.0`（bind `::` 与应用的 IPv4 监听可共存不冲突）。

## 4. a) fp32 Parakeet 真实路径（B1–B9，全部 PASS）

**下载走 huggingface.co 真源，未用 dlproxy 代理；** VM 带宽足够（encoder.weights 续传 1.67 GB 用 80.4s ≈ 20 MB/s）。

### B1 真源下载 + 进度/校验文案（PASS）
- 起止：`B1-start-time.txt` 20:28:11 → `B1-complete-time.txt` 20:31:38，共 3m27s（含 B2 取消 + 续传）
- `B1-main.log`：
```
[2026-09-06 20:28:32.964] [info]  download ok: huggingface.co -> encoder.onnx in 12.7s
[2026-09-06 20:29:09.664] [info]  local model parakeet-tdt-0.6b-v3-fp32 download cancelled
[2026-09-06 20:31:24.995] [info]  download ok: huggingface.co -> encoder.weights in 80.4s
[2026-09-06 20:31:33.763] [info]  download ok: huggingface.co -> decoder.onnx in 8.8s
[2026-09-06 20:31:36.352] [info]  download ok: huggingface.co -> joiner.onnx in 2.6s
[2026-09-06 20:31:36.569] [info]  download ok: huggingface.co -> tokens.txt in 0.2s
[2026-09-06 20:31:36.570] [info]  local model parakeet-tdt-0.6b-v3-fp32 downloaded
```
- 进度条 10%/50% 截图 `shots/B1-progress-10-00x.png`、`B1-progress-50-00x.png`；「校验中…」出现 4 次（每个带 SHA 的文件各一次）`shots/B1-verifying-1..4-00x.png`；就绪 `shots/B1-ready.png`；`B1-phasepoll.log`（250ms 轮询按钮文案，137 KB）

### B2 中途取消保留残片 → 「继续下载(x%)」→ 续传完成（PASS）
- 31% 时点 Cancel：`B2-part-files.txt`
```
encoder.onnx               41766257
encoder.weights.part      764206942
encoder.weights.part.json       203
```
- `B2-part-meta.json`：`{"url":"https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3/resolve/main/encoder.weights","etag":"3af3f51af5f2d01dbbf5af47d42c7962a2c205f11004254bb4f2b979862f39a8","total":2435420160}`
- 离开再回 Settings：按钮 **`Resume download (31% done)`**（`shots/B2-resume-after-navigation.png`，英文界面；中文文案为「继续下载(31%)」，本轮以英文实测），点击后续传 80.4s 完成。备注：正式日志不打印 HTTP 206，续传是否真的走 Range 由 F1 的 dlproxy 侧日志佐证（§5）。

### B3 五文件落盘大小 + encoder.weights SHA（PASS）
`B3-fp32-files.txt`：`encoder.onnx 41,766,257 / encoder.weights 2,435,420,160 / decoder.onnx 47,233,743 / joiner.onnx 25,286,330 / tokens.txt 93,939`，与 `localasr.ts` 声明逐一相等。`B3-fp32-sha256.json`：encoder.weights SHA-256 = `3AF3F51AF5F2D01DBBF5AF47D42C7962A2C205F11004254BB4F2B979862F39A8`，与 HF `X-Linked-ETag` 一致（任务书里给的期望值少了末位 `8`，只有 63 位，属笔误）。

### B4 选中 fp32 后 RightCtrl en 落字 3 句 + 首句延迟（PASS）
| 句 | 松手→落字 | 主进程 RSS/Private（MB） | 落字 |
|---|---:|---|---|
| en1（冷，worker 刚起） | 466 ms | 2574.4 / 2328.1 | `Please schedule the meeting for tomorrow at three in the afternoon.` |
| en2（热） | 434 ms | 2594.6 / 2360.9 | `The quarterly report is ready for review and needs your signature.` |
| en3（热） | 504 ms | 2592.7 / 2358.7 | `Our team shipped the new release last night without any critical bugs.` |

「冷」的注记：fp32 worker 是在按下 RightCtrl 时懒启动（`20:32:36.670 sherpa worker started (parakeet-tdt-0.6b-v3-fp32)` → `20:32:41.533 dictation finalize`），2.4 GB 模型加载与 ~5s 按住重叠，所以松手后延迟与热态相近；若用户按住 <2s 就松手，首句会等待加载，本轮未构造该极短用例（建议 307 加测）。

### B5 303 轮 8 个 fixture：fp32 vs int8（PASS，fp32 0/8 Ple、0 空串）
Transcribe 页逐个拖入，结果读自 `B5-*-result.json`（与页面 `-ui.txt` 一致），汇总 `B5-comparison.json`：

| fixture | fp32 | int8 |
|---|---|---|
| empty_s09g_700_1001.wav | Could you share the slides from yesterday's presentation? | 同 |
| empty_s09g_700_1004.wav | 同上 | 同 |
| empty_s09g_700_1010.wav | 同上 | 同 |
| empty_s09g_700_1013.wav | 同上 | 同 |
| ple_en_200_zero.wav | Please schedule the meeting for tomorrow at 3 in the afternoon. | **Ple schedule the meeting for tomorrow at three in the afternoon.** |
| ple_s01j_300_zero.wav | Please send me the updated report by Friday. | **Ple sed by Friday.** |
| ple_s01j_500_zero.wav | Please send me the updated report by Friday. | Please send me the updated report by Friday. |
| ctl_s09g_700_zero.wav | Could you share the slides from yesterday's presentation? | 同 |

fp32：8/8 非空、0 个 `Ple` 前缀；int8：2/8 `Ple` 截断（其中 `ple_s01j_300_zero` 丢了大半句），0 空串。与 303 轮 A/B（int8 15/99、fp32 0/99）方向一致，fp32 确实解决句首吞字。

### B6 int8 ↔ fp32 切换 worker 重建（PASS）
```
[2026-09-06 20:39:10.812] [info]  sherpa worker stopped (model switched)
[2026-09-06 20:39:26.129] [info]  sherpa worker started (parakeet-tdt-0.6b-v3-fp32)
[2026-09-06 20:39:30.997] [info]  dictation finalize: durationMs=4874 …
[2026-09-06 20:39:36.609] [info]  sherpa worker stopped (model switched)
[2026-09-06 20:39:45.121] [info]  sherpa worker started (parakeet-tdt-0.6b-v3)
```
选中即停旧 worker，新 worker 在**下一次听写**时懒启动（非选中即加载）。切回 int8 后主进程 RSS 806.9 MB / Private 880.9 MB（fp32 时 2575.2 / 2334.6）——fp32 的 ~1.7 GB 增量在切回后释放，无残留。

### B7 fp32 长段内存台阶（PASS，见 §8）

### B8 资源成本警告文案（PASS，用户可理解）
- Settings→语音（zh-CN，`B8-zh-settings.txt`）：「Parakeet 原精度版：语种与 parakeet-tdt-0.6b-v3 相同，但不再出现 int8 版偶发的句首吞字（如 "Please" 识成 "Ple"）。代价是 2.5GB 下载、加载后约占 2.7GB 内存——内存充足且遇到过句首缺字时再选它。」
- Transcribe（zh-CN）：「…当前为原精度版：加载后约占 2.7GB 内存。」；en：`Full-precision build: about 2.7GB of RAM while loaded.`
- 实测 RSS 2.5–2.7 GB 与文案「约 2.7GB」相符。缺口：文案没说速度是否有差（实测 fp32 松手延迟 434–504 ms 与 int8 同量级，其实可以直说「速度相近」），见 P3-306-4。

### B9 磁盘不足（1 GB 固定 VHD 挂 junction 到模型目录）→ ENOSPC 人话报错、不跳源（PASS）
`B9-after-nohop-main.log`：
```
[2026-09-06 20:41:28.503] [info]  download ok: huggingface.co -> encoder.onnx in 12.5s
[2026-09-06 20:42:08.161] [warn]  download source failed: https://huggingface.co/…/encoder.weights Error: ENOSPC: no space left on device, write
[2026-09-06 20:42:08.163] [warn]  local model parakeet-tdt-0.6b-v3-fp32 download failed Error: ENOSPC: no space left on device, write
```
仅一条 `source failed`，没有 hf-mirror/GitHub 重试（`isStorageError` 短路生效）。UI：en `Download failed: cannot write to the models folder — check disk space and file permissions.`（`shots/B9-en-storage.png`）；zh `下载失败：无法写入模型目录，请检查磁盘空间与文件夹权限。` 测毕 VHD detach、junction 删除、模型目录还原（`B9-detach.txt`、`B9-restored.txt`、`phase2-cleanup.json` `vhdFileExists=false`）。

## 5. b) 下载三阶段体验复核（F1–F3；便携副本 B + dlproxy，正式 asar 未改）

按 SKILL.md Round 293/301/305 手法：复制 `win-unpacked` 为 `C:\r306\B`，仅对副本 `resources/app.asar` 做等长字节替换把 `huggingface.co`/`hf-mirror.com`/GitHub release 指到本机 dlproxy（`127.0.0.1:18150` / `127.0.0.2:1815`），下载 sensevoice-small（模型文件由 dlproxy 从本机已下载副本回源）。

| # | 用例 | 结果 | 证据 |
|---|---|---|---|
| F1 | `slow` 起下 → 切 `stall-hf`（首源停滞）→ 8s 提示「正在通过第 1/3 个源重试」→ 30s 跳源 → 「校验中…」→ 就绪 | PASS（第 2 源文案未测，见下） | `F-dlproxy.log`：`21:18:18.850 -> 206 … stallAfter=65536` → `21:18:48.870 stalled socket closed by client`（恰 30.0s）→ `21:18:48.878 GET 127.0.0.2:1815/… range=bytes=28377088- → 206`（**真实切源 + Range 续传**）；`F-phase-strings.json`：`+45.22s` `连接中断，正在通过第 1/3 个源重试（127.0.0.1:18150）…`（此时 source.index 仍为 1，未真切）→ `+68.09s` `下载完成，正在校验文件完整性…` |
| F1 | 第 2 源「正在通过第 2/3 个源重试」文案肉眼可见 | **未测** | 切源后本机 mirror 瞬间 206 应答，第 2 源状态在 250ms 轮询里都抓不到；真实网络下会持续到 TCP/TLS 建连完成，可见时长依赖网络，无法在本环境证明 |
| F2 | zh-TW / ja / ko 三语 retry + verifying 实际触发 | PASS | 均在 +8.1–8.3s 出现 retry、+31.3–31.6s 出现 verifying（`F2-*-phasepoll.log`）：<br>zh-TW `連線中斷，正在透過第 1/3 個來源重試（127.0.0.1:18150）…` / `下載完成，正在校驗檔案完整性…`（`shots/F2-zh-TW-source1-1-000.png`、`F2-zh-TW-verifying-2-000.png`）<br>ja `接続が中断されました。ソース 1/3（127.0.0.1:18150）で再試行中…` / `ダウンロード完了、ファイルの整合性を検証中…`（`shots/F2-ja-*.png`）<br>ko `연결이 끊어져 소스 1/3 (127.0.0.1:18150)로 다시 시도 중…` / `다운로드 완료, 파일 무결성 확인 중…`（`shots/F2-ko-*.png`） |
| F3 | 三源全 503 → 红色报错；切回 `ok` 点重试 → 就绪 | PASS | 报错 `下载失败：下载服务器暂时不可用（服务端错误），请稍后重试。`（`shots/F3-fail-all.png`）；恢复 `shots/F3-recovered.png`，`F3-portable-main.log` `local model sensevoice-small downloaded` |

体验评价：首源停滞 8s 后的 retry 文案能持续 ~22s，肉眼可感知；「校验中…」出现约 1–3s，可感知；只暴露 host 不暴露 path/token（截图核对）。整体三阶段体验达标。

## 6. c) toast 堆叠 / 导出 / 复制 / DPI（C1–C3）

| # | 用例 | 结果 | 证据 |
|---|---|---|---|
| C1 | 长路径导出成功 toast zh / en / ko（路径 132 字符、两级长目录） | PASS | 标题+按钮在首行、路径另起且完整不截断：zh `已保存 / 打开所在文件夹 / C:\r306\evidence\exports\very-long-folder-name-for-round-306-toast-truncation-check\another-nested-folder-with-a-long-name\C1-zh.txt`（`C1-zh-toast.txt`），en `Saved / Show in folder / …C1-en.txt`，ko `저장됨 / 폴더에서 보기 / …C1-ko.txt`（`shots/C1-ko-txt.png`，#274/#275 的 ko 截断未复现）；VTT 导出同样通过 |
| C1 | 「打开所在文件夹」action 可点 → Explorer 选中文件 | PASS | `shots/C1-en-explorer-selected.png` |
| C2 | Copy All 成功 | PASS（形式不符，见 P3-306-2） | 剪贴板 3 行正确（`C2-clipboard.txt`）；反馈为按钮文字变 **`Copied`**（`shots/C2-copy-success-visible.png`），**不是 toast** |
| C2 | Copy All 失败负例（CDP 覆写 `navigator.clipboard.writeText` 抛错） | 同上 | 按钮文字变 **`Copy failed, try again`**（`shots/C2-copy-failed-visible.png`），无 toast；重启后覆写消失 |
| C3 | 免按退出长 toast @100% DPI | PASS | `shots/A3-exit-001.png` |
| C3 | `learnInaccessible` 长 toast（autoLearn 开，目标 Monaco/VS Code） | **未测** | Chrome 新标签页与公开 Monaco playground 均未触发 `watchPastedText` 的 inaccessible 回调（可能 Chromium UIA 暴露了文本模式）；VS Code 未安装。仅 en 翻译字符串核对（`C3-accessibility-ko.txt`） |
| C3 | 125% / 150% DPI 截图 | **未测** | 按任务书尝试 `HKCU:\Control Panel\Desktop LogPixels=120` + `Win8DpiScaling=1` 并重登/重启应用，`window.devicePixelRatio` 仍为 1（`C3-dpi-after-relaunch.txt`）；RDP 会话内 DPI 由客户端决定。已还原注册表（`phase2-cleanup.json` `LogPixelsExists=false, Win8DpiScaling=0`） |

## 7. d) 统计与 cue（D1–D3，全部 PASS）

| # | 用例 | 结果 | 证据 |
|---|---|---|---|
| D3 | 混合中英 wav 后 `stats.savedMs` 增量 vs 公式 | PASS | 文本「今天下午3点，开会讨论speak type新版本的release计划，请大家准时参加」= 22 CJK 字 + 4 Latin/数字词；`P2-stats-calculation.json`：before 143600 → after 163400，**Δ=19,800 = 22×700 + 4×1100**（CJK 每字 60000/60−60000/200=700ms，Latin 每词 1500−400=1100ms）；`shots/P2-stats-before/after.png` |
| D1 | 旧格式 stats（无 `savedMs`，words=1000）启动 → legacy 回退随 UI 语言变化 | PASS（取整注记） | zh 界面显示「节省时间 11 分钟」（`D1-zh-home.txt`；legacy 1000 字×700ms=700,000ms=11.67min，`fmtDuration` `Math.floor` → 11），en 界面 `18 min`（1000 词×1100ms=18.3min）；随后听写一句写入 `savedMs`（`D1-legacy-plus-savedMs.json`） |
| D1 | Clear all → 全清零 | PASS | `D1-cleared-history.json`：`{"history":[],"stats":{"words":0,"durationMs":0,"sessions":0,"savedMs":0}}`；Home 归零 `shots/D1-clear-home.png` |
| D1 | 口径说明 zh/en 不看代码能否理解 | PASS | zh：「估算值，统计安装以来的全部听写（清空历史时归零）：中日韩内容按手打 60 字/分、口述 200 字/分，其他语言按 40 词/分、150 词/分——按每句内容的语言计速，与界面语言无关。」——信息完整；略长（见 P3-306-4 排版建议） |
| D2 | VTT 三点对照 `three-en.wav`（0.5/6.3/12.2s 起）\|Δ\|≤0.3s | PASS | `D2-three-en.vtt` vs ffmpeg silencedetect 有声区（`D2-silencedetect.txt`）：cue1 0.500–3.700 vs 0.649–3.578（−0.149/+0.122）；cue2 6.300–9.600 vs 6.483–9.413（−0.183/+0.187）；cue3 12.200–15.400 vs 12.318–15.247（−0.118/+0.153）。最大 \|Δ\|=0.188s |
| D2 | 纯静音 20s | PASS | Transcribe 显示 `No speech detected.`（`shots/D2-no-speech.png`），不崩、history 不增（`D2-silence-history.json`） |
| D2 | 首尾 3s 静音 fixture | PASS | `D2-padded.vtt` `00:00:02.900 --> 00:00:06.100` vs 有声 3.049–5.978，cue 收缩到有声区 ±0.15s，未拉伸到文件边界 |

## 8. f) 内存复核（int8 Phase 1 + fp32 B7）

方法：同一主进程 PID，`rss.ps1 -IntervalSec 10` 连续采样 + 每次松手后打标（`P2-memory-marks.csv`、`B7-rss.csv`）；15s/30s 长段各 3 次（`dictation finalize: durationMs=15874 / 30883`）。

| 检查点 | int8 PID 3156 RSS / Private（MB） | fp32 PID 3400 RSS / Private（MB） |
|---|---:|---:|
| 基线 | 844.6 / 794.4 | 2526.7 / 2360.2 |
| 15s #1 | 998.4 / 1045.2 | 2592.3 / 2428.8 |
| 15s #2 | 1056.8 / 1046.3 | 2611.6 / 2435.1 |
| 15s #3 | 1069.0 / 1044.5 | 2617.1 / 2432.0 |
| 30s #1 | 1168.2 / 1315.3 | 2722.2 / 2568.8 |
| 30s #2 | 1265.7 / 1317.5 | 2703.7 / 2565.3 |
| 30s #3 | 1217.2 / 1314.6 | 2704.3 / 2566.5 |

结论：Private bytes 在每个「时长档」首次出现时上一个台阶（int8：15s +250 MB、30s 再 +270 MB；fp32：+70 MB / +135 MB），同档第 2、3 次 **不再增长（±3 MB）**，RSS 抖动属工作集回收。属一次性扩容（推测为 sherpa 流式解码按最长音频扩容 buffer），**不是每段都涨，不立 P2**；304 §13.9 的疑虑关闭。仍建议 307 做 20 段×30s soak 确认长时无慢泄漏。

## 9. e) 悬浮条位置（E）

固定光标 × 三档矩阵（RightCtrl 按住，Notepad 光标分别在顶行 Ln1、中部、底行 Ln40 Col1；`panelpoll.ps1` 抓 460×150 面板坐标；`E-panelpoll.log`）：

| 光标 | auto | top | bottom |
|---|---|---|---|
| 顶行 | (410,518) 底 ✔ `E-auto-top.png` | (410,12) ✔ | (410,518) ✔ |
| 中部 | (410,518) 底 ✔ | (410,12) ✔ | (410,518) ✔ |
| 底行 Col1 | **(410,12) 顶 ✔ 避让** `E-auto-bottom.png` | (410,12) ✔ | (410,518) ✔ `E-bottom-bottom.png` |

- 重启记住：设 `top` → 关闭重开 → `speaktype.json panelPosition=top`（`E-persist-before/after.txt`）且面板仍在 (410,12)（`E-persist-top.png`）——PASS
- top 是否遮 Notepad 菜单：**不遮菜单**。窗口 (410,12) 高 150 是透明层，可见胶囊约在 y≈105–155、x≈535–745，压住的是 Notepad 文档第 4–6 行（`E-top-top.png`），菜单栏与标题栏可点；对顶部编辑的干扰是「盖住正文前几行」而非菜单（P3-306-5）。
- 免按段间重算：第 1 段光标顶行 → 面板底部 (410,518) ✔（`E-handsfree-top-start.png`）；段间点击 Notepad 底行 Ln40 **Col 150**（行尾）→ 第 2 段面板仍 (410,518)，盖住 Ln38–40 左半行文字（`E-handsfree-bottom-pinned.png`、`E-handsfree-bottom-next.png`）。`E-panelpoll.log` 显示两段之间面板经历 hide→re-show（`+139s <none>` → `+165s 460x150@(410,518)`），即 `broadcast()` 走了 `dockPanel()` 重算路径；重算后仍选底部是因为 `panelCaretZone()` 只取光标矩形 ±24px（x≈1190）与面板 x∈[410,870] **不相交**。所以：
  - 「段间重算是否执行」：结构上执行（代码路径 + hide/re-show 证据），但直接用例（段间把光标移到**底行行首**看是否切顶）本轮未构造 → **未测**，307 补。
  - 「auto 在光标行尾时不避让当前行」：**FAIL，立案 P2-306-1**（体验官视角：用户在底部长行末尾口述，面板压住自己正在写的行的左半段，这正是 auto 想避免的场景）。

## 10. 立案清单

### P2-306-1 悬浮条 `auto` 只按光标矩形判相交，光标在行尾/行中偏右时仍压住当前行
- 复现：Settings→General 悬浮条位置=auto；Notepad 最大化，窗口底部一行，光标放在该行第 100+ 列；RightCtrl 或 Alt+Q 说话 → 面板停在底部居中 (410,518)，覆盖该行左半段（`shots/E-handsfree-bottom-pinned.png`）。光标在同一行第 1 列时则正确切顶。
- 根因（源码）：`desktop/src/main/windows.ts` `dockPanel()` → `panelCaretZone()` 返回 `foregroundCaretRect()` 外扩 `CARET_CLEARANCE=24` 的矩形（宽≈50px），`intersects(caret, bounds)` 同时要求 x、y 相交；面板窗 460px 居中，光标 x 超出 [410,870]（本例 Col 150，x≈1190）就判不相交。设计只保护「光标点」，没保护「光标所在行」。
- 建议：相交判定改为只比 y（`caret.y-24 < bounds.y+bounds.height && caret.y+caret.height+24 > bounds.y`），即把 caret zone 横向扩展为整个工作区宽度；或用 `GetGUIThreadInfo.hwndCaret` 的窗口 client 矩形宽度作 zone 宽。改动 ≤5 行，无需新设置项。307 复测 §9 矩阵 + 行尾用例。
- 严重级理由：P2（功能在常见姿势下失效、影响可用性但有绕过：手动改 top/bottom）。

### P3-306-2 Copy All 成功/失败反馈是按钮内嵌文字，不是 toast（与 #396 描述不符）
- 复现：Transcribe 转写完成 → 点「复制全文」→ 按钮变 `Copied` 约 1.5s；用 CDP 让 `writeText` 抛错 → 按钮变 `Copy failed, try again`。无系统 toast 窗（panelpoll 520×120 未出现）。
- 根因：`desktop/src/renderer/src/pages/Transcribe.tsx` L161–171 `copyAll()`：`navigator.clipboard.writeText(allText).then(() => setCopied("ok"), () => setCopied("fail"))`，2s/4s 后复原 label（`transcribe.copied` / 失败文案），未调用主进程 toast；#396 描述「Copy All 成功/失败均有 toast」与实现不一致。
- 建议：二选一——(a) 接受内嵌反馈（体验官认为可接受、更不打扰）并更正 PR/文档描述；(b) 失败路径加 toast（失败时按钮文字 1.5s 后复原，用户可能没看到）。倾向 (b) 仅失败走 toast。

### P3-306-3 普通 Esc 取消无 main.log 记录
- 复现：RightCtrl 按住 → Esc → toast「已取消」，Notepad 无字；`main.log` 前后 diff 为空（`A4-before/after-main.log`）。
- 根因：`desktop/src/main/dictation.ts` `cancel()` 仅在排队 hold 被丢弃时 `log.info("dictation cancel: queued hold dropped")`，主路径不记日志；对照 `dictation finalize:` 每次都有。
- 建议：`cancel()` 入口加一行 `log.info(\`dictation cancel: byEsc=${byEsc} elapsedMs=…\`)`，方便用户反馈「按了 Esc 没反应」时定位。

### P3-306-4 fp32 提示未说明速度代价 + 模型下拉项是技术 ID，新用户难决策；hint 密度高
- 现状：fp32 提示（§4 B8）讲清了 2.5GB/2.7GB 与「句首吞字」，但没说速度（实测与 int8 同量级 434–504ms，可以直说）；下拉项 `sensevoice-small (234MB)` / `parakeet-tdt-0.6b-v3 (660MB)` / `parakeet-tdt-0.6b-v3-fp32 (2.5GB)` / `tiny/base/small-q5_1` 对普通用户等于乱码，只有选中后才出现说明；Home 口径说明与 fp32 提示在 820px 下各占 3–4 行（`shots/H-*-820-fp32.png`、`H-*-820-home.png`），排版不破但阅读负担重。
- 根因：`shared/localModels.ts` 只有 id+size 作为 option label；说明文案挂在 `settings.parakeetFp32Hint*` 等仅选中时显示。
- 建议：option label 加友好名（如「Parakeet 标准版 (660MB) — 英语+25 欧语，默认」「Parakeet 原精度 (2.5GB) — 修句首吞字，需 2.7GB 内存」「SenseVoice — 中/日/韩/粤/英」「Whisper base — 多语，整句识别」）；fp32 hint 补一句「识别速度与标准版相近」；Home 口径说明折叠到 (?) tooltip。

### P3-306-5 `top` 档压住文档前几行（第 4–6 行），auto 切顶时同样；是否需要「拖动记忆」
- 复现：panelPosition=top，Notepad 最大化 → 面板窗 (410,12)，可见胶囊压住正文第 4–6 行（`E-top-top.png`）；菜单栏/标题栏不受影响。
- 根因：`windows.ts` `PANEL_MARGIN=12` 固定贴工作区顶，未考虑前台窗口的标题栏/菜单栏高度，胶囊落在客户区上方正文处。
- 建议：先修 P2-306-1；top 档可考虑贴「前台窗口客户区顶部」而非屏幕顶（胶囊落在菜单栏下沿，正文全部可见）。是否需要「拖动记忆」——体验官意见：**暂不需要**，auto 修好后 bottom/top 两档已覆盖绝大多数场景，拖动记忆引入多显示器/分辨率变更后的失效问题，收益低。

### P3-306-6（记录）Home「节省时间」`Math.floor` 向下取整；npm 10 lock 漂移
- 700,000ms 显示 11 分钟而非 12（`lib/format.ts` `Math.floor(s/60)`），Home 其他卡片同规则，一致即可，建议 `Math.round`。
- npm 10.8.2 `npm install` 给 `package-lock.json` 根加 `hasInstallScript: true`，每台机器都会脏 `git status`；建议维护者重生成 lock 一次。

## 11. 环境还原核对（PASS）

| 项 | 结果 |
|---|---|
| 正式 `resources/app.asar` SHA-256 | `12D93BE43BE74404377CC9CF581AC3E200EC11213A1D109CEC02B022ADABB042`（与打包后初值一致，`phase2-final-hashes.json`） |
| 正式 `whisper-server.exe` SHA-256 | `9E581A4A2B7BD5AEC0993F5794FEA3D65AF2D7F5921CF51C2A4E4B5A3A464D89`（一致） |
| 模型文件 | sensevoice / parakeet int8 / fp32 / whisper base 保留在 `%APPDATA%\SpeakType\models`，B9 junction/VHD 已移除 |
| `speaktype.json` / `history.json` | 还原（`phase2-cleanup.json` `historyRestored=true`；uiLanguage=system、theme=dark、autoLearn/polish/remoteMic=off、panelPosition=auto、localModel=parakeet-tdt-0.6b-v3） |
| mock/helper 进程 | dlproxy / mock_llm / phone sim / pollers / rss 采样全部停止，`phase2-final-processes.json` `remainingTestProcesses=0`，SpeakType 与 whisper-server 已退出 |
| 系统 DPI | 100%（`LogPixels` 不存在、`Win8DpiScaling=0`） |
| 防火墙 / hosts | 未改 |
| 便携副本 B | `C:\r306\B` 保留在测试目录供复查，不在仓库内 |
| 秘密 | 所有保存文本中配对 URL token 均为 `[REDACTED]`（正则扫描 0 命中）；未涉及任何 cookie/API key |
| `git status` | 仅 `docs/reviews/round306.md`（新增）与 `.agents/skills/testing-speaktype-desktop/SKILL.md`（在 Round 305 节之前新增一节「Round 306 learnings」，与文件「新轮次在前」的顺序一致；工作区 CRLF+UTF-8 无 BOM 保持，607→624 行，0 个 LF-only 行；仓库内 blob 经 autocrlf 归一为 LF，与 HEAD 一致）；`package-lock.json` 漂移已还原 |

## 12. 测试过程记录（时间线）

1. 19:4x 读 SKILL.md Round 293/297–305 节；clone main → `a00783e`；`npm install`（postinstall 通过）→ typecheck → build → pack:dir 一次成功；记录正式 SHA。
2. 19:5x 搭测试基础设施：`rkey.ps1`（SendInput，INPUT 结构 40 字节校验）、`launch.ps1`（fake-mic + CDP 端口）、`mkwav.mjs`（msedge-tts 2.0.7 → ffmpeg 16k mono：en1/2/3、zh、ja、mixed、queue、long15/30、silence20、padded、three-en）、`cdp.mjs`、`panelpoll.ps1`、`rss.ps1`、`dlproxy.cjs`（ok/slow/stall-hf/stall-all/fail-all/mirror-503 + Range + 302/X-Linked-ETag）、`mock_llm.cjs`、`phone.mjs`、`patchasar.cjs`/`mkB.ps1`（副本 B）。303 fixture 取自 `git worktree` 分支 `review/round303-parakeet-ab`。
3. 19:58–20:20 **Phase 1（录屏 1）**：首启下载三模型 → A1–A9 → 手机麦 A10 b-①②③ → A11 端口竞态 → D3 混合中英 savedMs → int8 15s/30s×3 内存台阶。
4. 20:28–20:47 **Phase 2 上半（录屏 2）**：fp32 真源下载 B1、31% Cancel B2、续传完成、B3 尺寸/SHA、B4 三句、B5 8 fixture fp32 → 切 int8 → 8 fixture、B6 worker、B7 fp32 长段内存、B8 文案、B9 1GB VHD ENOSPC；E 悬浮条矩阵 + 免按 + 重启；C1 导出 zh/en/ko + 打开文件夹；C2 Copy All 成功/失败；C3 DPI 注册表尝试（失败还原）+ Monaco a11y 尝试；D1 legacy/Clear all；D2 VTT/静音/首尾静音。
5. 21:16–21:32 **Phase 2 下半**：副本 B + dlproxy：F1 slow→stall-hf 切源→校验；F2 zh-TW/ja/ko；F3 全源 503 → 恢复。
6. 21:3x H 自由发掘：五语（zh-CN/zh-TW/en/ja/ko）× 820/1280px × Home/General/语音(sensevoice/int8/fp32/whisper)/词典/Transcribe 共 80 张截图（`shots/H-*.png`）+ 文案导出（`H-*.txt`），无溢出/重叠；以新用户视角评估模型选择引导（§10 P3-306-4）。
7. 21:4x 还原：关应用、停 helper、还原 settings/history、核 SHA、注册表 DPI、删 VHD/junction；写本报告 + SKILL.md 追加一节；`git restore desktop/package-lock.json`。

## 13. 建议下一轮（307）验收点

1. **P2-306-1 复测**：auto 档 × Notepad 底行 Col1 / Col80 / Col150 × RightCtrl 与免按段间（段间把光标从顶行移到底行行首与行尾各一次），面板必须切顶；同时确认 top 档不再遮 Notepad 菜单（若采纳 P3-306-5 建议）。
2. **fp32 极短按住冷启动**：删除并重下 fp32 后按住 RightCtrl <1.5s 松手，测首句从松手到落字的真实冷延迟（本轮 5s 按住掩盖了 2.4GB 加载时间），并看面板是否有「模型加载中」反馈。
3. **第 2 源 retry 文案可见性**：dlproxy 给 mirror 加 3–5s 建连延迟（`stall-hf` + `mirror-delay`），证明「正在通过第 2/3 个源重试」肉眼可见且 index 正确。
4. **DPI 125%/150%**：在能真正改缩放的宿主（非 RDP 虚拟显示器，或用 `SetProcessDpiAwareness` 模拟）截 toast/面板；否则继续如实记未测，不要再花时间在注册表上。
5. **`learnInaccessible`**：安装 VS Code（或任何 UIA 不暴露 TextPattern 的编辑器）触发一次 8s 长 toast，核 zh/en/ko 三行排版。
6. **内存 soak**：fp32 与 int8 各 20 段×30s 免按连续听写 + `rss.ps1 -IntervalSec 10`，确认 Private 稳定在本轮台阶上（fp32 ≈2.57GB、int8 ≈1.32GB）。
7. **Copy All 反馈决策落地**（P3-306-2）：按 #396 描述改 toast 或更正描述，二者取一并复测失败负例。
8. **模型选择引导**（P3-306-4）：若采纳友好名，五语 820px 下拉项宽度需重跑 rowgeo 脚本（305 轮英文 820px 被长 option 撑坏的前车之鉴）。
9. **回归固定项**：RightCtrl/排队第二句（不同句）/Alt+Q/Esc（并检查新增 cancel 日志）/F8/深色/三模型各一句/手机麦 b-①②③/端口竞态 a-③。
