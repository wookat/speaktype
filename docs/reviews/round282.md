# 第 282 轮严格体验官报告（round282）

- 日期：2026-09-02（UTC）
- 被测版本：main `8132bf3`（含 PR #372 单步 >11 字符大段插入判为改写不学入词典；按指令本轮不重测该项）。本机 `npm run typecheck && npm run build && npm run pack:dir` 全绿，用打包版 `desktop/release/win-unpacked/SpeakType.exe`（0.17.0，日志 `packaged=true`）实测。
- 测试手段：Windows Server 2022 打包版 + fake microphone（`--use-file-for-fake-audio-capture` 循环 WAV）+ Notepad 真实选区/落字 + `keybd_event` 注入 F8/RightCtrl/Alt+Q/Esc；F8 改写用本机 OpenAI 兼容 mock 服务（`127.0.0.1:8790/{ok,empty,slow,slow10,http500,badjson}/v1`，记录每次请求）；历史大数据经 `--remote-debugging-port` CDP 读取 DOM/测帧时长（只读，不改产品代码）。
- 证据分级：【实测】=打包版 GUI/日志/持久化 JSON 实测；【字节】=UTF-8 字节/JSON 码点核验；【源码】=源码推断，未经运行时验证；【复用】=沿用前几轮证据；【未测】。
- 截图路径均在测试机 `C:\Users\Administrator\screenshots\`，mock 请求日志 `C:\Users\Administrator\tts\mockllm282.log`，历史性能原始数据 `C:\Users\Administrator\tts\histperf282-*.json`、`histfilters282-result.json`。

## 结论总览

| 专项 | 结果 | 立案 |
|---|---|---|
| 1 F8 改写/翻译链路 | 未配置引导、mock 成功路径、网络/超时/空结果三类失败、535 字长文本、五语言 toast 均【实测】通过 | 282-P3-2（非网络类失败文案误导）、282-P3-3（成功路径无预览/撤销，设计建议） |
| 2 设置导出→完全重置→导入 | 40 个可迁移字段 + 自建人设 + 热词 + 按应用规则完整往返；旧格式/缺字段兼容不崩且计数提示；损坏 JSON 明确报错不清空 | 282-P3-1（导入切换界面语言时反馈文案语言错位） |
| 3 历史页 1200 条三来源混合 | 初次渲染即出、23 次「加载更多」每次 ≤34ms、全量 1200 条滚动 p95 16.8ms/帧无掉帧；12 组筛选/搜索口径与期望值全部一致；首页统计与注入 stats 一致 | 无 |
| 4 核心回归 RightCtrl / Alt+Q / Esc | 全部通过 | 无 |

本轮新立案 3 条，均为 P3；无 P0/P1/P2。

## 专项 1：F8 改写/翻译链路深度审查

前置：Notepad 中选中固定短句「这个方案需要再改一下，明天上午之前给他答复。」（`f8short282.txt`），按住 F8 期间 fake mic 循环播放指令音频（ASR 识别为「帮我跟老板说，那个方案需要再改」类指令，mock 日志 `INSTR>>>` 行可见）。mock 服务对 `/ok` 返回确定性文本 `[EN] …(translated by mock)`，其余端点分别返回 HTTP 500 / 挂起 60s / 挂起 10s / 空 content / 非 JSON。

### a) 未配置 LLM 时的引导 —【实测】通过

- 步骤：`polishBaseUrl` 为空 → 选中文本 → 按住 F8。
- 现象：立即弹 toast「Rewrite needs a polish model / Configure an OpenAI-compatible model in Settings → AI polish」，同时主窗口自动切到 设置 → AI polish 页（截图 ss_77e55fed、ss_9bb17cfd）。原文未改。
- 判断：引导清晰且一步到达配置页；【源码】`dictation.ts startRewrite()` 调 `openModelSettings()`。

### b) 配置 mock 端点后的成功路径 —【实测】通过（但无弹窗/diff/应用-放弃，见 282-P3-3）

- 配置 Base URL `http://127.0.0.1:8790/ok/v1`、模型 `mock-1`、API Key 留空；「Test connection」返回成功（ss_58d7375c；mock 日志 `POST /ok/v1/chat/completions … userLen=4 USER>>> ping`）。
- 按住 F8 说指令 → 松手 → 悬浮条进入 polishing 状态 → 选区被直接替换为 mock 返回文本 `[EN] 这个方案需要…(translated by mock)`（ss_13a2b600）；mock 日志 20:04:48 记录 prompt 含 `原文："""…"""` 与指令块，`auth=no`（未发送 Authorization 头，符合空 Key）。
- 实际交互形态：**没有独立弹窗、diff 视图或「应用/放弃」按钮**，结果直接覆盖选区，成功时无 toast。原文可用宿主应用自身的 Ctrl+Z 找回（【未测】未逐一验证各宿主应用撤销效果）。

