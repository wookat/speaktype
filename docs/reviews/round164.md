# 第 164 轮体验官审查报告

- 日期：2026-08-17
- 基线：main@a5cbc08（含 #253 假名语境跳过 / #254 skill）
- 打包：`npm run pack:dir` 成功（round164\pack.log），产物 0.15.1
- 证据分级：【实测】打包运行时直接证据；【源码】源码检视；【推测】推断；【未验证】未执行

## 结论：P0=0，P1=0，**P2×1**，P3=0

## ① #253 回归抽查【实测】全过

词典置「电话」「工园」双热词，language=auto：
- 日文 jatel.wav →「明日電話します」——**電話保留**，raw 一致，163 轮误伤消除（假名语境跳过生效）。
- 中文 zh2.wav →「我们明天去**工园**散步」（raw=「…公园散步。」）——纯中文拼音同音替换分支未被误伤，仍正常工作。
- 测毕词典 Clear 两步确认清零（0/300）。

## ② 专项 a：Phone as microphone 配对/QR 边界【实测】全过

选择理由：手机麦开关、QR 生成、令牌鉴权与端口生命周期从未运行时专审（无真手机，测协议侧边界不冒充手机）。

- 开关 ON：QR + `https://172.16.8.2:43117/?t=a617b21de487` 即时出现，「Waiting for a phone to connect…」状态与 Connection=LAN direct 下拉在位；43117 开始监听（0.0.0.0，owning=SpeakType）。
- 令牌门禁：无 token→403、错 token→403（页面与 /ws 双路径）、正确 token→200 返回手机页 HTML——未持二维码者无法访问。
- 开关 OFF：43117 监听即时消失，无残留。
- 真手机端到端（麦克风采集/hold-to-talk 落字）仍【未验证】（无真机，沿旧挂账）。

## ③ 专项 b：Enhanced punctuation（AI 标点）链路

选择理由：~281MB 附加标点模型的启用链路与实际标点质量从未专审；punct-ct 模型已在机可直测。

- 启用链路正常：模型已在盘时开关 ON 即显「Add-on ready — punctuation upgraded」，无重复下载；log「punct worker started」。

### P2-① 立案：Enhanced punctuation 会劣化 parakeet 已带标点的英文输出（数字/货币被拆坏、双逗号）

- 现象【实测】（2/2 复现，parakeet-tdt-0.6b-v3 + punct ON，25s 英文长句）：
  - raw（模型原生，正确）：`…front end interface, the backend service… keep the budget under$35,000… at 3 p.m.`
  - text（punct ON 落字）：`…front end interface,, the backend service… keep the budget under $,35,, 000, … at 3 p. M.`（第二次为 `3 pm.`）
  - 关闭开关同音源即恢复正确：`…interface, … $35,000, … 3 p.m.`——corruption 完全由该开关引入。
- 危害：开启该「增强」开关的用户，parakeet 英文听写的金额（$35,000 → $,35,, 000）、缩写（p.m. → p. M.）被破坏且叠加双逗号，属落字数据损坏，故定 P2。
- 根因【源码】polish.ts：
  1. `needsPunctuation` 英文分支只数句末 `[.!?]`（`endPunct <= words/10`），parakeet 输出逗号丰富但长句句号少，被误判为「缺标点」送入模型重打；
  2. ct-transformer（zh-en）对已含标点/含 `$35,000` 数字串的文本重打标点产生 `,,`、`$,35,,000`；`toEnglishPunct` 再把 `p.m.` 拆成 `p. M.`（句点后大写规则误伤缩写）。
- 修复建议：英文分支把逗号计入密度判断（总标点/词数），已有明显标点即跳过模型；或模型重打前保护数字/货币/缩写 token。

## ④ 核心回归【实测】全过

- RightCtrl 中文（language=zh，sensevoice）：「我们明天去公园散步」1/1 全对。
- Alt+Q 英文（language=en）：「The review and the report are done today.」全对。

## 环境限制

- 真手机麦端到端、auto×粤语、云端 key、多显示器沿旧挂账【未验证】。

## 清场

- SpeakType/Notepad 进程停、43117/18099 无监听、无 .part、failed-audio 空。
- config/history 由 round164-*.bak 还原（history 321 条，热词/模型/语言/标点开关随 config 还原）。
- 防火墙三 OFF；repo 回 main，git status 干净。
