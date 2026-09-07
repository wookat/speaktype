# 第 119 轮体验官审查报告 —— #198 回归 + 专项 c：历史 Correct/自动学词英文与中英混排边界

- 审查日期：2026-08-16
- 基线：main@a317b85（含 PR #198 rewriteTarget 入口消费 + 四类导出 BOM；#199 skill）
- 打包：`npm run pack:dir` 全绿（win-unpacked，SpeakType.exe 构建时间 2026-08-16 21:43）
- 方法：打包应用运行时实测（keybd_event 模拟热键 + TTS/固定音频 + UIA 读控件）+ asar 提取 shipped 函数矩阵；不改产品代码
- 证据分级：【实测】打包运行时；【源码】源码/asar 检查；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3×2，观察 ×1。**

- P3-①：同一轮停顿内多处修改的自动学词拒学边界过宽（#194 占比阈值按「首尾变化跨度」而非实际改动量；近距改动合并成含标点 diff）——两处各自合法的纠错一起做就全学不进。
- P3-②：历史 Correct 的「加入词典」建议只认 2-6 字纯中文，英文纠正永远不弹建议——与落字后自动学词（英文 3-20 字符可学）不对称。
- 观察①：带变音符的英文词（Davidé）不在自动学词可学词形内（en 词形限 ASCII，设计取舍如实记录）。

## ① PR #198 回归抽查（全过）

### 1. F8 静音后普通听写不被劫持【实测】

- mock OpenAI 端点（18099，逐请求落盘）+ polish 配置指向 mock。
- 记事本选中 `TARGETWORD` → F8 按住约 1.8s 全程静音松开（log：`durationMs=1793 maxPeak=0 voicedMs=0`）→ 无改写请求发出。
- 紧接普通 RightCtrl 口述英文 → 落字 `Checking for the Reite League Now.`（口述内容直接落在光标处，选区未被 LLM 输出覆盖）；mock 自启动以来 **chat/completions 请求数 = 0**；history 顶部为普通听写条目。
- 118 轮 P2-① 场景不再复现，修复有效。

### 2. 历史 md 导出 WordPad 不乱码【实测】

- History 页 Export → 首字节 `EF BB BF`（BOM ✓），322 条全量。
- WordPad 实际打开：标题/时间戳/正文渲染正常，检索定位到中文段（人设 prompt 中文长句）显示完全正常，无 ANSI mojibake（118 轮乱码场景消除）。

### 3. 词典 round-trip【实测】

- 注入 4 词（SpType / 开慧 / Davidé / 少しずつ）→ Export txt 首字节 `EF BB BF`，正文逐字节 `SpType\n开慧\nDavidé\n少しずつ\n`。
- Clear（两步确认）→ 0/300 → 整文件（含 BOM）粘贴导入 Save → 配置 hotwords 恢复为原 4 词，BOM 被 trim 正确剥离、无空条目、无重复。

### 4. 顺带：转录 TXT/SRT 导出 BOM【实测】

- zh1.mp3 转录后 TXT/SRT 导出首字节均 `EF BB BF`。#198 四类导出入口全部验到。

## ② 专项 c：历史 Correct/自动学词在英文与中英混排文本上的边界（#182×#196 交互）

方法：asar 提取打包产物内 shipped `extractCorrections`/`learnableWord` 跑 17 例矩阵【源码】+ 关键结论用打包应用真实听写-手改-结算闭环复核【实测】。

### 正向边界（全过）

| 用例 | 结果 | 证据 |
| --- | --- | --- |
| 中文语境内英文错词修正（用SpeakTipe写代码→SpeakType） | 学入 SpeakType | 【源码】矩阵 |
| 单字同音改、右邻拉丁（我们开会David→开慧David） | 学入 开慧（#196 以拉丁为无歧义边界） | 【源码】矩阵 |
| 单字改、右邻数字（开会3点→开慧3点） | 学入 开慧 | 【源码】矩阵 |
| 连字符修正（GPT4o→GPT-4o） | 学入 GPT-4o | 【源码】矩阵 |
| 混排纯大小写差异（speaktype→Speaktype） | 不学（#87 保持） | 【源码】矩阵 |
| 混排整句重写（中文句→英文句） | 不学（#194 保持） | 【源码】矩阵 |
| 句中两处间隔适中的整词修改（review→feedback + report→summary，42 字符句） | 两词都学入 | 【实测】听写+手改闭环，词典 +2 |
| 学词→纠错闭环：词典含 SpeakType，听写 raw "Speak type" | 落字合并为 "SpeakType"（大小写/空格不敏感整词替换，#182 家族） | 【实测】raw/text 对照 |
| 历史 Correct 中文建议 chip | 第 115 轮已验证有效（本轮未重复） | 【实测·115】 |

