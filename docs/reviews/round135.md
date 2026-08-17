# 第 135 轮体验官审查报告 —— muteWhileRecording 静音链路 + 悬浮条长字幕渲染边界

- 审查日期：2026-08-17
- 基线：main@d7b545c（`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3×1（含两个表现，同一根因）。**

## ① 专项 a：muteWhileRecording 系统静音链路

选择理由：「录音时静音其他应用」开关的实际系统音量行为从未专审（106 轮仅探测过静音探针基建）。用 CoreAudio GetMute/SetMute 探针实测（打包应用，开关开启）：

- 常规链路过：录音开始系统 muted=True → 松键落字后 muted=False，恢复干净【实测】。

**P3-① 立案：静音实现是无状态的 VOLUME_MUTE 键翻转，两个边界行为异常**【实测+源码】：
1. **系统已静音时行为反转**：用户先手动静音系统（muted=True）再录音 → 录音期间系统被**取消静音**（muted=False，其他应用声音在录音时外放，与功能意图完全相反），松键后又翻回静音。
2. **强杀/崩溃残留静音**：录音中（muted=True）强杀进程 → 系统永久停留在静音态，用户全系统无声，需手动恢复；应用重启也不修复。

根因：paste.ts toggleSystemMute 敲 VK_VOLUME_MUTE 翻转键，不读当前状态。修法建议：Windows 侧改用 IAudioEndpointVolume SetMute 显式置位（记录进入时原状态），并在启动时检查「上次是我们静音的」标志兜底恢复；已静音时直接跳过整个流程。

## ② 专项 b：悬浮条长字幕渲染边界（全过）

选择理由：129 轮仅顺带看过正常句，超长单句多行行为未专审。

- ~25 秒 340+ 字符英文长句（含 API/GitHub/$35,000/日期时间）：实时字幕逐词跟进、自动换行成多行块、超出 captionLines 上限后**自动滚动到最新字 + 顶部渐隐遮罩**（不露半截裁切文字，与源码注释设计一致）；识别全对含 ITN（$35,000、October 15th、3 pm）【实测】。
- 观察（不立案）：ASR 尾部偶有「,.」连续标点微瑕，属模型输出非 UI 问题。
- CJK-英混排超长字幕：本机无中文 TTS 音源无法构造长中文话音【未验证】（常规中文字幕多轮已验）。

## ③ 核心回归（全过）

- language=zh：RightCtrl 中文「我们明天去公园散步」全对；Alt+Q 免按英文「The review and the report are done today.」全对【实测】。

## 测毕清场

- SpeakType/notepad 进程 0；43117/18099 无监听；无 .part；failed-audio 空；系统静音态恢复 muted=False
- config/history 由 round135-*.bak 整体还原（321 条）；muteWhileRecording/language 测试改动随还原清除；测试 wav 留在 review 工作区未入库
- 防火墙三 profiles OFF；repo 回 main、工作区干净
