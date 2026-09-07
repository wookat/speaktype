# 第 134 轮体验官审查报告 —— #215 回归 + 历史导出×失败条目 + 免按×其他热键交互

- 审查日期：2026-08-17
- 基线：main@02cf09c（含 #214/#215/#216，`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案，观察 ×1。**

## ① #215 回归（全过）

- 制造失败条目（不可达云端 provider）→ 切回本地 → 历史页 Retry 成功 → **切到 Home 统计立即显示 322/20293，与 store 完全一致**（133 轮同操作 Home 停留在旧值）——广播修复生效【实测】。

## ② 专项 a：历史导出 × 失败条目（全过）

选择理由：failed 条目在 md 导出中的呈现从未专审。

- 含 1 条 failed 的 322 条历史 Export：导出文件恰 321 个条目、无任何 failed/错误文案残留——失败条目按源码注释设计被过滤，不会导出空文本行【实测+源码】。

## ③ 专项 b：免按 × persona 切换/改写键运行中交互（全过）

选择理由：Alt+Q 听写中按 Alt+数字/F8 的组合行为从未专审。

- 免按聆听中按 **Alt+2**：全局 persona 切换成功（config personaId=translator），会话不中断，后续句子照常落字【实测】。
- 落字条目与悬浮条徽标显示「To my boss」而非 translator：系测试机配置存在 **notepad.exe→boss 的 App 人设绑定**，appPersonaId 优先于全局人设——行为正确非缺陷（变量已隔离确认）【实测+源码】。
- 免按聆听中按 **F8（改写键）**：设计即退出免按，并弹明确 toast「Hands-free mode ended — Another hotkey was pressed…」，用户不会误以为还在听；退出后播放的语音不落字（已获明确退出提示，符合预期）【实测】。
- 悬浮条 **X 按钮**退出免按正常。观察①（文案微瑕，不立案）：X 点击退出复用「Another hotkey was pressed」文案，鼠标点击场景表述略不精确（~1 键可拆分文案，建议随他改顺带）。
- vadAutoStop=false 下空聆听每 10s 一轮、受 #207 30 轮兜底约束（本轮实测 11 轮内手动退出，无无限空听）【实测】。

## ④ 核心回归（全过）

- language=zh：RightCtrl 中文「我们明天去公园散步」全对；Alt+Q 免按英文「The review and the report are done today.」全对【实测】。

## 测毕清场

- SpeakType/notepad 进程 0；43117/18099 无监听；无 .part；failed-audio 空
- config/history/stats 由 round134-*.bak 整体还原（321 条）；persona 切换/伪 provider 配置随还原清除；导出测试文件已删
- 防火墙三 profiles OFF；repo 回 main、工作区干净
