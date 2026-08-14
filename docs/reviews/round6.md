# SpeakType 严格审查报告（审→改循环 · 第 6 轮）

- 审查日期：2026-08-14
- 对象：main@1d31705（PR #45 + #46 合并后），本地 `npm ci && npm run pack:dir` 全绿（两条命令退出码均为 0，signtool 签名步骤通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022（1280×720），VB-Cable + System.Speech TTS 驱动真实识别；System.Speech 仅剩英文语音，中文真人链路本轮仍无法实测
- 截图：`C:\Users\Administrator\speaktype-review\round6\shots\`（01-11）
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制

## 一、第 5 轮 6 项修复回归结论

| 修复项 | 结果 | 证据 |
|---|---|---|
| 专名不误断（EN_STARTER_SET 白名单化） | ✅ 通过 | 【实测】真机口播 "we should invite Peter Johnson to the meeting tomorrow" → 落字 "We should invite Peter Johnson to the meeting tomorrow."，无 "invite. Peter"；函数级 14 例全过（含清单全部历史验收句 + 4 个新句），无一误拆 |
| 免按句间空格 + 退出 flush 最后一句（PR #46） | ✅ 通过 | 【实测】免按连续三句（第三句说话中按 Alt+Q 手动退出 flush）落字 "This is sentence one of the spacing test. Here comes sentence2 right after. Sentence 3 flushed by manual exit."——三句之间均有空格，退出 flush 的最后一句也有（shots/03） |
| history.json 损坏恢复 toast | ✅ 通过 | 【实测】截断 history.json 后启动 → 生成 history.json.bad + toast「历史记录已重建：历史文件损坏…原文件备份为 history.json.bad，设置不受影响」（shots/11-toast-t8），文案与主配置区分 |
| F8 缺模型引导窗口置顶可见 | ✅ 通过 | 【实测】记事本前台按 F8 → SpeakType 主窗口置顶展示 设置→模型 tab，不再被前台应用压住（shots/05） |
| 历史 diff 展开后可收起 | ✅ 通过 | 【实测】点「查看识别原文」展开 diff + 出现「收起识别原文」，点击后收回（shots/08、09） |
| 免按中按其他热键退出 ByKey toast | ⚠️ 部分通过 → 见 P2-1 | 【实测】确实退出、不再静默；但专属 toast 被「没听清」toast 覆盖，用户实际看到的仍是错误提示 |

核心链路无回归：RightCtrl 按住说话→实时字幕→落字通过（Peter Johnson 句）；静音录音有「没听清」可见反馈（shots/04）；worker 空闲 10 分钟释放实证 log "worker stopped (idle)"，进程组内存 929.4MB → 226MB。**0 个 P0，0 个 P1。**

## 二、本轮问题清单

### 1. [P2] 免按中按 F8/长按键退出：专属 ByKey toast 被「没听清」toast 覆盖
- 【实测】进入免按聆听（未说话）→ 按 F8 → 免按正确退出，但屏幕上最终显示的是「没听清 这次没识别到内容，再说一次试试」（shots/04），「免按模式已退出（其他热键）」一闪即被覆盖，用户接收到的语义完全错误（他没想说话，却被提示"没听清"）。
- 【源码】dictation.ts:353-364 stop() 先弹 ByKey toast 并把 handsFree 置 false → finalize 静音路径 (dictation.ts:498-505) 里 maybeContinueHandsFree 因 handsFree 已 false 返回 false → 第 504 行 noSpeech toast 覆盖。与已修的 e70178c（超时退出提示被覆盖）同族问题，修的时候漏了 ByKey 分支。
- 建议：stop()/cancel() 里置一个 `endedByKey` 标记，本次 finalize 的静音分支跳过 noSpeech toast（或把 ByKey toast 挪到 finalize 完成后再弹）。约 5 行。

### 2. [P2] 断句白名单化的召回代价：句首为开放词/人名的真句界不再拆（记录在案的已知折衷）
- 【源码+函数实测】EN_STARTER_SET 只认闭集起句词，"we talked with John about the budget John said it looks fine" 这类以人名开头的真句界不会再断（函数实测保持整句）。少拆比误拆伤害小，方向正确，但这是启发式的天花板——根治靠专项 a 的标点模型。
- 建议：不再继续扩词表；把本条记入回归清单作为已知限制。

### 3. [P2] App.tsx 已 1944 行，连续 4 轮未拆
- 【实测】本轮 1944 行（第 5 轮 1936、第 4 轮 1930+）。每轮改历史/设置都在同一文件上叠。拆分方案见专项 b，纯机械搬移半天可完成，建议下轮 PR 首项执行。

## 三、专项评估 a：ct-transformer 标点模型（实测数据，非纸面评估）

本轮用仓库现装 `sherpa-onnx-node@1.13.4`（已含 OfflinePunctuation API，node_modules 里 punctuation.js 就位）加载官方 zh-en 模型真实跑通：

- 模型：sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12
- 下载：GitHub releases tar.bz2 266.1MB / HuggingFace 裸文件 model.onnx **280.7MB**（fp32；**官方无 int8 变体**，已实测 404）
- 【实测】加载 541ms；单句推理 **2-4ms**（2 线程 CPU，本机无 GPU）；进程 RSS **362MB**（≈模型体积+运行时）
- 【实测】效果：
  - 中文优秀："今天天气不错我们下午三点开会请大家准时参加" → "今天天气不错，我们下午三点开会，请大家准时参加。"；"……你觉得呢" → 正确出"？"
  - 英文可用但需后处理：Peter Johnson 句正确不拆（"…tomorrow。"）；疑问句出"？"；逗号/句号边界基本合理（"morning，she said the roadmap is ready。"）。两个问题：① 输出全角标点（，。？），英文侧需转半角；② 不做首字母大写，需保留现有 capitalizeNext 逻辑做后处理。长难句仍有漏断（"lazy dog today is" 未断），但**无一例误拆**——正好补启发式的短板。
- 结论：**值得做，建议做成可选下载增强包**。理由：单句 2-4ms 开销可忽略；质量上限明显高于白名单启发式且中文也受益；成本是 280MB 下载 + ~300MB 常驻内存——套用 SenseVoice worker 现成的「空闲 10 分钟释放」模式即可控。方案：设置→语音识别 加「智能标点（需下载 280MB 模型）」开关，模型进离线 worker 同栈管理；英文后处理=全角转半角+首字母大写；未下载/加载失败时回落现有启发式（现规则降为 fallback，不再扩表）。

## 四、专项评估 b：App.tsx 拆分边界（基于本轮 1944 行实测行号）

现有顶层结构（行号实测）：PERSONA_ICONS/ASR_PRESETS/MODEL_PRESETS 常量(48-106)、PersonaIcon(108)、fmtDuration/dayLabel/fmtClock(113-137)、App 主组件(~140-300)、Home(301)、StatCard(415)、suggestHotword(426)、diffSegments(439)、ReviewDiff(455)、History(469)、Personas(709)、Dictionary(949)、SettingsPage(1045)、GeneralTab(1109)、MicSection(1331)、RemoteMicRows(1401)、VoiceTab(1470)、ModelTab(1716)、AboutTab(1798)、Row(1864)、EnhancedVad(1877)、Toggle(1927)。

建议低风险纯搬迁边界（不改任何行为/props）：

```
renderer/src/
  App.tsx                 // 只留 App 主组件 + 路由/全局状态（~300 行）
  constants.ts            // PERSONA_ICONS、ASR_PRESETS、MODEL_PRESETS、MAX_HOTWORDS…
  lib/format.ts           // fmtDuration、dayLabel、fmtClock、diffSegments、suggestHotword
  components/             // PersonaIcon、StatCard、ReviewDiff、Row、Toggle、EnhancedVad
  pages/Home.tsx          // Home + StatCard 可并入
  pages/History.tsx       // History（自带 PAGE_SIZE）
  pages/Personas.tsx
  pages/Dictionary.tsx
  pages/settings/index.tsx      // SettingsPage(tab 壳)
  pages/settings/GeneralTab.tsx
  pages/settings/VoiceTab.tsx   // 含 MicSection、RemoteMicRows
  pages/settings/ModelTab.tsx
  pages/settings/AboutTab.tsx
