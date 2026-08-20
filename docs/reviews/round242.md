# 第 242 轮体验官报告（user-experience-officer + QA 交叉视角）

- 日期：2026-08-20
- 基线：main @ `626a74b`（含 PR #332 词典简繁互搜、#333/#334 sherpa worker 显式 GC 内存修复）
- 版本：SpeakType 0.15.1（本地打包 win-unpacked 实测）
- 环境：Windows Server 2022 / Node v20.19.0 / electron-builder（`npx electron-builder --dir`）
- 方法：fake microphone WAV（msedge-tts 生成 16k 单声道中文语料，12 段）+ 应用内下载本地 sensevoice-small 模型 + Notepad 真实落字 + Playwright(CDP 9333) 驱动 Transcribe/Dictionary 页面
- 证据口径：全文区分【实测确认】【源码论证】【推测】【未测试】

## 执行摘要

1. 构建链路全绿【实测确认】：`npm install`（有 EBADENGINE 警告，见 P3-2396）→ `npm run typecheck` ✅ → `npm run build` ✅ → `npx electron-builder --dir` ✅，打包产物可正常运行。
2. #334 回归通过【实测确认】：local RightCtrl 单次落字 3/3 成功；免按 Alt+Q 50 秒长听写正常落字；`v8.setFlagsFromString + vm 取 gc` 的 worker 正常启动（`sherpa worker started (sensevoice-small)`），全程无崩溃、无错误日志。
3. P3-2393 完成量化【实测确认】：10 段中文 WAV、25 个句内句界，句号仅保留 28%（7/25），68% 降级为逗号，4% 完全丢失造成连排；且免按实时听写同样复现（同一句界 5/5 次丢句号连排）。建议升级为 P2 立案（P2-2394）。
4. 自选深挖（词典导入/导出边界 + #332 复核）全部通过【实测确认】：符号行/超长词拒收提示、300 上限截断、假名提示、导出 round-trip、简体搜繁体命中，均符合设计。
5. 新增立案：P2-2394（句号降级量化，P3-2393 升级）、P3-2395（免按会话内 ITN 不一致）、P3-2396（Node 20 下 npm install EBADENGINE 警告）。

## 一、构建与打包【实测确认】

| 步骤 | 结果 |
| --- | --- |
| `npm install`（desktop/） | 完成、0 vulnerabilities；但多个依赖 engines 要求 Node >=22.12.0，当前 v20.19.0 输出 EBADENGINE 警告（P3-2396） |
| `npm run typecheck` | ✅ 通过 |
| `npm run build` | ✅ 通过 |
| `npx electron-builder --dir` | ✅ 产出 `desktop/release/win-unpacked/SpeakType.exe` |

模型走应用内下载：Transcribe 页「Download」按钮下载 sensevoice-small 成功，日志 `local model sensevoice-small downloaded`（2026-08-20 20:40:37）。

## 二、#334 回归抽查【实测确认】

### 2.1 local RightCtrl 单次落字（3/3 通过）

方法：打包应用以 `--use-file-for-fake-audio-capture=hold.wav`（“帮我跟老板说那个方案需要再改一下，明天上午之前给他答复。”，约 5.7s 语音）启动，Notepad 聚焦后 SendInput 注入 RightCtrl 按住 8s 释放，重复 3 次。

- Notepad 实际落字 3 次均正确：「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」（raw 含句尾句号，Default persona 按设计去掉尾句号）。
- 日志 3 次 `dictation finalize`，maxPeak=32768、voicedMs≈4000，无异常。
- worker 以 #334 的 `v8.setFlagsFromString("--expose-gc") + vm.runInNewContext("gc")` 方案正常启动，无 execArgv 报错（#333 引入的非法 `--expose-gc` execArgv 问题未复现）。

### 2.2 解码延迟（finalize→历史落库，含解码+热词纠错+粘贴）

以 `dictation finalize` 日志时间戳与 history.json 条目 `at` 差值度量（近似值，含粘贴与落库开销）：

| 样本 | 录音时长 | voicedMs | 延迟 |
| --- | --- | --- | --- |
| hold #1 | 7876ms | 4040 | 983ms |
| hold #2 | 7860ms | 4000 | 837ms |
| hold #3 | 7875ms | 4000 | 1037ms |
| 免按 50s 段 | 50649ms | 35060 | 3452ms |

约 0.8–1.0s（8s 录音）/ 3.5s（50s 录音），RTF ≈ 0.1，体验流畅，与近几轮无回退。

### 2.3 免按多句与句号

方法：以 s01.wav（3 句：「今天下午三点开会，请大家准时参加。会议地点在二楼会议室。这个项目的预算是三百万元。」，句间 TTS 停顿约 0.5–0.65s，fake capture 循环播放）启动，Alt+Q 开启免按 50s 后 Alt+Q 结束。

