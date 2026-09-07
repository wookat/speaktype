# 第 63 轮体验官审查（main @ 3759753，含 PR #123；win-unpacked 自打包实测）

日期：2026-08-15。方法：pack:dir 最新 main，fake-audio + rkey 注入 + UI 实操 + main.log 交叉核对。

## 结论总览

- PR #123 回归抽查（3 行档溢出顶部渐隐）：通过。
- 深挖一（Theme 深色模式）：通过。
- 深挖二（captionLines 6 行档）：通过。
- 核心回归（RightCtrl 中英 + Alt+Q）：通过。
- P0/P1/P2：无新增。P3：无新增产品问题；2 条测试环境限制如实记录（见下）。

## 1. PR #123 回归抽查（Regression）

- 3 行档免按 ~14s 溢出滚动后 zoom 实拍：顶部第一行渐隐淡出、无半截裁切字（与 round62 旧版实拍对照可区分）。通过。

## 2. 深挖一：Theme 深色模式（GeneralTab.tsx:236-255）

- Settings→Theme 下拉选 Dark：主窗**即时**整体切深色（侧栏/卡片深灰、文字浅色），hint 变 "Always uses the dark look, regardless of the Windows setting."；Home 页统计卡/引导卡/persona 卡同步深色。
- 切回 Light：即时恢复浅色；重启后主题持久化正确。
- 判定：theme 三态切换即时生效、无需重启、跨页一致。通过。

## 3. 深挖二：captionLines 6 行档

- Settings 切 Caption height=6 lines（即时生效）：
  - 未溢出段（~25s，5 行文本）：浮层按内容自适应到 5 行、**无顶部遮罩**、首行完整不透明——未溢出不加 mask 分支在 6 行档同样正确；
  - 溢出后（第二段 ~28s 长文）：浮层约 6 行高（明显高于 3 行档 73px），顶部**无半截裁切字**（#123 遮罩把裁切残行淡至不可见）。
- 期间顺带确认 #120 免按 50s 分段在 6 行档下正常（52817/52797ms 两次分段落字、字幕重开）。通过。

## 4. 核心回归（Regression）

- RightCtrl 英文（parakeet/en）：落字 Col 1943，finalize durationMs=7874。
- RightCtrl 中文（sensevoice/zh）：落「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」Col 1952，finalize durationMs=7880。
- Alt+Q：本轮 3 次进/退全部干净（1 次含 50s 双分段长跑）。

## 5. 测试环境限制（如实记录，非产品问题）

- **muteWhileRecording 本机不可测**：本测试机无音频输出端点（CoreAudio GetDefaultAudioEndpoint→GetMute 报 0x80070490 Element not found），toggleSystemMute 敲的 VK_VOLUME_MUTE 无处生效、也无法查询静音态。需带真实声卡/音箱的机器实测，列真机候选。
- **keepFailedAudio 淘汰策略（20 段/7 天/50MB）不可测**：pruneFailedAudio 仅在 finish 阶段真实识别失败落盘时触发（dictation.ts:605-621）；start 阶段模型缺失在录音前即抛错不落盘。本机模型齐全、离线 ASR 稳定，无法可靠制造 finish 期失败（断网不影响本地 ASR）。修法上无需改动；验证需故障注入手段（如临时损坏模型文件后录音），风险较高，暂列候选由产品定夺是否值得专测。

## 下轮候选

1. muteWhileRecording 真机实测（需音频输出端点）。
2. keepFailedAudio 淘汰策略故障注入实测（临时改坏 sherpa 模型文件制造 finish 失败 → 预置 25 段 wav 验 prune 到 20 段/删 7 天前旧件）。
3. 真手机麦通道（仍缺真机）。
4. 五语言 UI 抽查（ja/ko/zh-TW 界面各一屏实拍）。
