# 第 138 轮体验官审查报告 —— 历史搜索边界 + 开机自启/隐藏启动组合

- 审查日期：2026-08-17
- 基线：main@bb9c36f（`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案，观察 ×1。**

## ① 专项 a：历史搜索边界（全过，观察 ×1）

选择理由：Search history 的大小写、CJK、空白匹配与过滤态按钮联动从未专审。

- 大小写不敏感：全大写「PLEASE BRING」命中小写原文条目【实测】。
- CJK 查询：单字「你」正确命中 5 条含中文条目（含多行 MOCK-REWRITE 条目，#219 换行展示同屏顺带复验）【实测】。
- 匹配范围含 text/raw/personaName（转录条目按来源文件名可检索）【源码】。
- 过滤态 Export 只导出过滤结果、零命中时 Export 隐藏、「No matches for this search」空态文案在位【实测+源码】。
- 观察①（不立案）：查询串不 trim——「你␣」（尾随空格）零命中，粘贴带空格的检索词会静默无结果；~1 行 `q.trim()` 可修，随他改顺带。全半角不互通属字面匹配设计边界，不立案。

## ② 专项 b：launchAtLogin / Start hidden 组合（全过）

选择理由：开机自启真实注册表写入与隐藏启动行为从未运行时验证。

- 开启 Launch at login：HKCU\...\Run 即时写入 `"...\SpeakType.exe" --hidden`，系统「Startup App Notification」弹出；Start hidden 子开关随父开关显隐【实测】。
- 模拟登录启动（`--hidden` + Start hidden 开）：主窗口 0 可见、7 进程常驻，隐藏态 RightCtrl 听写「我们明天去公园散步」正常落字——托盘静默运行完整可用【实测】。
- 手动启动（无 `--hidden`）：主窗口正常显示，Start hidden 不影响手动打开【实测】。
- 关闭 Launch at login：Run 注册表项即时移除，无残留【实测】。

## ③ 核心回归（全过）

- language=zh：RightCtrl 中文「我们明天去公园散步」全对（隐藏启动态完成，双重取证）；Alt+Q 免按英文「The review and the report are done today.」全对【实测】。

## 测毕清场

- launchAtLogin 已关、Run 注册表无 SpeakType 项；SpeakType/notepad 进程 0；43117/18099 无监听；无 .part；failed-audio 空
- config/history 由 round138-*.bak 整体还原（321 条；language/model 测试改动随还原清除）
- 防火墙三 profiles OFF；repo 回 main、工作区干净
