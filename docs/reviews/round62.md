# 第 62 轮体验官审查（main @ 030701f，含 PR #122；win-unpacked 自打包实测）

日期：2026-08-15。方法：pack:dir 最新 main，fake-audio 注入 + rkey 按键注入 + UI 实操 + main.log 交叉核对。

## 结论总览

- **round61 P3-①（热键偶发丢按键）稳态复现：20/20 全干净，判定非产品问题**，关闭。
- 深挖一（launchAtLogin / startMinimized）：通过。
- 深挖二（captionLines 字幕高度）：功能通过；发现 1 条 P3 视觉小瑕疵（见 P3-①）。
- 核心回归（RightCtrl 中英 + Alt+Q）：通过。
- P0/P1/P2：无新增。

## 1. round61 P3-① 稳态复现（20 次采样）

- 条件：SpeakType 与目标窗口（Notepad）就绪 ≥3s 后才开始注入；每循环 repeat-keydown（3×down:q 不松）进免按 → 3s → 独立单击 Alt+Q 退出 → 2s；共 20 循环（21:10:26–21:13:21）。
- 结果：log **恰 20 次 finalize**，durationMs 全部 5247–5517ms，**0 次 durationMs<100 空 finalize，0 次丢按键**（无跨循环长 finalize，无残留免按态）。
- 判定：round61 那次 1/5「独立退出键无效 + 36.7s finalize」是**注入落在窗口刚启动的焦点抖动窗口**（当时 Notepad 启动 ~2s 内注入）导致的按键被吞，非产品缺陷、非 #121 挡板问题。**P3-① 关闭，无需修改产品。**
- 复现方法留档：若要再次归零验证，保持目标窗口就绪 ≥3s 后注入即可稳定 20/20。

## 2. 深挖一：Launch at login / Start hidden（GeneralTab「App behavior」）

- UI 打开 Launch at login → `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\SpeakType = "<exe>" --hidden` 即时写入（reg query 实测）；UI 出现子开关 Start hidden。
- 打开 Start hidden 后以 `--hidden` 参数重启：**主窗不显示**（桌面截屏无主窗）、托盘图标在、热键可用（RightCtrl 8s 落字 finalize 7879ms 正常入 Notepad）；托盘双击可唤出主窗。
- UI 关闭 Launch at login → 注册表值**即时删除**（reg query 报无此值）、子开关消失。
- 判定：链路完整（index.ts:229-235 node-auto-launch、435 行 `startMinimized && --hidden`）。通过。

## 3. 深挖二：captionLines 字幕高度（1/3/6 行）

- 默认 3 行：免按长文下字幕浮层 maxHeight=3×19+16px，滚动到最新。实拍浮层明显为多行块。
- UI 切「1 line」后再进免按：浮层高度显著变矮，仅约一行。1 行 vs 3 行实拍可区分，设置即时生效（panel.tsx:25-29 onSettings 热更新，无需重启）。通过。
- **P3-①（新增，视觉小瑕疵）**：浮层顶部会露出上一行的**半截裁切文字**（overflow-y:auto 滚动时上一行部分可见）。3 行档实拍约可见 4 行+半行、1 行档可见 1 行+半行。不影响功能，观感略毛糙。
  - 修法论证：给字幕容器加 `scroll-snap` 或改为按行整数滚动（scrollTop 取整到 CAPTION_LINE_PX 倍数），或顶部加 8px 渐变遮罩（mask-image: linear-gradient）遮住半行；一行改动即可，零功能风险。

## 4. 核心回归（Regression）

- RightCtrl 英文（parakeet/en，--hidden 模式下）：落字正常，finalize durationMs=7879 maxPeak=32768。
- RightCtrl 中文（sensevoice/zh）：落「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」，finalize durationMs=7879 maxPeak=32767。
- Alt+Q：本轮共 22+ 次进/退（20 采样 + 字幕深挖 2 次），全部干净。

## 5. 环境备注（非产品问题）

- 托盘区累积了大量「幽灵图标」——历轮测试用 Stop-Process 强杀 SpeakType 导致 Windows 托盘残留死图标（鼠标扫过即消失）。真实用户用托盘退出不会遇到；测试侧建议尽量走托盘 Quit 退出。

## 下轮候选

1. captionLines 半行裁切视觉修复验证（本轮 P3-①，若修）。
2. 6 行档 captionLines 实拍（本轮只对照了 1/3 档）。
3. Settings 剩余面：muteWhileRecording（录音时系统静音/恢复，需可靠音量状态断言方案）、keepFailedAudio 上限（20 段/7 天/50MB 淘汰策略）。
4. 真手机麦通道（仍缺真机）。
