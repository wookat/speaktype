# SpeakType 第 208 轮严格体验官报告

- 日期：2026-08-20
- 被测版本：main `a7a2f66`（含 PR #298 prompt 语言框架、#299 时刻合成/词典过滤/导入反馈），本机 `npm run build` + `npx electron-builder --dir` 打包 `desktop/release/win-unpacked/SpeakType.exe`（v0.15.1, packaged=true）实测
- 方法：fake-mic WAV（`--use-fake-device/ui-for-media-stream --use-file-for-fake-audio-capture`）+ CDP(9333) 读运行时状态 + 本地 mock LLM（127.0.0.1:8975，记录 prompt 全文）+ GUI 实操截图。结论标注【实测确认】/【推测】/【未测试】。

## 一、PR #298/#299 回归结果（4/4 通过）

### 1. #298 prompt 框架随口述指令语言切换 —— 通过【实测确认】
- 英文指令：选区 F8 + 口述 "Make it shorter."，mock 收到英文模板（"Rewrite the text below according to the user's spoken instruction… Spoken instruction: …"），选区被 mock 回复正确替换（notepad 内容变为 `SHORTER-BY-MOCK`）。
- 中文指令：切 whisper tiny + language=zh 让 ASR 产出 CJK 指令（"咪哲哲…"，幻听文本但含 CJK 即可触发分支），mock 收到中文模板（"你按用户的口述指令改写下面这段文字…口述指令：…"）。
- 判定逻辑为 `CJK_RE.test(instruction)`，两分支均在打包版真实链路（ASR→hotword 纠错→模板拼装→HTTP）验证。

### 2. #299 时刻合成 3 30 pm → 3:30 pm —— 通过，Parakeet 端到端【实测确认】
- 本机 Parakeet（parakeet-tdt-0.6b-v3，int8 onnx）仍在 `%APPDATA%\SpeakType\models`，无需重新下载。
- 口述 "The meeting is scheduled for three thirty pm tomorrow afternoon"：history `raw="The meeting is scheduled for 3 30pm tomorrow after"` → `text="The meeting is scheduled for 3:30 pm tomorrow after."`。ASR 拆出的 `3 30pm`（含无空格变体）被 `localCleanup` 正确合成 `3:30 pm`，P3-2014 关闭。
- 边缘观察：另一次 ASR 输出 `3 3 pm`（"thirty" 被识别为 "3"），正则要求分钟为两位（`[0-5]\d`）不合成，保持原样——此为 ASR 误识别非 ITN 规则问题，处理保守合理【实测确认】。

### 3. #299 词典过滤纯符号行 —— 通过【实测确认】
- Dictionary 粘贴 `Kubernetes / === / --- / *** / Parakeet` 共 5 行保存：仅 Kubernetes、Parakeet 入库，3 个符号行被拒（截图 round205 同法）。P3-2015 关闭。
- 文案瑕疵（新立案 P3-2081）：拒收提示为 "3 word(s) were not added (over the 300-hotword limit or longer than 20 characters)."，实际原因是纯符号行，提示语与真实原因不符，误导用户。

### 4. #299 配置导入「已忽略 N 个字段」—— 通过【实测确认】
- 构造 import208.json：2 个未知键 + 1 个错类型（holdDelayMs 字符串）+ 1 个不可携带键（polishApiKey）+ 1 个合法键（theme）。
- 导入后横幅精确显示 "Config imported and applied (4 unrecognized field(s) ignored)"；切 zh-CN 再导一次显示「配置已导入并生效（已忽略 4 个无法识别的字段）」。计数与预期完全一致，theme 正常生效。P3-2052 关闭。
- 文案瑕疵（并入 P3-2081）：polishApiKey 属"已知但不可携带"，被归入 "unrecognized/无法识别" 表述不准确。

## 二、专项 1：按应用人设规则（appPersonas）实效

- 建自定义人设 `Notepad Writer 208`（prompt 含 PERSONA-208-MARKER）+ 规则 `notepad → Notepad Writer 208`，开启 AI 润色（mock）。
- 前台为 Notepad 时听写：history `personaName="Notepad Writer 208"`，mock 收到的润色 prompt 中确实注入 `PERSONA-208-MARKER: rewrite casually.`——规则不仅换徽标，真实改变 LLM 行为【实测确认】。
- 对照组：关闭 Notepad、前台切 Chrome 后听写 → `personaName="Default"`，规则未误触发【实测确认】。
- 人设在按键按下时刻取前台窗口（录完不再读），实测符合注释设计；改写模式(F8)不走应用人设（代码注释明示，未单测）【推测】。
- Personas 页规则 UI（含运行中应用下拉、多语言文案）正常渲染。

## 三、专项 2：多语言 UI 走查（zh-CN / ja / ko 抽查）

- 「界面语言」切换即时生效【实测确认】。zh-CN 设置页/备份/重置、ja 设置页/人设页（内置 7 人设全量日文文案）、ko 首页/词典页均无缺翻译、无明显截断错位【实测确认】。
- zh-TW 仅在下拉确认存在，页面未逐一走查【未测试】。
- 小瑕疵：ja 设置页「エクスポート…」按钮文字折行两行（宽度不足），不影响功能，观感轻微（并入 P3-2081 文案/微观 UI 批次可顺手修）。

## 四、新立案

| 编号 | 级别 | 问题 | 状态 |
|---|---|---|---|
| P3-2081 | P3 | 文案批：词典拒收提示原因与实际不符（符号行被归为"超限/超长"）；导入横幅把不可携带键说成"无法识别"；ja 导出按钮折行 | 【实测确认】 |
| P3-2082 | P3 | `localModel` 被写入无效值（如经损坏的导入文件，导入仅校验 typeof string）后，听写/toggleRecord 完全无反应：无 toast、无日志、无恢复引导，静默死态。实测将 localModel 设为不存在的 id 后按键无任何反馈，改回合法 id 立即恢复 | 【实测确认】 |

## 五、结论与下轮 Top3

第 205 轮 Top3 全部闭环：P2-2051（#298）、P3-2014/2015/2052（#299）打包版真实回归全部通过，含 Parakeet 3:30 pm 端到端。本轮无 P0-P2 新增。

下轮 Top3 建议：
1. P3-2082 无效 localModel 静默死态：导入/写入时校验模型 id 合法性（白名单），或听写启动失败时给出 toast + 跳转模型设置。
2. P3-2081 文案批小修（词典拒收原因、导入"无法识别"措辞、ja 按钮折行）。
3. 未深挖区域继续：历史搜索大数据量（数千条）性能 + 免按长会话稳定性。

无产品代码改动；未合并任何 PR。
