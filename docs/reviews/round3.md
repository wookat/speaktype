# SpeakType 严格审查报告（审→改循环 · 第 3 轮）

- 审查日期：2026-08-14
- 对象：main@02c9e25（PR #42 合并后），本地 `npm ci && npm run pack:dir` 全绿（两条命令退出码均为 0，签名步骤本轮通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022（1280×720），VB-Cable + System.Speech TTS 驱动真实识别
- 截图：`C:\Users\Administrator\speaktype-review\round3\shots\`（01-10）
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制

## 一、第 2 轮 7 项修复回归结论

| 修复项 | 回归结果 | 证据 |
|---|---|---|
| 英文断句真修复 | ✅ 基本通过（残留问题见 2） | 【实测】多样 4 句英文落字 "I finished the report this morning and I sent it to the whole team. We should review it together tomorrow afternoon. Can you check the numbers before the meeting. Thanks a lot for your help." —— 句号+首字母大写齐全，"and I" 正确不拆分，句尾句号保留（shots/03、04） |
| worker 空闲释放 | ✅ 通过 | 【实测】最后一次识别 00:45:05 → 恰好 10 分钟后 00:55:06 log "sensevoice worker stopped (idle)"；进程组内存 619-925MB → **260.7MB**；再次录音时 worker 在按键瞬间重建（00:57:33 log），首句照常落字、无可感知额外等待（shots/09） |
| 配置损坏 .bad 备份 + toast | ◐ 截断路径通过 / BOM 路径漏网（见 1） | 【实测】截断损坏：生成 speaktype.json.bad + "Settings rebuilt…backup was saved as speaktype.json.bad" toast（shots/07）；BOM 损坏：无备份、无 toast、数据静默清空 |
| 录键提示排版与文案 | ✅ 通过 | 【实测】按数字 5：按钮保持一行（shrink-0 生效），提示"这个键不能用作长按键。支持：字母/功能键/修饰键及鼠标侧键、中键（单键，不支持组合）"文案准确（shots/01） |
| 识别语言五语 | ✅ 通过 | 【实测】下拉含 中文/English/日本語/한국어/粤语（shots/02） |
| bounds debounce 强杀还原 | ✅ 通过 | 【实测】仅拖动窗口（不关闭）→ 1s 内 mainWindowBounds 落盘 (11,60,941,688)；taskkill 强杀 → 重启窗口精确还原（shots/06）；高频拖动/缩放无可感知卡顿 |
| npm ci / pack:dir 退出码 | ✅ 本轮全绿 | 【实测】npm ci 退出码 0（433 包 0 漏洞）；pack:dir 退出码 0，signtool 两个签名步骤通过 |

核心链路无回归：录音→实时字幕→落字（shots/04、09）、静音失败可见反馈"没听清 这次没识别到内容，再说一次试试"（shots/10）、F8 改写无润色模型时弹"改写需要润色模型"引导 toast（shots/05）。**本轮 0 个 P0。**

## 二、本轮问题清单

### 1. [P1] 配置 BOM 损坏仍然静默清空全部用户数据——恰好漏掉第 2 轮实测用的那个损坏形态
- 【实测】给 speaktype.json 加 UTF-8 BOM 后启动：应用正常运行，但配置被重置（3436B→1201B），**无 speaktype.json.bad 备份、无任何 toast**；同一轮里截断损坏则备份+提示齐全。
- 原因【源码】store.ts `backupIfCorrupt()`：`JSON.parse(readFileSync(file,"utf8").replace(/^\uFEFF/,""))` ——预检自己把 BOM 剥掉了，判定"文件没坏"不备份；随后 electron-store（conf 的 JSON.parse）不剥 BOM、解析失败，走 `clearInvalidConfig` 静默清空。预检的宽松度和真正解析器不一致，正好放走了 BOM 这种最常见的"手滑用记事本另存"损坏。
- 建议：二选一——a) 预检与 conf 行为完全一致（不剥 BOM，直接 `JSON.parse(readFileSync(file,"utf8"))`）；b) 更好：预检剥 BOM 后 parse 成功时，把清洗后的内容写回文件（修复而不是重建，数据零丢失）。加一个"BOM 配置启动后数据仍在"的回归用例。

### 2. [P2] 英文断句残留短板：ASR 逗号占位的句界不会升级成句号，逗号连写（comma splice）仍常见
- 【实测】两例："…and all tests passed, Let me know when you are ready to deploy."（shots/08）；"…for Friday afternoon, I will prepare the slides tonight."（shots/09）。正确应为句号分句。
- 原因【源码】polish.ts：a) 大写句界规则只在前词**无任何标点**时补句号，前词已带 ASR 逗号就跳过——但"逗号+大写开头"恰是最强的句界信号；b) `word !== "I"` 把 "I" 排除出大写信号，而 "…, I will…" 这类句界英文极高频；c) 入口早退 `punctCount > words.length/10`——ASR 多给几个逗号就整个函数不干活。
- 建议：前词以 `,` 结尾且当前词大写开头（含 I 之外还可加 We/He/She/They/You + 助动词二元组判断）时把逗号升级为句号；早退条件改为只统计句末标点 [.!?]。疑问句（Can/Could/What 开头）句尾可给 "?"，属加分项。

### 3. [P2] 每次落字同步重写整份 store JSON（500 条历史上限时单文件可达数百 KB）
- 【源码】store.ts addHistory：`store.set("history", [item, ...getHistory()].slice(0, 500))`——electron-store 每次 set 全量序列化+原子写盘；500 条长文本历史 + hotwords + personas 全在一个 speaktype.json 里，每句话触发一次全量写。统计（stats）、窗口 bounds debounce 同一文件。机械盘/杀软实时扫描场景下会放大落字尾延迟。
- 【未验证】本轮 SSD 环境未测出可感知延迟。
- 建议：历史拆独立文件（或 append-only JSONL），主配置只留设置；顺带解决"配置损坏连历史陪葬"的耦合（问题 1 的爆炸半径也会变小）。

### 4. [P2] 历史页 500 条上限全量渲染，无虚拟化
- 【源码】App.tsx 历史列表 `groups.map(...items.map(...))` 直接渲染全部卡片；上限 500 条长文本卡片（含按钮、diff 高亮）在低端机上首次进入历史页会有可感知掉帧。
- 【未验证】本轮历史仅数十条，未实测大数据量。
- 建议：先做简单分页/「加载更多」（50 条一页，20 行代码），不必上 react-virtual。

### 5. [P2] 疑问句句尾给 "." 不给 "?"（英文）
- 【实测】"Can you check the numbers before the meeting." —— 疑问句落成句号（shots/04）。可接受但不完美，并入问题 2 的规则升级一起做。

### 6. [P2] 遗留清单跟踪（开发方已知）：剪贴板多格式恢复、暗色模式、App.tsx 拆分（仍 1900+ 行）、PowerShell UIA 自学开销、实时字幕全量重解码、下载哈希校验、whisper 收进高级选项、官网截图（PR #41 已换 v0.9.3 实拍，线上部署【未验证】）。下轮最值得动：App.tsx 拆分 + 历史存储拆文件（与问题 3/4 联动）。

## 三、总评

第 2 轮 7 项修复中 6 项干净通过，唯一漏网是**配置自愈的 BOM 形态**——预检逻辑比真实解析器宽松，恰好放走了上轮实测用的损坏类型，这说明修复没有拿"上一轮的复现步骤"原样回归（连续第二轮出现这个模式：修英文断句没用第 1 轮验收句、修配置备份没用第 2 轮 BOM 步骤）。**强烈建议把每轮报告的复现步骤固化成回归清单，修复 PR 合并前逐条跑一遍。**

亮点：worker 空闲释放的实测表现非常好——10 分钟精确释放、内存 619MB→261MB、再按键瞬间重建且首句零额外等待，是"内存 vs 首句速度"的两全实现；bounds debounce + 强杀还原也一次通过。英文断句从"完全无效"进步到"多样句子句号大写齐全"，残留的逗号连写属于打磨级问题。

未验证：中文链路本轮复测受阻（VM 的中文 TTS 语音丢失，System.Speech/OneCore 均只剩英文语音）——中文清理代码路径本轮 diff 未改动（localCleanup 的 CJK 分支原样），第 2 轮实测证据仍有效；真人麦克风、小时级长跑、云端三通道、手机麦中转、暗色模式同前。
