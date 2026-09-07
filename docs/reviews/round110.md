# 第 110 轮体验官审查报告 — 官网/README 与 0.15.0 实态一致性全面复查

- 基线：main @ `f03d8aa`，`npm run pack:dir` 退出码 0
- 口径：【实测】/【源码】/【未验证】/【推测】

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

零立案，不一致清单为空（0 条）。

## ① 官网英/中页逐块对照【实测 + 源码核对】全过

对照方法：抓取 https://speaktype.zalize.com/（en）与 /zh/ 全文，逐块对照打包版实态与源码。

| 官网表述 | 实态核对 | 结果 |
|---|---|---|
| Hero：Hold RightCtrl / v0.15.0 / 文件转录 TXT·SRT | 默认热键与版本一致，转录页第 109 轮全测过 | ✓ |
| 上手第 2 步「Settings → Speech / 设置 → 语音识别」 | 页签实名 en "Speech" / zh 「语音识别」【源码 locales】，#185 修正后保持 | ✓ |
| FAQ 改热键「Settings → General / 设置 → 通用 →录一个键」 | 热键捕获在 General/通用 页签，页签名逐字一致 | ✓ |
| Alt+Q 免提静音自停 | 与实态一致（第 109 轮核心回归） | ✓ |
| SenseVoice 0.27s/句、Parakeet TDT 0.6B v3、whisper.cpp tiny/base/small | 与应用内模型列表和历轮实测同量级 | ✓ |
| ASR/润色预设列表（Groq/Fireworks/Voxtral/SiliconFlow/百炼；DeepSeek/GLM-4-Flash/Kimi/通义/Ollama） | 与应用内预设一致（第 103 轮逐一对应，本轮抽查未变） | ✓ |
| 润色留空本地清理「5点，不对，6点→6点」 | polishText 本地兜底行为一致 | ✓ |
| 文件转录 mp3/wav/m4a/mp4 视频、最长 3 小时 | accept 含 audio/*、video/mp4、video/webm【源码 Transcribe.tsx:192】，3 小时上限历轮实测 | ✓ |
| 自动学词「盯一个输入框/本机比对/学进词典并同步历史/可关闭」 | 与 watchedit 实态一致（#109 系列历轮实测） | ✓ |
| FAQ 卸载保留「约 660MB 离线模型」 | 本机 parakeet 实测 639MiB（≈670MB 十进制），量级吻合 | ✓ |
| 手机麦 LAN 直连 + 自部署中转 + APK/PWA | 与第 100 轮配对走查实态一致 | ✓ |
| 免责/非公开接口默认关闭表述 | 与应用内 ChatGPT/豆包通道默认关一致 | ✓ |

近 20 轮行为变化（#164 IA/#174 托盘/#177 词典两步确认/#186 保存失败 toast/#188 文案/#190 超时）官网均未涉及具体描述，无过时表述残留；#164/#185 更名后的页签名官网两处（上手步骤/FAQ）均已同步。

## ② 三资产可达性与版本【实测】过

| 资产 | HEAD | 体积 | 官网标注 |
|---|---|---|---|
| SpeakType-Setup-0.15.0.exe | 200 | 103,250,440 B（98.5MiB） | 约 98MB ✓ |
| SpeakType-0.15.0-portable.exe | 200 | 91,664,958 B（87.4MiB） | 约 87MB ✓ |
| SpeakType-0.15.0.apk | 200 | 2,494,687 B（2.4MB） | — ✓ |

英/中页版本号均 v0.15.0，与 README badge 一致。

## ③ README 同步抽查【实测】过

README.md / README.zh-CN.md：版本 badge v0.15.0、三资产直链与体积（~98MB/~87MB）、「Settings → Speech」（#185 修正保持）、RightCtrl/Alt+Q 描述、离线模型三家列表、润色预设与本地兜底描述——与官网及应用实态逐项一致，无过时内容。

## ④ 核心回归【实测】过

RightCtrl 中文「今天下午3点开会，预算是5200元」含 ITN + Alt+Q「我们明天去公园散步」准确落 Notepad。

## 清场记录

配置/历史还原；官网抓取临时文件留 review 工作区（不入库）；非只读；进程 0；无 .part；43117 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. 度量脚本第三数据点随下个发版跑。
2. 长期未审：应用内 About 页/更新流程专项，或人设+润色 LLM 全链路（真实指令风格化）复查。
3. 真手机麦/云端 key 补账（挂账）。
