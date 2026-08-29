# SpeakType 竞品深挖与推广调研报告

- 调研日期：2026-08-29
- 调研对象：SpeakType（https://github.com/wookat/speaktype ，官网 https://speaktype.zalize.com ，v0.15.1，Windows 10/11，MIT 开源）
- 说明：全部信息来自公开网页/商店评论/GitHub issue/论坛帖，均附链接。凡属推断处已标注「推断」。未做任何真机实测（本报告为二手资料汇编，各产品实际体验未逐一验证）。

---

## 任务 A：竞品深挖

### A1. Wispr Flow（闭源，云端，融资型商业产品）

| 维度 | 内容 |
|---|---|
| 核心卖点 | 「说话→干净成文」的 AI 润色式听写：去语气词、自动标点/列表、说错自动修正；100+ 语言自动检测；自学习个人词表；按 App 自适应语气（tone per app）。任何可打字处可用，跨 Mac/Win/iPhone/Android 同步（来源：https://wisprflow.ai/ ） |
| 定价 | 免费 2,000 词/周（iPhone 1,000/周，Android 目前不限）；Pro $15/月 或 $12/月（年付 $144）；Team/Enterprise 另议（来源：官网 + https://filipkonecny.com/blog/wispr-flow-pricing/ ） |
| 平台 | macOS / Windows / iOS / Android |
| 独有功能 | Command Mode（语音指令编辑，Pro）；跨设备同步词典；SOC 2 Type II / HIPAA / ISO 27001 合规背书 |
| 用户抱怨点 | ① 可靠性：StatusGator 半年记录 75+ 次故障，Trustpilot 仅 2.7/5（App Store 4.8 形成反差）——https://www.getvoibe.com/resources/is-wispr-flow-reliable/ ；② 「试用期好用、付费后变差」的 Reddit 爆帖——https://medium.com/@ryanshrott/the-wispr-flow-trust-gap-why-reliability-matters-more-than-hype-in-2026-c7dd55392408 ；③ 悬浮工具条挡 UI，官方征集吐槽收到 700+ 条——https://www.digitaltrends.com/computing/wispr-flow-asked-its-haters-what-was-wrong-and-more-than-700-people-answered/ ；④ 隐私争议：法证分析发现记录访问 URL、抓取无障碍树（214 元素/9 层）、关闭「使用数据共享」仍每小时上传元数据、还曾吞键盘事件（空格键失灵）——https://www.wensenwu.com/thoughts/wispr-flow-investigation ；早期 Context Awareness 被发现截屏上传第三方 AI 基础设施——https://embertype.com/blog/the-day-wispr-flow-banned-a-user/ ；⑤ Auto Cleanup 过激改词（官方承认并修正） |

### A2. superwhisper（闭源，本地+云混合，独立开发者→小团队）

| 维度 | 内容 |
|---|---|
| 核心卖点 | Mac 起家的高准确率听写；「Modes」体系（Email/Super/自定义 AI 模式）；本地模型可全离线；看屏幕上下文自动调格式（来源：https://superwhisper.com/dictation-software ） |
| 定价 | 免费版（高级功能限 15 分钟录音）；Pro $8.49/月、$84.99/年、$249.99 买断；一个许可全平台通用；学生 6 折（来源：https://superwhisper.com/docs/get-started/sw-pro 、https://lumevoice.com/blog/superwhisper-pricing-2026-worth-it/ ） |
| 平台 | macOS / Windows / iOS（无 Android，官方反馈板「Android App」245 票 In Progress） |
| 独有功能 | 买断制；自定义 Modes + AI 后处理链；说话人分离；会议录音 |
| 用户抱怨点 | ① 崩溃丢录音：r/superwhisper「Good bye Whisper」热帖，1 小时会议 45 分钟处崩溃全丢、无原始音频可恢复——https://instantowl.com/blog/superwhisper ；② 高失败率：「近 10 条听写 5 条 No Result」——https://superwhisper.userjot.com/board/p/buggy-app-july-2025 ；③ 录音吞词——https://superwhisper.userjot.com/board/p/recording-is-buggy ；④ 支持响应慢（Discord 之外基本没人管）；⑤ 跨设备同步词典/模式缺失（反馈板 328 票第一名）；⑥ 更新后 Mac 版会议转写反复崩溃——https://reddit.synth.download/r/superwhisper |

