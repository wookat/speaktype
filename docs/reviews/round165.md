# 第 165 轮体验官审查报告

- 日期：2026-08-17
- 基线：main@ae08eaf（含 #255/#256 punct 修复、#257 skill）
- 打包：`npm run pack:dir` 成功（round165\pack.log），产物 0.15.1
- 证据分级：【实测】打包运行时直接证据；【源码】源码检视；【推测】推断；【未验证】未执行

## 结论：P0=0，P1=0，P2=0，P3=0——零立案，观察 ×1，取证更正 ×1

## ① #255/#256 回归抽查【实测】全过（punct ON，Add-on ready 实拍）

- parakeet 高密度长句（longen.wav，25s）：$35,000、p.m.、单逗号全部完好，无重打；text 与 raw 仅差合法的 `under$35,000→under $35,000` 补空格（【源码】polish.ts ITN 空格修复，非标点模型）；log 无「punct worker started」——高密度文本在 needsPunctuation 门槛即被跳过，未送模型，164 轮 P2 消除。
- sensevoice-en 上轮失败样本（同音源）：**raw===text 逐字节相等**（含模型原生尾部「pm,.」原样保留）——「宁可少补也不重打」口径落实。
- 补充：Alt+Q 短英文句（8 词 1 句号，按新阈值仍会送模型）punct worker 启动后输出与 raw 一致无损坏——稀标点路径介入且不破坏。
- 取证更正：本轮最初用注入 `punctEnabled:true` 造开关态，实际设置键为 `enhancedPunct`【源码】，该次「通过」证据无效已作废；改用 UI 实开开关（Add-on ready 实拍）后重取全部证据。

## ② 专项：历史单条删除 Undo 链路【实测】全过

选择理由：历史页唯一「无后悔药」操作的撤销链路（10s 窗口、原位插回、单槽覆盖）从未运行时专审。

- 即删即撤：删除中间条目 → 底部「Entry deleted / Undo」栏出现 → 点 Undo → history.json 条数复原且**按原 index 原位插回**（非置顶）。
- 超时不可撤：删除后超过 10s 窗口，Undo 栏自动消失，条目永久删除（json 实证 15:56 条目未复原）——与 armUndoTimer(10000) 设计一致【源码】。
- 双删单槽：连删两条后点 Undo，仅最后删除的条目复原（原位），先删条目永久丢失——setUndoDel 单槽覆盖设计【源码】。观察①（不立案）：连删场景首条的撤销机会静默失效，属常见单槽 Undo 设计取舍；若要改进可提示「仅可撤销最近一次删除」。
- 键盘可达性：删除后焦点自动落 Undo 键【源码 requestAnimationFrame focus】。
- 原计划专项 b「设置重置边界」经源码排查不存在 Reset settings 入口（ModelTab/VoiceTab 的 reset 均为 preset/测试态复位），如实改记，不虚构测试。

## ③ 核心回归【实测】全过

- RightCtrl 中文（language=zh，sensevoice）：「我们明天去公园散步」1/1 全对。
- Alt+Q 英文（language=en）：「The review and the report are done today.」全对落字。

## 环境限制

- 真手机麦端到端、auto×粤语、云端 key、多显示器沿旧挂账【未验证】。

## 清场

- SpeakType/Notepad 进程停、43117/18099 无监听、无 .part、failed-audio 空。
- config/history 由 round165-*.bak 还原（history 321 条；本轮删除/撤销测试条目随还原消除）。
- 防火墙三 OFF；repo 回 main，git status 干净。
