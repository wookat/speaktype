# SpeakType 第 247 轮严格体验官报告

- 日期：2026-08-29
- 角色：user-experience-officer + QA（第 247 轮，审查轮，不改代码）
- 基线：main @ `003c544`（v0.16.0，含已合并 PR #342/#343/#344）
- 实测形态：打包版 `desktop/release/win-unpacked/SpeakType.exe`（`npm ci` → `typecheck` → `build` → `electron-builder --win --x64 --dir` 全绿）
- 环境：Windows Server 2022，Node v20.19.0，npm 10.8.2；fake mic + rkey.ps1 合成热键；全新 userData（main.log `no legacy userData to migrate`）
- 启动参数：`--no-proxy-server --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav> --remote-debugging-port=9333`
- 全程录屏：`rec-2b1f673f-af5a-48c1-8176-bd1d55f0f862-edited.mp4`

---

## 1. 全量走查结果

| 项目 | 结果 | 证据 |
|---|---|---|
| 核心链路：RightCtrl 按住说话（8s）→ 悬浮条实时字幕 → 松手落字 Notepad | ✅ 通过 | ss_9ff9b032（实时字幕）、ss_cc54f153（落字，语义与语料一致） |
| 静音录音 → "没听清"可见反馈 | ✅ 通过 | ss_2083214d |
| Alt+Q 免按：进入/连续多句/再按退出；PR #342 句头丢字回归 | ✅ 通过，**0/39 丢句头**（hf246.wav 三句循环，37 次 finalize、13 轮×3 句句首完整；退出后停止落字） | 存证 `r247_hf.txt`、ss_4858c1b3 |
| F8 改写全链路（mock-rewrite-server 127.0.0.1:18099） | ✅ 通过：Test connection = Connected，选区替换为 `MOCK-REWRITE:` 含口述指令 | ss_176cb972、ss_61698646 |
| F8 未配润色模型分支 | ✅ 深链直达 设置→AI polish tab 确凿；toast 本体因窗口前置动画未截到（环境注记，非产品问题） | ss_6c202328 |
| 按应用自动切人设（正反例） | ✅ Notepad 前台 → 历史项 `R247测试人设`；SpeakType 自身前台 → `Default`（反例通过，排除硬编码假通过） | ss_507fcb76、ss_23ef51ad |
| 下载管理：whisper tiny-q5_1 下载→Ready→听写落字 | ✅ 通过 | ss_025f2899、ss_9a6eb2c6 |
| **切回 sensevoice 后录音** | ❌ **失败 → P1-2471（见下）** | ss_7ef225b6、ss_84c53e4b |
| PR #342 导出默认 Documents 回归 | ✅ Save As 默认 Documents、默认名 `speaktype-config-2026-08-29`、类型 JSON、落盘带 `.json` | ss_ade31b2f |
| 五页面（首页/历史/词典/人设/设置）浅色+深色 | ✅ 通过（深色下 native select 弹层浅色 → P3-2473） | 浅 ss_bcf114d9、ss_be5689c8；深 ss_7e2685e1、ss_57cdd913、ss_3e1839f3、ss_33b2bba7 |
| 700×560 窄窗口抽查（History/Personas） | ✅ 按钮单行、无横向滚动 | ss_e98ca945、ss_24111496 |

---

## 2. 专项 A：新用户 onboarding 走查（全新数据目录）

前置：`%APPDATA%\SpeakType` 不存在，main.log 确认 `no legacy userData to migrate`（ss_34e0109e）。

### 从零到第一次成功落字的实际路径

