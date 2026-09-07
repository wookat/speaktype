# 第 124 轮体验官审查报告 —— 自由挑刺：设置项组合冲突专项 + 真首启漸进体验与性能感知

- 审查日期：2026-08-16
- 基线：main@599a419（`npm run pack:dir` 全绿，打包实测）
- 选面理由：①热键组合冲突态从未专审（历轮只测默认键位）；②真首启（空 %APPDATA%）到第一次落字的完整心智流从未在近 30 轮内实走过
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3×1，观察 ×2。**

## ① 设置项组合冲突专项

**P3-① 立案：长按键与免按键可设成同一键且无冲突提示，免按单击静默失效**【实测+源码】

- HOLD_KEY_CHOICES 与 TOGGLE_KEY_CHOICES 交集为 F9/F10；设 hold=F9、toggle=F9 后（UI 可正常设置），设置页**无任何冲突警告**（对照：rewrite==hold 有琥珀色警告并在 configure 中自动禁用 rewrite）。
- 运行时实测：单击 F9（用户想触发免按）完全无反应——onKeyDown 先命中 holdKeycode 即 return，toggle 分支永不可达；设置页「Hands-free mode」hint 还写着「Press F9 … Press again … to exit」，与实际行为相悖。
- 双击 F9 仍可经 doubleTap 路径进免按（实拍悬浮条出现）；但**若用户再关掉「双击免按」开关，免按模式完全不可达**【源码】。
- 同根因：rewrite 与 toggle 同键（如都设 F10）时 toggle 同样被吞【源码】，rewriteKeycode 分支先 return。
- 建议：a) toggle 与 hold/rewrite 同键时仿照 rewriteKeyConflict 出警告；或 b) 从 TOGGLE_KEY_CHOICES 与 HOLD/REWRITE 选择联动过滤已占用键。

**vadAutoStop 关 × 免按长录（过，含边界实证）**【实测】

- Alt+Q 开免按后 50 秒内说两句（间隔 40s 静默），手动 Alt+Q 收尾正常落字；无限录音风险不存在——软上限 50s/硬上限 75s 强制分段 + 连续 6 轮无人声自动退出（实测观察到连续 50044ms/50011ms 无声分段与最终手动收尾 30121ms，行为与源码常量一致）。
- 观察①：vadAutoStop 关时免按不再按句分段，两句相隔 40s 会合入同一 50s 段送 ASR，长静音填充段的识别质量下降（第二句被吞成碎片）；与 #202 skill 记录的 padded-wav 现象同源，属该配置的固有取舍，不立案。

**rewrite==hold（过）**【实测+源码】：UI 出警告、configure 将 rewrite 视为 Off，无劫持。

## ② 真首启漸进体验 + 性能感知（全过）

整目录挪空模拟全新用户，打包应用首启【实测】：

- 首启页信息层次清晰：大标题「Hold RightCtrl to start voice typing」+ 模型下载横幅（~660MB 一次性说明）+「First time? 4 quick steps」引导卡 + 手机麦入口，零统计数据不突兀。
- **模型未下载时按住说话**：toast「Speech recognition not set up — Local model not downloaded yet」附「Open Settings」按钮，首启防呆到位（实拍）。
- 点击 Download：横幅按钮就地变进度百分比（4%→…），下载完横幅自动消失；639MB 落盘，log `local model parakeet-tdt-0.6b-v3 downloaded`，本机耗时 ~70s（LAN 带宽好，真实用户视带宽而定）。
- 下载完立即 RightCtrl 听写："The review and the report are done today." 一次准确落字——首启到首次成功落字全程零文档依赖。
- 性能感知：冷启动 log 起动→sherpa worker 就绪 3.2s（与 114 轮 3.7s 同量级）；Home/History/Dictionary/Transcribe/Settings 切页即时；321 条历史长列表滚动流畅无卡顿。

## ③ 核心回归（过）

- RightCtrl 中文：三次运行 1 次全对「我明天去公园散步」、2 次丢字（「我明去公园散步」「我明公园散」）——finalize voicedMs 1440-1620 波动，属 TTS 回放音源抖动（118 轮 "phoneone" 同类测试摩擦），真人语音无此波动，观察②不立案。
- Alt+Q 免按："The review and the report are done today." 准确落字【实测】。

## 测毕清场

- SpeakType/notepad/node 进程 0；43117/18099 无监听；无 .part
- 首启测试的全新 profile 目录整体删除；原 %APPDATA%\SpeakType 换回并用 round124-*.bak 还原 config/history（321 条、hold=RightCtrl、toggle=Alt+Q、vadAutoStop=true、模型 parakeet）
- 防火墙三 profiles OFF；repo 回 main、工作区干净
