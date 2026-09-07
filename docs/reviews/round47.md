# SpeakType 第 47 轮严格审查报告 —— v0.12.0 发布后全盘复查

- 审查对象：官网线上页 + GitHub Release v0.12.0 + **官网 Setup 真实安装**（SpeakType-Setup-0.12.0.exe，103,242,500 字节）全新首启 + 最新 main@382133b（含 PR #100）pack:dir
- 审查方式：【实测】= 真机验证；【源码】= 代码走查；【未验证】= 如实标注
- 环境：Windows Server 2022，全新 %APPDATA%（原数据含 legacy 目录已备份移出，测毕还原）

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 | 配置错误 toast 的「Open Settings」跳到 AI model（润色）tab，而不是 Speech tab——修复入口把新用户带错地方 |
| P3 | 1 | ITN 货币转换吞掉前导空格：「costs eleven dollars」→ `costs$11`（3/3 复现） |

## 1. 官网与 Release 页核对 —— 全过

【实测】curl 抓取线上页：
- 英文页 https://speaktype.zalize.com/ ：v0.12.0 横幅（"clearer setup guidance & rock-solid long dictation sessions"）+ 三个下载链接（Setup / portable / APK）全部指向 v0.12.0，HEAD 请求全部 200。
- 中文页 /zh/：同版本同链接，全对。
- Release 页（tag v0.12.0）：Highlights 六条与实际合并内容一一对应（#96 可见配置错误、#97 12s+悬停、豆包 Test、清史连删录音、#98 hold 空格、45 轮 soak 数据），下载表、默认引擎说明、官网链接齐全，文案无错。

## 2. 官网 Setup 真实安装 + 全新首启 —— golden path 全绿，一处 P2

【实测】从官网链接真实下载 Setup（103MB）→ 安装器流程顺畅（per-user，自动首启）→ 全新首启：
- 首屏：v0.12.0，Home 横幅「Download the offline speech model ~660MB」+ 四步引导 + 手机麦入口，指向明确。
- **模型下载前先按 RightCtrl（挑刺路径）**：#96 配置错误 toast 弹出「Speech recognition not set up · Local model not downloaded yet — Open Settings」，12s 时长 + 悬停 16+ 秒不消失（#97 悬停暂停实拍全过）。
- **P2：点「Open Settings」落到 AI model（润色模型）tab**——该 tab 只有润色端点配置，没有任何模型下载入口；下载按钮在 Speech tab。新用户被 toast 指路过去却找不到要修的东西，#96 特意修的「可见降级」在最后一跳掉链子。
  - 根因【源码】：`index.ts:145` openModelSettings 硬编码 `tab: "model"`——它原本为「改写缺润色模型」场景设计（dictation.ts:259，那里跳 model tab 正确），#96 复用它处理 ASR 配置错误（dictation.ts:333）却没换目标 tab。
  - 修法：openModelSettings 加 tab 参数（沿用现有 `jumpTab` 机制，支持 "speech"），ASR 配置错误传 "speech"，改写缺润色模型维持 "model"，~4 行。
- Speech tab 点 Download → 原位百分比进度 → 约 2.5 分钟下完 → **#94 就绪 toast「Offline model ready」实拍弹出** → Status Ready。
- 第一句 RightCtrl 落字成功——但暴露 P3（见下）。

**P3：ITN 货币转换吞前导空格**：
- 【实测】「My first sentence costs eleven dollars.」→ `My first sentence costs$11.`；「The fee is twenty dollars in total.」→ `The fee is$20 in total.`；连同第 46 轮 `price:$10`（当时被冒号掩盖）——**3/3 复现，goldenpath 落字直接出粘连文本**。
- 定位【源码】：仓库全文无 currency/dollar 处理，ITN 在 sherpa/parakeet 模型侧完成，是上游 ITN 规则把 "costs eleven dollars" 重写为 "costs$11" 时丢了空格。
- 修法论证：上游不可控，建议 app 侧后处理一行正则（`/([A-Za-z])\$(\d)/g → "$1 $$2"`，字母紧跟 $数字 之间补空格），放在 finalize 文本管线里，对中文/已正确文本零影响，~3 行。

## 3. 新功能集中回归 —— 全过

| 项目 | 结果 |
|------|------|
| 配置错误 toast 12s+悬停+去设置 | 【实测】12s 存活、悬停 16s+ 不消失、按钮可点（目标 tab 错误即上面 P2，机制本身全对） |
| 豆包 Test transcription 失败路径 | 【实测】未配置点 Test → `FAIL · Speech recognition not configured: sign in to Doubao and use its voice input once, or enter an App Key in Settings`，可读可操作 |
| ChatGPT 未登录口述失败路径 | 【实测】（顺带）toast「Not signed in to ChatGPT … Recording kept — press the hotkey again to retry」+ 历史失败条目带 Retry + failed-audio 落盘 |
| 清空历史连删 failed-audio | 【实测】制造 1 段失败录音 → History「Clear all」两步确认 → 历史清空 + failed-audio 目录 0 文件（#97 闭环） |
| hold 句间空格（同窗） | 【实测】`done. And` 正确补空格；>15s 过期不补 |
| hold 切窗顶格（#100） | 【实测】**注意：已发布的 v0.12.0 安装包不含 #100**（tag a9efb44 在 382133b 之前），安装版切窗仍误补（首字符 0x20 实证）；**最新 main pack:dir 上 #100 守卫生效**——切到全新窗口首字符 `F` 无空格，同窗 glue 保持正常。下个 release 随包发布即可，不立案 |
| 批量学词 Undo | 【实测】（顺带）四词批量 toast → Undo →「Undone … removed from dictionary」全链路正常 |

## 4. 五页面挑剔走查（安装版 v0.12.0）

- **Home**：统计卡（sessions/words/time/saved）随口述实时累计；四步引导、手机麦链接、当前人设卡齐全。观察（不立案）：「Clear all history」后统计卡数字保留——统计与历史分开持久化是既有设计（第 44 轮已核对公式），但最挑剔的隐私视角会预期「清空」也清统计，建议 FAQ 一句说明即可。
- **History**：空态文案、失败条目红字+Retry、Copy/Correct/Delete、两步清空全正常。
- **Personas**：内置人设 + Alt+1..9 徽标 + Auto-switch by app 规则卡 + 隐私说明（只读进程名/标题）齐全无破版。
- **Dictionary**：3/300 计数、逐词删除、搜索框、学词开关正常；空态提示清楚。
- **Settings**：General/Speech/AI model/About 四 tab 走查无破版；About 版本 0.12.0 (a0f2e5d) 与 Releases 链接正常；provider 四选项说明与风险提示（黄条）清晰。

## 5. 下一轮候选（按优先级）

1. **P2 Open Settings 跳错 tab**（~4 行）+ **P3 货币空格后处理**（~3 行）一个 PR 落地回归；顺带下个 release 带上 #100。
2. 云端成功路径补测（继续等有余额的 key）。
3. v0.11→v0.12 覆盖安装升级路径抽查（本轮做的是全新安装；升级路径上轮由开发侧验证，可再独立复核一次）。

## 6. 清场记录

- 测试安装已卸载（Uninstall SpeakType.exe，无注册表/快捷方式残留核对）
- %APPDATA%\SpeakType 与 %LOCALAPPDATA%\speaktype-desktop-updater 已从备份整体还原（含原模型，无 .part）
- SpeakType / Notepad 进程 0；测试 Setup 包已删除
- 防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
