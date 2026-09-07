# 第 7 轮全方位审查报告（main @2fa42e8，pack:dir 自打包实测，Windows Server 2022）

审查人：验收/调研会话 · 2026-08-14
实测方式：本地 `npm install && npm run pack:dir`（win-unpacked，v0.9.3，packaged=true），mock OpenAI 兼容服务 + VB-Cable + TTS 实录。

## 一、结论摘要

| 项 | 结果 |
|---|---|
| PR #47 免按被其他热键退出提示 | ✅ 通过 |
| PR #48 App.tsx 纯搬迁拆分 | ✅ 结构清晰，无行为回归 |
| PR #49 增强标点（下载/中文/英文/回退） | ✅ 单独开启全通过 |
| PR #50 英文双句号去重 | ✅ 通过 |
| **增强标点 + Silero VAD 同时开启** | ❌ **P0：首次识别整个进程静默退出** |
| 主链路（RightCtrl / Alt+Q / VAD 自停 / 落字） | ✅ 通过 |

## 二、P0：增强标点与 Silero VAD 增强包互斥——同开必崩

**现象**：两个开关都打开时，任意一次识别 finalize 后（`punct worker started` 日志出现的瞬间）**整个应用进程无声退出**（无错误框、无 warn 日志、历史不落条目）。2/2 复现，每次重启后再识别仍复现——用户一旦两个都开，应用等于永久不可用。

**复现步骤**：
1. 设置 → 开启「增强人声检测（Silero VAD）」（增强包已在 `%APPDATA%\SpeakType\vad`）；
2. 设置 → 语音识别 → 开启「增强标点」并完成模型下载；
3. AI 润色保持关闭，任意通道说一句话；
4. 松手/自停后 App 进程消失（`Get-Process SpeakType` = 0）。

**根因（控制台捕获）**：
```
The requested API version [27] is not available, only API versions [1, 20] are supported in this build. Current ORT Version is: 1.20.1
```
- vad 增强包自带 `onnxruntime.dll`（1.20.1，配套 `onnxruntime_binding.node`）；
- `sherpa-onnx-node`（punct worker）自带**同名** `onnxruntime.dll`（新版，需 ORT C API 27）；
- Windows 按模块名只加载一次同名 DLL：Silero 先用旧版 1.20.1，punct worker 的 sherpa 绑定随后绑到已加载的旧 DLL → 原生层 abort，整个进程带崩（worker 崩溃是 native abort，`w.on("error")` 兜不住）。
- 关闭 Silero VAD 后增强标点完全正常（已实测），反向亦然——**互斥条件即两套 ORT 同进程**。

**修复建议（按优先级）**：
1. **推荐：删掉自维护 vad 增强包，Silero 改用 sherpa-onnx-node 内建 VAD**（`sherpa_onnx.Vad` 原生支持 silero_vad.onnx，模型仅 ~2MB）。收益：全进程只剩一套 ORT；vad 下载包从 35MB 缩到 2MB；顺带解决 vad 包下载源 404 的历史遗留（sherpa 运行库已随安装包）。
2. 若保留双包：vad 包升级到与 sherpa 相同的 ORT 版本，且两者绝不能同名冲突（改用 sherpa 的 dll 目录统一加载）。
3. 无论怎么修，都建议给 punct worker 加崩溃隔离（child process 而非 worker_threads，native abort 不带崩主进程）+ 「两开关同开」回归用例。

## 三、逐项实测记录

### PR #47 免按被其他热键退出
- Alt+Q 进免按 → 静音 3s → 按住 RightCtrl 2s：toast 显示「免按模式已退出 按了其他热键，连续听写已停止；再按免按热键可重新开始」，**未被「没听清」覆盖** ✅。
- ⚠️ P2：**Alt+Q 手动再按一次退出**免按且本轮无内容时，仍弹「没听清 这次没识别到内容」——用户主动退出是明确意图，这个提示是噪音且有轻微指责感。建议手动退出（同热键 toggle-off）也走「已退出」提示或静默。

### PR #49 增强标点
- 开关在 设置→语音识别，默认关，hint「开启 AI 润色时不生效」清晰 ✅；
- 真实下载路径通了（HF 直连，294MB 约 40s 下载完，就绪文案「增强包已就绪，标点已升级」）✅——这是第一个真实走通按需下载的增强包（vad 包 404 遗留仍在）；
- 中文无标点长句 → 「今天下午三点，我们开个会讨论新版本的发布计划，然后再安排下周的测试任务。大家记得准时参加」，逗号/句号位置合理，句尾句号按中文习惯保留策略正确 ✅；
- 英文 → 「Hello, everyone. This is a test of the enhanced punctuation model tonight.」半角+句首大写 ✅；
- 未下载/失败回退：代码路径 `punctuate()` 返回 null → `addLocalPunctuation` 规则断句（`workerFailed` 只报一次），与既往轮次规则断句行为一致 ✅（本轮未单独重测未下载态）。

