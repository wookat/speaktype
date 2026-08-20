# SpeakType 第 201 轮打包实测报告（user-experience-officer 深挖轮）

- 审查对象：main @ `8b3f81d`（含 PR #290/#291/#292），本地 `npm ci && npm run build && npx electron-builder --dir` 打包，`desktop\release\win-unpacked\SpeakType.exe`（UI 显示 v0.15.1，packaged=true）
- 环境：Windows Server RDP VM（本轮为全新盒子：%APPDATA% 无任何 SpeakType 残留——难得的真实首启样本），无真实麦克风，fake-mic 16kHz WAV（中文「帮我跟老板说那个方案需要再改一下明天上午之前给他答复」；英文长句含 "three thirty pm"、"thirty five thousand dollars"）
- 本轮深挖面（历轮未覆盖）：① F8 改写链路全失败路径矩阵；② 增强标点 + Parakeet 英文长句 ITN 实战；③ 人设按应用自动切换多规则场景；辅以设置导入/导出核实（竞品差距）、词典导入边界、深色主题 + zh-CN 视觉走查
- F8/润色 mock：本地 OpenAI 兼容 endpoint 127.0.0.1:18099（记录 prompt 全文；可切固定回复/空 content/挂起不应答）
- 证据分级约定：每条结论标注【实测确认】/【推测】/【未测试】

---

## 一、冒烟基线与真实首启体验

- 真实首启（全新 profile，main.log `no legacy userData to migrate`）：默认模型 parakeet（非 CJK 系统 locale 预期行为）、首页 4 步引导卡、统计全 0、"One-time download (~660MB)" banner 文案正确；parakeet / sensevoice-small / punct-ct 三个模型应用内下载全部成功。【实测确认】
- 打包版核心闭环通过：RightCtrl 按住 → 本地识别 → 松手落字 Notepad，`dictation finalize` 正常。【实测确认】

## 二、新立案

### P2-2011 增强标点破坏 Parakeet 的 ITN 格式：`$35,000` 被改写成 `$ 35, 000`

- 【实测确认】parakeet + `enhancedPunct=true`（polishEnabled=false）：raw 中的 `of$35,000` 经 punct-ct 模型后输出 `$ 35, 000`（货币符号后插空格、千分位逗号后插空格）；同一 wav 在 `enhancedPunct=false` 对照组输出 `$35,000` 完整保留。log 有 `punct worker started`（02:51:57）证明模型路径生效。
- 复现：Parakeet + 增强标点开，说 "…the budget of thirty five thousand dollars…"，对比开关两态的落字文本 / history.json raw vs text。
- 证据：截图 `$ 35, 000`（punct on）vs `$35,000`（punct off）；history.json raw/text diff。
- 【推测】根因：ct-transformer 按 token 重排/插标点时把数字串当普通 token 切分，未对 `$`、数字分组做保护。
- 建议：punct 后处理对「货币符号+数字」「数字内 `,`/`.`/`:`」做还原保护（正则合并 `$ 35, 000` → `$35,000`），或送 punct 前对 ITN 片段打占位符。定级 P2（增强标点 + 英文数字场景必现，直接破坏落字质量）。

### P2-2012 竞品差距：设置无导入/导出/同步，换机迁移只能手抄

- 【实测确认】General / Speech / AI polish / About 四个 tab 逐一走查：只有 Reset settings / Erase all data，无任何配置导出/导入入口（源码 grep 同样无 settings import/export IPC）。词典有 Export、历史有导出——先例与工程底座都在。
- 对照竞品：Wispr Flow 有账号云同步（词典/设置跨设备）；Handy（开源）配置即文件可拷。SpeakType 用户重装/换机需重配热键、人设、规则、API key、模型选择。
- 建议：设置页加「导出配置 / 导入配置」（JSON，排除 API key 或加确认提示），复用 Dictionary Export 的保存对话框链路，工程量小收益直接。定级 P2（产品完整性/竞品差距）。

### P3-2013 F8 改写「30s 超时」与「连不上」共用同一文案，用户无法区分

- 【实测确认】挂起 mock（收请求不应答）：约 30.7s 后 toast "Could not reach the polish service"，与死端口（立即失败）的文案完全一致。等了 30 秒的用户得到的解释是「连不上」，实际是「服务响应超时」——误导排查方向（比如会去检查网络而不是换模型/调超时）。
- 证据：mock 日志请求到达时间 vs toast 截图时间差 ~30s；死端口路径同文案截图。
- 建议：AbortSignal.timeout 触发的 catch 分支单独文案（"The polish service timed out (30s)"），en/zh 同步。定级 P3。

