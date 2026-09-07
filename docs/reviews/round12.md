# SpeakType 严格审查报告（审→改循环 · 第 12 轮 · v0.10.0 正式发布走查）

- 审查日期：2026-08-14
- 对象：GitHub Release v0.10.0（安装版 SpeakType-Setup-0.10.0.exe，98.5MB，真实下载安装实测）+ 官网 speaktype.zalize.com 线上
- 环境：Windows Server 2022（1280×720），VB-Cable + System.Speech TTS 驱动真实识别链路
- 截图：`C:\Users\Administrator\speaktype-review\round12\shots\`（01-30）
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制

## 一、总体结论

**P0 = 0，P1 = 1，P2 = 5。** 核心链路（RightCtrl 长按→实时字幕→落字）在安装版上无回归；Parakeet 引擎、双击免按、增强标点、数字 ITN、App.tsx 拆分（1944→197 行）等多轮建议全部落地且实测有效。**唯一 P1 是暗色模式的一个真根因缺陷：主窗口内容区背景在深色下仍是浅色**——第 11 轮的"深色对比度微调"（PR #62）调的是调色板变量，没有命中真正的病灶。

## 二、本轮实测通过项（安装版全量走查）

| 项 | 结果 | 证据 |
|---|---|---|
| 安装器流程 | ✅ | 下载 98.5MB → 助手式安装（检测到旧 per-user 安装提示升级）→ 安装 → Finish 自动启动（shots/02-06） |
| 首启引导 | ✅ | 全新用户数据目录首启：首页顶部横幅提示下载 SenseVoice（~234MB）+ Download 按钮，点击后 27 秒完成（log `local model sensevoice-small downloaded`），无需进设置即可开始（shots/07） |
| Parakeet 下载 | ✅ | 设置→语音识别→内置离线下拉出现 `parakeet-tdt-0.6b-v3 (660MB)`，选中即出现内联进度条+百分比，~90 秒完成（shots/12-13，log 12:36:08 downloaded） |
| Parakeet 英文口述 | ✅ | 真机落字："We should invite Peter Johnson to the meeting tomorrow and all tests passed. Let me know when you are ready to deploy."——自带标点+大写，无误拆（Notepad 剪贴板取证） |
| Parakeet 实时字幕 | ✅ | 录音中字幕条实时显示 partial（shots/15）——设置页 hint 只说 sensevoice 有实时字幕，实际 parakeet 也有，文案可顺带更新 |
| 双击免按（Wispr 同款） | ✅ | 新增"Double-tap for hands-free"默认开：双击 RightCtrl 进入连续听写，两句连落带句间空格，再双击退出（剪贴板取证："Double tap hands free test sentence 1. And sentence two continues automatically."） |
| Alt+Q 免按 | ✅ | 照常可用，与双击并存 |
| F8 改写入口 | ✅ | 无润色模型时按 F8 → 主窗口置顶弹出并直达 设置→AI model（shots/23） |
| 增强标点（ct-transformer） | ✅ | 第 6 轮建议落地：Speech 页开关 + "Download add-on (~281MB)"，~40 秒下载完显示"Add-on ready — punctuation upgraded"；输出为半角标点（shots/24） |
| 静音幻听过滤 | ✅ | 长按 3 秒纯静音：字幕条只显示波点、无幻听 partial 上屏；松手 toast "Didn't catch that / No speech detected — try again"，无落字（shots/25/26） |
| 暗色跟随系统 | ✅ | 注册表切 AppsUseLightTheme=0 后应用实时切深色，无需重启（shots/17）；主题三档（跟随/浅/深）在 设置→通用 |
| 官网 v0.10.0 同步 | ✅ | 英/中双语 hero 徽章 "v0.10.0 is out — Parakeet offline engine for English & dark mode"；新增 Engines / Phone mic / Compare 导航；下载链接指向 v0.10.0 安装版+免安装版（shots/27/29/30） |

## 三、问题清单

### P1-1 暗色模式真根因未修：主窗口内容区背景在深色下仍是浅色 #f7f7f9，页面大标题白字压浅底不可读
- 【实测】深色下 Home/History/Personas/Dictionary/Settings 五页内容区背景像素取样 = RGB(247,247,249)（浅色 body 底），而继承的正文/标题色已切换为浅色系 → "Hold … to start voice typing"、"History"、"Dictionary"、"Settings" 等页面级 h1 几乎不可见（shots/18-22，zoom-home-title.png 最直观）。卡片（bg-white→#1c1f2a）和侧栏正常变深，所以远看"像是深色了"，细看正文区是白底白字。
- 【源码定位·已用 CDP 实证】`desktop/src/renderer/index.html:8` — `<body style="background-color: #f7f7f9">` 内联样式优先级最高，永久压住 `global.css` 的 `.dark body { background-color:#14161d }`。用 Playwright/CDP 对打包产物取 computed style 复核：`inline="background-color: #f7f7f9"`，加 `.dark` 后 body bg 仍是 rgb(247,247,249)，custom property 已重映射（--color-white=#1c1f2a）——铁证是内联样式，不是调色板。
- 第 11 轮 PR #62"大标题提亮"调的是 --color-slate-4/5/6/900 变量，方向没错但没命中病灶：h1 无任何颜色 class（`pages/Home.tsx:36`、`pages/History.tsx:66`、`pages/settings/index.tsx:41`、`pages/Dictionary.tsx:30`），继承 App 根的 text-slate-800（深色下 #e4e8f1 浅字）→ 浅字浅底。
- 修复（两行）：① 删除 index.html 内联 bg（或主题 apply 时 `document.body.style.backgroundColor=""`）；② 主进程 `windows.ts:39` 的 `backgroundColor:"#f7f7f9"` 同步按 nativeTheme 取值，避免启动白闪。修复后 h1 无需动——浅字落回深底即恢复可读。

### P2-1 官网 hero 应用截图仍是 v0.9.3 浅色旧 UI，与"暗色模式"卖点自相矛盾
- 【实测】官网 hero 的 `assets/screenshot-home.png` 里应用侧栏清晰可见 "v0.9.3" 字样、整体浅色（shots/28-site-scroll1）；徽章却在宣传"dark mode"。`docs/index.html:59/156` 引用的两张截图均未更新。建议：换成 v0.10.0 深色主题截图（顺带展示新 Engines 下拉），这是转化页第一屏。

### P2-2 Parakeet 选中后"识别语言"仍默认中文且下拉仍列中日韩粤——选错语言直接输出乱码风险
- 【实测】切到 parakeet 后 Recognition language 保持"中文 Chinese"，下拉仍是 SenseVoice 的五语清单（shots/14）；hint 明说 parakeet "no Chinese support"，但 UI 不拦不换：用户选 Parakeet 忘了改语言，说中文会得到不可用结果且不知原因。建议：按引擎联动语言清单（parakeet=English/欧洲语；选中 parakeet 且当前语言为中/日/韩/粤时自动切 English 并 toast 说明）。

### P2-3 增强标点在英文 TTS 实测中句界仍有明显错位
- 【实测】SenseVoice+增强标点，口述 "can you check the numbers before the meeting / I met Sarah this morning / she said the roadmap is ready / we can start next week" → 落字 "Can you check the numbers before the meeting I met Sarah this morning? She said, the roadmap is ready. We can start next week."：问号落在错误句界（应在 meeting 后）、"She said," 逗号冗余。半角转换与大写保持正确。属模型能力边界而非 bug；建议在回归集中收录该句，并评估 punct 模型对"疑问句+陈述句连说"的成绩，宣传文案避免"much better"绝对化。
- 【未验证】中文标点效果本轮无中文 TTS 可测（第 6 轮 Node 直测证据仍有效）。

### P2-4 主内容区之外的暗色細节
- 【实测】设置 tab 胶囊在深色下"当前选中"呈浅底深字、未选中呈深底浅字，与浅色模式的视觉语义正好相反（浅色下选中是深胶囊），跨主题心智不一致（shots/22 vs 09）。建议深色下选中态改用 indigo 高亮而非明度反转。
- 【实测】Home 的 RightCtrl 键帽 chip 深色下变成浅底深字（bg-slate-900+text-white 双反转），可接受但与整体深色卡片略跳（zoom-home-title.png）。

### P2-5 剪贴板多格式恢复仍未做（跟踪第 1 轮遗留）
- 【源码】`paste.ts` 仍只 `readText/writeText`，无 `availableFormats`；用户剪贴板里的截图/富文本在一次落字后仍会被清成纯文本。多轮在列未排上，建议给个明确的"做/不做"决定：若不做，请在 FAQ/设置里明示"落字会占用剪贴板文本"。

## 四、性能与长时观感（实测数字）

- 安装版启动：双击到主窗口可交互 ~3s；SenseVoice 预热后首句无感延迟。
- Parakeet 首句：切换后第一次长按需等 worker 加载（log 12:37:25 started → 12:37:33 finalize，本次首句在 8s 会话内完成，无失败）；后续句即时。
- 内存：三模型都在（parakeet 刚换到 sensevoice + punct worker）峰值 WS≈1262MB；静置后回落至 ≈267MB。660MB 级引擎叠加 281MB 标点模型时建议在下载确认框里提示内存预算（低配设备体验保护）。
- 长时：本轮未做小时级 soak【未验证】；双击/长按/免按/F8 混合几十次操作无崩溃、无热键失灵。

## 五、竞品对照（只列真实差距）

| 能力 | Wispr Flow | Handy | SpeakType v0.10.0 | 差距结论 |
|---|---|---|---|---|
| 同键双模（长按单句/双击免按） | ✅ | — | ✅ 本版已做 | 已追平 |
| 英文本地引擎 | 云端为主 | Parakeet v3 | ✅ Parakeet v3 已接 | 已追平 |
| 按应用自适应语气/格式（在 Slack 口语、在邮件正式） | ✅ 核心卖点 | ✗ | ✗（有 persona 但需手动 Alt+数字切换） | **仍缺的关键体验①**：按前台应用自动选 persona（uiohook/UIA 已能拿前台窗口，成本低） |
| 口语自我修正（"周三…不对，周四"自动只留周四） | ✅ | ✗ | ✗ | 仍缺②：可作为 polish 提示词内置规则先行 |
| 全平台（Mac/Win/iOS/Android） | ✅ | Mac/Win | Win + Android APK | 差距客观存在，不建议本阶段追 |
| 词典/热词 | 自动学习 | ✗ | ✅ 自动学习+手动词典 | 领先 Handy |
| 完全离线+开源+免费 | ✗（订阅） | ✅ | ✅ | 与 Handy 同档，是对 Wispr 的差异化 |

## 六、下一轮改进建议（按 ROI 排序）

1. **P1-1 暗色根因修复**（2 行 + 回归五页面深色截图）——发布卖点不能带着"白底白字标题"上线。
2. **P2-1 官网截图更新**为 v0.10.0 深色（转化第一屏，半小时）。
3. **P2-2 引擎-语言联动**（防呆，避免 Parakeet 用户第一句就得到乱码）。
4. P2-4 深色选中态语义统一（顺带）。
5. P2-3 增强标点回归集补句 + 文案校准。
6. 竞品差距①：按前台应用自动切 persona 的方案设计（先出设计论证再动手）。
7. P2-5 剪贴板多格式：做/不做给结论。

## 七、本轮未验证项（如实声明）

- 真人麦克风、中文口播（VM 无中文 TTS 语音）、云端三通道、Android APK 实机、小时级 soak、多显示器。
- 免安装版（portable）本轮未装（安装版为主目标）；APK 仅确认 release 资产存在。
