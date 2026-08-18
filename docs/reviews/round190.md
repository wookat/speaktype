# SpeakType 第 190 轮严格体验官报告

- 日期：2026-08-18
- 被测版本：main @ b50d0bb（含 PR #285：免按跨句保持麦克风采集 + 空闲 30s 回收录音窗口）
- 测试方式：本地打包实测（`npm --prefix desktop run typecheck / build / pack:dir` 全绿）→ 跑 `desktop\release\win-unpacked\SpeakType.exe`，假麦克风 flags（`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` + 循环 WAV），本地 OpenAI 兼容 mock ASR（127.0.0.1:8975），scancode SendInput 合成热键，CDP toast 轮询（可见性感知），recorder 进程 PID/CPU 采样，落字目标 Notepad，全程录屏

## 本轮范围

1. 补验第 189f 轮两处证据不足项：① Alt+Q 退出免按的「已退出免按」toast；② 免按会话内「录音时静音系统声音」跨句保持/退出解除
2. PR #285 行为回归：免按多句落字带句号、四个退出出口（Alt+Q / Esc / 静默约 1 分钟自动退出 / 长按热键打断）后麦克风停止 + 30s 窗口回收 + 回收后再录正常
3. 常规走查：文件转录页（此前 round 188 与 skill 覆盖清单均未含此面，故选之）

## 结论摘要

| # | 项目 | 结果 |
|---|------|------|
| 1a | Alt+Q 退出免按 toast | ❌ **P1 FAIL**（toast 不出现） |
| 1b | 录音时静音系统声音（跨句保持/退出解除） | ⏭ UNTESTED（本机无音频输出端点，mute 为 no-op） |
| 2a | 免按多句逐句落字、每句句号 | ✅ 通过 |
| 2b | Alt+Q 出口：麦克风停止 + 30s 回收 + 再录 | ✅ 通过 |
| 2c | Esc 出口：toast + 停麦 + 回收（PID 6948→5400）+ 再录 | ✅ 通过 |
| 2d | 静默 ~61s 自动退出：toast + 停麦 + 回收（4472→8144）+ 再录 | ✅ 通过 |
| 2e | 长按 RightCtrl 打断：toast + 停麦 + 回收（4404→2740）+ 再录 | ✅ 通过 |
| 2f | 回收后新免按会话（2 句均带句号）+ hold 听写 | ✅ 通过 |
| 3 | 文件转录页走查 | ✅ 整体通过；1 个 P3 导航小问题 |

## 发现

- **P1：Alt+Q 退出免按没有「免按模式已退出」toast**。用可见性感知的 CDP toast 轮询客观复核 3 次（同一 poller 抓到了 Esc / 长按打断 / 静默自动退出三个出口的 toast 以及 persona toast，工具本身可信）。根因（代码走读，未改代码）：`dictation.ts` 的 `toggleHandsFree()` 先置 `this.handsFree = false` 再调 `void this.stop()`，`stop()` 内的 toast 分支 `if (this.handsFree) … showToast(handsFreeEnd)` 对 Alt+Q 路径永远走不到。一行级修复建议：在 `toggleHandsFree()` 内直接 showToast，或清旗标前先弹。
  - 复现：启动免按（Alt+Q）→ 任意时刻再按 Alt+Q 退出 → 无退出 toast（Esc 退出则有）。
- **P3：文件转录页「去下载」跳转落点无按钮可点**。缺本地模型时报错清晰（红色内联「本地模型还没下载…」），但「去下载」跳到 设置→语音识别；当前服务商为 OpenAI 时该页没有任何「下载模型」按钮，需用户自己猜到先切换到「内置离线识别」才可见（切回离线后按钮确认存在，测后已还原设置）。
- 备注（非缺陷）：hold 模式中文句子落字**不带**句尾「。」是设计行为（`localCleanup` 的 keepCjkPeriod 仅 toggle/免按模式），免按句子全部带「。」符合 PR #285 要求。

## 各项断言与证据

- **1a — FAIL**：3 次 Alt+Q 退出均未捕获 toast（CDP 轮询 toast.html，含 `document.visibilityState` diff，排除「窗口隐藏残留上条消息」假阴/假阳）；对照组同一 poller 捕获 Esc/长按/静默三出口 toast。
- **1b — UNTESTED**：安装 AudioDeviceCmdlets 后 `Get-AudioDevice -List` 返回 0 设备、`Win32_SoundDevice` 为空，本 VM 无任何音频端点，VK_VOLUME_MUTE/静音逻辑无可观测效果；旁证：`%APPDATA%\SpeakType\muted-by-recording` 旗标全程未出现。需有真实音频输出设备的机器才能验收此项。
- **2a — 通过**：免按会话内 3+ 句逐句落字，mock ASR 每个 wav 循环恰好一次 POST，剪贴板 UTF-8 读回逐句核对句号。
- **2b–2e — 通过**：每个出口后 recorder（`--pcm-pipe` 子进程）CPU 时间不再增长（麦克风确已停止，如静默出口后恒定 0.156s）；>30s 后 recorder PID 更换（窗口回收，如 6948→5400、4472→8144、4404→2740）；随后 hold/免按再录均正常落字。静默自动退出 toast「长时间没检到人声，已自动停止聆听」于 61s 出现。
- **2f — 通过**：回收后新免按会话 2 句均带句号，hold 听写正常。
- **3 — 通过**：布局干净、拖放区可打开文件选择器、缺模型时红色内联报错清晰；仅上述 P3。

## 已测 / 未测

- 已测：免按跨句落字与句号、四出口停麦/回收/再录、回收后免按+hold、Alt+Q toast（FAIL）、文件转录页走查、typecheck/build/pack:dir。
- 未测：录音时静音系统声音（本机无音频端点）；NSIS 安装版；豆包真实激活链路（沿用 cookie 注入路径未在本轮重复）。

## 建议下一轮

1. 修复 P1 后回归 Alt+Q 退出 toast（连同其余三出口一起对照）。
2. 「去下载」跳转改为直接切到内置离线识别并滚动到下载卡片（P3）。
3. 在有真实音频输出设备的环境补验 muteWhileRecording 跨句保持/退出解除（第 189f 遗留，本轮仍无法观测）。

## 产物（测试机本地）

- 录屏：`C:\Users\Administrator\screencasts\rec-7dbad304-90c4-4271-8b50-deedbab55f30\rec-7dbad304-90c4-4271-8b50-deedbab55f30-edited.mp4`
- 关键截图：`C:\Users\Administrator\screenshots\`（长按打断+回收后落字 ss_zoom_0d4800f5、静默退出后再录 ss_zoom_8ec25e44、多句落字 ss_d5f1cfa0、文件转录页 ss_3be6e8f4、缺模型报错 ss_1439474d、「去下载」落点对照 ss_5d99e35c/ss_3b4acde7，另有 ss_3467d62a/ss_b34c5bfc/ss_bdc67fb4）
- 测试脚本/日志：`C:\Users\Administrator\tts\`（toastpoll44.cjs、rkey.ps1、recpid.ps1、clip.ps1、mock_whisper.mjs、round190_plan.md）
- 清场：所有 SpeakType/mock 进程已杀（剩 0）、`%APPDATA%\SpeakType` 已清、无 HKCU Run 残留。
