# 第 84 轮体验官审查报告 — 历史删除体验专项 + 组合操作走查 + persona 归因核实

- 基线：main @ `19bc000`（含 #156/#157），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022；防火墙三 profile 全程 OFF；测毕清场（见文末）
- 口径：【实测】= 打包版运行实证；【源码】= 代码核对；【推测/未验证】= 如实标注

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 1 |

## ① 历史删除体验专项【实测】

### 现状与一致性对比

| 操作 | 现状交互 | 恢复手段 |
|---|---|---|
| 单条 Delete（听写/转录同口径） | 单击即删，无确认、无 Undo（实拍） | 无；转录条目仅当它是最近一条时可回转录页找回（transcribe-last.json 兜底） |
| Clear all | 两步内联确认「Clear all history? Clear / Cancel」（实拍） | 确认前可 Cancel |
| 自学习学词 | 学词后 toast 带 Undo 按钮，可整批撤销 | Undo 即回滚词典与条目文本 |

- 误删场景实测：搜索过滤态下单击转录条目 Delete → 立即消失、无任何挽回入口；该条目全文（可能是几十分钟音频的转录）随手即失。听写条目单条价值低（一句话），转录条目价值密度高得多，同一交互的风险不对称。
- **一致性论证**：产品已有两处「破坏性操作给后悔药」先例（Clear all 确认、学词 Undo），单条删除是目前唯一无任何防误触的破坏性操作，交互语言不一致。

### P3-①【实测+论证】单条删除无确认无 Undo，转录条目误删成本高

- 建议取舍：**Undo toast 优于两步确认**——确认框对高频低价值的听写删除是打扰（用户批量清理时每条点两下），Undo 对两类条目都零摩擦；且应用已有 toast 基建与「学词 Undo」交互先例，心智一致。
- 修法建议（~25 行）：Delete 即从列表移除但暂存条目与原位索引，toast「已删除 · 撤销」5 秒；点撤销原位插回（含 raw/audioFile 引用）；超时或再删下一条时真正落盘。Clear all 保持现状两步确认不动。

## ② 搜索+删除+编辑组合操作【实测】

- 过滤态（搜「phone.wav」，#156 personaName 命中）下 Correct 编辑：改词保存后过滤保持、条目仍在命中列表、raw 保留「查看识别原文」；编辑不动 personaName，**编辑后再搜文件名仍命中**。
- 过滤态下 Delete：条目移除后过滤保持，空态正确显示「No matches for this search.」，Export 按钮随 0 结果隐藏，Clear all 仍可用——列表与过滤维持正确，无残影无错位。

## ③ persona 归因核实：非缺陷，规则命中即记录属正确设计【实测+源码】

- 复现：Home 当前人设「To my partner」，配置含规则 notepad.exe→boss（appPersonas）。记事本前台 RightCtrl 听写 → 历史条目记「To my boss」（实拍）；SpeakType 自身前台听写 → 记「To my partner」。
- 【源码】dictation.ts 起录时 `personaForActiveApp(appPersonas)` 按前台进程名/标题先命中先用，落历史 `personaName = 规则命中 ?? 全局人设`；Home 只显示全局手动人设。测试代理看到的「Home=To my boss、条目=Auto translate」即其当时配置有命中 translator 的规则所致【推测：其运行时配置未留存】，机制本身正确，**不立案**。
- 观察（不立案）：polish 未配置时规则仍记录命中人设名（文字实际未被润色），人设页已有 appRulesNoPolish 提示，心智风险低。

## ④ 全局回归【实测】

- 核心链路：RightCtrl 中文「今天下午3点开会，预算是5200元」（sensevoice+ITN）+ Alt+Q 免按「我们明天去公园散步」均准确（历史实拍）；英文 RightCtrl 落 Notepad 逐字准确（③ 的复现即回归）。
- 历史页 en/light、en/dark、zh/dark 三态排版正常（实拍）；繁/ja/ko 本轮无新键【源码】。观察（既有行为，不立案）：personaName 按记录时 UI 语言存文本，zh 界面下旧条目仍显示「To my boss」。

## 清场记录

- transcribe-last.json 已删；配置/历史从备份还原（语言/主题/模型改动与测试条目一并回滚）。
- SpeakType 进程 0；无 .part；43117 端口无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. P3-①（删除 Undo toast，~25 行）落地回归。
2. 云端成功路径补测（等 key）/ 真手机麦通道（挂账）。
