# 第 76 轮：竞品对比（为 v0.14 规划提供依据）

- 基线：SpeakType main @ `f277e08`（v0.13 + 74/75 轮修复）
- 调查日期：2026-08-09（价格/功能信息均为当日查询）
- 证据分级：**[实测]** = 本轮在 Windows 10 x64 VM 上实际安装操作；**[官方]** = 官网/官方文档/官方 GitHub；**[二手]** = 第三方评测/用户报告；**[推测]** = 基于证据的判断，非事实

## 0. 实测记录（一手证据）

### Handy v0.9.5 [实测]

安装来源：GitHub Release MSI（https://github.com/cjpais/Handy/releases/tag/v0.9.5 ），安装后 ~120MB（含 Vulkan GPU 后端 ggml-vulkan.dll 74MB + onnxruntime）。

实测观察（2026-08-09，本机截图为证）：

- 首启动强制选模型下载，推荐列表：Parakeet Unified EN 0.6B（697MB，**Streaming 标签**，仅英文）、Nemotron Streaming 3.5（716MB，**28 语言 + Streaming**）、Canary 180M Flash（208MB，4 语言 + 翻译）、Cohere Transcribe（1.6GB，14 语言）、Whisper Medium（793MB，99 语言）——共 **67 个可选模型**。
- **Handy 已经有本地流式实时转写**（Streaming 标签的模型边说边出字），这是相对我们第一轮调研的新变化；此前我们认为流式字幕是云端产品专属。
- 默认快捷键 Ctrl+Space，Push-to-Talk 开关；Overlay 有 Live 模式（实时字幕悬浮条）+ 位置可调。
- 落字方式可选 Clipboard(Ctrl+V) 粘贴，且有「不污染剪贴板」选项（Clipboard Handling: Don't Modify Clipboard）。
- 有 Custom Words（自定义词表，逐词添加，无同音纠错）、VAD 开关、Auto Submit（转写后自动回车）、模型闲置 5 分钟自动卸载（省内存）。
- 历史仅保留 5 条（可调），录音默认只保留最近 5 段。
- 无 LLM 润色、无 persona、无按应用切换、无云端通道——**纯离线单一功能**。
- 限制：本 VM 无麦克风，未能完成端到端说话落字实测；以上为安装后 UI/设置逐页核对。

### 智谱 AutoGLM 输入法（AutoTyper）[未完成实测]

- 官网下载页可取到 Windows 安装包直链 `AutoGLM_win32_x64_1.11.0_*.exe`（https://autoglm.zhipuai.cn/autotyper/ ）[实测·直链确认]；但海外网络下 CDN 下载过慢（30 分钟仅 62MB），本轮未完成安装。使用需手机号登录 [官方]。

### Wispr Flow [未能实测]

- 官网 https://wisprflow.ai 下载入口为 JS 动态渲染，`dl.wisprflow.ai/win` 302 回官网，未取到直链；本轮未安装成功。以下 Wispr 条目全部为 [官方] 或 [二手]，不含实测。

## 1. 功能矩阵差距表（SpeakType vs 主流竞品）

SpeakType 自身能力以 `README.zh-CN.md` @ f277e08 与 docs/reviews/round71-75 为准（[实测]——本仓库）。

