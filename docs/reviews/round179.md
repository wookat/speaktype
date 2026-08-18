# 第 179 轮真实用户体验验证报告

- 日期：2026-08-18
- 基线：`main@3556f0d`（含 PR #267 取消 toast）
- 环境：Windows Server 2022 真机 GUI，win-unpacked 打包版 0.15.1，fake-mic（Chromium flags）+ 本地 SenseVoice-small 全链路，UI 语言 zh-CN，识别语言 zh，polishEnabled=false
- 方式：全程录屏 + 逐项 annotate；每项以「UI 截图 + main.log + history.json/导出文件」三重证据为准
- 证据等级标注：实测 / 源码确认 / 推断 / 未测

## 结论总览

| 等级 | 数量 |
| --- | --- |
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0（1 条产品建议，见专项 c） |

本轮全部执行项通过，无回归。唯一未覆盖项：历史页「改写（LLM）条目」混流体验（本机无可用 LLM，未测）。

## 核心回归

### 1. RightCtrl 中文落字 + 实时字幕（实测，通过）

- Notepad 聚焦 → 按住 RightCtrl ~8s 松开，正确落字：「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」。
- 录音中实时字幕胶囊出现且部分文本随时间增长（zoom 截图确认）。
- 日志：`dictation finalize: durationMs=8875 maxPeak=32767 voicedMs=4080`；history.json 新增第 1 条一致。

### 2. 录音中 Esc 取消 + #267 zh-CN 取消 toast（实测，通过）

- 按住 RightCtrl 录音中按 Esc：toast 实机显示「听写已取消 / 未落入任何文字」，与 zh-CN 文案（`toast.canceled`/`toast.canceledBody`）逐字一致。
- CDP 对 toast.html 轮询记录 `visible → hidden`，innerText=「听写已取消|未落入任何文字」（客观证据）。
- Notepad 内容不变（光标列号不动）、未弹出开始菜单（全屏截图）、main.log 无新 finalize、history 计数不变。#265/#266 的 Esc/Ctrl+Esc 防误触链路无回归。

## 专项

### a. Transcribe 页（实测，通过）

- 长音频：148s `long179.wav`（≥2 分钟要求）→ 8 段分段、时间戳单调递增、文本正确。
- Copy all：剪贴板 737 字符与 UI 结果一致（CRLF 归一后比对）。
- TXT 导出：UTF-8 文件与 Copy all 内容 CRLF 归一后逐字节相等（equal=True）。
- m4a：148s `long179.m4a` 同样 8 段转写成功，并捕获「转录中… 0% + 取消」进度行截图。
- 观察（非缺陷，备注）：本地热转写 ~2s/148s 音频，wav 首次转写进度行来不及展示；速度本身是优点，不建 P 级。

### b. 热词实际纠偏效果（实测——真实误识对照实验，通过）

- 构造易错词「杨梓瑄」（TTS 音频「请把这份报告发给杨梓瑄，让她今天下午确认一下」）。
- 加热词前：首次听写 raw/text 均为「杨**子轩**」——SenseVoice 稳定真实误识。
- Dictionary UI 加入「杨梓瑄」后重听同一音频：落字「杨**梓瑄**」；history[0] raw=杨子轩 / text=杨梓瑄，拼音纠偏分支确凿生效。
- 历史页「查看识别原文」正确显示删除线原文 + 红色纠正 diff。
- 实验全程 polishEnabled=false（排除 LLM 干扰）；测后已清空热词。

### c. 历史页来源区分与可用性（实测评估；改写条目未测）

- 现状：听写条目 meta =「时间 · 人设 · 秒数 · 本地离线」，文件转写条目 =「时间 · 文件名 · 时长」。凭 meta 可以区分来源，但无显式类型徽标/图标，也无来源筛选器；文件转写长文默认展开多行，占据大量纵向空间。
- 结论：可用性尚可，无 P 级缺陷；「来源筛选」在条目量大/混流后有价值。
- 产品建议（P3/建议向，非阻塞）：
  1. 条目加来源图标或 badge（听写/文件转写/改写）；
  2. 搜索框旁加来源筛选下拉；
  3. 文件转写卡片默认折叠。
- 改写（LLM）条目混流：未测（本机无可用 LLM）。

### d. zh-CN UI 取消 toast + 设置页 Speech 标签抽查（实测，通过）

- 取消 toast 中文文案实机确认见核心回归第 2 项。
- Settings→语音识别 标签整页滚动两屏抽查：未发现缺翻/错位；仅 SenseVoice、Parakeet、OpenAI 兼容、Whisper 等专有名词保留拉丁字母（合理）；「识别语言」下拉值为「中文」。

## 限制与未测项

- 改写（LLM）历史条目混流体验：未测（无 LLM 凭据/本轮未起 mock）。
- 本机无物理音频设备，全部经 Chromium fake-mic 路径；真实麦克风路径未在本轮覆盖。

## 纪律核对

- 未开防火墙、未动 hosts、未提交 secrets、未改产品源码。
- 测试残留（导出文件、transcribe-last.json、热词、进程）已清理；`git status` 干净（仅本报告与 SKILL.md 测试经验追加）。
