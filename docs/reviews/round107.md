# 第 107 轮体验官审查报告 — F8 改写/润色链路深度专项

- 基线：main @ `3bce3f1`，`npm run pack:dir` 退出码 0，打包版实测
- 方法：本机 mock OpenAI 兼容端点（127.0.0.1:18099，按模式文件切换 normal/delay15s/hang/empty/huge200k/控制字符），记事本 3162 字符长文本为改写目标
- 口径：【实测】/【源码】/【未验证】/【推测】

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 1 |

P3×1，观察 ×2。

## ① 长文本选中改写【实测】过

3162 字符全选 F8 口述指令：请求体完整送达（mock 收到全文），mock 全量大写回包**原位完整替换 3162 字符、END 标记保留、无截断无丢字**；mock 即答时端到端体感 = 指令转写耗时，无额外卡顿。

## ② 慢响应/挂死 —— P3-① 立案

- **mock 延迟 15s【实测】过**：悬浮条持续显示指令字幕 + 「Polishing…」状态，15s 后正常替换；期间再按 F8 被防重入忽略（mock 仅收到 1 次请求），不重复触发。
- **P3-①：润色/改写 fetch 无超时无取消，挂死端点让「Polishing…」卡住约 5 分钟且期间听写被静默吞掉【实测】**。mock 收请求后永不回包：悬浮条「Polishing…」持续挂起（实测 2 分钟仍在），**期间按 RightCtrl 听写完全无反应——无录音、无 toast、无排队**（busy 短路【源码 dictation.ts:294】）；无任何用户可用的取消手段（录音期胶囊 X 只管录音段）。约 5 分钟后依赖 Node undici 默认 headers 超时自行失败：弹 rewriteFailed toast、选区保留、状态自恢复。真实场景 = 云端润色端点挂死/网络黑洞时用户整机听写「假死」5 分钟。建议 ~5 行：fetch 加 AbortSignal.timeout(30s)（polishText 与 rewriteSelection 各一处），可选再给 polishing 态胶囊一个取消按钮。
- 修复自证【实测】：超时自恢复后无需重启，下一次听写/改写立即正常。

## ③ 异常响应降级【实测】过（观察 ×2）

- **空内容**：不落空文本，选区原样保留 + toast「Rewrite failed — The polish model returned nothing; the text was left unchanged」（实拍）。
- **超长 200k 字符**：完整插入目标应用（199999 字符核对），不崩溃不卡死。观察①：对异常 provider 的超长回包无长度上限保护，可向目标应用一次性注入 20 万字符；正常 provider 不会出现，仅记录。
- **控制字符**（含 NUL/BEL/ANSI/退格）：不崩溃；落字在首个 NUL 处被剪贴板语义截断（仅 "A" 落入）。观察②：NUL 后内容静默丢失，真实 provider 基本不产 NUL，仅记录。

## ④ 口述指令改写 + 热词纠错（#109 回归）【实测】过

- 指令「translate the speak type documentation」正常走完改写并替换选区。
- 指令路径热词纠错生效：本机 TTS 经 ASR 恒出 "Sp type"（重度漏音，超 #182 一处容错属设计内），加入等价热词后 mock 收到指令 **"Translate the SpType documentation."** ——两词跨空格归并 + 大小写纠正，证明 correctHotwords 在 F8 指令路径实际执行（#109 回归，等价形）。

## ⑤ 两入口提示回归【实测】过

- 未选中文字 + F8：toast「Nothing selected — Select the text first, then hold the rewrite key and say an instruction」（实拍）。
- 未配置润色 + F8：toast「Rewrite needs a polish model — Configure an OpenAI-compatible model in Settings → AI polish」且**主窗直落 设置→AI polish 页签**（实拍，#181 措辞一致）。

## ⑥ 核心回归【实测】过

RightCtrl 中文「今天下午3点开会，预算是5200元」含 ITN + Alt+Q「我们明天去公园散步」准确落字。

## 清场记录

mock 进程停（18099 无监听）、配置/历史整体还原（polish 清空、热词清零、模型还原）、临时词典条目随还原清除、latest-release.json 删、非只读核实、进程 0、无 .part、43117 无监听、防火墙三 profile 保持 OFF。

## 下轮候选

1. P3-①（fetch 超时 ~5 行）落地回归。
2. 度量脚本第三数据点随下个发版跑。
3. 真手机麦/云端 key 补账（挂账）。
