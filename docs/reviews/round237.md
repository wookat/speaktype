# 第 237 轮严格体验官报告（打包运行时实测）

- 构建：最新 main（9aed5c7，含 PR #327 免按规则断句路径段尾补句号 + PR #328 <16 字短段早退分支段尾补句号）`npm run build` + `npx electron-builder --win --x64 --dir`（exit 0），`release\win-unpacked\SpeakType.exe` 0.15.1 直跑实测。
- 环境：Windows Server 2022，fake-mic WAV（16kHz mono，`--use-file-for-fake-audio-capture`）+ mock ASR（127.0.0.1:8899，OpenAI 兼容 /v1/audio/transcriptions，逐行回放脚本文本）+ Notepad 前台落字 + SendInput 合成 RightCtrl/Alt+Q，`--no-proxy-server`，CDP 9333。punct-ct（~281MB）与 parakeet-tdt-0.6b-v3 均走 UI 真实下载。

## 1. RightCtrl 核心闭环 —— 通过【实测确认】

RightCtrl 按住 5.4s 口述（mock 返回 `帮我跟老板说那个方案需要再改一下明天上午之前给他答复`），Notepad 光标处逐字落字无误；`main.log` `dictation finalize: durationMs=5375 maxPeak=32768 voicedMs=3420`，mock 侧收到 166801B 真实音频体。核心闭环无回归。

## 2. PR #327/#328 段尾「。」一致性矩阵 —— 全绿【实测确认】

免按（Alt+Q）连投，规则路径（enhancedPunct=off）与模型路径（punct-ct 热态，`punct worker started`）各跑一遍同矩阵，Notepad 剪贴板逐字回读：

| 用例 | 输入（mock ASR） | 落字（两路径一致） | 判定 |
|---|---|---|---|
| 中文短段 <16 字（#328 早退分支） | `今天天气不错` | `今天天气不错。` | 通过：早退分支补 `。` |
| 中文长段（#327 规则断句 / 模型路径） | `我们今天讨论一下项目进度然后安排下周的工作计划` | `我们今天讨论一下项目进度，然后安排下周的工作计划。` | 通过：`然后` 前补逗号 + 段尾 `。` |
| 繁体门段（#327） | `我們今天討論一下項目進度然後安排下週的工作計劃` | `我們今天討論一下項目進度，然後安排下週的工作計劃。` | 通过：繁体门规则路径段尾补 `。`（P3-2341 修复确认） |
| 英文 | `this is a simple test sentence for english dictation` | `This is a simple test sentence for english dictation.` | 通过：首字母大写 + 英文句点，无 `。` |
| 日文（纯假名） | `これはテストです` | `これはテストです` | 通过：KANA 门不补 `。` |
| 日文（汉字收尾） | `今日はとても良い天気` | `今日はとても良い天気` | 通过：含假名文本汉字收尾也不补 `。` |
| 韩文 | `안녕하세요 오늘 날씨가 좋습니다` | 原样，无 `。` | 通过 |
| hold 单次去尾 | `今天天气不错。` | `今天天气不错`（尾号被去除） | 通过：hold 口径不变 |
| hold 单次长段 | `我们…进度然后安排…计划` | `我们…进度，然后安排…计划`（句中逗号保留、无尾 `。`） | 通过 |

注：模型路径首轮长段落字时 punct worker 恰在启动中（可能走了回退规则），已在 worker 热态下复跑长段确认输出一致（`…进度，然后…计划。`），模型/回退两口径一致。

## 3. 专项 A：hotwords 繁简混合往返 + zhNorm 覆盖抽查 —— 通过，新立案 1 条 P3

### 3.1 配置导出/导入往返【实测确认】

1. Dictionary 页添加 `陳慧琳`（繁）/ `麒麟芯片`（简）/ `SpeakType`（ASCII）→ Settings→General→Backup→Export 保存 JSON：`hotwords: ["陳慧琳","麒麟芯片","SpeakType"]` 逐字保真，文件不含 API key 字段（与文案承诺一致）。
2. Dictionary Clear（双击确认）清空 → Import 同文件 → 「Config imported and applied」，`speaktype.json` 中 hotwords 完整恢复，本机已填 ASR 配置保留。
3. 导入后运行时纠错三连（hold 实测 Notepad 落字）：`陈惠临→陳慧琳`（简体误识 → 繁体热词，跨简繁 n≥3 原字重合判定命中）、`奇林芯片→麒麟芯片`、`speak type→SpeakType` 全部生效。往返闭环完整。

### 3.2 zhNorm 覆盖抽查（20 常用繁体字 + fail-open）【实测确认（脚本直调 toSimplified）】

- 命中 19/20：們討論進後週氣聽話說學國電車馬龍點時東 + 陳 等全部正确归一。
- **漏收录 1：`劃`→`划` 未在表内**（`toSimplified('劃')` 返回原字）。`劃` 是高频字且出现在本仓库自身测试语料「工作計劃」中：含「劃」的热词/历史条目在简繁互通判定（hotwords 原字重合、History 归一搜索）中该位视为不重合。立案 P3-2371。
- fail-open 行为正常：蘋/憂/鬱/壞/嚴/釀 等未收录字原样保留，无异常字符、无抛错，纠错整体不受影响（漏收录只降低召回，不产生误替换）。

## 4. 专项 B：免按+ITN+热词+增强标点四叠加 10.5 分钟长会话 —— 通过【实测确认】

