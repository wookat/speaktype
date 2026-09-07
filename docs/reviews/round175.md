# SpeakType 第 175 轮严格体验报告

- 日期：2026-08-17
- 基线：main `e64172f`（同第 174 轮，无新提交）；按指示复用第 174 轮打包产物 `release/win-unpacked/SpeakType.exe`（v0.15.1，Electron 43.3.0），未重新 npm ci【实测】
- 运行方式：打包版 + `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`（16 kHz 单声道 TTS 固定语料），目标窗口为系统记事本【实测】
- F8 改写链路使用本地 mock OpenAI 兼容端点：Node http 服务监听 `127.0.0.1:18175`，`POST /v1/chat/completions` 返回固定改写文案并落盘请求日志【实测】
- 证据分级：【实测】打包版真实运行验证；【源码】仅读代码；【推测】未直接验证的推断；【未验证】本轮未覆盖

## 结论速览

| 级别 | 数量 |
| ---- | ---- |
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 2 |

F8 改写全链路（选中→按住 F8 说指令→替换选区）打通，mock 请求 payload、选区替换、焦点保持全部符合预期；缺配置/缺选中两条提示路径可操作。字幕悬浮条长文本、快速连续听写、不抢焦点全过。立案 2 个 P3：录音中 Esc 无法取消（且与 Ctrl 系按住键组合会触发系统 Ctrl+Esc 弹出开始菜单）；F8 改写失败文案不区分网络错误与模型空结果（与 #263 对测试连接的处理不一致）。

## 1. 专项 1：F8 改写链路（mock OpenAI 兼容端点全链路）

### 1.1 成功路径【实测】通过

复现步骤：
1. 启动 mock：`node mock175.mjs`（监听 `127.0.0.1:18175`，固定返回「【MOCK改写】方案已确认，明天上午之前答复老板。」，请求写入 mock175.log）。
2. 设置 → AI 润色：启用，Base URL `http://127.0.0.1:18175/v1`，模型 `mock-model`，密钥留空。页面「测试连接」显示「连接成功: mock-model」（截图 ss_780cf26d）——本地兼容端点允许空 key，校验合理。
3. 记事本输入并全选「这个方案还有几个问题需要讨论，暂时不能确认。」（截图 ss_c9fd8598）。
4. 按住 F8，通过假麦克风播放指令语料「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复。」，录音悬浮条与实时字幕正常出现（截图 f8rw1-mid）。
5. 松开 F8 → 悬浮条进入「转写中…」→ 选区被整体替换为 mock 返回文案，记事本内容变为「【MOCK改写】方案已确认，明天上午之前答复老板。」，焦点始终在记事本（截图 f8rw1-after）。

mock 侧请求核实【实测】：mock175.log 收到 1 条 `POST /v1/chat/completions`，`model=mock-model`、`temperature=0.3`，prompt 同时包含口述指令（ASR 转写结果）与原文选区，格式与 `polish.ts rewriteSelection` 的模板一致；改写模式不叠加 app 人设（`dictation.ts` start 中 `rewriteTarget` 时 `appPersonaId=null`）【源码】。

### 1.2 缺配置路径【实测】通过

- 未配置润色模型（`polishBaseUrl` 为空）时按 F8：不进入录音，应用自动打开 设置 → AI 润色 页（截图 ss_5e34397e），配合 toast「改写需要润色模型 / 去 设置 → AI 润色 配置一个 OpenAI 兼容模型」（文案见 zh-CN.ts toast.rewriteNoModel，toast 展示为【实测】观察到跳转、文案核对为【源码】）。
- 已配置模型但未选中文字时按 F8：不进入录音，toast「没有选中文字 / 先选中要改写的文字，再按住改写键说指令」（截图 f8_nosel）【实测】。

两条路径都把用户直接引到下一步操作，符合可操作提示标准。

### 1.3 错误路径【实测】——立案 P3-2

复现步骤：停掉 mock 进程（模拟端点不可达）→ 选中文字 → 按住 F8 说指令 → 松开。结果：toast「改写失败 / 润色模型没有返回结果，原文未改动」，选区文字保持原样未被破坏（截图 f8rw2-after）。

原文不被破坏、失败有提示，这两点正确。但立案：

**P3-2：F8 改写失败文案不区分失败原因**
- 现象【实测】：端点完全不可达（ECONNREFUSED）时提示「润色模型没有返回结果」，与「模型返回了空内容」同文案；用户无法区分是网络/URL 配错还是模型问题。
- 根因【源码】：`polish.ts rewriteSelection` 对 `!res.ok`、网络异常、空 content 一律返回 `null`，`dictation.ts` 只剩一个 `toast.rewriteFailed` 出口。
- 对照：第 172 轮 P3 已在「测试连接」上修复为可行动网络错误文案（#263 `humanTestError`），但真实改写链路未复用同样的映射，体验不一致。
- 建议：复用/移植 #263 的错误分类到 rewrite/polish 失败 toast，至少区分「无法连接服务器——检查 Base URL 与网络」与「模型没有返回结果」两类。
- 竞品对照：Wispr Flow 的 AI 编辑失败会提示网络/服务原因并建议重试；本地优先的 Handy 对后端错误也透传原因。

## 2. 专项 2：字幕悬浮条边界

### 2.1 长文本溢出【实测】通过

