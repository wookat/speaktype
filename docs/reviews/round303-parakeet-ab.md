# 第 303 轮 · Parakeet 首词吞字 / 空结果 A/B（int8 vs fp32、blankPenalty、前导/底噪、输入侧补救、打包版 e2e）

- 日期：2026-09-06
- 基线：main `c25a05b`（#392）打包版 `desktop/release/win-unpacked/SpeakType.exe`，`sherpa-onnx-node` 1.13.4；app 内模型 `parakeet-tdt-0.6b-v3`（HF `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8`）
- 承接：302 轮 P3-302-1（Parakeet 文件转录首词 `Ple schedule…`）、302 报告 §9.1「303 验收点」
- 环境：Windows Server 2022、1280×720、Node 20.19.0、CPU 2 线程 sherpa；**全部语音为 Edge TTS 合成（en-US-JennyNeural / en-US-GuyNeural），真人麦克风未测**
- 产品代码零改动、无 PR；本分支只含本报告与 `docs/reviews/r303-parakeet-fixtures/`

## 0. 给老板的结论（3 句）

1. 302 轮立案的 P3-302-1「Ple」首词吞字**是 int8 量化模型特有**：同一 99 组输入 int8 错 15/99，fp32 官方模型 0/99；fp32 同时把 24 句清洁语料词错 39→35/492，在本机 CPU 上**解码不比 int8 慢**（中位 449 vs 467 ms/句），代价是下载 2.5 GB（vs 640 MB）、常驻 RSS 2.7 GB（vs 1.0 GB）。
2. 离线还发现更严重的 int8 现象：语句前后同时带 -70…-50 dBFS 低电平底噪（真实房间噪声量级）时 int8 会**整句返回空串**（33/180），app 会走「未检测到语音」toast、不入历史、不可 Retry；fp32 同输入 0/180；`blankPenalty` 0→1.0 可把空串降到 5/180 但不修 Ple，是调参不是根治。
3. 但**打包版 e2e 未复现空串**：4 个离线必空的 WAV 经 fake mic 喂给打包版（Chromium APM：AGC/NS/EC 开启）7/7 全部正确落字——刀口样本被 APM 重塑后消失；真实麦克风下的发生率**未知**，不能据此升 P1，建议维持 P3 并做低成本修法（sherpa 输入前置 200 ms 数字零，离线 33/33 恢复、0 副作用），下一轮用真人麦/`--disable-audio-processing` 收口。

## 1. 三类结论的边界（先读）

| 类别 | 本报告中的内容 |
|---|---|
| **实测（一手）** | §3–§8 全部数字：离线 sherpa-onnx-node 探针（与 app 相同 npm 包、相同模型文件、相同 `modelType: "nemo_transducer"` / `numThreads: 2` / `provider: "cpu"` 配置，仅按需追加顶层 `decodingMethod`/`blankPenalty`）；§8 打包版 e2e（`main.log` 原文 + Notepad 落字 + history.json）；fp32 模型 5 个文件从 HF 官方仓库直连下载 |
| **代码依据（读源码，未单独跑）** | §9：空串在 app 侧的处置路径 `dictation.ts` L1053-1061；recorder 的 APM 约束 `preload/recorder.ts` L82；`transcribe.ts`/`localasr.ts` 的 sherpa 调用不做任何前置/裁切 |
| **推断** | §10 标 ⚠ 的句子：APM 为何让刀口样本消失、真人麦下的发生率、fp32 作为可选项的用户价值、前置 200 ms 对 Ple 是否有益 |

未做：真人麦克风；`--disable-audio-processing` 绕过 APM 的 e2e；非英语（Parakeet 其余 24 种语言）；上游 sherpa-onnx C++ TDT 解码器逐行核对（仅通过 DeepWiki 了解 `blank_penalty`/duration-skip 机制，属二手，本报告不引用其细节作结论）。

## 2. 语料与方法

