# SpeakType 严格审查报告（审→改循环 · 第 5 轮）

- 审查日期：2026-08-14
- 对象：main@0a2fadd（PR #44 合并后），本地 `npm ci && npm run pack:dir` 全绿（两条命令退出码均为 0，signtool 签名步骤通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022（1280×720），VB-Cable + System.Speech 英文 TTS 驱动真实识别链路
- 截图：`C:\Users\Administrator\speaktype-review\round5\shots\`（01-07）
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制
- 结论先行：**0 个 P0，1 个 P1，6 个 P2。第 4 轮 5 项修复全部实测通过，核心链路无回归。**

## 一、第 4 轮 5 项修复回归结论

| 修复项 | 结果 | 证据 |
|---|---|---|
| 连词/介词后误断（EN_NO_BREAK_AFTER） | ✅ 通过 | 【实测】真机口播 "today is a beautiful day and I am testing speech recognition please send the invite to Alice and ask her about the schedule" → 落字 "Today is a beautiful day and I am testing speech recognition, please send the invite to Alice and ask her about the schedule."，无 "and. I am"、无 "to. Alice"；函数级 14 条用例（含清单全部 7 条断句用例）全部通过 |
| 免按模式连续听写 | ✅ 通过 | 【实测】Alt+Q 进入 → 口述第 1 句 → 停顿自动落字 → **不按任何键**继续口述第 2 句 → 自动落字（记事本两句齐全）；再按 Alt+Q 立即退出，之后说话不再落字（log 03:28:06 手动收尾后无 voiced finalize）；全程静默时每轮 10s 收尾、连续 6 轮（约 1 分钟）后自动退出并弹专属 toast「免按模式已退出 / 长时间没检到人声…」（shots/02，log 03:28:44→03:29:35 六轮 voicedMs=0 后停止） |
| F8 缺润色模型直达 设置→模型 | ✅ 通过 | 【实测】未配润色模型按 F8 → 「改写需要润色模型」toast + 主窗口打开且设置页 tab 已停在「模型」（shots/03）；五语 goto 链路 App.tsx onGoto→jumpTab 生效 |
| 历史 diff 默认收起 | ✅ 通过 | 【实测】历史卡片 raw≠text 时只显示灰色「查看识别原文」链接，点击后才展开 diff（shots/04）；迁移进来的旧条目同样收起（shots/05）；`history.showRaw` 五语 key 齐全（en/zh-CN/zh-TW/ja/ko 均有，代码检索确认） |
| 历史/统计拆独立 history.json + 一次性迁移 | ✅ 通过 | 【实测】升级启动前 speaktype.json 49852B（含 181 条历史 + stats sessions=11）→ 启动后 history.json 48732B（181 条 + stats 原值完整迁入），speaktype.json 缩到 1203B 且 history/stats 字段清空；首页统计卡片数值连续（shots 首页 16 次/1480 字） |

## 二、回归清单（docs/regression-checklist.md）逐条结果

- 核心链路：✅【实测】按住 RightCtrl 口播 → 松手落字到记事本光标处（本轮验收句见上）；静音录音 → 「没听清 这次没识别到内容，再说一次试试」toast（shots/06）
- 英文断句 7 条（含第 4 轮新增 2 条）：✅ 全部通过（函数级逐条 + 真机抽测）
- speaktype.json 加 BOM：✅【实测】启动后剥 BOM 写回，文件长度 1202B 不变、首字节 `{`、settings（Alt+Q 等）完好，不重建不清空
- speaktype.json 截断：✅（第 4 轮已验，本轮 store.ts 该路径无改动，仅 backupIfCorrupt 参数化；【源码】行为一致）
- **history.json 截断（新增路径）**：⚠️ 生成 history.json.bad 备份、应用正常启动，但**历史/统计静默清零、无任何 toast**（详见 P2-3）
- worker 空闲释放：✅【实测】03:33:34 worker started → 03:43:36 "worker stopped (idle)"（恰好 10 分钟）；进程组内存 929.7MB → 293.8MB
- 窗口 bounds：✅【实测】最大化状态下 taskkill /F 强杀 → 重启精确还原最大化
- 识别语言下拉 5 项（中/英/日/韩/粤）：✅【实测】（截图留档）
- 历史 >50 条分页：✅【实测】「显示更多（还有 136 条）」（shots/05）；操作按钮常显
- 录键提示排版：本轮 hotkey.ts/相关 UI 无 diff，【源码】沿用第 4 轮实测结论

## 三、问题清单

### P0（0 个）
无。核心链路无回归。

### P1-1 英文断句对「动词 + 人名」仍会误断：`invite. Peter Johnson`
- 【实测·函数级】`we should invite Peter Johnson to the meeting tomorrow` → `We should invite. Peter Johnson to the meeting tomorrow.`（打包同源函数逐字验证）
- 与第 4 轮同类根因：EN_NO_BREAK_AFTER 只白名单了连接词/介词/冠词/所有格（polish.ts:59-63），大写词前一词是普通动词（invite/tell/ask/call/meet…）且距上个标点 ≥3 词时，人名仍被当句首。第 4 轮点名的 "to Alice"（介词后）修了，但 "invite Peter" 这类补不完——**这是启发式的结构性天花板，白名单永远追不上开放词表**。
- 已连续 4 轮在同一函数上「修一处、露一处」。强烈建议本轮就做决断：接入 sherpa-onnx ct-transformer punctuation 模型（~15MB，中英双语，与现有 worker 同栈），启发式降级为模型不可用时的兜底。累计 4 轮的修复+回归成本已远超一次模型接入。
- 若暂不接模型，短期止血：动词白名单不现实，可改为「大写词在句中且前后都是小写句法环境时，要求它本身出现在句首常见词表（We/He/She/They/The/This…）才允许断句」，把开放人名排除出断句信号。

### P2-1 免按模式连续两句落字之间无分隔符：`...test.And here comes...`
- 【实测】免按连续口述两句，记事本结果为 `This is the first sentence of the Handfr continuous dictation test.And here comes the second sentence...` —— 句号后直接顶格拼接，无空格/换行。
- 【源码】finalize 落字为原文粘贴，不感知「上一次也是本会话免按落的字」。建议：免按会话内第 2 句起，若上句以句读结尾则自动前置一个空格（英文）/不加（中文）；或提供「免按落字以空格/换行分隔」设置。连续听写是本轮新主打，此毛刺直接出现在核心产出上。

### P2-2 免按聆听中按 F8/RightCtrl 会静默吞掉免按会话
- 【实测·日志】免按聆听中按下 F8（改写热键）：改写因无润色模型弹 toast，但 F8 松键触发 onHoldEnd→dictation.stop()，stop() 第一行 `this.handsFree = false`（dictation.ts:349）把免按会话无提示终止；用户以为还在听写，说话已不落字。本轮实测第一次免按退出验证失败正是这个交互踩中的（log 03:25:52 仍有 voiced finalize）。
- 建议：stop() 由「热键语义」触发时才退免按；或免按中收到 hold/rewrite 热键先弹「已退出免按模式」toast，别静默。

### P2-3 history.json 损坏：有 .bad 备份但零提示，历史/统计静默清零
- 【实测】截断 history.json 后启动：生成 history.json.bad ✅、应用正常 ✅，但无任何 toast，历史页空、统计归零（shots/07）。
- 【源码】wasStoreRecovered 只由主配置 backupIfCorrupt("speaktype") 置位（store.ts:135-137），createHistoryStore 里 backupIfCorrupt("history") 的返回值被丢弃（store.ts:154）。这正是把「配置自愈静默清空」（第 2 轮 P2）修好后，在新文件上原样复刻了一遍。10 行工作量：历史 store 损坏也置 recovered 标志，toast 文案区分「设置已重建」vs「历史已备份到 history.json.bad」。
- 顺带：configRecoveredBody 文案写死 "speaktype.json.bad"（en.ts:250），历史损坏场景若复用会误导。

### P2-4 F8 引导窗口被前台应用压住
- 【实测】在记事本焦点下按 F8：toast 出现，主窗口确实切到了 设置→模型，但窗口在记事本**后面**打开（Windows 前台锁），用户看到 toast 却看不到被引导到哪（shots/03 是手动切前台后拍的）。
- 建议：showMain 后用 `win.setAlwaysOnTop(true)` 短暂置顶再还原，或 flashFrame + toast 文案里写明「已在主窗口打开 设置→模型」。

### P2-5 历史 diff 展开后无法收起
- 【实测+源码】`diffOpen` 是单值 state（App.tsx:484），点开一条后只能靠点开另一条来收起它，没有再次点击收起/关闭按钮。建议点击已展开区域或原链接可 toggle。

### P2-6 App.tsx 涨到 1936 行，拆分连续第 3 轮未动
- 【源码】本轮 goto/jumpTab/diffOpen 又 +29 行；每轮新功能都在往同一文件堆。第 4 轮的拆分方案（pages/ 5 文件 + settings/ 4 tab + components/ui）依旧成立，纯机械搬移半天工作量。P2-5 这类小交互 bug 的修复成本会随文件继续膨胀。

## 四、竞品对照（值得抄的点，均注明来源）

| 竞品 | 值得抄 | 依据 |
|---|---|---|
| Wispr Flow | ① 免按入口=**同一热键双击**（按住=单句、双击=连续），不占第二个热键，心智更顺；② 口语自我修正（"5 点…不对 6 点"→只留 6 点）；③ 口述标点/编号列表（说 "1. 苹果 2. 香蕉" 自动成列表） | docs.wisprflow.ai "What is Flow"：hold=dictate、double-tap=hands-free；wisprflow.ai/android 功能列表 |
| Handy（开源，~20k star） | ① 多引擎并列可选（Whisper 系 + Parakeet V3 CPU 优化，自动语言检测）——SpeakType 评估用 Parakeet V3 替代/补充 whisper.cpp 路线的参考；② CLI 开关（--toggle-transcription 等）方便自动化/无障碍集成 | github.com/cjpais/Handy README |
| CapsWriter-Offline | ① **音素模糊匹配强制热词**（hot.txt：别名 + 黑名单 + 热重载，识别错音相近词强制纠正）——SpeakType 的 hotwords 目前只是识别提示，纠错能力弱一档；② 数字 ITN（「十五六个」→「15~16个」）；③ 正则替换层 hot-rule.txt | github.com/HaujetZhao/CapsWriter-Offline README + docs/热词功能如何使用.md |
| 智谱 AI 输入法（GLM-ASR，2025-12 发布） | ① 「所选即所改」：选中屏幕任意文字直接语音下指令改写/翻译——与 F8 同思路，但它把改写做成一体化主打，SpeakType 的 F8 流程（缺模型引导已修）可对标打磨；② 耳语捕捉（弱音量增益 + 环境噪声区分），办公室场景痛点 | 智谱官方发布文（mp.weixin.qq.com GLM-ASR 开源 + 输入法发布） |

优先级建议：音素热词（CapsWriter ①）> 免按同键双击（Flow ①）> 数字 ITN > 自我修正。前两者直接强化「准确落字」与核心交互，且与现架构（sherpa-onnx / hotkey.ts）同栈可落地。

## 五、候选项评估（哪些有真实证据值得做）

| 候选 | 证据 | 结论 |
|---|---|---|
| history.json 损坏恢复 toast | 【实测】本轮 P2-3，静默清零复现 | **值得做，本轮就做**（~10 行） |
| App.tsx 拆分 | 【源码】1936 行且每轮 +30 上下；P2-5 即产物 | **值得做，下轮 PR 首项**（半天，纯搬移） |
| 暗色模式 | 官网暗紫 vs 应用纯浅色的品牌割裂（0.7.2 轮起 4 次提及）；无新增实测证据 | 值得做但**排在拆分之后**（dark: 变体需要拆完的干净组件树，否则 1936 行文件里改色板是灾难） |
| 剪贴板多格式保留 | 【源码】paste.ts 本轮无改动，仍 readText/writeText 单格式；用户复制截图→落一句话→截图丢，场景真实但本轮未收到用户反馈证据 | 中优先级：`availableFormats()` 逐格式备份（image/html/rtf），~30 行，可与其他小修捎带 |
| UIA（PowerShell 轮询）开销 | 【源码】watchedit 未改，中文落字仍 spawn powershell 最长 300s（第 1 轮证据）；本轮英文链路未触发，无新增实测 | 保持在列：等自学习功能有真实使用数据后，改常驻进程或 koffi 直调 UIA COM |

## 六、长时/性能观察（本轮实测窗口）

- 启动→worker 预热就绪 3.2s（log 03:33:31.695→03:33:34.938），与前两轮持平
- 免按连续听写期间每 10s 一轮空录音重解码：6 轮静默≈1 分钟全程 CPU 有感但无卡顿、无内存爬升（929.7MB 平台期）；worker 释放后 293.8MB
- 本轮累计 5 次强杀/重启 + 2 次配置损坏注入 + 迁移，无崩溃、无僵尸进程、无 .bad 误覆盖
- 【未验证】小时级 soak、免按数十轮连续听写的 CPU 累积效应（partial 全段重解码问题遗留在案）

## 七、未验证项（如实列出）

中文口播链路（VM 仅英文 TTS 语音，polish 中文路径本轮 diff 未改）、真人麦克风、云端三通道（豆包/OpenAI 兼容/ChatGPT）、手机麦克风中转、官网线上部署、多屏 bounds 可视区保护。

## 八、总评

第 4 轮 5 项修复全部真修复：连续免按是本轮体验跃升最大的一项（实测两句连续落字丝滑），历史拆库迁移零丢失，回归清单机制第一次完整跑通（新增用例全部命中修复部位）。遗留的结构性问题只剩两个：**英文断句启发式该换模型了**（连续 4 轮同一函数打补丁），**App.tsx 该拆了**（连续 3 轮点名）。另外注意「自愈但不告知」的模式已经第二次出现（speaktype.json 修过一次，history.json 又犯一次）——建议把「任何数据文件重建必须 toast」写进回归清单固定条目。