按住 RightCtrl 25s/40s 连续听写（语料循环，最终 3 句 84 字落入记事本）。实时字幕区最大约 3 行高（`panel.tsx` captionLines*CAPTION_LINE_PX，超出内部滚动、隐藏滚动条【源码】），长文本自动换行、旧行上滚，无横向溢出、无窗口撑破、无文字截断（截图 rclong2-mid2、rclong2-mid3、rclong2-after）。

### 2.2 快速连续听写【实测】通过

两次短按（约 5s + 5s，间隔 <1s）连续听写：第一段松开后进入转写、第二段立即开录，字幕不串段、不残留上一段内容，两段结果按顺序完整落入记事本，无丢段（截图 rc2x-rel1、rc2x-mid2、rc2x-after）。

### 2.3 Escape 中途取消——立案 P3-1

**P3-1：录音中没有键盘取消手段；Esc 与 Ctrl 系按住键组合还会误触系统开始菜单**
- 现象【实测】：录音中（按住 RightCtrl）按 Esc，录音不取消；由于 RightCtrl 处于按下状态，Esc 被系统识别为 Ctrl+Esc，直接弹出 Windows 开始菜单/搜索框抢走焦点（截图 rcesc-postesc），若继续说话结果可能落入搜索框。
- 根因【源码】：`hotkey.ts` 仅在快捷键捕获模式处理 `UiohookKey.Escape`（251 行），主流程无「录音中 Esc=取消」逻辑；取消仅有悬浮条 × 按钮一条路径（`panel.tsx` → `record:cancel`）。
- × 按钮本身工作正常【实测】：录音中用鼠标点悬浮条 ×，悬浮条立刻消失、录音取消、松键后记事本无任何落字（截图 rcx-postclick、rcx-after），且点击不抢走记事本焦点。
- 复现步骤：记事本聚焦 → 按住 RightCtrl 开始录音 → 录音中按 Esc → 观察开始菜单弹出、录音未取消。
- 建议：录音期间注册 Esc 为取消键（uiohook 已全局监听，增量小）；对 Ctrl 系按住键需在按住期间吞掉 Esc 或改用「双击按住键取消」等方案。竞品对照：CapsWriter、Wispr Flow、Handy 均支持 Esc 一键取消当前录音。
- 定级说明：存在 × 按钮兜底、不丢用户数据，故定 P3（体验/设计缺口）而非 P2。

### 2.4 悬浮条不抢焦点【实测】通过

- 录音全程记事本保持前台焦点（悬浮条 `showInactive` 展示【源码】），实时字幕出现/滚动不改变焦点（截图 ss_eabd5014）。
- 松键后落字直接进记事本光标处；F8 改写替换也保持记事本焦点（截图 f8rw1-after）。
- 点击悬浮条 × 不激活悬浮条窗口、不夺走记事本焦点（截图 rcx-postclick）。

## 3. 核心回归（必做）

- 中文【实测】通过：识别语言=中文，记事本聚焦，按住 RightCtrl 40s → 实时字幕逐字出现 → 松开后 3 句共 84 字完整落入记事本（截图 rclong2-after）；短句连发同样全落（rc2x-after）。
- 英文【实测】通过：切换识别语言=English、换英文语料重启打包版 → 实时字幕「Please schedule the design review for tomorrow morning.」（截图 rcen-mid1）→ 松开后「Please schedule the design review for tomorrow morning and send the report to the whole team.」落入记事本（Ln 1, Col 94，截图 rcen-after），首字母大写、句号正常。

## 4. 设计评价与竞品对照

- F8「按住说指令改写选区」的交互与 Wispr Flow 的 AI edit（选中+热键+口述）同构，且失败时保留原文的策略正确；prompt 明确「只输出正文、保留换行与列表」，mock 验证请求结构干净【实测】。
- 改写模式绕过 app 人设（避免双重风格干扰）是合理取舍【源码】；但改写与润色共用一套 Base URL/模型配置，想「润色用本地小模型、改写用云端大模型」的用户无法分开——【推测】进阶用户会有此诉求，可作低优先级配置项。
- 字幕悬浮条 3 行滚动上限优于 CapsWriter 的单行滚动字幕（长句可读性更好），隐藏滚动条视觉干净；不抢焦点实现（showInactive）与 Wispr Flow 一致。
- 取消路径是本轮最大设计缺口（P3-1）：口述场景用户双手在键盘上，被迫用鼠标点 × 取消打断心流；三个竞品均为 Esc 取消，建议对齐。

## 5. 本轮未覆盖

- 真实云端 LLM 的改写质量（本轮仅 mock 验证协议与链路；模型输出质量属模型级，不立案）【未验证】。
- 改写超长选区（>数千字）与 30s 超时路径（`CHAT_TIMEOUT_MS`）【未验证】。
- 多显示器下悬浮条位置边界【未验证】。
- 录音中拔麦/切换音频设备的悬浮条表现【未验证】。

## 6. 清场记录

- SpeakType 全部进程结束（0 残留）；记事本关闭；mock 端点进程已停、18175 端口无监听。
- `speaktype.json` 还原：language=zh、uiLanguage=zh-CN、asrProvider=local、polishBaseUrl/polishModel/polishApiKey 清空、appPersonas 清空。
- models 目录无 `.part`/`.part.json` 残留；HKCU Run 无 SpeakType 值；Windows 防火墙三档保持 OFF。
- `git status` 干净（本报告在独立分支 review/round175-report，未动 main，不开 PR）。