### A3. Handy（开源 MIT，完全离线，SpeakType 最直接对标）

| 维度 | 内容 |
|---|---|
| 核心卖点 | 「免费、开源、可扩展、全离线」四原则；按快捷键说话→落到任意输入框；Tauri+Rust；whisper.cpp（GPU 加速）+ Parakeet V3 自动语种检测；30k+ stars（来源：https://github.com/cjpais/Handy ，https://handy.computer ） |
| 定价 | 完全免费，GitHub Sponsors 赞助制，无付费档（来源：https://betterstack.com/community/guides/ai/handy-offline/ ） |
| 平台 | Windows / macOS / Linux（三端，比 SpeakType 广） |
| 独有功能 | 跨三端；品牌资产保留（名称/logo 不开源，fork 须改名）；「不做最好，做最可 fork 的」定位 |
| 用户抱怨点 | 崩溃是重灾区（官方讨论区自己汇总）：Win10 Vulkan.dll 崩溃 #99、AVX2 SIGILL #91、选 Whisper Medium 即崩 #1080/#870、下载中断后 app 永久不可用 #55/#56、Linux 换模型崩 #563——https://github.com/cjpais/Handy/discussions/1295 ；作者自述「单手+LLM 写的第一个 Rust 项目，bug 和毛边多」——https://news.ycombinator.com/item?id=44302416 ；无润色/AI 后处理、无热词纠错、无手机麦克风（对照 README，推断） |

### A4. Aqua Voice（闭源，云端，YC W24）

| 维度 | 内容 |
|---|---|
| 核心卖点 | 「最准的实时引擎」：自研 Avalon 模型，自称 LibriSpeech clean 3.2% WER、实时系统第一；自然语言命令编辑（"make this a list"）；800 词自定义词典免调音；无障碍 API 读取当前 App 上下文自动带热词（来源：https://news.ycombinator.com/item?id=42388173 ，https://aquavoice.com/info/faq ） |
| 定价 | 免费一次性 1,000 词；Pro $8/月（年付 $96）或 $10 月付；iOS 单独 $119/年；学生 3 折；无买断（来源：https://www.getvoibe.com/resources/aqua-voice-pricing/ ） |
| 平台 | macOS / Windows / iOS |
| 独有功能 | 语音即编辑器（voice-native editing）；执行命令前预告「Deleting…/Fixing Spelling…」；公开 benchmark 打 Wispr（声称 Wispr 邮件/技术写作错误多 10 倍） |
| 用户抱怨点 | 云-only 无离线（隐私/断网即废，getvoibe 评测反复强调）；免费额度一次性 1,000 词≈8 分钟，几乎等于无免费版；订阅制无买断——https://www.getvoibe.com/resources/aqua-voice-review/ |

### A5. VoiceInk（GPL v3 开源 + 付费编译版，macOS only）

| 维度 | 内容 |
|---|---|
| 核心卖点 | 「Superwhisper/Wispr 的最佳开源替代」；本地 whisper + 自带 AI 增强（BYO key）；买断 $29/$49/$69（1/2/3 台 Mac），或自己编译免费（来源：https://tryvoiceink.com/pricing ，https://github.com/beingpax/voiceink ） |
| 定价 | 买断制，14 天退款；开源自编译 $0 |
| 平台 | 仅 Apple Silicon macOS 14.4+（+ 一个 iOS 键盘 app） |
| 独有功能 | 「开源+低价买断」混合模式（对 SpeakType 的变现路线最有参考价值） |
| 用户抱怨点 | 间歇性空转写/截断（#687、#755，热键触发后录音管道竞态）——https://github.com/Beingpax/VoiceInk/issues/687 ；iOS 版被评「way too buggy、强制转英文」——https://apps.apple.com/us/app/voiceink-ai-dictation/id6751431158 ；仅限 Apple Silicon |
| 备注 | 4,700+ stars。付费转化话术：「编译版=自动更新+优先支持+养活全职开发」 |