### P3-2014 Parakeet 自身 ITN 缺陷："three thirty pm" → `3 3 pm`、`of$35,000` 缺空格

- 【实测确认】两次独立听写 "three thirty pm" 均输出 `3 3 pm`（应为 3:30 pm）；raw 中 `of$35,000` 货币符号前缺空格（`of` 与 `$` 粘连）。这是模型层（parakeet-tdt-0.6b-v3 内置 ITN）问题，与增强标点无关（off 对照组同样出现）。
- 建议：localCleanup 补两条规则：数字-数字-am/pm 模式合成时间（`3 3 pm`→`3:30 pm` 需谨慎，至少 `(\d) (\d{1,2}) (am|pm)` 类可修）；字母与 `$` 粘连时插空格。或上游换 v3 更新版模型时回归此 case。定级 P3。

### P3-2015 Dictionary 导入把 `===` 等分隔行当作热词保存

- 【实测确认】303 行 fixture（含 `===` 分隔行、1 个 25 字超长词、超 300 上限词）粘贴保存：计数 300/300，警告 "2 word(s) were not added" 只过滤了超长与超上限，`===` 作为热词入库。分隔行/纯符号行会参与 ASCII 热词纠错匹配，属脏数据。
- 建议：导入过滤纯符号/无字母数字 CJK 的行（`/^[^\p{L}\p{N}]+$/u` 跳过）。定级 P3。

### P3-2016 两步确认按钮：慢速二次点击不生效 + 确认态变宽导致误点相邻按钮

- 【实测确认（部分环境相关）】Dictionary Clear：间隔 ~1s 的多次单击始终停在 "Clear all words? Click again" 不执行，需快速连击；Persona Delete 确认态文案变宽使按钮位移，二次点击落到 Edit 上（实测误触发编辑）。RDP 注入点击有时序偏差，但「确认态改变按钮宽度→位移」是产品侧可修的确定性问题。
- 建议：确认态固定按钮 min-width（或原地换色不换文案宽度），确认窗口从 ~4s 放宽到 6-8s。定级 P3。

## 三、通过项（回归/矩阵，全部【实测确认】）

| 面 | 结果 |
| --- | --- |
| F8 成功路径 | 选区被 mock 回复替换；prompt 含选区全文+中文口述指令 |
| F8 空 content | "Rewrite failed…returned nothing"，选区不变 |
| F8 死端口 | "Could not reach the polish service"，选区不变 |
| F8 挂起 30s | 超时退出，选区不变（文案问题见 P3-2013） |
| F8 无选区 | "Nothing selected" toast，不启动录音（log 无 finalize） |
| F8 无模型 | "Rewrite needs a polish model" + 自动跳 Settings→AI polish |
| 人设多规则优先级 | first-hit-wins（untitled→A 优先于 notepad→B） |
| 删除首条规则 | 第二条正确命中 |
| 非匹配前台 counter-test | 回落全局 Default |
| Alt+2 切人设 | toast + settings.personaId 更新 |
| 删除人设 | 关联规则自动清理、personaId 回 default，无悬挂引用 |
| 增强标点断句/大写化 | 生效，`punct worker started` 佐证 |
| 词典 300 上限/20 字过滤 | 计数与警告文案正确（`===` 问题另立案） |
| 深色主题 6 页面 + zh-CN 抽查 | 文案完整无溢出；深色下 native select 弹窗白底为系统控件（历轮已知，不再立案） |

## 四、观察（不立案）

- F8 改写 prompt 框架为中文硬编码——纯英文用户场景下 LLM 遵循度可能受影响，建议后续按 UI 语言切 prompt 框架。【实测确认（prompt 全文见 mock 日志）】
- 首启引导卡对「先下载哪个模型」没有语言相关推荐（英文 locale 默认 parakeet 合理，但中文用户首启装 parakeet 后中文识别差，需要自己发现 sensevoice）。【推测（本盒 locale 非 CJK，中文首启路径未测）】

## 五、未测试面

- F8 英文/混合语指令音频、>2k 字长文选区改写性能；Transcribe 页仅视觉走查未做功能；浅色主题为过程性截图非专项走查；云端 ASR 组合路径。

## 六、建议下轮优先 Top3

1. **P2-2011 修复 + 数字/货币/时间 fixture 回归集**：增强标点是英文长句的核心卖点组合，ITN 破坏必现。
2. **P2-2012 设置导出/导入落地**：复用现有保存对话框链路，一轮可完成，直接补齐竞品差距。
3. **F8 英文指令 + 长文档选区深挖**（含 prompt 框架随 UI 语言切换的设计论证）。

（报告分支：review/round201-report，仅含本文件，不含产品代码改动。录屏与截图证据见本轮会话。）
