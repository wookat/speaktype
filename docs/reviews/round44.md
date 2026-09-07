# SpeakType 第 44 轮审查报告 —— toast 时长论证 + 豆包 Test 方案论证 + 历史页 520 条压测

- 构建：main@6b4c5dd（含 PR #96），`npm run pack:dir` 全绿，win-unpacked 打包实测
- 证据标注：【实测】真机证据；【源码】源码推断；【未验证】未执行

## 〇、#96 回归（通过）

豆包未登录 + RightCtrl 口述 →【实测】toast「Speech recognition not set up — Speech recognition not configured: sign in to… [Open Settings]」+ 状态条完整报错双通道可见（shots/07），上轮 P2 的静默黑洞闭环。

## 一、论证①：带按钮 toast 的时长（结论：分两类，配置类 12s+悬停暂停，Undo 类维持 6s）

**现状【源码】**（index.ts:110-127 + toast.tsx）：单槽 toast 窗口，带按钮 6s / 无按钮 2.6s 自动隐藏；无悬停暂停、无关闭钮、无常驻选项。

**实证：6s 窗口确实容易错过**【实测】——本审查周期内自动化观察者（动作间隔约 5s，与人被打断后切回的速度同量级）在第 42 轮两次错过学词 Undo 按钮、本轮两次错过 #96「去设置」按钮，共 4 次实锤；命中都需要"事发时正盯着屏幕"。口述场景用户视线常在目标应用而非屏幕底部，错过率天然更高。

**两类 toast 的语义差异（关键论据）**：
- **Undo 类**：截止时间是语义本身——超时代表学习生效，且存在完整的替代救济路径（词典页手删、历史页还原），错过 ≠ 无法挽回。第 37 轮已论证 6s 维持，本轮维持该结论。
- **配置类**（#96 新增）：没有任何内在截止时间——错过 toast 后用户回到的正是「静默无反馈」原状态（P2 半修复）；替代路径存在（设置页 Not configured 徽标）但用户未必知道去哪看。**它是错误通知，不是瞬态确认**。

**参照习惯【源码/公开规范，非实测竞品】**：Windows 系统通知默认约 5s 但可交互通知建议常驻至处理；Material snackbar 规范带 action 的建议 8-10s 且「用户可能需要更长时间」时不自动消失。Wispr Flow 的 toast 时长未能实测，不引为据。

**建议（~6 行）**：showToast 增加 duration 参数（默认维持现状），#96 配置类错误传 12000；toast 窗口加 mouseenter/mouseleave IPC 暂停/重启计时（renderer ~8 行）。不建议配置类完全常驻——单槽设计下常驻会挡住后续学词 toast，且状态条+设置页徽标已是静态兜底。悬停暂停对两类通用，是本提案里性价比最高的一半。

## 二、论证②：豆包 Test transcription 最小方案（结论：真发静音会话，~30 行，不建议置灰）

**现状能力盘点【源码】**：ChatGPT 的 Test 就是真发 0.25s 静音 WAV（chatgpt.ts:228-250 testChatgpt），失败原样返回原因；豆包侧 startDoubaoSession(language, cb) 已封装完整握手链（bridge 窗口 → WebSocket → StartTask/StartSession 三段确认，每段都有独立失败文案：连不上/未响应 StartTask/未响应 StartSession，doubao.ts:213-234），无 key 即抛 error.noAppKey。

**为什么"无 key 置灰"不够**：豆包的失败形态比"没登录"多得多——key 失效（登录过期后 cache 还在）、bridge 窗口加载失败、WS 握手被拒、网络不可达，置灰只覆盖第一种，用户带着旧 cache 的 key 依然会在正式口述时踩黑洞。ChatGPT 的 Test 价值恰恰在"把真实失败原因原样打出来"，豆包应对齐。

**最小实现**：main 侧 `testDoubao()`——调 startDoubaoSession("zh", noop)，push 一帧 320ms 静音 PCM，finish()，try/catch 把错误原样返回 `{ok, detail}`（~20 行，全部复用现有会话栈，零新协议代码）；IPC + Speech 页复用 ChatGPT 的 Test 行组件（~10 行）。成本：一次对非公开端点的短会话，与正式口述无差别，无新增风险面。

## 三、历史页 520 条压测（全过，1 个 P3 观察）

注入 520 条真实结构数据（3 人设混排、每 97 条 1 条 failed、中英混合、跨 49 天）【实测】：
- **加载/分组**：页面即开即显无卡顿，按天分组正确，failed 条目红字提示正常；
- **分页**：50 条一页 + "Show 470 more" 累加加载顺滑；
- **搜索**：英文 "INJECT-499" 精准 1 条、中文 "预算" 208 条即输即滤无输入延迟；
- **导出**：带筛选导出（103 条，排除 failed）、文件 UTF-8 中文正常（字节级核对）、Markdown 结构正确；
- **清空**：两步确认 → 即刻清空 → 空态文案正常；
- **统计卡**：sessions/words/duration 与 stats 持久值逐项一致，time saved 公式（words/40wpm−实际时长）人工复算吻合 7h46min；清空历史后终身统计保留（合理设计）。
- **P3（观察，不立案）**：清空历史不删 failed-audio 目录里的失败录音 wav【源码】——但 prune 策略（20 段/7 天/50MB）已兜底自动过期，隐私敏感用户可能期待"清空=全清"，建议 FAQ 一句话或 clearHistory 顺带清目录（~3 行），优先级低。

## 四、设置页最小宽度（820×560）视觉回归（全过）

General/Speech/AI model/About 四 tab + Personas/词典/历史页在 minWidth=820 下无溢出、无换行破版、无按钮挤压【实测】（shots/05/06）。

## 五、常规回归

RightCtrl 核心链路："Round 44 core regression complete." 逐字含 ITN（forty four→44）【实测】。

## 六、分级汇总与下轮候选

| 级别 | 问题 | 建议 |
|---|---|---|
| P0/P1/P2 | 无 | — |
| P3 | 配置类 toast 6s 易错过（4 次实锤） | duration 参数 12s + 悬停暂停（论证① ~14 行） |
| P3 | 豆包缺 Test 按钮 | 真发静音会话方案（论证② ~30 行） |
| P3 | 清空历史不删失败录音 | FAQ 说明或顺带清目录（~3 行） |

**下轮候选排序**：
1. 论证①+② 落地后回归（一个 PR 可全包）。
2. 云端成功路径补测（等 key 到位）。
3. 长会话/多天真实使用 soak（免按 30 分钟级 + 内存曲线），打磨期收尾前最后一个未覆盖面。

## 测毕清场

history.json 已从备份逐字节还原（终身统计/原历史完好）；asrProvider 还原 local；导出的 md 已删除；SpeakType/Notepad 进程已清；无 .part；防火墙三 profile 全 OFF、未执行任何开启命令。未修改产品代码。
