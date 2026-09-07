# 第 131 轮体验官审查报告 —— #212 回归 + AI 润色链路边界 + 剪贴板落字兜底

- 审查日期：2026-08-17
- 基线：main@963e537（含 #211/#212/#213，`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案。**

## ① #212 回归（全过）

- 同一段话音：首次失败 + 15s 内两次热键重试再失败 → **失败条目恰 1 条、failed-audio 恰 1 个 wav**（130 轮同操作为 3 条/3 wav，修复生效）【实测】。
- 切回本地 provider 后历史 Retry 该条成功：原地更新正确文本 + toast + 剪贴板，无重复条目【实测】。

## ② 专项 a：AI 润色链路边界（全过）

选择理由：润色开启态的失败降级、润色×词典交互近 30 轮未专审。方法：本地 mock OpenAI 兼容端点（18099）。

- 配置链路：AI polish 页 Custom + Test connection「Connected: mock-model」【实测】；顺带记录一处测试期输入摩擦（见观察①）。
- 正常润色：落字为 LLM 返回文本，历史保留 raw 原文（Show raw transcript）【实测】。
- **失败降级**：杀掉 mock 后听写——**不丢话**，本地清理后的 raw 准确落字、历史正常（status ok），fallback 提示回调在两条失败路径（HTTP 非 200 / fetch 异常）都接 toast.polishFallback【实测降级 +（提示文案）源码，toast 弹窗瞬时未截到】。
- 词典×润色次序：correctHotwords 在进 LLM 前作用于清理后文本，热词纠错不依赖 LLM【源码】。
- 录音中 persona chip「To my boss」+ zh 实时字幕正常渲染（实拍）。

## ③ 专项 b：剪贴板落字兜底（全过）

- pasteText 为剪贴板+Ctrl+V 注入，粘贴后恢复原剪贴板；文本为空时快照并恢复图片剪贴板；用户新复制内容不被覆盖【源码】。
- 焦点在不可输入目标（桌面）时听写：不崩、text 完整入历史可 Copy 找回、**原剪贴板内容（MARKER）完好恢复**【实测】。
- 观察①（测试基建级）：Base URL 输入框连续快速注入长 URL 时首字符偶发丢失（http://1→http://27…），复测正常输入无此问题，【推测】为注入速度过快非产品缺陷，如实记录不立案。

## ④ 核心回归（全过）

- language=zh：RightCtrl 中文「我们明天去公园散步」全对（本轮多次）；Alt+Q 免按英文全对【实测】。

## 测毕清场

- SpeakType/notepad/node(mock) 进程 0；43117/18099 无监听；无 .part；failed-audio 空
- config/history 由 round131-*.bak 整体还原（321 条）；polish/伪 provider 配置随还原清除
- 防火墙三 profiles OFF；repo 回 main、工作区干净