### A6. Talon（闭源免费 + Patreon beta，语音控制全电脑）

| 维度 | 内容 |
|---|---|
| 核心卖点 | 面向 RSI/残障用户的全电脑语音控制：命令优先（非听写优先）、Python 脚本化、眼动仪、噪声指令（pop/hiss）、社区命令库 talonhub/community（来源：https://talonvoice.com/docs/ ） |
| 定价 | 公开版免费；Patreon beta 档解锁 Whisper 混合引擎、更快识别等（来源：https://talonvoice.com/dl/latest/changelog.html ） |
| 平台 | macOS / Windows / Linux |
| 独有功能 | 语音写代码（Josh Comeau 长文背书 https://www.joshwcomeau.com/blog/hands-free-coding/ ）；眼动+面部表情输入；Mixed Mode 命令听写同时进行 |
| 用户抱怨点 | 学习曲线极陡：默认无任何命令、要 git clone 社区脚本才能用，「像维护一台 Linux 机器」——https://www.fileside.app/blog/2025-04-14_voice-computing/ ；文档匮乏、新手第一体验差（HN 用户吐槽 https://news.ycombinator.com/item?id=27305519 ）；默认命令模式对纯听写用户不友好——https://news.ycombinator.com/item?id=34847227 |
| 与 SpeakType 关系 | 不同赛道（控制 vs 输入），但其「select-and-rewrite/命令编辑」理念可借鉴 |

### A7. Windows 自带语音输入（Win+H / Voice Access / Fluid Dictation）

| 维度 | 内容 |
|---|---|
| 核心卖点 | 免费、零安装、任意文本框可用；Voice Access（Win11 22H2+）离线且可全语音控制电脑；Copilot+ 机型有 Fluid Dictation AI 润色 |
| 定价 | 免费 |
| 平台 | Windows |
| 用户抱怨点（= SpeakType 的转化目标人群痛点） | ① Win+H 纯云端，断网即废（Azure Speech）——https://instantowl.com/blog/voice-typing-windows ；② 无自定义词表，「人名/术语永远错」被评为永久天花板（3/10）——https://www.getvoibe.com/resources/windows-voice-typing-review/ ；③ 说到一半自动停止收听（Reddit 高频抱怨）——https://www.onresonant.com/resources/best-speech-to-text-windows-reddit ；④ 口音/专业词准确率骤降——https://www.softorbits.net/how-to/windows-voice-typing-review.html ；⑤ 自动标点默认关闭、体验割裂在 Win+H / Voice Access / Fluid Dictation 三套工具之间；⑥ AI 润色被锁死在 Copilot+ 硬件 + 英文 locale |

### A8. 讯飞输入法（免费，中文霸主，移动端为主 + PC 版）

| 维度 | 内容 |
|---|---|
| 核心卖点 | 中文语音识别准确率标杆；23+ 方言识别；随声译（中英日韩语音互译）；个性化语音识别（账号级自学习词库）；长语音写作、边说边出字（来源：少数派深评 https://sspai.com/post/40844 ） |
| 定价 | 免费（会员/皮肤等增值） |
| 平台 | Android / iOS / Windows / macOS |
| 独有功能 | 方言、语音翻译、账号云词库 |
| 用户抱怨点 | ① 隐私：隐私政策明示收集文本内容/位置/搜索记录用于用户画像与「商业资讯和营销广告」推送——https://s1.voicecloud.cn/resources/imeprivacypolicy/private20250828.html ；② 全云端识别，敏感场景（代码、公司内部信息）不适用；③ 输入法形态捆绑（要换掉整个输入法，而非独立听写工具）；④ 少数派评测亦提及 iOS 第三方键盘内存限制导致体验瑕疵（推断类抱怨：广告/推送在国产输入法用户口碑中常年被吐槽，证据为隐私政策原文而非评论区，此处如实标注） |