- **24 句 fixture**：12 句英文 × 2 声（Jenny/Guy），`mkwav_r303.ps1`：TTS → ffmpeg `silenceremove` -45 dB 去首尾 → `_raw`；`_lead` = adelay 500 ms + apad 4 s；`_nolead` = apad 4 s。文本见 fixtures README。
- **词错**：简单词级编辑距离（小写、去标点），**注意**参考文本用英文数字（"twenty two"/"six fifteen"），模型输出 ITN 数字（"22"/"6.15"/"9 30"）全部计为错，所以 §3 的 35–39/492 大半是格式差，而非听错；只做同条件相对比较。
- **空串探针**：s08g/s09g 两句 × lead {300,700,1500} ms × 30 seed，前导与 4 s 尾部同时叠加 -60 dBFS 均匀白噪（LCG 伪随机），共 180 组。
- **Ple 探针**：en/s01j/s01g 三个 "Please…" 源 × lead {200,300,500} ms × (数字零 + 10 个 -60 dBFS 噪声 seed)，共 99 组，判定 `text.startsWith("Please")`。
- **延迟**：24 句 × lead/nolead 共 48 段（约 7.5 s 音频）单段 `decode` 墙钟；RSS 为 node 进程跑完三组探针后 `process.memoryUsage().rss`。
- 全部脚本与 JSON/log 见 §11。

## 3. int8（app 现状）vs fp32 官方模型 — 实测

| 项 | int8（app） | fp32 | 说明 |
|---|---|---|---|
| Ple 首词错（99 组） | **15/99** | **0/99** | int8 错例全为 `Ple`；分布 en@200 2、en@300 1、s01j@300 7、s01j@500 4、s01g@500 1 |
| 空结果（180 组） | **33/180** | **0/180** | int8 明细 s08g@700 9、s09g@300 7、s09g@700 17；@1500 均 0 |
| 24 句清洁语料词错（492 词） | 39/492 | 35/492 | 见 §2 关于 ITN 的说明 |
| 解码中位 / P90 | 467 / 513 ms | 449 / 488 ms | 同一台机、2 线程；int8 在此 CPU 上无速度优势 |
| 模型加载 | 1.8 s | 2.9 s | |
| 进程 RSS | 1006 MiB | 2714 MiB | |
| 下载体积 | ~640 MB | ~2.5 GB | fp32 `encoder.weights` 2 435 420 160 B |

int8 与 fp32 在 48 段清洁语料上的逐句差异（`r303_parakeet_{int8,fp32}_ab.json` → `hyps`）共 18 段，其中：
- 2 段是 int8 `Ple`（s01j/lead、s01g/lead）→ fp32 正确；
- 3 段 fp32 输出 `looked`（参考 `look`，Jenny/Guy 均出现）→ fp32 反而错；
- 其余 13 段为 ITN/标点格式差（`930` vs `9 30`、`6.15` vs `6 15`、`22` vs `twenty two`、`and` 前逗号）。
即两者的"听写内容"差异集中在首词 Ple 与一处时态，其它是格式。

## 4. `blankPenalty` sweep（int8，greedy）— 实测

| blankPenalty | 空结果 /180 | Ple /99 | 清洁词错 /492 | 相对 bp=0 改变的清洁段数 |
|---|---|---|---|---|
| 0（app 现状） | 33 | 15 | 39 | 0 |
| 0.25 | 20 | 15 | 39 | 1 |
| 0.5 | 12 | 14 | 38 | 5 |
| 0.75 | 8 | 14 | 39 | 8 |
| 1.0 | 5 | 14 | 39 | 8 |

bp=1.0 相对 bp=0 改变的 8 段：1 段 `Ple`→`Please`（s01j/lead），1 段 `look`→`looked`（引入错误），6 段 ITN/标点格式变化（`930`→`9.30`、`615`→`6.15`、`and` 前加逗号）。`modified_beam_search`（bp 0 / 0.5）对 Ple 与空串均无改善（`r303_parakeet_ab_regress.json`）。
结论：blankPenalty 能压空串但不修 Ple，且会改动数字/标点格式，**不建议作为产品默认值改动**。

