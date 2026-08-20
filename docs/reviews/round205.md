# SpeakType 第 205 轮严格体验报告（user-experience-officer 实测）

- 日期：2026-08-20
- 版本：main @ c276796（含 #294 标点数字恢复、#295 配置导出/导入、#296 F8 超时文案）
- 环境：Windows Server 2022，打包版 `desktop\release\win-unpacked\SpeakType.exe`（npm ci && npm run build && npx electron-builder --dir），无真实麦克风，`--use-file-for-fake-audio-capture` 合成 WAV（System.Speech en-US 语音），本地 mock OpenAI 端点（127.0.0.1:8975）记录 prompt 全文，CDP(9333) 读写设置。
- 本轮重点：第 201 轮 Top3 ③（F8 英文指令 / 长选区）深挖 + #295/#296 回归 + 剩余 P3 复核。

## 一、F8 英文/混合语指令遵循度

### 实测结果

| 场景 | 结果 |
|---|---|
| 英文口述 "Translate to Chinese." + 英文选区（170 字符） | 【实测确认】tiny-q5_1 正确识别指令，mock 收到完整 prompt（len=344），指令与原文均无损嵌入 |
| 英文口述 "Make it shorter." + 记事本英文选区 | 【实测确认】端到端成功：选区被 mock 返回文本 `SHORT-MOCK-RESULT` 原样替换，且粘贴后剪贴板恢复为用户原内容 |
| prompt 框架语言 | 【实测确认】两次捕获的 prompt 框架全部为中文硬编码（polish.ts），与 UI 语言（en）、指令语言（英文）、选区语言（英文）均无关 |
| 真实小模型对照英文指令遵循度 | 【未测试】DeepSeek key 余额不足（Insufficient Balance）、可用中转 token 无效，本轮无真实 LLM 可用 |
| 混合语指令（中英夹杂） | 【未测试】本机仅有 en-US TTS 语音，无法合成中文口述音频 |

捕获的 prompt 实录（mock 日志节选）：

```
你按用户的口述指令改写下面这段文字（可能是改写、润色、翻译、扩写、缩写等）。
要求：
1. 只输出改写后的正文，不要解释、不要引号、不要 Markdown 代码块。
2. 严格遵守指令；指令没要求的部分不要擅自改动。
3. 保持原文的换行与列表结构。

口述指令：
"""Make it shorter."""

原文：
"""Our team delivered the new onboarding flow two weeks ahead of schedule, ..."""
```

（注：fake-mic 音频循环播放导致指令偶现重复识别为 "Make it shorter. Make it shorter."，为测试手法伪影，非产品问题。）

### 设计论证：prompt 框架应随什么切换？

结论建议：**随指令语言（instruction language）切换，UI 语言作为回退**。理由：

1. 【实测确认】指令与原文是逐字嵌入 prompt 的，模型收到的是「中文元指令 + 英文任务 + 英文正文」三语混合体。对 GPT-4o 级模型问题不大，但产品允许用户自配任意 OpenAI 兼容小模型（`polishModel` 自由填写），弱英文小模型遇到中文元指令、或纯英文小模型（如部分本地 7B）遇到中文框架时遵循度必然受损——这是【推测】，本轮无真实模型可量化验证。
2. UI 语言 ≠ 使用语言：`language`（听写语言）设为 en、UI 也是 en 的纯英文用户，其 F8 场景几乎必然是英文指令+英文选区，此时中文框架纯属噪声。
3. 指令语言最贴近用户意图（用户用什么语言说指令，就期待模型按该语言语境理解），且实现成本低：对识别后的指令做 CJK 字符占比检测即可二选一（中/英模板），无需完整语种识别。
4. `stripLlmWrapper` 已同时处理中英文包裹语，说明输出侧早已按双语设计，输入侧框架单语是不对称的遗留。

立案：**P2-2051** prompt 框架中文硬编码，不随指令/UI 语言切换（英文小模型场景遵循度风险）。

## 二、长文档选区（>2k 字符）

测试样本：2,695 字符英文文档（Markdown 标题 ×6 + 段落 + 列表项 ×10 + 空行），记事本全选 + F8 "Make it shorter."。

| 检查点 | 结果 |
|---|---|
| 是否截断 | 【实测确认】不截断：mock 收到 len=2880 完整 prompt，`# Project Status Report`、`## Section 5`、`- bullet item B5` 首中尾全部在场；polish.ts 源码亦无选区长度上限 |
| 结构保持（发送侧） | 【实测确认】换行、标题、列表符原样进入 prompt |
| 结构保持（回填侧） | 【实测确认】mock 返回 4 行含列表符文本，记事本内 CRLF 换行与列表结构完整回填 |
| 性能 | 【实测确认】mock 即时响应下端到端流畅无卡顿；真实模型下 2.7k 字符的生成延迟与 30s 超时是否够用【未测试】（无可用 LLM） |

无新立案（真实模型长文延迟建议下轮带真 key 验证）。

## 三、配置导出/导入（#295）边界 + #296 回归

### 导出