---

### A9. SpeakType 差距与借鉴清单（Top 10，按性价比排序）

排序口径：`(用户痛感强度 × 差异化价值) ÷ 实现成本`（推断评估，未经量化验证）。SpeakType 已有的（按 README）：按住说话/免提模式、人设 Alt+1..9、拼音热词纠错+从修改自学、F8 选中改写、Silero VAD、失败重试、文件转写、手机麦克风、5 语 UI。

| # | 待做点 | 借鉴自 / 证据 | 说明 |
|---|---|---|---|
| 1 | **长录音防丢：流式落盘 + 崩溃恢复 + 分段转写队列** | superwhisper 最痛抱怨（1 小时会议崩溃全丢，https://instantowl.com/blog/superwhisper ）；SpeakType 已有失败重试雏形 | 成本低（在现有 retry 机制上加边录边存），直接打竞品最大伤口，可写进对比营销 |
| 2 | **硬件兼容兜底：GPU/指令集探测 + 自动降级 CPU**，模型下载断点校验 | Handy 崩溃重灾区全是 Vulkan/AVX2/模型下载损坏（https://github.com/cjpais/Handy/discussions/1295 ） | Windows 硬件碎片化最严重，谁先做到「装上就能用不崩」谁赢口碑；也是差评的第一来源 |
| 3 | **本地化 Context Awareness：读当前 App/窗口标题→自动切人设+临时热词**，全程本地、明示开关 | Wispr/superwhisper/Aqua 的核心卖点，但 Wispr 因云端截屏/无障碍树上传翻车（https://www.wensenwu.com/thoughts/wispr-flow-investigation ） | SpeakType 已有「按前台 App 自动切人设」，补「从屏幕上下文提取热词」（Aqua 做法：无障碍 API+本地预处理，https://news.ycombinator.com/item?id=42388173 ）。「同样的功能、零上传」本身就是卖点 |
| 4 | **语音命令编辑（Command Mode）**：说「改成列表」「删掉最后一句」作用于刚输出的文本 | Aqua 核心差异化（Launch HN 716 分，https://news.ycombinator.com/item?id=39828686 ）；Wispr 把它做成 Pro 付费点 | SpeakType 的 F8 选中改写已完成 70%，缺「对刚落字文本免选中直接命令」 |
| 5 | **公开准确率/延迟 benchmark 页**（中文+英文，含 Win+H、讯飞、Wispr 对比，音频+代码开源） | Aqua 靠 benchmark 博客打 Wispr 出圈（https://withaqua.com/blog/benchmark-nov-2024 ）；Voibe 等靠对比内容做 SEO | 成本＝一次评测工程，产出＝长期引流素材 + README 信任状；开源身份做这事天然可信 |
| 6 | **词典/设置导出与多机同步**（先做导入导出文件，后做可选自托管同步） | superwhisper 反馈板第一名 328 票「Synchronize across devices」（https://instantowl.com/blog/superwhisper ） | 导入导出成本极低；自托管同步契合 self-host 人群（推广位见任务 B） |
| 7 | **英文市场首屏体验**：默认推荐 Parakeet、英文官网/README 平权、英文 demo 视频 | Handy 30k stars 几乎全来自英文社区（https://gitstarclub.com/cjpais/Handy ）；SpeakType 英文能力已有（Parakeet v3）但叙事偏中文 | 不写代码也能做的最高杠杆项：英文世界「Windows + 开源 + 本地」赛道基本只有 Handy 一家，且 Handy 无润色/热词/手机麦 |
| 8 | **口述编程/终端场景人设强化**（代码符号、驼峰/下划线、shell 命令白名单） | Talon 证明开发者愿为语音编程投入巨大学习成本（https://www.joshwcomeau.com/blog/hands-free-coding/ ）；Talon 痛点是门槛（https://www.fileside.app/blog/2025-04-14_voice-computing/ ） | SpeakType 已有 CLI 人设，补「AI 编辑器提示词口述」场景（对 Cursor/Claude 用户），这是 2026 年听写工具增长最快的用户群（Wispr/superwhisper 官网都在打这个场景） |
| 9 | **可及性（RSI/伤病）叙事与文档** | Handy 起源故事=断指（Show HN 原帖 https://news.ycombinator.com/item?id=44302416 ）；Aqua 起源=阅读障碍合伙人；两者都靠真实痛点故事获得传播 | 零代码成本：README/官网加 accessibility 章节，进 RSI/accessibility 社区推荐清单 |
| 10 | **中文方言支持路线**（云引擎接讯飞/阿里方言模型作为可选项） | 讯飞 23+ 方言是其护城河（https://sspai.com/post/40844 ）；SenseVoice 已含粤语 | 成本高收益窄，排最后；先在 README 明示「粤语已支持」即可蹭到部分需求 |

