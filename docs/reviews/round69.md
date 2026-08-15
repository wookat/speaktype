# 第 69 轮体验官审查报告

- 基线：main @ 3902501（含 #128/#129）win-unpacked 自打包
- 角度：Settings→Speech 全状态走查、五语（en/zh-CN/zh-TW/ja/ko）下载与词典文案抽查、词典搜索边界、核心回归
- 证据：`C:\Users\Administrator\round69-evidence.md`；修复回归证据 PR #130 评论 + `C:\Users\Administrator\pr130-evidence.md`

## 立案（3 条 P3，无 P0-P2）——均已由 PR #130 修复并回归通过

1. **P3-1 缺失 vs 损坏文案口径不一致**：单件损坏显 Resume (99%)，单件整删（3/4 完好）却回落全量 Download。根因 `modelPartialPercent` 缺失文件只计 total 未置 hasProgress。修复：`got > 0` 时缺失/损坏均返回百分比；全新用户 got=0 仍走全量文案。回归：整删 encoder → Resume (2% done)；损坏 joiner → 99%；无模型态不误改。
2. **P3-2 词典无命中复用 history.noResults 语境不通**：zh/ja/ko 出现「记录/履歴/기록」字样。修复：新增五语 `dict.noResults` 专用键。回归：en/zh-CN/ja 实拍新文案，History 文案未动。
3. **P3-3 词典搜索大小写敏感且不 trim**：`speaktype`/` Speak` 搜不到 SpeakType。修复：query.trim().toLowerCase() 双侧不敏感。回归：小写/前导空格均命中。

## 走查通过项

- Speech 页状态机：Downloading（3%+进度条+按钮禁用）、Ready（✓+toast）、切模型（就绪↔未下载无残留）、失败红字（ACL Deny-Write 注入 → 「cannot write to the models folder」）。
- 五语 Home Resume 99% 按钮全部正确。
- 词典特殊字符 `+(` 不崩溃；Clear 全部 → 搜索框消失回真空态。
- 核心回归：RightCtrl 英（Parakeet）/中（SenseVoice）+ Alt+Q 一轮。

## 遗留/边界（非本轮立案）

- 损坏/缺失态引导条正文句式仍为「One-time download (~660MB)」（按钮已增量，观察项）。
- muteWhileRecording 需真声卡；真手机麦需真机。

## 清场

双模型 SHA 核对一致、ACL 移除、配置/历史还原、无 .part、进程 0、防火墙三 profile OFF。