## 5. 前导长度 sweep（int8 vs 各配置）— 实测

`r303_parakeet_lead_sweep.json`：6 个源 × lead {0,50,100,200,300,400,500,700,1000,1500} ms × {数字零, -60 dBFS}。摘录 greedy bp0（app）首词：

| 源 | 底噪 | 出错的 lead（ms） |
|---|---|---|
| en(Jenny) "Please schedule…" | 零 | 200、300、1500 → `Ple` |
| en(Jenny) | -60 dBFS | 无 |
| s01j(Jenny) "Please send…" | 零 | 300、500 → `Ple` |
| s01j(Jenny) | -60 dBFS | 300、500 → `Ple` |
| s01g(Guy) "Please send…" | 零 | 500 → `Ple` |
| s01g(Guy) | -60 dBFS | 50、100 → `Ple` |
| s07j "Thanks…" 等非 Please 源 | 零 / -60 | 无 |

Ple 对前导长度**不单调**（0/50/100 常对，200–500 出错，700/1000 又对，1500 又错），与"缺预滚缓冲"的假设不符；更符合 302 报告的判断——int8 在 "Please" 这一发音上处于判定边界，任何输入微扰都可能翻转（302 轮 ±1e-5 扰动 7/20 翻转）。**因此 302 §9.1 提出的 "recorder 预滚缓冲" 方案对 Ple 无效，撤回该建议。**

## 6. 噪声位置矩阵（int8，s09g，20 seed）— 实测

`r303_parakeet_empty_probe2.json` → A：

| 底噪电平 | 位置 | lead 0 | 300 | 700 | 1500 |
|---|---|---|---|---|---|
| -70 dBFS | 前+尾 | 0/20 | 0/20 | **12/20** | 0/20 |
| -70 | 仅前 / 仅尾 | 0 | 0 | 0 | 0 |
| -60 | 前+尾 | 0/20 | **4/20** | **13/20** | 0/20 |
| -60 | 仅前 / 仅尾 | 0 | 0 | 0 | 0 |
| -50 | 前+尾 | 0/20 | **8/20** | **12/20** | **16/20** |
| -50 | 仅前 / 仅尾 | 0 | 0 | 0 | 0 |
| -40 | 任意 | 0 | 0 | 0 | 0 |

触发条件是「低电平底噪贯穿整段（前后都有）+ 中间一句话」；仅前导或仅尾部带噪、以及 -40 dBFS 以上的底噪，20 seed 全部正确。同一条件下全部 24 句 fixture（700 ms、-60 dBFS、10 seed）只有 s08g/s09g（Guy 声的两句）出现空串，其余 22 句 0（`empty_probe2` → B）。

## 7. 输入侧补救对比（对 33 个空串样本）— 实测

`r303_parakeet_retry_probe.json`：

| 方法 | 33 个空串恢复数 | 对原本正确样本的副作用 |
|---|---|---|
| 前置 200 ms 数字零（在样本前 `concat` 零） | **33/33** | `padWrong: []`（0） |
| 裁掉前导低能量段（trim） | 33/33 | trim 100 ms 让 90 个原正确样本中 **33 个变坏**（`parakeet_retry_probe.log`） |
| blankPenalty = 1.0 | 27/33 | 6 个仍失败（5 个仍空、1 个输出 `Yeah.`）；另见 §4 的格式改动 |

前置数字零是唯一"全恢复 + 零副作用"的手段。⚠ 它对 Ple 是否有益**未验证**（§5 显示 Ple 对前导长度不单调，前置 200 ms 等价于把每个 lead 右移 200 ms，可能把某些原本正确的 lead 推到出错区间，也可能反之）；若采纳需在 24 句 × 10 lead 上重跑 Ple 率再定。

