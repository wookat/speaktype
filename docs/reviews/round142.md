# 第 142 轮体验官审查：OS 主题运行时切换 + Home 统计大数值边界

- 基线：main @ be22f6e（win-unpacked 沿用当前构建，#225 为 skill 文档不影响产品）
- 方法：真实打包应用全 UI 实测并录屏；OS 主题翻转用注册表（AppsUseLightTheme + SystemUsesLightTheme）+ WM_SETTINGCHANGE(ImmersiveColorSet) 广播（`tts\r142_theme.ps1`）；大数值 stats 用 `.ps1` 注入 history.json 后重启应用；测毕全量清场核验。

## 结论总览：无新立案，全部通过（toast 夹拍除外，见备注）

### A1 theme=system 运行时跟随 —— 通过

- 浅→深：应用运行中翻转 OS 至深色，主窗**即时**变深（无需重启，旧行为需重启可判别）；Settings 页深色渲染正常。
- 录音进行中翻转（深→浅）：Alt+Q 免按进行中翻转，悬浮条/字幕气泡持续显示、无闪崩，固定深色样式不受影响；分段中文落字正常完成（兼作 C2 免按回归）。
- 深→浅→深多次往返均即时跟随。
- ⚪ toast 出现期间翻转：多次尝试（含延时翻转 + Alt+Q 双击触发 toast）未能像素级夹住 toast 与翻转同帧——**如实标注为未取证/不确定**。代码上 toast 为固定深色样式（toast.tsx bg-[#292929]，与主题无关），破版风险低，但缺运行时证据。

### A2 固定档不受 OS 翻转影响 —— 通过

- theme=Light：OS 翻至深色（含往返翻转）后应用保持浅色（截图 ss_ad278513，任务栏深色 vs 应用浅色对照）。
- theme=Dark：OS 翻至浅色后应用保持深色（截图 ss_f92e7ece）。
- 测后经设置页恢复 Follow system。

### B Home 统计大数值边界 —— 通过

注入组 1：sessions=88888, words=999999, durationMs=60000000（1000min）：
- 四卡显示 88888 / 999999 / **16h40min** / **399h59min**（与 fmtDuration 公式精确值一致：saved=999999/40*60000-6e7=1439998500ms）；明暗两态均不破版、不溢出、不换行（ss_4c1cabea 浅 / ss_454aacf9 深 / 放大 ss_zoom_fd5f9f15）。

注入组 2：durationMs=3600000000（60000min）：
- Voice input time 显示 **1000h0min** 不溢出；Time saved 负值截断为 **0s**（Home.tsx L24 max(0,…) 判据，ss_d38ad298）。
- 测后 bak142 还原，重启后 Home 恢复基线 122 / 7089 / 16min（ss_23e4203c）。

### C 回归 —— 通过

- C1 RightCtrl 中文听写（language=zh）：9.5s 整句「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」落字 Notepad 新行（Ln2 Col29，ss_b4018a80 / 放大 ss_zoom_c3e3cbf3）。
- C2 免按：与 A1「录音中翻转」合并执行，Alt+Q 进出、多段落字正常。

## 清场核验

- 主题注册表还原 apps=1/sys=1（浅色）+ 广播；
- bak142 还原配置/历史：theme=system、lang=zh、mwr=False、stats 122/7089/1018238、hist=43；
- 系统 mute=False、muted-by-recording flag 无、failed-audio=0；
- SpeakType/notepad/node 进程 0；43117/43998/18099 无 LISTENING；
- 防火墙三 profile False（全程未开启）；VB-CABLE 保留；未改产品源码。

## 证据

- 录屏：`C:\Users\Administrator\screencasts\rec-ca236ed2-f778-40a3-814c-07f6c8798f21\rec-ca236ed2-f778-40a3-814c-07f6c8798f21-edited.mp4`
- 截图（`C:\Users\Administrator\screenshots\`）：A1 浅色基线 ss_68683754 / 翻深即时 ss_f5e5286f / 深色 Settings ss_6a703931 / 录音中悬浮条+字幕 ss_2580c2ff / 翻浅后录音继续 ss_9a618d93；A2 固定浅 ss_ad278513 / 固定深 ss_f92e7ece；B ss_4c1cabea、ss_454aacf9、ss_zoom_fd5f9f15、ss_d38ad298、还原 ss_23e4203c；C ss_b4018a80、ss_zoom_c3e3cbf3。