| 功能点 | SpeakType (我们) | Wispr Flow | Handy | Superwhisper | Typeless | 讯飞输入法 | 智谱 AutoGLM | 证据 |
|---|---|---|---|---|---|---|---|---|
| 平台 | Win 稳定，mac 适配层已并入未出包 **弱** | Win/Mac/iOS/Android **强** | Win/Mac/Linux | Mac/Win/iOS | Win/Mac/iOS/Android | Win/Mac/iOS/Android | Win/Mac | [官方] 各官网；Handy: github.com/cjpais/Handy；SW: superwhisper.com；Typeless: typeless.com；讯飞: srf.xfyun.cn；智谱: autoglm.zhipuai.cn/autotyper |
| 按住说话/免按 | 有（RightCtrl 按住 + Alt+Q 免按）**强** | 有 | 有（Ctrl+Space，PTT 可关）[实测] | 有 | 有 | 有 | 有（RightCtrl/Alt+空格）| 我们: README；Handy: 本轮实测；其余 [官方] |
| 本地离线识别 | 有（SenseVoice/Parakeet/whisper.cpp）**强** | 无（云端） | 有（67 个模型可选）**强** [实测] | 有 | 无（云端） | 有离线包（能力弱于云）[官方] | 无（云端） | Handy 实测截图；Wispr/Typeless [官方] 定价页与文档未提供离线；讯飞 [官方] wuhan.xfyun.cn/services/offline_iat |
| **本地流式实时字幕** | **无（仅云通道逐字上屏）弱** | 有（云）| **有（本地 Streaming 模型）** [实测] | 无明示 | 有（云）| 有（云）| 有（云）| Handy 实测：Parakeet Unified/Nemotron Streaming 3.5 带 Streaming 标签 + Live overlay |
| 上下文感知（按应用调风格）| 有（按前台应用自动切 persona）**中** | 有（app 类别+光标附近文本+收件人等）**强** | 无 [实测] | 有（按 app 切 mode）| 有（按 app 调语气）| 无明示 | 无明示 | 我们: README；Wispr: docs.wisprflow.ai/articles/4678293671；SW: superwhisper.com/dictation-software；Typeless: typeless.com/help [官方] |
| 读取选中文本/屏幕上下文 | 有（F8 选中改写）**中** | 有（光标附近文本）| 无 [实测] | 有 | 有（Ask Anything）| 无明示 | 有（选中+语音指令）| 各 [官方] 文档 |
| LLM 润色/改写/翻译 | 有（多家兼容端点+persona）**强** | 有（内置） | 无 [实测] | 有（AI 模式） | 有（自动编辑+自我修正）| 部分 | 有（人设系统） | 各 [官方] |
| 自定义词典 | 有（热词+拼音同音近音纠错）**强·独有** | 有（自动学习）| 有（仅逐词，无纠错）[实测] | 有 | 有 | 有 | 有 | Handy 实测 Custom Words；其余 [官方]；拼音同音近音纠错未在任何竞品官方文档见到 |
| 自学习（手改回学词典）| 有 **强·独有** | 有（自动学名词）[官方] | 无 [实测] | 无明示 | 有（self-correction）[官方] | 无明示 | 无明示 | 我们: README；Wispr: docs [官方] |
| 命令模式（语音指令编辑）| 有 F8 选中改写（无免选中命令）**中** | 有（Pro Command Mode）**强** | 无 [实测] | 有 | 有（Ask Anything）| 无明示 | 有（小凹 Agent）| 各 [官方] |
| 文件/会议转录 | **无** | 有会议记录 [官方] | 无 [实测] | 有（文件转录+说话人分离）**强** | 无明示 | 有 | 无明示 | SW: superwhisper.com/docs [官方] |
| 手机当麦克风 | 有（扫码，LAN+可自部署中转）**强·独有** | 无（各平台独立 app） | 无 | 无 | 无 | 无 | 无 | 我们: README；竞品官方文档均未见同类能力 |
| 历史记录+失败重试 | 有（历史纠错+一键学词典+失败录音重试）**强** | 有历史 | 有（默认仅 5 条）[实测] | 有 | 有 | 有 | 有 | Handy 实测；其余 [官方] |
| 需登录/API Key | 离线通道零登录零 Key **强** | 需账号 | 零登录 [实测] | 免费版可用 | 需账号 | 需账号 | 需手机号登录 [官方] | 各官方下载/文档 |
| 免费额度 | 全功能免费（MIT）**强** | 免费版每周字数上限 [官方] | 全免费 [官方] | 免费版基础+有限云 [官方] | 8000 词/周 [官方] | 免费（增值会员）| 免费（绑 GLM 账号）| wisprflow.ai/pricing; typeless.com/pricing; superwhisper.com/docs |
| 中文识别质量 | SenseVoice-Small（中文强，实测每句 0.27s）**中-强** | 支持 100+ 语言，中文质量无独立实测 | Whisper/Nemotron 中文可用但非中文特化 | 同左 | 同左 | 讯飞中文最强宣称（98%/26 方言，**官方宣传口径**）| GLM ASR 中文强 [二手] | 讯飞数字为官方营销宣称，非独立评测 [官方宣传]；豆包/GLM 中文能力 [二手] 评测 |
| 开源 | MIT **强** | 闭源 | MIT（29k stars）**强** | 闭源 | 闭源 | 闭源 | 闭源 | GitHub API 2026-08-09: cjpais/Handy stars=29113 |
| 价格 | 免费 | Pro $15/月（年付 $12）| 免费 | Pro $8.49/月 / $249.99 终身 | 免费 8000 词/周，Pro 订阅 | 免费+会员 | 免费 | 各 [官方] 定价页 2026-08-09 查询 |

