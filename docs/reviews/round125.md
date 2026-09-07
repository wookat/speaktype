# 第 125 轮体验官审查报告 —— #203 回归 + vadAutoStop 关 × 免按设计论证 + 双击 × 冲突矩阵

- 审查日期：2026-08-17
- 基线：main@822cc54（含 #203/#204，`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3×1（设计论证立案），观察 ×1。**

## ① #203 回归（全过）

- hold=F9 + toggle=F9：设置页免按下拉旁琥珀色警告「Same as the hold-to-talk or rewrite key — hands-free is disabled. Pick a different key.」实拍在位【实测】。
- 单击 F9 无任何反应（toggle 已禁用，无误触发）【实测】；按住 F9 听写正常起录/收尾落字【实测】。
- 恢复 toggle=Alt+Q 后警告消失口径【源码】，Alt+Q 免按正常落字【实测】（见 ③）。
- configure 中 toggleConflict → toggleKeycode=-1 + rewrite 同键同样命中【源码】；五语 settings.toggleKeyConflict 键齐全【源码】。

## ② 专项 a：vadAutoStop 关 × 免按长静音段设计论证（立案 P3-①）

**现状（124 轮 + 本轮运行时证据）**【实测】：

- 「Auto-stop on silence (hands-free)」关闭后，免按模式失去按句分段，只剩 50s 软上限/75s 硬上限兜底分段；两句相隔 40s 的语音合入同一 50s 段送 ASR，识别质量下降（第二句被吞成碎片"and are"），且**落字节奏从按句变成每 50 秒一批**。
- 设置 hint 写的是「recording ends automatically after you stop talking」——用户关它的心智是「说话停顿时别结束我的会话」，实际却换来了「按句落字消失 + 长静音填充段质量下降」双重代价，且无任何提示。

**设计论证**：该设置把「会话是否退出」与「是否按句分段落字」两件事耦合在一个开关里。建议解耦——免按模式始终按静音分段落字（与 vadAutoStop 开时一致），vadAutoStop 只控制「连续静默后是否退出会话」；hold 模式不受影响（hint 已写明 push-to-talk unaffected）。修改集中在 dictation.ts onFrame 的 `if (!settings.vadAutoStop) return;` 分支（免按路径改为不受该开关限制，仅退出逻辑读取它），估 ~5 行。次选方案：仅在 hint 补一句「关闭后免按每 ~50 秒才落一次字」。**按机制缺陷立案 P3-①，倾向主方案。**

## ③ 专项 b：双击免按 × 热键冲突矩阵（过，观察 ×1）

- doubleTap 开 + toggle 冲突：双击 F9 仍可进免按（doubleTap 路径不受 #203 禁用影响）【实测·124 轮+本轮】。
- doubleTap 关 + toggle 冲突：免按完全不可达，设置页警告「hands-free is disabled. Pick a different key.」已足够指引换键【实测+源码】。
- 观察①（不立案，候选微调）：toggle 被禁用时 **Home 页副标题仍写「tap F9 for hands-free mode」**（实拍），与禁用状态相悖；候选：Home 副标题在冲突时省略免按半句（~2 行）。

## ④ 核心回归（全过）

- RightCtrl 中文：「我明天去公园散步」准确落字【实测】（F9 hold 测试中两次丢字为 MediaPlayer 播放路径音量爬坡的测试摩擦，改回 round115 播放脚本即全对，与 124 轮观察②同类）。
- Alt+Q 免按："The review and the report are done today." 准确落字【实测】。

## 测毕清场

- SpeakType/notepad/node 进程 0；43117/18099 无监听；无 .part
- config/history 由 round125-*.bak 整体还原（321 条、hold=RightCtrl、toggle=Alt+Q、模型 parakeet）
- 防火墙三 profiles OFF；repo 回 main、工作区干净
