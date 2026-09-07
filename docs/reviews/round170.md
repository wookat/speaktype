# 第 170 轮体验官审查报告

- 日期：2026-08-17
- 基线：main@9fad596（含 #261）
- 打包：`desktop/ npm ci`（428 packages，0 vulnerabilities，Node 20.19.0 有 engines>=22 警告不影响构建）+ `npm run pack:dir` 产物完整（win-unpacked 0.15.1 / Electron 43.3.0，SpeakType.exe 225MB；electron-builder 签名步骤后 shell 退出码非零，但产物齐全、实测可正常运行）
- 证据分级：【实测】打包运行时直接证据；【源码】源码检视；【推测】推断；【未验证】未执行

## 结论：P0=0，P1=0，P2=1（⑤ 自启+Start hidden 在「上次最大化退出」时主窗口仍弹出），P3=0

## ① 核心回归【实测】全过

- RightCtrl 中文（language=zh，sensevoice-small）：记事本聚焦后按住 Control_R 约 9s → 悬浮胶囊紫色波形 + 实时字幕「帮我跟老板说，那个方案需要再改一下，您。」逐步上屏（ss_9ac60384.png）；释放后完整句子「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」落入记事本光标处（ss_8069c47e.png，Ln1 Col29）。
- RightCtrl 英文（language=English，TTS 16k mono WAV）：实时字幕正常（ss_447e372a.png），释放后「Please schedule the design review for tomorrow morning and send the report to the whole team.」全对、大小写标点正确，落在第二行光标处（ss_6640cc62.png）。

## ② #261 回归【实测】全过

- tokens-only（杀进程后仅移走 model.int8.onnx，tokens.txt 315894B 在盘、无 .part）：重启后 Home 显示普通「Download」+「One-time download (~234MB)」（ss_eade019f.png）；Settings→Speech 按钮为普通「Download model」、状态 Not configured（ss_66ee7410.png）。第 168 轮 P3 的「Resume download (0% done)」自相矛盾文案已消除。
- 真残片（model.int8.onnx.part=完整文件前 40% 字节 95693536B + .part.json `{"url":"fake","total":239233841}`）：重启后按钮为「Resume download (40% done)」（ss_9ba608ac.png），百分比与残片字节占比一致。
- 结论：`modelPartialPercent` 的 percent<1 走全量文案分支【源码】与两侧实测行为一致，#261 达成设计意图。测后 .part/.part.json 已清、模型还原、状态回 Ready。

## ③ 专项 a：历史页大数据量/搜索/分页【实测】全过

选择理由：regression-checklist 标注该项上次覆盖是第 3 轮，近 20 轮未复查。

- 注入 62 条历史（60 条合成中英混合 + 2 条真实，备份后写回 history.json 顶层 {history,stats} 结构）→ 重启后 History 按「Today」分组正常渲染，卡片含 persona 徽章 / 时长 / Copy·Correct·Delete（ss_7c293caf.png）。
- 分页：首屏 50 条，底部「Show more (12 remaining)」（ss_2d1da10a.png）；点击后 62 条全部展开，末条为最旧条目（ss_212da21d.png）。
- 搜索：中文「周报」命中 6 条（ss_a2d169ae.png）；英文「hotfix」命中含第 51+ 条（证明搜索扫全集、不受分页限制，ss_fdd5c5f9.png）；按 persona 名「Email」可过滤（【源码】搜索匹配 text/raw/personaName，ss_0d898f6e.png）；无命中显示「No matches for this search.」空态（ss_38f21fd7.png）。
- 设计评价：50 条 + Show more 的轻量分页对本地词典型数据量足够（竞品 CapsWriter 无历史 UI，Wispr Flow 为无限滚动）；搜索扫全集是正确取舍。无立案问题。测后 history.json 已从备份还原。

## ④ 专项 b：托盘菜单【实测】全过

选择理由：托盘菜单从未做过打包版专项。

- 右键托盘 $ 图标出三项菜单：Open SpeakType / Speech recognition settings / Quit（ss_441fec99.png）。
- 「Speech recognition settings」直达 Settings→Speech 页（状态 Ready，ss_32965bfb.png）；「Open SpeakType」可从隐藏状态恢复主窗口。
- 点主窗口 X → 窗口隐入托盘、进程存活（7 个进程），RightCtrl 听写不受影响——关闭即最小化到托盘的行为与 Wispr Flow/Handy 一致，符合常驻工具预期。
- 设计评价：三项菜单偏简，可考虑加「暂停听写」开关（Wispr Flow 托盘有 pause）供会议场景一键静默；现状可用，不立案。

## ⑤ 专项 b'：开机自启 + Start hidden【实测】发现 1 个 P2

- 开 Launch at login → HKCU\...\Run 写入 `"...\SpeakType.exe" --hidden`，值名固定 SpeakType（reg query 实拍）；开关联动出现「Start hidden」子开关（ss_98597dc0.png）。关闭 Launch at login → Run 值即刻删除（reg query 报 key not found）。【源码】--hidden 恒作为登录启动标记，是否隐藏由 startMinimized 决定，设计合理。
- 隐藏启动本体验证：startMinimized=true 且窗口上次以**非最大化**退出时，带 --hidden 启动 → 无任何可见窗口、仅托盘图标，7 进程存活（ss_67eb6b4f.png）——符合预期。

### P2：上次最大化退出时，自启 Start hidden 失效、主窗口仍弹出

- 复现【实测】：① 主窗口最大化后退出（speaktype.json windowBounds.maximized=true）；② Launch at login + Start hidden 均开；③ 以 `SpeakType.exe --hidden` 启动（等价开机自启）→ 主窗口全屏弹出（ss_948898d3.png），Get-Process 可见 1 个可见主窗口。反证：同配置下仅把退出前窗口还原为非最大化（maximized=false）→ 隐藏启动正常、无窗口弹出。
- 根因【源码】：windows.ts `createMainWindow` 中 `if (saved?.maximized) win.maximize();` 无条件执行；Electron 对 show:false 的隐藏窗口调用 maximize() 会将其显示，绕过了 `visible` 参数。
- 影响：习惯最大化使用的用户（很常见）每次开机登录都会被弹出全屏窗口，「Start hidden」承诺失效。
- 建议修复（约 2 行）：`if (saved?.maximized && visible) win.maximize();`，隐藏路径改为在窗口首次 show 时再补 maximize（`win.once("show", ...)`)，兼顾「从托盘打开时仍恢复最大化」。

## 环境限制

- 真实开机重启验证自启（RDP 虚拟机不重启）以 `--hidden` 手动启动等价替代【实测等价】；真多显示器、真手机麦、云 provider 真实 key 沿旧挂账【未验证】。
- 强杀进程遗留的托盘幽灵图标为 Windows 通知区缓存行为，非应用缺陷，不立案。

## 清场

- SpeakType/Notepad 进程停；模型还原（model.int8.onnx 239233841B + tokens.txt 在位），无 .part 残留。
- history.json 从备份还原（818B，62 条注入数据清除）；launchAtLogin=false、startMinimized=false；Run 注册表值已删（reg query 确认）。
- 防火墙三 profile 全程保持 OFF（Domain/Private/Public=False 实拍）；本轮未做断网场景，未动 hosts/asar。
- repo 回 main@9fad596，git status 干净（仅新增本报告于 review/round170-report 分支）。
