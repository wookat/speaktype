# 第 65 轮体验官审查（main @ f05e80b，含已合并 PR #125，win-unpacked 本机 pack:dir 实测）

日期：2026-08-15。测试机：Windows 10，假麦（--use-file-for-fake-audio-capture）+ rkey.ps1 按键注入。

## 结论总览

- PR #125 回归抽查 🟢（损坏模型不闪退+下载引导，模型还原 SHA 一致）
- 深挖 A：配置文件损坏恢复 🟢（截断损坏→重建+toast+.bad 备份；BOM→静默修复零丢失）
- 深挖 B：主窗位置/尺寸/最大化持久化 🟢（Quit→重启逐像素还原）
- 核心回归 🟢（RightCtrl 中英各一句 + Alt+Q 免按一轮）
- 新增 P0-P2：无。P3/观察项 2 条（见下）

## 1 PR #125 回归抽查（Regression）🟢

- model.int8.onnx（SHA C71F0CE0…CD51）换 30 字节垃圾 → 启动 → 进程存活 ≥30s，log 无新 `sherpa worker started`（prewarm 被 modelReady 大小校验挡住），Home 显示「Download the offline speech model」引导条（实拍 ss_465746f8）。
- 还原备份后 SHA256 与前置一致（C71F0CE0…CD51，239233841 字节）；后续步骤中 Settings→Speech 显示 ✓ Ready、prewarm `sherpa worker started (sensevoice-small)` 正常。

## 2 深挖 A：配置文件损坏恢复（store.ts backupIfCorrupt / index.ts toast）🟢

- 2a 截断损坏（非法 JSON）：启动不崩；~1.5s 实拍 toast「**Settings rebuilt** — The config file was corrupted and has been reset; a backup was saved as speaktype.json.bad.」（ss_ba4fdf67）；`speaktype.json.bad` 生成且内容=损坏残骸（16/80/100 字节各次核对）；配置回落默认（Home hint 由 Alt+Space 变默认 Alt+Q、默认 persona）。
- 2b BOM-only（记事本另存常见形态）：原件加 EF BB BF → 启动 → **不弹** toast、无新 .bad；文件 BOM 被剥离写回（首 3 字节 123 10 9 = `{\n\t`）；配置零丢失（Alt+Space/sensevoice-small/zh/「To my boss」persona 全保留，ss_63420429）。
- 判定：损坏兜底与零丢失修复两分支均符合设计，用户数据可找回（.bad 提示到位）。

## 3 深挖 B：主窗位置/尺寸持久化（mainWindowBounds）🟢

- 拖动+改尺寸 → 托盘 Quit → speaktype.json 写入 `{"x":35,"y":62,"width":951,"height":672,"maximized":false}` → 重启 GetWindowRect 与退出前**完全一致**（L=27 T=62 W=967 H=680，物理像素，0px 偏差）。
- 最大化 → Quit → `maximized:true` 写盘 → 重启恢复最大化（ss_4dcaba53）。

## 4 核心回归 🟢

- RightCtrl 中文（sensevoice/zh）：落「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」Col 29，finalize 7874ms。
- RightCtrl 英文（sensevoice/en，UI 切 Recognition language）：落 "Please open Sp type and start dictation. Now open Sp type and start dictation." Col 107。
- Alt+Q 免按一轮：进/退干净，finalize 14091ms，落字 Col 209。

## P3/观察项

1. ⚪ **Alt+Space 免按热键在合成按键注入下未触发**（keybd_event 注入 alt+space 组合无 toggle 启动，无 log、无落字；切 Alt+Q 后同注入方式正常）。Alt+Space 是 Windows 系统菜单键，疑与系统菜单拦截/钩子判定相关；**未在真实键盘上复核，暂不能定性为产品缺陷**。若真实键盘也不可用则属 P2（Alt+Space 恰是出厂默认之一），建议下轮真实按键或换机复核；修法候选：hotkey 钩子对 Alt+Space 显式吞掉系统菜单（返回 1 阻断传递）。
2. ⚪ 托盘幽灵图标问题依旧（历轮 Stop-Process 强杀累积，环境问题非产品）。

## 下轮候选

- Alt+Space 免按热键真实键盘复核（本轮观察项 1 定性）。
- muteWhileRecording（仍需带真实声卡机器）。
- Parakeet 模型损坏注入（#125 只实测 sensevoice 通道；parakeet 四文件均带 size，代码同路径，风险低）。
- 真手机麦克风 relay 实测（缺真机）。
- 安装包 Setup/升级链路周期性复验。