## 8. 打包版 e2e（fake mic，Parakeet en）— 实测，未复现

方法：`r303_e2e_empty.ps1`：以 `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` 启动打包版，`speaktype.json` 临时设 `localModel=parakeet-tdt-0.6b-v3`、`language=en`（测后字节级还原，sha256 与测前一致），Notepad 前台，RightCtrl 长按 8.3 s（首次 9.5 s），每个 WAV 2–3 次。

| WAV | 次数 | 落字/入历史 | `main.log` |
|---|---|---|---|
| `ctl_s09g_700_zero`（对照） | 1 | 正确 | `finalize: durationMs=9389 maxPeak=32768 voicedMs=3580`（9.5 s 长按覆盖了文件循环，句尾多出一段重复，属 fake mic 循环，非产品问题） |
| `empty_s09g_700_1013` | 1 | 正确 | 同上一条日志（该次实为 1013） |
| `empty_s09g_700_1001` | 2 | 2/2 正确 | `durationMs=8182 maxPeak=32768 voicedMs=2720` / `8174 / 2720` |
| `empty_s09g_700_1004` | 2 | 2/2 正确 | 同模式 |
| `empty_s09g_700_1010` | 2 | 2/2 正确 | `durationMs=8186 maxPeak=32768 voicedMs=2720` / `8176 / 2720` |

合计 7/7 正确落字 `Could you share the slides from yesterday's presentation?`（`r303_e2e_notepad.txt`），`main.log` 增量无 `[warn]`/`[error]`。
`maxPeak=32768`（离线 WAV 峰值 22023 ≈ 0.67 满幅）说明 Chromium APM 的 AGC 已把信号推到满幅；NS/EC 亦开启（§9）。⚠ 推断：离线的 -60 dBFS 刀口样本经 AGC/NS 后底噪谱与电平都被改写，不再落在 §6 的触发区；这**不能**外推为"真实麦克风下不会发生"——真实房间噪声经 NS 后的残留谱形与本探针的白噪不同，方向未知。

首次运行的 3 次 `maxPeak=0 voicedMs=0` 是我方脚本以 `powershell -File` 传数组参数失败导致多次连续启动，fake 设备未产出样本；改为进程内调用后消失，已排除，不计入结果。

## 9. 代码依据（读源码）

- `desktop/src/main/dictation.ts` L1053-1061：`raw` 为空或无字母数字 → `busy=false`、`report("idle")`，非免按时 `showToast(t("toast.noSpeech"), …)`；**不写 history、不设 `lastFailed`**（L1051 已置 null），因此用户无法 Retry，整句丢失；免按模式下 `maybeContinueHandsFree(true)` 直接续下一句，**无任何提示**。
- `desktop/src/preload/recorder.ts` L82：`{ channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }`，即 §8 的 APM 全开。
- `desktop/src/main/localasr.ts` sherpa worker：`stream.acceptWaveform({ sampleRate, samples })` 直接喂原样本，无前置/裁切/归一化；`transcribe.ts` `transcribeSlice` 对 sherpa 模型同样直传切片。→ §7 的"前置 200 ms 数字零"若实现，落点在 worker `acceptWaveform` 前（或 `transcribeSherpa` 入口），一处改动覆盖听写与文件转录。
- `desktop/src/shared/localModels.ts` L7 与 `localasr.ts` L27：Parakeet 仅有 int8 一个模型项，下载源固定为 `…-int8/resolve/main`。

## 10. 结论与建议

**立案状态**
- P3-302-1 维持 **P3**，根因改写为：「int8 量化模型在 `Please` 发音边界的判定翻转，fp32 同输入 0/99 不复现；与前导长度无单调关系，非 recorder 预滚问题」。
- 新观察 **OBS-303-1（不立案，待真人麦复测后定级）**：int8 在前后贯穿低电平底噪时整句空串（离线 33/180，fp32 0/180），产品侧表现为「未检测到语音」且不可 Retry；打包版 fake mic e2e 7/7 未复现。若真人麦复测 ≥1/30 出现，建议 P2（整句丢失 + 无恢复路径）。

