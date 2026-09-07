# 第 283 轮严格体验官报告（round283）

- 日期：2026-09-02（UTC）
- 被测版本：main `079bff1`（含 PR #373：改写失败按 HTTP 状态/非兼容响应区分并落日志、导入提示跟随当前界面语言）。本机 `npm run typecheck && npm run build && npm run pack:dir` 全绿，用打包版 `desktop/release/win-unpacked/SpeakType.exe`（0.17.0，日志 `packaged=true`）实测。
- 测试手段：Windows Server 2022 打包版 + fake microphone（`--use-file-for-fake-audio-capture` 循环 WAV，无实体麦克风）+ Notepad / Chrome 本地测试页（textarea 与单行 input，`ta283.html`）真实选区与落字 + `keybd_event` 注入 F8/RightCtrl/Alt+Q/Esc；F8 改写用本机 OpenAI 兼容 mock 服务（`127.0.0.1:8790/dyn/v1`，可切 `ok/slow10/http500/…` 模式并记录每次请求的原文）。全程只读产品，不改产品代码。
- 证据分级：【实测】=打包版 GUI/日志/持久化 JSON 实测；【字节】=UTF-8 字节/源码文案核验；【源码】=源码推断，未经运行时验证；【复用】=沿用前几轮证据；【未测】。
- 证据文件均在测试机 `C:\Users\Administrator\tts\ev283\`（下文以文件名引用），mock 请求原文记录 `d-mock-original.txt`，主日志 `%APPDATA%\SpeakType\logs\main.log`。

## 结论总览

| 专项 | 结果 | 立案 |
|---|---|---|
| 1 P3-282-3 设计取证（F8 覆盖无撤销） | 5 个子项全部【实测】拿到一手证据。**当前产品 F8 成功路径没有弹窗/应用/放弃形态**（题目中的「弹窗出现后…点应用」在产品里对应「改写等待期（悬浮条 polishing）…请求返回自动粘贴」），a/b/e 按等价场景取证。结论：结果落到**请求返回瞬间的前台焦点**，与原选区无绑定；等待期改动原文不校验；Ctrl+Z 依赖宿主编辑器自身撤销栈（Notepad / Chrome 均可回退，但属宿主能力）；连续两次 F8 的第二次原文是第一次的产物；Esc 在 polishing 阶段**不能**取消改写。 | 283-P2-1（焦点竞态：结果落错窗口/拼接进被改动的文本）、283-P3-1（Esc 在 polishing 阶段对 F8 无效）、设计建议见 §1.6 |
| 2 首启/新手引导走查（全新用户） | 首启无崩溃/空白；默认设置合理（本地离线 ASR、模型按系统语言选、F8/RightCtrl/Alt+Q 默认键、AI 润色关闭、手机麦关闭）；零模型下 首页/转写/F8/手机麦/托盘/RightCtrl 六个入口均有可点击的下一步；五语言首页首启文案【实测】无截断乱码 | 283-P3-2（无模型 toast 正文被 3 行截断，动作动词被吞）、283-P3-3（手机麦零模型状态无前置提示）、283-P3-4（`onboarded` 标记为死代码/无首启向导） |
| 3 核心回归 RightCtrl / Alt+Q 两句 / Esc / #373 HTTP 500 toast | 全部通过 | 283-P3-5（免按尾段仅「。」也落字并计历史，fake-audio 条件下观察） |

本轮新立案 6 条：P2 ×1、P3 ×5；无 P0/P1。

---

## 专项 1：P3-282-3 设计取证 —— F8 改写成功直接覆盖原文、无撤销

### 1.0 形态澄清（先于所有子项）

- 【实测】【复用 282】按住 F8 说指令 → 松手 → 悬浮条依次 transcribing → polishing → 请求返回后**直接**用 Ctrl+V 把结果粘贴到当前焦点位置，成功时无弹窗、无 diff、无「应用/放弃」按钮、无成功 toast。
- 【源码】`dictation.ts startRewrite()`：F8 按下瞬间用剪贴板探针 + 模拟 Ctrl+C 抓取选区文本，仅保存字符串 `rewriteTarget`；`finalize()` 里 `rewriteSelection()` 返回后立即 `pasteText(glue + text)`（`paste.ts`：写剪贴板 → 等修饰键松开 → 模拟 Ctrl+V → 恢复剪贴板）。**没有保存目标窗口 HWND、控件或选区范围**。
- 因此题目 a/b/e 中的「弹窗出现后 / 弹窗期间 / 点应用 / 点放弃」在产品中不存在；本轮按等价场景取证：「弹窗期间」= 悬浮条 polishing 等待期（mock `slow10` 模式让请求挂 10s 制造窗口），「点应用」= 请求返回时的自动粘贴，「放弃」= Esc 取消（录音阶段 / polishing 阶段分别测）。以下每条都注明实测 vs 推断。

固定原文：`这是一段用于测试改写覆盖与撤销的原文，请勿修改。`；mock `ok` 模式返回 `【已改写】` + 原文，`slow10` 模式 10s 后返回 `【慢速改写10s】【已改写】` + 原文。

### 1.1 a) 等待期切到别的窗口，结果落到哪？—【实测】落到切换后的窗口；原选区未被替换

- 步骤：Notepad A 选中原文（Notepad B 空窗在后，`a1-before-A-selected-B-behind.png`）→ mock 切 `slow10` → 按住 F8 说指令 → 松手 → 悬浮条 polishing 期间点击 Notepad B 使其获得焦点 → 等待 10s。
- 现象：`【慢速改写10s】【已改写】这是一段…` 被粘贴进 **Notepad B**；Notepad A 的原文原样保留仍处于选中态（`a2-switched-to-B-text-landed-in-B.png`）。mock 日志 `d-mock-original.txt` 21:18:16 记录本次 ORIGINAL 为原文，说明抓取正确、只是落点错。
- 判断：【实测】结果落到请求返回瞬间的前台焦点，与原选区没有任何绑定 → 立案 283-P2-1。

### 1.2 b) 等待期在目标输入框手动改动原文再「应用」—【实测】不校验、直接拼接

- 步骤：Notepad 选中原文 → `slow10` 模式按 F8 说指令 → polishing 期间点击原文末尾（取消选区）并键入 `[MANUAL-EDIT]`（`b1-pending-polishing-manual-edit.png`）→ 等待请求返回。
- 现象：改写结果被粘贴到当前光标处（`[MANUAL-EDIT]` 之后），最终文本 = 原文 + `[MANUAL-EDIT]` + `【慢速改写10s】【已改写】原文`，即**原文、人工改动、改写结果三者拼接**，原文没有被替换（`b2-after-paste-original-plus-edit-plus-rewrite.png`）。
- 若用户在等待期重新选中了别的文字，则被替换的是「新选区」（【源码】推断：Ctrl+V 语义，未单独实测）。
- 判断：【实测】没有「原文仍与捕获时一致」的校验，也没有对目标位置的记忆 → 归入 283-P2-1 的第二种表现。

### 1.3 c) 应用后立即 Ctrl+Z 能否恢复原文？—【实测】Notepad 与 Chrome textarea / input 均可，但都是宿主编辑器自身撤销

| 宿主 | F8 后 | Ctrl+Z | Ctrl+Shift+Z / Ctrl+Y | 证据 |
|---|---|---|---|---|
| Notepad（Win Server 2022 经典记事本） | 选区被替换为 `【已改写】…`（`c2`） | 一次恢复原文（`c3-notepad-ctrlz-restored.png`） | 【未测】 | `c1`~`c3` |
| Chrome（本机 Chrome for Testing）本地页 `<textarea>` | 替换为 `【已改写】…`（`c5`） | 一次恢复原文（`c6-browser-textarea-ctrlz-restored.png`） | Ctrl+Shift+Z 重做回到改写结果（`c5` 右侧） | `c4`~`c6` |
| Chrome `<input type=text>` 单行 | 替换为 `【已改写】…` | 一次恢复原文（`c7-browser-input-ctrlz-restored.png`） | 重做回到改写结果（`c8-browser-input-redo-shows-rewritten.png`） | `c7`、`c8` |

- 判断：【实测】以上恢复完全依赖宿主编辑器把「Ctrl+V 粘贴替换选区」记成一个撤销事务；SpeakType 自身没有任何撤销能力（【源码】`paste.ts` 只在粘贴后恢复**剪贴板**内容，不涉及文本回滚）。
- 【源码/推断】不可撤销的宿主场景：无撤销栈的输入框（多数聊天软件消息框、终端、部分 Electron 应用自绘编辑器）、把粘贴拆成多步的编辑器（Ctrl+Z 一次只回退一部分）、以及 1.1/1.2 的错位落字（撤销要在「落错的那个窗口」里做，用户不一定意识到）。本轮【未测】这些宿主。

### 1.4 d) 连续两次 F8 改写同一段，第二次的「原文」是什么？—【实测】是第一次的改写结果

- 步骤：Notepad 选中原文 → F8（`ok` 模式）→ 替换为 `【已改写】原文` → 不做任何操作直接再按 F8。
- 现象 1：第二次 F8 立刻 toast「没有选中文字」（`d1-second-f8-no-selection-toast.png`）——粘贴后光标落在文末、无选区，F8 抓不到文本，未发请求。【实测】
- 现象 2：手动重新选中整段（此时内容已是 `【已改写】原文`）再按 F8 → mock 日志 21:20:06 记录 `ORIGINAL=【已改写】这是一段…`，即**第二次的原文 = 第一次的产物**；最终文本 `【已改写】【已改写】原文`（`d2-second-f8-reselected-double-prefix.png`）。【实测】
- 现象 3：此时 Ctrl+Z 一次回到 `【已改写】原文`（`d3`），第二次 Ctrl+Z 在本机 Notepad 上**没有**继续回到最初原文，而是变成重做（`d4-ctrlz-twice-redo-not-original.png`）——经典记事本只有一级撤销，第一次改写的原文已丢失。【实测，仅限该 Notepad】
- 判断：产品没有「原始原文」概念，每次 F8 都以当前选区为原文，多次改写会累积漂移且最初原文无处找回（除宿主多级撤销）。

### 1.5 e)「放弃」路径是否完全无副作用？—【实测】录音阶段 Esc 无副作用；polishing 阶段 Esc 无效

- 录音阶段：选中原文 → 按住 F8 → 松手前按 Esc。现象：悬浮条消失、原文仍选中未改、`history.json` 未新增条目、mock 日志无新请求（`e1-esc-during-recording-no-side-effect.png`，为取消后状态截图，「已取消」toast 自动消失未截到，该 toast 存在性为【复用 280–282】+【源码】`cancel()`）。【实测】无副作用。
- polishing 阶段：`slow10` 模式 → F8 说指令松手 → 悬浮条 polishing 时按 Esc（`e2-esc-during-polishing-pending.png`）。现象：悬浮条状态无变化、无「已取消」toast，10s 后结果照常粘贴、原文被替换（`e2b-esc-ignored-text-still-replaced.png`）。【实测】Esc 对已进入改写请求阶段的 F8 完全无效。
- 【源码】`dictation.ts cancel()`：仅当 `this.session`（录音中）或 `this.finishing`（ASR 上传中）存在时才能取消；`finalize()` 在 `session.finish()` 返回后已把 `finishing` 置空，随后 `await rewriteSelection(...)` 期间 `cancel()` 走到 `this.pendingEnd = "cancel"` 分支——该分支对改写请求不产生任何效果，`rewriteTarget` 也早已拷进局部变量。与实测一致 → 立案 283-P3-1。
- 「放弃已应用的结果」在产品内不存在，只能靠宿主 Ctrl+Z（见 1.3）。

### 1.6 设计建议（全部为设计推断，非现有行为）

结论：**需要内置撤销 / 应用确认中的至少一种**，理由是 1.1、1.2、1.4、1.5 四个实测都表明「只保存原文字符串、返回即全局 Ctrl+V」的模型在任何非理想时序下都会破坏用户文本，且产品自身无法回滚。建议按成本递进：

1. **应用前校验（低成本，优先）**：`startRewrite()` 时除文本外记录前台窗口 HWND（`GetForegroundWindow`）与线程/控件焦点；`pasteText` 前校验前台窗口仍是同一个，且再做一次「静默 Ctrl+C 探针」核对当前选区文本 === `rewriteTarget`。不一致则不粘贴，toast「目标已变化，改写结果已复制到剪贴板」（把结果留在剪贴板给用户手动粘贴）。直接消灭 283-P2-1 的两种表现。
2. **可取消**：`rewriteSelection` 传入 `AbortController`，`cancel()` 在 polishing 阶段调用 abort 并 toast「已取消，原文未改」。消灭 283-P3-1。
3. **内置一步撤销（中成本）**：粘贴成功后保存 `{rewrittenText, originalText, hwnd}` 60s；提供快捷键（如再按一次 F8 且无选区，或 Ctrl+Alt+Z）/悬浮条「撤销改写」按钮：校验前台 HWND 一致 → 再次 Ctrl+C 探针确认当前选区（或用 Shift+方向键按结果长度反选）等于 `rewrittenText` → 粘贴 `originalText`。属于「复用宿主粘贴能力做补偿事务」，不依赖宿主撤销栈；对无撤销栈的输入框同样有效。局限：需要能重新选中结果文本，富文本/自动格式化的编辑器可能长度不一致，此时应拒绝撤销并提示。
4. **预览确认（高成本，可选）**：悬浮条展开 diff 预览 + 「应用/放弃」，应用时再做第 1 条的校验。用户在第 282 轮题面里默认存在的形态即此；建议作为设置项（默认关）而非强制，避免打断熟手。
5. 附带：多次 F8 累积漂移（1.4）可由第 3 条的 `originalText` 链解决（第二次 F8 若选区 === 上次 `rewrittenText`，把上次 `originalText` 作为原文，并在 prompt 中注明「用户对上次改写不满意」）。

---

## 专项 2：首启/新手引导走查（清空数据模拟全新用户）

前置：SpeakType 托盘 Quit 后确认进程为 0，把整个 `%APPDATA%\SpeakType` 移走（含模型、证书、历史），确认无 legacy `SpeakType *` 目录残留，用打包版重新启动。启动日志：`no legacy userData to migrate` → `SpeakType 0.17.0 starting (packaged=true)` → `latest release prefetched: v0.17.0`（无报错）。测后已整体移回原目录并把 `speaktype.json`/`history.json` 恢复到本轮开始前的哈希。

### 2.1 首次启动流程 —【实测】直接进首页，无向导；首页即引导

- 【实测】首启无崩溃、无空白、无权限弹窗；主窗口直接打开首页（`f1-fresh-first-launch-home-en.png`），系统语言 en-US 下界面为英文。首页内容：标题「Hold RightCtrl to start voice typing」+ 副标题（Alt+Q 免按提示）；**紫色模型卡**「Download the offline speech model / One-time download (~660MB)…」含两个模型选项（SenseVoice 234MB / Parakeet 660MB，Parakeet 高亮）+「Download」按钮；四项统计均为 0；「First time? 4 quick steps」默认展开（【源码】`statsSessions < 10` 时展开）；下方「No good mic on this PC? Use your phone as the microphone →」链接与「Current persona」卡（`f2-fresh-home-steps-persona-hint.png`）。
- 【实测】没有独立的首启向导/欢迎页；【源码】`store.ts` 有 `onboarded:false` 字段、`index.ts` 注册了 `onboarding:done` IPC、preload 暴露 `onboardingDone()`，但 renderer 目录中无任何调用（grep 无结果），该标记永远为 false → 283-P3-4（死代码，非用户可见问题）。
- 观察：4 步引导（保持运行 → 光标放输入框 → 按住 RightCtrl 说话 → 松手落字）**没有把「先下载模型」列为第 0 步**，靠上方模型卡承担；两者视觉上是分离的两块，新用户若跳过卡片直接按第 3 步会得到 2.3 的 toast。建议合入设计建议，未单独立案。

### 2.2 默认设置合理性 —【实测】读取首启生成的 `speaktype.json`

关键默认值（en-US 系统）：`asrProvider:"local"`、`localModel:"parakeet-tdt-0.6b-v3"`、`language:"en"`、`uiLanguage:"system"`、`theme:"system"`、`hotkeyHold:"RightCtrl"`、`hotkeyToggle:"Alt+Q"`、`hotkeyRewrite:"F8"`、`autoPaste:true`、`polishEnabled:false` 且 URL/Key/模型为空、`remoteMicEnabled:false`、`remoteMicMode:"lan"`、`launchAtLogin:false`、`startMinimized:false`、`vadAutoStop:true (2000ms)`、`autoLearn:true`、`keepFailedAudio:true`。

- 判断：离线优先、不默认开任何云端/联网功能、不默认开机自启，合理。【源码】`store.ts` 按 `Intl` 系统 locale 决定默认：zh/ja/ko/yue 系统 → `sensevoice-small` + 对应 `language`；其余 → Parakeet + en。本机为 en-US，故看到 Parakeet 高亮，与源码一致。
- 观察（未立案）：在首页把界面语言切到中文后（2.5），模型卡高亮仍是 Parakeet（「英语 + 25 种欧洲语言」），依赖用户读到「按你平时说的语言选择模型」提示自行切换；可考虑「界面语言切到 CJK 且尚未下载模型时自动切到 SenseVoice」。
- `language:"en"` 是识别语言默认值，对 en-US 系统正确；本轮核心回归使用的是恢复后的原配置（`language:"zh"`），未把 fresh 配置下的中文 fake audio 当作有效中文回归证据。

### 2.3 零模型状态下各入口是否可行动 —【实测】六个入口全部有可点击的下一步

| 入口 | 操作 | 现象 | 判断 |
|---|---|---|---|
| 首页 | 首启即见 | 模型卡 + 模型选择 + Download 按钮 | 可行动【实测】（下载过程本身【未测】，见未测项） |
| RightCtrl 听写 | Notepad 中按住 RightCtrl 2s | toast「Speech recognition not set up / Local model not downloaded yet: open Settings → Speech…」+「Open Settings」按钮（`f3-fresh-rightctrl-no-model-toast.png`）；点按钮 → 设置 → Speech recognition 页，状态「Not configured」+「Download model」按钮（`f4-fresh-toast-open-settings-lands-speech-tab.png`）。同时悬浮字幕条显示完整错误文案。无落字、无崩溃 | 可行动【实测】；toast 正文被截断 → 283-P3-2 |
| F8 改写 | Notepad 选中文本按住 F8 | 主窗口被拉到前台并切到 设置 → AI polish（「Enable AI polish」开关处）（`f5-fresh-f8-no-llm-opens-ai-polish.png`）；【复用 282】同时 toast「Rewrite needs a polish model」。原文未改 | 可行动【实测】。注：F8 先检查润色模型再检查 ASR，新用户配好 LLM 后再按 F8 还会遇到一次 2.3 的 ASR 引导（两步引导，【源码】`startRewrite()` 顺序） |
| 文件转写 | 侧栏 Transcribe | 页面顶部琥珀色横幅「The offline model isn't downloaded yet — download it first」+「Download model」按钮，语言提示，拖放区仍可用（`f6-fresh-transcribe-no-model-banner.png`） | 可行动【实测】；此时拖入文件的报错【源码】`transcribe.ts` 回落 `error.localModelMissing` 文案，【未测】 |
| 手机当麦克风 | 首页链接 → 设置 → Speech 页顶部「Phone as microphone」开关（`f7a`）→ 打开 | 立刻出现二维码 + LAN 地址 + 配对码 + 「Waiting for a phone to connect…」（`f7-fresh-phone-mic-enabled-no-model-no-hint.png`） | 可行动【实测】；但页面**没有任何提示「没有模型，手机连上说话也不会出字」**，用户要在手机端说完话才在桌面见到 2.3 的 toast（【源码】手机音频与本机同走 `finalize()`，会命中 `error.localModelMissing`，【未测】未真实接手机）→ 283-P3-3 |
| 托盘菜单 | 右击托盘图标 | 菜单多出「Set up speech recognition」项（Open SpeakType / Set up speech recognition / Quit） | 可行动【实测】 |

### 2.4 五语言首启文案抽查 —【实测】首页 + 无模型 toast

在设置 → General →「Interface language」依次切换，回首页截图：

| 语言 | 证据 | 结果 |
|---|---|---|
| English | `f1-fresh-first-launch-home-en.png` | 标题/模型卡/4 步/手机链接/人设提示完整，无截断 |
| 简体中文 | `f8-fresh-home-zh-CN.png` | 「按住 RightCtrl 键，开启语音输入 / 下载离线语音模型 / 首次使用？4 步搞定 / 电脑没有好麦克风？用手机当麦克风 →」，完整 |
| 繁體中文 | `f9-fresh-home-zh-TW.png` | 「按住 RightCtrl 鍵，開始語音輸入 / 下載離線語音模型 / 第一次用？4 步搞定」，完整，用词与简体区分正确 |
| 日本語 | `f10-fresh-home-ja.png` | 「RightCtrl を押しながら話す / オフライン音声モデルをダウンロード / はじめての方へ：4 ステップ」，完整 |
| 한국어 | `f11-fresh-home-ko.png` | 「RightCtrl 를 누른 채 말하세요 / 오프라인 음성 모델 다운로드 / 처음이신가요? 4단계로 시작」，完整 |

- 附加：ko 下按 RightCtrl 的无模型 toast（`f12-fresh-ko-no-model-toast-truncated-caption-full.png`）：正文同样被 3 行截断为「…설정 → 음성 인식 → "모델 다운로드" 를…」，下方悬浮字幕条显示完整句子；界面切换即时生效无残留英文。
- 【字节】`error.localModelMissing` 五语言文案均含「设置 → 语音识别 → 下载模型」路径指引；`toast.rewriteNoModel*` 五语言齐全。
- 五语言下设置页/转写页/托盘菜单首启文案【未测】（仅首页与该 toast）。

---

## 专项 3：核心回归

| 项 | 步骤 | 现象 | 结果 |
|---|---|---|---|
| RightCtrl 中文落字 | 原配置（`language:"zh"`，SenseVoice 已下载）Notepad 中按住 RightCtrl 5.5s | 落字「帮我跟老板说，那个方案需要再改一下，明天上午之前他答复。」（`r2-rightctrl-chinese.png`），日志 `dictation finalize: durationMs=5563 maxPeak=32758 voicedMs=3580` | 通过【实测】 |
| Alt+Q 免按两句 | Alt+Q 开启免按，fake audio 循环两遍后 Alt+Q 结束 | 落两段同句文本并按段落切分（`r3-altq-two-sentences-plus-trailing-punct.png`），历史新增 3 条：两条完整句（dur 9779 / 8234）+ 一条仅「。」（dur 3196，`r3-history-top3.txt`） | 通过【实测】；尾段「。」→ 283-P3-5 |
| Esc 取消 | 按住 RightCtrl 中途 Esc | 无落字，首页协作次数仍为 37，无历史新增，日志无 finalize（`r4-esc-cancel-rightctrl-no-text.png`；「已取消」toast 已自动消失未截到） | 通过【实测】 |
| #373 HTTP 500 toast | mock `http500` 模式，Notepad 选中文本 F8 | toast「改写失败 / 润色服务返回 HTTP 500——请检查模型名与 API Key，原文未改动」（`r1-http500-toast.png`）；`main.log` `[warn] rewrite: endpoint returned HTTP 500`；原文未改 | 通过【实测】 |

---

## 立案清单

### 283-P2-1 F8 改写结果落到「请求返回瞬间的前台焦点」，与原选区无绑定；等待期改动原文不校验

- 复现：见 §1.1、§1.2。① Notepad A 选中文本 → F8 说指令 → 等待期点到 Notepad B → 结果粘进 B，A 原文未变；② 等待期在原输入框打字 → 结果拼接在新光标处，得到「原文 + 手动改动 + 改写结果」。
- 证据：`a1`/`a2`、`b1`/`b2` 截图；mock 日志 ORIGINAL 正确证明抓取无误、只是落点错；【源码】`startRewrite()` 只存字符串，`pasteText()` 全局 Ctrl+V。
- 影响面：所有 F8 用户；改写耗时越长（真实云端 LLM 通常 2–10s）越容易切窗/继续编辑，结果误入聊天框、终端、其他文档且无提示；宿主无撤销时不可恢复。定 P2 而非 P3：会**破坏用户其他窗口的内容**，且用户很可能没有意识到发生了什么。
- 修复建议：§1.6 第 1 条（记录 HWND + 粘贴前 Ctrl+C 探针复核选区 === 原文，不一致则改为「结果已复制到剪贴板」toast）；配合第 2 条可取消。

### 283-P3-1 Esc 在 polishing（改写请求进行中）阶段对 F8 无效

- 复现：§1.5 第二段。
- 证据：`e2`、`e2b` 截图；【源码】`cancel()` 在 `finishing` 已置空后只设 `pendingEnd`，不 abort 改写请求。
- 影响面：用户发现选错/切错窗口想止损时无手段，只能等结果落下再撤销；与录音/转写阶段「Esc 即取消」的心智不一致。
- 修复建议：`rewriteSelection` 接收外部 `AbortSignal`（【源码】`polish.ts` 现用 `AbortSignal.timeout(CHAT_TIMEOUT_MS)`，可用 `AbortSignal.any` 与取消信号合并），`cancel()` 在 polishing 阶段 abort 并 toast「已取消，原文未改」。

### 283-P3-2 无模型 toast 正文被 3 行截断，把可行动的动词「点“下载模型”」截掉

- 复现：零模型状态按 RightCtrl；en 与 ko 均复现（`f3`、`f12`）。
- 证据：toast 显示「…open Settings → Speech…」/「…"모델 다운로드" 를…」，完整文案见 `error.localModelMissing`。悬浮字幕条显示完整句子、toast 有「Open Settings」按钮，故仍可行动。
- 影响面：五语言新用户首次按键的第一条反馈；截断处恰好是操作指引。
- 修复建议：该 toast 正文改用短版（如「本地模型还没下载」）把路径放进按钮文案「去下载模型」；或 toast 正文允许 4 行/自动缩字。

### 283-P3-3 手机当麦克风在零模型状态下无前置提示

- 复现：§2.3 手机麦行。
- 证据：`f7-fresh-phone-mic-enabled-no-model-no-hint.png`（二维码 + Waiting for a phone…，无任何模型缺失警示）。
- 影响面：新用户被首页「没有好麦克风？用手机」吸引先走这条路，扫码配对完在手机端说话才发现无字，桌面 toast 又在另一台设备上。真实手机端表现【未测】，基于源码推断会命中 `error.localModelMissing`。
- 修复建议：手机麦区块在 `asrProvider==="local" && !downloaded` 时复用转写页的琥珀横幅（「离线模型未下载，手机连上也无法识别」+ Download 按钮）；手机页 relay/LAN 端可在连接握手时收到桌面端 `asrReady:false` 并显示提示（【源码】需协议加字段，为推断）。

### 283-P3-4 `onboarded` 标记为死代码，产品实际没有首启向导

- 证据：【源码】`store.ts` 默认 `onboarded:false`、`index.ts` `ipcMain.handle("onboarding:done")`、preload `onboardingDone()`，renderer 无调用；【实测】首启无向导页，首页模型卡 + 4 步卡承担引导。
- 影响面：无用户可见故障；但会误导后续开发者以为存在首启流程，且首页引导对「先下载模型」与「4 步」的先后关系表达不足（§2.1 观察）。
- 修复建议：要么删除死字段/IPC，要么真正实现一次性首启页（选语言 → 选模型并下载 → 试一句），并把 4 步卡改为「0. 下载模型（已完成 ✓）」动态勾选。

### 283-P3-5 免按（Alt+Q）尾段只识别出「。」也落字并计入历史（fake-audio 条件下观察）

- 复现：§3 Alt+Q 行。fake WAV 循环到片尾/结束免按时，最后一段 3196ms 只产出「。」，被作为新段落粘贴并在历史新增一条 `text:"。"`。
- 证据：`r3-altq-two-sentences-plus-trailing-punct.png` 尾行仅「。」，`r3-history-top3.txt` 第一条 `[。] raw=[。] dur=3196`。
- 影响面：真实场景中呼吸/环境噪音段可能同样被 SenseVoice 输出为纯标点（推断，【未测】实体麦克风）；污染文档与历史/统计。因证据来自 fake audio 循环边界，定 P3 观察项。
- 修复建议：`finalize()` 中若 `raw` 去除标点与空白后为空，按「无有效语音」处理（不粘贴、不入历史、免按模式静默续听）。

---

## 未测试项

- F8：真实云端 LLM 延迟下的切窗竞态（本轮用 mock 10s 挂起模拟）；等待期「重新选中别的文字」的落点（源码推断为替换新选区）；无撤销栈宿主（聊天软件消息框、终端、自绘编辑器）与富文本编辑器的 Ctrl+Z；Notepad 的 Ctrl+Y 重做；Windows 11 新版记事本多级撤销。
- 首启：模型实际下载过程（进度/断点续传/失败提示）；零模型下拖入文件转写的报错；真实手机连接零模型桌面端的手机侧提示；深色主题首启；五语言下设置页/转写页/托盘菜单首启文案（仅首页 + 无模型 toast 实测）；非 en-US 系统 locale 的默认模型选择（仅源码核验）。
- 回归：实体麦克风；`283-P3-5` 在真实语音下是否复现；zh-TW/ja/ko 的 HTTP 500 toast（仅 zh-CN 实测，五语言字节已在第 282/373 轮核验）。

## 环境清理

- SpeakType 经托盘 Quit 正常退出（`Get-Process SpeakType` = 0），未强杀任何进程；fresh userData 移至 `tts\bak283\userData-fresh283` 留档，原 `%APPDATA%\SpeakType`（含模型/证书/日志）整体移回，`speaktype.json`（哈希 DF0ABE1A…，1428B）与 `history.json`（80ACDF05…，7950B）恢复为本轮开始前的备份；Notepad 全部「不保存」关闭；mock 服务与辅助 PowerShell 已停止；Chrome 仅剩原始 New Tab 窗口；仓库无产品代码改动（仅本报告；`desktop/package-lock.json` 的本地改动为本轮之前既有，未提交）。未改防火墙/hosts，未提交 secrets，GitHub Actions 保持禁用。