```

各组件间无隐藏耦合（全部走显式 props：t/settings/update），搬移只需调整 import；建议单独一个「纯移动、零逻辑改动」PR，配合打包冒烟（首页/历史/设置三页打开 + 一次落字）即可验收。半天工作量。

## 五、竞品对照（只列有一手依据的点，来源同第 5 轮公开资料核查）

1. **Wispr Flow：同一热键长按=单句、双击=hands-free 双模**。SpeakType 现在是 RightCtrl 长按 + Alt+Q 两个键位两套心智；并成「长按 RightCtrl 说一句、双击 RightCtrl 进免按」学习成本更低，Alt+Q 可保留为别名。hotkey.ts 已有按键时间戳，实现约几十行。
- 2. **CapsWriter hot.txt 音素模糊热词 + 数字 ITN**：热词文件保存即热加载、按拼音/音素模糊匹配强制替换；SpeakType 词典目前是精确文本替换，对同音错字（专有名词重灾区）无能为力。ITN（"三千五百万"→"3500万"）对数字密集口述价值大。
3. **Handy Parakeet V3**：英文识别质量口碑好且免费开源，sherpa-onnx 已支持 Nemo/Parakeet 系列 onnx；若英文用户占比上升，可作为 SenseVoice 之外的英文专用离线引擎评估项（先做 A/B 准确率对比再决定，避免重蹈双引擎并存的旧坑）。

## 六、候选项状态更新

| 候选项 | 状态 |
|---|---|
| history.json 恢复 toast | ✅ 本轮验收通过 |
| ct-transformer 标点模型 | 实测完成，建议立项（专项 a） |
| App.tsx 拆分 | 方案就绪，建议下轮 PR 首项（专项 b） |
| ByKey toast 覆盖 | 新 P2-1，约 5 行，建议随手修 |
| 剪贴板多格式保留 | 维持第 5 轮结论：~30 行，可捎带 |
| 暗色模式 | 维持排在 App.tsx 拆分之后 |
| UIA PowerShell 开销 | 维持在列，无新证据升级 |

## 七、未验证项（如实声明）

- 中文真人口播/真人麦克风质量（VM 无中文 TTS 语音；中文清理路径本轮 diff 未改动）
- speaktype.json BOM 自愈本轮未重测（store.ts 本轮 diff 仅 +historyRecovered，BOM 路径未动，第 4 轮证据仍有效）
- 云端三通道、官网线上部署、小时级 soak、数十轮免按长跑 CPU 累积
- ct-transformer 在真实 ASR 噪声文本（口吃、重复词）上的鲁棒性——本轮用干净文本实测，立项后需用真实识别原文回归

## 八、总评

第 5 轮 6 项修复 5 项完全通过、1 项（ByKey toast）修了退出逻辑但提示被旧 toast 覆盖——又是「toast 互相覆盖」家族第二案，建议把「多 toast 时序」当作一个类问题统一处理（同一事件链上后弹的低优先级 toast 不得覆盖高优先级语义）。断句白名单化方向正确且实测零误拆，配合本轮实测数据充分的 ct-transformer 方案，英文标点问题第一次有了明确的根治路径。连续 4 轮的 App.tsx 拆分已给出可直接执行的边界清单，建议下轮不要再顺延。