1. 启动 → 英文 UI（系统非中文 locale），左侧导航六页（ss_33552b76）
2. 首页 4 步引导卡（打开→聚焦输入框→按住 RightCtrl→松开落字），文案清晰
3. 缺模型引导卡：明示需一次性下载约 660MB（默认 parakeet，英文模型），带下载按钮（ss_34e0109e）
4. 等待下载（实时百分比 ss_ab759806；总耗时未精确计时，估算数分钟）
5. 下载完成，卡片消失（ss_88d89fde）
6. 聚焦 Notepad
7. 按住 RightCtrl 说话 → 松开
8. **首次落字：中文语音在默认 parakeet 下输出乱码/英文音译，中文用户不可用**（当时以文字记录，无专属截图，如实标注）
9. （中文用户必经）设置→Speech：切 Local model = sensevoice-small、语言=中文（ss_fdd9f24c 等）
10. 二次下载 sensevoice 并等待
11. 再次录音 → **命中 P1-2471（切模型 gc 崩坏），Retry 永不成功、无重启提示，新用户在此彻底卡死**（ss_5ca4c54f）
12. 重启应用（唯一恢复手段）→ 第一次成功中文落字（ss_9ff9b032 / ss_cc54f153）

**结论**：英文用户 8 步可首次落字；**中文用户实际 12 步（含被 P1 逼出的 1 次重启）**，修复 P1 后预期 10 步。对照 Wispr Flow「装完即说」（云端免下载）与 Handy「小模型默认」的开箱口碑，SpeakType 的差距集中在「默认模型不匹配中文用户 + 两次大下载」。

### 摩擦点清单（按伤害排序）

1. **P1-2471 直接击穿 onboarding**：按引导切模型后立即崩坏，错误文案 `Identifier 'gc' has already been declared` 对普通用户不可理解且无自助恢复提示。
2. **默认模型不匹配中文用户（P2-2472）**：默认英文 parakeet 660MB，中文首落字乱码；需自行发现设置页并二次下载。建议按系统语言推荐默认模型（zh locale → sensevoice-small），或首启加一步「主要语言」选择。
3. UI 英文起步：非中文 locale 全英文首屏，中文目标用户无中文引导。
4. 660MB 等待期无过渡引导（下载时可先看什么/设置什么）。
5. 模型内部名（parakeet/sensevoice-small/whisper tiny-q5_1）直接暴露，无「推荐/中文最佳」标注。
6. 正向点：4 步引导卡、实时下载百分比、静音可见反馈，均达标。

未观察项（如实标注）：豆包激活提示在 onboarding 中是否出现未专门核对；真实麦克风权限流程未覆盖（fake-mic flags 绕过）；下载与全程耗时为估算。

---

## 3. 专项 B：差异化能力现状与下一步（对照 docs/research/competitor-promo-202608.md）

### 现状（源码 + 实测一手核对）

- **按应用自动切人设**：已实现且本轮实测正反例均通过。规则在录音起手时按前台进程名/窗口标题匹配（`activeapp.ts personaForActiveApp`，`dictation.ts` L385 起手采样避免录完窗口已切走），F8 改写有意不走人设（#26 轮已固化）。
- **人设的实际效果边界**：`dictation.ts` L729-846 → `polishText(settings, persona, raw)`；`polish.ts` L444 中人设仅作为 LLM 润色 prompt 的「风格要求」一行注入。**即未配置润色模型（polishBaseUrl/ApiKey）时，人设/按应用切人设对落字文本零影响，只是历史列表上的一个标签**（本轮历史项 personaName 显示即全部证据）。而默认配置恰恰没有 LLM——差异化卖点在默认开箱状态下不可感知（→ P3-2474）。
- **语气/语境适配**：无独立实现，完全等同于「人设 prompt + LLM」。无按 App 记忆语气（Wispr tone per app）、无场景格式模板（superwhisper Modes）、无屏幕上下文热词（Aqua）。

### 最有性价比的下一步（建议，未验证，供立项论证）

1. **人设加「本地格式维度」**（成本低、默认可感知）：为每个人设补充无需 LLM 的规则级格式项（句尾标点开/关、换行分段、列表化、terminal 场景已有 deformat 先例），让「按应用切人设」在零配置下就有可见差异。对应竞品报告 A9-#3 与第 246 轮借鉴点 2。
2. **前台窗口标题→临时热词**（本地 Context Awareness 的最小闭环）：录音起手时已取前台窗口，把窗口标题分词并入当轮热词纠错（纯本地、明示开关），主打「同样的功能、零上传」对打 Wispr 隐私翻车。对应竞品报告 A9-#3。
3. 暂不建议做「按 App 记忆语气」的 LLM 版：在默认无 LLM 的产品形态下感知面太窄，先做 1/2 把默认体验的差异化立住。

