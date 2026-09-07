# 第 126 轮体验官审查报告 —— #205 回归 + 历史搜索/编辑/删除 Undo 组合态 + 两项新立案

- 审查日期：2026-08-17
- 基线：main@49a5b56（含 #205/#206，`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3×2。**

## ① #205 回归（全过）

- vadAutoStop **OFF**：免按（F10）连说两句（间隔 ~15s）**按句各自落字**（history 两条独立、每句说完 ~2s finalize），会话跨静默持续不自退，手动一击退出正常【实测】。
- vadAutoStop **ON**：按句落字后，连续 6 轮 ×10s 无人声自动退出（log 6 条空 finalize 后停，悬浮条消失）【实测】。
- Home 副标题冲突省略（观察① 落地）：toggle 正常时副标题含免按半句、冲突禁用时省略【源码】；125 轮实拍冲突态副标题曾含 F9 提示，本轮源码确认已改。

## ② 新立案

**P3-① 应用启动后第一次 Alt+组合热键被吞**【实测，注入键 5/5 重现】

- 复现：启动打包应用（等 15s 就绪）→ 第一次按 Alt+Q → 无任何反应（无悬浮条/无日志/无 toast）；紧接着第二次 Alt+Q 正常进免按。
- 判别矩阵：先敲一次任意键（如 Shift 空击）再按 Alt+Q → 正常；首键为 RightCtrl 按住听写 → 正常；toggle 设 F10（无 Alt）首击 → 正常。**仅 Alt 修饰组合的首次触发受影响**，Alt+1..9 人设切换同路径依赖 ev.altKey【源码】疑似同受影响【未验证】。
- 影响：开机自启后用户第一动作若是 Alt+Q（或人设热键）会静默失败，需重按。根因【推测】：uiohook 修饰键状态在进程首个 Alt 事件时未同步（ev.altKey=false 使 toggle 分支不命中）。修法候选：configure 后主动同步一次修饰键状态，或 toggle 判定回退到 GetAsyncKeyState 双查。
- 环境限制：本轮为 keybd_event 注入键复现，真实键盘【未验证】。

**P3-② vadAutoStop OFF 时免按空聆听无限续，忘关麦克风保护失效**【实测】

- #205 把静默轮退出计数改为仅 vadAutoStop ON 时累计（`silent && getSettings().vadAutoStop`），OFF 时免按在无人声状态下**每 10s 一轮空 finalize 无限循环**（实测连续 5+ 轮 00:33:52→00:34:32… 直至手动退出），HANDS_FREE_MAX_SILENT_ROUNDS 原注释「避免忘关后麦克风常开」的保护在该配置下完全失效，且 log 每 10s 增一行。
- 论证：「不自动退出」的用户预期是「说话间隔长也别踢我」，不等于「彻底不设防」。建议 OFF 时仍保留一个宽松的绝对上限（如 30 轮 ≈5 分钟无人声才退出并 toast 告知），兼顾两者。

## ③ 专项 c：历史搜索 + 编辑 + 删除 Undo 组合态（全过）

- 搜索「公园」过滤到 1 条 → 过滤态 Correct 改「我明→我明天」保存 → 内容更新且过滤保持、改动条目正确【实测·实拍】。
- 搜索「review and the report」3 条 → 过滤态 Delete 中间条（10s） → 恰删该条、余 2 条不动 + 「Entry deleted Undo」toast【实测·实拍】。
- 点 Undo → 被删条按原时间序回到中间位置【实测·实拍】。

## ④ 核心回归（过）

- RightCtrl 中文「我明天去公园散步」准确落字（前两次运行丢字，系统忙时 TTS 回放抖动，静置 10s 后复测全对，与 124/125 轮观察同类测试摩擦）【实测】。
- Alt+Q 免按 "The review and the report are done today." 准确落字【实测】。

## 测毕清场

- SpeakType/notepad/node 进程 0；43117/18099 无监听；无 .part
- config/history 由 round126-*.bak 整体还原（321 条、hold=RightCtrl、toggle=Alt+Q、vadAutoStop=true、模型 parakeet）
- 防火墙三 profiles OFF；repo 回 main、工作区干净