其他参考产品（详见第一轮报告，本轮未重复核查）：Aqua Voice（Deep Context 读屏、Realtime，$8-24/月 [官方]）、VoiceInk（Mac，按 app/URL 切 mode，GPL，5.8k stars [官方]）、FluidVoice（Mac，本地增强模型 Fluid-1，9.4k stars [官方]）、CapsWriter-Offline（Win 中文，SenseVoice/Paraformer/Qwen3-ASR，6.5k stars [官方]）、闪电说（国内，读屏上下文+Agent 技能，¥19.9-99/月 [官方]）。

### 我们输得最惨的三项（本轮复核后）

1. **本地流式实时字幕**：Handy 已用 Parakeet Unified/Nemotron Streaming 在本地做到边说边出字 [实测]；我们只有云通道逐字上屏，离线通道必须等松手。
2. **文件/会议转录**：Superwhisper（文件+说话人分离）、Wispr（会议记录）、讯飞都有 [官方]；我们完全没有。
3. **平台覆盖**：竞品普遍 3-4 平台，我们 mac 包还没出、无 iOS/Android 键盘 [官方对比]。

## 2. 高 ROI 候选方向 Top5（v0.14 候选）

| # | 方向 | 用户价值 | 实现成本 | 风险 |
|---|---|---|---|---|
| 1 | **本地流式实时字幕**（sherpa-onnx 流式模型：Zipformer streaming 中文 / Nemotron-streaming） | 离线用户也能边说边看到字，消除「说完等结果」焦虑；对标 Handy 已实测具备的能力，是我们矩阵中最扎眼的「弱」 | 中（3-6 天）：sherpa-onnx 已支持 online recognizer，现有悬浮字幕条可复用；需新增流式模型下载项（~200-700MB） | 流式模型中文准确率低于 SenseVoice 离线整句；需做「流式预览 + 松手后整句重识别」双通道，复杂度上升 |
| 2 | **文件/音频转录**（拖入音频文件→文本/SRT） | 会议录音、微信语音导出、播客整理是高频伴生需求；Superwhisper/讯飞已有 [官方]，CapsWriter 也有；复用现有识别通道即可 | 低-中（2-4 天）：现有 SenseVoice/whisper.cpp 通道直接喂文件，加进度 UI 与 SRT 导出 | 长音频内存/分段策略要做好；说话人分离若做需额外模型（可先不做） |
| 3 | **命令模式增强**（免选中的全局语音指令：「删掉上一句」「全部改成英文」） | Wispr Pro 主打卖点 [官方]；我们已有 F8 选中改写，补「对刚落字内容的追加指令」即可形成闭环 | 中（3-5 天）：维护最近落字缓冲，指令经 LLM 通道解析后用现有 SendInput 替换 | 误触发风险；跨应用撤销/替换的兼容性（依赖模拟按键） |
| 4 | **mac 安装包发布**（适配层已合并，只差打包发布） | 直接扩大可获客面（Superwhisper/VoiceInk 等 Mac 生态用户找 Windows 之外的开源替代）；矩阵「平台」项从弱转中 | 低-中（2-4 天 + 签名/公证流程）：代码已在 main，主要是 CI 打包、签名、冒烟 | 无 Apple 开发者账号则需用户绕过 Gatekeeper，转化率打折；维护面翻倍 |
| 5 | **上下文感知升级**（按前台 app 自动切 persona 之上，读取光标附近文本作为润色上下文，纯本地） | Wispr 的核心溢价点 [官方]，但其上云引发隐私争议 [二手：Reddit/Trustpilot 2.7]；我们做纯本地版即是差异化卖点 | 中（4-6 天）：UIA/Win32 读前台控件文本（我们已有前台 app 检测），拼进 LLM 润色 prompt | UIA 对 Electron/游戏等窗口取不到文本；上下文注入可能让润色变慢、变贵（token 增加） |

