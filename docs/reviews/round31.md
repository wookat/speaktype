# SpeakType 第 31 轮严格审查报告

- 审查对象：main@4919b9a（含 PR #82：切模型同时停 whisper-server + 新版提示启动预拨）
- 方法：git pull → `npm run pack:dir`（全绿）→ `release\win-unpacked\SpeakType.exe` 真机走查
- 环境：Windows Server 2022，未开防火墙、无网络阻断；测试状态已还原（模型 parakeet、语言 English、热词已清空、whisper-server 无残留）
- 证据标注：【实测】打包应用真机证据 /【源码】源码推断 /【未验证】未能验证
- 本轮未改任何产品代码，未开 PR

---

## 一、#82 两项回归——全部通过

### 1. 切模型即时停 whisper-server——【实测】通过
whisper base-q5_1 听写一句（落字正确）→ whisper-server.exe 启动（169MB）→ 切回 SenseVoice：**进程即刻退出**，日志出现 `local whisper-server stopped`。上轮 P2-1 闭环。
- 小瑕疵（P3）：紧跟其后有一条 `[warn] local whisper-server exited (null)`——exit 处理器对"主动 kill"也发 warn，日志里制造了假告警。建议主动停时跳过 warn（~2 行）。

### 2. 启动预拨 latest release——【源码】通过 +【实测】限流解除后 API 正常 200
- `setTimeout(fetchLatestTag, 5000)` 启动 5 秒后预拨并缓存，About 打开走缓存即开即显；失败静默、成功后不再重复请求，逻辑正确。
- 本轮本机 IP 已脱离 GH 限流（直接调 API 返回 200，tag=v0.10.0=当前版本），横幅正确不显示。正向横幅 UI 依旧【未验证】（无新版本可用），待 v0.11 发布自然验证。
- 小瑕疵（P3）：回归清单写"启动约 5 秒后 log 已完成 latest release 预拨"，但**实现里预拨成功/失败都不打任何日志**——清单条目无法按写法验证。建议 fetchLatestTag 成功时 `log.info("latest release tag: …")`（1 行），清单即可落地。

---

## 二、上轮 P3 复查：录音会话中切模型

#82 未涉及此项，行为与上轮一致（守卫只看 recognize 在途，partial 间隙切换仍会卸载+0.25s 重载旧模型）。文字无损，维持 P3 排队。

---

## 三、新发现：英文热词完全静默无效（本轮最重要发现）

**P2：Dictionary 页收下英文热词并承诺"recognition will respect them"，但纠错实现是纯中文的，英文热词零作用。**

- 【实测】Dictionary 添加热词 `SpeakType` 保存 → 口述 "I use speak type every day" → 落字 "I use **Sp type** every day for dictation."；删掉热词重说 → "**Spe type**"。对照证明：ASR 本身把 "speak type" 听成 Sp/Spe type，而热词纠错对这个近音错误**完全没有介入**。
- 【源码】`hotwords.ts` `correctHotwords` 开头即 `CJK.test(trimmed)` 把非纯中文热词直接 continue——匹配算法是拼音近音归并（平翘舌/前后鼻音），天然只服务中文。
- 为什么是 P2 而非 P3：
  1. UI 文案无任何语言限定（"Add names and jargon unique to you — recognition will respect them"），承诺与实现不符；
  2. #76 起英语系统新用户默认 Parakeet+English——**主推给英文用户的产品，词典对英文用户是空壳**；
  3. 与第 21 轮"人设规则未配润色静默无效"同族："配了没反应"是最伤信任的一类问题。
- 修复建议（两档）：
  - 最小（~5 行 + 文案）：Dictionary 页明示"热词纠错当前仅支持中文热词"，英文热词至少做大小写/空格规范化精确替换（"speaktype"→"SpeakType"）；
  - 正解（~40 行）：英文热词做 token 级模糊匹配（大小写不敏感 + 连写/分写归并 + 每 token 编辑距离 ≤1），"spe type"→"SpeakType" 即可命中。CapsWriter 的音素模糊热词即此思路。

---

## 四、竞品对比：免按体验 / 无 key 本地端点宣传

- **免按体验**：双击 RightCtrl 进免按（Wispr Flow 同款交互，第 12 轮实测）+ Alt+Q、句间空格、静音自动退出、退出 toast 均已到位（本轮复测两句连落正常）。与 Wispr Flow 的免按差距已不在交互，而在**口语自我修正质量**（Flow 云端模型改写更强）——那是润色模型能力，不是产品缺口。
- **无 key 本地端点宣传**：官网已有 local-first/offline/Ollama 叙事（实查线上文案），README 提及 Ollama。缺一句点睛：**"本地端点 API Key 可留空"**——#79 做出的差异化能力（Wispr Flow 强制云端、强制账号）在官网/README 均未点明，Pick an engine 步骤甚至写 "paste your own API key"。建议官网 polishing 段与 README 各加一句（P3，纯文案）。

## 五、例行回归

- RightCtrl 长句：Peter Johnson 不拆、问号正确（"Friday at 330?"——"three thirty"→"330" 是 SenseVoice 英文 ITN 的既有基线，非回归；英文用户主推 Parakeet 不受影响）。
- 免按 Alt+Q：两句分条落字正常、退出正常。
- whisper 听写落字正确；Dictionary 页视觉干净（浅色）。

## 六、分级汇总

| 级别 | 数量 | 内容 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 | 英文热词静默无效 + UI 承诺不符（词典对英文用户是空壳） |
| P3 | 4 | ① 主动停 whisper-server 的假 warn ② latest 预拨无日志（回归清单条目落空）③ 录音会话中切模型无谓重载（上轮遗留）④ 官网/README 补"本地端点零 key"一句 |

## 七、下轮优先级建议

1. **P2** 英文热词：最小档先兜底（文案 + 精确替换），正解模糊匹配可另评估
2. P3-② 预拨加 1 行日志（顺手）+ P3-① 假 warn（顺手，可同 PR）
3. P3-④ 官网/README 零 key 文案
4. P3-③ 录音会话守卫

## 八、未验证范围

- 正向更新横幅 UI（无新版本）
- "Learn from your corrections" 自动学词链路（本轮只测了手动热词）
- 真人麦、中文口播、APK、云端三通道（照旧）
