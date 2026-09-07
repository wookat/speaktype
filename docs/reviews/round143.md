# 第 143 轮体验官审查：锁屏/会话事件韧性

- 基线：main @ be22f6e（win-unpacked 沿用当前构建，#226 为 skill 文档不影响产品）
- 方法：真实打包应用全 UI 实测并录屏；CoreAudio 探针（SetMute 往返自验，~2s 粒度采样）；假麦克风 r139_padded.wav；会话事件用 `SendMessage(HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER)` 广播（`tts\r143_monitor.ps1`）。
- 代码背景：`desktop/src/main` 无任何 `powerMonitor` / `lock-screen` 监听，全局热键完全依赖 uiohook-napi 进程内钩子（hotkey.ts）→ 会话事件韧性为纯运行时行为。

## 结论总览：可执行项全部通过，无新立案；A 真锁屏因环境限制未验证（如实标注）

### A 锁屏/解锁 —— 未验证（环境限制，非产品问题）

- `devinbox\Administrator` 密码未知（Password required=Yes；AutoAdminLogon 密码存 LSA、注册表 DefaultPassword 为空，不可读），锁屏后无法在锁屏界面解锁。
- 兜底方案（SYSTEM 计划任务 `tscon 1 /dest:console`）未锁屏干跑 **Last Result=1 失败**：tscon 重定向仅适用于「断开的会话」，对已附着 console 的本地锁定会话不适用——干跑不干净，按既定决策放弃真锁屏，不赌 GUI 存活。
- 后续可行路径：若拿到登录密码，可锁屏后用远程 shell `tscon`/自动输密码解锁再验证；或在有 RDP 断开/重连能力的环境补测。

### B 近似专项 —— 通过

- **B1 显示器电源关/开 × 热键即时性**：`SC_MONITORPOWER` 关广播 → 20s → 开广播+鼠标唤醒 → **首次**按住 RightCtrl 即落字中文整句（Notepad Ln2 Col29），托盘图标在。若 uiohook 在电源事件后失效则无悬浮条无落字，可判别。注：本机为虚拟显示器，帧缓冲不真正熄屏，但 WM_SYSCOMMAND 广播已投递到所有顶层窗口（应用可感知的正是该事件）。
- **B2 tscon 会话重附着**：未发生（见上，对已附着 console 会话 tscon 直接失败，无重附着事件可取证）——标注未测。
- **B3 录音进行中电源事件 × muteWhileRecording=ON**：设置页开 mwr → Alt+Q 进免按（悬浮条+字幕+任务栏静音图标）→ 录音中发关显示器广播、25s 后唤醒 → 期间分段持续落字（Ln3 Col113→161）→ Alt+Q 退出。探针采样：会话期间 06:01:55→06:02:49 全程 mute=True/flag=True **无一 False**（#223 跨句保持静音不被电源事件打断）；退出后 mute=False、flag 删除（恰好解除一次、无静音残留）；退出后立即 RightCtrl 新录音正常落字（Ln4 Col29）。

### C 回归 —— 通过

- C1 RightCtrl 中文听写（language=zh）：9.5s 整句「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」落字 Notepad Ln1 Col29。
- C2 #221 搜索 trim：「明天␣」尾随空格命中多条历史条目，非零命中空态。

### 测试者备注（非产品问题）

- 一次误触：B3 后核验新录音时，点击任务栏未切到 Notepad、Return 把焦点上的 mwr 开关切回 OFF（恰为基线值 False，配置无污染）；已重新聚焦 Notepad 完成取证。
- mwr 开关全程经设置页 UI 操作（开→测→UI 误触切回 OFF 后核验 json 确为基线）。

## 清场核验

- bak143 还原配置/历史：theme=system、lang=zh、mwr=False、hold=RightCtrl、stats 122/7089/1018238、hist=43；
- 系统 mute=False、muted-by-recording flag 无、failed-audio=0；
- r143unlock 计划任务已删除；SpeakType/notepad 进程 0；43117/43998/18099 无 LISTENING；
- 防火墙三 profile False（全程未开启）；VB-CABLE 保留；未改产品源码。

## 证据

- 录屏：`C:\Users\Administrator\screencasts\rec-79816ad4-b58e-4bd5-a8c9-fdd8ccce897d\rec-79816ad4-b58e-4bd5-a8c9-fdd8ccce897d-edited.mp4`
- 截图（`C:\Users\Administrator\screenshots\`）：C1 落字 ss_83a03fc9；C2 命中 ss_4ce30205；B1 唤醒后首次落字 ss_387f3f1e；B3 免按+悬浮条+任务栏静音 ss_e8e36362 / 事件后继续分段 ss_10e97d8c / 退出后 ss_cbd7a31e / 新录音 ss_9dfee2f1；mwr 开关 ss_05ca3984。
