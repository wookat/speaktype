# SpeakType 第 188 轮严格体验官报告

- 日期：2026-08-18
- 被测版本：main @ a998459（含 PR #279 三档重置、PR #280 完全重置删除 legacy 目录 + NaN guard）
- 测试方式：从 a998459 打包 win-unpacked 构建，假麦克风 flags 启动，全程 GUI 操作 + 文件系统/日志断言；两段录屏留证

## 本轮范围

1. 第 187 轮三档重置独立验收（恢复默认设置 / 完全清除数据 / 删除本地模型），含 #280 两个回归点（legacy 目录删除、NaN guard）
2. 75 分钟 Alt+Q 免按延长 soak（round 186 P3 内存观察的深化）
3. round 186 未测项补测：英文听写句尾标点、物理 Alt 按住 pasteBlocked、NSIS 安装版冒烟
4. 自由走查（设置/模型/历史/人设/词典/转写）

## 结论摘要

| # | 项目 | 结果 |
|---|------|------|
| 1a | 恢复默认设置（#279） | ✅ 通过 |
| 1b | 完全清除数据 + legacy 目录删除（#280 回归点） | ✅ 通过 |
| 1c | 删除本地模型 + NaN guard（#280 回归点） | ✅ 通过 |
| 2 | 75 分钟 Alt+Q soak（557 finalize / 0 错误） | ✅ 功能通过；内存不收敛（P2） |
| 3a | 英文听写 + 句尾标点 | ✅ 通过 |
| 3b | 物理 Alt 按住 pasteBlocked | ✅ 通过（状态/日志断言） |
| 3c | NSIS 安装版冒烟 | ⏭ 跳过（本机无与被测 commit 一致的安装版） |
| 4 | 自由走查 | ✅ 无 P0/P1 |

## 发现（无 P0/P1）

- **P2：免按长时 soak 内存线性增长不收敛（疑似悬浮条/字幕 renderer 泄漏）**。75.5 分钟 soak 总 Private Memory 680→876 MB（+196 MB）；增长几乎全部集中在单个 renderer 进程（悬浮条/实时字幕窗口方向）：57→221 MB，≈2.2 MB/min 线性、无收敛迹象；主进程稳定在 ~430–440 MB。与 round 186 的 30 分钟 +128 MB 同源，本轮定位到具体进程类型。
- **P3：二次确认 4 秒超时偏短**（重置/删除模型/完全清除共用）：操作稍慢即静默回退重新武装，无任何提示。可考虑超时回退时给轻提示。

## 各项断言与证据

- **1a 恢复默认设置 — 通过**：改动 UI 语言（简中）、主题（深色）、按住阈值 120→300ms、VAD 静音 2000→5000ms、新增热词、顶层注入 doubaoAppKeyCache 假值。首次点击仅进入红色确认态且磁盘无变化，4 秒超时自动回退；双击执行后 settings 全部回默认（holdDelay=120、vadSilence=2000、theme/uiLang=system、lang=en、localModel=parakeet），UI 即时切回英文浅色；热词、doubaoAppKeyCache、history、models 全部保留。
- **1b 完全清除数据 — 通过**：预置 legacy 目录 `%APPDATA%\SpeakType 语音输入法`（含假 speaktype.json/history.json）；双击后应用自动重启进入全新引导（0 sessions / 首次四步引导 / 模型下载横幅），`SpeakType` 与 legacy 目录均被删除（Test-Path 均 False），新 main.log 首行 `no legacy userData to migrate` —— 未被旧目录迁移逻辑复活，#280 回归点通过。
- **1c 删除本地模型 — 通过**：两步确认正常；确认后 parakeet 目录 4 文件全删、sensevoice 不受波及，UI 变 "Not configured"/"Download model"，日志 `local model parakeet-tdt-0.6b-v3 deleted`，全程无 NaN。NaN guard 专项：手工构造 `encoder.int8.onnx.part` + `.part.json{"total":null}` 后 UI 显示纯 "Download model"，无 "Resume download (NaN% done)"。
- **2 soak — 功能通过 / 内存 P2**：08:51–10:06（75.5 分钟）Alt+Q 免按，循环中文 WAV；finalize 550 条（7→557），错误 0；进程数恒定 9；退出干净；Home 统计 560 sessions / 14557 words / 1h7min 与 finalize 一致；历史 560 条分页流畅。5 分钟粒度采样（总 Private MB）：680→708→728→723→732→755→776→788→798→804→821→829→843→847→855→876。
- **3a 英文听写 — 通过**：落字含逗号与句尾句号（内置标点规则；增强标点 AI 模型未开启，需 281MB 追加下载，未单独验证）。
- **3b pasteBlocked — 通过**：按住 RightCtrl 8.5s 口述→松开后立刻按住物理 Alt 3.5s：目标 Notepad 未落字，文本进入剪贴板 + 历史新增 1 条，finalize 正常。toast 存活期短未截到帧，按约定以状态/日志为主断言。
- **4 走查 — 通过**：Personas/Dictionary/Transcribe/Settings 各页渲染正常，无排版/文案缺陷。

## 已测 / 未测

- 已测：三档重置（首点不生效、4s 超时回退、双击执行）、legacy 目录删除、NaN guard、75min soak（内存/进程/finalize/错误）、英文听写标点、pasteBlocked、560 条历史分页、全页面走查。
- 未测：NSIS 安装版（本机无）；增强标点 AI 模型（需 281MB 下载，仅验证内置规则）；静音其他应用（本机无物理音频输出）；删除模型时"下载中禁止删除"保护分支（未构造下载中状态）。

## 建议下一轮

1. 悬浮条/字幕 renderer ≈2.2 MB/min 线性增长专项排查（开发侧可复现：免按+循环音频 30min 观察该 renderer PID）。
2. 增强标点 AI 模型（ct-transformer）下载 + 英文/中文对比验证。
3. 构造"下载中"状态验证 deleteLocalModel 的 downloading 保护分支。

## 产物（测试机本地）

- 录屏 1（三档重置+回归）：`C:\Users\Administrator\screencasts\rec-67d34f91-1a83-4707-ae8b-40008eea948d\rec-67d34f91-1a83-4707-ae8b-40008eea948d-edited.mp4`
- 录屏 2（soak 退出+走查）：`C:\Users\Administrator\screencasts\rec-a319a126-6ec7-455a-a7c2-4a13b9d4a3f2\rec-a319a126-6ec7-455a-a7c2-4a13b9d4a3f2-edited.mp4`
- soak 内存采样（30s 粒度、每进程 PID:MB 明细）：`C:\Users\Administrator\r188\memsamples.csv`
- 关键截图：`C:\Users\Administrator\screenshots\`（重置确认态 ss_a1f5668a、重置后回默认 ss_675ada8d、删除模型 ss_e29b22e5/ss_27263a2f、NaN guard ss_zoom_16f798c8、英文落字 ss_7f6de221、完全清除 ss_586b09ba、全新引导 ss_3bb670c6、soak ss_91a25d55/ss_1174d50b、历史分页 ss_66e12b28）