### c) 三类失败的报错 —【实测】通过（文案可行动；非网络类失败归类见 282-P3-2）

| 场景 | mock 端点 / 日志 | toast（en） | 原文 | 悬浮条状态 |
|---|---|---|---|---|
| 网络失败（HTTP 500） | `/http500` 20:05:57 | Rewrite failed / Could not reach the polish service — check the Base URL and your network; the text was left unchanged | 保持选中未改（ss_83045e54） | 回到 idle |
| 超时（挂起 60s） | `/slow` 20:07:26 / 20:08:40 / 20:09:34 三次 | 约 30s 后弹「The polish service timed out (30s) — the model may be overloaded, try again or switch models; the text was left unchanged」（ss_68f95b1a） | 未改 | 30s 内 polishing，之后 idle，无残留 |
| 空结果 | `/empty` 20:12:10 | The polish model returned nothing; the text was left unchanged（ss_f300f241） | 未改 | idle |
| 附加：HTTP 200 但响应非 JSON | `/badjson` 20:12:38 | 与 HTTP 500 同一条「Could not reach the polish service…」（ss_0253579b） | 未改 | idle |
| 附加：慢 10s（<30s） | `/slow10` 20:11:25 | 10s 后正常替换为「【慢速改写10s】【已改写】…」 | 已替换 | polishing→idle |

三类文案都写明「原文未改动」并给出下一步（查 Base URL/网络、重试或换模型），可行动。【源码】`polish.ts rewriteSelection()`：`!res.ok → network`、AbortError → timeout、content 为空 → empty、`res.json()` 抛错落入 catch 也归为 network（对应 badjson 现象）。

### d) 长文本（535 字）—【实测】通过

- 用 `gen282text.mjs` 生成 5 段共 535 字中文（`f8long282.txt`）粘入 Notepad 全选（ss_34243fbf），F8 → `/ok`。
- mock 日志 20:13:39 `userLen=711`（原文 + 指令 + 模板），返回 5 段含换行文本；Notepad 结果完整 5 行、无截断/丢段/异常换行（ss_e31e35b6、ss_cb86117f），`cmplong282.mjs` 比对 mock 返回与 Notepad 内容一致；期间 UI 无卡死。

### e) 五语言 F8 toast walk-through —【实测】通过

切换界面语言后分别触发 F8 网络失败 toast（mock 未启动端口）：

| 语言 | 实测截图 | 文案 |
|---|---|---|
| en | ss_83045e54 | Rewrite failed / Could not reach the polish service — check the Base URL and your network; the text was left unchanged |
| zh-CN | ss_e29f1d37 | 改写失败 / 无法连接润色服务——请检查 Base URL 与网络连接，原文未改动 |
| zh-TW | ss_06cd6472 | 改寫失敗 / 無法連線潤色服務——請檢查 Base URL 與網路連線，原文未變動 |
| ja | ss_26f6daa7 | 書き換えに失敗しました / 推敲サービスに接続できません。Base URL とネットワークを確認してください。原文は変更されていません |
| ko | ss_2509bd60 | 다시 쓰기 실패 / 다듬기 서비스에 연결할 수 없습니다. Base URL과 네트워크를 확인하세요. 원문은 그대로 유지되었습니다 |

