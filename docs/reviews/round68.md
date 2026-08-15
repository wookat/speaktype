# 第 68 轮审查报告（PR #128 修复回归）

- 基线：main @ dc8cfee（PR #128 合并前分支 fix/round67-p3s @ b8828d7 实测）
- 测试方式：win-unpacked 自打包 + Parakeet joiner 损坏注入 + 伪造 .part + 词典 UI 走查 + 核心回归
- 证据：PR #128 评论 + `C:\Users\Administrator\pr128-evidence.md`

## 本轮目标

回归第 67 轮两个 P3 的修复（PR #128）：

1. 单文件损坏时下载按钮显示真实剩余进度（`modelPartialPercent()` 损坏/缺失文件按 expected 计）。
2. 词典搜索无命中区分空态（有词无命中显示 `history.noResults`）。

## 结果（A–E 全 🟢）

| 项 | 结论 |
| --- | --- |
| A 损坏单件（17B 垃圾 joiner）→ Home/Settings 按钮 **Resume download (99% done)**；点击 8 秒仅重下 6MB joiner，其余三件 mtime 不变、SHA 一致 | 🟢 |
| B 无模型 → 仍全量 Download + ~660MB 文案，无 Resume 误显 | 🟢 |
| C 伪造 .part（100MB/234MB）→ Resume download (43% done)，原续传文案逻辑保留 | 🟢 |
| D 词典真空「No hotwords yet」；有词搜索无命中 →「No matches for this search.」；命中/删除正常 | 🟢 |
| E 核心回归：RightCtrl 英（Parakeet）/中（SenseVoice）+ Alt+Q 一轮 | 🟢 |

## 立案

- P0/P1/P2：0。
- 观察项（非缺陷，可选优化）：损坏单件时引导条正文句式仍为「One-time download (~660MB). After that…」，仅按钮已改为增量提示。按钮是主要行动点，暂不立案。

## 备注

- C 项采用伪造 .part（真实前缀 + total 元数据）驱动，方法已沉淀进 skill（PR #129）。
- 清场完成：双模型 SHA 核对一致、配置/历史还原、无 .part、进程 0、防火墙三 profile OFF。