设置：hands-free（Alt+Q）+ ITN + 热词 3 条 + enhancedPunct（punct-ct 热态），语言 zh，4 句模板循环（含 三点半/两千五百块/百分之五/四点十五分/百分之二十 ITN 靶点 + 陈惠临/奇林芯片/speak type 热词靶点）。16:39:01–16:49:30 连续 73 段。

- 完整性：4 模板 ×19 轮顺序完整落字（`明天3:30`×19、`麒麟芯片`×19、`SpeakType写`×18、`提交方案。`×18，末轮停在第 2 句），零丢段零错序，段间无黏连（每段尾 `。` 后接下段句首）。
- 互搏：ITN、热词、增强标点、免按补号四者同段共存全部生效——`明天3:30我们开会讨论一下，项目预算大概2500块，然后请陳慧琳确认一下。` 单段内 ITN+热词+模型逗号+段尾 `。` 同时正确。
- ITN：`三点半→3:30`、`两千五百块→2500块`、`百分之五→5%`、`四点十五分→4:15`、`百分之二十→20%` 73 段全命中。`三百万` 不转换——源码复核【源码论证】：大数规则的前缀字符类不含 `百`（`[一两…九十]+[千万亿]…`），`三万八` 转而 `三百万/一百万` 不转，且该句无量词兜底。口径不一致但属低危观察，见 P3-2372。
- 段尾句号：73 段全部以 `。` 收尾，无一段裸尾（#327/#328 在长会话下稳定）。
- 内存（30s 采样 SpeakType 全进程）：WorkingSet 合计 350→339MB，斜率 ≈ -1MB/min（平稳无泄漏迹象）；PrivateBytes 723→783MB（+60MB/10.5min），未定性是否持续增长【实测确认数据，趋势推测】，建议下轮 30 分钟级复测。
- 稳定性：`main.log` 全程零 error/warn，102 次 finalize，9 进程零崩溃。

## 5. 自由走查：Transcribe 文件转写页（此前未覆盖）——通过【实测确认】

- 模型下载：页内 banner 引导下载离线模型 parakeet-tdt-0.6b-v3（与云听写 provider 独立），UI 一键下载约 2.5 分钟完成，进度条正常。
- 语言边界提示清晰：banner 明示 parakeet 仅支持英文+25 欧洲语言，中/日/韩/粤需在 Settings 切 sensevoice-small。
- 英文 WAV 转写：`sample.wav`（8.6s 英文 TTS）→ 1 segment `This proposal needs more revision. Please reply before tomorrow morning.`，离线识别逐字准确、标点大小写正确。
- SRT 导出：时间轴 `00:00:00,000 --> 00:00:08,589` + 文本，格式正确。
- 顺带覆盖：Speech 页 Test connection 按钮 → `Ready / Connected: whisper-1` 状态显示正确。
- 未测【未测试】：TXT 导出与 Copy all；sensevoice-small 中文文件转写；非英文 UI 语言下本页文案。

观察（不立案，推测）：Dictionary 的 Clear 双击确认窗口较短，间隔 >5s 的两次单击不生效需重新武装；对慢速操作用户略有困惑，但属防误删设计权衡。

## 6. 立案汇总

| 编号 | 级别 | 摘要 | 证据级别 | 状态 |
|---|---|---|---|---|
| P3-2371 | P3 | zhNorm 简繁表漏收录 `劃→划`（高频字，含「劃」词条的热词重合判定/历史归一搜索该位失效） | 实测确认（脚本直调） | 新立案 |
| P3-2372 | P3 | ITN 大数规则前缀类不含 `百`：`三百万/一百万` 不转换而 `三万八` 转换，口径不一致 | 实测确认 + 源码论证 | 新立案 |
| P3-2341 | P3 | 免按规则断句路径不补段尾句号 | 实测确认 | 已修复关闭（#327，本轮矩阵复核） |
| P3-2351 | P3 | <16 字短段早退分支不补段尾句号 | 实测确认 | 已修复关闭（#328，本轮矩阵复核） |

## 7. 未测试范围

- 真实麦克风/真人语音、静音键联动（VM 无音频输出设备）【未测试】。
- sensevoice-small 中文文件转写与 SRT/TXT 中文编码【未测试】。
- 5 语言 UI 全量走查（本轮 Transcribe 页仅英文 UI）【未测试】。
- punct worker 空闲释放后的再唤醒（本轮全程热态）【未测试】。

## 8. 下轮 Top3 建议

1. 修 P3-2371：zhNorm 补 `劃→划`，并对现有表做常用字频清单校验（对照 OpenCC TSCharacters 高频段抽样，一次性收敛漏收录）。
2. 四叠加 30 分钟级复测 PrivateBytes 趋势（本轮 +60MB/10.5min，WorkingSet 平稳；需定性是缓存稳态还是持续增长）。
3. Transcribe 页 sensevoice-small 中文音频转写 + SRT/TXT 中文导出编码走查（本轮仅覆盖 parakeet 英文路径）。

## 9. 清场

热词清空，language/asrProvider/asrBaseUrl/asrApiKey/enhancedPunct/itn 还原默认，测试 history 清空，punct-ct 与 parakeet 模型目录删除，mock ASR/Notepad/SpeakType 进程退出，临时 WAV/脚本/导出文件删除，Run 注册表无 SpeakType 残留，仓库工作区除本报告外干净。未合并 PR、未碰 Actions、未改产品代码。
