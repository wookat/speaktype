# 第 83 轮体验官审查报告 — 转录进历史心智 + 完成时间显示 + 历史操作回归

- 基线：main @ `97a2a63`（含 #153/#154/#155），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022；防火墙三 profile 全程 OFF；测毕清场（见文末）
- 口径：【实测】= 打包版运行实证；【源码】= 代码核对；【推测/未验证】= 如实标注

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 1 |

## ① 转录进历史的用户心智【实测】

- **混排清晰度合格**：转录条目「06:20 · phone.wav · 4s」，听写条目「08:31 · To my boss · 4s · Local offline」（实拍）。两点天然区分：persona 位是带扩展名的文件名、转录条目无 provider 徽标。文件名必带扩展名，误认成听写的概率低——可用；如要更醒目可加一个小图标/「转录」徽标（观察-1，不立案）。
- **时长语义**：转录条目的 4s 是音频时长而非录音时长【源码 durationMs=samples/SR】，与听写口径不同但直觉一致（都回答"这条内容多长"），不立案。
- **统计口径正确**【实测+源码】：转录前后 stats 逐字段一致（words=20284/durationMs=2438824/sessions=321 不变）；addStats 仅在 dictation.ts 调用，转录路径只 addHistory 不计统计——「节省时间」按打字速度折算只对听写成立，口径符合预期。
- **编辑触发学词**【实测+源码】：历史页 Correct 保存仅走 history:correct→updateHistoryItem，无论听写还是转录条目都**不触发** auto-learn（学词只在 watchedit 落字后监听路径）；实测编辑转录条目改词后词典/日志均无学词动作，raw 保留出现「Show raw transcript」。转录与听写行为一致、无特殊分叉，合理不立案。

### P3-①【实测】历史搜索不覆盖文件名：搜「phone.wav」零命中

- 复现：转录 phone.wav 进历史 → 历史页搜「phone.wav」→ 「No matches for this search.」（实拍）；搜正文「microphone」正常命中同一条。
- 根因【源码】：History.tsx 过滤只查 `h.text` 与 `h.raw`，不查 `personaName`——而文件名正是转录条目最自然的检索键（#153 的卖点就是"旧转录可找回"，用户记得的往往是文件名而不是内容原词）。
- 修法 1 行：过滤条件补 `|| h.personaName.toLowerCase().includes(q)`。副作用评估：听写条目 personaName 是人设名，搜人设名列出该人设的所有听写也是合理行为。

## ② 完成时间显示【实测】

- en：「1 segments · phone.wav · 8/16/2026, 6:20:18 AM」；zh：「共 1 段 phone.wav · 2026/8/16 06:21:39」——`toLocaleString(uiLanguage)` 本地化格式正确，light/dark 双主题排版正常（实拍）。ja/ko/繁为同一 BCP47 路径【源码】，未逐一实拍。
- **恢复态区分评估**：加时间戳后，隔天再开应用能看出「这是昨天转的」，第 82 轮观察-1 诉求已满足；恢复态与刚完成态仍无显式「已恢复」标记，但时间+文件名已足够定位，不再追加立案。

## ③ 历史操作与核心回归【实测】

- **编辑**：转录条目 Correct→改词→Save 生效，raw 保留可展开对照。
- **删除**：单击即删、无确认无 Undo——与听写条目行为一致；转录条目内容量可能大得多，误删成本更高，但最新一条仍可回转录页找回（transcribe-last.json）。观察-2（不立案）：若做，删除后 5 秒 Undo toast 是通用改进，听写/转录同收益。
- **转完即时刷新（#154 回归）**：转录完成后切到历史页，新条目已在列表顶部，无需重启（实拍）。
- **核心链路**：RightCtrl 中文「今天下午3点开会，预算是5200元」（sensevoice+ITN）+ Alt+Q 免按「我们明天去公园散步」双双准确落 Notepad（实拍）。

## 清场记录

- transcribe-last.json 已删；配置/历史从备份还原（uiLanguage/theme/model 测试改动与测试条目一并回滚）。
- SpeakType 进程 0；无 .part；43117 端口无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. P3-①（搜索补 personaName）落地回归，1 行。
2. 观察-2 删除 Undo toast 论证。
3. 云端成功路径补测（等 key）/ 真手机麦通道（挂账）。
