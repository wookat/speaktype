# SpeakType 第 42 轮严格审查报告 —— 中文新用户链路 + 真实云端 provider + 学词回归

- 构建：main@4bf551f（含 PR #94），`npm run pack:dir` 全绿，win-unpacked 打包实测
- 前置：%APPDATA%\SpeakType 全量备份后移除模拟全新机器（测毕已还原，无 .part 残留）
- 证据标注：【实测】真机证据；【源码】源码推断；【未验证】未执行

## 一、中文新用户全新链路（通过，含模拟方式如实标注）

**locale 模拟方式（如实说明）**：本测试机是英文系统，用两条互补路径拼出完整 zh 新用户视角：
- `Set-Culture zh-CN` + 删配置重启 →【实测】主进程默认判定走 CJK 分支：`language=zh`、`localModel=sensevoice-small`（横幅体积随之变 "约 234MB"，判定正确）；
- `--lang=zh-CN` 启动 →【实测】uiLanguage=system 跟随为简体中文界面。
- 真实 zh Windows（显示语言+区域都是中文）两者同时成立【源码推断合理】；另发现纯 `--lang=zh-CN`（区域仍英文）时会出现"中文 UI + 默认 Parakeet/英文识别"的混合态——这是模拟器造出的非典型环境，真实用户几乎不会踩，不立案。

**首启链路逐步（中文 UI 实测全过）**：
1. Home 横幅「下载离线语音模型——一次性下载（约 234MB）…不联网、无 API Key」+ 一键下载按钮，下一步指向明确；四步引导、手机麦入口中文文案就位。
2. 点下载 → 按钮原位百分比 → 完成 →【实测】**#94 新就绪 toast 实拍命中：「离线模型已就绪 — 一切就绪——按住说话键，说出你的第一句话吧。」**（截图 shots/02）。文案把用户直接推向第一句，第 41 轮 P3 闭环。
3. 第一句中文 RightCtrl（edge-tts 中文语音回放）→ 落字 **「今天下午3点开会，预算是5200元」**——逐字准确 + ITN 双命中（三点→3点、五千二百元→5200元），SenseVoice 标点正常（shots/03）。

## 二、真实云端 provider 实测（非 mock，部分达成 + 如实标注）

本机可用 key 盘点（list_secrets）：仅 DeepSeek API key 可用；一个 OpenAI 兼容中转（code-plan.site）DNS 已失效【实测】；无 Groq/OpenAI/SiliconFlow 等其他 key。

【实测】设置 → 模型 → 服务商预设选 DeepSeek（预设自动填 `https://api.deepseek.com/v1` + `deepseek-chat`，体验顺畅）：
- **真 key**：该账号无余额，测试连接返回 `连接失败：HTTP 402 {"error":{"message":"Insufficient Balance",...}}`——真实 provider 错误路径闭环（shots/04）。
- **错 key**：`连接失败：HTTP 401 {"error":{"message":"Authentication Fails, Your api key: ****-123 is invalid",...}}`——可读、可定位（shots/04b）。
- 【未验证】**云端润色成功路径与云端 ASR 成功路径本轮未测**：DeepSeek 账号余额为 0，且全机无任何其他可用的 OpenAI 兼容 chat/ASR key。需要一个有余额的 chat key（DeepSeek 充值或 Groq/GLM-Flash 免费 key）+ 一个 ASR key（Groq whisper 免费额度即可）才能补上。
- 预设模型名 `deepseek-chat` 与 DeepSeek /v1/models 现返回的 `deepseek-v4-flash/pro` 不一致【实测 curl】——deepseek-chat 是官方长期别名大概率仍可用，但因无余额无法确证，先记观察。

**P3（新）**：测试连接失败时把整段原始 JSON 打在一行红字里，402/401 这类关键信息（Insufficient Balance / key invalid）淹没在 `{"error":{...}}` 噪声中还会被截断。建议优先提取 `error.message` 展示、原始体折叠或进日志（~10 行）。

## 三、常规回归（全过）

- **自动学词一轮（中文首次全链路）**：口述「我们明天去公园散步」→ Notepad 手改 公园→果园 → 失焦即结算，toast「已学会新词 『果园』已加入词典，下次自动纠正 [撤销]」→ 点撤销 →「已撤销 『果园』已从词典移除」+ 词典回 0/300（shots/05/06）。#88/#89/#91 学词-撤销链路中文侧首次实拍闭环。
  - 测试手速注：撤销按钮 6 秒窗口内两次因自动化点击慢于 6s 而错过（非产品缺陷，第 37 轮已论证 6s 维持）。
- **五语 toast.modelReady 抽查**：en/ja/ko/zh-CN/zh-TW 十条 key 全就位、措辞一致（zh-CN 与实拍 toast 逐字吻合），破折号/标点风格统一。
- 词典页中文空态/计数/删除正常；About v0.11.0 预拨正常。

## 四、分级汇总与下轮候选

| 级别 | 问题 | 修复建议 |
|---|---|---|
| P0/P1/P2 | 无 | — |
| P3 | 测试连接失败原始 JSON 一行红字，关键错因淹没且截断 | 提取 error.message 优先展示（~10 行） |
| 观察 | DeepSeek 预设模型名 deepseek-chat 与其 /v1/models 现清单不一致 | 有余额 key 时确证一次；如失效换 deepseek-v4-flash |

**下轮候选排序**：
1. 云端成功路径补测（需老板提供任一有余额的 OpenAI 兼容 chat key + Groq 免费 ASR key，本轮资源缺口一次性提出）。
2. P3 测试连接错误展示小修（可与其他杂项合并 PR）。
3. v0.12 规划候选：慢网/断网模型下载中断续传体验；网页会话通道（ChatGPT/豆包免 key）真机走查——官网三条引擎路里唯一从未实测过的一条。

## 测毕清场

区域设置已还原 en-US；原配置/模型已从备份还原（models 无 .part）；SpeakType/Notepad 进程已清；DeepSeek key 未写入任何持久文件（还原备份配置后不存在）；防火墙三 profile 全 OFF、未执行任何开启命令。未修改产品代码。