---

## 4. 立案汇总（P?-247x）

| 编号 | 级别 | 描述 | 复现步骤 | 证据 |
|---|---|---|---|---|
| P1-2471 | **P1** | 会话内切换本地 sherpa 模型后 worker 永久崩坏，Retry 永不恢复，必须重启应用。根因已定位：`desktop/src/main/localasr.ts` L199-204 worker eval 先 `setFlagsFromString("--expose-gc")` 再 `const gc = runInNewContext("gc")`——第二次创建 Worker 时新 isolate 已带全局 `gc`，顶层 `const gc` 触发 `SyntaxError: Identifier 'gc' has already been declared`。冷启动正常。修复方向：重命名局部变量（如 `gcFn`）或改用 `globalThis.gc` 探测 | 任意模型可用状态 → 设置→Speech 切到另一 sherpa 模型（parakeet→sensevoice、whisper→sensevoice 均复现）→ 录音 → toast `Identifier 'gc' has already been declared · Recording kept…`；main.log 每次 worker 重启均记 `sherpa worker error [worker eval] SyntaxError: Identifier 'gc' has already been declared` | ss_7ef225b6（toast）、ss_84c53e4b（History 失败项）、main.log 19:51 段 |
| P2-2472 | P2 | onboarding 默认模型为英文 parakeet（660MB）：中文用户首次落字为乱码音译，需自行发现设置页、二次下载 sensevoice；叠加 P1-2471 后新用户 12 步才达成首次可用落字 | 全新 userData 启动 → 按引导卡下载默认模型 → 中文语音 RightCtrl 听写 → 落字乱码 | 第 2 节步骤 1-12 及截图；ss_34e0109e、ss_ab759806 |
| P3-2473 | P3 | 深色模式下 native select 弹层仍为浅色系统样式（可读但不随主题；与第 PR #64 轮记录的 native select 已知形态一致，本轮确认仍未收敛） | 深色主题 → 打开任意 select（如识别语言下拉）弹层 | ss_33b2bba7 |
| P3-2474 | P3 | 人设/按应用切人设在未配置润色 LLM 时对落字文本零影响，仅显示为历史标签；默认开箱状态差异化卖点不可感知 | 不配 LLM → 设两个人设并加 App 规则 → 分别听写 → 文本无任何差异，仅 personaName 不同 | `polish.ts` L444、`dictation.ts` L729-846 源码 + 本轮人设正反例截图 |

## 5. 已验证 / 未验证清单

- 已验证：打包链路全绿；核心链路/静音反馈/免按 39 句头零丢字/F8 改写与未配模型分支/按应用切人设正反例/whisper 下载切换/导出默认 Documents/五页面深浅色/窄窗口；全新 userData onboarding 全程；P1-2471 两条切换路径复现 + 源码根因。
- 未验证：真实麦克风与真实权限流程（全程 fake-mic）；豆包激活提示在 onboarding 的出现与否；下载/全程精确耗时；「录音时静音其他应用」（VM 无真实音频输出场景）；专项 B 的建议均为方案论证，未做任何实现验证。

## 6. 证据索引

- 录屏：`C:\Users\Administrator\screencasts\rec-2b1f673f-af5a-48c1-8176-bd1d55f0f862\rec-2b1f673f-af5a-48c1-8176-bd1d55f0f862-edited.mp4`
- 免按存证：`C:\Users\Administrator\tts\r247_hf.txt`（37 次 finalize 全文）
- 主日志：`%APPDATA%\SpeakType\logs\main.log`（P1 段 19:51）
- 截图（`C:\Users\Administrator\screenshots\`）：正文各处已注明文件名
- 测试后清理：SpeakType/Notepad/mock server 进程已结束；注册表主题恢复浅色；测试人设与 App 规则已删；导出文件已删
