# SpeakType 第 46 轮严格审查报告 —— hold glue 15s 启发式边界审查

- 审查对象：main@a9efb44（含 PR #98 hold 句间空格、PR #99 v0.12.0 发布），`npm run pack:dir` 全绿，win-unpacked 打包实测
- 审查方式：【实测】= 打包应用真机验证；【源码】= 代码走查论证；【未验证】= 如实标注
- 审查环境：Windows Server 2022，Parakeet/SenseVoice 本地模型，TTS 真声回放 + Win32 keybd_event 模拟 RightCtrl

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 1 | hold glue 不看前台窗口/焦点变化，切窗口 15s 内口述会在新位置误补前导空格（含换行后顶格场景） |

#98 主路径工作正常：hold 短间隔连续口述正确补句间空格（第 45 轮 P3 闭环，见 §7 回归）。唯一发现是启发式只看时间不看位置，边界场景会误补，建议加前台窗口守卫（详见 P3-①）。

## 1. 边界①：15s 内切换窗口/应用再 hold 口述 → 误补确认（P3-①）

【实测】复现步骤：
1. Notepad 窗口 A 中 hold 口述 "Dictated in window one." → 正常落字
2. 3 秒内 Alt+Tab 切到**全新空白** Notepad 窗口 B
3. hold 口述 "Fresh document begins now."

结果：窗口 B 顶格位置落入 `" Fresh document begins now."`（剪贴板逐字符核对，len=27，首字符为空格）——新文档第一句带前导空格，明确误补。

换行变体【实测】：同窗口内落字后按 Enter 换行、15s 内再口述 → 新行行首落入 `" Second sentence lands"`——换行后顶格位置同样误补（对写代码/列表/表单场景是实际污染）。

危害与频率评估：
- 危害轻：单个多余空格，普通文书几乎不可见；但代码编辑器（缩进敏感）、表单字段（前导空格可能导致校验失败/搜索不中）、行首列表符后是真实污染。
- 频率中：15s 是很长的窗口，「说一句→切到聊天窗口再说一句」「说一句→回车换行再说一句」都是高频真实动作。换行场景甚至无需切窗口，同一编辑器内必然触发。

**最优修法论证**：值得修，且修法现成——`activeapp.ts` 已通过 koffi 封装 `GetForegroundWindow()`（personaForActiveApp 每次起手都在调）。建议：
1. `pasteText` 成功后随 `lastHoldPasteAt` 一并记录当时前台 hwnd（activeApp() 暴露 hwnd 指针，或加一个 `activeHwnd()`）；
2. glue 判定追加「当前前台 hwnd 与上次相同」条件（hwnd 指针直接比较；不能用 app+title 比较——两个 Notepad 标题都是 "Untitled - Notepad" 区分不开）。
约 8-10 行。注意换行场景 hwnd 不变，此修法救不了行首误补——但行首场景需要读控件光标位置（UIA 成本高、跨应用不可靠），不建议做；hwnd 守卫已消掉「切窗口/切应用」这一半，行首半句多余空格接受为启发式固有代价（免按模式同样存在，从未有用户侧反馈）。

## 2. 边界②：15s 内手动打字后 hold

【实测】落字后 15s 内手动键入 ` price:` 再 hold 口述 "Ten dollars exactly." → 落入 `price:$10 exactly.`——本例 ASR+ITN 输出以 `$` 开头，正则 `^[A-Za-z0-9]` 不命中，未补空格，结果恰好正确。

【源码】若口述结果以拉丁字母/数字开头（常见），glue 会补空格：手动打的是完整词（如 "Note"）时 `Note dictated...` 空格合理；手动打的是半个词想让口述接尾（极少见）时会多一个空格。综合评估：**合理，不立案**——补空格在此场景绝大多数时候正是用户想要的。

## 3. 边界③：数字/引号/括号开头

- 数字开头【实测】：口述 "Eleven items remain." → ITN 出 `11 items remain.`，正确补空格：`final. 11 items remain.`——数字开头 glue 命中正则，行为正确。
- 引号/括号/符号开头【源码+实测旁证】：`^[A-Za-z0-9]` 不含标点符号，`"`、`(`、`$` 开头一律不补（上节 `$10` 实测即旁证）。行为保守——`ready."Hello"` 会粘连，但本地 ASR 几乎不输出行首引号（实测多轮从未出现），保守正确，不立案。