不建议跟进的方向（同样基于证据）：自研云识别服务（Wispr 75+ 次故障说明云服务是负债）；订阅制收费（开源+本地定位下会摧毁信任，VoiceInk 的「编译免费+买断便利」是唯一被验证的开源变现路径）。

---

## 任务 B：推广调研

### B1. 同类开源项目是怎么获得 star 和用户的

**Handy（30k stars，最值得抄的作业）**
- 2025-06-17 Show HN 首发只得 3 分（https://news.ycombinator.com/item?id=44302416 ）——首发扑街不致命。
- 真正起量：2025-10 起每月 +1k~2k stars（2025-10 +1.5k、2026-01 +1.4k、2026-06 +2.1k，https://gitstarclub.com/cjpais/Handy ）。
- 起量来源：① 被反复转发/重发 HN（2025-09、2026-01 两次 repost，后者上了首页 https://news.ycombinator.com/item?id=46628397 ）；② 大量第三方评测/自托管博客自发写文（Better Stack、MakeUseOf、selfhostedapp.com 等）；③ 独立品牌官网 handy.computer + 一句话价值主张「free, open source, works completely offline」；④ 「断指后单手开发」的真实起源故事，每篇报道都会复述；⑤ 明确「求 Rust 贡献者」把用户转化为社区。
- 标题写法：`Show HN: Handy – Free open-source speech-to-text app written in Rust`（免费+开源+技术栈，三个 HN 热词）。

**Buzz（21k stars）**
- 2022-10 蹭 Whisper 发布热浪上 HN（https://news.ycombinator.com/item?id=33278785 ），属于「供需失衡窗口期」打法：Whisper 刚开源、没有 GUI，Buzz 是第一批 GUI。
- 分发做得好：winget（`winget install ChidiWilliams.Buzz`）、Mac App Store 付费增强版、文档站（https://www.makeuseof.com/transcribed-interviews-offline-open-source-tool/ ）。

**whisper-writer（1.1k stars）**
- 无爆发点，靠 GitHub 自然流量 + 收录进 awesome 列表（Awesome-Whisper-Apps 把它列为 cross-platform 推荐，https://github.com/danielrosehill/Awesome-Whisper-Apps ）+ 社区 PR 滚动维护（README 逐个致谢贡献者）。证明：光靠列表收录也能到 1k 量级。

**Aqua Voice（商业，但 HN 打法教科书）**
- Launch HN 716 分 244 评论（https://news.ycombinator.com/item?id=39828686 ）：正文=创始人真实痛点故事（阅读障碍、六年级用 Dragon）+ demo 视频 + 「现有听写软件依然糟糕」的行业批判 + 免登录即试。
- 后续用 benchmark 博文（3.2% WER、"Wispr 错误多 10 倍"）制造第二波传播（https://news.ycombinator.com/item?id=42388173 ）。

