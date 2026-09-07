# 第 133 轮体验官审查报告 —— 统计口径专项 + onboarding 引导卡专项

- 审查日期：2026-08-17
- 基线：main@2ff98bc（`npm run pack:dir` 全绿，打包实测；skill #214 尚未合入 main，不影响产品代码）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3×1。**

## ① 专项 a：统计口径（Sessions/Words/Voice time/Time saved）

选择理由：Home 四项累计统计与失败/静音/重试的计数口径从未专审。基线 stats={words:20284, durationMs:2438824, sessions:321}，全部按受控动作核对增量【实测】：

- 正常 zh 听写（我们明天去公园散步）：words +9（CJK 每字 1 词口径正确）、sessions +1、duration +4208ms ≈ 实际录音时长。
- 纯静音 hold 2s：三项全部 +0（不虚增）。
- ASR 失败听写（不可达云端 provider）：三项全部 +0；失败条目入历史。
- 失败条目历史 Retry 成功：words +9、sessions +1、duration +4204ms——**失败→重试成功的会话恰计一次**，无双计。
- Time saved 公式（words/40wpm − 实际时长）与展示值一致【源码+实测对照】。

**P3-① 立案：历史页 Retry 成功后 Home 统计不刷新**——Retry 成功（store 已 323/20302）后切到 Home 仍显示 322/20293，来回切页不恢复；根因【源码】App.tsx 仅在听写 status→idle 广播时刷新 stats，retryHistory IPC 成功路径无任何刷新信号；下一次正常听写后自愈（实测 325/20319 恢复同步）。影响：重试后统计短时不一致，误导性低但口径可见。修法：retryHistory 成功后广播一次 stats 刷新（~2 行）。

## ② 专项 b：onboarding 引导卡（全过）

- 「First time? 4 quick steps」熟手态（sessions≥10）默认收起，Show steps 展开四步文案完整、热键名（RightCtrl/Alt+Q）随配置活渲染【实测】。
- 「Use your phone as the microphone →」深链直达 设置→Speech，「Phone as microphone」行获得焦点高亮【实测】。
- 真首启态（引导卡/模型下载防呆）已于 124 轮全流程专审，本轮不重复。
- 顺带回归：provider 切换 OpenAI 兼容显「Not configured」→ 填入后「Configured (untested)」→ 切回 Built-in 显「Ready」，状态标签诚实一致【实测】。

## ③ 核心回归（全过）

- language=zh：RightCtrl 中文「我们明天去公园散步」全对；Alt+Q 免按英文「The review and the report are done today.」全对【实测】。

## 测毕清场

- SpeakType/notepad 进程 0；43117/18099 无监听；无 .part；failed-audio 空
- config/history/stats 由 round133-*.bak 整体还原（321 条）；伪 provider 配置随还原清除
- 防火墙三 profiles OFF；repo 回 main、工作区干净
