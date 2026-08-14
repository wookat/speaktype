# SpeakType 严格审查报告（审→改循环 · 第 21 轮）

- 审查日期：2026-08-14
- 对象：main@279e9b2（含 PR #73），本地 `npm run pack:dir` 全绿（退出码 0，signtool 签名通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022（1280×720），VB-Cable + System.Speech TTS 驱动真实识别链
- 截图：`C:\Users\Administrator\speaktype-review\round21\shots\`（01-26）
- 屏蔽类测试按要求使用 netsh ipsec static（策略 r21block，10 个 IP），测试后已删除并验证 huggingface.co 恢复 200、`show policy all` 无 r21 残留；构造的 base-q5_1 假残片已清理，模型选择与界面语言已还原
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制

## 一、#73 三项修复回归

| 修复项 | 结果 | 证据 |
|---|---|---|
| 首页横幅体积随所选模型 {{size}} 插值、标题去「中文」 | ✅ 通过 | 【实测】选中 base-q5_1 时 en 横幅 "One-time download (~60MB)"（shots/09）、zh-TW「約 60MB」（shots/14）、ja「約60MB」（shots/18）、ko「약 60MB」（shots/22）；zh-CN 标题已为「下载离线识别模型」【源码】 |
| 多文件下载进度字节加权 | ✅ 源码级通过 | 【源码】downloadFiles 全部文件带 size 时按 `(doneBytes + got/total*size)/totalBytes` 加权；modelFiles 六个 onnx/tokens 均已带精确字节数（encoder 652,184,281 等，与 HF LFS 实测值一致）；已存在文件计入 doneBytes。【未验证】未跑 660MB 全量真实下载观测进度曲线（网络时长成本），逻辑与常量核对无误 |
| incomplete 错误归类网络类 | ✅ 源码级通过 | 【源码】正则新增 `incomplete: \d`，与 download.ts 抛出格式 `incomplete: ${got}/${total} bytes` 匹配。网络类文案真机触发正常（见下）。【未验证】incomplete 分支需服务端断流才能真机触发 |

## 二、专项①：按前台应用自动切 persona 的可发现性论证（真机全流程）

**功能本体实测通过**：从零走通——人设页「Auto-switch persona by app」区块 → Add rule → 填 "notepad" → 人设选 "To my boss"（shots/02-04）→ 在 Notepad 内 RightCtrl 口播 → 历史条目 personaName 显示 "To my boss"（shots/05/06），规则按前台进程名命中生效。匹配引擎【源码】activeapp.ts：进程名+窗口标题小写 includes，先命中先用。

**四个可发现性/有效性阻碍（按危害排序）**：

1. **[P1] 未配 AI 润色时规则静默无效，零提示**。【源码】dictation.ts:492 选出的 persona 只传给 polishText，而 polish.ts:311-316 仅在 `polishEnabled && baseUrl && apiKey` 时才使用 persona prompt——默认纯离线用户（大多数）配了规则后除历史标签外**对落字文本毫无效果**，界面无任何「需开启 AI 润色才生效」的说明。用户配完规则发现"没反应"，是对功能信任的最大伤害。
2. **[P2] 入口埋没**：规则区块只存在于「人设」页内的一块灰卡（shots/02），首页 persona 卡、首启 4 步、设置页均无入口或提及；不点进人设页永远不知道有这功能。
3. **[P2] 配置门槛**：placeholder 要求用户自己知道 "code.exe" 这类进程名；没有「从正在运行的应用中选择」，也没有规则命中的即时反馈（配完只能靠事后翻历史验证，本轮就是这么验的）。
4. **[P3] 多规则可预期性**：先命中先用+匹配窗口标题的行为只在 hint 一句话里，规则多时命中结果不直观，无拖拽排序。

**改进方案（供下轮排期）**：
- P1：未满足 AI 润色条件时，规则区块顶部显示黄色警示条＋一键跳转 AI model 设置（复用 F8 缺模型引导的模式，~20 行）。
- P1：Add rule 旁加「选择正在运行的应用」下拉（EnumWindows 枚举可见顶层窗口进程名去重，主进程已有 koffi 基建，~60 行）。
- P2：录音悬浮条在规则命中时显示所用人设名（即时反馈，同时是持续的功能广告位）。
- P2：首页 persona 卡尾部加一行「按应用自动切换 →」链接直达人设页规则区。
- P3：规则拖拽排序。

## 三、专项②：历史搜索/导出评估

**前提更正：搜索框已存在且有效**——历史页顶部搜索框实测 "quarterly" 跨 text/raw 命中 2 条（shots/07），任务描述"只有分页"不成立。

**实测缺陷**：
- **[P2] 搜索大小写敏感**："Quarterly" 0 结果（shots/08），而目标条目为小写 "quarterly"。【源码】History.tsx:52 `h.text.includes(query)` 未归一化大小写。1 行修复（两侧 toLowerCase）。
- **[P2] 无结果时空态文案误用「No history yet」**：搜索无匹配与真无历史共用同一文案（shots/08），误导用户以为历史丢了。加一个 `history.noMatch` key 即可。

**导出评估**：当前无导出。建议**做小**：在搜索框旁加一个「导出」按钮，把当前过滤结果（filtered 数组）导出为 md/txt——主进程 dialog.showSaveDialog + writeFile，内容含时间/人设/文本，~40 行 + 5 语 2 个 key。ROI：听写工具的产出本来就是用户的文字资产，导出是低成本高感知功能；竞品中 Wispr Flow 有历史但导出弱，Handy/CapsWriter 无成型历史体验，属差异化小赢。不建议做 CSV/日期筛选/云同步（无证据需求）。

**优先序**：大小写修复+空态文案（合计 ~10 行）本轮就该修；导出随下一个功能 PR 捎带。

## 四、例行回归（0 回归）与五语文案

- 【实测】RightCtrl→实时字幕→落字（Parakeet）：口播长句逐字精确、句号问号大写全对（"The quarterly report is ready and I will share it with the team on Monday morning. Can you review the budget numbers before our meeting?"，剪贴板全文比对）。
- 【实测】Alt+Q 免按：#73 包上两句连落、句间空格正确、再按退出（"Testing hands free mode after the latest merge. The second sentence should follow with a space."）。
- 【实测】F8：按键即触发录音会话（日志 finalize），静音路径无副作用；【未验证】完整改写链路。
- 【实测】五语文案（en/zh-TW/ja/ko 本轮真机 + zh-CN 上轮已验）：横幅体积插值、Resume（40%）、网络错误人话文案逐语截图（shots/09/10/14/15/18/22），均自然、无截断溢出。ja 错误文案折行断在「再試行/してください」处，可接受。
- 【实测·新发现，低优 P2】下载失败的红字错误在切页/切语言重挂载后消失——localModelStatus 快照不含 error，只有 push 事件带 error。用户离开首页再回来就不知道下载为何停了。建议 status 缓存 lastError 或 UI 保留至下次开始下载。

## 五、反问：首启引导是否该加「选语言/选引擎」一步？

**结论：都不加。**
- 界面语言：默认跟随系统、五语即时切换、General 页一格可改（本轮实测切换全程无重启），加向导步是负收益。
- 引擎：当前默认 sensevoice 对中文主力用户是最优解；英文用户的需求可用更低成本满足——**首启检测 Windows 显示语言为英语时，把默认 localModel 置为 parakeet（或首页横幅追加一句「English? Switch to Parakeet →」）**，不打断 5 分钟上手路径。向导每多一步，「按住说话→落字」的首次成功就晚一步，与核心链路最高权重相悖。

## 六、总评与下轮优先级

#73 三项全部到位，核心链路连续多轮零回归。本轮 P0=0，P1=1（app 规则未配 AI 润色时静默无效无提示），P2=4（搜索大小写、空态文案、错误提示切页丢失、规则入口/配置门槛类改进）。

下轮建议顺序：
1. P1 警示条+跳转（人设规则有效性）＋搜索大小写/空态两个 10 行级修复。
2. 「选择正在运行的应用」下拉 + 悬浮条显示命中人设（可发现性主拳）。
3. 历史导出 md/txt 小功能。
4. 英语系统默认 parakeet 的首启逻辑。

## 七、未验证清单

- 660MB 全量真实下载的字节加权进度曲线；incomplete 错误真机触发；GH 第三源全量链路。
- F8 完整改写链路、真人麦克风、中文真人口播、小时级 soak、APK、官网（本轮无相关变更）。
