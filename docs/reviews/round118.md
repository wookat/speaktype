# SpeakType 第 118 轮打包运行时审查报告

- 基线：`main@a92b6eb`（与 115-117 轮同提交，复用其 pack:dir 产物打包实测）
- 审查日期：2026-08-16
- 证据分级：【实测】打包运行时直接证据；【源码】源码检查；【推测】推理；【未验证】未覆盖

## 结论总览

**P0=0，P1=0，P2×1，P3×1，观察 ×3；并更正第 117 轮观察① 一条。**

---

## P2-①：F8 改写遇空结果后 `rewriteTarget` 泄漏——下一次普通听写被误当作改写，口述内容丢失、选区被误替换【实测】

**复现（打包实测，mock 端点逐请求落盘）**：
1. 记事本选中 `TARGETWORD`，按住 F8 全程静音松开 → 走「没听清」空结果分支，正常无落字；
2. 之后**普通按住 RightCtrl** 口述 "checking for the rewrite leak now" → 该次听写**没有落口述文字**，而是把仍选中的 `TARGETWORD` 替换成了 mock 改写结果 `REWRITTEN-BY-MOCK-117 #1`；mock 收到一次 /chat/completions（本不该有）；history 条目 text=改写结果、raw=口述原文。

**根因（源码）**：`dictation.ts` 的 `finalize()` 只在 raw 非空的正常路径清 `this.rewriteTarget`（约 L650）；两条空结果提前 return 的分支（整段静音 L599-607、`!raw` L640-647）以及 ASR 异常分支（L614-635）都**不清**。`cancel()` 会清（L429），`start()` 不清。于是 F8 静音/空识别/识别失败后，改写意图残留到下一次任意听写。

**影响**：用户按 F8 没说清 → 下一句正常听写「说了白说」，且当前选区被一段 LLM 输出静默覆盖——核心链路数据丢失级缺陷，判 P2。

**修法（~3 行）**：三条提前 return 的分支（或 `finalize()` 入口/`start()` 全新会话时）统一 `this.rewriteTarget = null`。

## P3-②：全部导出（词典 txt/历史 md/转录 TXT/SRT）均为 UTF-8 无 BOM——WordPad 等 ANSI 默认编辑器打开 CJK 乱码【实测】

- 四类导出首字节均非 `EF BB BF`（实测 hex），内容本身 UTF-8 正确；
- Windows 记事本（1903+ 默认 UTF-8 检测）打开中文 TXT 正常【实测截图】；
- **WordPad 打开同一文件全乱码**【实测截图】（无 BOM 时按 ANSI 解码）；Word 未安装【未验证】（Word 有编码探测，通常能识别，但无 BOM 时非必然）；主流播放器对 SRT 无 BOM 一般可容忍【推测】。
- **修法（~1 行/处）**：导出 Blob 前缀 `\ufeff`。判 P3（记事本/VSCode 等现代编辑器不受影响，影响面为旧编辑器）。

## ① 空结果路径梳理与轻提示论证（117 轮观察①闭环）

**路径清单（源码 + 实测）**：
| 路径 | 现状 | 证据 |
|---|---|---|
| 整段静音/纯噪音（maxPeak<250 或 voicedMs<100ms） | 不送 ASR，toast「Didn't catch that / No speech detected」 | 【实测截图】 |
| ASR 返回空（parakeet 说中文、whisper 空返回同路径） | 同一 toast「Didn't catch that」 | 【实测截图】 |
| 时长 < minRecordMs 且 raw 非空 | 静默丢弃无提示 | 【源码】L640-647（toast 仅在 `!raw` 时弹；hold 门槛 120ms+300ms 下极难触达，影响面小） |
| 免按模式静音轮 | 有意不弹（连续 6 轮后弹退出提示） | 【源码】 |
| F8 改写空结果 | 弹「没听清」但泄漏 rewriteTarget | 见 P2-① |

**更正第 117 轮观察①**：「parakeet 说中文空结果静默无提示」记录有误——实为 toast 已统一弹出（4 秒自隐），上轮截图时机晚于 toast 存续期造成误判。本轮用脚本在 keyup 后 1.2-2.2 秒定点截屏实证两条主路径都有清晰 toast。**设计结论：现状已满足「空结果必有一次轻提示」，无需新增；不立案。**

## ② 导出/导入全链路专项【实测】

- **词典 txt round-trip 过**：注入 5 词（英文/中文/法语变音 Davidé/连字符/日文假名）→ Export 落盘逐字节核对（UTF-8、LF、一行一词）→ Clear（两步确认 #177 回归过）→ 全清 0/300 → 粘贴文件内容 Save → `settings.hotwords` 与原 5 词完全一致，无序变/丢失/转义损坏。
- **历史 md 导出完整性过**：324 条全量导出（含 10.7k 字符转录长条目**全文无截断**）；Correct 注入的特殊字符 `<b>&"quotes"' `code` #tag —` 原样保留；多行文本按两空格缩进保持同一列表项（源码注释设计一致）；转录条目 personaName=来源文件名。
- **五语时间戳**：en `8/16/2026, 9:06:26 PM`、zh `2026/8/16 21:06:26`、ja `2026/8/16 21:06:26` 三语实测按 uiLanguage 本地化（`toLocaleString(uiLanguage)`）；ko/zh-TW 同机制【源码】。
- **TXT/SRT 导出**：10 分钟 45 段长转录 TXT 10.6KB/SRT 12.2KB 内容完整、SRT 序号+时间轴格式合法；中文 TXT/SRT 记事本打开无乱码；编码无 BOM 见 P3-②。
- 附带复证 115 轮结论：词典热词同样作用于文件转录（词典含「开慧」时 zh1.mp3 转录被同音替换）——114 P3-① 修复方向需覆盖转录路径，本轮不重复立案。

## ③ 核心回归【实测】

- RightCtrl 中文（sensevoice）：「今天下午3点开会预算是5200元」含 ITN 准确落字 ✓。
- Alt+Q 免按：进入/落字/退出正常 ✓。
- **观察③**：同一 phone.wav 回放，"phone" 4 次中 3 次识别成 "phoneone"（hold 与免按路径都出现），同日早些时候 1 次全对——TTS 合成音的 ASR 边界抖动，非本轮改动引入；先记录，若真人语音也复现再立案。

## 观察（不立案）

1. 词典 Clear 的两步确认约 5 秒超时回位，期间按钮位移，连击易误触相邻 Export（测试摩擦级）。
2. minRecordMs 静默丢弃分支无提示（影响面极小，见上表）。
3. 免按 "phoneone" 识别抖动（见核心回归）。

## 清场核对

进程 0（SpeakType/node/notepad）、43117/18099 无监听、无 .part、配置/历史（321 条）整体还原、词典 0 条、transcribe-last.json 删、防火墙三 OFF、repo 回 main。测试产物（导出文件/截图/脚本）留存 review 工作区不入库。
