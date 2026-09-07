# 第 59 轮体验官审查（v0.13.0 正式版 main @ bf26f34，本机 pack:dir 实测）

时间：2026-08-15 晚。环境：Windows 真机 + Chromium 假麦（本机无物理麦），Edge 实测线上中转页。发版链路 A/B/C 结论见 PR #119 评论存档（0.12.0→0.13.0 覆盖升级、官网三资产、新装抽查全 🟢），本轮不重复。

## 1. 线上 relay 页面抽查（PR #118 线上回归）—— 🟢

- `https://speaktype.zalize.com/relay/m/<room>` 手机页可达，页面源码已含 #118 代码（`fails` 计数 + `talk.disabled = !m.connected`）——**#118 已部署上线**。
- 实测：电脑未开远程麦时，页面「已连接中转，等待电脑…」+「按住说话」灰禁用；桌面（官方中转）开启远程麦后数秒内变「已连接电脑」+ 按钮放开（紫可用）。与本地 wrangler 实测口径一致，线上回归通过。
- 真手机硬件仍缺——真机麦通道继续跳过（Edge 假麦等价）。

## 2. 深挖面一：自学习闭环（listen → 手改 → 学词 → 下次自动纠）—— 🟢

复现路径：词典空、Learn from corrections 开、Parakeet/en。RightCtrl 落 Notepad（含 "speak type"）→ 手工把 "speak type" 改成 "SpeakType" → 停 ~2s：
- main.log 出现 `auto-learn: "speak type" -> "SpeakType"`；Dictionary 页出现 SpeakType 词条（1/300）。
- 再次 RightCtrl 同语料 → 新落字为 **"Please open SpeakType and start dictation now."**（热词纠错闭环生效）。
- ⚪ 观察（P3）：学习成功的 toast 在 4 秒截屏时已消失，未捕获视觉；日志+词典+闭环足证功能。建议下轮专门掐 toast 时序（含 Undo 按钮可用性——学错词的一键回退路径本轮未测，列下轮候选）。

## 3. 深挖面二 + 回归：Alt+Q 免按模式 —— 🟢（附 1 条 P3 观察）

- 前置发现（非缺陷）：本机用户配置 hotkeyToggle=Alt+Space，按 Alt+Q 无反应属预期；经 Settings → Hands-free mode 下拉切到 Alt+Q 后立即生效（无需重启）。
- Alt+Q 进入：屏幕出现字幕浮层（实时识别文本滚动）+ 底部录音胶囊（Auto translate 徽标 + 波形）。
- Alt+Q 退出：录音收尾（log `dictation finalize: durationMs=48834 voicedMs=31300`），累计文本一次性落 Notepad（约 630 字符，含尾句号）。
- **P3 观察**：假麦 wav 无静音间隙时 48s 内未见「逐句自动落字」（Auto-stop on silence=2s 从未触发），全部文本在退出时一次落下。真实人声有停顿会分句，此为语料限制非缺陷；但长时间连续说话时「一次落 600+ 字符」的体验值得关注：可考虑加最大分段时长（如 30s 强制 finalize 一段），防止一次丢失过多（进程崩溃时该段全丢）。修法论证：autoStop 目前仅由 VAD 静音驱动（dictation.ts autoStop/vadAutoStop），加一个 maxSegmentMs 计时器与其共用 finalize 即可，不影响推流路径。

## 4. 核心链路回归 —— 🟢

- RightCtrl 英文一句（Parakeet/en）：落字正常（兼作 2 的基线）。
- RightCtrl 中文一句（SenseVoice/zh）：落「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」（Ln2 Col29），无尾句号符合 CJK 口径。
- Alt+Q 一轮：见 3。

## P0-P3 汇总

| 级别 | 项 | 状态 |
| --- | --- | --- |
| P0/P1/P2 | 无新增 | — |
| P3 | 免按模式无最大分段时长，连续长说全部文本退出时一次落下（崩溃即全丢）；建议 maxSegmentMs 强制分段 | 新增建议 |
| P3 | 自学习 toast 存续时间短（~3s 内消失），Undo 窗口可能太短，用户来不及点回退 | 待下轮实测 toast 时序确认 |

## 下轮候选

1. 自学习 toast/Undo 时序与误学回退路径实测（学一个错词点 Undo，验词典与已落文本双回滚）。
2. 免按模式真实停顿分句实测（带静音间隙 wav 验 2s 自动分段逐句落字 + 静音多轮自动退出）。
3. History 搜索/清空/失败重试（failed-audio 回收）面。
4. 真手机麦真机通道（仍缺真机，有条件再补）。

## 附：发版验收引用

v0.13.0 A/B/C（升级链路/官网/新装）全 🟢，证据与截图见 PR #119 评论及 test-report-v0.13.0.md。