### PR #50 双句号
- mock 返回句尾已带 `.` 的英文，模型再补后输出仍只有一个句号 ✅（`([.?!])[.?!]+ → $1`）。

### 主链路回归
- RightCtrl 长按松手 → 光标处落字 ✅；Alt+Q 免按 + 2s 静音自停 ✅；纯静音 noSpeech 不上传 ✅；
- 历史条目操作按钮（复制/纠错/删除）**已常显**，上轮「hover-only 在无 hover 指针设备上不可见」的 P2 已闭环 ✅。

## 四、架构（App.tsx 拆分后）

拆分本身干净：`pages/`（Home/History/Personas/Dictionary/settings/*）+ `components/` + `lib/format`，App.tsx 收敛到 186 行路由/状态壳。进一步优化点（按价值排序，均非本轮必做）：

1. **三套按需下载管理器雷同**（`localasr.ts` 模型、`vad.ts` 增强包、`punct.ts` 标点模型）：状态机（downloading/progress/error）、`.part` 改名、双源重试各写一遍。抽 `download-manager.ts` 后，新增强包（如 Parakeet、ITN 模型）零成本接入。
2. **`VadStatus` 类型被 punct 复用**：punct 状态字段名仍叫 VadStatus，语义误导（本轮就差点看混），建议改名 `AddonStatus` 共用。
3. `dictation.ts` 593 行身兼录音状态机 + 通道选择 + 重试上下文 + 历史写入，是下一个该拆的文件（建议 finalize 管线独立成 `pipeline.ts`）。
4. `GeneralTab.tsx` 360 行/`VoiceTab.tsx` 253 行偏大，但可接受，不建议为拆而拆。

## 五、性能（增强标点 worker）

| 指标 | 实测 |
|---|---|
| 模型加载（worker 冷启动） | ~1s（finalize 08:47:59.141 → 条目即时可见，落字无感知延迟） |
| 单句推理 | 毫秒级（含 mock 往返整链 <1s） |
| 内存 | 主进程 WS 从 ~110MB → **476MB**（worker 常驻 +~370MB，与代码注释 ~360MB 相符） |
| 释放 | 10min 空闲自动 terminate（代码确认），设计合理 |

370MB 常驻对 16GB 机器可接受，但建议在设置里像 whisper 一样注明内存占用，并考虑「节能模式」共用同一空闲策略开关。

## 六、竞品对照（缺口按用户价值排序）

| 竞品 | 我们还缺的高价值点 |
|---|---|
| CapsWriter-Offline | **数字/ITN 规范化**（中文口述数字→阿拉伯数字、日期、金额、电话；其用户口碑第一功能）；关键词日记/快捷指令 |
| Wispr Flow | **双击热键进免按**（flow bar 双击 Fn，免按入口比 Alt+Q 更顺手）；按应用自动切人设（在 Slack 口语化、在邮件正式）；whisper 词典云同步 |
| Handy（开源） | Parakeet-tdt-0.6b-v3 作英文本地引擎（速度/准确率优于 whisper base，Apache-2.0）；完全离线卖点营销 |
| 智谱输入法 | 全局悬浮球入口；语音指令（"删掉上一句"）；方言识别 |

## 七、专项建议（1-2 个值得做，按用户价值排序）

1. **数字/ITN 规范化（强烈推荐，P1 级价值）**：中文语音输入「三点半开会花了两千五」落字成「3:30 开会花了 2500」是每天高频痛点，CapsWriter 靠它建立口碑。实现路径低风险：规则版 ITN（cn2an/WeTextProcessing 的 tagger 规则子集，纯 TS 可移植核心场景：整数/小数/日期/时间/金额/百分比/电话）挂在 localCleanup 之后、标点之前；设置加开关（默认开，中文通道生效）。工作量约 1 个 PR + 词典级测试用例，不需要模型。
2. **双击热键进免按（推荐，交互成本最低的增长点）**：双击 RightCtrl（300ms 内两次按下）= 进免按，再按一次退出；与现有长按/Alt+Q 不冲突，hotkey.ts 状态机加一个双击检测即可。免按模式的发现性和进入成本立刻降一半（Wispr Flow 同款交互，用户迁移零学习）。

（Parakeet v3 与暗色模式价值也真实，但前者只惠及英文用户、后者纯观感，排在上面两项之后。）

## 八、遗留清单

- **P0（本轮新发现）**：Silero VAD + 增强标点同开进程崩溃（见第二节）。
- P1（历史遗留）：vad 增强包下载源 404（仓库私有）——若采纳第二节修复建议 1，此项自动消亡。
- P2（本轮新发现）：Alt+Q 手动退出免按仍弹「没听清」。
- P2（历史）：「跟随系统」非英语 locale 细分映射未实测（需改系统 locale）。