### P3-① 同一轮多处修改的拒学边界过宽

两种形态，各自的两处修改**单独做都能学**，一起做（同一 1.5s 停顿轮内）就全学不进：

1. **首尾跨度 >60% 全拒**【实测+源码】："The review and the report are done today."（42 字符）同轮改 review→feedback + today→tomorro → 词典 +0（矩阵与运行时一致）。根因：`extractCorrections` 的 #194 占比阈值在 **LCS 拆段之前**用「首个改动到最后改动的跨度」（含中间未改文本）判定 `ma.length > a.length*0.6`，两端各改一词即触发。
2. **近距改动合并成含标点 diff 拒学**【实测+源码】：「今天下午3点开会，预算是5200元」同轮改 会→慧 + 预→域 → diff 合并为 `会，预→慧，域`（跨度 ≤6 走短路径不拆段），`慧，域` 含标点不过 2-6 纯中文门槛 → 词典 +0。而 115 轮已验证这两处各自单独改均学入。
3. 中英混排短句放大形态 1：「把Bericht发给他」（11 字符）改 Bericht→report，单处合法整词替换即占比 7/11>60% 被拒【源码】——英文词在中文短句里字符占比天然高。

影响：用户一轮停顿里顺手改两处（很常见）时自动学词静默失效；不腐蚀落字、无错学，属「漏学」侧问题。
建议修法：占比阈值移到 LCS 拆段之后按「实际改动字符数之和」判定；短路径（跨度 ≤6）在合并 diff 不可学时回退 LCS 拆段。

### P3-② 历史 Correct 英文纠正无学词建议

【源码+实测】`suggestHotword`（format.ts）只在中间变化段为 2-6 字**纯中文**时弹「加入词典」chip；本轮在 History 用 Correct 把 review 改为 critique，保存成功、文本持久化（322 条同步），但无任何学词建议——而同样的英文改动发生在落字输入框会被 watchedit 学入（3-20 字符英文词形）。两条纠错路径的可学词形不对称，英文用户在 History 修正专名永远得不到词典沉淀机会。
建议修法：suggestHotword 复用 learnableWord 的英文词形（约 2 行），并做与 watchedit 一致的词边界外扩。

### 观察①

`learnableWord` 英文词形 `^[A-Za-z][A-Za-z0-9-]{2,19}$` 不含变音符：David→Davidé 的 diff 提出正确但 `learn=null`【源码】。防误学面更广的取舍，如实记录不立案。

## ③ 核心回归（全过）

- RightCtrl 中文含 ITN：zh1.mp3 →「今天下午3点开会，预算是5200元」准确落字【实测】。
- Alt+Q 免按：en2.wav → "The review and the report are done today." 准确落字【实测】。

## 环境限制（如实挂账）

- 本机已无中文 TTS 语音（System.Speech/WinRT 均仅 en-US David/Zira/Mark），中英混排句的运行时听写仅能用既有固定音频（zh1.mp3）构造；纯矩阵结论已标注【源码】。
- 系统睡眠/休眠恢复、多显示器分辨率变更两项专项（a/b）本机虚拟环境无法可靠构造，本轮未选、未验证。
- 真手机麦/云端 key/Word 打开导出文件仍【未验证】挂账。

## 测毕清场

- SpeakType/notepad/WordPad/mock node 进程全部退出；18099/43117 无监听
- speaktype.json、history.json 由 round119-*.bak 整体还原（含词典清空恢复原状）
- transcribe-last.json、临时导出（history-119.md/dict-119.txt/zh1-119.txt/zh1-119.srt）、测试音频删除
- 防火墙三 profiles OFF；repo 回 main、工作区干净
