# 第 146 轮体验官审查：多实例防护与快速双开竞态

基线：main 不变（#229 skill 文档），win-unpacked 沿用（v0.15.0，packaged=true）。真实打包应用全 UI 实测并录屏；进程/端口/日志/数据文件用脚本取证。

代码口径：`desktop/src/main/index.ts` L90-91 `requestSingleInstanceLock()` 拿不到锁即 `app.quit()`；L548 `app.on("second-instance", () => showMain())`；L500 `startMinimized && --hidden` 静默启动；L542-546 关窗=进托盘。

## A 多实例防护

### A1 运行中二次启动（主窗可见）——通过
- 进程数 9 → 二次启动瞬时 10 → 2s 内回落 9 并稳定（第二实例按锁口径快速退出）。
- 主窗保持前台；随后一次 RightCtrl 中文听写只落**一行**（Notepad Ln1 Col29），热键无双触发。
- 43117/43998 无监听无冲突日志（remoteMic 关闭态，本就不监听——负向证据成立口径受限，如实记录）。

### A2 托盘态唤起——通过
主窗 X 关闭进托盘（桌面无窗）→ 再启动 exe → 主窗被唤起显示，进程回落 9。

### A3 最小化态唤起——通过
主窗最小化 → 再启动 exe → 主窗恢复到前台显示，进程回落 9。

### A4 --hidden 自启 + 手动再开——通过
`settings.startMinimized=true` + `--hidden` 启动：8 进程运行、桌面无主窗（静默待命）→ 手动再开 exe → 第二实例退出、主窗被唤起显示。
测试者注记：settings 嵌套在 speaktype.json 的 `settings` 键下；首次误写顶层 `startMinimized` 导致窗口仍显示（app 忽略顶层键，行为符合代码预期，非产品问题），改写 `settings.startMinimized` 后复测成立。

### A5 main.log 零未捕获异常——通过
本轮时间窗（06:59–07:07）内 error/uncaught/fatal/EADDRINUSE 均为 0 条；日志中历史 error（08-15/08-16 的 EPERM/relay ENOTFOUND）为往轮测试遗留，与本轮无关。

## B 快速连续启动竞态——通过
杀净后 377ms 间隔连发两个 exe：t+2s procs=9（瞬态）→ t+4s 起稳定 8（恰 1 实例）；speaktype.json 与 history.json 均可解析无损坏（lang=zh/hold=RightCtrl；hist=44、stats 123/7115 含本轮 +1 听写）。

## C 回归——通过
- RightCtrl 中文（language=zh）：9.5s 整句「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」落字 Notepad Ln1 Col29（与 A1 合并取证）。
- 历史搜索「明天」：命中多条含今日新落字条目（#221 口径）。

## 立案
无新立案。单实例锁、second-instance 唤起（前台/托盘/最小化/--hidden 四态）、竞态存活、数据完整性全部符合预期。

## 观察（不立案）
- 稳定进程数在 8/9 间随窗口/worker 生命周期波动，判据应取「回落并稳定」而非固定值。
- 桌面存在「SpeakType 手机麦克风」PWA 快捷方式（往轮遗留），任务栏图标与主应用相邻易误点，测试者本轮误点一次（与产品无关）。

## 清场
bak146 还原：hist=43、stats 122/7089/1018238、lang=zh/theme=system/hold=RightCtrl/mwr=False/provider=local/startMinimized=False（顶层误写键已随还原消除）；系统 mute=False；flag 无；failed-audio=0；进程 0；43117/43998/18099 无监听；防火墙三 False；VB-CABLE 保留；未改产品源码。
