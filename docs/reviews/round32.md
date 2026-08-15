# SpeakType 第 32 轮严格审查报告

- 审查对象：main@2cbf4f8（含 PR #83：英文热词大小写/空格/连字符不敏感整词纠错 + whisper 主动停服不再误 warn）
- 方法：git pull → `npm run pack:dir`（全绿）→ `release\win-unpacked\SpeakType.exe` 真机走查 + 函数级对拷验证
- 环境：Windows Server 2022，未开防火墙、无网络阻断；测试状态已还原（模型 parakeet、语言 English、热词已清空、whisper-server 无残留）
- 证据标注：【实测】打包应用真机证据 /【源码】源码推断 /【函数级】对拷实现的 node 用例 /【未验证】未能验证
- 本轮未改任何产品代码，未开 PR

---

## 一、#83 两项回归——全部通过

### 1. 英文热词纠错——【实测】+【函数级】通过
- 【实测】词典加 `SpeakType` → Parakeet 口述 "I use speak type every day" → 落字 **"I use SpeakType every day for dictation."**，上轮的空壳问题闭环。
- 【函数级】对拷 `correctAsciiHotword` 10 用例：`speaktype`/`Speaktype`/`speak type` 全命中；宣称的两个反例守住——复数 "speak types" 不误替换、跨标点 "speak. type" 不误替换；`GPT-4` 对 "gpt 4" 命中；多次出现全部替换；已正确文本幂等。
- 记录在案的两个边界（不立案，用户可控）：连字符链 "speak-type-writer"→"SpeakType-writer"；用户若添加 "OnePlus" 这类普通词组合的热词，"one plus one"→"OnePlus one"。热词是用户显式添加的专有名词，风险可接受。

### 2. whisper 主动停服无假 warn——【实测】通过
whisper base 听写一句 → 切回 SenseVoice → 日志仅 `local whisper-server stopped`，**无 `exited (null)` warn**，进程即刻退出。

---

## 二、新发现：Learn from your corrections 对英文同样是静默空壳（本轮最重要发现，P2）

#83 修好了热词纠错的英文侧，但**自动学词侧的语言门槛原样存在**：

- 【源码】`watchedit.ts` `learnableWord` 门槛是 `^[\u4e00-\u9fff]{2,6}$`——改后的词必须是 2-6 字纯中文才收进词典，英文修正永远学不到。
- 【实测】负向验证：Parakeet 口述落字 "The final report is ready for your review." → 在记事本内手动把 "report" 改成 "Bericht" → 等待观察进程结算后，**全程日志无一条 auto-learn，词典无新增**。
- Dictionary 页开关文案 "After text lands, words you manually fix in the target field are learned into the dictionary (compared locally, never uploaded)" **无任何语言限定**，与上轮热词问题同一句式的承诺不符；受众同样是 #76 后默认主推的英文用户。
- 修复建议（~6 行）：`learnableWord` 放行 ASCII 词（如 `^[A-Za-z][A-Za-z0-9'-]{1,19}$`），并要求 wrong/right 大小写不敏感地不同（避免把纯大小写调整学成热词）；上游 `extractCorrections` 的 `MAX_SEGMENT=10` 对英文单词偏紧（"dictation"=9 字符将将过），建议放宽到 20。
- 反问一并回答：这套「UIA 盯输入框自动学词」设计本身是竞品没有的差异化亮点（Wispr Flow 的 self-correction 是云端改写，不学词典），值得把英文补齐而不是砍掉。

## 三、"Sp type" 模糊纠错 ROI 论证——结论：不做

- 上轮 "Sp type" 出自 SenseVoice 听英文的误识别；SenseVoice 的定位是中文，英文用户默认/推荐 Parakeet。【实测】Parakeet 输出 "speak type" 被 #83 精确匹配纠正成功——**主推路径已闭环**。
- 模糊匹配（编辑距离/前缀容错）会把 "sp type"→"SpeakType" 的收益换来 "we speak French type of thing" 这类误替换风险，且英文 token 短、碰撞率远高于拼音近音归并。
- 建议：维持现状记录为已知边界；若未来用户反馈集中，再考虑「仅首 token、编辑距离 ≤1、且整句无其他候选」的保守版。

## 四、官网/README 零 key 文案 + 免按竞品对比（延续上轮）

- 维持上轮 P3 建议：官网 polishing 段与 README 各加一句「本地端点（Ollama/LM Studio）API Key 可留空」，Pick an engine 步骤的 "paste your own API key" 补上 or-local 措辞。纯文案，随任意 PR 顺手。
- 免按对比结论不变：交互侧已与 Wispr Flow 对齐（双击进入/自动退出/toast），剩余差距在云端润色质量，属模型能力非产品缺口。**英文自动学词补齐后，「词典+学词全本地」将成为对 Flow 的第二个硬差异点**（第一个是零 key 本地链路）。

## 五、例行回归

- RightCtrl→Parakeet 落字逐字精确（含热词纠正句）；whisper base 落字正常（"warn"→"Worn" 为模型既有基线，非回归）；切模型 sherpa worker/whisper-server 释放日志齐全。
- Dictionary 页交互（加词/Clear/Save）正常。

## 六、分级汇总

| 级别 | 数量 | 内容 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 | Learn from corrections 英文静默空壳（learnableWord 纯中文门槛 + MAX_SEGMENT 偏紧），与开关文案承诺不符 |
| P3 | 3 | ① 官网/README 零 key 文案（上轮遗留）② latest 预拨加 1 行日志（上轮遗留，回归清单条目仍无法按写法验证）③ 录音会话中切模型无谓重载（上轮遗留） |

## 七、下轮优先级建议

1. **P2** learnableWord 放行 ASCII 词 + MAX_SEGMENT 放宽（~6 行，配英文正向实测）
2. P3-② 预拨日志 1 行（顺手同 PR）
3. P3-① 官网/README 零 key 文案
4. P3-③ 录音会话守卫

## 八、未验证范围

- 英文自动学词正向链路（当前实现学不到，修复后需真机验证）
- 中文自动学词正向链路（本机无中文 TTS 口播条件，历轮亦未验证）
- 正向更新横幅 UI（无新版本）
- 真人麦、APK、云端三通道（照旧）
