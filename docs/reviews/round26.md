# SpeakType 严格审查报告（审→改循环 · 第 26 轮）

- 审查日期：2026-08-14
- 对象：main@e45e780（含 PR #76），本地 `npm run pack:dir` 全绿（签名通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022（1280×720，系统深色、系统区域 en-US），VB-Cable + System.Speech TTS 驱动真实识别；F8 完整链路用本地 OpenAI 兼容 mock 端点（127.0.0.1:18099，仅本轮测试用，已清理）
- 截图：`C:\Users\Administrator\speaktype-review\round26\shots\`（01-12）
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制
- 测试后已还原：polish 配置清空、测试人设已删、规则恢复为 notepad.exe→To my boss、mock 进程已停

## 一、#76 三项修复回归

| 修复项 | 结果 | 证据 |
|---|---|---|
| 英语/欧洲语系系统全新用户默认 Parakeet+en | ✅ 通过 | 【实测】暂移 speaktype.json 模拟全新用户（en-US 系统）：设置→Speech 显示 Local model=parakeet-tdt-0.6b-v3 (660MB)、Recognition language=English、Status Ready（shots/01-02）；已有配置还原后不受影响 |
| runningApps 过滤 SYSTEM_APPS | ✅ 通过 | 【实测】规则下拉只剩 chrome.exe / docker desktop.exe / notepad.exe，speaktype.exe、textinputhost.exe、shutdown.exe 等已消失（shots/08，对比上轮 shots/03） |
| 悬浮条徽标 working 态保留 | ✅ 通过（源码+侧证） | 【源码】panel.tsx 条件放宽为 `(recording || working)`（1 行，diff 核对）；【实测】F8 录音态徽标可见（shots/04）。working 窗口期太短未截到独立帧 |

**核心链路（本轮包实测）**：RightCtrl→落字（经 polish mock 链路）逐字精确；F8 改写全链路通过（见下）。Alt+Q 本轮 diff 未涉及，维持上轮实测结论。**0 回归。**

## 二、重点①a：从零新建 persona 规则路径（真机走通）

【实测】完整路径顺畅：Personas→New persona 弹窗（名称/图标 13 选/风格说明，未填时 Save 置灰）→ 建成 "Casual chat"（Custom 徽标、自动分配 Alt+8，shots/09-11）→ Add rule → 输入框 datalist 选运行中应用 → 右侧人设下拉绑定 → Delete 可删行。警示条在 polish 已配置时正确隐藏（shots/07）。

两个打磨点（P3）：
1. Add rule 新行的人设默认 Default——Default 恰是"不改变落字"的人设，规则=Default 实际无意义；建议默认选中最近编辑/新建的非 Default 人设。
2. 仍无"测试规则"手段：配完只能真的去目标应用说一句验证。上轮判断维持——非必需，等真实反馈。

## 三、重点①b：F8 改写完整链路（mock 实测，本产品首次全链路验证）

【实测通过】流程：Notepad 选中整行 → 按住 F8 → 口播指令 "Translate this into formal English." → 松键 → 选区被替换为 mock 返回内容 `MOCK-REWRITE [Translate this into formal English.]: PLEASE MAKE THIS SENTENCE BETTER SOON`（shots/05）。证明：选区抓取（copySelection）、指令 ASR 转写、rewriteSelection 请求组装（指令与原文分别注入 prompt）、选区替换落字全部正确。无 polish 配置时 toast+直达设置也复验（shots/03）。

**新发现 [P2] 改写模式悬浮条显示命中人设徽标，具有误导性**：【实测】F8 录音时悬浮条照样显示 "To my boss" 徽标（shots/04），但 rewriteSelection 完全不使用 persona（dictation.ts:564-565 只传 selection+raw 指令）——用户会以为改写将套用该人设语气，实际无关。修复 1 行：report 时 rewriteTarget 非空则不带 appPersonaName（或换成专属"改写中"徽标）。

**[P3]** rewriteFailed（端点超时/异常）只有 toast 无重试，指令白说一遍；可接受，暂不动。

**建议采纳（工程投资）**：本轮 mock 验证方式值得固化——在回归清单加"F8 mock 全链路"条目，mock 脚本 20 行随 docs 存放，彻底解决"F8 链路永远只能人工验证"的历史欠账。

## 四、重点②：migrate.ts 旧用户迁移 vs 新默认

【源码】migrate.ts 只在新 userData 无 speaktype.json 时，从旧中文目录名（"SpeakType xxx"）拷一次配置。**结论：不需要处理，维持现状。** 理由：
1. 命中该路径的都是老版本既有用户，speaktype.json 里的 localModel/language 是其用过的真实状态——迁移保留用户选择是正确产品行为，"新默认更优"只对零配置用户成立；
2. #76 故意只改 DEFAULT_SETTINGS 而不动存量，边界干净；若迁移后再强改，反而制造"重装后模型/语言变了"的投诉；
3. 影响面随时间趋零（旧中文目录名只存在于早期版本）。
唯一可做的廉价加法（P3，可不做）：迁移日志已有 "migrated legacy userData from"，若未来收到英语用户反馈，可在迁移后首启横幅提示"可切换 Parakeet"，而非改默认。

## 五、重点③：历史导出 TXT 选项

**维持第 24 轮结论：不做。** .md 即纯文本、双击可开；加格式选择的交互成本大于收益；无真实需求信号。若将来做，挂在另存为对话框"保存类型"下拉里（同内容去 Markdown 前缀），不动页面 UI。

## 六、问题清单（P0=0，P1=0）

- **[P2] F8 改写模式误显命中人设徽标**（第三节，1 行修复）。
- **[P2] Parakeet 下 "Format spoken numbers (Chinese)" 开关仍显示且默认开**：【实测】全新 en 用户 Speech 页可见该中文数字格式化开关（shots/02），Parakeet 无中文输出，纯噪声。#71 已为 Force Simplified Chinese 做过"Parakeet 下隐藏"，同一逻辑应推广到此开关。~3 行。
- **[P3] Add rule 新行人设默认 Default**（第二节）。
- **[P3] rewriteFailed 无重试**（第三节）。
- **[P3] 首页仍无人设规则入口**（第 24 轮遗留，维持低优）。

## 七、反问：现有设计是否最优

- en 默认 Parakeet 的实现取 `Intl.DateTimeFormat` 系统区域而非 app.getLocale()，且 CJK 判断含 yue——边界处理对；只动 DEFAULT_SETTINGS 不动存量是最小正确解。
- F8 改写复用 hold 录音态是聪明的复用，但徽标这类"录音附属信息"也被一并复用了——建议给 status 加 mode 字段（dictate/rewrite），面板按 mode 决定显示什么，比逐个字段打补丁可持续。
- SYSTEM_APPS 用静态黑名单而非启发式（窗口尺寸/系统目录判断）是对的：可预测、可维护，误杀了用户还能手输。

## 八、下轮优先级建议

1. F8 改写模式徽标误导修复（1 行，或 status.mode 字段化）。
2. Parakeet 下隐藏中文数字格式化开关（~3 行）。
3. F8 mock 全链路入回归清单（docs + 20 行脚本，固化本轮验证方式）。
4. （低优）Add rule 默认人设、首页规则入口。

## 九、未验证清单

- working 态徽标的独立视觉帧（窗口期 <1s，源码 1 行已核）。
- Alt+Q 本轮构建（diff 未涉及，上轮实测通过）。
- 真实 LLM 端点的改写质量（mock 只验链路不验质量）、真人麦、中文真人口播、APK、官网（本轮无相关变更）。
- 非 en 欧洲语系（如 de/fr 系统）默认值分支（源码同一正则路径，仅 en-US 实测）。