【实测确认】导出 JSON 结构符合 `ConfigExport`（app/configVersion/exportedAt/settings/personas），`polishApiKey`/`asrApiKey`/`doubaoAppKey`/`micDeviceId` 均未导出——凭据不落盘设计生效。

### 手改 JSON 后导入（核心边界测试）

对导出文件注入后导入：`unknownKey:"evil"`、`holdDelayMs:"not-a-number"`（错类型）、`autoPaste:"yes"`（错类型）、`hotwords:"single-string"`（错类型）、`polishApiKey:"INJECTED-KEY"`（非可携键）、`captionLines:5` + `theme:"dark"`（合法修改）。

| 检查点 | 结果 |
|---|---|
| 未知键 | 【实测确认】被忽略，`speaktype.json` 存储文件中无 `unknownKey` |
| 错类型值 | 【实测确认】全部被过滤：holdDelayMs 保持 120、autoPaste 保持 true、hotwords 保持 [] |
| 非可携键注入 | 【实测确认】`polishApiKey` 注入值未生效（仍为空）——导入侧同样拦截凭据 |
| 合法值 | 【实测确认】captionLines 3→5、theme system→dark 正确应用，UI 立即切换深色主题 |
| 损坏 JSON（`{ not json !!!`） | 【实测确认】优雅拒绝，`importConfig()` 返回 `{ok:false, invalid:true}`，应用不崩溃、设置不变 |
| 非法字段被丢弃时的用户提示 | 【实测确认】无任何提示——部分字段被静默丢弃后仍报导入成功，用户无从得知 holdDelayMs 等未生效（见 P3-2052）|
| 导入成功/失败的 UI toast 文案 | 【未测试】本轮经 preload API 触发导入，未逐一核对渲染层 toast 展示 |

立案：**P3-2052** 配置导入对被丢弃的未知/错类型字段零反馈，建议在成功 toast 中附「N 个字段已忽略」。

### #296（F8 超时文案）无回归确认

【实测确认】F8 改写成功路径完好（见第一节端到端替换）；`toast.rewriteFailedTimeoutBody` 键在 en/zh-CN/zh-TW/ja/ko 五语言 locale 全部在场，dictation.ts 超时分支引用正确。超时 toast 本体按本轮要求未重测【未测试】（第 201 轮已验）。

## 四、第 201 轮剩余 P3 复核

| 编号 | 现状 | 结论 |
|---|---|---|
| P3-2014 Parakeet "three thirty pm" | 【实测确认】仍在：Parakeet + ITN 实测输出 `The meeting is scheduled for 3 30 pm tomorrow afternoon.`——时刻未拼成 `3:30 pm`（较 201 轮的 `3 3 pm` 略有变化但依旧错误） | 保留 P3，值得下轮修（ITN 时刻冒号规则） |
| P3-2015 词典 `===` 分隔行 | 【实测确认】仍在：Dictionary 页粘贴 `Kubernetes / === / Postgres` 三行保存，`===` 被收录为热词 chip；源码 addFromText 仍无分隔行过滤 | 保留 P3，与 P3-2052 可一并小修 |
| P3-2016 确认按钮宽度跳动 | 【实测确认】已修复：Clear → "Clear all words? Click again" → 4s 回弹全程按钮宽度不变（Dictionary.tsx 以 invisible 长文案占位），实测截图对比无跳动 | 关闭 |

## 五、立案汇总

| 编号 | 级别 | 问题 | 状态 |
|---|---|---|---|
| P2-2051 | P2 | F8 rewrite prompt 框架中文硬编码，不随指令/UI 语言切换 | 新立案（201 轮 Top3 ③ 落地） |
| P3-2052 | P3 | 配置导入静默丢弃非法字段，无「已忽略 N 项」反馈 | 新立案 |
| P3-2014 | P3 | Parakeet ITN 时刻 `three thirty pm` → `3 30 pm` | 复核仍在 |
| P3-2015 | P3 | 词典 `===` 分隔行被当热词收录 | 复核仍在 |
| P3-2016 | — | 确认按钮宽度跳动 | 复核已修复，关闭 |

## 六、下轮 Top3 建议

1. **P2-2051 prompt 语言框架**：按指令语言（CJK 占比检测）二选一中/英模板，并用真实小模型（需补可用 API key）对照英文指令遵循度前后差异。
2. **P3-2014 ITN 时刻规则**：`three thirty pm` 应输出 `3:30 pm`；连同 201 轮 P2-2011 金额规则一起补 ITN fixture 回归集。
3. **P3-2015 + P3-2052 小修打包**：词典导入过滤 `===`/`---` 类分隔行；配置导入 toast 附被忽略字段计数。

## 附：本轮测试局限

- 无真实 LLM（DeepSeek 余额不足、中转 token 无效），F8 遵循度只能验证到「prompt 正确送达」层，模型端行为全部【未测试】。
- 仅 en-US TTS，混合语/中文指令【未测试】。
- fake-mic 循环播放导致长按录音时指令可能重复入识别，属测试手法局限。
