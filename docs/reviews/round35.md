# SpeakType 第 35 轮严格审查报告

- 审查对象：main@a4a4c5e（含 PR #86：LCS 每段 diff 词边界吸附+重叠合并、learnableWord 英文 wrong 整词校验、中文单字差异回扩 1 字）
- 方法：git pull → `npm run pack:dir`（全绿）→ `release\win-unpacked\SpeakType.exe` 真机走查 + 函数级对拷（直接 transpile 仓库 watchedit.ts 实跑，非手抄）
- 环境：Windows Server 2022，未开防火墙、无网络阻断；测试状态已还原（模型 parakeet、语言 English、词典含本轮学入词已清空）
- 证据标注：【实测】打包应用真机证据 /【源码】源码推断 /【函数级】transpile 仓库源码的 node 用例 /【未验证】未能验证
- 本轮未改任何产品代码，未开 PR

---

## 一、#86 回归——核心修复通过

### 1. 两词同窗口修改学完整词——【实测】通过（上轮 P2 闭环）
口述落字 "Please send the report before the review tomorrow." → 同一停顿窗口内改 "review"→"feedback" + "report"→"summary" → 日志：
```
auto-learn: "report" -> "summary"
auto-learn: "review" -> "feedback"
```
词典恰好两个完整词，**无 summa/dback 类碎片**。

### 2. 中文单字差异回扩——【函数级】通过
transpile 仓库源码实跑："名天→明天" 学到完整 `名天->明天`（真识别错误形态，上轮拒学）；"明天→后天" 也入库（语义改写，惰性噪声，符合上轮论证预期）；纯标点修改不学。【未验证】中文真机口播链路（无中文 TTS 条件）。

### 3. 顺带观察（记录不立案）
一次真机运行中 settle 未在编辑后 1.5 秒触发，学习延迟到该观察进程被下一次落字顶掉时才结算（`auto-learn "report"->"Report"` 时间戳=下次听写开始时刻）。最终没丢学习，但即时性偶发不稳，复现条件未钉死，先记录。

## 二、P2（本轮唯一，二选一必须修）：纯大小写修正实际会入词典，与第 34 轮固化清单断言直接矛盾

- 回归清单新增条目写着：**"纯标点/纯大小写修改仍不入词典"**。
- 【函数级】"report"→"Report" 产出 diff 且 learnableWord 放行；【实测】真机同场景日志 `auto-learn: "report" -> "Report"`，词典出现 `Report`。
- 【源码】learnableWord 全文无任何大小写比较（无 toLowerCase/localeCompare），en 分支 wrong≠right 按区分大小写比较——**实现从未有过大小写守卫，清单断言是错的**。
- 后果：学到 `Report` 后，correctAsciiHotword 大小写不敏感整词替换会把此后所有 "report" 落字全局改成 "Report"。
- 二选一修复：
  - a) 认定大小写修正值得学（用户特意改的专有名词大写）→ **改清单文案**，并把"学到 Report 后全局替换"明示为预期行为；
  - b) 认定风险大于收益（句首重排误伤、报告类常用词被强制大写）→ learnableWord 加 1 行：`if (en && diff.wrong.toLowerCase() === diff.right.toLowerCase()) return null`，清单不动。
- 我的建议选 **b**：热词的语义是"识别错误纠正"，纯大小写不是识别错误；且误学的都是高频常用词，全局替换伤害面大、用户难定位来源。

## 三、待评点答复：wrong 侧学到含空格的 "report before"——不需要加同校验

- 【源码】`wrong` 只有两个用途：learnable 门槛比对 + 历史条目 `text.replace(wrong, right)` 同步修正；**入词典的只有 right**（learnCorrection:481-482），wrong 不会污染词典。
- wholeWordIn 已保证 wrong 两端是完整词边界，碎片（上轮的 "w"）已挡住；中间含空格意味着用户把短语改成了一个词（如 "report before"→"summary"），这是合法修正，历史替换恰好需要完整短语才准确。
- 加 wrong 侧单词正则反而**丢学习机会**（合并词修正、连字符化修正都会被拒）。结论：维持现状，建议在 wholeWordIn 注释里写明这个决策理由即可。

## 四、P3 遗留核对

- **P3-③ 零 key 文案**：#86 未涉及，官网/README 仍无「本地端点 API Key 可留空」表述（四轮遗留）。
- **P3-④ latest 预拨日志**：未涉及，回归清单"启动约 5 秒后 log 已完成预拨"条目仍无法按写法验证（三轮遗留）。
- **P3-① 大小写决策**：已升级为本轮 P2（见第二节，清单与实现矛盾必须消解）。

## 五、例行回归

RightCtrl→Parakeet 三句落字逐字精确；学词 toast 正常弹出；观察进程随新落字正常替换、无 powershell 残留；词典 Clear/Save 正常。

## 六、分级汇总

| 级别 | 数量 | 内容 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 | 纯大小写修正实际入词典，与固化清单断言矛盾（建议加 1 行大小写守卫，或改清单二选一） |
| P3 | 3 | ① 零 key 文案（四轮遗留）② 预拨日志 1 行（三轮遗留）③ settle 即时性偶发延迟（记录观察） |

## 七、下轮优先级建议

1. **P2** 大小写守卫 1 行（建议方案 b）+ 清单核对
2. P3-①② 零 key 文案 + 预拨日志（都是顺手项，建议合并一个杂项 PR 清账）
3. P3-③ settle 延迟仅观察，暂不投入

## 八、未验证范围

- 中文自动学词真机链路（含 #86 回扩；无中文口播条件，函数级已覆盖）
- settle 延迟的确定性复现
- 正向更新横幅 UI（无新版本）
- 真人麦、APK、云端三通道（照旧）