**superwhisper（商业）**
- Product Hunt 2023-07 首发：给 PH 社区独家免费 license + 限时折扣码，评论区亲自运营（https://www.producthunt.com/p/superwhisper/superwhisper ）；iOS 版 2024-04 再发一次（一个产品多次 launch）。

**中文圈参照**
- Typeflux：V2EX「我花了一个月做了一款开源语音输入法」帖（2026-04，https://www.v2ex.com/t/1208702 ），标题结构=「时间投入+开源+对标知名产品（Typeless）」。
- Whisper-Input：README 强调「Groq/SiliconFlow 免费额度、无需信用卡」精准戳中文用户付费敏感点（https://github.com/ErlichLiu/Whisper-Input ）。
- V2EX 自建语音输入帖（https://www.v2ex.com/t/1098926 ）评论区有人明确求 Windows 版——中文 Windows 语音输入需求存在且供给稀缺。

### B2. SpeakType 推广计划草案

核心叙事（所有平台共用）：**「Windows 上唯一：开源 + 默认离线 + 会自我学习的热词纠错 + 手机当麦克风」**，对立面是「Wispr 半年 75 次故障还上传你的屏幕内容 / Win+H 断网即废且永远学不会你的术语」。

**英文平台**

| 平台 | 建议标题 | 正文要点 | 时机 |
|---|---|---|---|
| HN Show HN | `Show HN: SpeakType – Open-source, offline-first AI dictation for Windows` | ① 为什么做（一句真实痛点）；② 本地 SenseVoice/Parakeet、无账号无 key；③ 差异点：从你的手动修改自学热词、手机当麦（LAN 直连可自托管 relay）；④ 坦白局限（Windows only、Electron）；⑤ 求反馈/贡献者。首发扑街就隔 3-6 个月 repost（Handy 验证有效） | 美东工作日早 8-10 点；避开大厂发布日 |
| Reddit r/LocalLLaMA | `Open-source offline dictation for Windows that learns your vocabulary from your corrections (SenseVoice/Parakeet/whisper.cpp)` | 强调模型选择自由 + 全本地 + MIT；附 demo GIF；评论区答技术问题 | 同上 |
| Reddit r/selfhosted | `SpeakType: local dictation for Windows; phone-as-mic relay is self-hostable` | 主打 relay 自托管 + 零云依赖 | 与 r/LocalLLaMA 错开一周 |
| Reddit r/windows、r/productivity、r/speechrecognition | `I was tired of Win+H needing internet and never learning my jargon, so I built an open-source alternative` | 对照 Win+H 三大抱怨（断网/无词表/说半句停）逐条解决；这三个 sub 正是评测文取材地（https://www.onresonant.com/resources/best-speech-to-text-windows-reddit ） | 各 sub 间隔发，遵守各自自荐规则 |
| Product Hunt | `SpeakType — You speak, it types. Open-source AI voice typing for Windows` | 学 superwhisper：给 PH 社区专属福利（开源产品可给「预置云引擎额度」或周边）；maker 全天在评论区；准备 demo 视频 | 周二-周四发布 |
| Accessibility/RSI 社区（r/RSI、r/disability 相关） | `Free open-source dictation for Windows (built for anyone who can't type comfortably)` | 学 Handy 起源故事打法；语气克制、以工具帖而非推广帖出现 | 不限 |

**中文平台**

