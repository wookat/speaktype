# 第 248 轮严格体验官报告

- 基线：main @ `f33d33e`（含 #346 gc 修复、#347 缺模型横幅语言 chip、#348 技能沉淀）
- 打包：`npm run typecheck` / `npm run build` / `electron-builder --win --x64 --dir` 全绿（Node 20.19.0，EBADENGINE 警告不阻塞）
- 方法：全新数据目录 onboarding 实测 + 深浅色视觉走查 + 常规回归，全程录屏，证据均为第一手
- 录屏：`C:\Users\Administrator\screencasts\rec-98cb923c-0449-4df4-b9e1-bf1a27140e8a\rec-98cb923c-0449-4df4-b9e1-bf1a27140e8a-edited.mp4`
- 截图目录：`C:\Users\Administrator\screenshots\`

## 一、#347 回归复核（全新 userData）— 通过

| 检查项 | 结果 | 证据 |
|---|---|---|
| 缺模型横幅出现两个语言 chip（SenseVoice 234MB / Parakeet 660MB），en-US 默认选中 Parakeet | ✅ | ss_36fcad78.png / ss_zoom_efc934e9.png |
| 点 SenseVoice chip：高亮互换 + 横幅尺寸 660MB→234MB | ✅ | ss_52c4503e.png / ss_zoom_aa606601.png |
| 一键下载确为 sensevoice-small（log `local model sensevoice-small downloaded`，模型目录仅 sensevoice-small） | ✅ | ss_04079a96.png / ss_494298eb.png / ss_e78f5ff8.png |
| 下载完成后 RightCtrl 首次中文落字 Notepad | ✅ | ss_a2280751.png |

**Onboarding 步数：5 步**（①启动 ②点 SenseVoice chip ③点一键下载（~90s）④聚焦目标窗口 ⑤按住 RightCtrl 说话→松手落字）。对比第 247 轮中文用户实测 12 步（660MB 误下载 + 切模型 + P1 崩坏重启），改善显著。

**是否还需要首启语言选择页？——建议不做。** 理由：① chip 默认值已按系统 locale 推荐（#348），中文系统默认即 SenseVoice，多数用户 0 额外决策；② 独立首启页增加一步且要维护跳过/重入逻辑，对照 Handy（默认小模型直接可用）的方向是减页面而非加页面；③ 更划算的微优化是在 chip 组上方加一行"按你的输入语言选择"引导文案（i18n 一行），成本≈0。

## 二、chip 深色对比度视觉判定 — 不立案

深色下未选中 chip 实际渲染为深底 + indigo 文字，不存在 class 字面上的 `bg-white` 白色刺眼块——`global.css` 的 `.dark` 作用域把 `--color-white` 重映射为 `#1c1f2a`（整站 CSS 变量反转，无需逐个 dark: 类），故实测可读、与周边协调，仅文字对比略偏暗。证据：深色 ss_81941c32.png / ss_zoom_a3001d94.png，浅色对照 ss_36fcad78.png。**结论：不立案**；视觉判定需以实测截图为准而非 class 字面推断（已建议沉淀入测试技能）。

## 三、挂账项评估

### P3-2473（原生 select 深色弹层）— 建议关闭为「已缓解」，改法不值得做
- 现状变化：本轮深色下 Settings 原生 select 弹层**已呈深色样式**（深底白字蓝高亮，ss_9ba847b9.png），与 247 轮浅色弹层（ss_33b2bba7.png）不同。机制上 `.dark` 作用域已声明 `color-scheme: dark`（global.css:16），Chromium 据此渲染深色原生弹层；247 轮的浅色弹层疑为系统主题广播时机差异，属偶发。
- 自绘下拉成本/收益：全仓共 **18 处 `<select>` 分布在 6 个文件**（GeneralTab 8、VoiceTab 5、MicSection 2、ModelTab/Personas/History 各 1），自绘组件需处理键盘导航、无障碍、滚动定位，成本约一个整轮；收益仅消除一个偶发的浅色弹层。**结论：不做自绘，关闭挂账，若再复现浅色弹层再查 color-scheme 生效时机。**

