# SpeakType 第 40 轮严格审查报告

- 审查对象：main@637fd68（含 PR #91 失焦结算前补读 + 学词按批合一 toast/Undo + Home 手机麦锚点、PR #92 锚点高亮 ring 常亮热修）
- 打包方式：`npm run pack:dir` 全绿（exit 0），实测 `release\win-unpacked\SpeakType.exe`（v0.11.0）
- 证据标注：【实测】打包应用真机证据；【源码】源码推断；【未验证】未执行

## 一、专项 a：免按连续听写长会话（全部通过）

【实测】Alt+Q 进入免按 → 连续口述三句，全部逐字精确落字且句间自动补空格：

```
This is the first sentence of the long hands free session. The second sentence
should follow with a space. Here comes the third sentence to close the session.
```

- 悬浮条全程可见，且命中 notepad.exe 规则显示 "To my boss" 徽标。
- **静音自动退出**：保持静音后日志出现连续 6 轮 `finalize durationMs≈10000 voicedMs=0`（约 1 分钟），第 6 轮触发退出并弹 toast "Hands-free mode ended — No speech detected for a while, so listening stopped. Press the hotkey to start again."（截图 shots/01），措辞清晰告知原因与再进入方式。
- **退出后再进入**：再按 Alt+Q 正常进入新会话，行为一致；退出过程无垃圾字符落入文档、无"没听清"toast 叠加覆盖。
- 长会话观察：静音轮零 ASR 调用（voicedMs=0 直接跳过），无内存/稳定性异常迹象。

## 二、专项 b：人设按应用规则端到端（全部通过）

【实测】完整链路：已有规则 notepad.exe → To my boss。

1. **警示条**：润色未配置时 Personas 页规则区显示 "Rules only take effect with an AI polish model configured — set one up first." + "Set up AI polish" 链接（截图 shots/04）；点击直达 设置→AI model tab，落点准确。
2. **配置**：启用润色 + 仓库 mock 端点（`scripts/mock-rewrite-server.mjs`，Base URL `http://127.0.0.1:18099/v1`，Key 留空）→ Test connection "Connected: mock"（零 key 路径再次回归通过）。
3. **起手命中**：前台 Notepad 口述 → 悬浮条显示 To my boss 徽标 → 落字为 MOCK-REWRITE 改写结果，mock 回显的 prompt 中含人设风格要求（PROFESSIONAL），证明规则命中的人设真实参与了润色 prompt 组装。
4. **历史印证**：`history.json` 条目 `raw=原口述句`、`personaName=To my boss`、`text=MOCK-REWRITE:...` 三字段互证。

结论：建规则→切前台应用→徽标→润色→历史 全链路顺畅，警示条与直达入口无可挑剔。

## 三、专项 c：词典 50+ 词可用性（通过，1 个 P3）

【实测】注入 60 词（testword01-59 + summary）后：

- 列表两列网格完整渲染、计数 "60/300 hotwords" 正确、滚动正常（截图 shots/06）。
- **搜索**：输入 "word3" 即时过滤出 testword30-39（截图 shots/05）。
- **删除**：点 X 即删，计数 59/300，过滤态保持。
- Clear all 按钮在（未点，避免误清）。

**P3（新）：300 上限静默截断**【源码】——批量粘贴超过上限时 `Dictionary.tsx` `merged.slice(0, MAX_HOTWORDS)` 静默丢弃超出部分，零提示；自动学词侧 `learnCorrections` 满 300 也静默 `continue`。用户批量导入 350 词只进 300 个且不知道丢了哪些。建议：超限时 toast/行内提示 "已达 300 上限，N 个词未导入"（~5 行 + 1 条五语文案）。

**测试插曲（如实记录，非产品缺陷结论）**：一次外部编辑配置注入 60 词后 UI 显示 0 词，后续三次重试（含刻意带 BOM 写入验证 `backupIfCorrupt` 自愈路径）全部正常显示 60 词，未能复现。BOM 自愈实测有效（带 BOM 写入 → 启动后文件被剥 BOM 重写、词典完整）。判定为一次性测试环境偶发（疑与 taskkill 时序有关），不立案；若未来用户报"词典清空"可回查此线索。

