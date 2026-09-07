# 第 64 轮体验官审查（main @ 15c2f82，产品代码与 v0.13.0 相同；win-unpacked 自打包实测）

日期：2026-08-15。方法：pack:dir 最新 main，故障注入（临时改坏模型文件，测毕 SHA256 核对还原）+ 预置 failed-audio 编制 + UI 实操 + main.log 交叉核对。

## 结论总览

- keepFailedAudio 淘汰策略故障注入专测（20 段/7 天/50MB 三规则 + Retry 恢复链路）：**全部通过**。
- 深挖（五语言 UI 抽查 ja/zh-TW）：通过。
- 核心回归（RightCtrl 中英 + Alt+Q）：通过。
- **P2 新增 1 条**：sensevoice/parakeet（sherpa 进程内 worker）模型文件损坏时，启动预热即**整个应用静默崩溃退出**——无错误弹窗、无 log、无残留进程（见下）。
- P0/P1：无。

## 1. keepFailedAudio 淘汰策略（dictation.ts:50-93）

注入方式：ggml-tiny-q5_1.bin 改坏（modelReady 只查文件存在，localasr.ts:75-77，start 过检）→ whisper-server 启动失败 exited(3)（独立进程，主程序存活）→ finish 抛「Local recognition engine failed to start…」→ saveFailedAudio + prune。

### 1a 失败落盘 + 数量/7 天规则 ✅
- 预置 24 个近期 wav + 1 个 mtime 8 天前 old8d.wav（共 25）→ RightCtrl 失败一次。
- 实测：目录**恰 20 个**；新失败 wav（uuid 命名，249KB 真实录音）在；old8d.wav（7 天规则）与最旧 p20-p24（数量规则）全部删除；History 顶部红字 failed 条目含 error+audioFile+Retry。

### 1b 50MB 规则 ✅
- 预置 p1(小,-1min)+big(60MB,-2min)+p2(小,-3min) → 再失败一次。
- 实测：只剩**新失败 wav + p1**；big.wav（累计超 50MB）与更旧的 p2 均删除。

### 1c 恢复 + Retry 全链路 ✅
- 模型还原后 SHA256 与注入前一致（ggml：核对 True；sensevoice 同样核对 True）。
- History 点 failed 条目 Retry：原位变正常文本（whisper tiny 真实重识别）+「Retry succeeded — copied to clipboard」toast 实拍；对应 wav 自动删除。

## 2. P2 新增：sherpa 系模型损坏 → 应用启动即静默崩溃

- 复现：把 sensevoice model.int8.onnx 换成垃圾内容 → 启动 app → 21:51:19 `sherpa worker started` 后进程静默消失（Get-Process 空），无 crash log、无错误弹窗；用户视角=应用「打不开」且无任何提示。
- 根因推断：启动 3s 后 prewarmSherpa（index.ts:461-462）在 worker 线程里加载坏 onnx，sherpa-onnx 原生层 abort 直接杀死整个进程（非 JS 异常，绕过 worker.on("error")）。whisper 通道因跑在独立 whisper-server 进程而免疫（本轮 1a/1b 即用此差异注入）。
- 建议修法（供论证）：① 下载完成时记录各文件字节数/哈希，modelReady 校验大小而非仅存在性（localasr.ts:75-77，改动小收益大：损坏/截断文件直接判未下载，走重新下载引导）；② main 进程挂 process.on('exit')/crashReporter 落一行 log 便于诊断。优先级 P2：正常路径不会触发，但下载中断/磁盘损坏时用户面对的是无提示闪退。

## 3. 深挖：五语言 UI 抽查

- Interface language 切 日本語：侧栏/设置全量即时日文（ホーム/履歴/ペルソナ/辞書/設定、「失敗した録音を保持」等），无裸键名。
- 切 繁體中文：全量繁体（首頁/歷史記錄/人設/詞典/設定、「保留失敗錄音」）。切回 English 正常。通过。

## 4. 核心回归（Regression）

- RightCtrl 英（parakeet/en）落字 + Alt+Q 一轮进/退（finalize 7862/8001ms，退出干净）。
- RightCtrl 中（sensevoice/zh，还原后）落「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」Col 239（finalize 7879ms）——同时证明 sensevoice 模型完整还原可用。

## 下轮候选

1. P2 修复验证（modelReady 大小校验）若立项。
2. muteWhileRecording 真机实测（本机无音频输出端点）。
3. 真手机麦通道（缺真机）。
4. Onboarding 首次引导流（清空配置从零走一遍）。
