# SpeakType 严格审查报告（审→改循环 · 第 4 轮）

- 审查日期：2026-08-14
- 对象：main@d79a765（PR #43 合并后），本地 `npm ci && npm run pack:dir` 全绿（两条命令退出码均为 0，signtool 签名步骤通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022（1280×720），VB-Cable + System.Speech 英文 TTS 驱动真实识别（本机无中文 TTS 语音，中文链路口播复测受限，见文末未验证）
- 截图：`C:\Users\Administrator\speaktype-review\round4\shots\`（01-05）
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制
- 断句函数级验证方法：把 polish.ts 的 addEnglishPunctuation/localCleanup 原样抽出用 tsx 跑用例（不改产品源码），与真机 TTS 落字互相印证

## 一、docs/regression-checklist.md 逐条回归结果

| 清单项 | 结果 | 证据 |
|---|---|---|
| 核心链路：按住说话→字幕→落字 | ✅ 落字通过，但见 P1-1 断句回归 | 【实测】TTS 四句英文成功落入记事本（shots/01） |
| 静音→可见反馈 | ✅ 通过 | 【实测】log `durationMs=2941 maxPeak=0 voicedMs=0` 正常 finalize；toast 第 3 轮已实证、本轮代码未动 |
| 断句：`testing speech recognition Please transcribe…` | ✅ 函数级通过 | 【实测】输出 "…recognition. Please transcribe this sentence accurately."（真机该句 ASR 给了小写+逗号，未触发大写信号，落字为 "…recognition, please transcribe…"，属 ASR 输出波动） |
| 断句：`…passed, Let me know…` 逗号升级句号 | ✅ 通过 | 【实测】函数级输出 "…passed. Let me know…" |
| 断句：`…Friday afternoon, I will…` | ✅ 通过 | 【实测】真机落字 "…for Friday afternoon. I will prepare the slides tonight."，Friday 未误断（shots/02） |
| 断句：`can you check…` → "?" | ✅ 通过 | 【实测】真机落字 "Can you check the numbers before the meeting?"（shots/02） |
| 断句：`hello world`/已有标点/中文 | ✅ 通过 | 【实测】函数级三例均不动；中文断句 "…材料，然后…" 正常 |
| 配置截断 → .bad + toast | ✅ 通过 | 【实测】截断后启动生成 speaktype.json.bad（1201B 重建） |
| 配置 BOM → 数据完好 | ✅ **第 3 轮 P1 已修复** | 【实测】加 BOM（5375B）→ 启动后 5372B、首字节 `{`、无 .bad、历史/设置全部保留——剥 BOM 写回零丢失 |
| worker 预热 + 空闲释放 | ✅ 通过 | 【实测】启动 3s 预热 log；预热 job 完成后 10 分钟整 "worker stopped (idle)"（02:05:02 started → 02:15:03 stopped；预热也会挂空闲计时器，localasr.ts:233），进程组 928.1MB → 229.2MB |
| bounds 落盘 + 强杀还原 | ✅ 通过 | 【实测】拖动后 1s 落盘 `{"x":-102,"y":153,…}`，taskkill /F 重启精确还原（含部分越出屏幕左缘的位置也原样还原） |
| 录键窄布局/数字键提示/F9 | ✅ 通过（代码未动，第 2 轮证据有效） | 【源码】App.tsx 该段本轮 diff 无改动 |
| 识别语言 5 项 | ✅ 通过 | 【实测】下拉恰好 中/英/日/韩/粤 五项 |
| 历史 >50 分页 + 搜索 | ✅ 通过 | 【实测】注入 180 条，首屏 50 条，"显示更多（还有 130 条）"逐页加载；搜索"175"能命中未展开页的条目（filter 先于 slice，App.tsx:501-504）（shots/03、04） |
| 历史按钮 hover:none 可见 | ✅ 通过 | 【实测】远程桌面下 复制/修正/删除 常显 |

## 二、本轮问题清单

### 1. [P1] 英文断句回归："and I am" 被拆成 "and. I am"——第 1/2 轮验收句原文再次输出病句
- 【实测】真机 TTS 念第 1 轮验收全句，落字为 "…today is a beautiful day **and. I am** testing speech recognition…"（shots/01）；函数级同样复现。第 3 轮实测该处"'and I' 不误拆"是通过项，本轮被 PR #43 拆回去了。
- 原因【源码】polish.ts:53-56 新增 EN_I_AUX_SET 把 "I + am/will/…" 当句首信号，但没有排除"前一词是连接词（and/but/so/or/because…）"的情形；"day and I am testing" 命中 `I`+`am` → 在 "and" 后强插句号，产出以连接词结尾的病句 "…and."。
- 同类误伤【实测】句中人名/专有名词照旧误断："please send the invite to **Alice**…" → "Please send the invite **to. Alice**…"（大写词 sincePunct≥3 即断，EN_PROPER_SET 只收了星期/月份，人名一个没收）。
- 修法建议：a) `I`+助动词信号增加前置词黑名单——前一输出词是连接词/介词（and, but, or, so, because, that, if, when, to, for, with…）时不断句；b) 大写词信号同样加前置词黑名单（介词/冠词/所有格后的大写词大概率是专有名词而非句首）；c) **把第 1 轮验收全句（含 "day and I am"）加进 regression-checklist 的断句用例**——本轮清单第 10 行只收了该句尾部片段，恰好把回归的部位裁掉了，这正是"回归清单必须用原始完整复现步骤"的又一次教训；d) 根治方案仍是第 2 轮建议的 ct-transformer 标点小模型（~15MB，sherpa-onnx 同栈），启发式规则每轮修一处漏一处，边际成本已经高于换模型。

### 2. [P2] 免按模式是"单次触发"而非"连续听写"，与竞品和用户预期有差距
- 【实测】Alt+Q → 说一句 → VAD 静音自动落字后**整个免按模式退出**，继续说话无任何反应（第二句未落字）；需要再按 Alt+Q 才能说下一句。
- 【源码】dictation.ts:208-215 toggle 模式 VAD 静音即 stop()，无重新武装逻辑。
- 反问：免按模式的价值场景是"长时间口述文档/连续多句"，单次触发下它和长按模式几乎没有差异化（只是省了持续按住）。竞品（Wispr Flow、Aqua Voice）的 hands-free 都是连续听写、按停为止。建议：VAD 自停落字后自动回到聆听态，Alt+Q 或超时（如 60s 无语音）才退出；悬浮条显示"聆听中"状态和退出按钮。至少在设置文案里写清"每次说一句"。

### 3. [P2] F8 无润色模型的引导 toast 不可点击，用户要自己找到 设置→模型 tab
- 【实测】选中文字按住 F8 → toast "改写需要润色模型／去 设置 → 润色模型 配置一个 OpenAI 兼容模型"（shots/05），文案清楚；但 toast 不可点击、几秒后消失，设置页也不会自动打开。新用户要记住路径自己去找。
- 建议：toast 点击直达 设置→模型 tab 并高亮润色模型区块（main 进程已有 openSettings 类 IPC 能力）；顺带反问：改写指令依赖云端 LLM 是否必须？"翻成英文/改正式一点"这类高频指令在无模型时直接禁用 F8，功能可发现性为零——考虑在设置里把「改写选中文字」行加个"需润色模型"角标或引导按钮。

### 4. [P2] 历史卡片上 raw≠text 就常显红色删除线 diff，正常使用下几乎每条英文记录都带一行"红字噪音"
- 【源码】App.tsx:650-654：`item.raw !== item.text` 即渲染 ReviewDiff（红色删除线+红色替换段）。本地断句/标点清理后英文条目几乎必然 raw≠text，等于每条记录都常年挂着一行红字（本轮注入数据全部命中，shots/03 可见满屏红线）。
- 反问：diff 的价值是"润色改了什么"审阅，对"只是补了个句号"的常规条目是纯噪音，红色也传递了"出错"的错误信号。建议：默认折叠为"查看原文"小链接（点开再显示 diff），或只在润色通道真正改写过（polished 标记）时显示，标点级差异不显示。
- 同页顺手项【实测】："显示更多"按钮布局正常，但点击后视口停在原位、无任何加载反馈，180 条内无感知延迟——500 条时建议按钮加 loading 态（源码推断 setState 同步渲染 50 张卡片，低端机可能掉帧）。

### 5. [P2] 每次落字仍全量重写 store JSON；历史与设置同文件的耦合本轮已到"该拆"的时点
- 现状【源码】store.ts:一个 speaktype.json 承载 settings+history(≤500)+stats+personas+hotwords+bounds；addHistory 每句话全量序列化重写；bounds debounce 每次也带着 500 条历史一起写。
- 本轮实测 180 条注入后文件 ~60KB，写入无感知卡顿【实测】；但这是 SSD + 短历史，风险在低端机/杀软实时扫描场景【未验证】。
- 拆分方案见第三节 ROI 评估。

## 三、点名评估：App.tsx 拆分 & 历史存储拆文件（ROI + 具体方案）

### App.tsx 拆分——建议下轮就做，半天内完成，风险接近零
现状【源码】：1827 行 / 78.6KB，但内部组件边界已经很清晰（顶层函数组件：Home/StatCard/ReviewDiff/History/Personas/Dictionary/SettingsPage/GeneralTab/MicSection/RemoteMicRows/VoiceTab/ModelTab/AboutTab/Row/EnhancedVad/Toggle/PersonaIcon）。这是**纯机械搬移**，不是重构：

```
renderer/src/
  App.tsx            // 只留路由/布局/全局状态（~250 行）
  pages/Home.tsx     // Home + StatCard
  pages/History.tsx  // History + ReviewDiff + PAGE_SIZE
  pages/Personas.tsx
  pages/Dictionary.tsx
  pages/settings/index.tsx      // SettingsPage 壳
  pages/settings/GeneralTab.tsx // + MicSection + RemoteMicRows
  pages/settings/VoiceTab.tsx   // + EnhancedVad
  pages/settings/ModelTab.tsx
  pages/settings/AboutTab.tsx
  components/ui.tsx  // Row/Toggle/PersonaIcon 共享件
```
- 收益：每轮审查/修复都在碰这个文件（第 2 轮录键布局、第 3 轮分页、本轮 diff 噪音全在其中），拆开后 diff 面从 1800 行降到单页 200-400 行；后续暗色模式（遗留项）要全文件刷 className，拆开后可以按页渐进。
- 成本：无行为变更，唯一风险是共享 state 的 props 走线，验收标准 = `npm run build` 通过 + 五页手工走查一遍。
- 结论：**ROI 高，建议与暗色模式排期绑定，拆分先行。**

### 历史存储拆文件——建议做"小拆"（history 单独一个 store），不建议上数据库
- 方案 A（推荐，~1 小时）：`new Store({ name: "history" })` 单独存 history + stats，speaktype.json 只留设置/人设/词典/bounds。addHistory/updateHistoryItem/getHistory 改指向新 store 即可（store.ts:208 行内改 ~20 行）；首启做一次性迁移（把旧 history 键搬走后 delete）。收益：设置写入不再拖 500 条历史；配置损坏自愈时历史天然幸存（第 2 轮"自愈清空全部数据"的爆炸半径直接减半）；bounds debounce 写盘体积从 ~60KB 降到 ~2KB。
- 方案 B（JSONL append-only）：落字 append 一行、启动读尾 500 行。写入 O(1) 最优，但要自己处理截断/压缩/编辑删除的重写，复杂度对 500 条上限的产品不划算。
- 结论：**做方案 A 即可；方案 B 等历史上限放开（>5000 条）再说。如无必要勿增实体——不引入 SQLite。**

## 四、设置页信息架构走查（实测）

- 四 tab（通用/语音识别/模型/关于）结构清晰，通用 tab 分区（键盘快捷键→App 行为→音频）符合频率排序，字段 hint 文案质量普遍高（"短于此时长为误触，不会起录"这类说明很好）。
- 小问题：a) "免按模式"hint "按下 Alt+Q 即进入免按模式，再按一下结束说话"没有说明"说完一句自动结束"（见问题 2，文案与行为半对不上）；b) 「改写选中文字」行的 hint 提到"需要在「润色模型」里配好模型"但没有跳转（见问题 3）；c) 五语抽查【实测】：日文 UI 全站切换即时生效，历史页 "さらに表示（残り 131 件）" 正确带计数，导航/设置分区无串行残留——history.showMore 五语 key 源码核对齐全（en/ja/ko/zh-CN/zh-TW 各 1 条）。
- 暗色模式仍缺失（第 1 轮起持续跟踪，官网暗色/应用浅色的割裂未变）。

## 五、长时间使用稳定性（本轮窗口内）

- 【实测】本轮包全程 ~40 分钟多次录音/强杀/重启/BOM 与截断损坏注入，无崩溃、无僵尸进程残留；预热态进程组 928MB、空闲释放路径正常（预热 job 也会挂 10 分钟计时器，无"预热后永久常驻"的死角）。
- 【未验证】小时级连续听写、内存长期趋势（VM 会话时长限制）；建议在 CI 外做一次 2 小时脚本化循环听写的 soak 测试（TTS 循环 + 每 10 分钟采样 Working Set 曲线），一次投入长期复用。

## 六、总评

第 3 轮 6 项修复回归全部通过，**BOM 零丢失修复质量很好（预检与解析器一致 + 剥 BOM 写回，正是上轮建议的"更好"路线）**，历史分页/搜索实现正确（filter 先于 slice），回归清单落成 docs/regression-checklist.md 是流程上最有价值的一步。核心链路（按住→字幕→落字→失败反馈）本轮无 P0。

但英文断句连续第三轮"修一处、回归一处"：本轮 "I+助动词" 新信号把第 1/2 轮验收句里的 "and I am" 拆成病句 "and. I am"（P1），而回归清单恰好只收录了该句尾部片段，没兜住。两个行动建议：1) 清单断句区第一条改为第 1 轮验收**全句**；2) 认真评估 ct-transformer 标点模型替换启发式——三轮的修复成本已经超过一次模型接入。

## 七、未验证清单

- 中文口播链路本轮复测（VM 无中文 TTS 语音；中文清理/断句代码本轮 diff 未改动，第 2 轮实测证据仍有效）
- 真人麦克风近场质量、小时级 soak、云端三通道（豆包/OpenAI/ChatGPT，无账号）、手机麦克风中转、官网线上部署
- bounds 完全越出屏幕（多屏拔掉外接屏）时是否有夹回可视区的保护（本轮只实测了部分越界还原）