- 落字正常，一次 finalize（durationMs=50649）。单段而非逐句分段属预期【源码论证】：默认 `vadSilenceMs: 2000`（store.ts:31），句间 0.6s 停顿低于阈值不触发 autoStop；50s 软分段上限 `HANDS_FREE_SOFT_SEGMENT_MS = 50000`（dictation.ts:44）与本次手动结束时间重合。
- 句号问题在实时链路同样复现：6 次循环中「请大家准时参加。会议地点」句界 5/5 次（第 6 次为音频截断处）完全丢失句号连排为「请大家准时参加会议地点在二楼会议室」→ 见 P2-2394。
- 另发现同音频循环中 ITN 不一致（「3点」×5 vs「三点」×1）→ 见 P3-2395。

结论：#334 无回归；免按长会话落字与分段行为符合源码设计。

## 三、P3-2393 专项量化 → 立案 P2-2394【实测确认】

方法：msedge-tts 生成 10 段中文 WAV（2–6 句/段，4.8–20.1s，语速 −20%～+45%，含男声 zh-CN-YunxiNeural），Playwright 经 CDP 驱动 Transcribe 页逐个上传，模型 sensevoice-small，结果取自 `transcribe-last.json`。

### 3.1 逐文件结果

判定口径：对每个「句内句界」（源文本句号/问号处），输出为句号/问号=保留；变逗号=降级；无任何标点=连排。

| 文件 | 时长 | 语速 | 句界数 | 保留 | 变逗号 | 连排 |
| --- | --- | --- | --- | --- | --- | --- |
| s01 | 9.4s | 正常 | 2 | 0 | 1 | 1（「参加会议地点」） |
| s02 | 8.0s | 正常 | 2 | 0 | 2 | 0 |
| s03 | 8.3s | +30% | 3 | 0 | 3 | 0 |
| s04 | 16.0s | 正常 | 1 | 1 | 0 | 0 |
| s05 | 12.6s | −20% | 3 | 0 | 3 | 0 |
| s06 | 8.9s | 正常 | 2 | 0 | 2 | 0 |
| s07 | 20.1s | 正常 | 5 | 3 | 2 | 0 |
| s08 | 4.8s | +45% | 2 | 0 | 2 | 0 |
| s09 | 7.9s | 正常 | 1（问号） | 1 | 0 | 0 |
| s10 | 14.6s | 正常（男声） | 4 | 2 | 2 | 0 |
| **合计** | | | **25** | **7 (28%)** | **17 (68%)** | **1 (4%)** |

句尾标点：10/10 文件末尾均有句号（persona 不参与 Transcribe 链路）。问号 1/1 保留。数字 ITN（2500万、18%、20公斤、8点）正确。

### 3.2 样本特征分析

- **停顿长度是主因**【实测确认+推测】：TTS 默认句间停顿约 0.5–0.65s，此类句界 68% 被打成逗号；保留句号的 7 处集中在长段落中语义完结感强、停顿相对更长的句界（s04 两个 8s 长句之间 1/1；s07 后半 3/5；s10 后半 2/4）。
- **语速越快越差**：+30%/+45% 快语速样本句界 0/5 保留；−20% 慢速 0/3（慢速仍失败，说明并非单纯时长阈值，SenseVoice 内置标点对上下文语义依赖强）。
- **连排（完全无标点）低频但存在**：Transcribe 1/25；而免按实时链路同一句界 5/5 连排（「准时参加+会议地点」为动宾可黏连结构），说明可黏连语义结构处风险最高。
- **与说话人无关**：男声 s10 与女声表现一致。

### 3.3 立案 P2-2394：本地 SenseVoice 中文句界句号大面积降级（P3-2393 量化升级）

- 复现：任意多句中文音频（句间停顿 <0.7s）走 Transcribe 本地 sensevoice-small，或免按实时听写。最小复现：s01 文本 TTS 生成 WAV 上传 Transcribe。
- 证据：上表 25 句界实测；`transcribe-last.json` 输出原文；免按 50s 会话 Notepad 落字截图与 history.json。
- 影响：正式产品口径下，几乎所有多句输出可读性受损（68%+4%=72% 句界异常），会议纪要/长文场景尤其明显。建议由 P3 上调 P2。
- 设计建议（不写代码）：
  1. **停顿切片**：Transcribe 已有 100ms RMS profile（transcribe.ts rmsProfile），可将 >0.5s 静音谷作为子段切点，逐子段解码后拼接并在边界强制句号——不依赖模型标点，改动面小。
  2. **标点后处理**：评估 sherpa-onnx 生态的 CT-Transformer 标点模型作为可选后处理开关，对连排/逗号化文本重打标点（免按与 Transcribe 共用）。
  3. **实时链路利用 VAD 停顿**：dictation 已有 silero VAD 与 voicedMs 统计，可在 >600ms 停顿处对解码文本边界补句号。
  4. **显示层缓解**：Transcribe 结果按停顿分行展示，先降低连排观感成本。