无截断、无乱码、术语一致。其余 F8 文案（rewriteNoModel/NoSelection/Failed/Timeout 等 8 个 key）五语言【字节】核验齐全、无替换字符（`i18n282.txt`）；其中 no-model 与 timeout/empty 仅在 en 下实测触发。

### 282-P3-2 非网络类失败（HTTP 5xx / 非 JSON 响应）被统一提示为「无法连接…请检查 Base URL 与网络」

- 复现：Base URL 指向可达但返回 HTTP 500（或 HTTP 200 非 JSON 正文）的服务 → 选中文本按 F8 说指令。
- 现象【实测】：toast 与「端口不通」完全相同（ss_83045e54、ss_0253579b），未体现 HTTP 状态码/响应格式错误。
- 影响面：用户配置了错误模型名/被限流（429）/网关 5xx 时会被引导去查网络，排错方向错误。
- 修复建议：`rewriteSelection` 返回 `{ error: "http", status }` 与 `{ error: "badResponse" }`，toast body 追加状态码（如「服务返回 HTTP 500」/「响应不是 OpenAI 兼容 JSON」）；或至少与 `testPolish` 一致地把 `error.message` 写入日志便于排查（当前 catch 分支不记日志——【源码】）。
- 严重级：P3（原文未受损，文案有兜底行动项）。

### 282-P3-3（设计建议）改写成功直接覆盖选区，无预览/差异/撤销入口

- 现象【实测】：成功时选区被静默替换（无 toast、无 Undo），与自动纠错学习「toast + Undo」的可撤销体验不一致；依赖宿主应用 Ctrl+Z。
- 影响面：长文本改写（500+ 字）一旦结果不满意，用户需要靠宿主应用撤销；在不支持撤销的输入框（网页表单等）会直接丢失原文。
- 建议：成功后弹带「撤销」的 toast（复用已有 toast 组件），将 `rewriteTarget` 原文回贴；进一步可选「预览后应用」开关。
- 严重级：P3（属体验设计取舍；本轮任务要求核查「弹窗/diff/应用-放弃」，如实记录当前产品不存在该形态）。

## 专项 2：设置导入导出与配置迁移

### 前置与代表性配置 —【实测】

