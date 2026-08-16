# 第 111 轮体验官审查报告 — 人设+润色 LLM 全链路真实指令风格化专项

- 基线：main @ `f03d8aa`，`npm run pack:dir` 退出码 0，打包版实测
- 方法：mock OpenAI 兼容端点（127.0.0.1:18099）逐请求落盘完整 prompt 实证
- 口径：【实测】/【源码】/【未验证】/【推测】

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

零立案，观察 ×1（LLM 违规前缀不清理，见 ⑤）。

## ① 内置人设 prompt 一致性与替换完整性【实测】过

抓包实证 prompt 结构固定为：整理助手总指令 + 4 条要求（只出正文/去语气词/自我更正/风格要求）+ 词典热词（如有）+ `"""原文"""`。

- Default：风格行 = "Keep the text natural, clear and conversational…drop the trailing period"（uiLanguage=en 时人设 prompt 取本地化文案【源码 personas.ts:10】，与人设描述一致）。
- Auto translate：风格行 = "If the text is Chinese, translate it into natural fluent English…"，与人设描述一致。
- To my boss：风格行 = "Professional, composed and results-oriented; lead with conclusions, risks and next steps…"，一致。
- 替换完整性：mock 返回「LLM整理后的正文」→ 落字与历史 text 均为该完整内容，raw 保留 ASR 原文「今天下午3点开会，预算是5200元。」，无截断无拼接残留。

## ② 自定义人设特殊字符/多行/超长指令【实测】过

注入 544 字符自定义人设（多行 + 引号/反斜杠/花括号/尖括号/$变量/反引号 + 超长填充）：抓到的 prompt 中指令**逐字节完整嵌入**，多行结构保持、特殊字符无转义损坏（JSON 序列化承担转义【源码 polish.ts:345-354】）；历史条目 personaName 显示自定义名。

## ③ Alt+数字切人设后立即听写【实测】过

Alt+2（翻译）→ 1 秒内按住听写：本次请求 prompt 已是翻译风格行；Alt+8（自定义，内置 7 个 + 自定义排第 8【源码 store.ts:234-237】）→ 立即听写同样即时生效。无一次滞后。

## ④ 应用规则 vs 手动选人设优先级【实测】过

手动人设 = 自定义（Alt+8 选中态），规则 `notepad → To my boss`：Notepad 前台听写抓到的 prompt 风格行为 boss，历史 personaName = "To my boss"——**规则命中优先于手动选择**，且规则在按下录音键时定格【源码 dictation.ts:307,585】；WordPad（不命中）回落手动人设。与人设页「多条规则先命中先用」的 hint（#176）自洽。

## ⑤ LLM 返回引号/前缀清理【实测】

- 返回带首尾引号 `"…"`：落字前**引号被剥掉**（`replace(/^["“]|["”]$/g,"")`【源码 polish.ts:373】）✓。
- 返回 `Here is the polished text: …` 前缀：**原样落字，前缀不清理**。prompt 第 1 条已明令禁止解释，主流模型遵守；小模型偶发违规时用户需手改。观察①（不立案）：可考虑 ~3 行剥离常见 "Here is…"/「以下是」类前缀，留作设计论证候选。

## ⑥ 润色开启 + Default 人设基线【实测】过

与 ① Default 一致：走 LLM（不走本地断句路径），风格行为 Default 文案，返回完整替换。LLM 失败/超时回退本地清理链路第 107/108 轮已验，本轮不重复。

## ⑦ 核心回归【实测】过

还原配置（关润色）后：RightCtrl 中文「今天下午3点开会，预算是5200元」含 ITN + Alt+Q「我们明天去公园散步」准确落 Notepad。

## 清场记录

mock 进程停、18099 无监听（仅 TIME_WAIT 残连自然消退）；配置/历史整体还原（自定义人设/规则/润色配置全清，原 321 条历史、原规则 1 条与 personaId 原样）；非只读；进程 0；无 .part；43117 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. 观察①（违规前缀剥离 ~3 行）若采纳一并回归。
2. 度量脚本第三数据点随下个发版跑。
3. 真手机麦/云端 key 补账（挂账）。
