# 第 71 轮体验官审查报告

- 基线：main @ fa99339（含 #132）win-unpacked 自打包
- 角度：官网/线上一致性、应用内更新提示链路、dark 主题新 UI 回归、长文本边界、核心回归
- 证据：`C:\Users\Administrator\round71-evidence.md`

## 结论：全 🟢，无新 P0-P3 立案

| 项 | 结果 |
| --- | --- |
| 官网 EN/ZH：下载区 v0.13.0 三资产链接与 GitHub latest 同步、HEAD 200（Setup 103MB/portable 91MB/apk 2.4MB）；卖点与 main 无脱节（round36 线上落后未复发） | 🟢 |
| 更新提示：v0.13.0=latest 时 About 无「New version」横幅；api.github.com 阻断时静默（预拨 0、error 0、无错误 UI） | 🟢 |
| dark 主题：Resume download (99% done) 按钮（Home/Settings）与词典「No matching hotwords.」均清晰可读，无样式破损 | 🟢 |
| 长文本：hold 45s 字幕稳定 3 行滑窗+顶部渐隐，落字 Col 600；免按 60s log 实证 52.8s 软分段（#120）后继续聆听、干净退出 | 🟢 |
| 核心回归：RightCtrl 中文 + 英文 hold + Alt+Q | 🟢 |

## 观察项（不立案）

- Home 下载引导条正文折行贴 Resume 按钮左缘、视觉略挤——浅/深主题一致的既有布局，非 dark 回归。

## 遗留/边界（非本轮立案）

- muteWhileRecording 需真声卡；真手机麦需真机。

## 清场

双模型 SHA 核对一致、hosts 内容/解析/临时 ACL 全还原、配置/历史恢复原件、无 .part、进程 0、防火墙三 profile OFF。
