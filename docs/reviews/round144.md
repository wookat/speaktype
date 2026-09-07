# 第 144 轮体验官审查：系统时钟跳变韧性

- 基线：main @ be22f6e（#227 为 skill 文档，产品不变），win-unpacked 沿用（0.15.0 packaged）
- 方法：真实打包应用 + Notepad 落字 + fake mic（r139_padded.wav）；时钟操作全程 `.ps1` 脚本（Set-Date -Adjust）；测前停用 NTP，测毕恢复 + resync；全程录屏
- 结论：**全部通过，无新立案**。时钟前跳/回跳/失败重试窗口/Undo 计时/升级缓存过期路径均无崩溃、无白屏、无历史错乱

## 逐项结果

### B1 回归：RightCtrl 中文听写（时钟未动）
通过。按住 RightCtrl 9.5s，整句中文落字 Notepad（Ln1 Col29）。

### A4 删除 Undo 10s × 前跳 +1min
通过（预期行为取证）。History 删除条目 → Undo 栏出现 → 后台脚本在真实 5s 时前跳 +1min：
- 跳变后（真实 ~6s）Undo 栏**仍在**——`window.setTimeout(10000)` 按单调运行时长计时，不受墙钟前跳影响；
- 真实 10s 内点击 Undo，条目恢复原位（列表顶部 15:57 条目回归）。
- 无用户价值问题，不立案。
- 取证注记：首两次尝试因操作往返 >10s 使真实计时先到期、Undo 栏消失（真实时间到期，非跳变所致），已用延时后台跳变收紧时序后取证成功。

### A2 回跳 -2h × 新落字排序
通过。回跳至 04:18 后听写：
- 新条目在 History **顶部**（排序口径实证：**按数组顺序**渲染，`History.tsx` 直接遍历 props.history，不按 at 排序——即使新条目 at 比上一条早 2h 仍列首）；
- 分组标签 Today、时钟列显示回跳后的 04:18；其下 2026/8/15 组不乱；
- Home 统计正常累计（124/7141/17min），无异常无白屏。

### A3 失败重试窗口 × 回跳
通过（预期行为取证）。openai+死端口 18099 构造失败条目（toast「Recording kept — press the hotkey again to retry」）→ 失败后真实 ~10s 内回跳 -30min → 按 RightCtrl 重试：
- 重试**被接受**：`Date.now()-failed.at` 为负 ≤ RETRY_WINDOW_MS(60000)，重试走 retryLast 保留音频管线——证据：main.log finalize durationMs=5879 与原失败录音一致（非新录音），历史中原失败条目**原地刷新 at**（06:20:02 条目变为 05:50:10），未追加重复条目；
- 再次失败（端口仍死）行为正常，无崩溃。符合预期，不苛求，不立案。
- 取证注记：error 态仅驻留 15s（dictation.ts L209 linger=15000）即回 idle，超时后按键是全新录音——前两次尝试因此走了新录音路径（各留 1 条失败条目），第三次收紧时序后命中 retryLast。

### A1 前跳 +1 天 × 历史显示 + 升级缓存
通过。前跳至 2026-08-18 后听写：
- 新条目落 History 顶部、分组 **Today**；原 8/17 条目组标签整组变 **Yesterday**；2026/8/15 组保持日期标签；无重复分组/错乱；
- 重启应用：启动正常，`latest-release.json` 缓存（at=08/16 10:41）按 Date.now 判定 >24h 视为过期重新拨号；本次 GitHub 拉取未成功（无新 prefetched 行、缓存未刷新），**静默失败符合设计**（fetch 失败不影响启动）；
- 重启后 main.log **零 error/Uncaught/FATAL**，Home 正常显示（127/7212），无白屏。
- ⚪ 观察（环境+引擎行为，非产品缺陷，不立案）：前跳后运行中的 Electron 进程 Date.now 约有 ≤1 分钟的追赶延迟（首次取证时进程时间落后 OS 整 1 天约 2 分钟，Chromium base::Time 周期性重同步后跟上）。期间 UI 标签与进程时间自洽，无错乱。

### B2 回归：免按（Alt+Q）
通过。免按 3 段中文落字同一行（Ln6 Col85），悬浮条+字幕正常，Alt+Q 退出后悬浮条消失。

## 环境干扰记录（测试者侧，非产品问题）
- w32time 为 Automatic 且带触发启动，`net stop` 后仍被自动拉起并两次将时钟校回真实时间（03:22→06:20、08/18→08/17）。对策：测试期间临时 `Set-Service w32time -StartupType Disabled` + Stop，测毕恢复 Automatic + Start + `w32tm /resync /force`。vmictimesync 本就 Stopped，非干扰源（本机为 Cloud Hypervisor）。

## 清场核验（全绿）
- 系统时间已恢复真实时间（2026-08-17 06:39:59），w32time Running/Automatic、resync 完成
- speaktype.json/history.json 从 bak144 还原：lang=zh、theme=system、hold=RightCtrl、mwr=false、provider=local；hist=43、stats 122/7089/1018238
- 系统 mute=False；muted-by-recording 无；failed-audio=0
- SpeakType/notepad 进程 0；43117/43998/18099 无 LISTENING；防火墙三 profile False（全程未开启）
- VB-CABLE 保留；未改产品源码