GUI 中写入：热词 `SpeakType / 润色模型 / 体验官282 / ローマ字テスト`；自建人设「体验官282人设」（prompt「用严格体验官口吻改写：先结论、再证据、最后建议；保留专有名词 SpeakType。」）；按应用规则 `notepad → 该人设`；界面语言 English、主题 Dark、字幕 6 行；润色 Base URL `http://127.0.0.1:8799/v1`、模型 `mock-1`。测前完整备份 `%APPDATA%\SpeakType`（设置/历史/模型/日志/证书）到 `tts\bak282\`。

### 导出 —【实测】通过

- 设置 → Backup → Export… 弹原生保存对话框，默认文件名 `speaktype-config-YYYY-MM-DD.json`；保存到 `tts\export282.json` 后显示「Config exported」。
- 【字节】`chkexport282.mjs`：UTF-8 合法 JSON、无 U+FFFD；`app:"speaktype"`, `configVersion:1`；`settings` 40 个 key，`personas` 1 条自建人设，`hotwords` 4 条；**不含** `polishApiKey / asrApiKey / doubaoAppKey / micDeviceId`（与文案「API 密钥和麦克风设备选择不随文件导出」一致）。
- 夹具备注：首次保存时把完整路径直接追加在预填文件名后导致 Windows 报非法文件名——是测试操作失误，Ctrl+A 覆盖后成功，非产品缺陷。

### 完全重置 —【实测】通过

- 设置 → Reset → 「Erase all data」两步确认（第一次点击进入确认态，再次点击执行），应用自动重启为全新安装状态：历史 0、模型缺失需重新下载（首页出现下载横幅，ss_c281d263）、日志新建、`speaktype.json` 回默认。重置前另存 `tts\pre-reset282-*.json`。

### 导入恢复 —【实测】通过

- Import… 选 `export282.json` → 「Config imported and applied」，界面立即切回 English + Dark。
- 【字节】`cmpimport282.mjs`：导入后 `speaktype.json` 40 个可迁移字段与导出值逐项相等；自建人设 id/name/prompt 完全一致；热词 4 条、按应用规则 1 条恢复；非迁移字段（API Key/麦克风设备）保持本机值未被覆盖。词典/热词/人设/provider（Base URL、模型、ASR provider 选择）往返完整。
- 重置删除的本地模型与 remote-mic 证书属「数据」而非「配置」，导入不会恢复（文案已说明）；测后从备份复制回。

### 旧版本/缺字段 JSON —【实测】通过

- 手工构造（`mkbad282.mjs`，文件带 UTF-8 BOM）：`app:"speaktype"`、`configVersion: 0`、缺大部分字段；未知字段 2 个（`legacyOnlyField`、`anotherUnknown`）；非迁移字段 `asrApiKey`；非法枚举值 `captionLines: 9`、`paragraphBreakMs: 5000`、`localModel: "whisper-tiny-legacy"`；类型错误 `polishBaseUrl: 12345`、`autoPaste: "yes"`；`hotwords` 混入数字与 null；`appPersonas` 含缺 `personaId` 与字符串垃圾项；`personas` 含缺 prompt 与字符串垃圾项。
- 结果：不崩，合法字段（uiLanguage zh-CN、theme light、合法热词、1 条合法应用规则、1 条合法人设）生效，提示「Config imported and applied (8 field(s) skipped: unknown, wrong type, or not portable)」（ss_fc26ab85）——8 = 2 未知 + 1 非迁移 + 3 非法枚举 + 2 类型错，计数与构造完全对应；`asrApiKey` 未被写入。【源码】`store.ts parseConfigImport()` 去 BOM 后逐字段按 `DEFAULT_SETTINGS` 类型校验并对枚举值白名单过滤，缺失字段保持当前值。

### 损坏 JSON —【实测】通过

- 三种损坏文件：截断的 JSON（`broken282.json`）、`app:"notspeaktype"` 的合法 JSON（`otherapp282.json`）、纯文本非 JSON（`plain282.json`）。
- 结果：均显示黄色错误条「不是有效的 SpeakType 配置文件」（ss_ac731c8b），现有设置未被清空或改动（导入前后 `speaktype.json` 一致）。文案可行动（明确是文件不对而非程序错误）。

### 282-P3-1 导入的配置切换界面语言时，导入反馈文案停留在切换前的语言

- 复现：界面语言 English → 导入一份 `uiLanguage:"zh-CN"` 的配置。
- 现象【实测】：整页立即变为简体中文，但备份区的反馈条仍是英文「Config imported and applied (8 field(s) skipped: …)」（ss_fc26ab85），同屏中英混排。
- 原因【源码】：`GeneralTab.tsx transferConfig()` 在 Promise 回调里用调用时捕获的 `t` 把文案拼成字符串写入 `backupMsg` state，之后语言切换不会重新翻译。
- 影响面：仅导入切语言这一次性场景，可读性小瑕疵；但导入恢复恰是跨语言迁移常见路径。
- 修复建议：`backupMsg` 存 `{ key, params, error }` 而非成品字符串，渲染时再 `t(key, params)`；或导入完成后重新读取当前 `t`。
- 严重级：P3。

## 专项 3：历史页大数据回归（1200 条三来源混合）

### 注入方式 —【实测】

退出应用后备份原 `history.json`（22 条 / stats 25 次）到 `tts\bak282\history.json`，用 `genhist282.mjs` 按真实 `HistoryItem` 结构写入 1200 条：本机 400（无 `source`）、手机 400（`source:"phone"`，其中 20 条 `status:"failed"` 失败项）、文件 400（`source:"file"`，personaName 为文件名）；文本含标记 `本机标记#NNNN / 手机标记#NNNN / 文件转录标记#NNNN`、40 条繁体、400 条含 `SpeakType`、200 条 personaName「体验官282人设」（全在手机来源）、`raw` 字段独立关键词；`stats` 由 1180 条非失败项累加（words 34780 / durationMs 7306000 / sessions 1180）。文件 487 KB。【源码】`store.ts addHistory()` 持久化上限 500 条——1000+ 只能靠外部注入达到，任何一次新落字都会把列表截回 500（本轮核心回归前已先还原历史，故未触发）。