### 3.4 立案 P3-2395：免按会话内 ITN 不一致

- 复现：s01.wav 循环免按 50s，同一句「今天下午三点开会」6 次循环输出 5 次「3点」、1 次「三点」；「三百万」全部→「300万」。
- 证据：免按落字全文（hf_out.txt / Notepad 截图 / history.json 条目 20:47:48）。
- 影响：同一会话同一读音数字格式漂移，正式文档场景观感差。属 SenseVoice 模型 ITN 内置行为【推测】。
- 建议：与 P2-2394 的后处理层合并考虑（统一 ITN 规范化），或在增强标点/ITN 设置中提供「中文数字保留」偏好。

## 四、自选深挖：词典导入/导出边界 + #332 复核【实测确认】

方法：Playwright(CDP) 驱动 Dictionary 页，混合批量导入 + 溢出导入 + 导出下载校验。

| 用例 | 预期 | 结果 |
| --- | --- | --- |
| 符号行 `===` | 拒收并计提示 | ✅ 拒收 |
| 21 字超长词 | 拒收（上限 20） | ✅ 拒收，amber 提示「2 line(s) were not added…」计数正确 |
| 20 字边界词 | 收录 | ✅ 收录 |
| 假名词「テスト」 | 收录+不参与纠错提示 | ✅ 「1 word(s) contain Japanese kana…」 |
| 重复词 | 去重 | ✅ 仅一条 |
| 首尾空格 `  spaced  ` | trim 后收录 | ✅ 「spaced」 |
| 纯数字 `1234` | 收录 | ✅ |
| #332 简繁互搜 | 简体「台湾」命中「臺灣繁體詞」 | ✅ 命中 |
| 导出 round-trip | UTF-8 BOM + 一行一词 | ✅ 文件头 EF BB BF，LF 分隔，与导入兼容 |
| 300 上限溢出（310 词） | 截断+提示 | ✅ 词数止于 300，「16 line(s) were not added」计数正确（6 已有 + 310 新 − 300） |

Transcribe 结果落盘 `transcribe-last.json`、重启可恢复【源码论证 transcribe.ts loadLastResult】。未发现新问题。

## 五、立案清单

| 编号 | 级别 | 标题 | 状态 |
| --- | --- | --- | --- |
| P2-2394 | P2 | 本地 SenseVoice 中文句界句号大面积降级（72% 异常；P3-2393 量化升级），免按实时链路同样复现 | 新立案（建议下轮做设计验证） |
| P3-2395 | P3 | 免按同会话同音频 ITN 数字格式不一致（3点/三点漂移） | 新立案 |
| P3-2396 | P3 | Node 20.19 下 `npm install` 对多个依赖输出 EBADENGINE（要求 >=22.12.0）；安装可完成但干扰 CI/新人上手判断 | 新立案（建议 README/engines 说明或统一 Node 22） |
| P3-2393 | P3 | 本地 SenseVoice 文件转写偶发缺句号/连排 | 由 P2-2394 承接，可关闭 |

#334（P1 热修）、#333（P2-2391）、#332（P3-2392）本轮回归均通过，无回退。

## 六、Top3 下一轮建议

1. **P2-2394 修复设计验证**：按 3.3 的「停顿切片」与「CT-Transformer 后处理」两条路线做原型对比（同一 25 句界语料回归），确定正式方案后再写代码。
2. **免按真实分段回归**：构造句间停顿 >2s 的语料验证 vadSilenceMs 分段路径的边界标点/落字拼接行为（本轮因 TTS 停顿短未覆盖多 finalize 场景），并覆盖 50s/75s 软硬分段边界。
3. **F8 改写多语言**：本轮未覆盖（需 LLM mock），建议下轮以 OpenAI-compatible mock 验证 F8 改写在中英日语料下的行为与错误处理。

## 七、未测试与限制

- 免按多 finalize 分段（句间停顿 >2s）未覆盖（本轮语料停顿 0.5–0.65s，单段路径）。
- F8 改写、云端 ASR 供应商、导出 SRT 的字幕时间轴精度未测试。
- 解码延迟为 finalize→历史落库近似值，含粘贴/落库开销，非纯解码耗时。
- #333/#334 内存斜率未重复长时测量（上轮已闭环，本轮仅回归功能路径）。

## 八、清理

- 已结束 SpeakType 进程、关闭 Notepad（不保存）、删除 `%APPDATA%\SpeakType` 测试用户数据（模型、历史、日志、transcribe-last.json）。
- 测试脚本与 WAV 语料位于仓库外 `C:\Users\Administrator\tts`，未向仓库提交任何产品代码改动；本 PR 仅含本报告文件。
