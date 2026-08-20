# SpeakType 第 210 轮严格体验官报告

- 日期：2026-08-20
- 被测版本：main `955b4b3`（含 PR #301：localModel 导入白名单 + 词典/导入文案 5 语言修正 + ja 备份按钮 nowrap），本机 `npm run build` + `npx electron-builder --dir` 打包 win-unpacked（v0.15.1, packaged=true）实测
- 方法：fake-mic WAV + CDP(9333) 读运行时状态 + PerformanceObserver longtask 采样 + GUI 实操截图。结论标注【实测确认】/【推测】/【未测试】。

## 一、PR #301 回归（4/4 通过）

1. **非法 localModel 导入被跳过且计数** —— 通过【实测确认】。导入含 `localModel:"ggml-evil-nonexistent.bin"` + 1 个未知键 + `theme:"dark"` 的配置文件：横幅显示 "Config imported and applied (2 field(s) skipped: unknown, wrong type, or not portable)"，CDP 复查 `localModel` 保持本机原值 `tiny-q5_1`，theme 正常生效。第 208 轮 P3-2082 静默死态入口关闭。
2. **词典拒收新文案** —— 通过【实测确认】。粘贴 `=== / *** / Round210` 保存：仅 Round210 入库，提示 "2 line(s) were not added (over the 300-hotword limit, longer than 20 characters, or symbols only)."，新增 "symbols only" 原因与实际一致。
3. **ja 备份按钮单行** —— 通过【实测确认】。ja 界面「エクスポート…」「インポート…」均单行显示（第 208 轮曾折行）。
4. **RightCtrl 核心落字** —— 通过【实测确认】。whisper tiny 听写 "The meeting is scheduled for 330pm tomorrow afternoon." 正确落入 Notepad 光标处并入历史。

## 二、专项 a：历史页大数据（5000 条注入）

- 直接向 `history.json` 注入 5000 条（约 1MB）后启动：History 页首屏即时渲染（分页 50 条/页），无长任务【实测确认】。
- 搜索 "kubernetes"（命中 417 条）与 "number 4999"（命中 1 条）逐键过滤即时响应，PerformanceObserver 全程 0 个 >50ms 长任务【实测确认】。
- 连点 "Show more" 99 次全量展开 5000 条（DOM 按钮 2 万+），仅出现 1 个 73ms 长任务，滚动/搜索仍流畅；渲染进程 JS 堆仅 14MB【实测确认】。
- 设计边界：`addHistory` 上限 500 条，注入的 5000 条在下一次听写后被截为 500——真实用户不可能超过 500 条，5000 条属注入极端态，表现依然稳健。日期分组（Today/历史日期）在跨 3 天多的数据下分组正确【实测确认】。
- 结论：无立案。分页 + 上限 500 的设计使大数据场景无性能风险。

## 三、专项 b：免按长会话（22 分钟）

- Alt+Q 进入 hands-free（关闭静音自动退出），fake-mic 循环语音连续听写 06:21–06:43（22 分钟）：共 181 段、1387 词全部自动落入 Notepad（光标推进至 Col 8945），无一次中断/漏落/重复卡死【实测确认】。
- 内存采样（全进程 WorkingSet 合计）：起点 417MB → +6min 297MB → +12min 301MB → +17min 315MB → +22min 311MB——无泄漏趋势，反而回落平稳【实测确认】。
- 停止（再次 Alt+Q）立即生效；历史/统计（sessions 21→181+）计数一致【实测确认】。
- 30 分钟以上/整日级会话未测【未测试】；据 22 分钟曲线推断更长会话内存亦稳定【推测】。
- 结论：无立案。

## 四、ja「設定をリセット」按钮折行核实

- ja 设置页リセット区「設定をリセット」按钮实测仍折行两行（"設定をリセッ/ト"），截图存证；同区「全データを消去」单行正常。#301 只修了备份区两个按钮，リセット按钮未套用 nowrap【实测确认】。
- 立案 **P3-2101**：ja リセット按钮补 `whitespace-nowrap`（与 #301 同法，一行改动）。

## 五、立案汇总

| 编号 | 级别 | 问题 | 状态 |
|---|---|---|---|
| P3-2101 | P3 | ja「設定をリセット」按钮折行两行，リセット区未套用 #301 的 nowrap 修法 | 【实测确认】 |

本轮无 P0-P2。第 208 轮 Top3 中 P3-2081/2082 经 #301 修复后回归全部通过、正式关闭。

## 六、下轮 Top3 建议

1. P3-2101 ja リセット按钮 nowrap 一行修（可顺带全局排查其余按钮多语言折行）。
2. 未深挖区域：文件转录（Transcribe）大文件/长音频链路实测（取消、进度、错误恢复）。
3. 未深挖区域：Doubao/ChatGPT 云端 provider 的登录态过期与网络异常降级体验（需真实账号，可用 mock 先测异常分支）。

清场：测试注入的 5000 条历史已还原为原 21 条备份、词典/设置恢复默认、临时文件不入库。无产品代码改动；未合并任何 PR。