**建议修法（按成本排序，均需实机回归）**
1. `localasr.ts`/`transcribe.ts` sherpa 输入前置 200 ms 数字零：离线 33/33 恢复空串、0 副作用；⚠ 对 Ple 影响未测，采纳前先跑 24 句 × 10 lead Ple 率。
2. 空串时保留音频并入历史为「失败」条目（复用 `keepFailedAudio`/`lastFailed` 路径），让用户可 Retry / 换模型；成本低且与根因无关，任何 ASR 都受益。
3. 可选：设置页增加「Parakeet 高精度（fp32，2.5 GB）」模型项，面向内存 ≥ 8 GB 的英文重度用户；本机数据表明无速度损失。⚠ 用户价值是推断，且需评估 2.7 GB 常驻内存对低配机的影响。
4. **不要**：全局 `blankPenalty`（改 ITN/标点格式、不修 Ple）、trim 前导（破坏原正确样本）、recorder 预滚（对 Ple 无效）。

**建议下一轮（304）验收点**
- 真人麦克风（或 `--disable-audio-processing` 绕过 APM）下 ≥30 句英文、真实房间底噪，统计空串率与 Ple 率——这是本轮唯一未覆盖的关键证据。
- 若采纳修法 1：同一 fixtures 上 int8 前置 200 ms 前/后的 Ple 率、空串率、48 段词错三组对比 + 打包版 e2e。
- 若采纳修法 2：空串 → 历史失败条目 → Retry 成功链路；免按模式下的提示。
- fp32 若做成可选项：下载（2.43 GB 单文件 Range 续传、sha256）、加载耗时、RSS、低配机（8 GB）表现。

## 11. 证据文件

测试机 `C:\Users\Administrator\r302\evidence\`（未入库，文件名供对照）：
- `r303_parakeet_int8_ab.{json,log}`、`r303_parakeet_fp32_ab.{json,log}`（§3）
- `r303_parakeet_final_ab.{json,log}`（§4）、`r303_parakeet_ab_regress.{json,log}`（beam vs greedy）、`r303_parakeet_ab.{json,log}`（初版 sweep）
- `r303_parakeet_lead_sweep.{json,log}`（§5）
- `r303_parakeet_empty_probe.{json,log}`、`r303_parakeet_empty_probe2.{json,log}`（§6）
- `r303_parakeet_retry_probe.{json,log}`（§7）
- `r303_e2e_empty.run.log`、`r303_e2e_empty_s09g_700_{1001,1004,1010,1013}.main.log`、`r303_e2e_notepad.txt`（§8）
- `r303_parakeet_ab_summary.md`（先前发给主会话的摘要）

入库（本分支 `docs/reviews/r303-parakeet-fixtures/`，见其 README）：4 个 `empty_*.wav`、3 个 `ple_*.wav`、`ctl_s09g_700_zero.wav`、4 个 `*_raw.wav`、`mk_empty_wavs.cjs`、`mk_ple_wav.cjs`、`parakeet_fp32_ab.cjs`、`mkwav_r303.ps1`、`tts.mjs`、`r303_e2e_empty.ps1`。单文件最大 241 KB。

fp32 模型留在测试机 `C:\Users\Administrator\r302\models\parakeet-fp32\`（未放入 app 模型目录）。

## 12. 环境还原

- `speaktype.json` / `history.json`：测后从 `r302\bak303` 覆盖还原，sha256 `60172C8E…1B9C` / `0F3BEA6F…F41A8` 与测前一致。
- 官方制品未改；SpeakType / whisper-server / notepad 进程 0；产品代码零改动；`git status` 仅本报告与 fixtures 目录。
