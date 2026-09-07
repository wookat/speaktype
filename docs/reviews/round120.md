# 第 120 轮体验官审查报告 —— #200/#201 回归 + 专项 b：词典 300 条满编听写纠错延迟与准确性

- 审查日期：2026-08-16
- 基线：main@5389737（含 #200 拆段后按实际改动量+段内单字回扩+英文建议词形、#201 求和先于 MAX_SEGMENT 过滤热修；#202 skill）
- 打包：`npm run pack:dir` 全绿（win-unpacked，SpeakType.exe 构建时间 2026-08-16 22:36）
- 方法：打包应用运行时实测（keybd_event 热键 + TTS/固定音频 + UIA/SendKeys 手改）；不改产品代码
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案，观察 ×1。**

## ① #200/#201 回归抽查（3/3 全过）

### 1. 同轮双改仍学【实测】

- 首尾跨度形态（119 轮 P3-① a）："The review and the report are done today." 同一停顿轮内改 review→feedback + today→tomorro → **两词全学入**（log `auto-learn: "review"->"feedback"` + `"today"->"tomorro"`，词典 +2）。119 轮同用例词典 +0，修复生效。
- 近距夹标点形态（119 轮 P3-① b）：「今天下午3点开会，预算是5200元」同轮改 会→慧 + 预→域 → **开慧、域算 都学入**（新增段内单字回扩按 #196 规则生效，词典 +2）。119 轮同用例 +0，修复生效。

### 2. 整句重写拒学（#201 热修）【实测】

- 落字 "The review and the report are done today." 后全选替换为 "Completely different sentence written here"（撞上零星同字场景）→ 结算后词典 +0、log 无 auto-learn。求和先于 MAX_SEGMENT 过滤的口径正确。

### 3. 历史 Correct 英文建议 chip（119 轮 P3-②）【实测】

- History → Correct 把 review 改为 critique → 保存后弹「Add "critique" to the dictionary for auto-correction?」chip，点击 Add to dictionary → 词典 +1（critique 落配置）。英文词形与 watchedit 门槛对齐（源码 suggestHotword 复用 3-20 字符英文词形 + ALNUM 词边界外扩）。

## ② 专项 b：词典 300 条满编 + 长热词 + ASCII/CJK 混合条目（全过）

构造：300/300 满编——260 条随机 3 字纯中文（生僻字组合）+ 针对性条目（开慧/域算/SpeakType）+ 19 字符长英文（Supercalifragilisti）+ 含空格/连字符条目（GPT-4 Turbo Kit、Deep Learning Kit）+ LongTechWordNSuffix 系列 + 4 条 CJK+ASCII 混合条目（阿里GPT、测试Alpha版、前端Vue组件、K8s集群）。UI 粘贴导入 Save 一次成功，300/300 计数正确，Manage hotwords 全部渲染【实测】。

### 纠错准确性【实测】

- 中文针对性纠错持续生效：zh1.mp3 ×3 → raw「开会/预算」→ 落字「开慧/域算」（词典条目同音替换，3/3 稳定）。
- 英文容错纠错：raw "Speak type" → 落字 "SpeakType"（空格/大小写不敏感整词合并）。
- **零误替换**：en 长句（en2.wav）与 zh 句在 300 条满编下除针对性条目外逐字与空词典基线一致（260 随机纯中文 + 30 ASCII 条目无一误命中）。
- 混合条目惰性确认：CJK+ASCII 混合条目既非纯 CJK 也不匹配 ASCII_WORD，correctHotwords 跳过【源码】；运行时无崩溃、无影响【实测】。

### 延迟【实测】

- 空词典基线 7 次落字延迟（finalize→history 落库）：577-688ms，中位 666ms。
- 300 条满编 7 次：578-688ms，中位 595ms。**满编无可测开销**（与 108 轮结论一致，#200 改动未引入退化）。

### 观察①（不立案）

TTS 音源 ASR 抖动：st.wav 3 次中 2 次 raw 识别为 "Spe type"（漏 2 字符），超出 #182 容错门限（≥6 字符仅允许 1 处替换/漏字）故不纠——门限行为正确，宁不纠不误纠；与 118 轮 "phoneone" 同类音源问题，非缺陷。

## ③ 核心回归（全过）

- RightCtrl 中文含 ITN：「今天下午3点…5200元」多次准确落字（本轮 zh 用例即核心链路）【实测】。
- Alt+Q 免按：en2.wav → "The review and the report are done today." 准确落字【实测】。

## 环境限制（如实挂账）

- 专项 a（多显示器比例/分辨率变更）本机虚拟显示器无法可靠构造，本轮未选、未验证。
- 本机无中文 TTS 语音，zh 运行时用例限固定音频；真手机麦/云端 key 仍挂账。

## 测毕清场

- SpeakType/notepad 进程退出；18099/43117 无监听；无 .part
- speaktype.json、history.json 由 round120-*.bak 整体还原（词典 300 条清除、模型改回 parakeet）
- 测试音频/词表/临时文件删除；防火墙三 profiles OFF；repo 回 main、工作区干净
