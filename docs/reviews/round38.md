# SpeakType 第 38 轮严格审查报告

- 审查对象：main@fb5a829（含 PR #89 失焦即结算 + Home 手机麦入口 + ja Undo 措辞、PR #90 v0.11.0 发布 bump）
- 打包方式：`npm run pack:dir` 全绿（exit 0），实测 `release\win-unpacked\SpeakType.exe`（About 显示 SpeakType 0.11.0 (fb5a829)）
- 证据标注：【实测】打包应用真机证据；【源码】源码推断；【函数级】独立脚本直接验证；【未验证】未执行
- 本轮环境说明：本机 IP 当前对 GitHub API 返回 403 限流（Invoke-WebRequest 实测），启动预拨 latest 静默失败属 #79/#87 设计内行为（仅 res.ok 才记日志），About 页无横幅、无报错，正确。

## 一、专项 a：UIA 失焦中途快照竞态（结论：确认成立，建议升 P2；候选方案可行性已实证）

### 1. 竞态真机复现【实测】

构造：口述落字 "I will start dictation now." → 选中 "dictation "，键入 "dur"，停 900ms（保证一次 700ms 轮询采到中途状态）→ 补完 "ation " 后 <100ms 内 AppActivate 切走焦点。

结果（main.log + 词典铁证）：

```
[07:04:06.652] auto-learn: "dictation now" -> "durnow"
hotwords: durnow
```

- BLUR 结算用的是上一次轮询的中途快照 "I will start durnow."，最终文本 "I will start duration now." 从未被采到。
- 双重伤害：垃圾词 durnow 入库 + 用户真正想学的 dictation→duration 彻底丢失。
- 历史条目同步被污染：`text: "I will start durnow."`（raw 正确）。

### 2. 为什么建议从 P3 升 P2【源码】

\#89 之前竞态只在"编辑后 1.5s 内恰好被下一次落字顶掉观察进程"时暴露（窄窗口、偶发）；#89 失焦即结算把暴露面扩大到**每一次"改完立刻 Alt+Tab/点别处"**——而"改完马上切走"恰是高频用户行为。轮询间隔 700ms，意味着最后 0~700ms 内的键入在失焦结算时必然不可见。修复自动学词准确性一直是最高权重链路（学错词→全局纠错污染），应尽快修。

### 3. 候选方案可行性论证（结论：可行，风险低，推荐做）

候选：PS 侧在输出 `BLUR|` 前用**缓存的锚点元素**再读一次控件文本。疑问是"控件已失焦，UIA 还能按缓存元素取 text 吗？"——本轮直接实证，两条路径都通：

【函数级】实验一（Win32 经典 Edit / Name 兜底路径）：记事本聚焦时缓存 `FocusedElement`，切走焦点到 cmd 后重读缓存元素：

```
anchor class: Edit
read-while-focused(Name): [hello dictation now test]
read-after-blur(Name):    [hello dictation now test]   ← 失焦后照读成功
read-after-close: no pattern                            ← 窗口关闭后优雅降级，不抛崩溃
```

【函数级】实验二（Chromium/Electron / ValuePattern 路径）：Chrome 页面 textarea 聚焦时缓存元素，焦点切到 cmd 后重读：

```
anchor type: ControlType.Edit
read-while-focused(VP): [value pattern probe]
read-after-blur(VP):    [value pattern probe]           ← ValuePattern 失焦后照读成功
```

原理：AutomationElement 是按元素引用的跨进程调用，`Current.Value`/`GetText` 是活读（live read），不依赖焦点；只有元素本身销毁（窗口关闭）才失效，且表现为 TryGetCurrentPattern 返回 false 或抛 ElementNotAvailable，try/catch 即可兜底回退到现状（用最后一次轮询快照）。

推荐实现（~10 行 PS + 0 行 node）：

1. 首次锚定时同时保存 `$anchorEl = $el`（现在只存 `$anchorId`）。
2. 失焦分支里、输出 `BLUR|` 之前：try 用 `$anchorEl` 走同样的 ValuePattern→TextPattern→Name 三级取文本，成功则先输出一行正常的 `$anchorId|<base64>` 再输出 `BLUR|`。node 侧无需改动——文本行先到会刷新 `pending`，随后 BLUR 用新鲜文本结算。
3. try 失败（窗口已关）直接输出 `BLUR|`，行为与现状一致。

残余风险（可接受）：失焦重读与用户最后一击键之间仍有毫秒级窗口，但用户切走焦点即意味着编辑意图已完成，实际不可能再丢键入；相比现状 0~700ms 的确定性盲区是数量级改善。

## 二、专项 b：单槽 toastAction（结论：确认成立，维持 P3 但值得做；给最小改法）

### 1. 同窗口双词学习真机证据【实测】

口述 "The review of the report is ready."，同一停顿窗内改两处，settle 一次产出两个学习：

```
[07:06:47.019] auto-learn: "review of" -> "feedbackof"
[07:06:47.033] auto-learn: "report is" -> "summaryis"
```

两次 `showToast` 相隔 **14ms**：第一个 toast（feedbackof）在人眼可感知之前就被第二个覆盖，其 Undo 从未有被点到的机会。屏幕上只见 summaryis 的 toast（截图 shots/）。

### 2. 源码定位【源码】

