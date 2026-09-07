# 第 61 轮体验官审查（main @ ab35ecd，含 PR #121；本机 pack:dir 实测）

时间：2026-08-15 晚。环境：Windows 真机 + Chromium 假麦（无物理麦）。

## 1. PR #121 回归抽查 —— 🟢（附 1 条 P3 观察）

- rkey 同键连续 3 个 keydown（模拟 auto-repeat）进免按 + 3s 后独立单击 Alt+Q 退出，共 5 次采样：4 次恰一次 finalize（~5.3s），全程无 durationMs<100 的空 finalize——#121 挡板合并后行为与 PR 实测一致。
- ⚪ **P3 观察（待复现，1/5）**：首次采样（Notepad 刚启动 2s 内注入）出现「一次按键丢失」——重复 keydown 进免按后，3s 后的独立退出按键无效果，免按持续 36.7s 直到再按一次才退出（finalize durationMs=36684，正常无空 finalize）。与 #121 挡板失效形态不同（挡板失效应为短/空 finalize），疑为按键注入落在窗口切换/焦点抖动时段被吞，或 uiohook 偶发丢 keyup。后续 4 次采样均正常。建议下轮在稳态窗口下 20 次采样统计「按键丢失」率；若能复现，可在 hotkey 层加 keydown/keyup 配对日志定位。

## 2. 深挖一：History 导出 md + Clear all 确认流 —— 🟢

- 预置 2 条正常 + 1 条 status=failed（"Recognition failed: network error" 红字实拍）。
- Export：落 Downloads `speaktype-history-2026-08-15.md`，内容为 `- <locale时间> · <persona>` + 两空格缩进正文；**failed 条目未出现在导出文件**（History.tsx:54 filter 生效）；正常条目全量在。
- Clear all：点 Clear all → 出现「Clear all history?」+ 红色 Clear + Cancel；点 **Cancel** → 历史原样保留；再点 Clear all → Clear → 列表变空态「No history yet」，history.json `history: []`（stats 保留）。

## 3. 深挖二：Dictionary 300 上限 + 自学习 skip —— 🟢（附 1 条 P3 建议）

- 预置 300 个 hotwords（w001..w300），Dictionary 页显示 **300/300 hotwords**、Manage hotwords 全量渲染。
- RightCtrl 落一句 → Notepad 手改 "speak type"→"SpeakType" → watchedit 捕获：log `auto-learn: "speak type" -> "SpeakType"` 紧跟 `auto-learn skipped (dictionary full): "SpeakType"`；speaktype.json hotwords 仍 300、不含 SpeakType——上限保护生效，词典不超编。
- ⚪ **P3 建议**：词典满时自学习静默跳过（仅 log），用户不知道纠错没被学。建议满编 skip 时给一次性信息 toast（如「词典已满 300，未学入 "SpeakType"——可在词典页清理」），或 Dictionary 页 300/300 时显示提示条。修法论证：dictation.ts:523-525 skip 分支已有词与上下文，调 showToast 即可（信息型 4s，#121 已改）；为避免打扰可每会话只提示一次。

## 4. 核心链路回归 —— 🟢

- RightCtrl 英文（Parakeet）落 "Please open speak type and start dictation now.…"；RightCtrl 中文（SenseVoice）落「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」；Alt+Q 一轮见 1。

## P0-P3 汇总

| 级别 | 项 | 状态 |
| --- | --- | --- |
| P0/P1/P2 | 无新增 | — |
| P3 | 全局热键偶发「按键丢失」（1/5，注入落在窗口焦点抖动时段；非 #121 挡板问题，无空 finalize） | 新增，待复现 |
| P3 | 词典满 300 时自学习静默跳过，建议一次性 toast/词典页提示 | 新增建议 |
| P3(closed) | round60 P3-①（14ms 空 finalize）/P3-②（toast 2.6s）已由 #121 修复并实测回归 | 关闭 |

## 下轮候选

1. 稳态窗口 20 次热键采样统计「按键丢失」率（配 keydown/keyup 配对日志建议）。
2. 词典满编 skip 提示（若采纳 P3 建议则实测）。
3. Settings 页深挖（launchAtLogin/startMinimized/muteWhileRecording 未系统走查）。
4. 真手机麦真机通道（仍缺真机）。

## 附

round60 见 docs/reviews/round60.md；PR #121 实测证据见其 PR 评论。
