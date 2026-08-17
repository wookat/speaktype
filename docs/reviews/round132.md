# 第 132 轮体验官审查报告 —— 窗口 bounds 恢复/离屏防护 + 驻留健康 + 设置页交互细节

- 审查日期：2026-08-17
- 基线：main@2ff98bc（`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案。**

## ① 专项 a：窗口 bounds 恢复与离屏防护（全过，DPI 变更如实挂账）

选择理由：多显示器/DPI 为最久未审面；本机虚拟显示器（1280x720 单屏）EnumDisplaySettings 枚举不出任何模式，分辨率/缩放变更不可构造——DPI 专项继续【未验证】挂账，改测同一防护链路中可实证的部分：

- **离屏防护**【实测】：把 mainWindowBounds 写成 x=5000,y=5000（模拟显示器拔掉后的落屏外坐标）再启动——窗口回到主屏可见位置（rect 82,0-1198,688），intersects+center 防护生效（windows.ts:49）。
- **位置/尺寸恢复**【实测】：MoveWindow 到 60,40 900x600 → 800ms 延迟落盘（savedBounds 即时更新）→ **强杀进程**（close 不触发路径）后重启，窗口精确恢复 60,40 900x600——崩溃场景下的兜底落盘实证有效。

## ② 专项 b：设置页交互细节 + 驻留健康（全过）

- 「Record a key」捕获流：点击后按钮变「Press any key... (Esc to cancel)」，**Esc 取消不改键**；按 F7 即录入且页面各处 hint（Hold F7 / Tap F7 twice）即时联动更新【实测】。
- 录入与 rewrite 同键（F8）：琥珀警告「Same as the hold-to-talk key — rewrite is disabled. Pick a different key.」在位（#203 顺带回归）；下拉恢复 RightCtrl 后警告清除、hint 复原【实测】。
- Hold threshold 为固定档位下拉（非自由数值输入），无极端值注入面——防呆设计合格【实测】。
- 驻留健康：活跃期 RAM 745MB（sensevoice 驻留量级，与 117/121 轮一致），静置约 10 分钟后回落至 262MB（内存被正常释放/整理），驻留 ~35 分钟后热键听写/免按仍即时响应且识别全对【实测】。
- 观察（测试摩擦级）：UI 自动化连续快速注入时输入框偶发丢首字符（与 131 轮同现象），复测正常速度输入无此问题，不立案。

## ③ 核心回归（全过）

- language=zh：RightCtrl 中文「我们明天去公园散步」全对；Alt+Q 免按英文「The review and the report are done today.」全对【实测】。

## 测毕清场

- SpeakType/notepad 进程 0；43117/18099 无监听；无 .part；failed-audio 空
- config/history 由 round132-*.bak 整体还原（321 条）；测试期窗口位置/热键改动随还原清除
- 防火墙三 profiles OFF；repo 回 main、工作区干净
