# Round 303 · Parakeet int8 复现语料与脚本

配套报告：`docs/reviews/round303-parakeet-ab.md`。全部语音为 Edge TTS 合成（en-US-JennyNeural / en-US-GuyNeural），16 kHz / mono / s16le。

## WAV（离线 sherpa-onnx-node 1.13.4 + app 内 `parakeet-tdt-0.6b-v3` int8，greedy、blankPenalty=0 下的确定性结果）

| 文件 | 内容 | int8 结果 | fp32 结果 |
|---|---|---|---|
| `empty_s09g_700_1001.wav` | s09g + 700 ms 前导 + 4 s 尾部 -60 dBFS 均匀白噪（seed 1001） | `""`（空） | 正确整句 |
| `empty_s09g_700_1004.wav` | 同上 seed 1004 | `""` | 正确整句 |
| `empty_s09g_700_1010.wav` | 同上 seed 1010 | `""` | 正确整句 |
| `empty_s09g_700_1013.wav` | 同上 seed 1013 | `""` | 正确整句 |
| `ctl_s09g_700_zero.wav` | s09g + 700 ms 数字零前导 + 4 s 零尾（对照） | `Could you share the slides from yesterday's presentation?` | 同 |
| `ple_s01j_300_zero.wav` | s01j + 300 ms 数字零前导 + 4 s 零尾 | `Ple sed by Friday.` | `Please send me the updated report by Friday.` |
| `ple_s01j_500_zero.wav` | s01j + 500 ms 零前导 | `Ple send me the updated report by Friday.` | 正确 |
| `ple_en_200_zero.wav` | en（302 轮 hold_en 同源）+ 200 ms 零前导 | `Ple schedule the meeting for tomorrow at three in the afternoon.` | 正确 |
| `s09g_raw.wav` / `s08g_raw.wav` / `s01j_raw.wav` / `en_raw.wav` | 去首尾静音后的原始 TTS 句（重新生成上述文件用） | — | — |

s09g = "Could you share the slides from yesterday's presentation?"（Guy）；s08g = "Our flight departs from gate twenty two at six fifteen."（Guy）；s01j = "Please send me the updated report by Friday."（Jenny）；en = "Please schedule the meeting for tomorrow at three in the afternoon."（Jenny）。

注意：`empty_*` 是 int16 量化后仍为空的样本（float 域必空的 6 个 seed 里 1007/1011 量化后恢复正确，未收录）。这些是"刀口"样本——任何重采样/增益/噪声抑制都可能让结果翻转，**经过打包版 fake mic（Chromium APM 开启）7/7 均正确落字，未复现空串**；下一轮请用真人麦克风或 `--disable-audio-processing`（或直接 Electron 内绕过 APM 的方式）复测。

## 脚本（路径为 302/303 轮测试机的绝对路径，复用时改 `nm`/`dir`/`W`/`$tools`/`$wav`）

- `tts.mjs`：`node tts.mjs <voice> <text> <out.mp3>`，依赖 npm 包 `msedge-tts`。
- `mkwav_r303.ps1`：12 句 × 2 声 → `sNN{j,g}_raw.wav`（ffmpeg `silenceremove` -45 dB 去首尾）、`_lead.wav`（adelay 500 + apad 4 s）、`_nolead.wav`（apad 4 s）、`manifest.json`。
- `mk_empty_wavs.cjs`：由 `s09g_raw`/`s08g_raw` 生成 700 ms 前导 + 4 s 尾部 -60 dBFS 噪声（LCG seed 1000+k）样本，只保留 int16 回读仍为空的前 4 个；同时生成 `ctl_s09g_700_zero.wav`。
- `mk_ple_wav.cjs`：生成 `ple_*_zero.wav` 并打印 int8 结果。
- `parakeet_fp32_ab.cjs`：`node parakeet_fp32_ab.cjs int8|fp32`，三组探针（空串 180 组 / Ple 99 组 / 24 句 48 段词错 + 延迟 + RSS），fp32 模型来自 HF `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3`（encoder.onnx + encoder.weights 2.43 GB + decoder.onnx + joiner.onnx + tokens.txt）。
- `r303_e2e_empty.ps1`：打包版 e2e——按 WAV 逐个以 fake mic 启动 app（依赖 302 轮 `launch.ps1`/`rkey.ps1`），Notepad 内 RightCtrl 长按 8.3 s × N，抓 `main.log` 增量与 Notepad 文本。