| 平台 | 建议标题 | 正文要点 |
|---|---|---|
| V2EX /创造 | `我做了一个开源的 Windows AI 语音输入：按住右 Ctrl 说话，松手上屏，默认离线，改错一次它就记住` | 学 Typeflux 帖结构：动机→demo GIF→技术栈（Electron+SenseVoice）→差异点（拼音热词纠错、手机当麦）→坦白不足→求反馈。V2EX 已有用户求 Windows 版语音输入（https://www.v2ex.com/t/1098926 ） |
| 少数派 | `讯飞之外的选择：一款开源、离线、越用越懂你的 Windows 语音输入工具`（社区作品通道） | 走「社区作品」免审即发、无首发要求；若走投稿需少数派首发（个人渠道 7 天内可豁免，规则 https://manual.sspai.com/guide/proc/ ）。文章形态=深度使用体验+与讯飞/Win+H 对比表 |
| 即刻（AI 工具圈）/ 小红书 / B站 | B站：`Windows 语音打字终极方案？开源免费还离线`（3 分钟 demo 实录） | Whisper-Input 即起源于即刻灵感（README 自述）；B站/小红书吃「效率工具实测」内容 |
| 知乎 | 在「Windows 有什么好用的语音输入」类问题下写长答 | SEO 长尾，附 GitHub 链接 |

**GitHub 侧免费曝光位（具体清单）**

| 曝光位 | 链接 | 收录要求 / 做法 |
|---|---|---|
| sindresorhus/awesome-whisper | https://github.com/sindresorhus/awesome-whisper | PR 加到 Apps 区；sindre 系列要求项目成熟、README 规范、描述句式统一（见其 contributing.md）。SpeakType 支持 whisper.cpp，符合主题 |
| danielrosehill/Awesome-Whisper-Apps | https://github.com/danielrosehill/Awesome-Whisper-Apps | 有专门 Windows 分区（现推荐 WinWhisper），PR 门槛低，优先做 |
| saharmor/awesome-whisper | https://github.com/saharmor/awesome-whisper | Repositories 区提 PR |
| 0PandaDEV/awesome-windows | https://github.com/0PandaDEV/awesome-windows | 2.5k+ stars；PR 加入（有 oss 标记体系）；明示「拒绝低质工具」，README/官网需齐整 |
| awesome-windows 中文系（wh211212/awesome-windows-cn 等） | https://github.com/wh211212/awesome-windows-cn | 按各自 Contributing.md 提 PR |
| sindresorhus/awesome-electron | https://github.com/sindresorhus/awesome-electron | SpeakType 是 Electron 应用，符合收录主题 |
| GitHub Topics | https://github.com/topics/speech-to-text 、/dictation 、/voice-input 、/whisper | 已配置（asr/dictation/sensevoice/whisper 等）；建议补 `speech-recognition`、`voice-typing`、`offline-first`、`accessibility` |
| GitHub Trending | — | star 短期集中增长即可上榜（HN/Reddit 爆帖当天最易触发），上榜本身再带一波流量（Handy 的月度曲线即此模式） |
| README badges | https://shields.io | 已有 License/Platform/Release 徽章；建议补 GitHub stars 动态徽章、star-history 曲线图（https://star-history.com ）、`winget install` 一行命令（学 Buzz，先提交 winget-pkgs manifest：https://github.com/microsoft/winget-pkgs ） |
| winget / Scoop 收录 | https://github.com/microsoft/winget-pkgs 、https://github.com/ScoopInstaller/Extras | 提交 manifest PR；对 Windows 开发者人群是重要「可信分发」信号 |
| alternativeto.net | https://alternativeto.net | 免费登记，挂到 Wispr Flow / superwhisper / Handy 的 alternatives 页下吃搜索流量 |

**节奏建议（推断）**：先补齐第 1、2 项工程短板（防崩溃/防丢字，避免 Handy 式差评潮）→ 提交全部 awesome 列表与 winget（1 周内可完成，纯 PR）→ V2EX + r/LocalLLaMA 首发试水 → 汇总反馈迭代 2-4 周 → Show HN + Product Hunt 正式打。所有帖子首发扑街不弃疗，间隔重发（Handy 验证）。

---

### 附：证据完整性说明
- 已验证：以上所有链接均来自本次搜索结果原文。
- 未验证：各产品实际使用体验、抱怨的普遍性占比（评论属抽样非统计）、Aqua WER 数据（厂商自报）、GitStarClub star 曲线精确度。
- 竞品价格随时会变，引用时请以官网当日为准。