### 性能 —【实测】通过

| 项目 | 结果 | 证据 |
|---|---|---|
| 打开历史页首屏 | 点击后首张截图（<1s）列表已完整渲染 50 条 + 「Show more (1150 remaining)」 | ss_e5dc3d74；CDP state |
| 「Show more」23 次直到 1200 条全部展开 | 每次点击到重绘 12–34ms；按钮计数 1150→50 递减 50，最后一次后按钮消失 | `histperf282-showmore-*.json` |
| 1200 条全量挂载后程序化往返滚动 142,258px（clientHeight 640） | 750 帧，p50 16.7ms / p95 16.8ms / max 19ms，>50ms 帧 0 | `histperf282-scroll-*.json` |
| 全量挂载后切换筛选/搜索重绘 | 12–173ms | `histfilters282-result.json` |
| GUI 实操 | 手机筛选 + 搜索 SpeakType 后滚到底部「Show more (30 remaining)」→ 点击 → 到底显示 #1190 且按钮消失 | ss_54c16e52、ss_9b79f68c、ss_e25227a9、ss_7232737d |

### 筛选/搜索正确性 —【实测】通过（12/12 与期望一致）

期望值由 `histexpect282.mjs` 直接按 `History.tsx` 同样口径对注入 JSON 计算；实测值由 CDP 读取 DOM（可见标记数 + 失败卡片数 + 「remaining」）。

| 来源 | 搜索词 | 期望 | 实测（含失败卡） | 徽标 |
|---|---|---|---|---|
| All | — | 1200（含 20 失败） | 1200 | Phone 400 / File 400 |
| Dictation | — | 400 | 400 | 0 / 0 |
| Phone dictation | — | 400（含 20 失败） | 400 | 400 / 0 |
| File transcripts | — | 400 | 400 | 0 / 400 |
| All | SpeakType | 400 | 400 | 80 / 240 |
| Phone | SpeakType（叠加） | 80 | 80 | 80 / 0 |
| All | 测试繁体（简体查繁体条目） | 40 | 40 | — |
| All | 體驗官282（繁体查简体 personaName） | 200（含 20 失败） | 200 | 200 / 0 |
| All | 会议录音_0003（personaName=文件名） | 1 | 1 | 0 / 1 |
| All | #0777 | 1 | 1 | 0 / 1 |
| File | #0777（叠加） | 1 | 1 | 0 / 1 |
| All | 不存在的关键词xyz | 0 | 0，显示「No matches for this search.」 | — |

`raw` 字段搜索被「體驗官282」与 `SpeakType` 用例覆盖（部分条目仅 raw 含关键词）。失败的手机条目在列表中显示「Recognition failed」+ Phone 徽标 + Retry（ss_e5dc3d74）。

### 统计一致性 —【实测】通过

首页 Sessions 1,180 / Words generated 34,780 / Voice input time 2h1min / Time saved 12h27min（ss_d58896c9）。与注入 `stats`（1180 / 34780 / 7,306,000ms=121.8min）一致；Time saved 按页面注明的 40 词/分估算：34780/40 − 121.8 ≈ 747.7min ≈ 12h27min，数值自洽。【源码】stats 为独立累计计数器，不由列表重算；「Clear all」同时清零。

### 还原 —【实测】

退出应用后把 `bak282\history.json` 复制回；再启动首页显示 Sessions 25 / Words 612（ss_7352d51f），与备份 stats 一致。

