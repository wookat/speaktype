# 第 101 轮体验官审查报告 — #181 回归 + 可用性度量基线 + Handy 同机对照

- 基线：main @ `998170a`（含 #181），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022，虚拟声卡（TTS/MP3 经默认输出回环进麦克风）。**所有延迟绝对值仅作本机相对对比，不代表真实硬件**
- 口径：【实测】= 打包版运行实证；【源码】= 代码核对；【未验证/推测】= 如实标注

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

零新立案；观察项 ×1（热词英文路径见 ③）。

## ① #181 回归【实测】

- 改写缺模型 toast：现为「Configure an OpenAI-compatible model in Settings → **AI polish**」，与页签名一致，且自动直落 AI polish 页签。
- 手机麦失效链接页：`?t=wrongtoken` 现返回带样式的本地化 HTML「Link expired / Go back to SpeakType on your PC and scan the QR code again」，替代原纯文本。两处第 100 轮观察闭环。

## ② 可用性度量基线（供后续轮次对照）【实测】

测法：延迟 = 松开热键 → 剪贴板出现结果文本（轮询 25ms 粒度）；SenseVoice-small 本地识别；短句 zh=「今天下午3点开会，预算是5200元」，en="this is a short test sentence"。

| 指标 | 数值 | 备注 |
|---|---|---|
| 冷启动 → ASR 就绪 | **3.2 s**（日志 starting→sherpa worker started；含进程创建 3.6 s） | 模型已下载态 |
| 松手 → 落字延迟 zh（5 次） | 228/228/230/231/237 → **中位 230 ms** | 流式预识别生效 |
| 松手 → 落字延迟 en（5 次） | 174/201/203/204/226 → **中位 203 ms** | 同上 |
| F8 改写端到端（3 次，mock 润色即答） | 136/142/157 → **中位 142 ms** | ≈ 管线开销（finalize+HTTP+落字），真实模型需另加推理时延 |
| 热词纠错命中 | **4/7**（zh 同音 2/2；en 变体 2/5） | 见下 |

热词抽样明细（词典预置 10 词）：zh 同音「开会→开慧」「散步→散布」均命中；en 变体 "java script"→JavaScript、"git hub"→GitHub 命中，"speak type"/"type script"/"dev ops" 3 例未命中——history 原文分别为 "Sp type"/"TypeScr"/"DevOs"，**根因是 ASR 漏音节**（拼接后与热词 key 不等长，ASCII 路径为精确拼接匹配【源码 hotwords.ts:44-72】），同句在第 98/100 轮曾命中，属 TTS 发音/ASR 波动而非替换逻辑缺陷。观察：ASCII 热词无模糊匹配，ASR 轻微漏音即失效——是否值得给 ASCII 路径加编辑距离 ≤1 的容错，留作设计论证候选。zh 近音归并（z/zh、n/l 等）无中文 TTS 无法自由造句，仍为【源码】级。

## ③ Handy 0.9.5 同机对照（Nemotron Streaming 3.5 多语模型）【实测】

| 项目 | SpeakType 0.15.0 | Handy 0.9.5 |
|---|---|---|
| 松手→落字 en 中位 | **203 ms** | 228 ms（205-264） |
| 松手→落字 zh 中位 | **230 ms** | 241 ms（230-249） |
| zh 识别质量 | 「今天下午3点开会，预算是5200元」**含 ITN** | 「今天下午三点开会，预算是五千二百元。」准确但**无 ITN**（汉字数字） |
| en 识别质量 | 全对含首字母大写标点 | 全对含标点 |
| 剪贴板行为 | 落字后结果留在剪贴板 | 落字后恢复原剪贴板 |

实事求是：两者延迟同量级（差距 <40ms，在虚拟声卡环境噪声内，只能说互有胜负、SpeakType 略优）；zh 数字场景 SpeakType 的 ITN 明显更实用；Handy 的剪贴板恢复对重度剪贴板用户更友好（SpeakType 侧已有历史页可找回，取舍不同）。Handy 模型下载 716MB vs SpeakType sensevoice ~200MB 量级。

## 清场记录

- Handy 已卸载（注册表卸载项消失、安装目录与 %APPDATA%\com.pais.handy 已删、安装包已删）；mock node 停；配置/历史从备份还原（词典 10 词注入随还原清除）；latest-release.json/transcribe-last.json 已删；度量脚本留在 review 工作区未入库。
- SpeakType/Handy 进程 0；无 .part；43117/18099 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. ASCII 热词编辑距离容错设计论证（观察项落地与否供决策）。
2. 度量基线复测自动化（把本轮四指标脚本固化成一键脚本，后续每发版跑一轮对照）。
3. 真手机麦/云端 key 补账（挂账）。