### P3-2474（无 LLM 时人设无感）— 建议两步走：先 UI 明示（本轮可做），本地格式化维度值得立项（下轮论证原型）
- 事实基础（247 轮源码实证）：人设仅作为 `polishText` 的 prompt 风格注入（polish.ts `4. 风格要求：${persona.prompt}`），无 LLM 时对落字文本零影响，仅历史标签。
- 短期（成本≈0.5 轮）：未配置 LLM 时在人设选择区/横幅明示「人设润色需配置 AI 服务」+ 深链到设置，消除"选了没反应"的困惑。
- 中期（值得做）：**本地格式化维度**——自动空行分段（按停顿/句号阈值）、口述列表转 markdown 列表、邮件模板骨架等纯本地规则，不依赖 LLM。差异化依据：Handy 完全没有格式化维度；Wispr Flow 的 tone 全靠云端。本地格式化 = 离线卖点（SpeakType 现有定位）+ 人设可感知，是竞品对照下性价比最高的差异化落点。建议下轮先做「自动分段」单维度原型验证，不要一次铺开。

## 四、常规回归 — 全绿

| 项 | 结果 | 证据 |
|---|---|---|
| RightCtrl 核心链路落字 | ✅ | ss_a2280751.png |
| Alt+Q 免按连续 17 段句头全部完整，退出即停（#346 gc 修复保持，log 0 worker error） | ✅ | r248b_hf.txt / ss_c58a1e16.png |
| F8 mock 改写（Connected: mock，选区替换含口述指令） | ✅ | ss_47d7001e.png / ss_6953ae9b.png |
| 历史/词典/设置 深浅色走查无新问题 | ✅ | 浅 ss_ce71e999/ss_19ee9394/ss_e78f5ff8；深 ss_924cd11c/ss_d96a4505/ss_9ba847b9 |
| main.log 全程 0 error/SyntaxError | ✅ | fresh userData 日志全量 grep 为空 |

观察项（不立案）：① Alt+Q 存证首循环一次「会议点在二楼」丢中间字"地"（非句头，后续 5 循环正常，属识别波动）；② sensevoice 对「预算是300万元」6/6 段一致输出「预算 is300万元」（中英混读音译变体，见立案 P3-2482）。

## 五、竞品对照：两个高价值差距

1. **语音原生编辑/命令模式**（对照 Aqua Voice voice-native editing、Wispr Flow Command Mode）：SpeakType 现有 F8 改写需先手选文本；竞品支持"把上一句改成礼貌语气"式免选区语音指令。现有 F8 管线（选区→LLM→回填）可扩展为"无选区时默认作用于最近一次落字"，成本低、路径复用度高，是第一优先差距。
2. **上下文热词**（对照 superwhisper/Aqua 的 context awareness）：前台窗口标题/剪贴板关键词 → 会话级临时热词注入 sherpa hotwords，纯本地、直接提升专有名词准确率（可顺带缓解「预算 is300万元」类混读）。词典页已有热词基建，边际成本低，第二优先。

## 六、立案

| 编号 | 级别 | 标题 | 复现/证据 |
|---|---|---|---|
| P3-2481 | P3 | 无 LLM 时人设选择无任何可见反馈（继承 2474）：建议未配置 AI 服务时在人设区明示"需配置 AI 服务"并深链设置 | 复现：不配 LLM→切换人设→录音，落字与历史文本无差异，仅标签变化。证据：round247 ss_507fcb76/ss_23ef51ad + polish.ts prompt 注入源码 |
| P3-2482 | P3 | sensevoice 中英混读稳定音译（「预算是300万元」→「预算 is300万元」，6/6 一致），建议评估热词/数字单位后处理 | 复现：Alt+Q 播放 hf246.wav 任一循环。证据：r248b_hf.txt 全 6 段 |

本轮无新 P0/P1/P2。挂账处置建议：P3-2473 关闭为已缓解；P3-2474 由 P3-2481（短期 UI 明示）+ 本地格式化立项（下轮原型）接管。

## 七、已验证 / 未验证

- 已验证：#347 全链路（fresh userData 5 步落字）、chip 深浅色渲染、#346 修复保持（17 段 0 error）、F8、三页面深浅色、清理还原（userData 还原、主题恢复浅色、进程清零）。
- 未验证：真实麦克风/权限流程（fake-mic 环境）；豆包激活提示；非 en-US locale 下 chip 默认值（#348 记录过 locale 模拟方法，本轮未跑）；本地格式化维度仅为论证，无原型实测。