推荐排序理由：1、2 直接补矩阵「最惨」项且复用现有引擎；3、5 强化差异化；4 是获客杠杆但依赖签名资源（需老板提供 Apple 开发者账号，属资源缺口，建议立项时一并申请）。

## 3. 定价 / 获客观察

### 定价格局（2026-08-09 查询，[官方] 定价页）

| 模式 | 代表 | 数据点 |
|---|---|---|
| 订阅制（云） | Wispr $12-15/月、Typeless（免费 8000 词/周）、Monologue $15/月、Aqua $8-24/月 | 免费额度普遍用「每周字数」卡人，转化到 $8-15/月 |
| 一次性买断 | Superwhisper 终身 $249.99、VoiceTypr $39-99、BetterDictation $39 | 本地模型产品倾向买断，用户对「离线」+「买断」组合有明确偏好 |
| 免费开源 | Handy（29k stars）、CapsWriter（6.5k）、OpenWhispr（5.3k） | 开源免费本身就是获客手段；Handy 接受捐赠 |
| 国内免费+会员 | 讯飞（免费+会员）、智谱 AutoGLM（免费绑账号）、闪电说 ¥19.9-99/月 | 国内习惯免费起步，靠生态/会员变现；智谱用免费输入法给 GLM 拉新 |

### 获客路径（[官方]+[二手] 标注）

- Handy：纯 GitHub 开源增长，29k stars，无付费营销 [官方 repo]；README 直白定位「free, open source, offline」——**开源+离线是英文市场最强的自然流量词**。
- Wispr：Product Hunt/付费投放+KOL [二手]；同时因隐私（截图上云疑虑）与可靠性被 Reddit/Trustpilot 反噬 [二手：Trustpilot 2.7/5]。
- Superwhisper：Mac 社区口碑 + 终身价锚点 [二手]。
- 国内：讯飞靠品牌与预装；智谱/豆包靠大模型热度免费放量 [官方]；闪电说在少数派/即刻做内容 [二手]。

### 对 SpeakType v0.14 的可执行启示

1. 定位词跟着搜索流量走：README/发布文案主打「**开源 · 离线 · 中文 · Windows**」四词组合——英文市场对标 Handy（但我们多 LLM 润色/persona/手机麦克风），中文市场对标 CapsWriter（但我们多润色/人设/GUI 完整度）。
2. 免费全功能是我们相对 Wispr/Typeless 的结构性优势，**不要引入字数限制**；变现留给后续（托管中转/云通道增值），与老板「支付暂缓」指令一致。
3. 冷启动动作（延续第一轮建议，待 1-2 项功能补齐后执行）：V2EX /create 分享 + 少数派投稿 + GitHub 中文项目榜（README 完善 + 对比表）+ B 站演示视频（手机当麦克风是最适合视频传播的独有卖点）。

## 4. 证据局限声明

- 本轮仅 Handy 完成安装级实测（无麦克风环境，未做端到端语音落字）；AutoGLM 已取得安装包但登录墙后功能未逐项验证。
- Wispr Flow / Superwhisper / Typeless / 讯飞 / 智谱条目均基于官方文档与定价页（2026-08-09 查询），二手评测已逐条标注 [二手]。
- 讯飞「98% 准确率 / 一分钟 400 字」为官方营销宣称，未见独立复测，不应作为规划依据。