## 4. 边界④：CJK 句后紧跟英文句

【实测】SenseVoice + zh：口述「今天下午3点开会，预算是5200元」→ 15s 内口述英文 "Budget approved today." → 落入 `今天下午3点开会，预算是5200元 Budget approved today.`——中英之间补一个空格，符合中英混排排版惯例（GB/T 15834 及主流排版规范推荐中西文之间留空），**行为合理**。

反向（英文句后接 CJK 句）【源码】：CJK 开头不命中正则 → 不补空格 → 直接拼接，符合中文无词间空格惯例，正确。

## 5. 边界⑤：历史重试路径不走 glue —— 确认

【源码】两条重试路径均不触碰 glue：
- 历史页失败条目重试 `retryHistory()`（dictation.ts:479-497）：成功后 `resolveFailedEntry` 原地更新 + `clipboard.writeText(text)` **只写剪贴板，不 pasteText**，自然不 glue，也不刷新 `lastHoldPasteAt`。符合预期。
- 错误态热键重试 `retryLast()`（:440）走 finalize 落字，会参与 glue 判定——但这本来就是「刚才那句失败了马上重说」的续写场景，若上次成功落字在 15s 内补空格语义正确。

## 6. 边界⑥：F8 改写后 15s 内 hold —— 代码路径核对

【源码】（dictation.ts:649/658）：
- 改写这次本身：`holdGlue` 条件含 `!rewriteTarget` → 改写落字**永不带前导空格**（替换选区，正确）；:658 同样有 `!rewriteTarget` 守卫 → 改写**不刷新时间戳**，与任务描述一致。
- 遗留窗口：hold 落字（t0）→ F8 改写（t5）→ 15s 内再 hold（t12）：`lastHoldPasteAt` 仍为 t0，glue 生效。若改写发生在同一编辑位置，续写补空格合理；若用户 F8 是在另一个应用里改写，则与边界①同族误补——**P3-① 的 hwnd 守卫顺带覆盖此场景**，无需单独处理。
- 【未验证】F8 全链路真机（需润色端点）；本轮按任务要求以代码路径核对为准，两处守卫的存在性与逻辑已逐行确认。

## 7. 常规回归 —— 全过

| 项目 | 结果 |
|------|------|
| RightCtrl 英文落字 | 【实测】多句逐字准确，ITN 正常（eleven→11、ten dollars→$10）；主路径 glue：`ready. Fort two items…`、`final. 11 items` 空格正确 |
| RightCtrl 中文落字 | 【实测】「今天下午3点开会，预算是5200元」逐字准确含 ITN（三点→3点、五千二百→5200） |
| 超 15s 不 glue | 【实测】两次间隔 >15s 的连续落字均未补空格（`cloudy.This is…`），窗口过期逻辑正确 |
| Alt+Q 免按 | 【实测】进入→两句连落且句间补空格（handsFreeTyped 路径）→ Alt+Q 退出，全对 |
| 字幕 | 【实测】口述中 partial 字幕实时滚动显示，句毕收敛，无堆积（实拍截图） |
| 自动学词 | 【实测】sunny→cloudy 手改后 toast「New word learned "cloudy" added to dictionary」带 Undo 按钮弹出，日志 `auto-learn: "sunny" -> "cloudy"` |

## 8. 下一轮候选（按优先级）

1. **P3-① hwnd 守卫落地回归**：pasteText 记录前台 hwnd，glue 追加同窗判定（~10 行，顺带覆盖 F8 后跨应用场景）。
2. **云端成功路径补测**（继续等 key）：任一有余额的 OpenAI 兼容 chat key + Groq whisper key 即可闭环。
3. **v0.12.0 发布链路抽查**：官网下载链接/About 预拨已随 #99 更新，可做一轮 0.11→0.12 覆盖安装升级验证（对照第 41 轮清单）。

## 9. 清场记录

- speaktype.json / history.json 已从测前备份还原（含清除测试期学入的 hotwords）
- SpeakType / Notepad 进程全部结束，采样与模拟脚本停止
- 无 .part 残留；防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