## 专项 4：核心回归 —【实测】全部通过

前置：还原真实历史后重新启动，日志 `20:38:16 sherpa worker started (sensevoice-small)`，其后无 worker 错误；Notepad 前台。

| 项目 | 操作 | 结果 | 证据 |
|---|---|---|---|
| RightCtrl 中文落字 | `VK 0xA3` 按住 4000ms | 落字「帮我跟老板说，那个方案需要再改」 | ss_291a6fc5；日志 `20:38:48 dictation finalize: durationMs=3879 voicedMs=2200` |
| Alt+Q 免按两句 | Alt+Q 开 → 22s → Alt+Q 关 | 自动分句落 2 条完整句 +1 条收尾短句（三条独立 finalize，无重复/残留） | ss_bcec8567；日志 20:39:23 / 20:39:34 / 20:39:39 三条 finalize |
| Esc 取消 | RightCtrl 按住 3s 后 Esc | Notepad 无新增文字，日志无 finalize，悬浮条回 idle | ss_d65d48e2；日志 20:40 后无 finalize 行 |

历史新增 4 条（26 条 / stats 29 次）与三次 finalize + 1 次 RightCtrl 对应，Esc 未产生条目。

## 未测试项

- F8：Escape 打断 polishing 中的改写（观察不充分，未下结论）；rewriteNoSelection / no-model / timeout / empty toast 仅 en 实测触发（其余语言为字节核验）；改写后宿主应用 Ctrl+Z 撤销；真实云端 LLM 端点（仅本机 mock）。
- 配置：`configVersion` 未来版本号的前向兼容；导入含超大 hotwords（万条级）的性能；跨机器导入（本轮同机重置后导入）。
- 历史：真实操作累积 >500 条（产品上限 500，1200 条仅可外部注入）；1200 条下「Clear all」「Export」耗时；触摸板/鼠标滚轮体感（本轮为程序化滚动帧时长 + GUI 抽查）。
- 核心：真实麦克风（全部 fake mic）；Notepad 以外宿主应用。
- 按指令未重测：281-P3-1 粘贴大段误学（PR #372）。

## 需求逐条对照

| 需求 | 结果 |
|---|---|
| 1a 未配置 LLM 引导 | 通过【实测】 |
| 1b mock 端点成功路径（弹窗/diff/应用-放弃） | 改写成功【实测】；产品无弹窗/diff/应用-放弃形态，立案 282-P3-3 设计建议 |
| 1c 网络失败/超时/空结果报错可行动 | 通过【实测】；HTTP 5xx/非 JSON 被归为网络错误，立案 282-P3-2 |
| 1d 500+ 字长文本 | 535 字通过【实测】 |
| 1e 五语言 F8 弹窗文案 | 通过【实测 + 字节】 |
| 2 导出→重置→导入往返 | 通过【实测 + 字节】；立案 282-P3-1 文案语言错位 |
| 2 旧格式/缺字段 | 通过（8 字段跳过并提示）【实测】 |
| 2 损坏 JSON | 通过（明确报错、不清空）【实测】 |
| 3 1000+ 历史性能/筛选/搜索/分页/统计 | 通过【实测】 |
| 4 核心回归 | 通过【实测】 |
| 报告/分支 | 本文件，推送 `review/round282-report`，不开 PR，不改产品代码 |

## 环境清理

- SpeakType 经托盘 Quit 正常退出（未强杀子进程）；Notepad「Don't Save」关闭；mock LLM（本人 node 进程 8790）已停止；无 wrangler/fake-mic 浏览器残留。
- `%APPDATA%\SpeakType`：`speaktype.json`、`history.json`、`transcribe-last.json`、模型、remote-mic 证书均从 `tts\bak282` 还原（界面语言/主题/热词/人设/润色 URL 回到测前值）；注入的 1200 条历史已移除。日志保留本轮记录以便追溯。
- 未改防火墙/hosts，未提交任何 secrets 或测试脚本，GitHub Actions 保持禁用。
