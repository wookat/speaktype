# 第 177 轮体验官审查报告

- 基线：`main@5e0220e`（feat(dictation): 录音中 Esc 一键取消 + 改写失败区分网络错误与空结果（第 175 轮两 P3）(#264)）
- 测试方式：`npm ci` + electron-builder 打包 `release/win-unpacked/SpeakType.exe`，Windows Server 2022 实机运行；假麦克风（`--use-file-for-fake-audio-capture`）注入 msedge-tts 生成的 16kHz 单声道 WAV；本地 OpenAI 兼容 mock（127.0.0.1:18177，可切 ok/empty 模式）驱动 F8 改写链路；落字目标为记事本。
- 证据等级：【实测】打包应用实机验证；【源码】读代码确认；【推测】合理推断未直接验证；【未验证】本轮未覆盖。

## 一、核心回归（全部通过）

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 1 | 首启下载 sensevoice-small（234MB），状态 Ready | ✅ | 【实测】下载进度条正常，日志 `local model sensevoice-small downloaded` |
| 2 | 中文核心链路：记事本按住 RightCtrl 说话→松手落字 | ✅ | 【实测】落字「今天下午的会议改到明天上午10点，请提前准备好项目进度报告」；中文数字格式化（十点→10点）生效 |
| 3 | 英文链路：识别语言切 English 后重启，英文 WAV 落字 | ✅ | 【实测】落字 "Please schedule the design review for tomorrow morning and send the report to the whole team." 标点/大写完整 |
| 4 | #264 回归 A：录音中按 Esc 取消 | ✅（另见 P2-1） | 【实测】按住 RightCtrl 4s 后按 Esc：无落字、随后的松键不触发 finalize（主日志无对应 finalize 条目），原文未变 |
| 5 | #264 回归 B：F8 改写成功路径（mock ok 模式） | ✅ | 【实测】选中文本+按住 F8 说指令→选区被替换为 mock 返回的「【MOCK改写】方案已确认，明天上午之前答复老板。」 |
| 6 | #264 回归 C：改写网络失败 toast（mock 下线） | ✅ | 【实测】toast「Rewrite failed / Could not reach the polish service — check the Base URL and your network; the text was left unchanged」，选区原文未变 |
| 7 | #264 回归 D：改写空结果 toast（mock empty 模式） | ✅ | 【实测】toast「Rewrite failed / The polish model returned nothing; the text was left unchanged」，选区原文未变；与网络失败文案区分正确 |
| 8 | 历史页：三条听写记录、成功改写记录、搜索 "design" 精确过滤 | ✅ | 【实测】失败的改写尝试正确地不入历史；搜索即时过滤 |
| 9 | 托盘菜单：Open SpeakType / Speech recognition settings / Quit | ✅ | 【实测】右键托盘图标菜单项齐全可用 |
| 10 | AI 润色「测试连接」对本地 mock 端点 | ✅ | 【实测】显示 Connected: mock-model |

## 二、新立案问题

### P2-1 录音中按 Esc 取消会同时弹出 Windows 开始菜单（焦点被抢走）

- 现象【实测】：记事本中按住 RightCtrl 录音，按 Esc 取消——取消本身生效（不落字），但 Windows 开始菜单立即弹出并覆盖工作区，焦点从编辑器被抢走，用户必须再按一次 Esc 关掉开始菜单才能继续工作。
- 复现步骤：1) 默认长按键 RightCtrl；2) 在任意编辑器按住 RightCtrl 开始录音；3) 录音中按一下 Esc。开始菜单 100% 弹出（本轮实测复现）。
- 根因【源码】：`hotkey.ts` 基于 uiohook-napi，只能监听、不能吞掉按键；按住 RightCtrl 时按 Esc 对操作系统就是 Ctrl+Esc——Windows 的开始菜单系统快捷键。#264 在应用层正确取消了会话，但没有（也无法用 uiohook）拦截系统快捷键。
- 影响：Esc 取消是 #264 刚宣传的核心手势，而默认长按键恰是 RightCtrl，意味着「录音中反悔」这个高频动作必然触发开始菜单弹出，体验割裂且焦点丢失；对比 Wispr Flow 的取消手势不会引发系统级副作用。
- 修复建议【推测】：录音会话开始时用 Electron `globalShortcut.register` 临时注册 `Esc`（以及 `Ctrl+Esc`），会话结束/取消后立即注销——globalShortcut 会吞掉按键，系统收不到 Ctrl+Esc；平时不注册，避免影响其他应用的 Esc。或改用可拦截的 Low-Level Keyboard Hook 返回 1 吞键。

## 三、本轮未验证（如实声明）

- 【未验证】免按模式（Alt+Q）中 Esc 取消的同类副作用（无 Ctrl 修饰时 Esc 不构成系统快捷键，推测无开始菜单问题，但未实测）。
- 【未验证】parakeet/whisper 模型、云端 ASR 通道、电话麦克风、多显示器窗口记忆、五语言 UI 全量走查。

## 四、结论

PR #264 的两项修复（Esc 取消、改写失败分因提示）在打包应用中全部实测通过；但 Esc 取消手势与默认 RightCtrl 长按键组合出 Ctrl+Esc 系统快捷键副作用，立案 P2-1。

统计：P0 × 0，P1 × 0，P2 × 1，P3 × 0。
