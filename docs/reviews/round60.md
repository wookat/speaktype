# 第 60 轮体验官审查（main @ 3382513，含 PR #120；本机 pack:dir 实测）

时间：2026-08-15 晚。环境：Windows 真机 + Chromium 假麦（无物理麦）。上轮 round59 遗留 P3-②（自学习 Undo 时序）本轮已实测收口。

## 1. PR #120 回归抽查 —— 🟢

- 无缝循环语料 Alt+Q 免按 ~60s：log `dictation finalize: durationMs=52351`（∈50-75s 窗口）分段落字，免按不退、字幕重滚。#120 合并后行为与 PR 实测一致。
- ⚪ 一次性 flake（P3，未复现）：本轮首次 Alt+Q 后 log 出现 `finalize durationMs=14 maxPeak=0 voicedMs=0` 且免按未进入，重按一次即正常。复现率 1/5+，疑似 toggle 启动竞态（start 后立即 finalize），建议后续留意 `durationMs<100` 的 finalize 采样。

## 2. 自学习 Undo 时序（round59 P3-② 收口）—— 🟢（附结论：6s 足够）

- 单词 Undo：手改学词 toast（带 Undo 按钮，停留 6s、悬停暂停）内点 Undo → 「Undone …removed from dictionary」toast、speaktype.json 词典移除该词、历史条目文本回滚原词。实测通过。
- 批量合一 Undo：一次停顿改两处 → 一条 toast 列出两词（"immediatelyPlease, opened"）→ 点一次 Undo → 两词均移出词典 + 历史双回滚。实测通过。
- 体验结论：6s+悬停暂停的时序对人手足够（本机自动化前两次点击超时未命中系操作延迟，非产品问题）；round59 P3-② 关闭。

## 3. 深挖一：History 搜索/失败重试 —— 🟢

- 预置 status=failed 条目（error="network error"+留存 wav）：History 页红字显示「Recognition failed: network error」+ Retry 按钮。
- 搜索：输入 "Preopenspeak" 过滤到仅 1 条；乱串 "zzqq" 显示空态「No matches for this search.」。
- Retry：点击后条目原位变为正常文本 "Good morning everyone."（重跑本地 ASR），failed-audio 目录 wav 自动删除、条目 status/audioFile 清空。全链路通过。

## 4. 深挖二：Persona 热键 Alt+1..9 —— 🟢（附 1 条 P3 观察）

- Alt+2/Alt+3/Alt+1 均即时切换（personaId translator/boss/default 逐一验证），toast「Persona Auto translate (Alt+2)」实拍；Home 页 Current persona 同步。
- **P3 观察**：无操作按钮的 toast 仅停留 2.6s（index.ts:124），信息型提示（persona 切换/已撤销等）偏短——用户余光瞥到再看已消失。建议信息型 toast 至少 3.5-4s，或与带按钮 toast 统一 duration 参数由调用方指定。修法论证：showToast 已支持 durationMs 形参，仅需在 persona/undone 等调用点传 4000，风险为零。

## 5. 核心链路回归 —— 🟢

- RightCtrl 英文（Parakeet）+ 中文（SenseVoice「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」）各一句落字正常；Alt+Q 一轮见 1。

## P0-P3 汇总

| 级别 | 项 | 状态 |
| --- | --- | --- |
| P0/P1/P2 | 无新增 | — |
| P3 | Alt+Q 免按偶发 14ms 空 finalize、未进入聆听（1 次，重按即好，疑似启动竞态） | 新增，待复现 |
| P3 | 信息型 toast 2.6s 偏短，建议 4s（showToast 已有 durationMs 形参，调用点传参即可） | 新增建议 |
| P3(closed) | round59 P3-② 自学习 Undo 时序 | 实测通过关闭 |

## 下轮候选

1. Alt+Q 启动竞态复现（连续 20 次 toggle 采样 durationMs<100 比例）。
2. History 导出 md 全量走查（含 failed 条目排除、时间戳 locale 已验）与 Clear all 确认流。
3. Dictionary 300 上限边界与自学习 skip 提示。
4. 真手机麦真机通道（仍缺真机）。

## 附

round59 见 docs/reviews/round59.md；PR #120 实测证据见其 PR 评论。