- `index.ts` `let toastAction: (() => void) | null` 单槽，`showToast` 直接覆写；`toast:action` 取走即清空。
- `dictation.ts:485` 学习侧 `entry.text.replace(wrong, right)` 与 Undo 侧 `item.text.replace(right, wrong)` 都是**首个匹配**：若插入文本中错词出现两次而用户改的是第二处，历史会改错位置；Undo 同理。settle 一轮多个 diff 时逐个 replace，历史文本最终态依赖顺序。

### 3. 是否值得改 & 最小改法

值得改的理由：settle 按"一轮编辑停顿"批量产出 diff 是常态（用户读完一遍统一改错），双词同窗口不是边角；而 Undo 的产品承诺是"误学即刻可救"，现状下第一个词误学时救济通道为零（只能去词典页手删）。

**推荐最小改法：按 settle 批次聚合 Undo（~15 行）**。`learnCorrection` 不再每词一个 toast，而是 dictation 侧把同一批（同一次 settle 回调风暴，10ms 级）聚合：收集 `[{wrong, right}]`，一个 toast 文案 "Learned N words"（N=1 时保持现文案），Undo 一次撤销整批（循环 filter hotwords + 逐对还原历史）。好处：单槽结构不用动、6s 窗口语义不变、文案只加一条五语 "toast.learnedMany"。备选（不推荐）：toast 队列逐个展示——总时长 6s×N，打扰面大且晚到的 toast 与编辑场景脱节。

`replace` 首匹配问题维持 P3 观察：学词侧改 `replaceAll` 会在错词多次出现时过度修改历史（识别错误多次出现时其实正确），首匹配的错位概率低、影响仅限历史展示，不建议本轮动。

## 三、常规走查（P0=0，回归零发现）

- 【实测】核心链路：两次口述均逐字精确落字（"I will start dictation now." / "The review of the report is ready."），Parakeet Ready、零回归。
- 【实测】五语言 Home 手机麦入口全部就位且布局无溢出（截图 shots/01,07-10）：
  - en "No good mic on this PC? Use your phone as the microphone →"
  - zh-CN "电脑没有好麦克风？用手机当麦克风 →" / zh-TW "電腦沒有好麥克風？用手機當麥克風 →"
  - ja "PC にマイクがない？スマホをマイクとして使う →" / ko "PC에 마이크가 없나요? 휴대폰을 마이크로 사용 →"
- 【实测】ja Undo 措辞已改：`toast.undo=元に戻す / toast.undone=元に戻しました`（源码核对，动词呼应，上轮 nit 闭环）。
- 【实测】About：SpeakType 0.11.0 (fb5a829)，Releases 链接在；本机 GH API 403 限流下预拨静默失败、页面干净无报错（负例路径符合 #79 设计）。正向横幅（新版本提示）本轮无从触发（当前即最新版），维持【未验证】，留给 v0.12 自然验证。
- 【实测】词典页：本轮学入的 3 个测试词正常显示/计数（3/300），管理 UI 无回归；测毕已清空。
- 【实测】Speech 页：Provider/Status Ready/模型下拉/Model ready 按钮/Recognition language 灰化逻辑（Parakeet 固定 English）均正常；General 页音频区 "Phone as microphone" 文案与开关正常。

## 四、反问式走查新发现

**P3（新）：Home 手机麦链接落点不精准【实测】**。点击 "Use your phone as the microphone →" 跳到 设置→General **顶部**（键盘快捷键区），手机麦开关在页面最底部，用户还要自己滚很久才能找到——引导链路断在最后一步。源码：`goRemoteMic` 只做 `setSettingsJump("general")`（App.tsx:182-185），无锚点。修复 ~8 行：jumpTab 支持 `general#remote-mic`，General 页挂 ref + `scrollIntoView`，可顺带高亮开关一秒。

其余反问未发现新问题：6s Undo 窗口维持合理；失焦即结算的产品方向本身是对的（本轮 P2 是实现层竞态，不是方向错）。

## 五、分级汇总与下轮候选

| 级别 | 问题 | 修复建议 |
|---|---|---|
| P0 | 无 | — |
| P1 | 无 | — |
| P2 | UIA 失焦结算用中途快照，垃圾词入库+真实学习丢失（#89 扩大暴露面） | PS 缓存锚点元素，BLUR 前重读一次并先发文本行（可行性已双路径实证，~10 行） |
| P3 | 单槽 toastAction：同窗口双词学习首词 Undo 无救济 | settle 批次聚合为一个 toast + Undo 撤整批（~15 行 + 1 条五语文案） |
| P3 | Home 手机麦链接落在 General 顶部，开关在底部 | jumpTab 锚点 + scrollIntoView（~8 行） |
| P3 | 历史 replace 首匹配可能错位（学习与 Undo 两侧） | 维持观察，不建议本轮动 |

**下轮候选排序**：
1. P2 失焦重读修复（含回归用例：改词后 <700ms 切走焦点应学到完整词——本轮复现脚本可直接入回归清单）。
2. P3 批量 Undo + P3 手机麦锚点（可同一杂项 PR）。
3. v0.12 发布时顺带真机验证 About/Home 更新横幅正向链路（v0.11 周期内无从触发的最后一块【未验证】）。

## 测毕清场

词典已清空（hotwords=[]）、模型 parakeet-tdt-0.6b-v3、语言 en/en、remoteMic=False；SpeakType/notepad/cmd 进程已全部退出；防火墙保持 OFF、无网络阻断、无 ACL/mock 残留。未修改任何产品代码。