## 四、专项 d：Undo 会不会误删用户手动加过的同一个词（结论：不会，代码+实测双证）

【源码】`learnCorrections` 入批前有守卫：`if (hotwords.includes(item.right) || hotwords.length >= 300) continue;` —— 词已在词典（无论手动加还是先前学的）时**根本不会进入本批 learned**，也就不会出现在 Undo 的 `words` 列表里。Undo 的 `filter((w) => !words.includes(w))` 只可能移除本批真正学入的词。

【实测】词典预置 "summary"（模拟用户手动添加）→ 口述 "The report is ready." → 精确把 report 改成 summary → 日志出现 `auto-learn: "report" -> "summary"`（watchedit 侧照报），但：无 toast 弹出、词典计数不变、"summary" 原样保留、历史条目未被改写。守卫生效，学习被正确跳过，Undo 无从误删。

唯一理论边界（记录不立案）：学词 toast 存活的 6 秒内用户恰好手动去词典页加同一个词（重复添加本身被去重），此时点 Undo 会把这个词移除——毫秒级人造场景，无修复价值。

**顺带完成 #91 批量 Undo 全链路真机验证**（上轮仅开发者自测）：同一停顿窗改两个词（folder→binder、office→garage，记事本替换对话框一次性完成）→ 单条 toast "\"binder, garage\" added to dictionary"（learnedManyBody 文案实拍）+ 单个 Undo 按钮 → 点击后两词同时移出词典 + 历史条目还原原文（binder/garage 在词典中零残留）。第 38 轮 P3-单槽问题正式闭环。

## 五、常规回归（P0=0，零回归）

- 【实测】核心 RightCtrl 链路：本轮 5+ 次口述全部逐字精确落字。
- 【实测】toast.learnedManyBody 英文实拍命中（见上）；五语 learnedManyBody/undoneManyBody 源码核对全部就位（en/zh-CN/zh-TW/ja/ko）。
- 【实测】下载页（Speech）：Provider/Ready/模型切换/Model ready 无回归。
- 【实测】#91/#92 回归：Home 手机麦链接点击 → General 页自动滚动到底部 Audio 区且 "Phone as microphone" 行高亮 ring 可见（截图 shots/03），第 38 轮 P3-锚点闭环。
- 【实测】启动预拨恢复正常：`latest release prefetched: v0.11.0`（上轮 403 限流为 IP 环境问题，已自愈）。

## 六、反问式走查

- 免按静音退出 6 轮×10 秒（约 1 分钟）的取舍合理：太短会误伤思考停顿，退出 toast 措辞已把"为什么停、怎么再来"说清。
- 学词垃圾的最后一类来源是**用户选区含空格的手工替换**（实测 "report "+"summary"→"summaryis" 入库）：#86 词边界吸附只扩不缩，wrong 侧含空格属合法短语修正（第 35 轮已论证不加校验），right 侧粘连词是用户输入的字面事实，产品端已有 Undo + 词典页兜底，不建议再加规则。维持现状。
- 词典页在 60 词下操作流畅，300 词满载性能未测（【未验证】，纯前端渲染风险低）。

## 七、分级汇总与下轮候选

| 级别 | 问题 | 修复建议 |
|---|---|---|
| P0 | 无 | — |
| P1 | 无 | — |
| P2 | 无（本审查周期第二次零 P2） | — |
| P3 | 词典 300 上限批量导入/自动学词静默截断零提示 | 超限 toast/行内提示（~5 行 + 1 条五语文案） |

**下轮候选排序**：
1. P3 词典上限提示（顺手小修，可与其他杂项同 PR）。
2. 词典 300 词满载渲染/滚动抽测（低风险，回归清单加一条即可）。
3. 打磨期收尾建议：自动学词系列（#84-#91）已全链路闭环，建议下轮转向**真实用户视角的官网下载→安装→首启→第一句**全新机器链路抽查，或开始 v0.12 功能规划。

## 测毕清场

词典已清空（hotwords=0）、润色已关闭且 Base URL/Key/Model 清空、模型 parakeet-tdt-0.6b-v3、语言 en/en、remoteMic=False；SpeakType/notepad/node(mock) 进程已全部退出、无 whisper-server 残留；防火墙三 profile 全 OFF、无网络阻断。未修改任何产品代码。
